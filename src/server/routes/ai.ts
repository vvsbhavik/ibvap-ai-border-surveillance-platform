import { Request, Response, Router } from 'express';
import { aiInferenceService } from '../../ai-inference/inference-service';
import { videoGateway } from '../../video-gateway/video-gateway';

export const aiRouter = Router();

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
