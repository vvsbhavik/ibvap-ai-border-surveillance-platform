/**
 * IBVAP Spatial Rules & Zone Intelligence Type Definitions
 * Strict camera-scoped spatial evaluation, normalized geometries, and track-derived events.
 */

export type SpatialZoneType =
  | 'RESTRICTED_AREA'
  | 'MONITORING_AREA'
  | 'OBSERVATION_AREA'
  | 'BUFFER_ZONE'
  | 'CUSTOM';

export type SpatialGeometryType = 'POLYGON' | 'LINE';

export type FenceDirection =
  | 'BIDIRECTIONAL'
  | 'LEFT_TO_RIGHT'
  | 'RIGHT_TO_LEFT'
  | 'ANY';

export type SpatialCrossingDirection = FenceDirection;

export interface NormalizedPoint {
  x: number; // 0.0 to 1.0 relative to camera frame width
  y: number; // 0.0 to 1.0 relative to camera frame height
}

export interface ZoneSchedule {
  allTimes?: boolean;
  activeHours?: {
    start: string; // HH:mm format, e.g. "08:00"
    end: string;   // HH:mm format, e.g. "20:00"
  };
  daysOfWeek?: number[]; // 0 = Sunday, 1 = Monday, etc.
}

export interface SpatialZone {
  zoneId: string;
  cameraId: string;
  cameraIdentifier?: string;
  name: string;
  description?: string;
  type: SpatialZoneType;
  geometry: SpatialGeometryType;
  coordinates: NormalizedPoint[];
  active: boolean;
  direction?: FenceDirection;
  schedule?: ZoneSchedule;
  color?: string; // Hex color for custom rendering
  isRestricted?: boolean;
  dwellThresholdSeconds?: number;
  sectorId?: string;
  sectorName?: string;
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  currentOccupants?: string[];
  dwellWarningSeconds?: number;
  maxDwellSeconds?: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type SpatialEventType =
  | 'zone.entered'
  | 'zone.exited'
  | 'zone.dwell'
  | 'zone.dwell_warning'
  | 'fence.crossed'
  | 'vehicle.zone.entered'
  | 'vehicle.zone.exited'
  | 'vehicle.zone.dwell'
  | 'vehicle.zone.dwell_warning'
  | 'vehicle.fence.crossed';

export interface SpatialEvent {
  eventId: string;
  eventType: SpatialEventType;
  timestamp: string;
  cameraId: string;
  cameraIdentifier?: string;
  trackId: string;
  numericId?: number;
  zoneId: string;
  zoneName: string;
  zoneType: SpatialZoneType;
  geometryType: SpatialGeometryType;
  objectType: 'person' | 'vehicle' | string;
  vehicleClass?: string;
  position: NormalizedPoint;
  direction?: string; // e.g. 'EAST', 'NORTHEAST'
  crossingDirection?: 'LEFT_TO_RIGHT' | 'RIGHT_TO_LEFT' | 'FORWARD' | 'BACKWARD';
  dwellTimeSeconds?: number;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  isViolation?: boolean;
  metadata?: Record<string, unknown>;
}

export interface TrackSpatialState {
  trackId: string;
  cameraId: string;
  activeZones: Map<string, { enteredAt: string; enteredTimestampMs: number; dwellWarningEmitted?: boolean }>;
  lastFenceCrossing: Map<string, { crossedAt: string; timestampMs: number; direction: string }>;
  lastAnchorPoint?: NormalizedPoint;
  lastUpdated: string;
}

export interface ZoneOccupancy {
  zoneId: string;
  cameraId: string;
  zoneName: string;
  currentOccupants: number;
  occupantTrackIds: string[];
  personOccupants: number;
  vehicleOccupants: number;
  totalOccupants: number;
  personTrackIds: string[];
  vehicleTrackIds: string[];
  oldestOccupantAt: string | null;
  updatedAt: string;
}

export interface SpatialEngineMetrics {
  totalEvaluations: number;
  activeTracksTracked: number;
  totalZoneEntries: number;
  totalZoneExits: number;
  totalFenceCrossings: number;
  eventsEmitted: number;
  avgLatencyMs: number;
  lastEvaluatedAt?: string;
}

export type SpatialPerformanceMetrics = SpatialEngineMetrics;

