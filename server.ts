import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { logger } from './src/server/logger';
import { liveHandler, readyHandler, healthRouter } from './src/server/routes/health';
import { authRouter } from './src/server/routes/auth';
import { usersRouter } from './src/server/routes/users';
import { camerasRouter } from './src/server/routes/cameras';
import { eventsRouter } from './src/server/routes/events';
import { alertsRouter } from './src/server/routes/alerts';
import { incidentsRouter } from './src/server/routes/incidents';
import { evidenceRouter } from './src/server/routes/evidence';
import { zonesRouter } from './src/server/routes/zones';
import { anprRouter } from './src/server/routes/anpr';
import { watchlistsRouter } from './src/server/routes/watchlists';
import { systemRouter } from './src/server/routes/system';
import { realtimeRouter } from './src/server/routes/realtime';
import { videoRouter } from './src/server/routes/video';
import { detectionsRouter } from './src/server/routes/detections';
import { aiRouter } from './src/server/routes/ai';
import { tracksRouter } from './src/server/routes/tracks';
import { trackingRouter } from './src/server/routes/tracking';
import { videoGateway } from './src/video-gateway/video-gateway';
import { aiInferenceService } from './src/ai-inference/inference-service';
import { trackingService } from './src/tracking/tracking-service';
import { spatialEngine } from './src/spatial/spatial-engine';
import { dataStore } from './src/server/store';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Basic security headers
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('X-DNS-Prefetch-Control', 'off');
    next();
  });

  // Body parsers
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Request logger middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (!req.path.startsWith('/@') && !req.path.includes('.')) {
      const start = Date.now();
      res.on('finish', () => {
        const duration = Date.now() - start;
        if (res.statusCode >= 400) {
          logger.warn(`${req.method} ${req.path} ${res.statusCode} (${duration}ms)`);
        }
      });
    }
    next();
  });

  // 1. Health Probes (Section 26 of Spec)
  app.get('/health/live', liveHandler);
  app.get('/health/ready', readyHandler);

  // 2. Versioned API Routes (/api/v1)
  const apiRouter = express.Router();
  apiRouter.use('/auth', authRouter);
  apiRouter.use('/users', usersRouter);
  apiRouter.use('/cameras', camerasRouter);
  apiRouter.use('/events', eventsRouter);
  apiRouter.use('/alerts', alertsRouter);
  apiRouter.use('/incidents', incidentsRouter);
  apiRouter.use('/evidence', evidenceRouter);
  apiRouter.use('/zones', zonesRouter);
  apiRouter.use('/anpr', anprRouter);
  apiRouter.use('/watchlists', watchlistsRouter);
  apiRouter.use('/health', healthRouter);
  apiRouter.use('/system', systemRouter);
  apiRouter.use('/realtime', realtimeRouter);
  apiRouter.use('/video', videoRouter);
  apiRouter.use('/detections', detectionsRouter);
  apiRouter.use('/ai', aiRouter);
  apiRouter.use('/tracks', tracksRouter);
  apiRouter.use('/tracking', trackingRouter);

  // Hook Video Gateway real-time telemetry events to IBVAP DataStore and SSE event bus
  videoGateway.addEventListener((event) => {
    const cam = dataStore.cameras.find((c) => c.id === event.cameraId || c.cameraId === event.cameraId);
    if (cam) {
      if (event.telemetry.connectionState === 'CONNECTED') {
        cam.connectionStatus = 'CONNECTED';
        cam.currentFps = event.telemetry.currentFps;
        cam.currentLatencyMs = event.telemetry.currentLatencyMs ?? undefined;
        cam.lastHeartbeatAt = event.telemetry.lastHeartbeatAt;
      } else if (event.telemetry.connectionState === 'DEGRADED') {
        cam.currentFps = event.telemetry.currentFps;
        cam.currentLatencyMs = event.telemetry.currentLatencyMs ?? undefined;
      } else if (event.telemetry.connectionState === 'DISCONNECTED' || event.telemetry.connectionState === 'ERROR') {
        cam.connectionStatus = 'DISCONNECTED';
        cam.currentFps = 0;
        cam.currentLatencyMs = undefined;
      }

      dataStore.broadcastEvent({
        eventId: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        eventType: event.eventType,
        timestamp: event.timestamp,
        source: cam.cameraId || cam.id,
        payload: {
          cameraId: cam.id,
          cameraIdentifier: cam.cameraId,
          telemetry: event.telemetry,
          error: event.error,
        },
      });
    }
  });

  // Hook AI Computer Vision person detections to DataStore event bus & SSE
  aiInferenceService.onDetection((detection) => {
    const cam = dataStore.cameras.find((c) => c.id === detection.cameraId || c.cameraId === detection.cameraId);
    
    // Broadcast real-time ai.person_detected event
    dataStore.broadcastEvent({
      eventId: detection.detectionId,
      eventType: 'ai.person_detected',
      timestamp: detection.timestamp,
      source: cam?.cameraId || detection.cameraId,
      payload: {
        detectionId: detection.detectionId,
        cameraId: detection.cameraId,
        cameraIdentifier: cam?.cameraId || detection.cameraId,
        timestamp: detection.timestamp,
        inferenceTimestamp: detection.inferenceTimestamp,
        objectType: detection.objectType,
        confidence: detection.confidence,
        boundingBox: detection.boundingBox,
        pixelBox: detection.pixelBox,
        frameReference: detection.frameReference,
        modelVersion: detection.modelVersion,
      },
    });
  });

  const zoneOccupancySignatures = new Map<string, string>();

  // Continuous frame-level Multi-Object Tracking & Spatial Evaluation pipeline
  trackingService.onTrackingFrame((frame) => {
    const cam = dataStore.cameras.find((c) => c.id === frame.cameraId || c.cameraId === frame.cameraId);
    const cameraIdentifier = cam?.cameraId || frame.cameraId;

    // Evaluate all active and ended tracks against active camera-scoped spatial zones and fences
    const activeZones = dataStore.getSpatialZones({ cameraId: cameraIdentifier, active: true });
    if (activeZones.length > 0) {
      const tracksToEvaluate = [...frame.tracks, ...frame.endedTracks];
      const spatialEvts = spatialEngine.evaluateCameraTracks(
        cameraIdentifier,
        cameraIdentifier,
        tracksToEvaluate,
        activeZones,
        frame.timestamp
      );

      for (const spEvt of spatialEvts) {
        dataStore.addSpatialEvent(spEvt);

        // Broadcast spatial event to real-time event bus
        dataStore.broadcastEvent({
          eventId: spEvt.eventId,
          eventType: spEvt.eventType,
          timestamp: spEvt.timestamp,
          source: cameraIdentifier,
          payload: spEvt,
        });

        // Trigger operational alerts on restricted area intrusions, dwell violations, or fence breaches
        if (spEvt.severity === 'CRITICAL' || spEvt.severity === 'HIGH') {
          const alertId = `alt-sp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
          const ruleType =
            spEvt.eventType === 'fence.crossed'
              ? 'VIRTUAL_FENCE_BREACH'
              : spEvt.eventType === 'zone.dwell_warning'
              ? 'ZONE_DWELL_VIOLATION'
              : 'ZONE_INTRUSION';

          const matchingTrack = tracksToEvaluate.find((t) => t.trackId === spEvt.trackId);
          const numericId = matchingTrack?.numericId ? `#${matchingTrack.numericId}` : spEvt.trackId;

          const alertRecord = {
            id: alertId,
            alertId,
            cameraId: cameraIdentifier,
            cameraIdentifier,
            zoneId: spEvt.zoneId,
            zoneName: spEvt.zoneName,
            sectorId: cam?.sectorId || 'sec-bravo',
            sectorName: cam?.sectorName || 'Sector Bravo',
            ruleType,
            severity: spEvt.severity,
            status: 'NEW' as const,
            title: `${
              spEvt.eventType === 'fence.crossed'
                ? 'Virtual Fence Breach'
                : spEvt.eventType === 'zone.dwell_warning'
                ? 'Zone Dwell Violation'
                : 'Perimeter Zone Intrusion'
            }: ${spEvt.zoneName}`,
            description: `Target Track ${numericId} triggered ${spEvt.eventType} on ${spEvt.zoneName} (${cameraIdentifier})`,
            timestamp: spEvt.timestamp,
            firstDetectedAt: matchingTrack?.firstSeenAt || spEvt.timestamp,
            lastDetectedAt: matchingTrack?.lastSeenAt || spEvt.timestamp,
            threatScore: spEvt.severity === 'CRITICAL' ? 95 : 80,
            confidence: matchingTrack?.currentConfidence || 0.95,
            acknowledged: false,
            source: 'SPATIAL_ENGINE',
            isSimulation: false,
            eventId: spEvt.eventId,
            trackId: spEvt.trackId,
            position: spEvt.position,
            direction: spEvt.direction || spEvt.crossingDirection,
            evidenceReference: 'unavailable',
            escalatedToIncidentId: undefined as string | undefined,
          };

          // Operational link: Link to existing active incident or escalate critical alarm
          const existingIncident = dataStore.incidents.find(
            (inc) =>
              (inc.status === 'OPEN' || inc.status === 'INVESTIGATING') &&
              (inc.primaryCameraId === cameraIdentifier ||
                inc.primaryCameraId === cam?.id ||
                inc.sectorId === cam?.sectorId)
          );

          if (existingIncident) {
            alertRecord.escalatedToIncidentId = existingIncident.id;
            existingIncident.timeline.push({
              id: `tml-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              timestamp: spEvt.timestamp,
              actorCallsign: 'SPATIAL_ENGINE',
              actionType: 'TRIGGER_ALARM',
              description: `${spEvt.eventType} on ${spEvt.zoneName} by ${spEvt.trackId}`,
              metadata: {
                eventId: spEvt.eventId,
                alertId,
                trackId: spEvt.trackId,
                zoneId: spEvt.zoneId,
                position: spEvt.position,
                direction: spEvt.direction || spEvt.crossingDirection,
                severity: spEvt.severity,
                evidenceReference: 'unavailable',
              },
            });
            dataStore.broadcastEvent({
              eventId: `evt-inc-upd-${Date.now()}`,
              eventType: 'incident.updated',
              timestamp: spEvt.timestamp,
              source: cameraIdentifier,
              payload: existingIncident,
            });
          } else if (spEvt.severity === 'CRITICAL') {
            const incidentId = `inc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
            const incNum = `INC-${new Date().getFullYear()}-${String(dataStore.incidents.length + 1).padStart(4, '0')}`;
            const newIncident = {
              id: incidentId,
              incidentNumber: incNum,
              title: `${spEvt.eventType === 'fence.crossed' ? 'Virtual Fence Breach' : 'Perimeter Zone Intrusion'}: ${spEvt.zoneName}`,
              summary: `Automated spatial alarm triggered by Track ${spEvt.trackId} on ${spEvt.zoneName} (${cameraIdentifier}).`,
              severity: spEvt.severity,
              status: 'OPEN' as const,
              sectorId: cam?.sectorId || 'sec-bravo',
              sectorName: cam?.sectorName || 'Sector Bravo',
              primaryCameraId: cam?.id || cameraIdentifier,
              primaryCameraIdentifier: cameraIdentifier,
              leadCommanderCallsign: 'SPATIAL_WATCH',
              createdAt: spEvt.timestamp,
              relatedCameraIdentifiers: [cameraIdentifier],
              evidenceCount: 1,
              containmentNotes: `Automatic escalation from spatial ${spEvt.eventType} event ${spEvt.eventId}. Track: ${spEvt.trackId}. Evidence: unavailable.`,
              timeline: [
                {
                  id: `tml-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                  timestamp: spEvt.timestamp,
                  actorCallsign: 'SPATIAL_ENGINE',
                  actionType: 'TRIGGER_ALARM',
                  description: `Initial ${spEvt.eventType} on ${spEvt.zoneName} by ${spEvt.trackId}`,
                  metadata: {
                    eventId: spEvt.eventId,
                    alertId,
                    trackId: spEvt.trackId,
                    zoneId: spEvt.zoneId,
                    position: spEvt.position,
                    direction: spEvt.direction || spEvt.crossingDirection,
                    severity: spEvt.severity,
                    evidenceReference: 'unavailable',
                  },
                },
              ],
            };
            dataStore.incidents.unshift(newIncident as any);
            alertRecord.escalatedToIncidentId = incidentId;
            dataStore.broadcastEvent({
              eventId: `evt-inc-create-${incidentId}`,
              eventType: 'incident.created',
              timestamp: spEvt.timestamp,
              source: cameraIdentifier,
              payload: newIncident,
            });
          }

          dataStore.alerts.unshift(alertRecord as any);

          dataStore.broadcastEvent({
            eventId: `evt-alert-${alertId}`,
            eventType: 'alert.created',
            timestamp: spEvt.timestamp,
            source: cameraIdentifier,
            payload: alertRecord,
          });
        }
      }

      // Check and dispatch zone.occupancy_changed events for active polygon zones
      for (const zone of activeZones) {
        if (zone.geometry === 'POLYGON') {
          const occ = spatialEngine.getZoneOccupancy(zone, frame.tracks);
          const sig = occ.occupantTrackIds.slice().sort().join(',');
          const prevSig = zoneOccupancySignatures.get(zone.zoneId);
          if (prevSig !== sig) {
            zoneOccupancySignatures.set(zone.zoneId, sig);
            dataStore.broadcastEvent({
              eventId: `evt-occ-${Date.now()}-${zone.zoneId}`,
              eventType: 'zone.occupancy_changed',
              timestamp: frame.timestamp,
              source: cameraIdentifier,
              payload: {
                zoneId: zone.zoneId,
                cameraId: cameraIdentifier,
                zoneName: zone.name,
                currentOccupants: occ.currentOccupants,
                occupantTrackIds: occ.occupantTrackIds,
                oldestOccupantAt: occ.oldestOccupantAt,
                updatedAt: occ.updatedAt,
              },
            });
          }
        }
      }
    }
  });

  // Hook Multi-Object Tracking events to DataStore event bus
  trackingService.onTrackingEvent((event) => {
    const cam = dataStore.cameras.find((c) => c.id === event.cameraId || c.cameraId === event.cameraId);

    dataStore.broadcastEvent({
      eventId: event.eventId,
      eventType: event.eventType,
      timestamp: event.timestamp,
      source: cam?.cameraId || event.cameraId,
      payload: {
        cameraId: event.cameraId,
        cameraIdentifier: cam?.cameraId || event.cameraId,
        timestamp: event.timestamp,
        track: {
          trackId: event.track.trackId,
          numericId: event.track.numericId,
          objectType: event.track.objectType,
          firstSeenAt: event.track.firstSeenAt,
          lastSeenAt: event.track.lastSeenAt,
          boundingBox: event.track.lastBoundingBox,
          pixelBox: event.track.lastPixelBox,
          confidence: event.track.currentConfidence,
          direction: event.track.direction,
          dwellTimeSeconds: event.track.dwellTimeSeconds,
          state: event.track.state,
          detectionCount: event.track.detectionCount,
          missedFrames: event.track.missedFrames,
          trajectory: event.track.trajectory,
        },
      },
    });
  });

  // Listen for internal SpatialEngine events (e.g. exit on lost tracks or dwell ticks)
  spatialEngine.onEvent((spEvt) => {
    dataStore.addSpatialEvent(spEvt);
    dataStore.broadcastEvent({
      eventId: spEvt.eventId,
      eventType: spEvt.eventType,
      timestamp: spEvt.timestamp,
      source: spEvt.cameraIdentifier,
      payload: spEvt,
    });
  });

  app.use('/api/v1', apiRouter);

  // 3. Frontend Serving
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', async () => {
    logger.info(`IBVAP Command-and-Control Server listening on http://0.0.0.0:${PORT}`);

    // Initialize Video Gateway stream sessions for registered cameras
    try {
      await videoGateway.initialize(dataStore.cameras);
    } catch (vgErr) {
      console.error('[server] Video Gateway initialization notice:', vgErr);
    }

    // Initialize AI Computer Vision subsystem asynchronously in background
    setTimeout(() => {
      aiInferenceService.initialize().then(() => {
        console.log('[server] AI Computer Vision Person Detection & Tracking Subsystem ready');
      }).catch((err) => {
        console.error('[server] Failed to initialize AI inference service:', err);
      });
    }, 1000);
  });
}

startServer().catch((err) => {
  logger.error('Failed to initialize IBVAP server', { error: String(err) });
  process.exit(1);
});
