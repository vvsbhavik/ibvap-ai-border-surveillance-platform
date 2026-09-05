/**
 * IBVAP — Camera Object Tracker
 *
 * Implements a lightweight, deterministic multi-object tracking (MOT) algorithm
 * tailored for resource-constrained edge/CPU runtime:
 * - Intersection-over-Union (IoU) spatial association
 * - Centroid Euclidean distance proximity gating
 * - Velocity-guided bounding box position projection
 * - Bounded trajectory history and kinematics-derived compass heading
 * - Lifecycle state machine: ACTIVE -> TEMPORARILY_LOST -> ENDED
 * - Camera-scoped persistent track IDs
 */

import { BoundingBox, NormalizedDetection } from '../ai-inference/types';
import {
  MovementDirection,
  Track,
  TrackingConfig,
  TrajectoryPoint,
} from './types';

export const DEFAULT_TRACKING_CONFIG: TrackingConfig = {
  iouThreshold: 0.18,
  maxCentroidDistance: 0.28,
  iouWeight: 0.65,
  maxMissedFrames: 4,
  missedFramesForLost: 1,
  maxTrajectoryPoints: 30,
  minMovementThreshold: 0.025,
  trackRetentionSeconds: 300,
};

/**
 * Computes the Intersection-over-Union (IoU) between two bounding boxes.
 */
export function computeIoU(boxA: BoundingBox, boxB: BoundingBox): number {
  const xMin = Math.max(boxA.x, boxB.x);
  const yMin = Math.max(boxA.y, boxB.y);
  const xMax = Math.min(boxA.x + boxA.width, boxB.x + boxB.width);
  const yMax = Math.min(boxA.y + boxA.height, boxB.y + boxB.height);

  const intersectionWidth = Math.max(0, xMax - xMin);
  const intersectionHeight = Math.max(0, yMax - yMin);
  const intersectionArea = intersectionWidth * intersectionHeight;

  const areaA = boxA.width * boxA.height;
  const areaB = boxB.width * boxB.height;
  const unionArea = areaA + areaB - intersectionArea;

  if (unionArea <= 0) return 0;
  return Math.max(0, Math.min(1, intersectionArea / unionArea));
}

/**
 * Computes normalized centroid center point.
 */
export function getCentroid(box: BoundingBox): { x: number; y: number } {
  return {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  };
}

/**
 * Computes Euclidean distance between two centroids.
 */
export function computeCentroidDistance(boxA: BoundingBox, boxB: BoundingBox): number {
  const cA = getCentroid(boxA);
  const cB = getCentroid(boxB);
  return Math.sqrt((cA.x - cB.x) ** 2 + (cA.y - cB.y) ** 2);
}

/**
 * Calculates 8-way compass direction based on recent trajectory points.
 */
export function calculateDirection(
  trajectory: TrajectoryPoint[],
  minThreshold: number
): MovementDirection {
  if (trajectory.length < 2) {
    return 'UNKNOWN';
  }

  // Use the average vector between recent points (up to 5 points)
  const sampleCount = Math.min(trajectory.length, 5);
  const startIdx = trajectory.length - sampleCount;
  const startPoint = trajectory[startIdx];
  const endPoint = trajectory[trajectory.length - 1];

  const dx = endPoint.centerX - startPoint.centerX;
  const dy = endPoint.centerY - startPoint.centerY;
  const distance = Math.sqrt(dx * dx + dy * dy);

  if (distance < minThreshold) {
    return 'STATIONARY';
  }

  // Screen coordinates: +x = East, -x = West, +y = South, -y = North
  const angleDeg = Math.atan2(dy, dx) * (180 / Math.PI);

  if (angleDeg >= -22.5 && angleDeg < 22.5) {
    return 'EAST';
  } else if (angleDeg >= 22.5 && angleDeg < 67.5) {
    return 'SOUTHEAST';
  } else if (angleDeg >= 67.5 && angleDeg < 112.5) {
    return 'SOUTH';
  } else if (angleDeg >= 112.5 && angleDeg < 157.5) {
    return 'SOUTHWEST';
  } else if (angleDeg >= 157.5 || angleDeg < -157.5) {
    return 'WEST';
  } else if (angleDeg >= -157.5 && angleDeg < -112.5) {
    return 'NORTHWEST';
  } else if (angleDeg >= -112.5 && angleDeg < -67.5) {
    return 'NORTH';
  } else {
    return 'NORTHEAST';
  }
}

export interface TrackingStepResult {
  updatedTracks: Track[];
  createdTracks: Track[];
  lostTracks: Track[];
  endedTracks: Track[];
  associationOperations: number;
}

