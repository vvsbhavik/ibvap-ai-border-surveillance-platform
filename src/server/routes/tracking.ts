import { Request, Response, Router } from 'express';
import { trackingService } from '../../tracking/tracking-service';

export const trackingRouter = Router();

/**
 * GET /api/v1/tracking/health
 * Returns tracking subsystem health, algorithm details, and telemetry metrics.
 */
trackingRouter.get('/health', (_req: Request, res: Response) => {
  const health = trackingService.getHealth();
  res.json({
    success: true,
    data: health,
  });
});

/**
 * GET /api/v1/tracking/config
 * Returns current multi-object tracking configuration.
 */
trackingRouter.get('/config', (_req: Request, res: Response) => {
  const health = trackingService.getHealth();
  res.json({
    success: true,
    data: health.config,
  });
});

/**
 * PATCH /api/v1/tracking/config
 * Updates tracking configuration parameters (e.g. iouThreshold, maxMissedFrames).
 */
trackingRouter.patch('/config', (req: Request, res: Response) => {
  const updates = req.body;
  trackingService.updateConfig(updates);

  res.json({
    success: true,
    message: 'Tracking configuration updated successfully.',
    data: trackingService.getHealth().config,
  });
});

/**
 * POST /api/v1/tracking/reset/:cameraId
 * Resets tracking state and sequence IDs for a specific camera.
 */
trackingRouter.post('/reset/:cameraId', (req: Request, res: Response) => {
  const { cameraId } = req.params;
  trackingService.resetCamera(cameraId);

  res.json({
    success: true,
    message: `Tracker reset successfully for camera ${cameraId}.`,
  });
});
