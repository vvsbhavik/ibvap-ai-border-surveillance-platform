import { CircularFrameBuffer } from './frame-buffer';
import { SyntheticFrameGenerator } from './synthetic-feed';
import {
  RawFrame,
  ReconnectPolicy,
  StreamConnectionState,
  StreamFailureMode,
  StreamHealthState,
  StreamTelemetry,
  SyntheticTestScene,
} from './types';

export interface StreamSessionConfig {
  cameraId: string;
  identifier: string;
  name: string;
  sectorName?: string;
  cameraType?: string;
  streamEndpointReference: string;
  protocol: string;
  codec: string;
  resolution: string;
  fps: number;
  azimuth?: number;
  isSimulated?: boolean;
  testScene?: SyntheticTestScene;
}

const DEFAULT_RECONNECT_POLICY: ReconnectPolicy = {
  maxRetries: 5,
  initialBackoffMs: 1000,
  maxBackoffMs: 16000,
  backoffFactor: 2,
};

export class StreamSession {
  public readonly config: StreamSessionConfig;
  private readonly frameBuffer: CircularFrameBuffer;
  private readonly frameGenerator: SyntheticFrameGenerator;
  private readonly reconnectPolicy: ReconnectPolicy;

  private connectionState: StreamConnectionState = 'CONFIGURED';
  private healthState: StreamHealthState = 'UNKNOWN';
  private failureMode: StreamFailureMode = 'NONE';
  private testScene: SyntheticTestScene;

  private framesAcquiredTotal: number = 0;
  private framesDroppedTotal: number = 0;
  private reconnectAttempts: number = 0;
  private nextRetryAt: string | null = null;
  private lastHeartbeatAt: string = new Date().toISOString();
  private lastError: { message: string; timestamp: string; code?: string } | null = null;
  private measuredLatencyMs: number | null = 42;

  private acquisitionTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private healthCheckTimer: NodeJS.Timeout | null = null;

  public onTelemetryUpdate?: (telemetry: StreamTelemetry) => void;
  public onStateChange?: (previous: StreamConnectionState, current: StreamConnectionState, telemetry: StreamTelemetry) => void;
  public onFrameAcquired?: (frame: RawFrame) => void;

  constructor(config: StreamSessionConfig, reconnectPolicy: ReconnectPolicy = DEFAULT_RECONNECT_POLICY) {
    this.config = config;
    this.reconnectPolicy = reconnectPolicy;
    this.frameBuffer = new CircularFrameBuffer(30);
    this.frameGenerator = new SyntheticFrameGenerator();
    this.testScene = config.testScene || (config.cameraId === 'CAM-01' || config.identifier === 'CAM-01' ? 'PERSON_SOLITARY' : 'EMPTY');
  }

  public setTestScene(scene: SyntheticTestScene): void {
    this.testScene = scene;
    this.notifyTelemetry();
  }

  /**
   * Starts ingestion and establishes stream connection.
   */
  public async connect(): Promise<boolean> {
    if (this.connectionState === 'CONNECTING' || this.connectionState === 'CONNECTED') {
      return true;
    }

    this.setConnectionState('CONNECTING');
    this.lastHeartbeatAt = new Date().toISOString();

    // Check failure simulation on connect
    if (this.failureMode === 'TIMEOUT') {
      this.lastError = {
        message: 'RTSP socket connection timed out after 5000ms',
        timestamp: new Date().toISOString(),
        code: 'ETIMEDOUT',
      };
      this.setConnectionState('ERROR');
      this.setHealthState('OFFLINE');
      this.scheduleReconnect();
      return false;
    }

    if (this.failureMode === 'RECONNECT_FAILURE' && this.reconnectAttempts > 0) {
      this.lastError = {
        message: 'Connection refused by remote RTSP endpoint: ECONNREFUSED',
        timestamp: new Date().toISOString(),
        code: 'ECONNREFUSED',
      };
      this.setConnectionState('DISCONNECTED');
      this.scheduleReconnect();
      return false;
    }

    // Small async delay representing protocol handshake (OPTIONS, DESCRIBE, SETUP, PLAY)
    await new Promise((resolve) => setTimeout(resolve, 150));

    this.reconnectAttempts = 0;
    this.nextRetryAt = null;
    this.lastError = null;
    this.setConnectionState('CONNECTED');
    this.setHealthState('HEALTHY');

    this.startFrameAcquisition();
    this.startHealthMonitor();
    return true;
  }

