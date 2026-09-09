/**
 * IBVAP Video Gateway & RTSP Pipeline Type Definitions
 * Strict separation of concerns, credential safety, and bounded memory design.
 */

export type CameraSourceMode = 'LIVE' | 'SIMULATION' | 'OFFLINE' | 'UNAVAILABLE';
export type CameraSourceType = 'WEBCAM' | 'HLS' | 'WEBRTC' | 'RTSP' | 'RTSPS' | 'SIMULATED';
export type AiProcessingStatus = 'READY' | 'DEGRADED' | 'UNAVAILABLE' | 'STANDBY';

export type StreamConnectionState =
  | 'CONFIGURED'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'ONLINE'
  | 'DEGRADED'
  | 'RECONNECTING'
  | 'OFFLINE'
  | 'DISCONNECTED'
  | 'ERROR';

export type StreamHealthState =
  | 'HEALTHY'
  | 'DEGRADED'
  | 'OFFLINE'
  | 'UNKNOWN';

export type StreamFailureMode =
  | 'NONE'
  | 'DISCONNECT'
  | 'TIMEOUT'
  | 'FROZEN'
  | 'SLOW'
  | 'RECONNECT_FAILURE';

export type SyntheticTestScene =
  | 'EMPTY'
  | 'PERSON_SOLITARY'
  | 'PERSON_STATIC'
  | 'PERSON_MOVING'
  | 'PERSON_DISAPPEARS_TEMPORARILY'
  | 'TWO_PERSONS_CROSSING'
  | 'PERSON_CROSSING'
  | 'PERSON_OUTSIDE_ZONE'
  | 'PERSON_ENTERING_ZONE'
  | 'PERSON_EXITING_ZONE'
  | 'PERSON_CROSSING_FENCE'
  | 'PERSON_PARALLEL_TO_FENCE'
  | 'PERSON_TOUCHING_FENCE_BUT_NOT_CROSSING'
  | 'TEMPORARY_OCCLUSION_NEAR_ZONE'
  | 'VEHICLE_SOLITARY'
  | 'VEHICLE_MOVING'
  | 'VEHICLE_AND_PERSON'
  | 'MULTIPLE_VEHICLES'
  | 'VEHICLE_ENTERING_ZONE'
  | 'VEHICLE_CROSSING_FENCE';

export interface RawFrame {
  cameraId: string;
  timestamp: string;
  sequenceNumber: number;
  width: number;
  height: number;
  format: 'svg+xml' | 'jpeg';
  dataUri: string;
  sizeBytes: number;
  isSynthetic: boolean;
  frameBuffer?: Buffer;
  sourceImagePath?: string;
  metadata?: {
    cameraName?: string;
    sectorName?: string;
    cameraType?: string;
    fps?: number;
    latencyMs?: number;
    opticalCoordinates?: string;
    palette?: string;
    testScene?: SyntheticTestScene;
    sourceMode?: CameraSourceMode;
    [key: string]: any;
  };
}

export interface StreamTelemetry {
  cameraId: string;
  cameraIdentifier: string;
  connectionState: StreamConnectionState;
  healthState: StreamHealthState;
  currentFps: number;
  nominalFps: number;
  currentLatencyMs: number | null;
  lastFrameTimestamp: string | null;
  lastHeartbeatAt: string;
  framesAcquiredTotal: number;
  framesDroppedTotal: number;
  reconnectAttempts: number;
  maxReconnectAttempts: number;
  nextRetryAt: string | null;
  lastError: {
    message: string;
    timestamp: string;
    code?: string;
  } | null;
  streamEndpointReference: string;
  protocol: string;
  codec: string;
  resolution: string;
  isSimulated: boolean;
  sourceMode: CameraSourceMode;
  sourceType: CameraSourceType;
  browserStreamUrl?: string;
  sourceAttribution?: string;
  aiProcessingStatus: AiProcessingStatus;
  failureMode: StreamFailureMode;
  testScene?: SyntheticTestScene;
}

export interface ReconnectPolicy {
  maxRetries: number;
  initialBackoffMs: number;
  maxBackoffMs: number;
  backoffFactor: number;
}

export interface ConnectionTestResult {
  status: 'CONNECTED' | 'CONNECTION_FAILED' | 'INVALID_CONFIGURATION' | 'NOT_SUPPORTED' | 'TIMEOUT';
  success: boolean;
  message: string;
  detail?: string;
  latencyMs?: number;
  detectedCodec?: string;
  detectedResolution?: string;
  firstFrameReceived?: boolean;
  frameFreshnessMs?: number;
  streamFormat?: string;
  timestamp: string;
}

export interface StreamSessionEvent {
  eventType: 'stream.connected' | 'stream.disconnected' | 'stream.degraded' | 'stream.reconnected' | 'stream.error' | 'stream.health';
  cameraId: string;
  timestamp: string;
  telemetry: StreamTelemetry;
  error?: string;
}
