/**
 * IBVAP — Person-to-Face Spatial & Temporal Associator
 *
 * Evaluates geometric containment, anatomical alignment (head-to-body proportion),
 * camera spatial gating, and temporal alignment to link face detections to existing Person Tracks.
 */

import { Track } from '../tracking/types';
import { FaceDetection, PersonFaceAssociation } from './types';

export interface AssociatorConfig {
  minContainmentRatio: number; // default 0.60
  maxCentroidDistance: number; // default 0.35
  maxVerticalHeadRatio: number; // face center must be in top 45% of person bbox
  maxTimeDeltaMs: number; // default 1500ms
}

export const DEFAULT_ASSOCIATOR_CONFIG: AssociatorConfig = {
  minContainmentRatio: 0.50,
  maxCentroidDistance: 0.30,
  maxVerticalHeadRatio: 0.50,
  maxTimeDeltaMs: 2000,
};

export class PersonFaceAssociator {
  private config: AssociatorConfig;

  constructor(config: Partial<AssociatorConfig> = {}) {
    this.config = { ...DEFAULT_ASSOCIATOR_CONFIG, ...config };
  }

  /**
   * Evaluates association between a detected face and an existing Person track.
   */
  public evaluateAssociation(face: FaceDetection, track: Track): PersonFaceAssociation {
    // 1. Category validation: Faces CANNOT associate with vehicles or non-person tracks
    const isPerson =
      track.objectType === 'person' ||
      (track.class && track.class.toLowerCase() === 'person') ||
      track.trackId.startsWith('PER-') ||
      track.trackId.startsWith('PED-') ||
      track.trackId.startsWith('TRK-P');

    if (!isPerson) {
      return {
        isValid: false,
        personTrackId: track.trackId,
        faceDetectionId: face.faceDetectionId,
        containmentRatio: 0,
        verticalRatio: 1.0,
        centroidDistance: 1.0,
        associationConfidence: 0,
        rejectionReason: `Category mismatch: track ${track.trackId} has objectType '${track.objectType}'. Faces may only associate with Person tracks.`,
      };
    }

    // 2. Camera alignment validation
    const camMatch =
      !face.cameraId ||
      !track.cameraId ||
      face.cameraId === track.cameraId ||
      (face.cameraIdentifier && face.cameraIdentifier === track.cameraId);

    if (!camMatch) {
      return {
        isValid: false,
        personTrackId: track.trackId,
        faceDetectionId: face.faceDetectionId,
        containmentRatio: 0,
        verticalRatio: 1.0,
        centroidDistance: 1.0,
        associationConfidence: 0,
        rejectionReason: `Camera mismatch: face camera ${face.cameraId} does not match track camera ${track.cameraId}`,
      };
    }

    // 3. Temporal alignment validation
    if (face.timestamp && track.lastSeenAt) {
      const faceTime = new Date(face.timestamp).getTime();
      const trackTime = new Date(track.lastSeenAt).getTime();
      const deltaMs = Math.abs(faceTime - trackTime);
      if (deltaMs > this.config.maxTimeDeltaMs) {
        return {
          isValid: false,
          personTrackId: track.trackId,
          faceDetectionId: face.faceDetectionId,
          containmentRatio: 0,
          verticalRatio: 1.0,
          centroidDistance: 1.0,
          associationConfidence: 0,
          rejectionReason: `Temporal gating failed: delta ${deltaMs}ms exceeds max ${this.config.maxTimeDeltaMs}ms`,
        };
      }
    }

    // 4. Spatial bounding box containment and centroid evaluation
    const fb = face.boundingBox;
    const tb = track.lastBoundingBox;

    // Face coordinates
    const faceLeft = fb.x;
    const faceRight = fb.x + fb.width;
    const faceTop = fb.y;
    const faceBottom = fb.y + fb.height;
    const faceCenterX = fb.x + fb.width / 2;
    const faceCenterY = fb.y + fb.height / 2;
    const faceArea = Math.max(0.0001, fb.width * fb.height);

    // Person coordinates
    const trackLeft = tb.x;
    const trackRight = tb.x + tb.width;
    const trackTop = tb.y;
    const trackBottom = tb.y + tb.height;
    const trackCenterX = tb.x + tb.width / 2;
    const trackCenterY = tb.y + tb.height / 2;

    // Intersecting area
    const interLeft = Math.max(faceLeft, trackLeft);
    const interTop = Math.max(faceTop, trackTop);
    const interRight = Math.min(faceRight, trackRight);
    const interBottom = Math.min(faceBottom, trackBottom);

    let intersectionArea = 0;
    if (interRight > interLeft && interBottom > interTop) {
      intersectionArea = (interRight - interLeft) * (interBottom - interTop);
    }

    // Ratio of face area contained inside person bounding box
    const containmentRatio = Math.max(0, Math.min(1.0, intersectionArea / faceArea));

    // Vertical head ratio: Where is faceCenterY relative to person height?
    // 0.0 = top of head, 1.0 = feet.
    const personHeight = Math.max(0.01, tb.height);
    const verticalHeadRatio = (faceCenterY - trackTop) / personHeight;

    // Normalized Euclidean centroid distance
    const dx = faceCenterX - trackCenterX;
    const dy = faceCenterY - trackCenterY;
    const centroidDistance = Math.sqrt(dx * dx + dy * dy);

    // Gating check 1: Containment
    if (containmentRatio < this.config.minContainmentRatio) {
      return {
        isValid: false,
        personTrackId: track.trackId,
        faceDetectionId: face.faceDetectionId,
        containmentRatio,
        verticalRatio: verticalHeadRatio,
        centroidDistance,
        associationConfidence: 0,
        rejectionReason: `Spatial containment insufficient: ${(containmentRatio * 100).toFixed(1)}% < ${(this.config.minContainmentRatio * 100).toFixed(1)}% required`,
      };
    }

    // Gating check 2: Anatomical vertical position
    // Head should be in upper body (<= maxVerticalHeadRatio, e.g. top 50%)
    if (verticalHeadRatio > this.config.maxVerticalHeadRatio || verticalHeadRatio < -0.15) {
      return {
        isValid: false,
        personTrackId: track.trackId,
        faceDetectionId: face.faceDetectionId,
        containmentRatio,
        verticalRatio: verticalHeadRatio,
        centroidDistance,
        associationConfidence: 0,
        rejectionReason: `Anatomical vertical misalignment: face center is at ${(verticalHeadRatio * 100).toFixed(1)}% of person height (must be in top ${(this.config.maxVerticalHeadRatio * 100).toFixed(0)}%)`,
      };
    }

    // Gating check 3: Centroid distance
    if (centroidDistance > this.config.maxCentroidDistance) {
      return {
        isValid: false,
        personTrackId: track.trackId,
        faceDetectionId: face.faceDetectionId,
        containmentRatio,
        verticalRatio: verticalHeadRatio,
        centroidDistance,
        associationConfidence: 0,
        rejectionReason: `Spatial distance excessive: centroid distance ${centroidDistance.toFixed(3)} > ${this.config.maxCentroidDistance.toFixed(3)} limit`,
      };
    }

    // Calculate association confidence score:
    // High containment + centered horizontally + high vertical placement = high confidence
    const horizontalAlignment = 1.0 - Math.min(1.0, (Math.abs(faceCenterX - trackCenterX) / (tb.width / 2)));
    const associationConfidence = Number(
      (
        containmentRatio * 0.50 +
        Math.max(0, 1.0 - verticalHeadRatio) * 0.30 +
        Math.max(0, horizontalAlignment) * 0.20
      ).toFixed(3)
    );

    return {
      isValid: true,
      personTrackId: track.trackId,
      faceDetectionId: face.faceDetectionId,
      containmentRatio,
      verticalRatio: verticalHeadRatio,
      centroidDistance,
      associationConfidence,
    };
  }
}

export const personFaceAssociator = new PersonFaceAssociator();
