/**
 * IBVAP — Camera Trust, Operational Integrity & Health Telemetry Types
 * Enforces explainable, measurable scoring without simulated hype or arbitrary numbers.
 */

export type CameraTrustStatus =
  | 'HEALTHY'
  | 'DEGRADED'
  | 'STALE'
  | 'OFFLINE'
  | 'INTEGRITY_ANOMALY'
  | 'UNKNOWN';

export type CameraStreamState =
  | 'STREAM_AVAILABLE'
  | 'STREAM_UNAVAILABLE'
  | 'CONNECTING';

export type CameraProcessingState =
  | 'IDLE'
  | 'INFERENCE_ACTIVE'
  | 'ANALYTICS_PAUSED'
  | 'STREAM_INTERRUPTED';

export interface CameraTrustReasoningFactor {
  factorKey: string;
  factorName: string;
  weight: number; // 0.0 to 1.0 (sum of weights = 1.0)
  rawScore: number; // 0.0 to 1.0
  deductionPoints: number; // 0 to 100
  status: 'OPTIMAL' | 'DEGRADED' | 'FAILED' | 'NOT_AVAILABLE';
  observableEvidence: string;
}

export interface MeasurableCameraTelemetry {
  cameraId: string;
  cameraIdentifier: string;
  lastFrameTimestamp: string | null; // ISO string or null
  frameAgeMs: number | null; // Measured milliseconds or null
  streamState: CameraStreamState;
  reconnectCount: number;
  recentReconnectsLast5Min: number;
  currentResolution: string | 'NOT AVAILABLE';
  configuredResolution: string;
  resolutionMismatch: boolean;
  processingState: CameraProcessingState;
  isFrozenFrameDetected: boolean;
  repeatedFrameCount: number;
  unauthorizedAngleShiftDetected: boolean;
  measuredAzimuthDegrees: number | null;
  configuredAzimuthDegrees: number;
  telemetryCapturedAt: string;
}

export interface CameraTrustEvaluation {
  cameraId: string;
  cameraIdentifier: string;
  trustScore: number; // 0 to 100
  trustLevel: 'HIGH_TRUST' | 'MODERATE_TRUST' | 'LOW_TRUST' | 'UNTRUSTED';
  status: CameraTrustStatus;
  statusLabel: string; // e.g. "CAMERA INTEGRITY ANOMALY — VERIFICATION REQUIRED"
  isVerificationRequired: boolean;
  factors: CameraTrustReasoningFactor[];
  measurableTelemetry: MeasurableCameraTelemetry;
  lastEvaluatedAt: string;
  previousStatus?: CameraTrustStatus;
  statusChangedAt: string;
  activeAnomalies: string[];
}

export type CameraTrustEventType =
  | 'camera.online'
  | 'camera.offline'
  | 'camera.degraded'
  | 'camera.stale'
  | 'camera.integrity_anomaly'
  | 'camera.recovered';

export interface CameraTrustEvent {
  eventId: string;
  eventType: CameraTrustEventType;
  cameraId: string;
  cameraIdentifier: string;
  sectorId: string;
  sectorName: string;
  timestamp: string;
  previousStatus: CameraTrustStatus;
  currentStatus: CameraTrustStatus;
  trustScore: number;
  observableReason: string;
  evidenceFactors: string[];
  associatedIncidentId?: string;
  isSimulated: boolean;
}
