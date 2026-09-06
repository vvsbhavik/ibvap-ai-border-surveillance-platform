/**
 * IBVAP — Cross-Camera Intelligence & Advanced Border Analytics Domain Types
 *
 * Grounded cross-camera correlation, camera topology graph, movement reconstruction,
 * observable analytics rules (night, dwell, fence, direction, restricted hours,
 * interactions, groups, repeated observations), and operational timelines.
 */

import { DetectedObjectType, VehicleClass } from '../ai-inference/types';
import { MovementDirection } from '../tracking/types';
import { SpatialCrossingDirection, SpatialZoneType } from '../spatial/types';
import { AlertSeverity } from '../server/types';

/**
 * Fundamental ontological distinction enforced across IBVAP:
 * - OBSERVATION: Discrete sensor capture on a single camera (track, plate crop, face capture)
 * - CORRELATION: Probabilistic association across sensors based on observable evidence
 * - IDENTITY: Confirmed real-world subject or registered legal identity (requires validated external authority)
 */
export type IntelligenceLevel = 'OBSERVATION' | 'CORRELATION' | 'IDENTITY';

/**
 * Explicit source data provenance.
 */
export type SourceProvenance = 'LIVE' | 'SIMULATION' | 'TEST_DATA';

/**
 * Supported correlation methods with separated confidence accounting.
 */
export type CorrelationMethod =
  | 'PLATE_MATCH'
  | 'FACE_MATCH'
  | 'TEMPORAL_PROXIMITY'
  | 'CAMERA_ROUTE_ADJACENCY'
  | 'VEHICLE_CLASS_MATCH'
  | 'DIRECTIONAL_CONTINUITY'
  | 'TRACK_TIMING'
  | 'SPATIAL_ROUTE_COMPATIBILITY'
  | 'MULTI_FACTOR';

/**
 * Evaluated confidence level for cross-camera correlation.
 */
export type CorrelationConfidenceLevel =
  | 'HIGH_CONFIDENCE_CORRELATION'
  | 'MODERATE_CONFIDENCE_CORRELATION'
  | 'LOW_CONFIDENCE_CORRELATION'
  | 'UNVERIFIED_HYPOTHESIS';

/**
 * Supported correlated entity types.
 */
export type CorrelatedEntityType = 'PERSON' | 'VEHICLE' | 'PLATE' | 'FACE_OBSERVATION';

/**
 * Individual observation node contributing to a cross-camera timeline.
 */
export interface CorrelatedObservation {
  observationId: string;
  cameraId: string;
  cameraIdentifier: string;
  sectorId: string;
  sectorName: string;
  trackId: string;
  entityType: CorrelatedEntityType;
  timestamp: string;
  dwellSeconds?: number;
  direction?: MovementDirection | string;
  zoneId?: string;
  zoneName?: string;
  zoneType?: SpatialZoneType;
  fenceCrossed?: string;
  plateText?: string;
  plateConfidence?: number;
  faceQuality?: string;
  faceMatchScore?: number;
  watchlistMatch?: boolean;
  detectorConfidence: number;
  evidenceRef?: {
    evidenceId?: string;
    mediaType?: string;
    thumbnailUrl?: string;
  };
  provenance: SourceProvenance;
}

/**
 * Cross-Camera Correlation record between two or more camera observations.
 */
export interface CrossCameraCorrelation {
  correlationId: string;
  sourceCameraId: string;
  targetCameraId: string;
  sourceTrackId: string;
  targetTrackId: string;
  entityType: CorrelatedEntityType;
  correlationMethod: CorrelationMethod;
  confidenceLevel: CorrelationConfidenceLevel;
  confidenceScore: number; // 0.0 to 1.0 (separate from detector confidence)
  firstObservedAt: string;
  lastObservedAt: string;
  elapsedSeconds: number;
  sourceMode: SourceProvenance;
  observations: CorrelatedObservation[];
  involvedCameras: string[];
  involvedSectors: string[];
  relatedANPRObservation?: {
    plateNumber: string;
    normalizedPlate: string;
    recognitionStatus: string;
    isWatchlistMatch: boolean;
  };
  relatedFaceObservation?: {
    faceDetectionId: string;
    recognitionStatus: string;
    isWatchlistMatch: boolean;
    similarityScore?: number;
  };
  relatedZones: string[];
  directionSummary: string;
  evidenceReferences: string[];
  reasoningFactors: {
    factor: string;
    evidence: string;
    confidenceDelta: number;
  }[];
  isAlertElevated?: boolean;
  associatedAlertId?: string;
  associatedIncidentId?: string;
  provenance: SourceProvenance;
}

