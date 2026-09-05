/**
 * IBVAP — Automatic Number Plate Recognition (ANPR) Subsystem Types
 *
 * Strict separation of confidences:
 * - Vehicle detection confidence
 * - Plate detection confidence
 * - OCR recognition confidence
 * - Vehicle-to-plate association confidence
 */

import { BoundingBox, PixelBoundingBox, VehicleClass } from '../ai-inference/types';
import { MovementDirection } from '../tracking/types';

export type PlateRecognitionStatus =
  | 'DETECTED'     // Plate located, OCR not yet performed or in progress
  | 'CONFIRMED'    // Multi-frame consensus or high-confidence unambiguous OCR (> 0.85)
  | 'PROBABLE'     // Single or moderate-confidence read (0.65 - 0.85)
  | 'UNCERTAIN'    // Low-confidence read, ambiguous characters (0.40 - 0.65)
  | 'UNREADABLE';   // Plate region detected but characters unresolvable (< 0.40)

/**
 * Raw localized plate detection bounding box.
 */
export interface PlateDetection {
  plateDetectionId: string;
  cameraId: string;
  vehicleTrackId?: string;
  /** Normalized coordinates relative to full camera frame (0.0 - 1.0) */
  boundingBox: BoundingBox;
  /** Optional absolute pixel coordinates */
  pixelBox?: PixelBoundingBox;
  /** Normalized bounding box relative to vehicle bounding box (0.0 - 1.0) */
  relativeToVehicleBox?: BoundingBox;
  confidence: number;
  timestamp: string;
  frameReference?: string;
  sourceImagePath?: string;
}

/**
 * Individual character observation for multi-frame character voting.
 */
export interface CharacterObservation {
  char: string;
  confidence: number;
  positionIndex: number;
}

/**
 * Direct output from OCR recognition stage.
 */
export interface OcrResult {
  ocrId: string;
  plateDetectionId: string;
  cameraId: string;
  vehicleTrackId?: string;
  rawText: string;
  normalizedText: string;
  confidence: number;
  characterSequence: CharacterObservation[];
  timestamp: string;
  status: PlateRecognitionStatus;
  processingLatencyMs: number;
}

/**
 * Association metrics between vehicle track and plate detection.
 */
export interface VehiclePlateAssociation {
  vehicleTrackId: string;
  plateDetectionId: string;
  associationConfidence: number;
  /** Fraction of plate bounding box contained inside vehicle bounding box */
  containmentRatio: number;
  /** Distance between plate center and vehicle bottom quadrant center */
  spatialDistance: number;
  temporalDeltaMs: number;
  timestamp: string;
  isValid: boolean;
  rejectionReason?: string;
}

/**
 * Individual historical observation of a plate associated with a vehicle track.
 */
export interface PlateObservation {
  observationId: string;
  frameReference?: string;
  timestamp: string;
  plateDetectionId: string;
  rawText: string;
  normalizedText: string;
  plateConfidence: number;
  ocrConfidence: number;
  associationConfidence: number;
  characterSequence: CharacterObservation[];
  boundingBox: BoundingBox;
  recognitionStatus: PlateRecognitionStatus;
}

/**
 * Track-persistent ANPR aggregate record.
 * Tied 1:1 with the vehicle's persistent Track ID.
 */
export interface PersistentVehicleAnprRecord {
  /** Stable vehicle track ID (e.g. VEH-CAM-09-0001) */
  vehicleTrackId: string;
  cameraId: string;
  cameraIdentifier: string;
  vehicleClass: VehicleClass;
  firstSeenAt: string;
  lastSeenAt: string;
  observationCount: number;

  /** Best recognized plate string across frames */
  bestPlateText: string;
  /** Raw text corresponding to best recognized plate */
  rawPlateText: string;
  /** Normalized canonical plate (e.g. uppercase, whitespace-stripped) */
  normalizedPlate: string;

  /** Separated confidences */
  vehicleConfidence: number;
  plateDetectionConfidence: number;
  ocrConfidence: number;
  associationConfidence: number;
  overallConfidence: number;

  recognitionStatus: PlateRecognitionStatus;

  /** Multi-frame observation history for this vehicle track */
  observations: PlateObservation[];

  /** Spatial context at latest observation */
  spatialContext?: {
    zoneId?: string;
    zoneName?: string;
    recentZoneId?: string;
    isInsideRestrictedZone?: boolean;
    lastFenceCrossed?: string;
    direction?: MovementDirection;
    dwellTimeSeconds?: number;
    sectorId?: string;
    sectorName?: string;
  };

  /** Watchlist evaluation */
  isWatchlistMatch?: boolean;
  watchlistCategory?: string;
  watchlistEntryId?: string;

  /** Evidence reference */
  evidenceReference?: {
    evidenceId?: string;
    frameReference?: string;
    mediaType?: 'ANPR_CROP' | 'HIGH_RES_STILL' | 'VIDEO_CLIP';
    thumbnailUrl?: string;
  };

  /** Test / synthetic marker */
  isSimulation?: boolean;
}

/**
 * ANPR Event types emitted by the system
 */
export type AnprEventType =
  | 'anpr.plate.detected'
  | 'anpr.recognition.updated'
  | 'anpr.recognition.confirmed'
  | 'anpr.recognition.uncertain'
  | 'anpr.vehicle.associated';

/**
 * Structured ANPR Event envelope
 */
export interface AnprEvent {
  eventId: string;
  eventType: AnprEventType;
  cameraId: string;
  vehicleTrackId: string;
  plateDetectionId: string;
  timestamp: string;
  plateText: string;
  normalizedPlate: string;
  recognitionStatus: PlateRecognitionStatus;
  confidence: {
    vehicle: number;
    plate: number;
    ocr: number;
    association: number;
    overall: number;
  };
  vehicleClass: VehicleClass;
  position: BoundingBox;
  spatialContext?: PersistentVehicleAnprRecord['spatialContext'];
  evidenceReference?: PersistentVehicleAnprRecord['evidenceReference'];
  isSimulation?: boolean;
}

/**
 * ANPR query and search filters
 */
export interface AnprQueryFilter {
  plate?: string;
  normalizedPlate?: string;
  vehicleTrackId?: string;
  cameraId?: string;
  vehicleClass?: VehicleClass | string;
  recognitionStatus?: PlateRecognitionStatus | 'ALL';
  watchlistOnly?: boolean;
  startTime?: string;
  endTime?: string;
  minConfidence?: number;
  limit?: number;
  offset?: number;
}

export interface AnprConfig {
  enabled: boolean;
  minVehicleConfidenceForAnpr: number;
  minPlateConfidence: number;
  minOcrConfidenceConfirmed: number;
  minOcrConfidenceProbable: number;
  maxAssociationDistance: number;
  minContainmentRatio: number;
  consensusMaxFrames: number;
  throttleFramesPerTrack: number;
}
