/**
 * IBVAP — ANPR REST Router
 *
 * Exposes comprehensive endpoints for ANPR records, structured event telemetry,
 * vehicle track associations, search with audit logging, and deterministic scenario triggers.
 */

import { Router, Request, Response } from 'express';
import { dataStore } from '../store';
import { anprService } from '../../anpr/anpr-service';
import {
  runScenarioA,
  runScenarioB,
  runScenarioC,
  runScenarioD,
  runScenarioE,
} from '../../anpr/scenarios';
import { normalizePlateText } from '../../anpr/normalizer';
import { AnprRecord } from '../types';

export const anprRouter = Router();

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

/**
 * Maps PersistentVehicleAnprRecord to AnprRecord format for UI compatibility.
 */
function mapPersistentToAnprRecord(r: any): AnprRecord {
  const camera = dataStore.cameras.find((c) => c.id === r.cameraId || c.cameraId === r.cameraId);
  return {
    id: `anpr-rec-${r.vehicleTrackId}`,
    cameraId: r.cameraId,
    cameraIdentifier: camera?.identifier || r.cameraIdentifier || r.cameraId,
    sectorName: r.spatialContext?.sectorName || camera?.sectorName || 'Border Surveillance Sector',
    plateNumber: r.bestPlateText || r.normalizedPlate || 'UNKNOWN',
    vehicleType: r.vehicleClass || 'CAR',
    vehicleColor: 'METALLIC',
    confidence: r.overallConfidence,
    isWatchlistMatch: r.isWatchlistMatch || false,
    watchlistCategory: r.watchlistCategory,
    timestamp: r.lastSeenAt || new Date().toISOString(),
    thumbnailUrl: r.evidenceReference?.thumbnailUrl || 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=800&auto=format&fit=crop&q=60',
    isSimulation: r.isSimulation !== undefined ? r.isSimulation : true,
    vehicleTrackId: r.vehicleTrackId,
    normalizedPlate: r.normalizedPlate,
    rawPlateText: r.rawPlateText,
    vehicleClass: r.vehicleClass,
    recognitionStatus: r.recognitionStatus,
    observationCount: r.observationCount,
    firstSeenAt: r.firstSeenAt,
    lastSeenAt: r.lastSeenAt,
    confidences: {
      vehicle: r.vehicleConfidence,
      plate: r.plateDetectionConfidence,
      ocr: r.ocrConfidence,
      association: r.associationConfidence,
      overall: r.overallConfidence,
    },
    spatialContext: r.spatialContext,
    evidenceReference: r.evidenceReference,
  };
}

// GET /api/v1/anpr
// Main records list endpoint supporting search, pagination, and multi-attribute filters
anprRouter.get('/', (req: Request, res: Response) => {
  if (!checkPermission(req, res, 'anpr.view')) return;

  const {
    search,
    plate,
    normalizedPlate,
    vehicleTrackId,
    cameraId,
    vehicleClass,
    recognitionStatus,
    watchlistOnly,
    minConfidence,
    startTime,
    endTime,
    offset,
    limit,
  } = req.query;

  // Query service records
  const queryResult = anprService.queryRecords({
    plate: (plate as string) || (search as string),
    normalizedPlate: normalizedPlate as string,
    vehicleTrackId: vehicleTrackId as string,
    cameraId: cameraId as string,
    vehicleClass: vehicleClass as any,
    recognitionStatus: recognitionStatus as any,
    watchlistOnly: watchlistOnly === 'true',
    minConfidence: minConfidence ? parseFloat(minConfidence as string) : undefined,
    startTime: startTime as string,
    endTime: endTime as string,
    offset: offset ? parseInt(offset as string, 10) : 0,
    limit: limit ? parseInt(limit as string, 10) : 50,
  });

  // Convert service records
  const mappedRecords = queryResult.records.map(mapPersistentToAnprRecord);

  // If no service records match, fallback to seed records in dataStore for backward compatibility
  let combined = [...mappedRecords];
  if (combined.length === 0 && (!vehicleTrackId && !recognitionStatus)) {
    let legacy = [...dataStore.anprRecords];
    if (search && typeof search === 'string') {
      const q = search.toLowerCase();
      legacy = legacy.filter((r) => r.plateNumber.toLowerCase().includes(q) || r.vehicleType.toLowerCase().includes(q));
    }
    if (watchlistOnly === 'true') {
      legacy = legacy.filter((r) => r.isWatchlistMatch);
    }
    combined = legacy;
  }

  res.json({
    success: true,
    total: queryResult.total || combined.length,
    offset: queryResult.offset,
    limit: queryResult.limit,
    records: combined,
  });
});

// GET /api/v1/anpr/metrics
anprRouter.get('/metrics', (req: Request, res: Response) => {
  if (!checkPermission(req, res, 'anpr.view')) return;

  const metrics = anprService.getMetrics();
  res.json({
    success: true,
    metrics,
  });
});

