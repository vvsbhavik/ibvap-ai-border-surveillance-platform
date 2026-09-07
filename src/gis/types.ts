/**
 * IBVAP — GIS Geospatial & Operational Map Type Definitions
 * Strict separation of authoritative geographic context, estimated coverage, and simulation provenance.
 */

import { CameraStatus, CameraType, AlertSeverity, IncidentStatus } from '../server/types';
import { MovementDirection } from '../tracking/types';

export type CameraSourceMode = 'LIVE' | 'SIMULATION';
export type CameraSourceStatus = 'LIVE' | 'SIMULATION' | 'OFFLINE' | 'DEGRADED' | 'UNAVAILABLE';

export interface GeographicCoordinate {
  latitude: number;
  longitude: number;
  elevationMeters?: number;
}

export interface CameraGeographicProfile {
  cameraId: string;
  cameraIdentifier: string;
  name: string;
  sectorId: string;
  sectorName: string;
  siteName: string;
  latitude: number;
  longitude: number;
  elevationMeters?: number;
  azimuthDegrees: number; // 0-360 degrees heading
  fieldOfViewDegrees: number; // FOV spread in degrees
  estimatedCoverageRadiusMeters: number; // Calibrated or estimated optical range
  cameraType: CameraType;
  capabilities: {
    hasANPR: boolean;
    hasThermal: boolean;
    hasFaceAnalytics: boolean;
    hasPTZ: boolean;
    hasNightAnalytics: boolean;
  };
  status: CameraStatus;
  sourceMode: CameraSourceMode;
  sourceStatus: CameraSourceStatus;
  trustScore: number; // 0 to 100
  trustStatus: 'HEALTHY' | 'DEGRADED' | 'STALE' | 'OFFLINE' | 'INTEGRITY_ANOMALY' | 'UNKNOWN';
  activeTracksCount: number;
  activeAlertsCount: number;
  lastFrameTimestamp?: string;
  frameAgeMs?: number;
  streamState: 'STREAM_AVAILABLE' | 'STREAM_UNAVAILABLE' | 'CONNECTING';
  isSimulated: boolean;
}

export interface MapSectorRegion {
  sectorId: string;
  code: string;
  name: string;
  description: string;
  centerLatitude: number;
  centerLongitude: number;
  boundaryPolygon: [number, number][]; // [lat, lon] tuples
  activeCamerasCount: number;
  activeAlertsCount: number;
  activeIncidentsCount: number;
}

export interface MapZonePolygon {
  zoneId: string;
  sectorId: string;
  sectorName: string;
  name: string;
  code: string;
  zoneType: 'RESTRICTED_BUFFER' | 'VIRTUAL_FENCE' | 'APPROACH_CORRIDOR' | 'CHECKPOINT' | 'MONITORING_AREA';
  coordinates: [number, number][]; // [lat, lon]
  sensitivityLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'MAXIMUM';
  isRestricted: boolean;
  currentOccupancy: number;
  color?: string;
}

export interface MapVirtualFenceLine {
  fenceId: string;
  sectorId: string;
  sectorName: string;
  name: string;
  coordinates: [number, number][]; // [lat, lon]
  direction: 'BIDIRECTIONAL' | 'LEFT_TO_RIGHT' | 'RIGHT_TO_LEFT' | 'ANY';
  sensitivityLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'MAXIMUM';
  color?: string;
}

export interface MapIncidentPin {
  incidentId: string;
  incidentNumber: string;
  title: string;
  severity: AlertSeverity;
  status: IncidentStatus;
  primaryCameraId: string;
  primaryCameraIdentifier: string;
  sectorId: string;
  sectorName: string;
  latitude: number;
  longitude: number;
  timestamp: string;
  activeTimeElapsedSeconds: number;
  summary: string;
  relatedCameraIdentifiers: string[];
}

export interface MapAlertPin {
  alertId: string;
  alertNumber: string;
  title: string;
  severity: AlertSeverity;
  status: string;
  cameraId: string;
  cameraIdentifier: string;
  sectorId: string;
  latitude: number;
  longitude: number;
  timestamp: string;
  reasoningPrimary: string;
}

export interface MapTopologyCorridor {
  edgeId: string;
  fromCameraId: string;
  toCameraId: string;
  fromCoords: { latitude: number; longitude: number };
  toCoords: { latitude: number; longitude: number };
  distanceMeters: number;
  minTransitSeconds: number;
  maxTransitSeconds: number;
  expectedDirection: MovementDirection | 'BIDIRECTIONAL';
  relationshipType: 'PHYSICAL_ADJACENCY' | 'EXPECTED_TRANSIT_ROUTE' | 'SECTOR_TRANSITION' | 'CHECKPOINT_CORRIDOR';
  isRestrictedTransition: boolean;
  routeDescription: string;
}

export interface MapReconstructedRoute {
  reconstructionId: string;
  entityType: 'VEHICLE' | 'PERSON';
  entityIdentifier: string; // Plate number or Track ID
  cameraSequence: string[];
  waypoints: {
    cameraId: string;
    cameraIdentifier: string;
    latitude: number;
    longitude: number;
    timestamp: string;
    elapsedSeconds: number;
  }[];
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  routeStatus: 'EXPECTED_ROUTE' | 'TIME_ANOMALY' | 'UNEXPECTED_SKIP' | 'DIRECTION_REVERSAL';
  anomaliesDetected: string[];
  isObserved: boolean; // True for observed route, false for theoretical topology
}

export interface GisOperationalContext {
  timestamp: string;
  isSimulatedData: boolean;
  provenanceLabel: 'SIMULATED MAP DATA' | 'LIVE OPERATIONAL DATA';
  bounds: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  };
  cameras: CameraGeographicProfile[];
  sectors: MapSectorRegion[];
  zones: MapZonePolygon[];
  fences: MapVirtualFenceLine[];
  incidents: MapIncidentPin[];
  alerts: MapAlertPin[];
  topologyCorridors: MapTopologyCorridor[];
  reconstructedRoutes: MapReconstructedRoute[];
  summary: {
    totalCameras: number;
    onlineCameras: number;
    degradedCameras: number;
    offlineCameras: number;
    anomalyCameras: number;
    activeIncidents: number;
    highPriorityAlerts: number;
  };
}
