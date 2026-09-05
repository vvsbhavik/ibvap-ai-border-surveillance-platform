import { Router, Request, Response } from 'express';
import { dataStore } from '../store';
import { logger } from '../logger';
import { AlertSeverity, AlertStatus } from '../types';

export const alertsRouter = Router();

// GET /api/v1/alerts
alertsRouter.get('/', (req: Request, res: Response) => {
  const { severity, status, sectorId } = req.query;
  let list = [...dataStore.alerts];

  if (severity && typeof severity === 'string' && severity !== 'ALL') {
    list = list.filter((a) => a.severity === severity);
  }
  if (status && typeof status === 'string' && status !== 'ALL') {
    list = list.filter((a) => a.status === status);
  }
  if (sectorId && typeof sectorId === 'string') {
    list = list.filter((a) => a.sectorId === sectorId);
  }

  res.json({
    success: true,
    total: list.length,
    alerts: list,
  });
});

// GET /api/v1/alerts/:id
alertsRouter.get('/:id', (req: Request, res: Response) => {
  const alert = dataStore.alerts.find((a) => a.id === req.params.id);
  if (!alert) {
    res.status(404).json({ success: false, error: 'Alert not found' });
    return;
  }
  res.json({ success: true, alert });
});

// POST /api/v1/alerts/:id/acknowledge
alertsRouter.patch('/:id/acknowledge', (req: Request, res: Response) => {
  const { operatorCallsign = 'SENTINEL-LEAD', notes } = req.body;
  const alert = dataStore.alerts.find((a) => a.id === req.params.id);
  if (!alert) {
    res.status(404).json({ success: false, error: 'Alert not found' });
    return;
  }

  alert.status = 'ACKNOWLEDGED';
  alert.acknowledgedBy = operatorCallsign;
  alert.acknowledgedAt = new Date().toISOString();

  dataStore.logAudit(
    operatorCallsign,
    'ACKNOWLEDGE_ALERT',
    'ALERT',
    alert.id,
    req.ip || '127.0.0.1',
    { title: alert.title, camera: alert.cameraIdentifier, notes }
  );

  dataStore.broadcastEvent({
    eventId: `evt-ack-${Date.now()}`,
    eventType: 'alert.acknowledged',
    timestamp: new Date().toISOString(),
    source: alert.cameraIdentifier,
    payload: alert,
  });

  logger.info(`Alert ${alert.id} acknowledged by ${operatorCallsign}`);
  res.json({ success: true, alert });
});

// POST /api/v1/alerts/:id/escalate
alertsRouter.post('/:id/escalate', (req: Request, res: Response) => {
  const { operatorCallsign = 'SENTINEL-LEAD', incidentTitle, incidentSummary } = req.body;
  const alert = dataStore.alerts.find((a) => a.id === req.params.id);
  if (!alert) {
    res.status(404).json({ success: false, error: 'Alert not found' });
    return;
  }

  const incidentNumber = `INC-2026-${Math.floor(1000 + Math.random() * 9000)}`;
  const newIncident = {
    id: `inc-${Date.now()}`,
    incidentNumber,
    title: incidentTitle || alert.title,
    summary: incidentSummary || alert.description,
    severity: alert.severity,
    status: 'OPEN' as const,
    sectorId: alert.sectorId,
    sectorName: alert.sectorName,
    primaryCameraId: alert.cameraId,
    primaryCameraIdentifier: alert.cameraIdentifier,
    leadCommanderCallsign: operatorCallsign,
    createdAt: new Date().toISOString(),
    relatedCameraIdentifiers: [alert.cameraIdentifier],
    evidenceCount: 1,
    timeline: [
      {
        id: `tl-esc-${Date.now()}`,
        timestamp: new Date().toISOString(),
        actorCallsign: operatorCallsign,
        actionType: 'TRIGGER_ALARM' as const,
        description: `Escalated from Alert ${alert.id} (${alert.title}).`,
      },
    ],
  };

  dataStore.incidents.unshift(newIncident);
  alert.status = 'ESCALATED';
  alert.escalatedToIncidentId = newIncident.id;

  dataStore.logAudit(
    operatorCallsign,
    'ESCALATE_ALERT_TO_INCIDENT',
    'ALERT',
    alert.id,
    req.ip || '127.0.0.1',
    { incidentNumber: newIncident.incidentNumber, camera: alert.cameraIdentifier }
  );

  dataStore.broadcastEvent({
    eventId: `evt-inc-${Date.now()}`,
    eventType: 'incident.created',
    timestamp: new Date().toISOString(),
    source: alert.cameraIdentifier,
    payload: newIncident,
  });

  logger.info(`Alert ${alert.id} escalated to Incident ${incidentNumber} by ${operatorCallsign}`);
  res.json({ success: true, alert, incident: newIncident });
});

// POST /api/v1/alerts/:id/dismiss
alertsRouter.patch('/:id/dismiss', (req: Request, res: Response) => {
  const { operatorCallsign = 'SENTINEL-LEAD', reason } = req.body;
  const alert = dataStore.alerts.find((a) => a.id === req.params.id);
  if (!alert) {
    res.status(404).json({ success: false, error: 'Alert not found' });
    return;
  }

  alert.status = 'DISMISSED';
  dataStore.logAudit(
    operatorCallsign,
    'DISMISS_ALERT',
    'ALERT',
    alert.id,
    req.ip || '127.0.0.1',
    { reason }
  );

  res.json({ success: true, alert });
});
