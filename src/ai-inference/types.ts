/**
 * IBVAP — AI Computer Vision Inference Subsystem Type Definitions
 * Normalized detection schema, bounded telemetry, and truthful hardware attribution.
 */

export interface BoundingBox {
  /** Normalized X position (0.0 to 1.0) from left of frame */
  x: number;
  /** Normalized Y position (0.0 to 1.0) from top of frame */
  y: number;
  /** Normalized width (0.0 to 1.0) */
  width: number;
  /** Normalized height (0.0 to 1.0) */
  height: number;
}

export interface PixelBoundingBox {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
  width?: number;
  height?: number;
}

export type AiSubsystemHealth = InferenceHealth;
export type AiInferenceConfig = InferenceConfig;

export type DetectedObjectType = 'person' | 'vehicle';

export type VehicleClass =
  | 'CAR'
  | 'MOTORCYCLE'
  | 'BUS'
  | 'TRUCK'
  | 'VAN'
  | 'UNKNOWN_VEHICLE';

export interface NormalizedDetection {
  /** Unique ID for detection instance */
  detectionId: string;
  /** Originating camera identifier */
  cameraId: string;
  /** Timestamp when the video frame was captured */
  timestamp: string;
  /** Timestamp when AI inference concluded */
  inferenceTimestamp: string;
  /** Detected object class: person or vehicle */
  objectType: DetectedObjectType;
  /** Specific vehicle classification if objectType is vehicle */
  vehicleClass?: VehicleClass;
  /** String class label for display / interoperability */
  class?: string;
  /** Model-produced detection confidence (0.0 to 1.0) */
  confidence: number;
  /** Normalized bounding box relative to frame resolution */
  boundingBox: BoundingBox;
  /** Optional absolute pixel bounding box */
  pixelBox?: PixelBoundingBox;
  /** Frame reference (sequence or frame UUID) */
  frameReference: string;
  /** Model version reference for auditability and performance analytics */
  modelVersion: string;
}

export type InferenceServiceStatus =
  | 'STARTING'
  | 'READY'
  | 'BUSY'
  | 'DEGRADED'
  | 'OFFLINE'
  | 'ERROR';

export type InferenceDevice = 'cpu' | 'cuda';

export interface InferenceHealth {
  status: InferenceServiceStatus;
  modelLoaded: boolean;
  modelName: string;
  modelVersion: string;
  device: InferenceDevice;
  deviceDescription: string;
  confidenceThreshold: number;
  samplingIntervalMs: number;
  lastInferenceAt: string | null;
  lastInferenceLatencyMs: number | null;
  metrics: {
    framesProcessedTotal: number;
    framesSkippedTotal: number;
    detectionsGeneratedTotal: number;
    inferenceErrorsTotal: number;
  };
  activeCamerasCount: number;
  lastError: {
    message: string;
    timestamp: string;
    code?: string;
  } | null;
}

export interface InferenceConfig {
  modelName: string;
  modelVersion: string;
  confidenceThreshold: number;
  samplingIntervalMs: number;
  enabled: boolean;
  maxConcurrency: number;
}

export interface DetectionFilter {
  cameraId?: string;
  objectType?: string;
  minConfidence?: number;
  startTime?: string;
  endTime?: string;
  limit?: number;
}
