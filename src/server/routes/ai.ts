import { Request, Response, Router } from 'express';
import { aiInferenceService } from '../../ai-inference/inference-service';
import { videoGateway } from '../../video-gateway/video-gateway';
import { geminiService } from '../services/gemini-service';
import { GeminiLiveAdapter } from '../services/gemini-live-adapter';
import { dataStore } from '../store';
import { OperatorAuthContext } from '../services/gemini-types';

export const aiRouter = Router();

/**
 * Extracts and canonicalizes operator security context.
 */
function getOperatorContext(req: Request): OperatorAuthContext {
  const headerCallsign = (req.headers['x-operator-callsign'] as string) || (req.body?.operatorCallsign as string);
  const headerRole = (req.headers['x-operator-role'] as string) || (req.body?.operatorRole as string);

  if (headerCallsign) {
    const user = dataStore.users.find((u) => u.callsign.toUpperCase() === headerCallsign.toUpperCase());
    if (user) {
      return { callsign: user.callsign, role: user.role, ipAddress: req.ip || '127.0.0.1' };
    }
    return { callsign: headerCallsign, role: headerRole || 'WATCH_COMMANDER', ipAddress: req.ip || '127.0.0.1' };
  }

  return { callsign: 'COMMANDER-1', role: 'WATCH_COMMANDER', ipAddress: req.ip || '127.0.0.1' };
}

/**
 * Ensures operator has required permission for Copilot operations.
 */
function checkCopilotPermission(req: Request, res: Response, permission = 'copilot.use'): boolean {
  const operator = getOperatorContext(req);
  const hasPerm = dataStore.hasPermission(operator.role, permission as any);
  if (!hasPerm) {
    res.status(403).json({
      success: false,
      error: 'FORBIDDEN',
      message: `Operator ${operator.callsign} (${operator.role}) lacks required permission: ${permission}`,
    });
    return false;
  }
  return true;
}

/**
 * GET /api/v1/ai/status
 * Returns truthful telemetry of Gemini LLM integration and Gemini Live adapter status.
 */
aiRouter.get('/status', (req: Request, res: Response) => {
  const telemetry = geminiService.getTelemetry();
  const liveStatus = GeminiLiveAdapter.getStatus();
  res.json({
    success: true,
    telemetry,
    live: liveStatus,
  });
});

/**
 * POST /api/v1/ai/copilot/query
 * Executes a conversational Copilot query under the operator's security context.
 */
aiRouter.post('/copilot/query', async (req: Request, res: Response) => {
  if (!checkCopilotPermission(req, res, 'copilot.use')) return;

  const { query, cameraId, incidentId, alertId, trackId } = req.body;
  if (!query || typeof query !== 'string' || !query.trim()) {
    return res.status(400).json({
      success: false,
      error: 'BAD_REQUEST',
      message: 'A non-empty query string is required.',
    });
  }

  const operator = getOperatorContext(req);

  try {
    const result = await geminiService.queryCopilot(
      query.trim(),
      { cameraId, incidentId, alertId, trackId },
      operator
    );
    res.json({
      success: true,
      data: result,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: 'COPILOT_EXECUTION_ERROR',
      message: err?.message || 'Failed to process Copilot query',
    });
  }
});

/**
 * POST /api/v1/ai/incidents/:incidentId/summarize
 * Generates an authoritative incident summary.
 */
aiRouter.post('/incidents/:incidentId/summarize', async (req: Request, res: Response) => {
  if (!checkCopilotPermission(req, res, 'incident.view')) return;

  const { incidentId } = req.params;
  const operator = getOperatorContext(req);

  try {
    const summary = await geminiService.summarizeIncident(incidentId, operator);
    res.json({
      success: true,
      data: summary,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: 'SUMMARY_EXECUTION_ERROR',
      message: err?.message || 'Failed to summarize incident',
    });
  }
});

/**
 * POST /api/v1/ai/alerts/:alertId/explain
 * Explains an alert and its causal trigger chain.
 */
aiRouter.post('/alerts/:alertId/explain', async (req: Request, res: Response) => {
  if (!checkCopilotPermission(req, res, 'alert.view')) return;

  const { alertId } = req.params;
  const operator = getOperatorContext(req);

  try {
    const explanation = await geminiService.explainAlert(alertId, operator);
    res.json({
      success: true,
      data: explanation,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: 'EXPLANATION_EXECUTION_ERROR',
      message: err?.message || 'Failed to explain alert',
    });
  }
});

/**
 * POST /api/v1/ai/investigate
 * Investigates an entity (Track ID, Plate, Person, or Camera).
 */
aiRouter.post('/investigate', async (req: Request, res: Response) => {
  if (!checkCopilotPermission(req, res, 'copilot.use')) return;

  const { entityType, entityId, query } = req.body;
  if (!entityType || !entityId) {
    return res.status(400).json({
      success: false,
      error: 'BAD_REQUEST',
      message: 'entityType and entityId are required.',
    });
  }

  const operator = getOperatorContext(req);

  try {
    const result = await geminiService.investigateEntity(
      entityType,
      entityId,
      query || `Investigate ${entityType} ${entityId}`,
      operator
    );
    res.json({
      success: true,
      data: result,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: 'INVESTIGATION_ERROR',
      message: err?.message || 'Failed to execute entity investigation',
    });
  }
});

/**
 * POST /api/v1/ai/timeline
 * Generates verified chronological timeline narration.
 */
