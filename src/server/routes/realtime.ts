// ============================================================================
// IBVAP Hardened Server-Sent Events (SSE) Realtime Stream
// Resilient connection handling, heartbeat keepalives, and client lifecycle management
// ============================================================================

import { Router, Request, Response } from 'express';
import { dataStore } from '../store';
import { logger } from '../logger';
import { RealtimeEventEnvelope } from '../types';

export const realtimeRouter = Router();

const MAX_SSE_CLIENTS = 500;

// GET /api/v1/realtime/events
realtimeRouter.get('/events', (req: Request, res: Response) => {
  if (dataStore.realtimeClients.size >= MAX_SSE_CLIENTS) {
    res.status(503).json({
      success: false,
      error: 'Max realtime streaming subscriber limit reached. Please retry shortly.',
      code: 'MAX_SUBSCRIBERS_EXCEEDED',
    });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable proxy buffering (nginx / Cloud Run)
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
      activeIncidentsCount: dataStore.incidents.filter(
        (i) => i.status === 'OPEN' || i.status === 'INVESTIGATING'
      ).length,
      connectedClientsCount: dataStore.realtimeClients.size + 1,
    },
  };

  try {
    res.write(`data: ${JSON.stringify(initialEnvelope)}\n\n`);
  } catch (err) {
    logger.warn('Failed to write initial SSE handshake', { error: String(err) });
    res.end();
    return;
  }

  let isClosed = false;

  const cleanup = () => {
    if (isClosed) return;
    isClosed = true;
    clearInterval(heartbeatTimer);
    dataStore.realtimeClients.delete(clientListener);
    try {
      res.end();
    } catch {
      // Ignored
    }
  };

  const clientListener = (envelope: RealtimeEventEnvelope) => {
    if (isClosed) return;
    try {
      res.write(`data: ${JSON.stringify(envelope)}\n\n`);
    } catch (err) {
      logger.debug('SSE write error, cleaning up stale client', { error: String(err) });
      cleanup();
    }
  };

  dataStore.realtimeClients.add(clientListener);

  // Heartbeat comment ping every 15 seconds to keep proxies and firewalls open
  const heartbeatTimer = setInterval(() => {
    if (isClosed) {
      clearInterval(heartbeatTimer);
      return;
    }
    try {
      const heartbeat: RealtimeEventEnvelope = {
        eventId: `hb-${Date.now()}`,
        eventType: 'system.heartbeat',
        timestamp: new Date().toISOString(),
        source: 'ibvap-realtime-broker',
        payload: {
          ping: 'ok',
          serverTime: new Date().toISOString(),
          subscribers: dataStore.realtimeClients.size,
        },
      };
      res.write(`data: ${JSON.stringify(heartbeat)}\n\n`);
    } catch {
      cleanup();
    }
  }, 15000);

  req.on('close', cleanup);
  req.on('error', cleanup);
});