// GET /api/v1/anpr/events
anprRouter.get('/events', (req: Request, res: Response) => {
  if (!checkPermission(req, res, 'anpr.view')) return;

  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
  const events = anprService.getEvents(limit);

  res.json({
    success: true,
    total: events.length,
    events,
  });
});

// GET /api/v1/anpr/vehicles/:trackId
anprRouter.get('/vehicles/:trackId', (req: Request, res: Response) => {
  if (!checkPermission(req, res, 'anpr.view')) return;

  const { trackId } = req.params;
  const record = anprService.getRecordByTrackId(trackId);

  if (!record) {
    res.status(404).json({
      success: false,
      error: 'NOT_FOUND',
      message: `No ANPR record associated with vehicle track ${trackId}`,
    });
    return;
  }

  res.json({
    success: true,
    record: mapPersistentToAnprRecord(record),
    observations: record.observations,
  });
});

// GET /api/v1/anpr/cameras/:cameraId
anprRouter.get('/cameras/:cameraId', (req: Request, res: Response) => {
  if (!checkPermission(req, res, 'anpr.view')) return;

  const { cameraId } = req.params;
  const records = anprService.getRecordsByCamera(cameraId).map(mapPersistentToAnprRecord);

  res.json({
    success: true,
    total: records.length,
    records,
  });
});

// GET /api/v1/anpr/search
// Dedicated search endpoint with mandatory audit logging for legal compliance
anprRouter.get('/search', (req: Request, res: Response) => {
  if (!checkPermission(req, res, 'anpr.search')) return;

  const operator = getOperatorContext(req);
  const query = (req.query.plate as string) || (req.query.q as string) || '';

  if (!query.trim()) {
    res.status(400).json({
      success: false,
      error: 'BAD_REQUEST',
      message: 'Plate query string is required for ANPR search.',
    });
    return;
  }

  const normalized = normalizePlateText(query).normalizedText;
  const queryResult = anprService.queryRecords({ plate: query });

  // Log audit search
  dataStore.logAudit(
    operator.callsign,
    'ANPR_SEARCH',
    'ANPR',
    normalized,
    req.ip || '127.0.0.1',
    {
      searchTerm: query,
      normalizedTerm: normalized,
      resultsCount: queryResult.total,
    },
    'SUCCESS'
  );

  res.json({
    success: true,
    searchTerm: query,
    normalizedTerm: normalized,
    total: queryResult.total,
    records: queryResult.records.map(mapPersistentToAnprRecord),
  });
});

// GET /api/v1/anpr/retention
// Retention policy telemetry
anprRouter.get('/retention', (req: Request, res: Response) => {
  if (!checkPermission(req, res, 'anpr.view')) return;

  const policy = anprService.getRetentionPolicy();
  res.json({
    success: true,
    retention: policy,
  });
});

// GET /api/v1/anpr/watchlists
// ANPR Watchlist listing
anprRouter.get('/watchlists', (req: Request, res: Response) => {
  if (!checkPermission(req, res, 'anpr.view')) return;

  const watchlists = anprService.getWatchlists();
  res.json({
    success: true,
    total: watchlists.length,
    watchlists,
  });
});

// POST /api/v1/anpr/watchlists
// Create ANPR Watchlist entry
anprRouter.post('/watchlists', (req: Request, res: Response) => {
  if (!checkPermission(req, res, 'anpr.manage')) return;

  const operator = getOperatorContext(req);
  const { plateNumber, category, labelName, priority, notes } = req.body;

  if (!plateNumber || !category) {
    res.status(400).json({
      success: false,
      error: 'BAD_REQUEST',
      message: 'plateNumber and category are required.',
    });
    return;
  }

  const entry = anprService.addWatchlistEntry({
    plateNumber,
    category,
    labelName,
    priority,
    notes,
    active: true,
  });

  dataStore.logAudit(
    operator.callsign,
    'CREATE_ANPR_WATCHLIST',
    'ANPR',
    entry.plateNumber,
    req.ip || '127.0.0.1',
    { labelName: entry.labelName, category: entry.category },
    'SUCCESS'
  );

  res.json({
    success: true,
    entry,
  });
});

// PUT /api/v1/anpr/watchlists/:id
// Update ANPR Watchlist entry
anprRouter.put('/watchlists/:id', (req: Request, res: Response) => {
  if (!checkPermission(req, res, 'anpr.manage')) return;

  const operator = getOperatorContext(req);
  const { id } = req.params;
  const { plateNumber, category, labelName, priority, notes } = req.body;

  const updated = anprService.updateWatchlistEntry(id, {
    plateNumber,
    category,
    labelName,
    priority,
    notes,
  });

  if (!updated) {
    res.status(404).json({
      success: false,
      error: 'NOT_FOUND',
      message: `ANPR watchlist entry ${id} not found.`,
    });
    return;
  }

  dataStore.logAudit(
    operator.callsign,
    'UPDATE_ANPR_WATCHLIST',
    'ANPR',
    updated.plateNumber,
    req.ip || '127.0.0.1',
    { labelName, category },
    'SUCCESS'
  );

  res.json({
    success: true,
    entry: updated,
  });
});

