// ============================================================================
// IBVAP Operational Metrics Telemetry
// Real measurements calculated from authoritative operational subsystems
// ============================================================================

import { Router, Request, Response } from 'express';
import { dataStore } from '../store';
import { persistenceManager } from '../../storage/db-adapter';
import { globalCache } from '../../storage/redis-adapter';
import { appConfig } from '../../config/app-config';

export const metricsRouter = Router();

// GET /api/v1/metrics
metricsRouter.get('/', async (req: Request, res: Response) => {
  const start = Date.now();
  const dbHealth = await persistenceManager.getAdapter().healthCheck();
  const cacheHealth = await globalCache.healthCheck();
  const memoryUsage = process.memoryUsage();

  // Cameras
  const totalCameras = dataStore.cameras.length;
  const onlineCameras = dataStore.cameras.filter(
    (c) => c.status === 'ONLINE' || c.connectionStatus === 'CONNECTED'
  ).length;
  const offlineCameras = totalCameras - onlineCameras;

  // Alerts
  const alertsBySeverity = {
    CRITICAL: dataStore.alerts.filter((a) => a.severity === 'CRITICAL').length,
    HIGH: dataStore.alerts.filter((a) => a.severity === 'HIGH').length,
    MEDIUM: dataStore.alerts.filter((a) => a.severity === 'MEDIUM').length,
    LOW: dataStore.alerts.filter((a) => a.severity === 'LOW' || a.severity === 'INFORMATION').length,
  };
  const activeAlertsCount = dataStore.alerts.filter((a) => a.status === 'PENDING_ACK' || a.status === 'ESCALATED').length;

  // Incidents
  const incidentsByStatus = {
    OPEN: dataStore.incidents.filter((i) => i.status === 'OPEN').length,
    INVESTIGATING: dataStore.incidents.filter((i) => i.status === 'INVESTIGATING').length,
    CONTAINED: dataStore.incidents.filter((i) => i.status === 'CONTAINED').length,
    RESOLVED: dataStore.incidents.filter((i) => i.status === 'RESOLVED').length,
    CLOSED: dataStore.incidents.filter((i) => i.status === 'CLOSED').length,
  };
  const totalIncidents = dataStore.incidents.length;

  // ANPR & Face
  const totalAnprObservations = dataStore.anprRecords.length;
  const anprWatchlistMatches = dataStore.anprRecords.filter((r) => r.isWatchlistMatch).length;

  // Events
  const totalEvents = dataStore.events.length;
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  const eventsLastHour = dataStore.events.filter(
    (e) => new Date(e.timestamp).getTime() >= oneHourAgo
  ).length;

  // Evidence
  const totalEvidenceItems = dataStore.evidence.length;
  const verifiedEvidenceCount = dataStore.evidence.filter((e) => e.isVerified).length;
  const totalEvidenceSizeBytes = dataStore.evidence.reduce(
    (sum, e) => sum + (e.fileSizeBytes || 0),
    0
  );

  // Realtime
  const sseSubscribersCount = dataStore.realtimeClients.size;

  const calculationDurationMs = Date.now() - start;

  res.json({
    success: true,
    profile: appConfig.profile,
    timestamp: new Date().toISOString(),
    metrics: {
      cameras: {
        total: totalCameras,
        online: onlineCameras,
        offline: offlineCameras,
        availabilityPercentage: totalCameras > 0 ? Math.round((onlineCameras / totalCameras) * 1000) / 10 : 100,
      },
      events: {
        totalIngested: totalEvents,
        eventsLastHour,
        estimatedRatePerMinute: Math.round((eventsLastHour / 60) * 10) / 10,
      },
      alerts: {
        total: dataStore.alerts.length,
        active: activeAlertsCount,
        bySeverity: alertsBySeverity,
      },
      incidents: {
        total: totalIncidents,
        active: incidentsByStatus.OPEN + incidentsByStatus.INVESTIGATING,
        byStatus: incidentsByStatus,
      },
      anpr: {
        totalObservations: totalAnprObservations,
        watchlistMatches: anprWatchlistMatches,
      },
      evidence: {
        totalItems: totalEvidenceItems,
        verifiedCount: verifiedEvidenceCount,
        totalSizeBytes: totalEvidenceSizeBytes,
      },
      realtime: {
        activeSseSubscribers: sseSubscribersCount,
      },
      infrastructure: {
        database: {
          adapter: dbHealth.adapterType,
          status: dbHealth.status,
          latencyMs: dbHealth.latencyMs,
        },
        cache: {
          status: cacheHealth.status,
          latencyMs: cacheHealth.latencyMs,
        },
        process: {
          uptimeSeconds: Math.floor(process.uptime()),
          heapUsedMb: Math.round(memoryUsage.heapUsed / 1024 / 1024),
          heapTotalMb: Math.round(memoryUsage.heapTotal / 1024 / 1024),
          rssMb: Math.round(memoryUsage.rss / 1024 / 1024),
        },
      },
      telemetryLatencyMs: calculationDurationMs,
    },
  });
});
