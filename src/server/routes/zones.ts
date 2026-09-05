import { Router, Request, Response } from 'express';
import { dataStore } from '../store';
import { spatialEngine } from '../../spatial/spatial-engine';
import { validateGeometry } from '../../spatial/geometry';
import { hasPermission } from '../../utils/permissions';
import { SpatialZone } from '../../spatial/types';
import { trackingService } from '../../tracking/tracking-service';

export const zonesRouter = Router();

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

// GET /api/v1/zones/sectors
zonesRouter.get('/sectors', (req: Request, res: Response) => {
  res.json({
    success: true,
    sectors: dataStore.sectors,
  });
});

// GET /api/v1/zones/spatial/metrics
zonesRouter.get('/spatial/metrics', (req: Request, res: Response) => {
  res.json({
    success: true,
    metrics: spatialEngine.getMetrics(),
  });
});

// GET /api/v1/zones/spatial/events
zonesRouter.get('/spatial/events', (req: Request, res: Response) => {
  const { cameraId, zoneId, eventType, limit } = req.query;
  const numLimit = limit ? parseInt(limit as string, 10) : 50;

  const events = dataStore.getSpatialEvents({
    cameraId: typeof cameraId === 'string' ? cameraId : undefined,
    zoneId: typeof zoneId === 'string' ? zoneId : undefined,
    eventType: typeof eventType === 'string' ? eventType : undefined,
    limit: numLimit,
  });

  res.json({
    success: true,
    total: events.length,
    events,
  });
});

// GET /api/v1/zones/spatial
zonesRouter.get('/spatial', (req: Request, res: Response) => {
  const { cameraId, active, type } = req.query;
  const filterActive = active !== undefined ? active === 'true' : undefined;

  const spatialZones = dataStore.getSpatialZones({
    cameraId: typeof cameraId === 'string' ? cameraId : undefined,
    active: filterActive,
    type: typeof type === 'string' ? type : undefined,
  });

  res.json({
    success: true,
    total: spatialZones.length,
    zones: spatialZones,
  });
});

// GET /api/v1/zones
zonesRouter.get('/', (req: Request, res: Response) => {
  const { sectorId, cameraId, active, type } = req.query;
  const filterActive = active !== undefined ? active === 'true' : undefined;

  const spatialZones = dataStore.getSpatialZones({
    cameraId: typeof cameraId === 'string' ? cameraId : undefined,
    active: filterActive,
    type: typeof type === 'string' ? type : undefined,
  });

  let legacyZones = [...dataStore.zones];
  if (sectorId && typeof sectorId === 'string') {
    legacyZones = legacyZones.filter((z) => z.sectorId === sectorId);
  }

  res.json({
    success: true,
    total: spatialZones.length,
    spatialZones,
    zones: legacyZones,
  });
});

// GET /api/v1/zones/occupancy
zonesRouter.get('/occupancy', (req: Request, res: Response) => {
  const operator = getOperatorContext(req);

  if (!hasPermission(operator.role, 'zone.view')) {
    res.status(403).json({
      success: false,
      error: 'Forbidden: Insufficient permissions to view zone occupancy (requires zone.view).',
    });
    return;
  }

  const { cameraId, zoneId, sectorId } = req.query;

  let matchingZones = dataStore.getSpatialZones({
    cameraId: typeof cameraId === 'string' ? cameraId : undefined,
    active: true,
  });

  if (zoneId && typeof zoneId === 'string') {
    matchingZones = matchingZones.filter((z) => z.zoneId === zoneId);
  }

  if (sectorId && typeof sectorId === 'string') {
    matchingZones = matchingZones.filter((z) => z.sectorId === sectorId);
  }

  const occupancies = matchingZones.map((z) => {
    const activeTracks = trackingService.getActiveTracks(z.cameraId);
    return spatialEngine.getZoneOccupancy(z, activeTracks);
  });

  // If a single zone was specifically queried and found, also provide the primary object
  if (zoneId && typeof zoneId === 'string' && occupancies.length === 1) {
    res.json({
      success: true,
      occupancy: occupancies[0],
      occupancies,
      total: 1,
    });
    return;
  }

  res.json({
    success: true,
    total: occupancies.length,
    occupancies,
  });
});

