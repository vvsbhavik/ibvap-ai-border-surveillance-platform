import { Request, Response, Router } from 'express';
import { detectionStore } from '../../ai-inference/detection-store';

export const detectionsRouter = Router();

/**
 * GET /api/v1/detections
 * Lists detection events with query filtering: camera, object type, confidence, time range.
 */
detectionsRouter.get('/', (req: Request, res: Response) => {
  const { cameraId, objectType, minConfidence, startTime, endTime, limit } = req.query;

  const detections = detectionStore.query({
    cameraId: typeof cameraId === 'string' ? cameraId : undefined,
    objectType: typeof objectType === 'string' ? objectType : undefined,
    minConfidence: minConfidence ? parseFloat(minConfidence as string) : undefined,
    startTime: typeof startTime === 'string' ? startTime : undefined,
    endTime: typeof endTime === 'string' ? endTime : undefined,
    limit: limit ? parseInt(limit as string, 10) : 50,
  });

  res.json({
    success: true,
    total: detections.length,
    data: detections,
  });
});

/**
 * GET /api/v1/detections/:id
 * Retrieves a single normalized detection record by ID.
 */
detectionsRouter.get('/:id', (req: Request, res: Response) => {
  const detection = detectionStore.getById(req.params.id);
  if (!detection) {
    return res.status(404).json({
      success: false,
      error: 'DetectionNotFound',
      message: `Detection event with ID ${req.params.id} was not found.`,
    });
  }

  res.json({
    success: true,
    data: detection,
  });
});

/**
 * GET /api/v1/cameras/:cameraId/detections
 * Retrieves active and historical detections for a specific camera.
 */
detectionsRouter.get('/camera/:cameraId', (req: Request, res: Response) => {
  const { cameraId } = req.params;
  const activeWindowMs = req.query.windowMs ? parseInt(req.query.windowMs as string, 10) : 4000;

  const activeDetections = detectionStore.getActiveForCamera(cameraId, activeWindowMs);
  const latestDetection = detectionStore.getLatestForCamera(cameraId);
  const history = detectionStore.query({ cameraId, limit: 30 });

  res.json({
    success: true,
    cameraId,
    activeDetections,
    latestDetection,
    activePersonCount: activeDetections.length,
    recentHistory: history,
  });
});
