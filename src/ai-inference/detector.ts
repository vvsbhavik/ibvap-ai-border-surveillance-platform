import sharp from 'sharp';
import { RawFrame } from '../video-gateway/types';
import { BoundingBox, InferenceDevice, NormalizedDetection, PixelBoundingBox, VehicleClass } from './types';

function mapDetectionLabel(label: string): { objectType: 'person' | 'vehicle'; vehicleClass?: VehicleClass; class: string } | null {
  const l = (label || '').toLowerCase().trim();
  if (l === 'person') {
    return { objectType: 'person', class: 'PERSON' };
  }
  if (l === 'car' || l === 'automobile' || l === 'sedan' || l === 'suv') {
    return { objectType: 'vehicle', vehicleClass: 'CAR', class: 'CAR' };
  }
  if (l === 'motorcycle' || l === 'motorbike' || l === 'moped') {
    return { objectType: 'vehicle', vehicleClass: 'MOTORCYCLE', class: 'MOTORCYCLE' };
  }
  if (l === 'bus') {
    return { objectType: 'vehicle', vehicleClass: 'BUS', class: 'BUS' };
  }
  if (l === 'truck' || l === 'pickup') {
    return { objectType: 'vehicle', vehicleClass: 'TRUCK', class: 'TRUCK' };
  }
  if (l === 'van' || l === 'minivan') {
    return { objectType: 'vehicle', vehicleClass: 'VAN', class: 'VAN' };
  }
  if (l === 'vehicle' || l === 'train' || l === 'cart') {
    return { objectType: 'vehicle', vehicleClass: 'UNKNOWN_VEHICLE', class: 'UNKNOWN_VEHICLE' };
  }
  return null;
}

export interface IObjectDetector {
  readonly modelName: string;
  readonly modelVersion: string;
  readonly device: InferenceDevice;
  readonly deviceDescription: string;
  load(): Promise<void>;
  detect(frame: RawFrame, confidenceThreshold: number): Promise<NormalizedDetection[]>;
  isReady(): boolean;
  getLastLatency(): number | null;
}

/**
 * Real computer-vision object detector powered by YOLOS-tiny (You Only Look at One Sequence)
 * quantized ONNX vision transformer running via Transformers.js / ONNX Runtime.
 */
export class YolosTinyDetector implements IObjectDetector {
  public readonly modelName = 'Xenova/yolos-tiny';
  public readonly modelVersion = 'YOLOS-tiny-COCO-Quantized-v1';
  public readonly device: InferenceDevice = 'cpu';
  public readonly deviceDescription = 'CPU (WASM/ONNX Runtime)';

  private pipelineInstance: any = null;
  private rawImageModule: any = null;
  private isLoading = false;
  private isLoaded = false;
  private lastLatencyMs: number | null = null;

  public isReady(): boolean {
    return this.isLoaded && this.pipelineInstance !== null;
  }

  public getLastLatency(): number | null {
    return this.lastLatencyMs;
  }

