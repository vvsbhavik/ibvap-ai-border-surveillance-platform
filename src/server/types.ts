// ============================================================================
// IBVAP Core Domain & Realtime Types
// ============================================================================

export type UserRole = 
  | 'SYSTEM_ADMINISTRATOR'
  | 'WATCH_COMMANDER'
  | 'SURVEILLANCE_OPERATOR'
  | 'EVIDENCE_INVESTIGATOR'
  | 'TECHNICAL_OPERATOR'
  // Backward-compatibility aliases
  | 'ADMINISTRATOR' 
  | 'FIELD_OPERATOR' 
  | 'FORENSIC_ANALYST' 
  | 'SECURITY_AUDITOR';

export type UserStatus = 'ACTIVE' | 'DISABLED' | 'LOCKED' | 'SUSPENDED' | 'DEACTIVATED';

export type PermissionKey =
  | 'dashboard.view'
  | 'camera.view'
  | 'camera.create'
  | 'camera.update'
  | 'camera.enable'
  | 'camera.disable'
  | 'camera.decommission'
  | 'camera.configure'
  | 'camera.stream.view'
  | 'camera.stream.test'
  | 'camera.stream.reconnect'
  | 'monitoring.view'
  | 'alert.view'
  | 'alert.acknowledge'
  | 'alert.dismiss'
  | 'incident.view'
  | 'incident.create'
  | 'incident.update'
  | 'incident.assign'
  | 'incident.escalate'
  | 'incident.resolve'
  | 'evidence.view'
  | 'evidence.verify'
  | 'evidence.export'
  | 'gis.view'
  | 'anpr.view'
  | 'anpr.search'
  | 'anpr.watchlist'
  | 'watchlist.view'
  | 'watchlist.create'
  | 'watchlist.update'
  | 'watchlist.delete'
  | 'copilot.use'
  | 'gemini_live.use'
  | 'system_health.view'
  | 'user.view'
  | 'user.create'
  | 'user.update'
  | 'user.disable'
  | 'role.view'
  | 'role.manage'
  | 'zone.view'
  | 'zone.create'
  | 'zone.update'
  | 'zone.activate'
  | 'zone.deactivate'
  | 'zone.delete'
  | 'audit.view'
  | 'system.configure';

export interface PermissionDefinition {
  key: PermissionKey;
  label: string;
  category: string;
  description: string;
}

export interface RoleDefinition {
  id: string;
  role: UserRole;
  name: string;
  description: string;
  permissions: PermissionKey[];
  isSystemRole?: boolean;
  assignedUsersCount?: number;
}

export interface Session {
  id: string;
  token: string;
  userId: string;
  userCallsign: string;
  userRole: UserRole;
  createdAt: string;
  expiresAt: string;
  lastActiveAt: string;
  ipAddress: string;
  userAgent?: string;
  isSimulated?: boolean;
}

export interface User {
  id: string;
  callsign: string;
  email: string;
  fullName: string;
  role: UserRole;
  badgeNumber: string;
  sectorAssignmentId?: string;
  status: UserStatus;
  lastLoginAt?: string;
  createdAt?: string;
  updatedAt?: string;
  isSimulated?: boolean;
  permissions?: PermissionKey[];
}

export type CameraStatus = 
  | 'ONLINE' 
  | 'DEGRADED' 
  | 'OFFLINE' 
  | 'INTEGRITY_ANOMALY' 
  | 'MAINTENANCE'
  | 'UNKNOWN';

export type CameraType = 
  | 'FIXED_OPTICAL' 
  | 'PTZ_OPTICAL' 
  | 'THERMAL_FIXED' 
  | 'DUAL_THERMAL_PTZ' 
  | 'RADAR_SLAVED_PTZ' 
  | 'ANPR_SPECIALIZED';

export type CameraProtocol = 'RTSP' | 'ONVIF';

export type AiCapabilityStatus = 'NOT_CONFIGURED' | 'CONFIGURED' | 'ACTIVE' | 'DISABLED';

export interface CameraAiAnalyticsConfig {
  personDetection: AiCapabilityStatus;
  vehicleDetection: AiCapabilityStatus;
  anpr: AiCapabilityStatus;
  faceAnalytics: AiCapabilityStatus;
  nightAnalytics: AiCapabilityStatus;
  behaviorAnalytics: AiCapabilityStatus;
}

export type CameraPermission = 
  | 'camera.view'
  | 'camera.create'
  | 'camera.update'
  | 'camera.enable'
  | 'camera.disable'
  | 'camera.decommission'
  | 'camera.configure'
  | 'camera.stream.view'
  | 'camera.stream.test'
  | 'camera.stream.reconnect';

export interface Camera {
  id: string;
  cameraId: string; // Unique business identifier e.g. CAM-01
  identifier: string; // Synced with cameraId for backward compatibility
  name: string;
  sectorId: string;
  sectorName?: string;
  siteName: string;
  latitude: number;
  longitude: number;
  cameraType: CameraType;
  resolution: string;
  fps: number;
  protocol: CameraProtocol;
  streamEndpointReference: string; // Sanitized URI or configuration reference
  credentialSecretRef?: string; // Secret vault reference token (never expose plaintext credentials)
  status: CameraStatus;
  aiAnalyticsStatus: CameraAiAnalyticsConfig;
  installationDate: string;
  description: string;
  createdAt: string;
  updatedAt: string;

  // Lifecycle & Decommissioning
  isDecommissioned?: boolean;
  decommissionedAt?: string;
  decommissionReason?: string;

  // Stream Configuration & Connection Diagnostics
  streamConfigStatus?: 'UNVALIDATED' | 'VALID' | 'INVALID' | 'UNAVAILABLE';
  connectionStatus?: 'CONNECTED' | 'DISCONNECTED' | 'UNCHECKED';

