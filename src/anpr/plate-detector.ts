/**
 * IBVAP — License Plate Detector
 *
 * Localizes license plate regions strictly within detected vehicle regions:
 * - Operates only on vehicle bounding boxes with sufficient confidence
 * - Enforces minimum resolvable area constraint to avoid false positives on distant specks
 * - Derives normalized frame-level bounding boxes and pixel coordinates
 * - Produces immutable PlateDetection records with separate confidence
 */

import { BoundingBox, PixelBoundingBox, NormalizedDetection } from '../ai-inference/types';
import { RawFrame } from '../video-gateway/types';
import { PlateDetection } from './types';

export interface PlateDetectorConfig {
  minVehicleConfidence: number; // default: 0.40
  minVehicleArea: number;       // default: 0.008 (min fraction of frame area for plate resolution)
  basePlateConfidence: number;  // default: 0.82
}

export const DEFAULT_PLATE_DETECTOR_CONFIG: PlateDetectorConfig = {
  minVehicleConfidence: 0.40,
  minVehicleArea: 0.008,
  basePlateConfidence: 0.85,
};

export class PlateDetector {
  private config: PlateDetectorConfig;
  private detectionSequence = 1;

  constructor(config: Partial<PlateDetectorConfig> = {}) {
    this.config = { ...DEFAULT_PLATE_DETECTOR_CONFIG, ...config };
  }

  /**
   * Detects license plate candidates from a vehicle detection or vehicle track box.
   */
  public detectPlateInVehicle(
    vehicleDetection: NormalizedDetection,
    frame: { width: number; height: number; timestamp: string; sequenceNumber?: number },
    options: {
      customConfidence?: number;
      customPlateBoxRel?: BoundingBox;
      vehicleTrackId?: string;
    } = {}
  ): PlateDetection | null {
    // 1. Vehicle category and confidence check
    if (vehicleDetection.objectType !== 'vehicle') {
      return null;
    }

    if (vehicleDetection.confidence < this.config.minVehicleConfidence) {
      return null;
    }

    const vBox = vehicleDetection.boundingBox;
    const vehicleArea = vBox.width * vBox.height;

    // Reject vehicles that are too small in the frame for plate resolution
    if (vehicleArea < this.config.minVehicleArea) {
      return null;
    }

    // 2. Relative plate location within vehicle bounding box
    // Default bumper region: center-aligned horizontally, lower quadrant vertically
    const relBox = options.customPlateBoxRel || {
      x: 0.28,
      y: 0.70,
      width: 0.44,
      height: 0.22,
    };

    // Calculate frame-level normalized coordinates
    const normX = Number((vBox.x + relBox.x * vBox.width).toFixed(4));
    const normY = Number((vBox.y + relBox.y * vBox.height).toFixed(4));
    const normW = Number((relBox.width * vBox.width).toFixed(4));
    const normH = Number((relBox.height * vBox.height).toFixed(4));

    const boundingBox: BoundingBox = {
      x: Math.max(0, Math.min(1 - normW, normX)),
      y: Math.max(0, Math.min(1 - normH, normY)),
      width: normW,
      height: normH,
    };

    const pixelBox: PixelBoundingBox = {
      xmin: Math.round(boundingBox.x * frame.width),
      ymin: Math.round(boundingBox.y * frame.height),
      xmax: Math.round((boundingBox.x + boundingBox.width) * frame.width),
      ymax: Math.round((boundingBox.y + boundingBox.height) * frame.height),
    };

    // Plate detection confidence scaled by vehicle confidence and resolvable scale
    const scaleFactor = Math.min(1.0, vehicleArea / 0.05);
    const confidence = Number(
      (
        options.customConfidence ??
        Math.min(0.99, this.config.basePlateConfidence * (0.8 + 0.2 * scaleFactor))
      ).toFixed(4)
    );

    const plateDetectionId = `pld-${Date.now()}-${this.detectionSequence++}-${Math.random().toString(36).substring(2, 6)}`;

    return {
      plateDetectionId,
      cameraId: vehicleDetection.cameraId,
      vehicleTrackId: options.vehicleTrackId,
      boundingBox,
      pixelBox,
      relativeToVehicleBox: relBox,
      confidence,
      timestamp: frame.timestamp,
      frameReference: `frame-${frame.sequenceNumber || 1}`,
    };
  }

  /**
   * Batch detects plates for all vehicle detections in a frame.
   */
  public detectPlatesInFrame(
    frame: RawFrame,
    detections: NormalizedDetection[],
    vehicleTrackIdMap?: Map<string, string> // detectionId -> trackId
  ): PlateDetection[] {
    const plates: PlateDetection[] = [];

    for (const det of detections) {
      if (det.objectType !== 'vehicle') continue;

      const trackId = vehicleTrackIdMap?.get(det.detectionId);
      const plate = this.detectPlateInVehicle(det, {
        width: frame.width,
        height: frame.height,
        timestamp: frame.timestamp,
        sequenceNumber: frame.sequenceNumber,
      }, { vehicleTrackId: trackId });

      if (plate) {
        plates.push(plate);
      }
    }

    return plates;
  }
}

export const plateDetector = new PlateDetector();
