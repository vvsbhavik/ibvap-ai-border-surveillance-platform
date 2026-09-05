/**
 * IBVAP — Face Analytics REST Router
 *
 * Exposes endpoints for:
 * - Listing persistent Person Face records with multi-dimensional filtering
 * - Querying specific Person Track ID face observations and consensus history
 * - Telemetry metrics (detection count, quality distribution, match count, latency)
 * - Structured event audit log
 * - Synthetic watchlist inspection
 * - Deterministic scenario execution (Scenarios A through G)
 */

import { Router, Request, Response } from 'express';
import { dataStore } from '../store';
import { faceService } from '../../face/face-service';
import {
  runScenarioA,
  runScenarioB,
  runScenarioC,
  runScenarioD,
  runScenarioE,
  runScenarioF,
  runScenarioG,
} from '../../face/scenarios';
import { FaceQualityState, FaceRecognitionStatus } from '../../face/types';

export const facesRouter = Router();

/**
 * Extracts and validates operator authentication and role context.
 */
function getOperatorContext(req: Request): { callsign: string; role: string } {
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
 * Ensures operator has required permission.
 */
function checkPermission(req: Request, res: Response, permission: string): boolean {
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

// GET /api/v1/faces
// List persistent face records with optional filters
facesRouter.get('/', (req: Request, res: Response) => {
  if (!checkPermission(req, res, 'ai.view')) return;

  const {
    personTrackId,
    cameraId,
    quality,
    recognitionStatus,
    isWatchlistMatch,
    watchlistCategory,
    startDate,
    endDate,
    limit,
  } = req.query;

  const records = faceService.queryRecords({
    personTrackId: personTrackId as string,
    cameraId: cameraId as string,
    quality: quality as FaceQualityState,
    recognitionStatus: recognitionStatus as FaceRecognitionStatus,
    isWatchlistMatch: isWatchlistMatch !== undefined ? isWatchlistMatch === 'true' : undefined,
    watchlistCategory: watchlistCategory as any,
    startDate: startDate as string,
    endDate: endDate as string,
    limit: limit ? parseInt(limit as string, 10) : 100,
  });

  res.json({
    success: true,
    total: records.length,
    records,
  });
});

// GET /api/v1/faces/metrics
// Realtime telemetry metrics
facesRouter.get('/metrics', (req: Request, res: Response) => {
  if (!checkPermission(req, res, 'ai.view')) return;

  const metrics = faceService.getMetrics();
  res.json({
    success: true,
    metrics,
  });
});

// GET /api/v1/faces/events
// Structured event stream history
facesRouter.get('/events', (req: Request, res: Response) => {
  if (!checkPermission(req, res, 'events.view')) return;

  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
  const events = faceService.getEventHistory(limit);

  res.json({
    success: true,
    total: events.length,
    events,
  });
});

// GET /api/v1/faces/watchlists
// Synthetic watchlist records
facesRouter.get('/watchlists', (req: Request, res: Response) => {
  if (!checkPermission(req, res, 'watchlists.view')) return;

  const watchlists = faceService.getWatchlists();
  res.json({
    success: true,
    total: watchlists.length,
    watchlists,
  });
});

// GET /api/v1/faces/persons/:personTrackId
// Detailed record for a single Person Track ID
facesRouter.get('/persons/:personTrackId', (req: Request, res: Response) => {
  if (!checkPermission(req, res, 'ai.view')) return;

  const { personTrackId } = req.params;
  const record = faceService.getRecord(personTrackId);

  if (!record) {
    res.status(404).json({
      success: false,
      error: 'NOT_FOUND',
      message: `No face record found for Person Track ID: ${personTrackId}`,
    });
    return;
  }

  res.json({
    success: true,
    record,
  });
});

// POST /api/v1/faces/scenarios/:scenarioId
// Triggers deterministic verification scenarios
facesRouter.post('/scenarios/:scenarioId', (req: Request, res: Response) => {
  if (!checkPermission(req, res, 'ai.manage')) return;

  const { scenarioId } = req.params;
  const id = scenarioId.toUpperCase();

  try {
    let result: any;
    switch (id) {
      case 'SCENARIO_A':
      case 'A':
        result = runScenarioA(faceService);
        break;
      case 'SCENARIO_B':
      case 'B':
        result = runScenarioB(faceService);
        break;
      case 'SCENARIO_C':
      case 'C':
        result = runScenarioC(faceService);
        break;
      case 'SCENARIO_D':
      case 'D':
        result = runScenarioD(faceService);
        break;
      case 'SCENARIO_E':
      case 'E':
        result = runScenarioE(faceService);
        break;
      case 'SCENARIO_F':
      case 'F':
        result = runScenarioF(faceService);
        break;
      case 'SCENARIO_G':
      case 'G':
        result = runScenarioG(faceService);
        break;
      default:
        res.status(400).json({
          success: false,
          error: 'INVALID_SCENARIO',
          message: `Unknown scenario '${scenarioId}'. Valid scenarios are: A, B, C, D, E, F, G`,
        });
        return;
    }

    res.json({
      success: true,
      scenario: id,
      message: `Scenario ${id} executed successfully`,
      result,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: 'SCENARIO_EXECUTION_ERROR',
      message: err?.message || String(err),
    });
  }
});
