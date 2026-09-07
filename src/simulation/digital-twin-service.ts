/**
 * IBVAP — Digital Twin & Border Simulation Service
 *
 * Provides deterministic simulation scenarios A through J for operator training,
 * system validation, and scenario drills with complete provenance labeling.
 */

import {
  SimulationScenarioId,
  SimulationScenarioDefinition,
  SimulatedActor,
  DigitalTwinState,
} from './types';
import { dataStore } from '../server/store';
import { cameraTrustEngine } from '../camera-trust/trust-engine';
import { Alert, Incident, RealtimeEventEnvelope } from '../server/types';
import { logger } from '../server/logger';

export const SIMULATION_SCENARIOS: SimulationScenarioDefinition[] = [
  {
    id: 'SCENARIO_A',
    code: 'SCEN-01-EXP-CORR',
    name: 'Scenario A: Vehicle Expected Corridor Transit',
    description: 'Vehicle follows authorized transit corridor sequentially from North Ridge Mast (CAM-01) to Ridge Pass Overlook (CAM-02) and Perimeter Fence (CAM-04) within normal transit bounds.',
    primaryEntityType: 'VEHICLE',
    involvedCameras: ['CAM-01', 'CAM-02', 'CAM-04'],
    involvedSectors: ['sec-bravo'],
    estimatedDurationSeconds: 120,
    expectedAlertTypes: [],
    expectedViolations: [],
    category: 'CORRIDOR_TRANSIT',
  },
  {
    id: 'SCENARIO_B',
    code: 'SCEN-02-REST-ZONE',
    name: 'Scenario B: Vehicle Enters Restricted Zone',
    description: 'Vehicle deviates from main access road and enters North Ridge Restricted Buffer Zone (ZB-RESTRICTED-01) triggering immediate spatial alarms.',
    primaryEntityType: 'VEHICLE',
    involvedCameras: ['CAM-01'],
    involvedSectors: ['sec-bravo'],
    estimatedDurationSeconds: 45,
    expectedAlertTypes: ['RESTRICTED_ZONE_INTRUSION'],
    expectedViolations: ['zone.entered', 'restricted.buffer.breach'],
    category: 'PERIMETER_BREACH',
  },
  {
    id: 'SCENARIO_C',
    code: 'SCEN-03-VIRT-FENCE',
    name: 'Scenario C: Person Virtual Fence Crossing',
    description: 'Pedestrian crosses virtual perimeter tripwire at Ridge Virtual Boundary Line East (CAM-02), generating high-priority boundary breach alerts.',
    primaryEntityType: 'PERSON',
    involvedCameras: ['CAM-02'],
    involvedSectors: ['sec-bravo'],
    estimatedDurationSeconds: 30,
    expectedAlertTypes: ['VIRTUAL_FENCE_BREACH'],
    expectedViolations: ['fence.crossed'],
    category: 'PERIMETER_BREACH',
  },
  {
    id: 'SCENARIO_D',
    code: 'SCEN-04-NIGHT-MOVE',
    name: 'Scenario D: Night Thermal Movement',
    description: 'Low-light pedestrian movement detected via thermal contrast in Canyon Funnel (CAM-03) during restricted curfew hours.',
    primaryEntityType: 'PERSON',
    involvedCameras: ['CAM-03'],
    involvedSectors: ['sec-bravo'],
    estimatedDurationSeconds: 60,
    expectedAlertTypes: ['NIGHT_MOVEMENT_DETECTED'],
    expectedViolations: ['night.person.detected', 'restricted_hours.entry'],
    category: 'PERIMETER_BREACH',
  },
  {
    id: 'SCENARIO_E',
    code: 'SCEN-05-REP-CROSS',
    name: 'Scenario E: Repeated Fence Crossing Oscillations',
    description: 'Subject performs multiple rapid traversals across perimeter boundary fence line at CAM-04 within a 90-second window.',
    primaryEntityType: 'PERSON',
    involvedCameras: ['CAM-04'],
    involvedSectors: ['sec-bravo'],
    estimatedDurationSeconds: 90,
    expectedAlertTypes: ['REPEATED_FENCE_CROSSING'],
    expectedViolations: ['fence.repeated_crossing'],
    category: 'PERIMETER_BREACH',
  },
  {
    id: 'SCENARIO_F',
    code: 'SCEN-06-CAM-FAIL',
    name: 'Scenario F: Camera Failure During Active Movement',
    description: 'Surveillance mast CAM-02 suddenly experiences stream loss (OFFLINE) while vehicle track is actively in transit through Sector Bravo.',
    primaryEntityType: 'VEHICLE',
    involvedCameras: ['CAM-01', 'CAM-02', 'CAM-04'],
    involvedSectors: ['sec-bravo'],
    estimatedDurationSeconds: 90,
    expectedAlertTypes: ['CAMERA_OFFLINE_DURING_INCIDENT', 'SENSOR_DROPOUT'],
    expectedViolations: ['camera.offline', 'coverage.dropout'],
    category: 'OPTICAL_FAILURE',
  },
  {
    id: 'SCENARIO_G',
    code: 'SCEN-07-CROSS-CORR',
    name: 'Scenario G: Multi-Camera Correlated Movement',
    description: 'Vehicle navigates inter-sector transition corridor from Sector Bravo (CAM-04) down into Sector Delta River Confluence (CAM-05 and CAM-06) with probabilistic correlation.',
    primaryEntityType: 'VEHICLE',
    involvedCameras: ['CAM-04', 'CAM-05', 'CAM-06'],
    involvedSectors: ['sec-bravo', 'sec-delta'],
    estimatedDurationSeconds: 150,
    expectedAlertTypes: ['CROSS_SECTOR_CORRELATION'],
    expectedViolations: ['corridor.transition'],
    category: 'CORRIDOR_TRANSIT',
  },
  {
    id: 'SCENARIO_H',
    code: 'SCEN-08-ANPR-MATCH',
    name: 'Scenario H: ANPR Stolen Watchlist Match',
    description: 'Flagged vehicle bearing plate TX-8921-A is identified by Highway 80 Checkpoint Alpha (CAM-07), triggering automatic watchlist escalation.',
    primaryEntityType: 'VEHICLE',
    involvedCameras: ['CAM-07'],
    involvedSectors: ['sec-delta'],
    estimatedDurationSeconds: 30,
    expectedAlertTypes: ['WATCHLIST_PLATE_MATCH'],
    expectedViolations: ['anpr.watchlist_hit'],
    category: 'WATCHLIST_HIT',
  },
  {
    id: 'SCENARIO_I',
    code: 'SCEN-09-FACE-MATCH',
    name: 'Scenario I: Face Analytics Watchlist Match',
    description: 'Subject of interest matching Priority Watchlist profile is detected at North Gate Access Portal (CAM-08) optical portal.',
    primaryEntityType: 'PERSON',
    involvedCameras: ['CAM-08'],
    involvedSectors: ['sec-bravo'],
    estimatedDurationSeconds: 30,
    expectedAlertTypes: ['WATCHLIST_FACE_MATCH'],
    expectedViolations: ['face.watchlist_hit'],
    category: 'WATCHLIST_HIT',
  },
  {
    id: 'SCENARIO_J',
    code: 'SCEN-10-COMPLEX',
    name: 'Scenario J: Combined Multi-Vector Incident',
    description: 'Complex multi-vector scenario: Initial perimeter fence breach at CAM-04 coincides with camera integrity anomaly, followed by suspect vehicle egress toward River Shallows (CAM-05).',
    primaryEntityType: 'MULTI_ACTOR',
    involvedCameras: ['CAM-04', 'CAM-05', 'CAM-06'],
    involvedSectors: ['sec-bravo', 'sec-delta'],
    estimatedDurationSeconds: 180,
    expectedAlertTypes: ['PERIMETER_BREACH', 'CAMERA_INTEGRITY_ANOMALY', 'COORDINATED_INTRUSION'],
    expectedViolations: ['fence.crossed', 'camera.integrity_anomaly', 'cross_sector_escape'],
    category: 'COMPLEX_INCIDENT',
  },
];

