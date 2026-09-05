import { RawFrame } from '../video-gateway/types';
import { videoGateway } from '../video-gateway/video-gateway';
import { trackingService } from '../tracking/tracking-service';
import { detectionStore } from './detection-store';
import { IObjectDetector, YolosTinyDetector } from './detector';
import {
  InferenceConfig,
  InferenceHealth,
  InferenceServiceStatus,
  NormalizedDetection,
} from './types';

export class AiInferenceService {
  private detector: IObjectDetector;
  private config: InferenceConfig = {
    modelName: 'Xenova/yolos-tiny',
    modelVersion: 'YOLOS-tiny-COCO-Quantized-v1',
    confidenceThreshold: 0.5,
    samplingIntervalMs: 2500,
    enabled: true,
    maxConcurrency: 1,
  };

  private status: InferenceServiceStatus = 'STARTING';
  private lastInferenceAt: string | null = null;
  private lastInferenceLatencyMs: number | null = null;
  private lastError: { message: string; timestamp: string; code?: string } | null = null;

  // Concurrency & camera tracking
  private inFlightCameras = new Set<string>();
  private isGlobalInferenceActive = false;
  private lastCameraInferenceTimestamp = new Map<string, number>();
  private activeSamplingCameras = new Set<string>();
  private samplingIntervalTimer: NodeJS.Timeout | null = null;

  // Performance metrics
  private metrics = {
    framesProcessedTotal: 0,
    framesSkippedTotal: 0,
    detectionsGeneratedTotal: 0,
    inferenceErrorsTotal: 0,
  };

  private detectionListeners = new Set<(detection: NormalizedDetection) => void>();

  constructor(detector: IObjectDetector = new YolosTinyDetector()) {
    this.detector = detector;
  }

  /**
   * Initializes the AI inference subsystem and pre-loads the model.
   */
  public async initialize(): Promise<void> {
    this.status = 'STARTING';
    try {
      await this.detector.load();
      this.status = 'READY';
      this.lastError = null;

      // Start automatic stream sampling loop
      this.startSamplingLoop();
    } catch (err: any) {
      this.status = 'ERROR';
      this.lastError = {
        message: err?.message || 'Failed to load model',
        timestamp: new Date().toISOString(),
        code: 'MODEL_LOAD_FAILED',
      };
      console.error('[AiInferenceService] Initialization failed:', err);
    }
  }

  /**
   * Adds a camera to active AI inference sampling.
   */
  public enableCameraInference(cameraId: string): void {
    this.activeSamplingCameras.add(cameraId);
  }

  public disableCameraInference(cameraId: string): void {
    this.activeSamplingCameras.delete(cameraId);
  }

  /**
   * Periodic sampling loop that polls active streams from the Video Gateway.
   */
  private startSamplingLoop(): void {
    if (this.samplingIntervalTimer) {
      clearInterval(this.samplingIntervalTimer);
    }

    // Check periodically for camera frames to process
    this.samplingIntervalTimer = setInterval(async () => {
      if (!this.config.enabled || this.status !== 'READY') return;
      if (this.isGlobalInferenceActive) return;

      // Sample active cameras or default to CAM-01
      const camerasToSample =
        this.activeSamplingCameras.size > 0
          ? Array.from(this.activeSamplingCameras)
          : ['CAM-01'];

      for (const cameraId of camerasToSample) {
        if (this.isGlobalInferenceActive) break;
        await this.processCameraStream(cameraId);
      }
    }, 2000);
  }

  /**
   * Processes the latest frame from a camera stream with backpressure and rate limiting.
   */
  private async processCameraStream(cameraId: string): Promise<void> {
    // Check if inference is already in flight
    if (this.isGlobalInferenceActive || this.inFlightCameras.has(cameraId)) {
      this.metrics.framesSkippedTotal++;
      return;
    }

    // Check sampling interval
    const now = Date.now();
    const lastTime = this.lastCameraInferenceTimestamp.get(cameraId) || 0;
    if (now - lastTime < Math.max(this.config.samplingIntervalMs, 3000)) {
      return;
    }

    const frame = videoGateway.getLatestFrame(cameraId);
    if (!frame) {
      return;
    }

    await this.runInferenceOnFrame(frame);
  }