aiRouter.post('/timeline', async (req: Request, res: Response) => {
  if (!checkCopilotPermission(req, res, 'copilot.use')) return;

  const operator = getOperatorContext(req);

  try {
    const result = await geminiService.generateTimeline(req.body || {}, operator);
    res.json({
      success: true,
      data: result,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: 'TIMELINE_ERROR',
      message: err?.message || 'Failed to generate timeline',
    });
  }
});

/**
 * POST /api/v1/ai/camera/:cameraId/copilot
 * Selected-camera conversational copilot mode.
 */
aiRouter.post('/camera/:cameraId/copilot', async (req: Request, res: Response) => {
  if (!checkCopilotPermission(req, res, 'camera.view')) return;

  const { cameraId } = req.params;
  const { query } = req.body;
  if (!query || typeof query !== 'string' || !query.trim()) {
    return res.status(400).json({
      success: false,
      error: 'BAD_REQUEST',
      message: 'Query string is required.',
    });
  }

  const operator = getOperatorContext(req);

  try {
    const result = await geminiService.querySelectedCamera(cameraId, query.trim(), operator);
    res.json({
      success: true,
      data: result,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: 'CAMERA_COPILOT_ERROR',
      message: err?.message || 'Failed to execute camera copilot query',
    });
  }
});

/**
 * GET /api/v1/ai/live/status
 * Returns authoritative Gemini Live status report (NOT_IMPLEMENTED).
 */
aiRouter.get('/live/status', (req: Request, res: Response) => {
  res.json({
    success: true,
    data: GeminiLiveAdapter.getStatus(),
  });
});

/**
 * GET /api/v1/ai/health
 * Returns truthful telemetry of the AI inference subsystem:
 * Model name, device (CPU), last inference latency, skipped frames, processed frames.
 */
aiRouter.get('/health', (req: Request, res: Response) => {
  const health = aiInferenceService.getHealth();
  res.json({
    success: true,
    data: health,
  });
});

/**
 * GET /api/v1/ai/config
 * Retrieves the current AI inference configuration.
 */
aiRouter.get('/config', (req: Request, res: Response) => {
  const config = aiInferenceService.getConfig();
  res.json({
    success: true,
    data: config,
  });
});

/**
 * PATCH /api/v1/ai/config
 * Updates confidence threshold, sampling interval, or AI enable flag.
 */
aiRouter.patch('/config', (req: Request, res: Response) => {
  const patch = req.body;
  if (!patch || typeof patch !== 'object') {
    return res.status(400).json({
      success: false,
      error: 'InvalidConfiguration',
      message: 'Request body must be a valid JSON object.',
    });
  }

  const updated = aiInferenceService.updateConfig(patch);
  res.json({
    success: true,
    message: 'AI inference configuration updated successfully.',
    data: updated,
  });
});

/**
 * POST /api/v1/ai/infer/:cameraId
 * Triggers on-demand real model inference on the camera's current video frame.
 */
aiRouter.post('/infer/:cameraId', async (req: Request, res: Response) => {
  const { cameraId } = req.params;

  try {
    const result = await aiInferenceService.inferCamera(cameraId);
    res.json({
      success: true,
      cameraId: result.cameraId,
      timestamp: result.timestamp,
      latencyMs: result.latencyMs,
      personCount: result.detections.length,
      detections: result.detections,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: 'InferenceExecutionFailed',
      message: err?.message || 'Failed to execute inference on camera stream.',
    });
  }
});

/**
 * POST /api/v1/ai/camera/:cameraId/test-scene
 * Switches test scene on a simulated camera (PERSON_SOLITARY, EMPTY, PERSON_CROSSING)
 * to evaluate the real AI model against controlled positive and negative border scenes.
 */
aiRouter.post('/camera/:cameraId/test-scene', (req: Request, res: Response) => {
  const { cameraId } = req.params;
  const { scene } = req.body;

  if (scene !== 'EMPTY' && scene !== 'PERSON_SOLITARY' && scene !== 'PERSON_CROSSING') {
    return res.status(400).json({
      success: false,
      error: 'InvalidTestScene',
      message: "Valid test scenes are: 'EMPTY', 'PERSON_SOLITARY', 'PERSON_CROSSING'.",
    });
  }

  const success = videoGateway.setCameraTestScene(cameraId, scene);
  if (!success) {
    return res.status(404).json({
      success: false,
      error: 'CameraStreamNotFound',
      message: `Active stream session not found for camera ${cameraId}.`,
    });
  }

  res.json({
    success: true,
    cameraId,
    testScene: scene,
    message: `Camera ${cameraId} test scene updated to ${scene}.`,
  });
});

/**
 * POST /api/v1/ai/camera/:cameraId/enable
 * Enables automated periodic AI sampling for this camera.
 */
aiRouter.post('/camera/:cameraId/enable', (req: Request, res: Response) => {
  const { cameraId } = req.params;
  aiInferenceService.enableCameraInference(cameraId);
  res.json({
    success: true,
    message: `AI sampling enabled for camera ${cameraId}.`,
  });
});

/**
 * POST /api/v1/ai/camera/:cameraId/disable
 * Disables automated periodic AI sampling for this camera.
 */
aiRouter.post('/camera/:cameraId/disable', (req: Request, res: Response) => {
  const { cameraId } = req.params;
  aiInferenceService.disableCameraInference(cameraId);
  res.json({
    success: true,
    message: `AI sampling disabled for camera ${cameraId}.`,
  });
});