class DigitalTwinService {
  private state: DigitalTwinState;
  private scenarioTimer: NodeJS.Timeout | null = null;
  private createdSimAlertIds: Set<string> = new Set();
  private createdSimIncidentIds: Set<string> = new Set();

  constructor() {
    this.state = {
      status: 'IDLE',
      activeScenario: null,
      speedMultiplier: 1,
      elapsedSeconds: 0,
      activeActors: [],
      recentEventsEmitted: [],
      isSimulationMode: true,
      provenanceLabel: 'SIMULATION MODE / TEST DATA',
      lastResetAt: new Date().toISOString(),
      simulationRunCount: 0,
    };
  }

  public getState(): DigitalTwinState {
    return { ...this.state };
  }

  public getScenarios(): SimulationScenarioDefinition[] {
    return SIMULATION_SCENARIOS;
  }

  public getScenario(id: SimulationScenarioId): SimulationScenarioDefinition | undefined {
    return SIMULATION_SCENARIOS.find((s) => s.id === id);
  }

  /**
   * Starts a deterministic simulation scenario.
   */
  public startScenario(scenarioId: SimulationScenarioId, userCallsign: string = 'COMMANDER-1'): DigitalTwinState {
    const scenario = this.getScenario(scenarioId);
    if (!scenario) {
      throw new Error(`Unknown scenario [${scenarioId}]`);
    }

    // Stop any existing runner
    if (this.scenarioTimer) {
      clearInterval(this.scenarioTimer);
      this.scenarioTimer = null;
    }

    const actors = this.buildActorsForScenario(scenario);

    this.state = {
      ...this.state,
      status: 'RUNNING',
      activeScenario: scenario,
      elapsedSeconds: 0,
      activeActors: actors,
      simulationRunCount: this.state.simulationRunCount + 1,
    };

    // Execute first step immediately
    this.executeScenarioStep(scenario, 0);

    // Run step increments
    this.scenarioTimer = setInterval(() => {
      if (this.state.status !== 'RUNNING') return;

      const newElapsed = this.state.elapsedSeconds + Math.round(1 * this.state.speedMultiplier);
      this.state.elapsedSeconds = newElapsed;

      this.executeScenarioStep(scenario, newElapsed);

      if (newElapsed >= scenario.estimatedDurationSeconds) {
        this.completeScenario();
      }
    }, 1000);

    dataStore.logAudit(
      userCallsign,
      'SIMULATION_START',
      'SIMULATION_SCENARIO',
      scenario.id,
      '127.0.0.1',
      { scenarioName: scenario.name, category: scenario.category },
      'SUCCESS'
    );

    this.broadcastStateChange();
    return this.getState();
  }

