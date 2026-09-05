import { Request, Response, Router } from 'express';
import { trackingService } from '../../tracking/tracking-service';
import { TrackState } from '../../tracking/types';

export const tracksRouter = Router();

/**
 * GET /api/v1/tracks
 * Queries tracking records with optional camera, state, and limit filters.
 */
tracksRouter.get('/', (req: Request, res: Response) => {
  const { cameraId, state, objectType, class: className, limit } = req.query;

  const tracks = trackingService.queryTracks({
    cameraId: typeof cameraId === 'string' ? cameraId : undefined,
    state: typeof state === 'string' ? (state as TrackState) : undefined,
    objectType: typeof objectType === 'string' ? objectType : undefined,
    class: typeof className === 'string' ? className : undefined,
    limit: limit ? parseInt(limit as string, 10) : 50,
  });

  res.json({
    success: true,
    total: tracks.length,
    data: tracks,
  });
});

/**
 * GET /api/v1/tracks/:id
 * Retrieves an individual track record by track ID.
 */
tracksRouter.get('/:id', (req: Request, res: Response) => {
  const track = trackingService.getTrackById(req.params.id);
  if (!track) {
    return res.status(404).json({
      success: false,
      error: 'TrackNotFound',
      message: `Track with ID ${req.params.id} was not found.`,
    });
  }

  res.json({
    success: true,
    data: track,
  });
});

/**
 * GET /api/v1/tracks/camera/:cameraId
 * Returns active tracks and tracking summary for a specific camera.
 */
tracksRouter.get('/camera/:cameraId', (req: Request, res: Response) => {
  const { cameraId } = req.params;
  const activeTracks = trackingService.getActiveTracks(cameraId);
  const allTracks = trackingService.queryTracks({ cameraId, limit: 30 });

  res.json({
    success: true,
    cameraId,
    activeCount: activeTracks.length,
    activeTracks,
    recentHistory: allTracks,
  });
});