/**
 * Camera Graph Topology node representing an authoritative physical mast.
 */
export interface CameraGraphNode {
  cameraId: string;
  cameraIdentifier: string;
  name: string;
  sectorId: string;
  sectorName: string;
  latitude: number;
  longitude: number;
  cameraType: string;
  status: string;
  hasANPR: boolean;
  hasThermal: boolean;
  hasFaceAnalytics: boolean;
  isPtSupported: boolean;
}

/**
 * Directed camera relationship representing physical adjacency or transit routes.
 */
export interface CameraGraphEdge {
  edgeId: string;
  fromCameraId: string;
  toCameraId: string;
  relationshipType: 'PHYSICAL_ADJACENCY' | 'EXPECTED_TRANSIT_ROUTE' | 'SECTOR_TRANSITION' | 'CHECKPOINT_CORRIDOR';
  distanceMeters: number;
  minTransitSeconds: number;
  maxTransitSeconds: number;
  expectedDirection: MovementDirection | 'BIDIRECTIONAL';
  routeDescription: string;
  isRestrictedTransition: boolean;
}

/**
 * Topology model connecting cameras along the border sector grid.
 */
export interface CameraGraph {
  nodes: CameraGraphNode[];
  edges: CameraGraphEdge[];
  updatedAt: string;
}

/**
 * Chronological movement reconstruction for a vehicle.
 */
export interface VehicleMovementReconstruction {
  reconstructionId: string;
  queryTrackId?: string;
  plateNumber?: string;
  queryTimeRange: { start: string; end: string };
  camerasObserved: {
    cameraId: string;
    cameraIdentifier: string;
    timestamp: string;
    dwellSeconds: number;
    direction: string;
    zoneName?: string;
  }[];
  timeline: CorrelatedObservation[];
  routeSequence: string[]; // e.g. ['CAM-01', 'CAM-02', 'CAM-04']
  zonesTraversed: string[];
  fenceInteractions: {
    fenceId: string;
    cameraId: string;
    crossedAt: string;
    direction: string;
  }[];
  plateObservations: {
    cameraId: string;
    plateText: string;
    confidence: number;
    timestamp: string;
  }[];
  totalTransitSeconds: number;
  correlationConfidence: number;
  provenance: SourceProvenance;
  disclaimer: 'Reconstructed from discrete camera observations. Continuous GPS tracking is not implied.';
}

/**
 * Chronological movement reconstruction for a person.
 */
export interface PersonMovementReconstruction {
  reconstructionId: string;
  queryTrackId?: string;
  faceObservationId?: string;
  queryTimeRange: { start: string; end: string };
  camerasObserved: {
    cameraId: string;
    cameraIdentifier: string;
    timestamp: string;
    dwellSeconds: number;
    direction: string;
    zoneName?: string;
  }[];
  timeline: CorrelatedObservation[];
  routeSequence: string[];
  zonesTraversed: string[];
  fenceInteractions: {
    fenceId: string;
    cameraId: string;
    crossedAt: string;
    direction: string;
  }[];
  faceObservations?: {
    cameraId: string;
    quality: string;
    recognitionStatus: string;
    similarityScore?: number;
    isWatchlistMatch?: boolean;
    timestamp: string;
  }[];
  totalTransitSeconds: number;
  correlationConfidence: number;
  provenance: SourceProvenance;
  disclaimer: 'Designated as PERSON TRACK. Real-world identity is not assigned without authoritative legal confirmation.';
}