  public pauseScenario(): DigitalTwinState {
    if (this.state.status === 'RUNNING') {
      this.state.status = 'PAUSED';
      this.broadcastStateChange();
    }
    return this.getState();
  }

  public resumeScenario(): DigitalTwinState {
    if (this.state.status === 'PAUSED') {
      this.state.status = 'RUNNING';
      this.broadcastStateChange();
    }
    return this.getState();
  }

  public setSpeed(multiplier: number): DigitalTwinState {
    this.state.speedMultiplier = Math.max(1, Math.min(5, multiplier));
    this.broadcastStateChange();
    return this.getState();
  }

  /**
   * Completes the current scenario run.
   */
  private completeScenario(): void {
    if (this.scenarioTimer) {
      clearInterval(this.scenarioTimer);
      this.scenarioTimer = null;
    }
    this.state.status = 'COMPLETED';
    logger.info(`[DigitalTwin] Scenario [${this.state.activeScenario?.id}] completed.`);
    this.broadcastStateChange();
  }

  /**
   * Safely resets the digital twin simulation environment.
   * Clears transient simulation tracks, simulation alerts, and restored camera health
   * WITHOUT deleting real operational records.
   */
  public resetSimulation(userCallsign: string = 'COMMANDER-1'): DigitalTwinState {
    if (this.scenarioTimer) {
      clearInterval(this.scenarioTimer);
      this.scenarioTimer = null;
    }

    // Safely remove only alerts and incidents generated by the simulation
    dataStore.alerts = dataStore.alerts.filter((a) => !this.createdSimAlertIds.has(a.id));
    dataStore.incidents = dataStore.incidents.filter((i) => !this.createdSimIncidentIds.has(i.id));
    this.createdSimAlertIds.clear();
    this.createdSimIncidentIds.clear();

    // Reset camera trust baselines for cameras modified during simulation
    dataStore.cameras.forEach((cam) => {
      cameraTrustEngine.resetCameraToOptimal(cam.cameraId);
    });

    this.state = {
      status: 'IDLE',
      activeScenario: null,
      speedMultiplier: 1,
      elapsedSeconds: 0,
      activeActors: [],
      recentEventsEmitted: [],
      isSimulationMode: true,
      provenanceLabel: 'SIMULATION MODE / TEST DATA',
      lastResetAt: new Date().toISOString(),
      simulationRunCount: this.state.simulationRunCount,
    };

    dataStore.logAudit(
      userCallsign,
      'SIMULATION_RESET',
      'SIMULATION_ENVIRONMENT',
      'GLOBAL_SIM',
      '127.0.0.1',
      { action: 'SAFE_RESET_CLEARED_TRANSIENTS' },
      'SUCCESS'
    );

    this.broadcastStateChange();
    logger.info('[DigitalTwin] Simulation environment safely reset. Operational records preserved.');
    return this.getState();
  }

