import { Router, Request, Response } from 'express';
import { cameraTrustEngine } from '../../camera-trust/trust-engine';
import { dataStore } from '../store';

export const cameraTrustRouter = Router();

// GET /api/v1/camera-trust/evaluations
cameraTrustRouter.get('/evaluations', (req: Request, res: Response) => {
  const evaluations = cameraTrustEngine.getAllEvaluations();
  res.json({
    success: true,
    count: evaluations.length,
    evaluations,
  });
});

// GET /api/v1/camera-trust/events
cameraTrustRouter.get('/events', (req: Request, res: Response) => {
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
  const events = cameraTrustEngine.getEventHistory(limit);
  res.json({
    success: true,
    count: events.length,
    events,
  });
});

// GET /api/v1/camera-trust/:id
cameraTrustRouter.get('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const cam = dataStore.getCamera(id);
  if (!cam) {
    res.status(404).json({ success: false, error: `Camera [${id}] not found` });
    return;
  }

  const evaluation = cameraTrustEngine.getEvaluation(cam.cameraId);
  res.json({
    success: true,
    evaluation,
  });
});

// GET /api/v1/camera-trust/:id/telemetry
cameraTrustRouter.get('/:id/telemetry', (req: Request, res: Response) => {
  const { id } = req.params;
  const cam = dataStore.getCamera(id);
  if (!cam) {
    res.status(404).json({ success: false, error: `Camera [${id}] not found` });
    return;
  }

  const telemetry = cameraTrustEngine.getTelemetry(cam.cameraId);
  res.json({
    success: true,
    telemetry: telemetry || {
      cameraId: cam.cameraId,
      cameraIdentifier: cam.identifier || cam.cameraId,
      lastFrameTimestamp: null,
      frameAgeMs: null,
      streamState: 'STREAM_UNAVAILABLE',
      reconnectCount: 0,
      recentReconnectsLast5Min: 0,
      currentResolution: 'NOT AVAILABLE',
      configuredResolution: cam.resolution,
      resolutionMismatch: false,
      processingState: 'STREAM_INTERRUPTED',
      isFrozenFrameDetected: false,
      repeatedFrameCount: 0,
      unauthorizedAngleShiftDetected: false,
      measuredAzimuthDegrees: null,
      configuredAzimuthDegrees: cam.azimuthDegrees ?? 0,
      telemetryCapturedAt: new Date().toISOString(),
    },
  });
});

// POST /api/v1/camera-trust/:id/set-state (Technical diagnostic test injection)
cameraTrustRouter.post('/:id/set-state', (req: Request, res: Response) => {
  const { id } = req.params;
  const { streamState, frameAgeMs, isFrozen, azimuthShift } = req.body;

  const cam = dataStore.getCamera(id);
  if (!cam) {
    res.status(404).json({ success: false, error: `Camera [${id}] not found` });
    return;
  }

  const updatedEval = cameraTrustEngine.setStreamState(cam.cameraId, streamState || 'STREAM_AVAILABLE', {
    frameAgeMs,
    isFrozen,
    azimuthShift,
  });

  res.json({
    success: true,
    message: `Camera ${cam.cameraId} trust state updated`,
    evaluation: updatedEval,
  });
});

// POST /api/v1/camera-trust/:id/reset
cameraTrustRouter.post('/:id/reset', (req: Request, res: Response) => {
  const { id } = req.params;
  const cam = dataStore.getCamera(id);
  if (!cam) {
    res.status(404).json({ success: false, error: `Camera [${id}] not found` });
    return;
  }

  const resetEval = cameraTrustEngine.resetCameraToOptimal(cam.cameraId);
  res.json({
    success: true,
    message: `Camera ${cam.cameraId} restored to optimal baseline`,
    evaluation: resetEval,
  });
});