  // Sensor Diagnostics & Telemetry
  isSimulated?: boolean;
  currentFps?: number;
  currentLatencyMs?: number;
  lastHeartbeatAt?: string;
  statusDetail?: string;

  // Hardware, Optics & Mounting
  codec?: string;
  model?: string;
  firmwareVersion?: string;
  azimuthDegrees?: number;
  fieldOfViewDegrees?: number;
  isPtSupported?: boolean;
  aiPipelineEnabled?: boolean;
  thumbnailUrl?: string;

  // Spatial & Zone Associations
  zoneId?: string;
  zoneName?: string;
}

export interface Zone {
  id: string;
  sectorId: string;
  sectorName: string;
  code: string;
  name: string;
  zoneType: 'RESTRICTED_BUFFER' | 'VIRTUAL_FENCE' | 'APPROACH_CORRIDOR' | 'CHECKPOINT';
  coordinates: [number, number][]; // [lat, lng] array
  sensitivityLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'MAXIMUM';
}

export interface Sector {
  id: string;
  code: string;
  name: string;
  description: string;
  centerLatitude: number;
  centerLongitude: number;
  activeCamerasCount: number;
  activeAlertsCount: number;
}

export type AlertSeverity = 'INFORMATION' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type AlertStatus = 'PENDING_ACK' | 'ACKNOWLEDGED' | 'ESCALATED' | 'DISMISSED';

export interface AlertReasoningFactor {
  factor: string;
  weight: number; // 0.0 to 1.0
  verified: boolean;
  detail: string;
}

export interface Alert {
  id: string;
  alertNumber?: string;
  title: string;
  description: string;
  severity: AlertSeverity;
  status: AlertStatus;
  cameraId: string;
  cameraIdentifier: string;
  sectorId: string;
  sectorName: string;
  zoneId?: string;
  zoneName?: string;
  timestamp: string;
  detectedAt?: string;
  confidenceScore: number;
  reasoningFactors: AlertReasoningFactor[];
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  escalatedToIncidentId?: string;
  thumbnailUrl?: string;
  isSimulation?: boolean;
}

export type IncidentStatus = 'OPEN' | 'INVESTIGATING' | 'CONTAINED' | 'RESOLVED' | 'CLOSED';

export interface IncidentTimelineEntry {
  id: string;
  timestamp: string;
  actorCallsign: string;
  actionType: 'TRIGGER_ALARM' | 'OPERATOR_ACK' | 'COMMANDER_DISPATCH' | 'EVIDENCE_LOCKED' | 'ZONE_SEALED' | 'STATUS_CHANGE';
  description: string;
  metadata?: Record<string, unknown>;
}

export interface Incident {
  id: string;
  incidentNumber: string; // e.g. INC-2026-0814
  title: string;
  summary: string;
  severity: AlertSeverity;
  status: IncidentStatus;
  sectorId: string;
  sectorName: string;
  primaryCameraId: string;
  primaryCameraIdentifier: string;
  leadCommanderCallsign: string;
  createdAt: string;
  resolvedAt?: string;
  relatedCameraIdentifiers: string[];
  evidenceCount: number;
  containmentNotes?: string;
  timeline: IncidentTimelineEntry[];
}

export interface EvidenceItem {
  id: string;
  incidentId?: string;
  incidentNumber?: string;
  cameraId: string;
  cameraIdentifier: string;
  title: string;
  mediaType: 'VIDEO_CLIP' | 'HIGH_RES_STILL' | 'ANPR_CROP' | 'TELEMETRY_DUMP';
  fileSizeBytes: number;
  sha256Checksum: string;
  capturedStartAt: string;
  capturedEndAt: string;
  isVerified: boolean;
  chainOfCustodyCount: number;
  previewUrl?: string;
}

export interface AnprRecord {
  id: string;
  cameraId: string;
  cameraIdentifier: string;
  sectorName: string;
  plateNumber: string;
  vehicleType: string;
  vehicleColor: string;
  confidence: number;
  speedKmh?: number;
  isWatchlistMatch: boolean;
  watchlistCategory?: string;
  timestamp: string;
  thumbnailUrl?: string;
  isSimulation?: boolean;
}

export interface WatchlistEntry {
  id: string;
  targetType: 'VEHICLE' | 'PERSON';
  targetIdentifier: string;
  labelName: string;
  category: string;
  priority: AlertSeverity;
  notes: string;
  addedByCallsign: string;
  isActive: boolean;
  createdAt: string;
}

export type HealthStatus = 'HEALTHY' | 'DEGRADED' | 'OFFLINE' | 'UNKNOWN';

export interface SystemHealthItem {
  componentKey: string;
  name: string;
  status: HealthStatus;
  latencyMs: number;
  uptimePercentage: number;
  lastHeartbeat: string;
  details: string;
  metrics: {
    cpuPercent?: number;
    memoryPercent?: number;
    activeConnections?: number;
    errorRatePerMin?: number;
  };
}

export interface AuditLog {
  id: string;
  timestamp: string;
  userCallsign: string;
  operatorCallsign?: string;
  userRole?: string;
  action: string;
  resourceType: string;
  resourceId: string;
  result?: 'SUCCESS' | 'FAILURE' | 'DENIED';
  ipAddress: string;
  details: Record<string, unknown>;
  isSimulated?: boolean;
}

// Standard Realtime Event Envelope (Section 23 of Specs)
export interface RealtimeEventEnvelope<T = unknown> {
  eventId: string;
  eventType: string; // e.g. alert.new | camera.health | incident.updated
  timestamp: string;
  source: string;
  payload: T;
}

export * from '../spatial/types';
