/**
 * IBVAP — Face Analytics Core Domain Types
 *
 * Types for face detection, quality metrics, person-track association,
 * feature embedding references, multi-frame consensus, synthetic watchlist correlation,
 * and structured event telemetry.
 */

import { BoundingBox, PixelBoundingBox } from '../ai-inference/types';

/**
 * Qualitative state of a detected face based on optical and spatial metrics.
 */
export type FaceQualityState = 'GOOD' | 'ACCEPTABLE' | 'POOR' | 'UNREADABLE';

/**
 * Operational biometric recognition / watchlist status.
 */
export type FaceRecognitionStatus =
  | 'UNKNOWN'
  | 'POSSIBLE_MATCH'
  | 'MATCHED'
  | 'LOW_QUALITY'
  | 'UNREADABLE';

/**
 * Standardized face detection payload produced by the detector.
 */
export interface FaceDetection {
  faceDetectionId: string;
  cameraId: string;
  cameraIdentifier?: string;
  personTrackId?: string;
  boundingBox: BoundingBox;
  pixelBox?: PixelBoundingBox;
  confidence: number;
  timestamp: string;
  frameId?: string;
  modelVersion: string;
  isSimulation?: boolean;
}

/**
 * Detailed optical and spatial quality metrics evaluated for a face region.
 */
export interface FaceQualityMetrics {
  score: number; // 0.0 to 1.0 composite quality score
  qualityState: FaceQualityState;
  faceSize: {
    normalizedWidth: number;
    normalizedHeight: number;
    pixelWidth?: number;
    pixelHeight?: number;
    isSufficientSize: boolean;
  };
  blur: {
    sharpnessScore: number; // 0.0 to 1.0
    isSharp: boolean;
  };
  illumination: {
    luminanceScore: number; // 0.0 to 1.0
    isAdequate: boolean;
  };
  pose: {
    yawDegrees: number;
    pitchDegrees: number;
    rollDegrees: number;
    isFrontal: boolean;
  };
  occlusion: {
    occlusionScore: number; // 0.0 (unoccluded) to 1.0 (fully occluded)
    isOccluded: boolean;
  };
  detectorConfidence: number;
  reasons: string[];
}

/**
 * Geometric and temporal evaluation of associating a face detection to a person track.
 */
export interface PersonFaceAssociation {
  isValid: boolean;
  personTrackId: string;
  faceDetectionId: string;
  containmentRatio: number;
  verticalRatio: number;
  centroidDistance: number;
  associationConfidence: number;
  rejectionReason?: string;
}

/**
 * Reference to an extracted facial feature embedding vector or biometric template.
 */
export interface FaceEmbeddingRef {
  faceTemplateId: string;
  embeddingVersion: string;
  modelVersion: string;
  vectorLength: number;
  createdAt: string;
  featureHash?: string;
}

/**
 * Individual frame-level face observation linked to a Person Track.
 */
export interface FaceObservation {
  observationId: string;
  faceDetectionId: string;
  personTrackId: string;
  cameraId: string;
  cameraIdentifier?: string;
  timestamp: string;
  boundingBox: BoundingBox;
  pixelBox?: PixelBoundingBox;
  detectorConfidence: number;
  quality: FaceQualityMetrics;
  recognitionStatus: FaceRecognitionStatus;
  embeddingRef?: FaceEmbeddingRef;
  similarityScore?: number;
  matchingThreshold?: number;
  isWatchlistMatch?: boolean;
  watchlistEntryId?: string;
  watchlistDisplayName?: string;
  watchlistCategory?: string;
  watchlistExternalRef?: string;
  spatialContext?: {
    zoneId?: string;
    zoneName?: string;
    isRestricted?: boolean;
    lastFenceCrossed?: string;
    dwellTimeSeconds?: number;
    sectorId?: string;
    sectorName?: string;
    direction?: string;
  };
  evidenceReference?: {
    evidenceId?: string;
    frameReference?: string;
    cropUrl?: string;
  };
  isSimulation?: boolean;
}

/**
 * Persistent face analytics dossier aggregated across multiple frames for a Person Track.
 */
export interface PersistentPersonFaceRecord {
  personTrackId: string;
  cameraId: string;
  cameraIdentifier?: string;
  primaryFaceDetectionId: string;
  bestQuality: FaceQualityState;
  bestQualityScore: number;
  recognitionStatus: FaceRecognitionStatus;
  observationsCount: number;
  observations: FaceObservation[];
  bestObservation: FaceObservation;
  isWatchlistMatch: boolean;
  watchlistEntryId?: string;
  watchlistDisplayName?: string;
  watchlistCategory?: string;
  similarityScore?: number;
  matchingThreshold: number;
  firstSeenAt: string;
  lastSeenAt: string;
  spatialContext?: FaceObservation['spatialContext'];
  evidenceReference?: FaceObservation['evidenceReference'];
  isSimulation?: boolean;
}

/**
 * Synthetic / Authoritative watchlist record for face recognition correlation.
 */
export interface FaceWatchlistEntry {
  id: string;
  displayName: string;
  category: 'PERSON_OF_INTEREST' | 'EXPELLED_INDIVIDUAL' | 'AUTHORIZED_BORDER_STAFF' | 'HIGH_RISK_WARRANT';
  externalReference: string;
  faceTemplateId: string;
  embeddingVersion: string;
  modelVersion: string;
  threshold: number; // e.g. 0.82
  status: 'ACTIVE' | 'INACTIVE';
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  notes: string;
  thumbnailUrl?: string;
  createdAt: string;
  updatedAt: string;
  isSynthetic: true;
}

/**
 * Structured face analytics lifecycle events.
 */
export type FaceEventType =
  | 'face.detected'
  | 'face.observation.updated'
  | 'face.match.possible'
  | 'face.match.confirmed'
  | 'face.match.rejected'
  | 'face.quality.low';

export interface FaceEvent {
  eventId: string;
  eventType: FaceEventType;
  timestamp: string;
  cameraId: string;
  cameraIdentifier?: string;
  personTrackId: string;
  faceDetectionId: string;
  watchlistEntryId?: string;
  watchlistDisplayName?: string;
  similarity?: number;
  confidence: number;
  quality: FaceQualityState;
  recognitionStatus: FaceRecognitionStatus;
  zoneId?: string;
  spatialContext?: FaceObservation['spatialContext'];
  evidenceReference?: FaceObservation['evidenceReference'];
  details?: Record<string, unknown>;
  isSimulation?: boolean;
}

export interface FaceConfig {
  enabled: boolean;
  minPersonConfidenceForFace: number; // default 0.40
  minFaceConfidence: number; // default 0.50
  minQualityScoreAcceptable: number; // default 0.55
  minQualityScoreGood: number; // default 0.75
  matchThresholdConfirmed: number; // default 0.82
  matchThresholdPossible: number; // default 0.70
  maxAssociationDistance: number; // default 0.35
  minContainmentRatio: number; // default 0.60
  maxObservationsPerTrack: number; // default 30
  throttleFramesPerTrack: number; // default 2
}

export interface FaceQueryFilter {
  cameraId?: string;
  personTrackId?: string;
  recognitionStatus?: FaceRecognitionStatus;
  quality?: FaceQualityState;
  isWatchlistMatch?: boolean;
  watchlistCategory?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
}
