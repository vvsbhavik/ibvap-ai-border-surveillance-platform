import { Router, Request, Response } from 'express';
import { dataStore } from '../store';
import { logger } from '../logger';
import { RealtimeEventEnvelope } from '../types';

export const realtimeRouter = Router();

// GET /api/v1/realtime/events
// Server-Sent Events (SSE) endpoint conforming to Section 23 Standard Event Envelope
realtimeRouter.get('/events', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  // Initial connection hello envelope
  const initialEnvelope: RealtimeEventEnvelope = {
    eventId: `init-${Date.now()}`,
    eventType: 'system.connection_established',
    timestamp: new Date().toISOString(),
    source: 'ibvap-realtime-broker',
    payload: {
      status: 'CONNECTED',
      activeAlertsCount: dataStore.alerts.filter((a) => a.status === 'PENDING_ACK').length,
      activeIncidentsCount: dataStore.incidents.filter((i) => i.status === 'OPEN' || i.status === 'INVESTIGATING').length,
    },
  };

  res.write(`data: ${JSON.stringify(initialEnvelope)}\n\n`);

  const clientListener = (envelope: RealtimeEventEnvelope) => {
    res.write(`data: ${JSON.stringify(envelope)}\n\n`);
  };

  dataStore.realtimeClients.add(clientListener);
  logger.debug('Realtime SSE client connected to IBVAP event bus');

  // Heartbeat every 20 seconds
  const heartbeatTimer = setInterval(() => {
    const heartbeat: RealtimeEventEnvelope = {
      eventId: `hb-${Date.now()}`,
      eventType: 'system.heartbeat',
      timestamp: new Date().toISOString(),
      source: 'ibvap-realtime-broker',
      payload: { ping: 'ok', serverTime: new Date().toISOString() },
    };
    res.write(`data: ${JSON.stringify(heartbeat)}\n\n`);
  }, 20000);

  req.on('close', () => {
    clearInterval(heartbeatTimer);
    dataStore.realtimeClients.delete(clientListener);
    logger.debug('Realtime SSE client disconnected');
  });
});
