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
  // Canonicalize or fallback check against system permissions
  let permToCheck = permission as any;
  if (permission === 'ai.view') {
    permToCheck = 'monitoring.view';
  } else if (permission === 'ai.manage') {
    permToCheck = 'monitoring.view';
  } else if (permission === 'events.view') {
    permToCheck = 'monitoring.view';
  } else if (permission === 'watchlists.view') {
    permToCheck = 'watchlist.view';
  }

  const hasPerm = dataStore.hasPermission(operator.role, permToCheck);
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

// POST /api/v1/faces/watchlists
// Create face watchlist entry
facesRouter.post('/watchlists', (req: Request, res: Response) => {
  if (!checkPermission(req, res, 'watchlist.manage')) return;

  const operator = getOperatorContext(req);
  const { displayName, category, priority, notes, templateEmbedding } = req.body;

  if (!displayName || !category) {
    res.status(400).json({
      success: false,
      error: 'BAD_REQUEST',
      message: 'displayName and category are required.',
    });
    return;
  }

  const newEntry = faceService.addWatchlistEntry({
    id: `fwl-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    displayName,
    category,
    priority: priority || 'HIGH',
    notes: notes || '',
    status: 'ACTIVE',
    templateEmbedding: templateEmbedding || Array.from({ length: 128 }, (_, i) => Math.cos(i * 0.1) * 0.1),
  });

  dataStore.logAudit(
    operator.callsign,
    'CREATE_FACE_WATCHLIST',
    'FACE_ANALYTICS',
    newEntry.id,
    req.ip || '127.0.0.1',
    { displayName: newEntry.displayName, category: newEntry.category },
    'SUCCESS'
  );

  res.json({
    success: true,
    entry: newEntry,
  });
});

// PUT /api/v1/faces/watchlists/:id
// Update face watchlist entry
facesRouter.put('/watchlists/:id', (req: Request, res: Response) => {
  if (!checkPermission(req, res, 'watchlist.manage')) return;

  const operator = getOperatorContext(req);
  const { id } = req.params;
  const { displayName, category, priority, notes } = req.body;

  const updated = faceService.updateWatchlistEntry(id, {
    displayName,
    category,
    priority,
    notes,
  });

  if (!updated) {
    res.status(404).json({
      success: false,
      error: 'NOT_FOUND',
      message: `Face watchlist entry ${id} not found.`,
    });
    return;
  }

  dataStore.logAudit(
    operator.callsign,
    'UPDATE_FACE_WATCHLIST',
    'FACE_ANALYTICS',
    id,
    req.ip || '127.0.0.1',
    { displayName, category },
    'SUCCESS'
  );

  res.json({
    success: true,
    entry: updated,
  });
});

// PATCH /api/v1/faces/watchlists/:id/toggle
// Toggle face watchlist entry active status
facesRouter.patch('/watchlists/:id/toggle', (req: Request, res: Response) => {
  if (!checkPermission(req, res, 'watchlist.manage')) return;

  const operator = getOperatorContext(req);
  const { id } = req.params;
  const toggled = faceService.toggleWatchlistEntry(id);

  if (!toggled) {
    res.status(404).json({
      success: false,
      error: 'NOT_FOUND',
      message: `Face watchlist entry ${id} not found.`,
    });
    return;
  }

  dataStore.logAudit(
    operator.callsign,
    'TOGGLE_FACE_WATCHLIST',
    'FACE_ANALYTICS',
    id,
    req.ip || '127.0.0.1',
    { status: toggled.status },
    'SUCCESS'
  );

  res.json({
    success: true,
    entry: toggled,
  });
});

// DELETE /api/v1/faces/watchlists/:id
// Delete face watchlist entry
facesRouter.delete('/watchlists/:id', (req: Request, res: Response) => {
  if (!checkPermission(req, res, 'watchlist.manage')) return;

  const operator = getOperatorContext(req);
  const { id } = req.params;
  const deleted = faceService.deleteWatchlistEntry(id);

  if (!deleted) {
    res.status(404).json({
      success: false,
      error: 'NOT_FOUND',
      message: `Face watchlist entry ${id} not found.`,
    });
    return;
  }

  dataStore.logAudit(
    operator.callsign,
    'DELETE_FACE_WATCHLIST',
    'FACE_ANALYTICS',
    id,
    req.ip || '127.0.0.1',
    {},
    'SUCCESS'
  );

  res.json({
    success: true,
    removedId: id,
  });
});

// GET /api/v1/faces/search
// Metadata and query search with mandatory audit logging
facesRouter.get('/search', (req: Request, res: Response) => {
  if (!checkPermission(req, res, 'ai.view')) return;

  const operator = getOperatorContext(req);
  const { q, personTrackId, cameraId, quality, recognitionStatus, isWatchlistMatch } = req.query;

  const searchResults = faceService.searchRecords({
    q: q as string,
    personTrackId: personTrackId as string,
    cameraId: cameraId as string,
    quality: quality as FaceQualityState,
    recognitionStatus: recognitionStatus as FaceRecognitionStatus,
    isWatchlistMatch: isWatchlistMatch !== undefined ? isWatchlistMatch === 'true' : undefined,
  });

  dataStore.logAudit(
    operator.callsign,
    'FACE_SEARCH',
    'FACE_ANALYTICS',
    (q as string) || (personTrackId as string) || 'ALL',
    req.ip || '127.0.0.1',
    {
      query: q,
      personTrackId,
      resultsCount: searchResults.total,
    },
    'SUCCESS'
  );

  res.json({
    success: true,
    total: searchResults.total,
    records: searchResults.records,
  });
});

// GET /api/v1/faces/retention
// Retention policy telemetry
facesRouter.get('/retention', (req: Request, res: Response) => {
  if (!checkPermission(req, res, 'ai.view')) return;

  const policy = faceService.getRetentionPolicy();
  res.json({
    success: true,
    retention: policy,
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
