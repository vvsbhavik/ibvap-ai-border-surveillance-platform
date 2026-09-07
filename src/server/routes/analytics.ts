/**
 * IBVAP — Cross-Camera Intelligence & Observable Border Analytics Routes
 *
 * Exposes topology graph, multi-factor cross-camera correlations,
 * vehicle and person movement reconstructions, transit timing analysis,
 * observable rule engine events, and interactive simulation triggers.
 */

import { Router, Request, Response } from 'express';
import { cameraGraphManager } from '../../analytics/camera-graph';
import { correlationEngine } from '../../analytics/correlation-engine';
import { observationRuleEngine } from '../../analytics/rule-engine';
import {
  CorrelatedEntityType,
  CorrelationConfidenceLevel,
  AdvancedAnalyticsEventType,
  SourceProvenance,
} from '../../analytics/types';
import { dataStore } from '../store';
import { AlertSeverity } from '../types';

export const analyticsRouter = Router();

/**
 * GET /api/analytics/graph
 * Retrieve the authoritative camera topology graph (nodes, corridor edges, and sector coverage).
 */
analyticsRouter.get('/graph', (req: Request, res: Response) => {
  try {
    const graph = cameraGraphManager.getGraph();
    const stats = {
      totalNodes: graph.nodes.length,
      totalEdges: graph.edges.length,
      activeMasts: graph.nodes.filter((n) => n.status === 'ONLINE').length,
      anprEnabledMasts: graph.nodes.filter((n) => n.hasANPR).length,
      thermalEnabledMasts: graph.nodes.filter((n) => n.hasThermal).length,
      faceAnalyticsMasts: graph.nodes.filter((n) => n.hasFaceAnalytics).length,
      sectorsCovered: Array.from(new Set(graph.nodes.map((n) => n.sectorId))),
    };

    res.json({
      success: true,
      data: {
        graph,
        stats,
        provenance: 'LIVE' as SourceProvenance,
        disclaimer: 'Authoritative physical topology and corridor adjacency graph. Transit times represent normal vehicular/pedestrian bounds.',
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/analytics/graph/adjacent/:cameraId
 * Retrieve directly adjacent cameras and transit corridor metrics for a specific camera mast.
 */
analyticsRouter.get('/graph/adjacent/:cameraId', (req: Request, res: Response) => {
  try {
    const { cameraId } = req.params;
    const neighbors = cameraGraphManager.getAdjacentCameras(cameraId);
    res.json({
      success: true,
      cameraId,
      neighbors,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/analytics/correlations
 * List active cross-camera entity correlations with multi-factor evidence.
 */
analyticsRouter.get('/correlations', (req: Request, res: Response) => {
  try {
    const entityType = req.query.entityType as CorrelatedEntityType | undefined;
    const confidenceLevel = req.query.confidenceLevel as CorrelationConfidenceLevel | undefined;
    const cameraId = req.query.cameraId as string | undefined;
    const sectorId = req.query.sectorId as string | undefined;
    const minConfidence = req.query.minConfidence ? parseFloat(req.query.minConfidence as string) : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;

    let list = correlationEngine.getCorrelations({
      entityType,
      cameraId,
      minConfidence,
    });

    if (confidenceLevel) {
      list = list.filter((c) => c.confidenceLevel === confidenceLevel);
    }
    if (sectorId) {
      list = list.filter((c) => c.involvedSectors.includes(sectorId));
    }

    res.json({
      success: true,
      total: list.length,
      data: list.slice(0, limit),
      disclaimer: 'CORRELATION level association based on observable multi-sensor factors. Does not assign confirmed legal IDENTITY without external validation.',
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/analytics/correlations/:id
 * Retrieve a specific correlation record with detailed timeline and reasoning factors.
 */
analyticsRouter.get('/correlations/:id', (req: Request, res: Response) => {
  try {
    const correlation = correlationEngine.getCorrelationById(req.params.id);
    if (!correlation) {
      return res.status(404).json({ success: false, error: 'Correlation record not found' });
    }

    res.json({
      success: true,
      data: correlation,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/analytics/observations
 * List raw ingested observations across camera masts.
 */
analyticsRouter.get('/observations', (req: Request, res: Response) => {
  try {
    const cameraId = req.query.cameraId as string | undefined;
    const entityType = req.query.entityType as CorrelatedEntityType | undefined;
    const trackId = req.query.trackId as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;

    const list = correlationEngine.getObservations({
      cameraId,
      entityType,
      trackId,
    });

    res.json({
      success: true,
      total: list.length,
      data: list.slice(0, limit),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/analytics/reconstruction/vehicle
 * Chronological movement reconstruction for a vehicle (by plate or trackId).
 */
analyticsRouter.get('/reconstruction/vehicle', (req: Request, res: Response) => {
  try {
    const plateNumber = req.query.plateNumber as string | undefined;
    const trackId = req.query.trackId as string | undefined;
    const startTime = req.query.startTime as string | undefined;
    const endTime = req.query.endTime as string | undefined;

    const reconstruction = correlationEngine.reconstructVehicleMovement({
      plateNumber,
      trackId,
    });

    if (!reconstruction) {
      return res.status(404).json({
        success: false,
        error: 'No vehicle movement observations matched the query parameters',
      });
    }

    res.json({
      success: true,
      data: reconstruction,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/analytics/reconstruction/person
 * Chronological movement reconstruction for a person track or face observation.
 */
analyticsRouter.get('/reconstruction/person', (req: Request, res: Response) => {
  try {
    const trackId = req.query.trackId as string | undefined;
    const faceObservationId = req.query.faceObservationId as string | undefined;

    const reconstruction = correlationEngine.reconstructPersonMovement({
      personTrackId: trackId,
      faceObservationId,
    });

    if (!reconstruction) {
      return res.status(404).json({
        success: false,
        error: 'No person movement observations matched the query parameters',
      });
    }

    res.json({
      success: true,
      data: reconstruction,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/analytics/route-analysis
 * Evaluates route transit sequence, transit timing compliance, and anomalies.
 */
analyticsRouter.get('/route-analysis', (req: Request, res: Response) => {
  try {
    const cameraSequenceRaw = req.query.cameras as string | undefined;
    if (!cameraSequenceRaw) {
      return res.status(400).json({ success: false, error: 'Query parameter "cameras" (comma-separated IDs) is required' });
    }

    const cameraSequence = cameraSequenceRaw.split(',').map((s) => s.trim().toUpperCase());
    const entityType = (req.query.entityType as CorrelatedEntityType) || 'VEHICLE';

    const timestampsRaw = req.query.timestamps as string | undefined;
    let timestamps: string[] | undefined = undefined;
    if (timestampsRaw) {
      timestamps = timestampsRaw.split(',').map((s) => s.trim());
    }

    const sequence = cameraSequence.map((c, idx) => ({
      cameraId: c,
      timestamp: timestamps && timestamps[idx] ? timestamps[idx] : new Date(Date.now() - (cameraSequence.length - idx) * 120000).toISOString(),
    }));

    const result = correlationEngine.analyzeRoute(sequence, entityType);

    res.json({
      success: true,
      data: result,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/analytics/events
 * Retrieve observable analytics events (night movement, dwell/loiter, fence, direction, etc.).
 */
analyticsRouter.get('/events', (req: Request, res: Response) => {
  try {
    const eventType = req.query.eventType as AdvancedAnalyticsEventType | undefined;
    const cameraId = req.query.cameraId as string | undefined;
    const severity = req.query.severity as AlertSeverity | undefined;
    const trackId = req.query.trackId as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;

    const events = observationRuleEngine.getEvents({
      eventType,
      cameraId,
      severity,
      trackId,
    });

    res.json({
      success: true,
      total: events.length,
      data: events.slice(0, limit),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/analytics/config
 * Get active configuration for observable border analytics rules.
 */
analyticsRouter.get('/config', (req: Request, res: Response) => {
  try {
    const config = observationRuleEngine.getConfig();
    res.json({
      success: true,
      data: config,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/analytics/config
 * Update observable border analytics configuration parameters.
 */
analyticsRouter.post('/config', (req: Request, res: Response) => {
  try {
    const updated = observationRuleEngine.updateConfig(req.body);
    res.json({
      success: true,
      message: 'Observable analytics rule thresholds updated successfully',
      data: updated,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/analytics/simulate
 * Trigger a simulated observable border analytics drill event.
 */
analyticsRouter.post('/simulate', (req: Request, res: Response) => {
  try {
    const { scenarioType, cameraId = 'CAM-01', trackId } = req.body;
    const simulatedTrackId = trackId || `SIM-TRK-${Math.floor(100 + Math.random() * 900)}`;

    let generatedEvent = null;

    switch (scenarioType) {
      case 'night_movement':
        generatedEvent = observationRuleEngine.evaluateNightMovement({
          cameraId,
          trackId: simulatedTrackId,
          objectType: 'person',
          zoneName: 'Perimeter Ridge Buffer',
          timestamp: new Date().toISOString(),
          provenance: 'SIMULATION',
        });
        // If outside night hours in test, force generate one for drill purposes
        if (!generatedEvent) {
          generatedEvent = {
            eventId: `aev-sim-night-${Date.now()}`,
            eventType: 'night.person.detected',
            timestamp: new Date().toISOString(),
            cameraId,
            cameraIdentifier: cameraId,
            sectorId: 'sec-bravo',
            sectorName: 'Sector Bravo',
            trackId: simulatedTrackId,
            objectType: 'person',
            zoneName: 'Night Surveillance Corridor',
            severity: 'HIGH',
            ruleId: 'RULE-NIGHT-01',
            ruleName: 'Night Movement Observation Rule',
            triggerReason: 'Simulated infrared bipedal detection during low-light observation hours',
            observableMetrics: { configuredWindow: '22:00-05:00' },
            reasoningFactors: [
              { factor: 'Thermal IR classification match', detail: 'High thermal delta against background ambient terrain', weight: 0.6 },
              { factor: 'Curfew buffer breach', detail: 'Crossed within 20m of international boundary line', weight: 0.4 },
            ],
            isAlertElevated: true,
            provenance: 'SIMULATION',
          };
        }
        break;

      case 'loitering':
        generatedEvent = observationRuleEngine.evaluateLoitering({
          cameraId: cameraId || 'CAM-05',
          trackId: simulatedTrackId,
          objectType: 'vehicle',
          zoneId: 'zone-d1',
          zoneName: 'River Shallows Channel',
          dwellSeconds: 245,
          provenance: 'SIMULATION',
        });
        break;

      case 'repeated_fence':
        // Generate two crossings in quick succession
        observationRuleEngine.evaluateFenceCrossing({
          cameraId: cameraId || 'CAM-02',
          trackId: simulatedTrackId,
          objectType: 'person',
          fenceId: 'vfence-sector-02-a',
          provenance: 'SIMULATION',
        });
        generatedEvent = observationRuleEngine.evaluateFenceCrossing({
          cameraId: cameraId || 'CAM-02',
          trackId: simulatedTrackId,
          objectType: 'person',
          fenceId: 'vfence-sector-02-b',
          provenance: 'SIMULATION',
        });
        break;

      case 'direction_anomaly':
        generatedEvent = observationRuleEngine.evaluateDirectionAnomaly({
          cameraId: cameraId || 'CAM-08',
          trackId: simulatedTrackId,
          objectType: 'vehicle',
          observedDirection: 'SOUTH',
          expectedDirection: 'NORTH',
          zoneName: 'Highway 10 Checkpoint Approach',
          provenance: 'SIMULATION',
        });
        break;

      case 'person_vehicle_interaction':
        generatedEvent = observationRuleEngine.evaluatePersonVehicleInteraction({
          cameraId: cameraId || 'CAM-04',
          personTrackId: `PRS-${Math.floor(100 + Math.random() * 900)}`,
          vehicleTrackId: `VEH-${Math.floor(100 + Math.random() * 900)}`,
          distanceMeters: 2.8,
          dwellSeconds: 35,
          zoneName: 'Perimeter Staging Area',
          provenance: 'SIMULATION',
        });
        break;

      case 'group_activity':
        generatedEvent = observationRuleEngine.evaluateGroupActivity({
          cameraId: cameraId || 'CAM-01',
          trackIds: [
            `PRS-${Math.floor(100 + Math.random() * 900)}`,
            `PRS-${Math.floor(100 + Math.random() * 900)}`,
            `PRS-${Math.floor(100 + Math.random() * 900)}`,
            `PRS-${Math.floor(100 + Math.random() * 900)}`,
          ],
          zoneId: 'zone-b1',
          zoneName: 'Sector Bravo Staging Ridge',
          provenance: 'SIMULATION',
        });
        break;

      default:
        return res.status(400).json({
          success: false,
          error: `Unknown simulation scenarioType: ${scenarioType}. Supported: night_movement, loitering, repeated_fence, direction_anomaly, person_vehicle_interaction, group_activity`,
        });
    }

    res.json({
      success: true,
      message: `Simulated drill event [${scenarioType}] triggered successfully`,
      data: generatedEvent,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/analytics/ingest
 * Ingest an observable event into the correlation and rule pipeline.
 */
analyticsRouter.post('/ingest', (req: Request, res: Response) => {
  try {
    const observation = correlationEngine.ingestObservation(req.body);
    res.json({
      success: true,
      data: observation,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