  /**
   * Generates initial actors based on scenario specifications.
   */
  private buildActorsForScenario(scenario: SimulationScenarioDefinition): SimulatedActor[] {
    const actors: SimulatedActor[] = [];

    if (scenario.id === 'SCENARIO_A') {
      actors.push({
        actorId: 'sim-act-veh-01',
        entityType: 'VEHICLE',
        targetIdentifier: 'TX-8921-A',
        currentCameraId: 'CAM-01',
        currentCameraIdentifier: 'CAM-01',
        latitude: 31.4305,
        longitude: -109.9152,
        heading: 42,
        speedKmh: 45,
        dwellTimeSeconds: 0,
        routeProgress: 0.0,
        activeStatus: 'TRANSITING',
      });
    } else if (scenario.id === 'SCENARIO_B') {
      actors.push({
        actorId: 'sim-act-veh-02',
        entityType: 'VEHICLE',
        targetIdentifier: 'AZ-4491-B',
        currentCameraId: 'CAM-01',
        currentCameraIdentifier: 'CAM-01',
        latitude: 31.4310,
        longitude: -109.9160,
        heading: 315,
        speedKmh: 55,
        dwellTimeSeconds: 15,
        routeProgress: 0.2,
        activeStatus: 'BREACHING',
      });
    } else if (scenario.id === 'SCENARIO_C' || scenario.id === 'SCENARIO_E') {
      actors.push({
        actorId: 'sim-act-prs-01',
        entityType: 'PERSON',
        targetIdentifier: 'SUBJECT-HOTSPOT-01',
        currentCameraId: scenario.id === 'SCENARIO_C' ? 'CAM-02' : 'CAM-04',
        currentCameraIdentifier: scenario.id === 'SCENARIO_C' ? 'CAM-02' : 'CAM-04',
        latitude: 31.4328,
        longitude: -109.9085,
        heading: 110,
        speedKmh: 6,
        dwellTimeSeconds: 25,
        routeProgress: 0.1,
        activeStatus: 'BREACHING',
      });
    } else if (scenario.id === 'SCENARIO_D') {
      actors.push({
        actorId: 'sim-act-prs-night',
        entityType: 'PERSON',
        targetIdentifier: 'THERMAL-SUBJECT-09',
        currentCameraId: 'CAM-03',
        currentCameraIdentifier: 'CAM-03',
        latitude: 31.4271,
        longitude: -109.9198,
        heading: 180,
        speedKmh: 4,
        dwellTimeSeconds: 40,
        routeProgress: 0.3,
        activeStatus: 'LOITERING',
      });
    } else if (scenario.id === 'SCENARIO_F') {
      actors.push({
        actorId: 'sim-act-veh-fail',
        entityType: 'VEHICLE',
        targetIdentifier: 'MX-7721-C',
        currentCameraId: 'CAM-02',
        currentCameraIdentifier: 'CAM-02',
        latitude: 31.4328,
        longitude: -109.9085,
        heading: 110,
        speedKmh: 50,
        dwellTimeSeconds: 5,
        routeProgress: 0.4,
        activeStatus: 'TRANSITING',
      });
    } else if (scenario.id === 'SCENARIO_H') {
      actors.push({
        actorId: 'sim-act-veh-bolo',
        entityType: 'VEHICLE',
        targetIdentifier: 'TX-8921-A',
        currentCameraId: 'CAM-07',
        currentCameraIdentifier: 'CAM-07',
        latitude: 31.3955,
        longitude: -109.8395,
        heading: 270,
        speedKmh: 35,
        dwellTimeSeconds: 10,
        routeProgress: 0.5,
        activeStatus: 'TRANSITING',
        matchedWatchlistId: 'wl-001',
      });
    } else if (scenario.id === 'SCENARIO_I') {
      actors.push({
        actorId: 'sim-act-prs-face',
        entityType: 'PERSON',
        targetIdentifier: 'PERSON-OF-INTEREST-44',
        currentCameraId: 'CAM-08',
        currentCameraIdentifier: 'CAM-08',
        latitude: 31.3860,
        longitude: -109.8465,
        heading: 0,
        speedKmh: 5,
        dwellTimeSeconds: 15,
        routeProgress: 0.5,
        activeStatus: 'TRANSITING',
        matchedWatchlistId: 'wl-002',
      });
    } else {
      // Combined or multi-camera (Scenario G or J)
      actors.push(
        {
          actorId: 'sim-act-veh-multi',
          entityType: 'VEHICLE',
          targetIdentifier: 'TX-9002-X',
          currentCameraId: 'CAM-04',
          currentCameraIdentifier: 'CAM-04',
          latitude: 31.4250,
          longitude: -109.9050,
          heading: 90,
          speedKmh: 60,
          dwellTimeSeconds: 10,
          routeProgress: 0.2,
          activeStatus: 'TRANSITING',
        },
        {
          actorId: 'sim-act-prs-multi',
          entityType: 'PERSON',
          targetIdentifier: 'PERIMETER-RUNNER-02',
          currentCameraId: 'CAM-04',
          currentCameraIdentifier: 'CAM-04',
          latitude: 31.4255,
          longitude: -109.9060,
          heading: 180,
          speedKmh: 9,
          dwellTimeSeconds: 30,
          routeProgress: 0.3,
          activeStatus: 'BREACHING',
        }
      );
    }

    return actors;
  }