  /**
   * Executes inference on a specific frame.
   */
  public async runInferenceOnFrame(frame: RawFrame): Promise<NormalizedDetection[]> {
    if (!this.config.enabled) {
      return [];
    }

    if (this.isGlobalInferenceActive) {
      this.metrics.framesSkippedTotal++;
      return [];
    }

    if (!this.detector.isReady()) {
      if (this.status === 'STARTING') {
        await this.detector.load();
        this.status = 'READY';
      } else {
        throw new Error('AI detector model is not ready');
      }
    }

    const cameraId = frame.cameraId;
    this.isGlobalInferenceActive = true;
    this.inFlightCameras.add(cameraId);
    this.lastCameraInferenceTimestamp.set(cameraId, Date.now());

    try {
      const detections = await this.detector.detect(frame, this.config.confidenceThreshold);

      this.metrics.framesProcessedTotal++;
      this.lastInferenceAt = new Date().toISOString();
      this.lastInferenceLatencyMs = this.detector.getLastLatency();

      if (detections.length > 0) {
        this.metrics.detectionsGeneratedTotal += detections.length;
        detectionStore.addBatch(detections);

        // Notify subscribers
        for (const det of detections) {
          this.emitDetection(det);
        }
      }

      // Run real multi-object tracking against this frame's detections
      try {
        trackingService.processDetections(cameraId, detections, frame.timestamp);
      } catch (trackErr) {
        console.error('[AiInferenceService] Tracking error on frame:', trackErr);
      }

      return detections;
    } catch (err: any) {
      this.metrics.inferenceErrorsTotal++;
      this.lastError = {
        message: err?.message || 'Inference execution failed',
        timestamp: new Date().toISOString(),
        code: 'INFERENCE_ERROR',
      };
      throw err;
    } finally {
      this.inFlightCameras.delete(cameraId);
      this.isGlobalInferenceActive = false;
    }
  }

  /**
   * On-demand inference triggered by API or operator UI.
   */
  public async inferCamera(cameraId: string): Promise<{
    cameraId: string;
    detections: NormalizedDetection[];
    latencyMs: number | null;
    timestamp: string;
  }> {
    const frame = videoGateway.getLatestFrame(cameraId);
    if (!frame) {
      throw new Error(`No active video frame available for camera ${cameraId}`);
    }

    const detections = await this.runInferenceOnFrame(frame);
    return {
      cameraId,
      detections,
      latencyMs: this.lastInferenceLatencyMs,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Subscribes to new person detections.
   */
  public onDetection(listener: (detection: NormalizedDetection) => void): () => void {
    this.detectionListeners.add(listener);
    return () => {
      this.detectionListeners.delete(listener);
    };
  }

  private emitDetection(detection: NormalizedDetection): void {
    for (const listener of this.detectionListeners) {
      try {
        listener(detection);
      } catch (err) {
        console.error('[AiInferenceService] Detection listener error:', err);
      }
    }
  }

  /**
   * Returns comprehensive health and telemetry status for the AI service.
   */
  public getHealth(): InferenceHealth {
    return {
      status: this.status,
      modelLoaded: this.detector.isReady(),
      modelName: this.detector.modelName,
      modelVersion: this.detector.modelVersion,
      device: this.detector.device,
      deviceDescription: this.detector.deviceDescription,
      confidenceThreshold: this.config.confidenceThreshold,
      samplingIntervalMs: this.config.samplingIntervalMs,
      lastInferenceAt: this.lastInferenceAt,
      lastInferenceLatencyMs: this.lastInferenceLatencyMs,
      metrics: { ...this.metrics },
      activeCamerasCount: this.activeSamplingCameras.size,
      lastError: this.lastError,
    };
  }

  public getConfig(): InferenceConfig {
    return { ...this.config };
  }

  public updateConfig(patch: Partial<InferenceConfig>): InferenceConfig {
    if (patch.confidenceThreshold !== undefined) {
      this.config.confidenceThreshold = Math.max(0.1, Math.min(0.99, patch.confidenceThreshold));
    }
    if (patch.samplingIntervalMs !== undefined) {
      this.config.samplingIntervalMs = Math.max(500, Math.min(30000, patch.samplingIntervalMs));
    }
    if (patch.enabled !== undefined) {
      this.config.enabled = patch.enabled;
    }
    return { ...this.config };
  }

  public shutdown(): void {
    if (this.samplingIntervalTimer) {
      clearInterval(this.samplingIntervalTimer);
      this.samplingIntervalTimer = null;
    }
    this.inFlightCameras.clear();
    this.detectionListeners.clear();
  }
}

export const aiInferenceService = new AiInferenceService();
