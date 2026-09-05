import { Router, Request, Response } from 'express';
import { dataStore } from '../store';
import { logger } from '../logger';

export const eventsRouter = Router();

// GET /api/v1/events
eventsRouter.get('/', (req: Request, res: Response) => {
  // Return priority alerts formatted as mission-control event stream
  const { limit = 20 } = req.query;
  const numLimit = Math.min(Number(limit) || 20, 100);

  const eventFeed = dataStore.alerts.slice(0, numLimit).map((a) => ({
    eventId: a.id,
    eventType: `detection.${a.severity.toLowerCase()}`,
    title: a.title,
    description: a.description,
    what: a.title,
    where: `${a.cameraIdentifier} • ${a.sectorName}`,
    when: a.timestamp,
    priority: a.severity,
    confidenceScore: a.confidenceScore,
    isSimulation: a.isSimulation ?? true,
    reasoningFactors: a.reasoningFactors,
  }));

  res.json({
    success: true,
    total: eventFeed.length,
    events: eventFeed,
  });
});

// POST /api/v1/events/simulate
// For operational readiness testing and drills
eventsRouter.post('/simulate', (req: Request, res: Response) => {
  const { type = 'RESTRICTED_ZONE_INTRUSION', sectorId = 'sec-bravo', cameraId = 'cam-01' } = req.body;
  const camera = dataStore.cameras.find((c) => c.id === cameraId) || dataStore.cameras[0];
  const sector = dataStore.sectors.find((s) => s.id === sectorId) || dataStore.sectors[0];

  const newAlert = {
    id: `alt-sim-${Date.now()}`,
    title: 'Restricted-zone intrusion [SIMULATION MODE]',
    description: 'Simulated alert generated for perimeter monitoring verification.',
    severity: 'HIGH' as const,
    status: 'PENDING_ACK' as const,
    cameraId: camera.id,
    cameraIdentifier: camera.identifier,
    sectorId: sector.id,
    sectorName: sector.name,
    timestamp: new Date().toISOString(),
    confidenceScore: 0.962,
    reasoningFactors: [
      { factor: 'Simulation boundary trigger event', weight: 0.60, verified: true, detail: 'Simulation mode event sequence #44' },
      { factor: 'Thermal signature synthetic biped', weight: 0.40, verified: true, detail: 'Simulated target profile velocity 1.3 m/s' },
    ],
    thumbnailUrl: camera.thumbnailUrl,
    isSimulation: true,
  };

  dataStore.alerts.unshift(newAlert);
  dataStore.broadcastEvent({
    eventId: newAlert.id,
    eventType: 'alert.new',
    timestamp: newAlert.timestamp,
    source: camera.identifier,
    payload: newAlert,
  });

  logger.info(`Synthetic event drill simulated on ${camera.identifier}`);
  res.json({ success: true, alert: newAlert });
});