  /**
   * Deterministic Scenario Progression Logic
   */
  private executeScenarioStep(scenario: SimulationScenarioDefinition, elapsedSeconds: number): void {
    // 1. Scenario F: Trigger camera failure on CAM-02 at t=15s
    if (scenario.id === 'SCENARIO_F' && elapsedSeconds === 15) {
      cameraTrustEngine.setStreamState('CAM-02', 'STREAM_UNAVAILABLE');
      this.recordSimEvent('sim-evt-f-01', 'camera.offline', 'CAM-02', 'Stream signal lost during active vehicle transit (CAM-02 OFFLINE).');
    }

    // 2. Scenario B: Generate Restricted Zone Breach Alert at t=5s
    if (scenario.id === 'SCENARIO_B' && elapsedSeconds === 5) {
      this.createSimAlert(
        'alt-sim-b-01',
        'Restricted Buffer Zone Intrusion (CAM-01)',
        'Vehicle AZ-4491-B penetrated North Ridge Restricted Buffer Zone (ZB-RESTRICTED-01).',
        'CRITICAL',
        'CAM-01',
        'sec-bravo',
        'zone-b1'
      );
      this.recordSimEvent('sim-evt-b-01', 'zone.entered', 'CAM-01', 'Restricted zone entered by target vehicle AZ-4491-B.');
    }

    // 3. Scenario C: Virtual Fence Breach Alert at t=5s
    if (scenario.id === 'SCENARIO_C' && elapsedSeconds === 5) {
      this.createSimAlert(
        'alt-sim-c-01',
        'Perimeter Virtual Fence Breach (CAM-02)',
        'Pedestrian crossed Ridge Virtual Boundary Line East heading 110°.',
        'HIGH',
        'CAM-02',
        'sec-bravo',
        'zone-b2'
      );
      this.recordSimEvent('sim-evt-c-01', 'fence.crossed', 'CAM-02', 'Perimeter tripwire crossed at CAM-02.');
    }

    // 4. Scenario H: ANPR Watchlist Match Alert at t=5s
    if (scenario.id === 'SCENARIO_H' && elapsedSeconds === 5) {
      this.createSimAlert(
        'alt-sim-h-01',
        'Watchlist Vehicle Plate Match (CAM-07)',
        'Vehicle plate TX-8921-A verified against High Priority BOLO Watchlist at Highway 80 Checkpoint Alpha.',
        'CRITICAL',
        'CAM-07',
        'sec-delta'
      );
      this.recordSimEvent('sim-evt-h-01', 'anpr.watchlist_match', 'CAM-07', 'Plate TX-8921-A matched BOLO Watchlist.');
    }

    // 5. Scenario J: Complex multi-vector incident at t=10s
    if (scenario.id === 'SCENARIO_J' && elapsedSeconds === 10) {
      cameraTrustEngine.setStreamState('CAM-04', 'STREAM_AVAILABLE', { isFrozen: true });
      this.createSimIncident(
        'inc-sim-j-01',
        'INC-2026-SIM-101',
        'Coordinated Perimeter Infiltration & Sensor Tampering',
        'Simultaneous fence breach at Sector Bravo Mast-04 with optical frozen frame anomaly, suspect vehicle in egress.',
        'CRITICAL',
        'CAM-04',
        'sec-bravo',
        ['CAM-04', 'CAM-05']
      );
      this.recordSimEvent('sim-evt-j-01', 'incident.declared', 'CAM-04', 'Incident INC-2026-SIM-101 declared by Watch Commander.');
    }

    // Update Actor coordinates along their route
    this.state.activeActors.forEach((actor) => {
      const progress = Math.min(1.0, elapsedSeconds / scenario.estimatedDurationSeconds);
      actor.routeProgress = progress;
      actor.dwellTimeSeconds = elapsedSeconds;

      // Small deterministic geographic displacement along heading
      const rad = (actor.heading * Math.PI) / 180;
      actor.latitude += Math.cos(rad) * 0.00005 * this.state.speedMultiplier;
      actor.longitude += Math.sin(rad) * 0.00005 * this.state.speedMultiplier;
    });

    this.broadcastStateChange();
  }

