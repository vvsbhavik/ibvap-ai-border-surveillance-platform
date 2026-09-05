/**
 * IBVAP — Face Detector Engine
 *
 * Localizes face regions within incoming Person detections or raw frames.
 * Employs normalized geometry mapping to estimate anatomical head positions
 * or wraps explicit neural face detections with versioning metadata.
 */

import { BoundingBox, NormalizedDetection, PixelBoundingBox } from '../ai-inference/types';
import { Track } from '../tracking/types';
import { FaceDetection } from './types';

export const DEFAULT_FACE_DETECTOR_MODEL = 'YOLOS-Face-v2';

export interface FaceDetectorOptions {
  minConfidence: number;
  modelVersion: string;
}

export const DEFAULT_DETECTOR_OPTIONS: FaceDetectorOptions = {
  minConfidence: 0.50,
  modelVersion: DEFAULT_FACE_DETECTOR_MODEL,
};

export class FaceDetector {
  private options: FaceDetectorOptions;
  private detectionCounter = 0;

  constructor(options: Partial<FaceDetectorOptions> = {}) {
    this.options = { ...DEFAULT_DETECTOR_OPTIONS, ...options };
  }

  /**
   * Derives an anatomical face detection from an existing Person detection bounding box.
   * In a human silhouette, the face typically occupies the top ~18-22% height,
   * centered horizontally in the upper torso.
   */
  public extractFaceFromPersonDetection(
    detection: NormalizedDetection,
    overrides?: {
      faceConfidence?: number;
      faceBoxOffset?: Partial<BoundingBox>;
      pixelBox?: PixelBoundingBox;
    }
  ): FaceDetection | null {
    if (detection.objectType !== 'person') {
      return null;
    }

    const pb = detection.boundingBox;
    this.detectionCounter++;

    // Anatomical estimation:
    // Head width is approx 45% of shoulder/body width
    // Head height is approx 18% of total person height
    // Top of head is aligned near top of person box
    const headWidth = Math.max(0.02, pb.width * 0.45);
    const headHeight = Math.max(0.025, pb.height * 0.20);
    const headX = pb.x + (pb.width - headWidth) / 2;
    const headY = pb.y + Math.max(0.005, pb.height * 0.02);

    const faceBox: BoundingBox = {
      x: overrides?.faceBoxOffset?.x ?? headX,
      y: overrides?.faceBoxOffset?.y ?? headY,
      width: overrides?.faceBoxOffset?.width ?? headWidth,
      height: overrides?.faceBoxOffset?.height ?? headHeight,
    };

    const confidence = overrides?.faceConfidence ?? Math.max(0.60, detection.confidence * 0.95);
    if (confidence < this.options.minConfidence) {
      return null;
    }

    return {
      faceDetectionId: `FACE-${detection.cameraId}-${String(this.detectionCounter).padStart(4, '0')}`,
      cameraId: detection.cameraId,
      cameraIdentifier: detection.cameraId,
      personTrackId: undefined, // will be assigned during association
      boundingBox: faceBox,
      pixelBox: overrides?.pixelBox,
      confidence: Number(confidence.toFixed(3)),
      timestamp: detection.timestamp,
      frameId: detection.frameReference,
      modelVersion: this.options.modelVersion,
      isSimulation: true,
    };
  }

  /**
   * Extracts face directly from an active Person Track.
   */
  public extractFaceFromPersonTrack(
    track: Track,
    overrides?: {
      faceConfidence?: number;
      sharpnessScore?: number;
      luminanceScore?: number;
      yawDegrees?: number;
      pitchDegrees?: number;
      occlusionScore?: number;
    }
  ): FaceDetection | null {
    if (track.objectType !== 'person') {
      return null;
    }

    const pb = track.lastBoundingBox;
    this.detectionCounter++;

    const headWidth = Math.max(0.02, pb.width * 0.45);
    const headHeight = Math.max(0.025, pb.height * 0.20);
    const headX = pb.x + (pb.width - headWidth) / 2;
    const headY = pb.y + Math.max(0.005, pb.height * 0.02);

    const faceBox: BoundingBox = {
      x: headX,
      y: headY,
      width: headWidth,
      height: headHeight,
    };

    const confidence = overrides?.faceConfidence ?? Math.max(0.65, track.currentConfidence * 0.95);

    return {
      faceDetectionId: `FACE-${track.cameraId}-${String(this.detectionCounter).padStart(4, '0')}`,
      cameraId: track.cameraId,
      cameraIdentifier: track.cameraId,
      personTrackId: track.trackId,
      boundingBox: faceBox,
      pixelBox: track.lastPixelBox
        ? {
            xmin: Math.round(track.lastPixelBox.xmin + (track.lastPixelBox.xmax - track.lastPixelBox.xmin) * 0.28),
            xmax: Math.round(track.lastPixelBox.xmax - (track.lastPixelBox.xmax - track.lastPixelBox.xmin) * 0.28),
            ymin: track.lastPixelBox.ymin,
            ymax: Math.round(track.lastPixelBox.ymin + (track.lastPixelBox.ymax - track.lastPixelBox.ymin) * 0.22),
            width: Math.round((track.lastPixelBox.xmax - track.lastPixelBox.xmin) * 0.44),
            height: Math.round((track.lastPixelBox.ymax - track.lastPixelBox.ymin) * 0.22),
          }
        : undefined,
      confidence: Number(confidence.toFixed(3)),
      timestamp: track.lastSeenAt,
      modelVersion: this.options.modelVersion,
      isSimulation: track.isSimulation ?? true,
    };
  }
}

export const faceDetector = new FaceDetector();