  /**
   * Gracefully disconnects the stream.
   */
  public disconnect(reason = 'User initiated disconnect'): void {
    this.stopFrameAcquisition();
    this.stopReconnectTimer();

    if (this.connectionState !== 'DISCONNECTED') {
      this.setConnectionState('DISCONNECTED');
      this.setHealthState('OFFLINE');
      this.lastError = {
        message: reason,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Manually commands the session to reconnect. Resets retry count.
   */
  public async manualReconnect(): Promise<boolean> {
    this.disconnect('Manual reconnect initiated');
    this.reconnectAttempts = 0;
    this.nextRetryAt = null;
    this.lastError = null;
    return this.connect();
  }

  /**
   * Frame acquisition loop.
   */
  private startFrameAcquisition(): void {
    this.stopFrameAcquisition();

    // In simulation mode, we sample at ~5-10 FPS (100-200ms) to conserve server CPU
    // while providing real moving frames to clients.
    const nominalInterval = Math.max(100, Math.floor(1000 / (this.config.fps || 30)));
    const interval = this.failureMode === 'SLOW' ? 800 : nominalInterval;

    this.acquisitionTimer = setInterval(() => {
      this.acquireNextFrame();
    }, interval);
  }

  private stopFrameAcquisition(): void {
    if (this.acquisitionTimer) {
      clearInterval(this.acquisitionTimer);
      this.acquisitionTimer = null;
    }
  }

  private acquireNextFrame(): void {
    if (this.connectionState !== 'CONNECTED' && this.connectionState !== 'DEGRADED') {
      return;
    }

    // Failure simulation: Frozen stream stops generating frames
    if (this.failureMode === 'FROZEN') {
      return;
    }

    // Failure simulation: Disconnect triggers mid-stream failure
    if (this.failureMode === 'DISCONNECT') {
      this.lastError = {
        message: 'RTSP TCP connection reset by peer (RST received)',
        timestamp: new Date().toISOString(),
        code: 'ECONNRESET',
      };
      this.stopFrameAcquisition();
      this.setConnectionState('DISCONNECTED');
      this.setHealthState('OFFLINE');
      this.scheduleReconnect();
      return;
    }

    const frame = this.frameGenerator.generateFrame({
      cameraId: this.config.cameraId,
      identifier: this.config.identifier,
      cameraName: this.config.name,
      sectorName: this.config.sectorName,
      cameraType: this.config.cameraType,
      azimuth: this.config.azimuth,
      palette: this.config.cameraType?.includes('THERMAL') ? 'THERMAL' : 'OPTICAL',
      testScene: this.testScene,
    });

    this.frameBuffer.push(frame);
    this.framesAcquiredTotal++;
    this.lastHeartbeatAt = new Date().toISOString();

    if (this.failureMode === 'SLOW') {
      this.measuredLatencyMs = 380 + Math.floor(Math.random() * 80);
    } else {
      this.measuredLatencyMs = 35 + Math.floor(Math.random() * 15);
    }

    this.onFrameAcquired?.(frame);
  }

  /**
   * Evaluates health based on frame acquisition recency and FPS metrics.
   */
  private startHealthMonitor(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    this.healthCheckTimer = setInterval(() => {
      this.evaluateHealth();
    }, 1500);
  }

  private evaluateHealth(): void {
    if (this.connectionState === 'DISCONNECTED' || this.connectionState === 'ERROR') {
      this.setHealthState('OFFLINE');
      return;
    }

    const latestFrame = this.frameBuffer.getLatest();
    if (!latestFrame) {
      if (this.connectionState === 'CONNECTED') {
        this.setHealthState('DEGRADED');
      }
      return;
    }

    const now = Date.now();
    const frameAgeMs = now - new Date(latestFrame.timestamp).getTime();
    const currentFps = this.getCurrentFps();

    // If frame is older than 2500ms while connected -> frozen or dropped stream
    if (frameAgeMs > 2500 || this.failureMode === 'FROZEN') {
      this.setHealthState('DEGRADED');
      this.setConnectionState('DEGRADED');
      return;
    }

    if (this.failureMode === 'SLOW' || (this.config.fps && currentFps < this.config.fps * 0.4)) {
      this.setHealthState('DEGRADED');
      this.setConnectionState('DEGRADED');
      return;
    }

    this.setHealthState('HEALTHY');
    if (this.connectionState === 'DEGRADED') {
      this.setConnectionState('CONNECTED');
    }
  }

  /**
   * Schedules bounded exponential backoff reconnection.
   */
  private scheduleReconnect(): void {
    this.stopReconnectTimer();

    if (this.reconnectAttempts >= this.reconnectPolicy.maxRetries) {
      this.setConnectionState('ERROR');
      this.setHealthState('OFFLINE');
      this.lastError = {
        message: `Maximum reconnect retries (${this.reconnectPolicy.maxRetries}) exceeded. Stream suspended.`,
        timestamp: new Date().toISOString(),
        code: 'MAX_RETRIES_EXCEEDED',
      };
      this.nextRetryAt = null;
      this.notifyTelemetry();
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(
      this.reconnectPolicy.initialBackoffMs * Math.pow(this.reconnectPolicy.backoffFactor, this.reconnectAttempts - 1),
      this.reconnectPolicy.maxBackoffMs
    );

    const retryTarget = new Date(Date.now() + delay);
    this.nextRetryAt = retryTarget.toISOString();
    this.notifyTelemetry();

    this.reconnectTimer = setTimeout(async () => {
      await this.connect();
    }, delay);
  }

  private stopReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * Sets failure mode for testing.
   */
  public setSimulationFailure(mode: StreamFailureMode): void {
    this.failureMode = mode;
    if (mode === 'DISCONNECT') {
      this.disconnect('Simulated disconnect fault injected');
      this.scheduleReconnect();
    } else if (mode === 'SLOW') {
      this.startFrameAcquisition(); // Adjusts to slow interval
    }
    this.notifyTelemetry();
  }

  public clearSimulationFailure(): void {
    this.failureMode = 'NONE';
    if (this.connectionState === 'DISCONNECTED' || this.connectionState === 'ERROR') {
      this.manualReconnect();
    } else {
      this.startFrameAcquisition();
    }
    this.notifyTelemetry();
  }

  public getLatestFrame(): RawFrame | null {
    return this.frameBuffer.getLatest();
  }

  public getCurrentFps(): number {
    if (this.connectionState !== 'CONNECTED' && this.connectionState !== 'DEGRADED') {
      return 0;
    }
    if (this.failureMode === 'FROZEN') {
      return 0;
    }
    const calculated = this.frameBuffer.calculateFps();
    if (calculated > 0) return calculated;
    return this.failureMode === 'SLOW' ? 3.8 : (this.config.fps || 29.8);
  }

  public getTelemetry(): StreamTelemetry {
    return {
      cameraId: this.config.cameraId,
      cameraIdentifier: this.config.identifier,
      connectionState: this.connectionState,
      healthState: this.healthState,
      currentFps: this.getCurrentFps(),
      nominalFps: this.config.fps || 30,
      currentLatencyMs: this.connectionState === 'CONNECTED' ? this.measuredLatencyMs : null,
      lastFrameTimestamp: this.frameBuffer.getLatest()?.timestamp || null,
      lastHeartbeatAt: this.lastHeartbeatAt,
      framesAcquiredTotal: this.framesAcquiredTotal,
      framesDroppedTotal: this.framesDroppedTotal,
      reconnectAttempts: this.reconnectAttempts,
      maxReconnectAttempts: this.reconnectPolicy.maxRetries,
      nextRetryAt: this.nextRetryAt,
      lastError: this.lastError,
      streamEndpointReference: this.config.streamEndpointReference,
      protocol: this.config.protocol,
      codec: this.config.codec,
      resolution: this.config.resolution,
      isSimulated: Boolean(this.config.isSimulated),
      failureMode: this.failureMode,
      testScene: this.testScene,
    };
  }

  private setConnectionState(newState: StreamConnectionState): void {
    if (this.connectionState === newState) return;
    const previous = this.connectionState;
    this.connectionState = newState;
    this.onStateChange?.(previous, newState, this.getTelemetry());
    this.notifyTelemetry();
  }

  private setHealthState(newHealth: StreamHealthState): void {
    if (this.healthState === newHealth) return;
    this.healthState = newHealth;
    this.notifyTelemetry();
  }

  private notifyTelemetry(): void {
    this.onTelemetryUpdate?.(this.getTelemetry());
  }

  public destroy(): void {
    this.stopFrameAcquisition();
    this.stopReconnectTimer();
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
    this.frameBuffer.clear();
  }
}
