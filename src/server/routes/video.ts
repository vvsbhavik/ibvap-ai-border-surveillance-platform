import { Router, Request, Response } from 'express';
import { videoGateway } from '../../video-gateway/video-gateway';
import { cctvIngestManager } from '../../video-gateway/cctv-ingest';
import { dataStore } from '../store';
import { logger } from '../logger';
import {
  AiProcessingStatus,
  CameraSourceMode,
  CameraSourceType,
  StreamFailureMode,
} from '../../video-gateway/types';
import { trackingService } from '../../tracking/tracking-service';
import { spatialEngine } from '../../spatial/spatial-engine';

export const videoRouter = Router();

function getOperatorContext(req: Request): { callsign: string; role: string } {
  // Check authorization session token if present
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const session = dataStore.sessions.get(token);
    if (session) {
      return { callsign: session.userCallsign, role: session.userRole };
    }
  }

  const headerCallsign = (req.headers['x-operator-callsign'] as string) || (req.body?.operatorCallsign as string);
  const headerRole = (req.headers['x-operator-role'] as string) || (req.body?.operatorRole as string);

  if (headerCallsign) {
    const user = dataStore.users.find((u) => u.callsign.toUpperCase() === headerCallsign.toUpperCase());
    if (user) {
      return { callsign: user.callsign, role: user.role };
    }
    return { callsign: headerCallsign, role: headerRole || 'WATCH_COMMANDER' };
  }

  return { callsign: 'COMMANDER-1', role: 'WATCH_COMMANDER' };
}

/**
 * GET /api/v1/video/streams
 * Returns telemetry and state for all registered stream sessions.
 */