/**
 * Result of route sequence and transit timing analysis.
 */
export interface RouteAnalysisResult {
  routeId: string;
  entityId: string;
  entityType: CorrelatedEntityType;
  observedSequence: string[];
  expectedTransitions: {
    fromCamera: string;
    toCamera: string;
    isExpected: boolean;
    expectedTransitRangeSeconds: [number, number];
    actualElapsedSeconds: number;
    status: 'NORMAL_TRANSIT' | 'ANOMALOUS_DELAY' | 'UNEXPECTED_TRANSITION' | 'SKIPPED_CAMERA';
  }[];
  directionConsistency: 'CONSISTENT' | 'REVERSING' | 'ERRATIC';
  overallStatus: 'EXPECTED_ROUTE' | 'ROUTE_ANOMALY' | 'UNEXPECTED_CAMERA_TRANSITION';
  totalDurationSeconds: number;
  anomaliesDetected: string[];
  provenance: SourceProvenance;
}

/**
 * Types of observable advanced analytics events.
 */
export type AdvancedAnalyticsEventType =
  | 'night.person.detected'
  | 'night.vehicle.detected'
  | 'night.zone.entry'
  | 'loitering.observed'
  | 'fence.repeated_crossing'
  | 'direction.anomaly'
  | 'restricted_hours.person_entry'
  | 'restricted_hours.vehicle_entry'
  | 'person_vehicle.interaction.observed'
  | 'group.activity.observed'
  | 'entity.repeated_observation';

/**
 * Unified observable advanced analytics event record.
 */
export interface AdvancedAnalyticsEvent {
  eventId: string;
  eventType: AdvancedAnalyticsEventType;
  timestamp: string;
  cameraId: string;
  cameraIdentifier: string;
  sectorId: string;
  sectorName: string;
  trackId?: string;
  objectType: 'person' | 'vehicle' | 'group' | 'multi_entity';
  zoneId?: string;
  zoneName?: string;
  severity: AlertSeverity;
  ruleId: string;
  ruleName: string;
  triggerReason: string;
  observableMetrics: {
    dwellSeconds?: number;
    crossingCount?: number;
    expectedDirection?: string;
    observedDirection?: string;
    groupSize?: number;
    observationCount?: number;
    timeWindowMinutes?: number;
    configuredWindow?: string;
    distanceMeters?: number;
    interactingTrackIds?: string[];
  };
  reasoningFactors: {
    factor: string;
    detail: string;
    weight: number;
  }[];
  isAlertElevated: boolean;
  associatedAlertId?: string;
  associatedIncidentId?: string;
  evidenceRef?: {
    evidenceId?: string;
    thumbnailUrl?: string;
  };
  provenance: SourceProvenance;
}

/**
 * Configurable parameters for observable analytics rules.
 */
export interface ObservableRuleConfig {
  nightHours: {
    enabled: boolean;
    startHour: number; // 22 for 22:00
    endHour: number;   // 5 for 05:00
  };
  loitering: {
    enabled: boolean;
    personDwellThresholdSeconds: number; // default 120s
    vehicleDwellThresholdSeconds: number; // default 180s
  };
  repeatedFence: {
    enabled: boolean;
    thresholdCrossings: number; // default 2
    timeWindowSeconds: number;  // default 600s
  };
  directionAnomaly: {
    enabled: boolean;
    strictCorridorEnforcement: boolean;
  };
  restrictedHours: {
    enabled: boolean;
    startHour: number; // 0 for 00:00
    endHour: number;   // 5 for 05:00
  };
  personVehicleInteraction: {
    enabled: boolean;
    maxInteractionDistanceNormalized: number; // default 0.15
    minProximitySeconds: number; // default 15s
  };
  groupActivity: {
    enabled: boolean;
    minGroupSize: number; // default 3
    zoneConcentrationWindowSeconds: number; // default 60s
  };
  repeatedObservations: {
    enabled: boolean;
    minAppearances: number; // default 3
    windowMinutes: number;  // default 60
  };
}