// GET /api/v1/zones/:id
zonesRouter.get('/:id', (req: Request, res: Response) => {
  const { id } = req.params;

  // 1. Search camera spatial zones
  const spatialZone = dataStore.getSpatialZoneById(id);
  if (spatialZone) {
    const occupants = spatialEngine.getTracksInZone(id);
    res.json({
      success: true,
      zone: spatialZone,
      occupants,
    });
    return;
  }

  // 2. Search legacy macro zones
  const legacy = dataStore.zones.find((z) => z.id === id);
  if (legacy) {
    res.json({
      success: true,
      zone: legacy,
    });
    return;
  }

  res.status(404).json({
    success: false,
    error: `Zone '${id}' not found.`,
  });
});

// POST /api/v1/zones
zonesRouter.post('/', (req: Request, res: Response) => {
  const operator = getOperatorContext(req);

  if (!hasPermission(operator.role, 'zone.create')) {
    res.status(403).json({
      success: false,
      error: 'Forbidden: Insufficient permissions to create spatial zones (requires zone.create).',
    });
    return;
  }

  const zoneData: Partial<SpatialZone> = req.body;

  if (!zoneData.cameraId) {
    res.status(400).json({ success: false, error: 'cameraId is required.' });
    return;
  }
  if (!zoneData.name || !zoneData.name.trim()) {
    res.status(400).json({ success: false, error: 'Zone name is required.' });
    return;
  }
  if (!zoneData.coordinates || !Array.isArray(zoneData.coordinates)) {
    res.status(400).json({ success: false, error: 'Valid coordinates array is required.' });
    return;
  }

  const geomType = zoneData.geometry || 'POLYGON';
  const validation = validateGeometry(geomType, zoneData.coordinates);
  if (!validation.valid) {
    res.status(400).json({
      success: false,
      error: `Invalid geometry: ${validation.error}`,
    });
    return;
  }

  // Validate optional dwell thresholds
  if (zoneData.dwellWarningSeconds !== undefined) {
    if (
      typeof zoneData.dwellWarningSeconds !== 'number' ||
      isNaN(zoneData.dwellWarningSeconds) ||
      zoneData.dwellWarningSeconds <= 0
    ) {
      res.status(400).json({
        success: false,
        error: 'dwellWarningSeconds must be a positive number.',
      });
      return;
    }
  }
  if (zoneData.maxDwellSeconds !== undefined) {
    if (
      typeof zoneData.maxDwellSeconds !== 'number' ||
      isNaN(zoneData.maxDwellSeconds) ||
      zoneData.maxDwellSeconds <= 0
    ) {
      res.status(400).json({
        success: false,
        error: 'maxDwellSeconds must be a positive number.',
      });
      return;
    }
  }
  if (
    zoneData.dwellWarningSeconds !== undefined &&
    zoneData.maxDwellSeconds !== undefined &&
    zoneData.dwellWarningSeconds > zoneData.maxDwellSeconds
  ) {
    res.status(400).json({
      success: false,
      error: 'dwellWarningSeconds must be less than or equal to maxDwellSeconds.',
    });
    return;
  }

  try {
    const created = dataStore.createSpatialZone(zoneData, operator.callsign, req.ip);

    dataStore.broadcastEvent({
      eventId: `evt-zone-create-${Date.now()}`,
      eventType: 'zone.created',
      timestamp: new Date().toISOString(),
      source: created.cameraId,
      payload: created,
    });

    res.status(201).json({
      success: true,
      zone: created,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create spatial zone.';
    res.status(400).json({ success: false, error: message });
  }
});

// PATCH /api/v1/zones/:id
zonesRouter.patch('/:id', (req: Request, res: Response) => {
  const operator = getOperatorContext(req);

  if (!hasPermission(operator.role, 'zone.update')) {
    res.status(403).json({
      success: false,
      error: 'Forbidden: Insufficient permissions to update spatial zones (requires zone.update).',
    });
    return;
  }

  const { id } = req.params;
  const updates: Partial<SpatialZone> = req.body;

  const existing = dataStore.getSpatialZoneById(id);
  if (!existing) {
    res.status(404).json({ success: false, error: `Spatial zone '${id}' not found.` });
    return;
  }

  if (updates.coordinates) {
    const geomType = updates.geometry || existing.geometry;
    const validation = validateGeometry(geomType, updates.coordinates);
    if (!validation.valid) {
      res.status(400).json({
        success: false,
        error: `Invalid geometry: ${validation.error}`,
      });
      return;
    }
  }

  // Validate optional dwell thresholds
  const effectiveWarn = updates.dwellWarningSeconds !== undefined ? updates.dwellWarningSeconds : existing.dwellWarningSeconds;
  const effectiveMax = updates.maxDwellSeconds !== undefined ? updates.maxDwellSeconds : existing.maxDwellSeconds;

  if (updates.dwellWarningSeconds !== undefined) {
    if (
      typeof updates.dwellWarningSeconds !== 'number' ||
      isNaN(updates.dwellWarningSeconds) ||
      updates.dwellWarningSeconds <= 0
    ) {
      res.status(400).json({
        success: false,
        error: 'dwellWarningSeconds must be a positive number.',
      });
      return;
    }
  }
  if (updates.maxDwellSeconds !== undefined) {
    if (
      typeof updates.maxDwellSeconds !== 'number' ||
      isNaN(updates.maxDwellSeconds) ||
      updates.maxDwellSeconds <= 0
    ) {
      res.status(400).json({
        success: false,
        error: 'maxDwellSeconds must be a positive number.',
      });
      return;
    }
  }
  if (
    effectiveWarn !== undefined &&
    effectiveMax !== undefined &&
    effectiveWarn > effectiveMax
  ) {
    res.status(400).json({
      success: false,
      error: 'dwellWarningSeconds must be less than or equal to maxDwellSeconds.',
    });
    return;
  }

  try {
    const updated = dataStore.updateSpatialZone(id, updates, operator.callsign, req.ip);

    dataStore.broadcastEvent({
      eventId: `evt-zone-update-${Date.now()}`,
      eventType: 'zone.updated',
      timestamp: new Date().toISOString(),
      source: updated.cameraId,
      payload: updated,
    });

    res.json({
      success: true,
      zone: updated,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update spatial zone.';
    res.status(400).json({ success: false, error: message });
  }
});

// POST /api/v1/zones/:id/activate
zonesRouter.post('/:id/activate', (req: Request, res: Response) => {
  const operator = getOperatorContext(req);

  if (!hasPermission(operator.role, 'zone.activate')) {
    res.status(403).json({
      success: false,
      error: 'Forbidden: Insufficient permissions to activate zone (requires zone.activate).',
    });
    return;
  }

  const { id } = req.params;
  try {
    const activated = dataStore.activateSpatialZone(id, operator.callsign, req.ip);

    dataStore.broadcastEvent({
      eventId: `evt-zone-activate-${Date.now()}`,
      eventType: 'zone.activated',
      timestamp: new Date().toISOString(),
      source: activated.cameraId,
      payload: activated,
    });

    res.json({
      success: true,
      zone: activated,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to activate zone.';
    res.status(404).json({ success: false, error: message });
  }
});

// POST /api/v1/zones/:id/deactivate
zonesRouter.post('/:id/deactivate', (req: Request, res: Response) => {
  const operator = getOperatorContext(req);

  if (!hasPermission(operator.role, 'zone.deactivate')) {
    res.status(403).json({
      success: false,
      error: 'Forbidden: Insufficient permissions to deactivate zone (requires zone.deactivate).',
    });
    return;
  }

  const { id } = req.params;
  try {
    const deactivated = dataStore.deactivateSpatialZone(id, operator.callsign, req.ip);

    dataStore.broadcastEvent({
      eventId: `evt-zone-deactivate-${Date.now()}`,
      eventType: 'zone.deactivated',
      timestamp: new Date().toISOString(),
      source: deactivated.cameraId,
      payload: deactivated,
    });

    res.json({
      success: true,
      zone: deactivated,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to deactivate zone.';
    res.status(404).json({ success: false, error: message });
  }
});

// DELETE /api/v1/zones/:id
zonesRouter.delete('/:id', (req: Request, res: Response) => {
  const operator = getOperatorContext(req);

  if (!hasPermission(operator.role, 'zone.delete')) {
    res.status(403).json({
      success: false,
      error: 'Forbidden: Insufficient permissions to delete zone (requires zone.delete).',
    });
    return;
  }

  const { id } = req.params;
  try {
    dataStore.deleteSpatialZone(id, operator.callsign, req.ip);

    dataStore.broadcastEvent({
      eventId: `evt-zone-delete-${Date.now()}`,
      eventType: 'zone.deleted',
      timestamp: new Date().toISOString(),
      source: id,
      payload: { zoneId: id },
    });

    res.json({
      success: true,
      message: 'Zone deleted successfully.',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to delete zone.';
    res.status(404).json({ success: false, error: message });
  }
});