  /**
   * Loads the real object detection model pipeline asynchronously.
   */
  public async load(): Promise<void> {
    if (this.isLoaded) return;
    if (this.isLoading) {
      // Wait if already loading
      while (this.isLoading) {
        await new Promise((r) => setTimeout(r, 100));
      }
      return;
    }

    this.isLoading = true;
    try {
      const { pipeline, RawImage, env } = await import('@xenova/transformers');
      this.rawImageModule = RawImage;

      // Configure Transformers.js environment
      if (env) {
        env.allowLocalModels = false;
        env.useBrowserCache = false;
      }

      this.pipelineInstance = await pipeline('object-detection', this.modelName, {
        quantized: true,
      });

      this.isLoaded = true;
    } catch (err: any) {
      this.isLoaded = false;
      this.pipelineInstance = null;
      throw new Error(`Failed to initialize YOLOS detection model: ${err?.message || err}`);
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Preprocesses a RawFrame into a format accepted by Transformers.js RawImage.
   */
  private async preprocessFrame(frame: RawFrame): Promise<any> {
    if (!this.rawImageModule) {
      const { RawImage } = await import('@xenova/transformers');
      this.rawImageModule = RawImage;
    }

    // 1. If frame already has a source file path on disk
    if (frame.sourceImagePath) {
      return await this.rawImageModule.read(frame.sourceImagePath);
    }

    // 2. If frame has a raw Buffer
    if (frame.frameBuffer) {
      const blob = new Blob([frame.frameBuffer], { type: 'image/jpeg' });
      return await this.rawImageModule.fromBlob(blob);
    }

    // 3. If frame has an SVG dataUri, rasterize to JPEG buffer using Sharp
    if (frame.dataUri) {
      let svgString: string;
      if (frame.dataUri.startsWith('data:image/svg+xml;utf8,')) {
        svgString = decodeURIComponent(frame.dataUri.replace('data:image/svg+xml;utf8,', ''));
      } else if (frame.dataUri.startsWith('data:image/svg+xml;base64,')) {
        svgString = Buffer.from(frame.dataUri.replace('data:image/svg+xml;base64,', ''), 'base64').toString('utf8');
      } else {
        svgString = frame.dataUri;
      }

      const rasterBuffer = await sharp(Buffer.from(svgString))
        .jpeg({ quality: 85 })
        .toBuffer();

      const blob = new Blob([rasterBuffer], { type: 'image/jpeg' });
      return await this.rawImageModule.fromBlob(blob);
    }

    throw new Error(`Invalid frame: No readable image data found for camera ${frame.cameraId}`);
  }

  /**
   * Executes real model inference on a video frame, filtering for PERSON class.
   */
  public async detect(frame: RawFrame, confidenceThreshold: number): Promise<NormalizedDetection[]> {
    if (!this.isReady()) {
      await this.load();
    }

    const t0 = Date.now();
    const rawImage = await this.preprocessFrame(frame);

    // Run real inference with percentage coordinate output
    const rawResults: Array<{
      score: number;
      label: string;
      box: {
        xmin: number;
        ymin: number;
        xmax: number;
        ymax: number;
      };
    }> = await this.pipelineInstance(rawImage, {
      threshold: Math.max(0.1, confidenceThreshold),
      percentage: true,
    });

    this.lastLatencyMs = Date.now() - t0;
    const inferenceTimestamp = new Date().toISOString();

    // Filter for valid classes (person or vehicle) and confidence >= threshold
    const detections: NormalizedDetection[] = [];

    for (let i = 0; i < rawResults.length; i++) {
      const item = rawResults[i];

      const mapped = mapDetectionLabel(item.label);
      if (!mapped) {
        continue;
      }

      if (item.score < confidenceThreshold) {
        continue;
      }

      // Clamp coordinates to normalized range [0.0, 1.0]
      const xmin = Math.max(0, Math.min(1, item.box.xmin));
      const ymin = Math.max(0, Math.min(1, item.box.ymin));
      const xmax = Math.max(0, Math.min(1, item.box.xmax));
      const ymax = Math.max(0, Math.min(1, item.box.ymax));

      const boundingBox: BoundingBox = {
        x: Number(xmin.toFixed(4)),
        y: Number(ymin.toFixed(4)),
        width: Number(Math.max(0.01, Math.min(1 - xmin, xmax - xmin)).toFixed(4)),
        height: Number(Math.max(0.01, Math.min(1 - ymin, ymax - ymin)).toFixed(4)),
      };

      const pixelBox: PixelBoundingBox = {
        xmin: Math.round(xmin * frame.width),
        ymin: Math.round(ymin * frame.height),
        xmax: Math.round(xmax * frame.width),
        ymax: Math.round(ymax * frame.height),
      };

      detections.push({
        detectionId: `det-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 6)}`,
        cameraId: frame.cameraId,
        timestamp: frame.timestamp,
        inferenceTimestamp,
        objectType: mapped.objectType,
        vehicleClass: mapped.vehicleClass,
        class: mapped.class,
        confidence: Number(item.score.toFixed(4)),
        boundingBox,
        pixelBox,
        frameReference: `frame-${frame.sequenceNumber || 1}`,
        modelVersion: this.modelVersion,
      });
    }

    return detections;
  }
}
