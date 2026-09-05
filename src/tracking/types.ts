/**
 * IBVAP — Real Multi-Object Tracking (MOT) Subsystem Types
 * Bounded tracking state, association metrics, directional kinematics, and normalized events.
 */

import { BoundingBox, PixelBoundingBox } from '../ai-inference/types';

export type TrackState = 'ACTIVE' | 'TEMPORARILY_LOST' | 'ENDED';

export type MovementDirection =
  | 'NORTH'
  | 'SOUTH'
  | 'EAST'
  | 'WEST'
  | 'NORTHEAST'
  | 'NORTHWEST'
  | 'SOUTHEAST'
  | 'SOUTHWEST'
  | 'STATIONARY'
  | 'UNKNOWN';

export interface TrajectoryPoint {
  timestamp: string;
  x: number;
  y: number;
  centerX: number;
  centerY: number;
  boundingBox: BoundingBox;
}

export interface Track {
  /** Unique persistent track ID within this camera scope, e.g. "TRK-01" */
  trackId: string;
  /** Monotonic numeric track sequence number */
  numericId: number;
  /** Originating camera identifier */
  cameraId: string;
  /** Object class - strictly person */
  objectType: 'person';
  /** Time of track inception */
  createdAt: string;
  /** Timestamp of the first detection associating with this track */
  firstSeenAt: string;
  /** Timestamp of the most recent detection associating with this track */
  lastSeenAt: string;
  /** Most recently confirmed bounding box */
  lastBoundingBox: BoundingBox;
  /** Most recently confirmed pixel bounding box if available */
  lastPixelBox?: PixelBoundingBox;
  /** Bounded historical trajectory coordinates */
  trajectory: TrajectoryPoint[];
  /** Total number of successful detections associated with this track */
  detectionCount: number;
  /** Consecutive frames where this track was missed/occluded */
  missedFrames: number;
  /** Latest detection confidence score (0.0 to 1.0) */
  currentConfidence: number;
  /** Current lifecycle state */
  state: TrackState;
  /** Calculated movement direction based on recent trajectory kinematics */
  direction: MovementDirection;
  /** Total active duration on camera in seconds */
  dwellTimeSeconds: number;
  /** Traceable detection references that contributed to this track */
  contributingDetectionIds: string[];
  /** Model version used during detection */
  modelVersion: string;
}

export interface TrackingConfig {
  /** Minimum IoU threshold to consider association match (default 0.20) */
  iouThreshold: number;
  /** Maximum normalized centroid distance for spatial gating (default 0.25) */
  maxCentroidDistance: number;
  /** Weight factor for IoU in combined cost (0.0 to 1.0, default 0.6) */
  iouWeight: number;
  /** Maximum consecutive missed frames before track is declared ENDED (default 4) */
  maxMissedFrames: number;
  /** Frames missed before declaring TEMPORARILY_LOST (default 1) */
  missedFramesForLost: number;
  /** Maximum trajectory history points to retain (default 30) */
  maxTrajectoryPoints: number;
  /** Minimum movement distance (normalized) to differentiate from STATIONARY */
  minMovementThreshold: number;
  /** Retention duration for ended tracks in memory (default 300 seconds) */
  trackRetentionSeconds: number;
}

export interface TrackingPerformanceMetrics {
  detectionsReceived: number;
  tracksCreated: number;
  tracksActive: number;
  tracksEnded: number;
  associationOperations: number;
  lastTrackingLatencyMs: number;
  averageTrackingLatencyMs: number;
  framesProcessed: number;
}

export interface TrackingSubsystemHealth {
  status: 'READY' | 'DEGRADED' | 'ERROR';
  algorithm: string;
  algorithmDescription: string;
  config: TrackingConfig;
  metrics: TrackingPerformanceMetrics;
  activeCamerasCount: number;
  lastProcessedAt: string | null;
}

export type TrackingEventType = 'track.created' | 'track.updated' | 'track.lost' | 'track.ended';

export interface TrackingEvent {
  eventId: string;
  eventType: TrackingEventType;
  cameraId: string;
  timestamp: string;
  track: Track;
}

export interface TrackingStepResult {
  updatedTracks: Track[];
  createdTracks: Track[];
  lostTracks: Track[];
  endedTracks: Track[];
  associationOperations: number;
}