  private createSimAlert(
    id: string,
    title: string,
    description: string,
    severity: Alert['severity'],
    cameraId: string,
    sectorId: string,
    zoneId?: string
  ): void {
    if (this.createdSimAlertIds.has(id)) return;

    const cam = dataStore.getCamera(cameraId);
    const alert: Alert = {
      id,
      alertNumber: `ALT-SIM-${Date.now().toString().slice(-4)}`,
      title,
      description: `[SIMULATION TEST DATA] ${description}`,
      severity,
      status: 'PENDING_ACK',
      cameraId,
      cameraIdentifier: cam?.identifier || cameraId,
      sectorId,
      sectorName: cam?.sectorName || 'Sector Bravo',
      zoneId,
      timestamp: new Date().toISOString(),
      confidenceScore: 0.98,
      reasoningFactors: [
        { factor: 'Simulation Scenario Inject', weight: 1.0, verified: true, detail: 'Deterministic drill event' },
      ],
      isSimulation: true,
    };

    dataStore.alerts.unshift(alert);
    this.createdSimAlertIds.add(id);

    dataStore.broadcastEvent({
      eventId: `evt-sim-alert-${id}`,
      eventType: 'alert.new',
      timestamp: alert.timestamp,
      source: 'ibvap-digital-twin',
      payload: alert,
    });
  }

  private createSimIncident(
    id: string,
    incidentNumber: string,
    title: string,
    summary: string,
    severity: Incident['severity'],
    primaryCameraId: string,
    sectorId: string,
    relatedCameraIdentifiers: string[]
  ): void {
    if (this.createdSimIncidentIds.has(id)) return;

    const incident: Incident = {
      id,
      incidentNumber,
      title: `[SIMULATION] ${title}`,
      summary: `[SIMULATION TEST DATA] ${summary}`,
      severity,
      status: 'OPEN',
      sectorId,
      sectorName: 'Sector Bravo',
      primaryCameraId,
      primaryCameraIdentifier: primaryCameraId,
      leadCommanderCallsign: 'SENTINEL-LEAD',
      createdAt: new Date().toISOString(),
      relatedCameraIdentifiers,
      evidenceCount: 2,
      containmentNotes: 'Simulated dispatch underway. Perimeter patrol responding.',
      timeline: [
        {
          id: `tl-${Date.now()}-1`,
          timestamp: new Date().toISOString(),
          actorCallsign: 'DIGITAL-TWIN',
          actionType: 'TRIGGER_ALARM',
          description: 'Simulation scenario inject triggered operational incident declaration.',
        },
      ],
    };

    dataStore.incidents.unshift(incident);
    this.createdSimIncidentIds.add(id);

    dataStore.broadcastEvent({
      eventId: `evt-sim-inc-${id}`,
      eventType: 'incident.declared',
      timestamp: incident.createdAt,
      source: 'ibvap-digital-twin',
      payload: incident,
    });
  }

  private recordSimEvent(eventId: string, eventType: string, cameraId: string, description: string): void {
    const entry = {
      eventId,
      eventType,
      timestamp: new Date().toISOString(),
      description: `[SIMULATION MODE] Camera ${cameraId}: ${description}`,
    };
    this.state.recentEventsEmitted.unshift(entry);
    if (this.state.recentEventsEmitted.length > 50) {
      this.state.recentEventsEmitted.pop();
    }
  }

  private broadcastStateChange(): void {
    const envelope: RealtimeEventEnvelope = {
      eventId: `dt-state-${Date.now()}`,
      eventType: 'simulation.state_change',
      timestamp: new Date().toISOString(),
      source: 'ibvap-digital-twin-service',
      payload: this.getState(),
    };
    dataStore.broadcastEvent(envelope);
  }
}

export const digitalTwinService = new DigitalTwinService();
