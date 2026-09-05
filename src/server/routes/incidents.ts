import { Router, Request, Response } from 'express';
import { dataStore } from '../store';
import { logger } from '../logger';
import { IncidentStatus, AlertSeverity } from '../types';

export const incidentsRouter = Router();

// GET /api/v1/incidents
incidentsRouter.get('/', (req: Request, res: Response) => {
  const { status, sectorId } = req.query;
  let list = [...dataStore.incidents];

  if (status && typeof status === 'string' && status !== 'ALL') {
    list = list.filter((i) => i.status === status);
  }
  if (sectorId && typeof sectorId === 'string') {
    list = list.filter((i) => i.sectorId === sectorId);
  }

  res.json({
    success: true,
    total: list.length,
    incidents: list,
  });
});

// GET /api/v1/incidents/:id
incidentsRouter.get('/:id', (req: Request, res: Response) => {
  const incident = dataStore.incidents.find(
    (i) => i.id === req.params.id || i.incidentNumber.toLowerCase() === req.params.id.toLowerCase()
  );
  if (!incident) {
    res.status(404).json({ success: false, error: 'Incident not found' });
    return;
  }
  res.json({ success: true, incident });
});

// PATCH /api/v1/incidents/:id/status
incidentsRouter.patch('/:id/status', (req: Request, res: Response) => {
  const { status, operatorCallsign = 'SENTINEL-LEAD', notes } = req.body;
  const incident = dataStore.incidents.find((i) => i.id === req.params.id);
  if (!incident) {
    res.status(404).json({ success: false, error: 'Incident not found' });
    return;
  }

  const oldStatus = incident.status;
  incident.status = status as IncidentStatus;
  if (status === 'RESOLVED' || status === 'CLOSED') {
    incident.resolvedAt = new Date().toISOString();
  }

  incident.timeline.push({
    id: `tl-${Date.now()}`,
    timestamp: new Date().toISOString(),
    actorCallsign: operatorCallsign,
    actionType: 'STATUS_CHANGE',
    description: `Status transitioned from ${oldStatus} to ${status}. ${notes ? `Note: ${notes}` : ''}`,
  });

  dataStore.logAudit(
    operatorCallsign,
    'INCIDENT_STATUS_CHANGE',
    'INCIDENT',
    incident.incidentNumber,
    req.ip || '127.0.0.1',
    { oldStatus, newStatus: status, notes }
  );

  dataStore.broadcastEvent({
    eventId: `evt-inc-up-${Date.now()}`,
    eventType: 'incident.updated',
    timestamp: new Date().toISOString(),
    source: incident.incidentNumber,
    payload: incident,
  });

  logger.info(`Incident ${incident.incidentNumber} status changed to ${status}`);
  res.json({ success: true, incident });
});

// POST /api/v1/incidents/:id/timeline
incidentsRouter.post('/:id/timeline', (req: Request, res: Response) => {
  const { actionType, description, operatorCallsign = 'SENTINEL-LEAD' } = req.body;
  const incident = dataStore.incidents.find((i) => i.id === req.params.id);
  if (!incident) {
    res.status(404).json({ success: false, error: 'Incident not found' });
    return;
  }

  const entry = {
    id: `tl-${Date.now()}`,
    timestamp: new Date().toISOString(),
    actorCallsign: operatorCallsign,
    actionType: actionType || 'COMMANDER_DISPATCH',
    description: description || 'Operator action recorded',
  };

  incident.timeline.push(entry);
  dataStore.logAudit(
    operatorCallsign,
    'INCIDENT_TIMELINE_ACTION',
    'INCIDENT',
    incident.incidentNumber,
    req.ip || '127.0.0.1',
    { actionType, description }
  );

  res.json({ success: true, incident, entry });
});
