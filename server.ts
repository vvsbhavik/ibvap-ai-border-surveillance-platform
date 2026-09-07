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
import { facesRouter } from './src/server/routes/faces';
import { analyticsRouter } from './src/server/routes/analytics';
import { gisRouter } from './src/server/routes/gis';
import { cameraTrustRouter } from './src/server/routes/camera-trust';
import { simulationRouter } from './src/server/routes/simulation';
import { edgeRouter } from './src/server/routes/edge';
import { metricsRouter } from './src/server/routes/metrics';
import { securityHeaders, centralizedErrorHandler } from './src/server/middleware/security';
import { appConfig, validateConfig } from './src/config/app-config';
import { persistenceManager } from './src/storage/db-adapter';
import { videoGateway } from './src/video-gateway/video-gateway';
import { aiInferenceService } from './src/ai-inference/inference-service';
import { trackingService } from './src/tracking/tracking-service';
import { spatialEngine } from './src/spatial/spatial-engine';
import { faceService } from './src/face/face-service';
import { anprService } from './src/anpr/anpr-service';
import { dataStore } from './src/server/store';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Enterprise security headers
  app.use(securityHeaders);

  // Body parsers - allow up to 15mb for live video frames and base64 canvas ingestion
  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ extended: true, limit: '15mb' }));

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
  apiRouter.use('/faces', facesRouter);
  apiRouter.use('/analytics', analyticsRouter);
  apiRouter.use('/gis', gisRouter);
  apiRouter.use('/camera-trust', cameraTrustRouter);
  apiRouter.use('/simulation', simulationRouter);
  apiRouter.use('/edge', edgeRouter);
  apiRouter.use('/metrics', metricsRouter);

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

    // --- Face Analytics & ANPR Integration in Unified Pipeline ---
    const rawFrame = videoGateway.getLatestFrame(frame.cameraId);
    const activePersonTracks = frame.tracks.filter((t) => t.objectType === 'person' && t.state !== 'ENDED');
    const activeVehicleTracks = frame.tracks.filter((t) => t.objectType === 'vehicle' && t.state !== 'ENDED');

    if (activePersonTracks.length > 0) {
      try {
        faceService.processFrame(rawFrame, activePersonTracks, {
          getSpatialContext: (t) => spatialEngine.getTrackSpatialContext(t.trackId, activeZones),
        });
      } catch (err) {
        console.error('[Pipeline] Face analytics execution error:', err);
      }
    }

    if (activeVehicleTracks.length > 0) {
      try {
        anprService.processFrame(
          rawFrame || ({ cameraId: cameraIdentifier, timestamp: frame.timestamp, width: 1920, height: 1080 } as any),
          activeVehicleTracks,
          {
            getSpatialContext: (t) => spatialEngine.getTrackSpatialContext(t.trackId, activeZones),
          }
        );
      } catch (err) {
        console.error('[Pipeline] ANPR execution error:', err);
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

  // Hook Face Analytics events to DataStore realtime event bus & create alerts on biometric hits
  faceService.onFaceEvent((faceEvt) => {
    dataStore.broadcastEvent({
      eventId: faceEvt.eventId,
      eventType: faceEvt.eventType,
      timestamp: faceEvt.timestamp,
      source: faceEvt.cameraIdentifier || faceEvt.cameraId,
      payload: faceEvt,
    });

    // Create high-priority alert on confirmed biometric watchlist match
    if (faceEvt.eventType === 'face.match.confirmed') {
      const alertId = `alt-face-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const cam = dataStore.cameras.find((c) => c.id === faceEvt.cameraId || c.cameraId === faceEvt.cameraId);

      const faceAlert = {
        id: alertId,
        alertId,
        cameraId: faceEvt.cameraId,
        cameraIdentifier: faceEvt.cameraIdentifier || faceEvt.cameraId,
        zoneId: faceEvt.zoneId,
        zoneName: faceEvt.spatialContext?.zoneName || 'Surveillance Sector',
        sectorId: cam?.sectorId || 'sec-bravo',
        sectorName: cam?.sectorName || 'Sector Bravo',
        ruleType: 'FACE_WATCHLIST_MATCH',
        severity: 'CRITICAL' as const,
        status: 'NEW' as const,
        title: `Watchlist Match: ${faceEvt.watchlistDisplayName || 'Subject of Interest'}`,
        description: `Positive biometric match for ${faceEvt.watchlistDisplayName} on Track ${faceEvt.personTrackId} (Similarity: ${(
          (faceEvt.similarity || 0) * 100
        ).toFixed(1)}%)`,
        timestamp: faceEvt.timestamp,
        firstDetectedAt: faceEvt.timestamp,
        lastDetectedAt: faceEvt.timestamp,
        threatScore: 98,
        confidence: faceEvt.similarity || 0.90,
        acknowledged: false,
        source: 'FACE_ANALYTICS',
        isSimulation: faceEvt.isSimulation ?? true,
        eventId: faceEvt.eventId,
        trackId: faceEvt.personTrackId,
        position: faceEvt.spatialContext ? { x: 0.5, y: 0.5 } : undefined,
        evidenceReference: faceEvt.evidenceReference?.evidenceId || 'unavailable',
        escalatedToIncidentId: undefined as string | undefined,
        metadata: {
          watchlistEntryId: faceEvt.watchlistEntryId,
          similarityScore: faceEvt.similarity,
          quality: faceEvt.quality,
        },
      };

      // Link to existing active incident or escalate critical alarm
      const existingIncident = dataStore.incidents.find(
        (inc) =>
          (inc.status === 'OPEN' || inc.status === 'INVESTIGATING') &&
          (inc.primaryCameraId === faceEvt.cameraId ||
            inc.primaryCameraId === cam?.id ||
            inc.sectorId === cam?.sectorId)
      );

      if (existingIncident) {
        faceAlert.escalatedToIncidentId = existingIncident.id;
        existingIncident.timeline.push({
          id: `tml-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          timestamp: faceEvt.timestamp,
          actorCallsign: 'FACE_ANALYTICS',
          actionType: 'TRIGGER_ALARM',
          description: `Confirmed biometric watchlist match: ${faceEvt.watchlistDisplayName} on track ${faceEvt.personTrackId}`,
          metadata: {
            alertId,
            personTrackId: faceEvt.personTrackId,
            watchlistEntryId: faceEvt.watchlistEntryId,
            similarity: faceEvt.similarity,
          },
        });
        dataStore.broadcastEvent({
          eventId: `evt-inc-upd-${Date.now()}`,
          eventType: 'incident.updated',
          timestamp: faceEvt.timestamp,
          source: faceEvt.cameraIdentifier || faceEvt.cameraId,
          payload: existingIncident,
        });
      } else {
        const incidentId = `inc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
        const incNum = `INC-${new Date().getFullYear()}-${String(dataStore.incidents.length + 1).padStart(4, '0')}`;
        const newIncident = {
          id: incidentId,
          incidentNumber: incNum,
          title: `Biometric Watchlist Match: ${faceEvt.watchlistDisplayName}`,
          summary: `Automated facial recognition match for ${faceEvt.watchlistDisplayName} on Track ${faceEvt.personTrackId} (${cam?.cameraId || faceEvt.cameraId}).`,
          severity: 'CRITICAL' as const,
          status: 'OPEN' as const,
          sectorId: cam?.sectorId || 'sec-bravo',
          sectorName: cam?.sectorName || 'Sector Bravo',
          primaryCameraId: cam?.id || faceEvt.cameraId,
          primaryCameraIdentifier: cam?.cameraId || faceEvt.cameraId,
          leadCommanderCallsign: 'BIO_WATCH',
          createdAt: faceEvt.timestamp,
          relatedCameraIdentifiers: [cam?.cameraId || faceEvt.cameraId],
          evidenceCount: 1,
          containmentNotes: `Confirmed face match with entry ${faceEvt.watchlistEntryId}. Similarity: ${((faceEvt.similarity || 0) * 100).toFixed(1)}%.`,
          timeline: [
            {
              id: `tml-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              timestamp: faceEvt.timestamp,
              actorCallsign: 'FACE_ANALYTICS',
              actionType: 'TRIGGER_ALARM',
              description: `Initial biometric match for ${faceEvt.watchlistDisplayName} on track ${faceEvt.personTrackId}`,
              metadata: {
                alertId,
                personTrackId: faceEvt.personTrackId,
                similarity: faceEvt.similarity,
              },
            },
          ],
        };
        dataStore.incidents.unshift(newIncident as any);
        faceAlert.escalatedToIncidentId = incidentId;
        dataStore.broadcastEvent({
          eventId: `evt-inc-create-${incidentId}`,
          eventType: 'incident.created',
          timestamp: faceEvt.timestamp,
          source: faceEvt.cameraIdentifier || faceEvt.cameraId,
          payload: newIncident,
        });
      }

      dataStore.alerts.unshift(faceAlert as any);
      dataStore.broadcastEvent({
        eventId: `evt-alert-${alertId}`,
        eventType: 'alert.created',
        timestamp: faceEvt.timestamp,
        source: faceEvt.cameraIdentifier || faceEvt.cameraId,
        payload: faceAlert,
      });
    }
  });

  // Hook ANPR events to DataStore realtime event bus & create operational alerts on watchlist hits
  anprService.onAnprEvent((anprEvt) => {
    dataStore.broadcastEvent({
      eventId: anprEvt.eventId,
      eventType: anprEvt.eventType,
      timestamp: anprEvt.timestamp,
      source: anprEvt.cameraId,
      payload: anprEvt,
    });

    // Create alert on ANPR watchlist match
    if (anprEvt.eventType === 'anpr.watchlist.match' || (anprEvt.isWatchlistMatch && anprEvt.eventType === 'anpr.recognition.confirmed')) {
      const alertId = `alt-anpr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const cam = dataStore.cameras.find((c) => c.id === anprEvt.cameraId || c.cameraId === anprEvt.cameraId);
      const isCritical = anprEvt.watchlistCategory === 'STOLEN_VEHICLE' || anprEvt.watchlistCategory === 'BORDER_VIOLATION';

      const anprAlert = {
        id: alertId,
        alertId,
        cameraId: anprEvt.cameraId,
        cameraIdentifier: cam?.cameraId || anprEvt.cameraId,
        zoneId: anprEvt.spatialContext?.zoneId,
        zoneName: anprEvt.spatialContext?.zoneName || 'Surveillance Sector',
        sectorId: cam?.sectorId || 'sec-bravo',
        sectorName: cam?.sectorName || 'Sector Bravo',
        ruleType: 'ANPR_WATCHLIST_MATCH',
        severity: isCritical ? ('CRITICAL' as const) : ('HIGH' as const),
        status: 'NEW' as const,
        title: `Watchlist Match: Plate ${anprEvt.plateText}`,
        description: `Vehicle with plate ${anprEvt.plateText} matched watchlist category ${anprEvt.watchlistCategory || 'HOTLIST'} on Track ${anprEvt.vehicleTrackId}${anprEvt.spatialContext?.isRestricted ? ` in restricted zone ${anprEvt.spatialContext.zoneName}` : ''}`,
        timestamp: anprEvt.timestamp,
        firstDetectedAt: anprEvt.timestamp,
        lastDetectedAt: anprEvt.timestamp,
        threatScore: isCritical ? 96 : 85,
        confidence: anprEvt.confidence.overall || 0.92,
        acknowledged: false,
        source: 'ANPR',
        isSimulation: anprEvt.isSimulation ?? true,
        eventId: anprEvt.eventId,
        trackId: anprEvt.vehicleTrackId,
        position: anprEvt.position,
        evidenceReference: anprEvt.evidenceReference?.evidenceId || 'unavailable',
        escalatedToIncidentId: undefined as string | undefined,
        metadata: {
          plateText: anprEvt.plateText,
          normalizedPlate: anprEvt.normalizedPlate,
          watchlistCategory: anprEvt.watchlistCategory,
          watchlistEntryId: anprEvt.watchlistEntryId,
          vehicleClass: anprEvt.vehicleClass,
          recognitionStatus: anprEvt.recognitionStatus,
          ocrConfidence: anprEvt.confidence.ocr,
        },
      };

      // Check for active incident in sector to link, or escalate if critical
      const existingIncident = dataStore.incidents.find(
        (inc) =>
          (inc.status === 'OPEN' || inc.status === 'INVESTIGATING') &&
          (inc.primaryCameraId === anprEvt.cameraId ||
            inc.primaryCameraId === cam?.id ||
            inc.sectorId === cam?.sectorId)
      );

      if (existingIncident) {
        anprAlert.escalatedToIncidentId = existingIncident.id;
        existingIncident.timeline.push({
          id: `tml-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          timestamp: anprEvt.timestamp,
          actorCallsign: 'ANPR_SYSTEM',
          actionType: 'TRIGGER_ALARM',
          description: `ANPR Watchlist hit for plate ${anprEvt.plateText} (${anprEvt.watchlistCategory || 'WATCHLIST'}) on track ${anprEvt.vehicleTrackId}`,
          metadata: {
            alertId,
            plateText: anprEvt.plateText,
            normalizedPlate: anprEvt.normalizedPlate,
            trackId: anprEvt.vehicleTrackId,
          },
        });
        dataStore.broadcastEvent({
          eventId: `evt-inc-upd-${Date.now()}`,
          eventType: 'incident.updated',
          timestamp: anprEvt.timestamp,
          source: anprEvt.cameraId,
          payload: existingIncident,
        });
      } else if (isCritical) {
        const incidentId = `inc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
        const incNum = `INC-${new Date().getFullYear()}-${String(dataStore.incidents.length + 1).padStart(4, '0')}`;
        const newIncident = {
          id: incidentId,
          incidentNumber: incNum,
          title: `Critical Watchlist Vehicle: Plate ${anprEvt.plateText}`,
          summary: `Automated ANPR alarm triggered by Track ${anprEvt.vehicleTrackId} with license plate ${anprEvt.plateText} (${anprEvt.watchlistCategory}) on camera ${cam?.cameraId || anprEvt.cameraId}.`,
          severity: 'CRITICAL' as const,
          status: 'OPEN' as const,
          sectorId: cam?.sectorId || 'sec-bravo',
          sectorName: cam?.sectorName || 'Sector Bravo',
          primaryCameraId: cam?.id || anprEvt.cameraId,
          primaryCameraIdentifier: cam?.cameraId || anprEvt.cameraId,
          leadCommanderCallsign: 'ANPR_WATCH',
          createdAt: anprEvt.timestamp,
          relatedCameraIdentifiers: [cam?.cameraId || anprEvt.cameraId],
          evidenceCount: 1,
          containmentNotes: `Watchlist vehicle detected: ${anprEvt.plateText}. Category: ${anprEvt.watchlistCategory}. Track: ${anprEvt.vehicleTrackId}.`,
          timeline: [
            {
              id: `tml-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              timestamp: anprEvt.timestamp,
              actorCallsign: 'ANPR_SYSTEM',
              actionType: 'TRIGGER_ALARM',
              description: `Initial ANPR watchlist match: ${anprEvt.plateText} on track ${anprEvt.vehicleTrackId}`,
              metadata: {
                alertId,
                plateText: anprEvt.plateText,
                trackId: anprEvt.vehicleTrackId,
                category: anprEvt.watchlistCategory,
              },
            },
          ],
        };
        dataStore.incidents.unshift(newIncident as any);
        anprAlert.escalatedToIncidentId = incidentId;
        dataStore.broadcastEvent({
          eventId: `evt-inc-create-${incidentId}`,
          eventType: 'incident.created',
          timestamp: anprEvt.timestamp,
          source: anprEvt.cameraId,
          payload: newIncident,
        });
      }

      dataStore.alerts.unshift(anprAlert as any);
      dataStore.broadcastEvent({
        eventId: `evt-alert-${alertId}`,
        eventType: 'alert.created',
        timestamp: anprEvt.timestamp,
        source: anprEvt.cameraId,
        payload: anprAlert,
      });
    }
  });

  apiRouter.use(centralizedErrorHandler);
  app.use('/api/v1', apiRouter);

  // Validate operating profile & configuration
  const configValidation = validateConfig(appConfig);
  if (!configValidation.isValid) {
    logger.error(`[Config] Configuration errors in profile ${appConfig.profile}:`, {
      errors: configValidation.errors,
    });
    if (appConfig.profile === 'PRODUCTION') {
      throw new Error(`Production configuration validation failed: ${configValidation.errors.join('; ')}`);
    }
  }
  for (const warn of configValidation.warnings) {
    logger.info(warn);
  }

  // Initialize persistence layer
  await persistenceManager.initialize();

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
    logger.info(`IBVAP Command-and-Control Server [PROFILE: ${appConfig.profile}] listening on http://0.0.0.0:${PORT}`);

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