videoRouter.get('/streams', (req: Request, res: Response) => {
  const operator = getOperatorContext(req);
  if (!dataStore.hasPermission(operator.role, 'camera.stream.view')) {
    res.status(403).json({
      error: 'Access denied: missing camera.stream.view permission',
      requiredPermission: 'camera.stream.view',
    });
    return;
  }

  const streams = videoGateway.getAllStreams();
  res.json({
    streams,
    count: streams.length,
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/v1/video/streams/:cameraId
 * Returns telemetry and state for a single camera's stream session.
 */
videoRouter.get('/streams/:cameraId', (req: Request, res: Response) => {
  const operator = getOperatorContext(req);
  if (!dataStore.hasPermission(operator.role, 'camera.stream.view')) {
    res.status(403).json({
      error: 'Access denied: missing camera.stream.view permission',
      requiredPermission: 'camera.stream.view',
    });
    return;
  }

  const { cameraId } = req.params;
  const stream = videoGateway.getStream(cameraId);

  if (!stream) {
    res.status(404).json({
      error: `Stream session not found for camera ${cameraId}`,
      cameraId,
    });
    return;
  }

  res.json({ stream });
});

/**
 * POST /api/v1/video/streams/:cameraId/test
 * Real backend RTSP/socket connection diagnostic check.
 */
videoRouter.post('/streams/:cameraId/test', async (req: Request, res: Response) => {
  const operator = getOperatorContext(req);
  if (!dataStore.hasPermission(operator.role, 'camera.stream.test')) {
    res.status(403).json({
      error: 'Access denied: missing camera.stream.test permission',
      requiredPermission: 'camera.stream.test',
    });
    return;
  }

  const { cameraId } = req.params;
  const { streamEndpointReference, protocol } = req.body || {};

  try {
    const result = await videoGateway.testConnection(cameraId, {
      streamEndpointReference,
      protocol,
    });

    dataStore.logCameraAudit(
      operator.callsign,
      'STREAM_CONNECTION_TEST',
      cameraId,
      result.success ? 'SUCCESS' : 'FAILURE',
      { status: result.status, message: result.message },
      req.ip
    );

    res.json(result);
  } catch (err: any) {
    logger.error(`Stream test failed for ${cameraId}: ${err.message}`);
    res.status(500).json({
      status: 'CONNECTION_FAILED',
      success: false,
      message: 'Unexpected internal error during stream diagnostics',
      detail: err.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /api/v1/video/streams/:cameraId/health
 * Returns stream health state, FPS, latency, and failure details.
 */
videoRouter.get('/streams/:cameraId/health', (req: Request, res: Response) => {
  const operator = getOperatorContext(req);
  if (!dataStore.hasPermission(operator.role, 'camera.stream.view')) {
    res.status(403).json({
      error: 'Access denied: missing camera.stream.view permission',
      requiredPermission: 'camera.stream.view',
    });
    return;
  }

  const { cameraId } = req.params;
  const stream = videoGateway.getStream(cameraId);

  if (!stream) {
    res.status(404).json({
      error: `Stream session not found for camera ${cameraId}`,
      cameraId,
    });
    return;
  }

  res.json({
    cameraId: stream.cameraId,
    healthState: stream.healthState,
    connectionState: stream.connectionState,
    currentFps: stream.currentFps,
    nominalFps: stream.nominalFps,
    currentLatencyMs: stream.currentLatencyMs,
    lastFrameTimestamp: stream.lastFrameTimestamp,
    lastHeartbeatAt: stream.lastHeartbeatAt,
    reconnectAttempts: stream.reconnectAttempts,
    maxReconnectAttempts: stream.maxReconnectAttempts,
    nextRetryAt: stream.nextRetryAt,
    lastError: stream.lastError,
    failureMode: stream.failureMode,
  });
});

/**
 * POST /api/v1/video/streams/:cameraId/reconnect
 * Commands the video gateway to reconnect the camera stream session.
 */
videoRouter.post('/streams/:cameraId/reconnect', async (req: Request, res: Response) => {
  const operator = getOperatorContext(req);
  if (!dataStore.hasPermission(operator.role, 'camera.stream.reconnect')) {
    res.status(403).json({
      error: 'Access denied: missing camera.stream.reconnect permission',
      requiredPermission: 'camera.stream.reconnect',
    });
    return;
  }

  const { cameraId } = req.params;
  const success = await videoGateway.reconnectStream(cameraId);

  dataStore.logCameraAudit(
    operator.callsign,
    'STREAM_MANUAL_RECONNECT',
    cameraId,
    success ? 'SUCCESS' : 'FAILURE',
    { result: success ? 'reconnect_initiated' : 'camera_not_found' },
    req.ip
  );

  if (!success) {
    res.status(404).json({
      error: `Stream session not found for camera ${cameraId}`,
      cameraId,
    });
    return;
  }

  const stream = videoGateway.getStream(cameraId);
  res.json({
    success: true,
    message: `Stream reconnection initiated for camera ${cameraId}`,
    stream,
  });
});

/**
 * GET /api/v1/video/streams/:cameraId/frame
 * Retrieves the latest acquired frame buffer.
 */
videoRouter.get('/streams/:cameraId/frame', (req: Request, res: Response) => {
  const operator = getOperatorContext(req);
  if (!dataStore.hasPermission(operator.role, 'camera.stream.view')) {
    res.status(403).json({
      error: 'Access denied: missing camera.stream.view permission',
      requiredPermission: 'camera.stream.view',
    });
    return;
  }

  const { cameraId } = req.params;
  const frame = videoGateway.getLatestFrame(cameraId);

  if (!frame) {
    res.status(404).json({
      error: `No frame available for camera ${cameraId}`,
      cameraId,
    });
    return;
  }

  res.json({ frame });
});

/**
 * GET /api/v1/video/streams/:cameraId/mjpeg
 * Continuous live MJPEG stream (multipart/x-mixed-replace) directly from FFmpeg ingestion.
 */
videoRouter.get('/streams/:cameraId/mjpeg', (req: Request, res: Response) => {
  const { cameraId } = req.params;
  const attached = cctvIngestManager.attachMjpegClient(cameraId, res);
  if (!attached) {
    res.status(404).send('Camera stream not currently active or available in CCTV ingest manager.');
  }
});

/**
 * POST /api/v1/video/streams/:cameraId/connect
 * Starts / connects ingestion for this camera stream.
 */
videoRouter.post('/streams/:cameraId/connect', async (req: Request, res: Response) => {
  const { cameraId } = req.params;
  const cam = dataStore.cameras.find((c) => c.id === cameraId || c.cameraId === cameraId);
  if (!cam) {
    res.status(404).json({ error: `Camera ${cameraId} not found` });
    return;
  }

  if (cam.sourceMode === 'LIVE' && cam.sourceType !== 'WEBCAM') {
    await cctvIngestManager.startIngest(cam.id);
  }
  const stream = videoGateway.getStream(cam.id);
  res.json({ success: true, message: `Camera ${cameraId} stream connected`, stream });
});

/**
 * POST /api/v1/video/streams/:cameraId/disconnect
 * Disconnects ingestion for this camera stream.
 */
videoRouter.post('/streams/:cameraId/disconnect', (req: Request, res: Response) => {
  const { cameraId } = req.params;
  const cam = dataStore.cameras.find((c) => c.id === cameraId || c.cameraId === cameraId);
  if (!cam) {
    res.status(404).json({ error: `Camera ${cameraId} not found` });
    return;
  }

  cctvIngestManager.stopIngest(cam.id, 'Operator manual disconnect');
  const stream = videoGateway.getStream(cam.id);
  res.json({ success: true, message: `Camera ${cameraId} stream disconnected`, stream });
});

/**
 * POST /api/v1/video/streams/:cameraId/simulate-failure
 * Developer / Test simulation control to inject safe network & stream faults.
 */
videoRouter.post('/streams/:cameraId/simulate-failure', (req: Request, res: Response) => {
  const operator = getOperatorContext(req);
  if (!dataStore.hasPermission(operator.role, 'camera.stream.test')) {
    res.status(403).json({
      error: 'Access denied: missing camera.stream.test permission',
      requiredPermission: 'camera.stream.test',
    });
    return;
  }

  const { cameraId } = req.params;
  const { failureMode } = req.body as { failureMode: StreamFailureMode };

  const validModes: StreamFailureMode[] = [
    'NONE',
    'DISCONNECT',
    'TIMEOUT',
    'FROZEN',
    'SLOW',
    'RECONNECT_FAILURE',
  ];

  if (!validModes.includes(failureMode)) {
    res.status(400).json({
      error: `Invalid failure mode. Valid modes: ${validModes.join(', ')}`,
    });
    return;
  }

  const ok = videoGateway.setSimulationFailure(cameraId, failureMode);
  if (!ok) {
    res.status(404).json({ error: `Camera stream ${cameraId} not found` });
    return;
  }

  dataStore.logCameraAudit(
    operator.callsign,
    'STREAM_SIMULATED_FAILURE_INJECTED',
    cameraId,
    'SUCCESS',
    { failureMode },
    req.ip
  );

  const stream = videoGateway.getStream(cameraId);
  res.json({
    success: true,
    message: `Injected simulation failure mode: ${failureMode}`,
    stream,
  });
});

/**
 * POST /api/v1/video/streams/:cameraId/simulate-restore
 * Clears simulation failure and restores normal stream ingestion.
 */
videoRouter.post('/streams/:cameraId/simulate-restore', (req: Request, res: Response) => {
  const operator = getOperatorContext(req);
  if (!dataStore.hasPermission(operator.role, 'camera.stream.test')) {
    res.status(403).json({
      error: 'Access denied: missing camera.stream.test permission',
      requiredPermission: 'camera.stream.test',
    });
    return;
  }

  const { cameraId } = req.params;
  const ok = videoGateway.clearSimulationFailure(cameraId);

  if (!ok) {
    res.status(404).json({ error: `Camera stream ${cameraId} not found` });
    return;
  }

  dataStore.logCameraAudit(
    operator.callsign,
    'STREAM_SIMULATED_FAILURE_CLEARED',
    cameraId,
    'SUCCESS',
    {},
    req.ip
  );

  const stream = videoGateway.getStream(cameraId);
  res.json({
    success: true,
    message: 'Simulation failure cleared. Stream restored.',
    stream,
  });
});

/**
 * POST /api/v1/video/streams/:cameraId/test-scene
 * Sets a synthetic test scene (e.g. fence crossing, zone entry/exit) on a camera stream.
 */
videoRouter.post('/streams/:cameraId/test-scene', (req: Request, res: Response) => {
  const { cameraId } = req.params;
  const { scene } = req.body;

  if (!scene) {
    res.status(400).json({ error: 'Missing required field: scene' });
    return;
  }

  const ok = videoGateway.setCameraTestScene(cameraId, scene);
  if (!ok) {
    res.status(404).json({ error: `Camera stream ${cameraId} not found` });
    return;
  }

  res.json({
    success: true,
    message: `Test scene changed to: ${scene}`,
    cameraId,
    scene,
  });
});

/**
 * POST /api/v1/video/streams/:cameraId/frame
 * Ingests an actual live video frame captured from the operator's browser/webcam.
 */
videoRouter.post('/streams/:cameraId/frame', (req: Request, res: Response) => {
  const { cameraId } = req.params;
  const { dataUri, width, height, timestamp, metadata } = req.body || {};

  if (!dataUri || typeof dataUri !== 'string') {
    res.status(400).json({ error: 'Missing or invalid dataUri string' });
    return;
  }

  const frame = videoGateway.submitLiveFrame(cameraId, {
    dataUri,
    width: width || 1280,
    height: height || 720,
    timestamp: timestamp || new Date().toISOString(),
    metadata,
  });

  if (!frame) {
    res.status(404).json({ error: `Camera stream ${cameraId} not found` });
    return;
  }

  // Update in-memory camera state
  const cam = dataStore.cameras.find((c) => c.id === cameraId || c.cameraId === cameraId);
  if (cam) {
    cam.lastFrameTimestamp = frame.timestamp;
    if (cam.status === 'OFFLINE' || cam.status === 'DEGRADED') {
      cam.status = 'ONLINE';
    }
  }

  res.json({
    success: true,
    sequenceNumber: frame.sequenceNumber,
    timestamp: frame.timestamp,
    sizeBytes: frame.sizeBytes,
  });
});

/**
 * POST /api/v1/video/streams/:cameraId/source-mode
 * Transitions stream between LIVE, SIMULATION, OFFLINE, and UNAVAILABLE.
 * Resets transient tracker and spatial states when switching modes.
 */
videoRouter.post('/streams/:cameraId/source-mode', (req: Request, res: Response) => {
  const operator = getOperatorContext(req);
  if (!dataStore.hasPermission(operator.role, 'camera.update')) {
    res.status(403).json({
      error: 'Access denied: missing camera.update permission',
      requiredPermission: 'camera.update',
    });
    return;
  }

  const { cameraId } = req.params;
  const { sourceMode, sourceType, browserStreamUrl, sourceAttribution, aiProcessingStatus } = req.body as {
    sourceMode: CameraSourceMode;
    sourceType?: CameraSourceType;
    browserStreamUrl?: string;
    sourceAttribution?: string;
    aiProcessingStatus?: AiProcessingStatus;
  };

  const validModes: CameraSourceMode[] = ['LIVE', 'SIMULATION', 'OFFLINE', 'UNAVAILABLE'];
  if (!validModes.includes(sourceMode)) {
    res.status(400).json({
      error: `Invalid sourceMode. Allowed: ${validModes.join(', ')}`,
    });
    return;
  }

  const cam = dataStore.cameras.find((c) => c.id === cameraId || c.cameraId === cameraId);
  if (!cam) {
    res.status(404).json({ error: `Camera ${cameraId} not found` });
    return;
  }

  const previousMode = cam.sourceMode || (cam.isSimulated ? 'SIMULATION' : 'LIVE');

  // Reset transient tracking and spatial states on mode transition
  try {
    trackingService.resetCamera(cam.id);
    if (cam.cameraId && cam.cameraId !== cam.id) {
      trackingService.resetCamera(cam.cameraId);
    }
    spatialEngine.resetCameraState(cam.id);
    if (cam.cameraId && cam.cameraId !== cam.id) {
      spatialEngine.resetCameraState(cam.cameraId);
    }
  } catch (err) {
    logger.warn(`Failed to reset state for camera ${cameraId}: ${err}`);
  }

  // Update camera record
  cam.sourceMode = sourceMode;
  cam.isSimulated = sourceMode === 'SIMULATION';
  if (sourceType) cam.sourceType = sourceType;
  if (browserStreamUrl !== undefined) cam.browserStreamUrl = browserStreamUrl;
  if (sourceAttribution !== undefined) cam.sourceAttribution = sourceAttribution;

  // AI Analytics status: never fake AI detections on live video unless live model inference is running!
  if (aiProcessingStatus) {
    cam.aiProcessingStatus = aiProcessingStatus;
  } else {
    cam.aiProcessingStatus = sourceMode === 'LIVE' ? (cam.sourceType === 'WEBCAM' ? 'READY' : 'UNAVAILABLE') : 'READY';
  }

  if (sourceMode === 'OFFLINE') {
    cam.status = 'OFFLINE';
  } else if (sourceMode === 'UNAVAILABLE') {
    cam.status = 'DEGRADED';
  } else {
    cam.status = 'ONLINE';
  }
  cam.updatedAt = new Date().toISOString();

  // Synchronize gateway stream session
  const telemetry = videoGateway.updateCameraStreamConfig(cam.id, {
    sourceMode,
    sourceType: cam.sourceType,
    browserStreamUrl: cam.browserStreamUrl,
    sourceAttribution: cam.sourceAttribution,
    aiProcessingStatus: cam.aiProcessingStatus,
  });

  dataStore.logCameraAudit(
    operator.callsign,
    'CAMERA_SOURCE_MODE_CHANGE',
    cam.cameraId,
    'SUCCESS',
    { previousMode, sourceMode, sourceType: cam.sourceType },
    req.ip
  );

  dataStore.broadcastEvent({
    eventId: `evt-${Date.now()}`,
    eventType: 'camera.sourceModeChanged',
    timestamp: new Date().toISOString(),
    source: cam.cameraId,
    payload: { cameraId: cam.cameraId, sourceMode, sourceType: cam.sourceType, telemetry },
  });

  res.json({
    success: true,
    camera: cam,
    telemetry: telemetry || videoGateway.getStream(cam.id),
  });
});

