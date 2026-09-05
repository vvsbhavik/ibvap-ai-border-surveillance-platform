/**
 * IBVAP — Vehicle-Plate Associator
 *
 * Links detected license plate regions to persistent Vehicle Track IDs:
 * - Computes spatial containment ratio (plate box inside vehicle box)
 * - Checks temporal consistency (timestamp alignment within frame tolerance)
 * - Proximity gating to prevent incorrect association with nearby unrelated vehicles
 * - Emits comprehensive association metrics and rejection diagnostics
 */

import { BoundingBox } from '../ai-inference/types';
import { Track } from '../tracking/types';
import { PlateDetection, VehiclePlateAssociation } from './types';

export interface AssociatorConfig {
  minContainmentRatio: number;   // default: 0.70 (plate must be at least 70% inside vehicle box)
  maxTemporalDeltaMs: number;    // default: 1500ms
  maxSpatialDistance: number;    // default: 0.35 normalized Euclidean distance
}

export const DEFAULT_ASSOCIATOR_CONFIG: AssociatorConfig = {
  minContainmentRatio: 0.70,
  maxTemporalDeltaMs: 1500,
  maxSpatialDistance: 0.35,
};

/**
 * Computes intersection area between two normalized bounding boxes.
 */
function computeIntersectionArea(boxA: BoundingBox, boxB: BoundingBox): number {
  const xMin = Math.max(boxA.x, boxB.x);
  const yMin = Math.max(boxA.y, boxB.y);
  const xMax = Math.min(boxA.x + boxA.width, boxB.x + boxB.width);
  const yMax = Math.min(boxA.y + boxA.height, boxB.y + boxB.height);

  const width = Math.max(0, xMax - xMin);
  const height = Math.max(0, yMax - yMin);
  return width * height;
}

/**
 * Computes Euclidean distance between two bounding box centers.
 */
function computeCenterDistance(boxA: BoundingBox, boxB: BoundingBox): number {
  const cAx = boxA.x + boxA.width / 2;
  const cAy = boxA.y + boxA.height / 2;
  const cBx = boxB.x + boxB.width / 2;
  const cBy = boxB.y + boxB.height / 2;
  return Math.sqrt((cAx - cBx) ** 2 + (cAy - cBy) ** 2);
}

export class VehiclePlateAssociator {
  private config: AssociatorConfig;

  constructor(config: Partial<AssociatorConfig> = {}) {
    this.config = { ...DEFAULT_ASSOCIATOR_CONFIG, ...config };
  }

  /**
   * Evaluates association between a specific plate detection and a candidate vehicle track.
   */
  public evaluateAssociation(
    plate: PlateDetection,
    track: Track
  ): VehiclePlateAssociation {
    // 1. Gating: Track must be a vehicle
    if (track.objectType !== 'vehicle') {
      return {
        vehicleTrackId: track.trackId,
        plateDetectionId: plate.plateDetectionId,
        associationConfidence: 0,
        containmentRatio: 0,
        spatialDistance: 1.0,
        temporalDeltaMs: 0,
        timestamp: plate.timestamp,
        isValid: false,
        rejectionReason: 'Track is not a vehicle',
      };
    }

    // 2. Camera ID must match
    if (plate.cameraId !== track.cameraId) {
      return {
        vehicleTrackId: track.trackId,
        plateDetectionId: plate.plateDetectionId,
        associationConfidence: 0,
        containmentRatio: 0,
        spatialDistance: 1.0,
        temporalDeltaMs: 0,
        timestamp: plate.timestamp,
        isValid: false,
        rejectionReason: 'Camera mismatch between plate and vehicle track',
      };
    }

    // 3. Temporal delta check
    const plateTime = Date.parse(plate.timestamp);
    const trackTime = Date.parse(track.lastSeenAt);
    const temporalDeltaMs = isNaN(plateTime) || isNaN(trackTime)
      ? 0
      : Math.abs(plateTime - trackTime);

    if (temporalDeltaMs > this.config.maxTemporalDeltaMs) {
      return {
        vehicleTrackId: track.trackId,
        plateDetectionId: plate.plateDetectionId,
        associationConfidence: 0,
        containmentRatio: 0,
        spatialDistance: 1.0,
        temporalDeltaMs,
        timestamp: plate.timestamp,
        isValid: false,
        rejectionReason: `Temporal delta ${temporalDeltaMs}ms exceeds tolerance ${this.config.maxTemporalDeltaMs}ms`,
      };
    }

    // 4. Spatial Containment Check
    const plateArea = plate.boundingBox.width * plate.boundingBox.height;
    if (plateArea <= 0) {
      return {
        vehicleTrackId: track.trackId,
        plateDetectionId: plate.plateDetectionId,
        associationConfidence: 0,
        containmentRatio: 0,
        spatialDistance: 1.0,
        temporalDeltaMs,
        timestamp: plate.timestamp,
        isValid: false,
        rejectionReason: 'Degenerate plate bounding box area',
      };
    }

    const interArea = computeIntersectionArea(plate.boundingBox, track.lastBoundingBox);
    const containmentRatio = Number((interArea / plateArea).toFixed(4));

    if (containmentRatio < this.config.minContainmentRatio) {
      return {
        vehicleTrackId: track.trackId,
        plateDetectionId: plate.plateDetectionId,
        associationConfidence: 0,
        containmentRatio,
        spatialDistance: 1.0,
        temporalDeltaMs,
        timestamp: plate.timestamp,
        isValid: false,
        rejectionReason: `Containment ratio ${(containmentRatio * 100).toFixed(1)}% below minimum required ${(this.config.minContainmentRatio * 100).toFixed(1)}%`,
      };
    }

    // 5. Spatial Proximity Check
    const spatialDistance = Number(computeCenterDistance(plate.boundingBox, track.lastBoundingBox).toFixed(4));
    if (spatialDistance > this.config.maxSpatialDistance) {
      return {
        vehicleTrackId: track.trackId,
        plateDetectionId: plate.plateDetectionId,
        associationConfidence: 0,
        containmentRatio,
        spatialDistance,
        temporalDeltaMs,
        timestamp: plate.timestamp,
        isValid: false,
        rejectionReason: `Spatial distance ${spatialDistance} exceeds max distance ${this.config.maxSpatialDistance}`,
      };
    }

    // 6. Association confidence formula:
    // 65% containment + 35% proximity
    const normProximity = Math.max(0, 1 - spatialDistance / this.config.maxSpatialDistance);
    const associationConfidence = Number(
      (0.65 * containmentRatio + 0.35 * normProximity).toFixed(4)
    );

    return {
      vehicleTrackId: track.trackId,
      plateDetectionId: plate.plateDetectionId,
      associationConfidence,
      containmentRatio,
      spatialDistance,
      temporalDeltaMs,
      timestamp: plate.timestamp,
      isValid: true,
    };
  }

  /**
   * Finds the best matching vehicle track among multiple candidate tracks.
   */
  public findBestVehicleTrack(
    plate: PlateDetection,
    candidateTracks: Track[]
  ): VehiclePlateAssociation | null {
    const validAssociations: VehiclePlateAssociation[] = [];

    for (const track of candidateTracks) {
      const assoc = this.evaluateAssociation(plate, track);
      if (assoc.isValid) {
        validAssociations.push(assoc);
      }
    }

    if (validAssociations.length === 0) {
      return null;
    }

    // Sort by descending association confidence
    validAssociations.sort((a, b) => b.associationConfidence - a.associationConfidence);
    return validAssociations[0];
  }
}

export const vehiclePlateAssociator = new VehiclePlateAssociator();