// PATCH /api/v1/anpr/watchlists/:id/toggle
// Toggle ANPR Watchlist entry
anprRouter.patch('/watchlists/:id/toggle', (req: Request, res: Response) => {
  if (!checkPermission(req, res, 'anpr.manage')) return;

  const operator = getOperatorContext(req);
  const { id } = req.params;
  const toggled = anprService.toggleWatchlistEntry(id);

  if (!toggled) {
    res.status(404).json({
      success: false,
      error: 'NOT_FOUND',
      message: `ANPR watchlist entry ${id} not found.`,
    });
    return;
  }

  dataStore.logAudit(
    operator.callsign,
    'TOGGLE_ANPR_WATCHLIST',
    'ANPR',
    toggled.plateNumber,
    req.ip || '127.0.0.1',
    { active: toggled.active },
    'SUCCESS'
  );

  res.json({
    success: true,
    entry: toggled,
  });
});

// DELETE /api/v1/anpr/watchlists/:id
// Delete ANPR Watchlist entry
anprRouter.delete('/watchlists/:id', (req: Request, res: Response) => {
  if (!checkPermission(req, res, 'anpr.manage')) return;

  const operator = getOperatorContext(req);
  const { id } = req.params;
  const deleted = anprService.deleteWatchlistEntry(id);

  if (!deleted) {
    res.status(404).json({
      success: false,
      error: 'NOT_FOUND',
      message: `ANPR watchlist entry ${id} not found.`,
    });
    return;
  }

  dataStore.logAudit(
    operator.callsign,
    'DELETE_ANPR_WATCHLIST',
    'ANPR',
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

// POST /api/v1/anpr/scenarios/:scenarioName
// Triggers deterministic simulation scenarios on demand
anprRouter.post('/scenarios/:scenarioName', (req: Request, res: Response) => {
  const { scenarioName } = req.params;
  const operator = getOperatorContext(req);

  let result;
  switch (scenarioName.toUpperCase()) {
    case 'SCENARIO_A':
      result = runScenarioA(anprService);
      break;
    case 'SCENARIO_B':
      result = runScenarioB(anprService);
      break;
    case 'SCENARIO_C':
      result = runScenarioC(anprService);
      break;
    case 'SCENARIO_D':
      result = runScenarioD(anprService);
      break;
    case 'SCENARIO_E':
      result = runScenarioE(anprService);
      break;
    default:
      res.status(400).json({
        success: false,
        error: 'INVALID_SCENARIO',
        message: `Scenario '${scenarioName}' is not recognized. Valid scenarios: SCENARIO_A, SCENARIO_B, SCENARIO_C, SCENARIO_D, SCENARIO_E`,
      });
      return;
  }

  // Also sync scenario records to dataStore.anprRecords for immediate legacy UI visibility
  for (const rec of result.records) {
    const mapped = mapPersistentToAnprRecord(rec);
    const existingIndex = dataStore.anprRecords.findIndex((r) => r.plateNumber === mapped.plateNumber);
    if (existingIndex >= 0) {
      dataStore.anprRecords[existingIndex] = mapped;
    } else {
      dataStore.anprRecords.unshift(mapped);
    }
  }

  dataStore.logAudit(
    operator.callsign,
    'ANPR_SCENARIO_RUN',
    'ANPR',
    scenarioName.toUpperCase(),
    req.ip || '127.0.0.1',
    {
      scenario: scenarioName.toUpperCase(),
      assertionsPass: result.assertionsPass,
      recordsGenerated: result.records.length,
    },
    'SUCCESS'
  );

  res.json({
    success: true,
    scenario: result.scenarioName,
    description: result.description,
    isSimulation: true,
    assertionsPass: result.assertionsPass,
    notes: result.notes,
    records: result.records.map(mapPersistentToAnprRecord),
  });
});

// POST /api/v1/anpr/export
anprRouter.post('/export', (req: Request, res: Response) => {
  if (!checkPermission(req, res, 'evidence.export')) return;

  const operator = getOperatorContext(req);
  const records = anprService.queryRecords({ limit: 1000 }).records.map(mapPersistentToAnprRecord);

  dataStore.logAudit(
    operator.callsign,
    'ANPR_DATA_EXPORT',
    'ANPR',
    'ALL',
    req.ip || '127.0.0.1',
    {
      recordsCount: records.length,
      format: req.body?.format || 'JSON',
    },
    'SUCCESS'
  );

  res.json({
    success: true,
    exportedAt: new Date().toISOString(),
    exportedBy: operator.callsign,
    count: records.length,
    records,
  });
});