export class CameraTracker {
  public readonly cameraId: string;
  private config: TrackingConfig;
  private nextNumericId: number = 1;

  // Active or temporarily lost tracks
  private activeTracks: Map<string, Track> = new Map();

  // Bounded ended tracks history for post-hoc query and audit
  private endedTracks: Track[] = [];

  constructor(cameraId: string, config: Partial<TrackingConfig> = {}) {
    this.cameraId = cameraId;
    this.config = { ...DEFAULT_TRACKING_CONFIG, ...config };
  }

  public getConfig(): TrackingConfig {
    return { ...this.config };
  }

  public updateConfig(newConfig: Partial<TrackingConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  public getActiveTracks(): Track[] {
    return Array.from(this.activeTracks.values());
  }

  public getAllTracks(): Track[] {
    return [...Array.from(this.activeTracks.values()), ...this.endedTracks];
  }

  public getTrack(trackId: string): Track | undefined {
    return this.activeTracks.get(trackId) || this.endedTracks.find((t) => t.trackId === trackId);
  }

  /**
   * Resets tracker state and track ID sequence for this camera.
   */
  public reset(): void {
    this.activeTracks.clear();
    this.endedTracks = [];
    this.nextNumericId = 1;
  }

  /**
   * Main tracking cycle: associates incoming frame detections with existing tracks.
   */
  public processFrame(
    detections: NormalizedDetection[],
    frameTimestamp: string
  ): TrackingStepResult {
    const createdTracks: Track[] = [];
    const updatedTracks: Track[] = [];
    const lostTracks: Track[] = [];
    const endedTracks: Track[] = [];

    const existingTrackList = Array.from(this.activeTracks.values());
    let associationOperations = 0;

    // Filter detections strictly for this camera and person class
    const validDetections = detections.filter(
      (d) => (d.cameraId === this.cameraId || !d.cameraId) && d.objectType === 'person'
    );

    // 1. Build Candidate Matches Matrix
    interface MatchCandidate {
      trackIndex: number;
      detIndex: number;
      score: number;
      iou: number;
      centroidDist: number;
    }

    const candidates: MatchCandidate[] = [];

    for (let t = 0; t < existingTrackList.length; t++) {
      const track = existingTrackList[t];

      // Predict next bounding box position based on previous trajectory velocity
      const predictedBox = this.predictBoundingBox(track);

      for (let d = 0; d < validDetections.length; d++) {
        const detection = validDetections[d];
        associationOperations++;

        const iou = computeIoU(predictedBox, detection.boundingBox);
        const centroidDist = computeCentroidDistance(predictedBox, detection.boundingBox);

        // Association Gating: Must satisfy either IoU threshold OR proximity gating
        const iouPasses = iou >= this.config.iouThreshold;
        const proximityPasses = centroidDist <= this.config.maxCentroidDistance && iou > 0.04;

        if (iouPasses || proximityPasses) {
          // Combined score: higher is better
          const normalizedDistScore = Math.max(0, 1 - centroidDist / this.config.maxCentroidDistance);
          const score = this.config.iouWeight * iou + (1 - this.config.iouWeight) * normalizedDistScore;

          candidates.push({
            trackIndex: t,
            detIndex: d,
            score,
            iou,
            centroidDist,
          });
        }
      }
    }

    // 2. Greedy Matching by descending score
    candidates.sort((a, b) => b.score - a.score);

    const matchedTrackIndices = new Set<number>();
    const matchedDetectionIndices = new Set<number>();

    for (const match of candidates) {
      if (
        matchedTrackIndices.has(match.trackIndex) ||
        matchedDetectionIndices.has(match.detIndex)
      ) {
        continue;
      }

      matchedTrackIndices.add(match.trackIndex);
      matchedDetectionIndices.add(match.detIndex);

      // Update Track with matched detection
      const track = existingTrackList[match.trackIndex];
      const detection = validDetections[match.detIndex];

      const centroid = getCentroid(detection.boundingBox);
      const newPoint: TrajectoryPoint = {
        timestamp: detection.timestamp || frameTimestamp,
        x: detection.boundingBox.x,
        y: detection.boundingBox.y,
        centerX: centroid.x,
        centerY: centroid.y,
        boundingBox: { ...detection.boundingBox },
      };

      // Append bounded trajectory
      track.trajectory.push(newPoint);
      if (track.trajectory.length > this.config.maxTrajectoryPoints) {
        track.trajectory.shift();
      }

      track.lastBoundingBox = { ...detection.boundingBox };
      if (detection.pixelBox) {
        track.lastPixelBox = { ...detection.pixelBox };
      }
      track.lastSeenAt = detection.timestamp || frameTimestamp;
      track.currentConfidence = detection.confidence;
      track.detectionCount += 1;
      track.missedFrames = 0;
      track.state = 'ACTIVE';
      track.direction = calculateDirection(track.trajectory, this.config.minMovementThreshold);
      track.dwellTimeSeconds = Math.max(
        0,
        Math.round((Date.parse(track.lastSeenAt) - Date.parse(track.firstSeenAt)) / 1000)
      );
      track.contributingDetectionIds.push(detection.detectionId);
      if (track.contributingDetectionIds.length > 50) {
        track.contributingDetectionIds.shift();
      }

      updatedTracks.push(track);
    }

    // 3. Handle Unmatched Existing Tracks (missed frames / occlusion)
    for (let t = 0; t < existingTrackList.length; t++) {
      if (!matchedTrackIndices.has(t)) {
        const track = existingTrackList[t];
        track.missedFrames += 1;

        if (track.missedFrames >= this.config.maxMissedFrames) {
          // Track is now ended
          track.state = 'ENDED';
          this.activeTracks.delete(track.trackId);
          this.endedTracks.push(track);
          if (this.endedTracks.length > 100) {
            this.endedTracks.shift();
          }
          endedTracks.push(track);
        } else if (track.missedFrames >= this.config.missedFramesForLost) {
          // Track temporarily lost
          const wasActive = track.state === 'ACTIVE';
          track.state = 'TEMPORARILY_LOST';
          if (wasActive) {
            lostTracks.push(track);
          }
        }
      }
    }

    // 4. Create New Tracks for Unmatched Detections
    for (let d = 0; d < validDetections.length; d++) {
      if (!matchedDetectionIndices.has(d)) {
        const detection = validDetections[d];
        const newTrack = this.createTrackFromDetection(detection, frameTimestamp);
        this.activeTracks.set(newTrack.trackId, newTrack);
        createdTracks.push(newTrack);
      }
    }

    return {
      updatedTracks,
      createdTracks,
      lostTracks,
      endedTracks,
      associationOperations,
    };
  }

  /**
   * Initializes a brand new Track from an unassociated real detection.
   */
  private createTrackFromDetection(
    detection: NormalizedDetection,
    frameTimestamp: string
  ): Track {
    const numericId = this.nextNumericId++;
    const trackId = `TRK-${this.cameraId}-${String(numericId).padStart(4, '0')}`;
    const timestamp = detection.timestamp || frameTimestamp;
    const centroid = getCentroid(detection.boundingBox);

    const initialPoint: TrajectoryPoint = {
      timestamp,
      x: detection.boundingBox.x,
      y: detection.boundingBox.y,
      centerX: centroid.x,
      centerY: centroid.y,
      boundingBox: { ...detection.boundingBox },
    };

    return {
      trackId,
      numericId,
      cameraId: this.cameraId,
      objectType: 'person',
      createdAt: timestamp,
      firstSeenAt: timestamp,
      lastSeenAt: timestamp,
      lastBoundingBox: { ...detection.boundingBox },
      lastPixelBox: detection.pixelBox ? { ...detection.pixelBox } : undefined,
      trajectory: [initialPoint],
      detectionCount: 1,
      missedFrames: 0,
      currentConfidence: detection.confidence,
      state: 'ACTIVE',
      direction: 'STATIONARY',
      dwellTimeSeconds: 0,
      contributingDetectionIds: [detection.detectionId],
      modelVersion: detection.modelVersion || 'YOLOS-tiny',
    };
  }

  /**
   * Predicts next bounding box position based on recent velocity kinematics.
   */
  private predictBoundingBox(track: Track): BoundingBox {
    if (track.trajectory.length < 2) {
      return track.lastBoundingBox;
    }

    const len = track.trajectory.length;
    const p1 = track.trajectory[len - 2];
    const p2 = track.trajectory[len - 1];

    // Estimated velocity vector (delta per step)
    const vx = p2.centerX - p1.centerX;
    const vy = p2.centerY - p1.centerY;

    // Projected bounding box with damping factor 0.7 to avoid overshooting
    const projectedX = Math.max(0, Math.min(1 - track.lastBoundingBox.width, track.lastBoundingBox.x + vx * 0.7));
    const projectedY = Math.max(0, Math.min(1 - track.lastBoundingBox.height, track.lastBoundingBox.y + vy * 0.7));

    return {
      x: projectedX,
      y: projectedY,
      width: track.lastBoundingBox.width,
      height: track.lastBoundingBox.height,
    };
  }
}
