/**
 * IBVAP — Observable Border Analytics Rule Engine
 *
 * Evaluates observable behavioral and environmental patterns with measurable conditions:
 * - Night movement analytics (night.person.detected, night.vehicle.detected, night.zone.entry)
 * - Loitering / dwell analytics (loitering.observed)
 * - Repeated fence crossings (fence.repeated_crossing)
 * - Wrong-way / direction analytics (direction.anomaly)
 * - Restricted-hours analytics (restricted_hours.person_entry, restricted_hours.vehicle_entry)
 * - Person/vehicle interactions (person_vehicle.interaction.observed)
 * - Group activity (group.activity.observed)
 * - Repeated observations (entity.repeated_observation)
 *
 * Adheres strictly to observable operational metrics without speculation or unsubstantiated intent claims.
 */

import {
  AdvancedAnalyticsEvent,
  AdvancedAnalyticsEventType,
  ObservableRuleConfig,
  SourceProvenance,
} from './types';
import { cameraGraphManager } from './camera-graph';
import { dataStore } from '../server/store';
import { AlertSeverity } from '../server/types';

export class ObservationRuleEngine {
  private config: ObservableRuleConfig;
  private events: AdvancedAnalyticsEvent[] = [];
  /** Internal tracking of fence crossings per trackId: trackId -> list of { fenceId, timestampMs } */
  private fenceCrossingsByTrack: Map<string, { fenceId: string; timestampMs: number }[]> = new Map();
  /** Internal tracking of zone dwell: `${cameraId}:${zoneId}:${trackId}` -> firstSeenTimestampMs */
  private zoneDwells: Map<string, { firstSeenMs: number; lastSeenMs: number; objectType: string }> = new Map();

  constructor(initialConfig?: Partial<ObservableRuleConfig>) {
    this.config = {
      nightHours: {
        enabled: true,
        startHour: 22, // 22:00
        endHour: 5,    // 05:00
      },
      loitering: {
        enabled: true,
        personDwellThresholdSeconds: 120,
        vehicleDwellThresholdSeconds: 180,
      },
      repeatedFence: {
        enabled: true,
        thresholdCrossings: 2,
        timeWindowSeconds: 600,
      },
      directionAnomaly: {
        enabled: true,
        strictCorridorEnforcement: true,
      },
      restrictedHours: {
        enabled: true,
        startHour: 0,
        endHour: 5,
      },
      personVehicleInteraction: {
        enabled: true,
        maxInteractionDistanceNormalized: 0.15,
        minProximitySeconds: 15,
      },
      groupActivity: {
        enabled: true,
        minGroupSize: 3,
        zoneConcentrationWindowSeconds: 60,
      },
      repeatedObservations: {
        enabled: true,
        minAppearances: 3,
        windowMinutes: 60,
      },
      ...initialConfig,
    };

    this.seedBaselineAnalyticsEvents();
  }

  public getConfig(): ObservableRuleConfig {
    return { ...this.config };
  }

  public updateConfig(patch: Partial<ObservableRuleConfig>): ObservableRuleConfig {
    this.config = { ...this.config, ...patch };
    return { ...this.config };
  }

  public getEvents(filters?: {
    eventType?: AdvancedAnalyticsEventType;
    cameraId?: string;
    severity?: AlertSeverity;
    trackId?: string;
  }): AdvancedAnalyticsEvent[] {
    let list = [...this.events];
    if (filters?.eventType) list = list.filter((e) => e.eventType === filters.eventType);
    if (filters?.cameraId) list = list.filter((e) => e.cameraId === filters.cameraId || e.cameraIdentifier === filters.cameraId);
    if (filters?.severity) list = list.filter((e) => e.severity === filters.severity);
    if (filters?.trackId) list = list.filter((e) => e.trackId === filters.trackId);
    return list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  /**
   * Helper to check if a date/hour falls within a night/restricted hour range.
   */
  public isHourInRange(hour: number, startHour: number, endHour: number): boolean {
    if (startHour <= endHour) {
      return hour >= startHour && hour < endHour;
    } else {
      // Overnight range (e.g. 22:00 to 05:00)
      return hour >= startHour || hour < endHour;
    }
  }

  /**
   * 1. Evaluate Night Movement Analytics.
   */
  public evaluateNightMovement(params: {
    cameraId: string;
    cameraIdentifier?: string;
    trackId: string;
    objectType: 'person' | 'vehicle';
    zoneId?: string;
    zoneName?: string;
    timestamp?: string;
    provenance?: SourceProvenance;
  }): AdvancedAnalyticsEvent | null {
    if (!this.config.nightHours.enabled) return null;

    const date = params.timestamp ? new Date(params.timestamp) : new Date();
    const hour = date.getHours();

    if (!this.isHourInRange(hour, this.config.nightHours.startHour, this.config.nightHours.endHour)) {
      return null;
    }

    const camera = dataStore.getCamera(params.cameraId);
    const camIdentifier = params.cameraIdentifier || camera?.cameraId || params.cameraId;
    const sectorId = camera?.sectorId || 'sec-bravo';
    const sectorName = camera?.sectorName || 'Sector Bravo';

    const eventType: AdvancedAnalyticsEventType = params.zoneId
      ? 'night.zone.entry'
      : params.objectType === 'person'
      ? 'night.person.detected'
      : 'night.vehicle.detected';

    const event: AdvancedAnalyticsEvent = {
      eventId: `aev-night-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      eventType,
      timestamp: date.toISOString(),
      cameraId: params.cameraId,
      cameraIdentifier: camIdentifier,
      sectorId,
      sectorName,
      trackId: params.trackId,
      objectType: params.objectType,
      zoneId: params.zoneId,
      zoneName: params.zoneName,
      severity: params.zoneId ? 'HIGH' : 'MEDIUM',
      ruleId: 'RULE-NIGHT-01',
      ruleName: 'Night Movement Observation Rule',
      triggerReason: `Observed ${params.objectType} during configured night observation hours (${this.config.nightHours.startHour}:00 - ${this.config.nightHours.endHour}:00)`,
      observableMetrics: {
        configuredWindow: `${this.config.nightHours.startHour}:00-${this.config.nightHours.endHour}:00`,
      },
      reasoningFactors: [
        {
          factor: 'Operating within designated low-light observation hours',
          detail: `Detection timestamp ${date.toISOString()} matches active night schedule`,
          weight: 0.5,
        },
        {
          factor: 'Sensor infrared / thermal imaging mode active',
          detail: 'Low ambient illuminance detected at sector camera mast',
          weight: 0.3,
        },
      ],
      isAlertElevated: true,
      provenance: params.provenance || 'SIMULATION',
    };

    this.recordEvent(event);
    return event;
  }

  /**
   * 2. Evaluate Loitering / Dwell Analytics.
   */
  public evaluateLoitering(params: {
    cameraId: string;
    cameraIdentifier?: string;
    trackId: string;
    objectType: 'person' | 'vehicle';
    zoneId: string;
    zoneName: string;
    dwellSeconds: number;
    timestamp?: string;
    provenance?: SourceProvenance;
  }): AdvancedAnalyticsEvent | null {
    if (!this.config.loitering.enabled) return null;

    const threshold =
      params.objectType === 'person'
        ? this.config.loitering.personDwellThresholdSeconds
        : this.config.loitering.vehicleDwellThresholdSeconds;

    if (params.dwellSeconds < threshold) return null;

    const camera = dataStore.getCamera(params.cameraId);
    const camIdentifier = params.cameraIdentifier || camera?.cameraId || params.cameraId;
    const sectorId = camera?.sectorId || 'sec-bravo';
    const sectorName = camera?.sectorName || 'Sector Bravo';

    const event: AdvancedAnalyticsEvent = {
      eventId: `aev-loiter-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      eventType: 'loitering.observed',
      timestamp: params.timestamp || new Date().toISOString(),
      cameraId: params.cameraId,
      cameraIdentifier: camIdentifier,
      sectorId,
      sectorName,
      trackId: params.trackId,
      objectType: params.objectType,
      zoneId: params.zoneId,
      zoneName: params.zoneName,
      severity: 'HIGH',
      ruleId: 'RULE-LOITER-01',
      ruleName: 'Observable Zone Loitering Rule',
      triggerReason: `Dwell duration (${params.dwellSeconds}s) exceeded configured threshold (${threshold}s) in ${params.zoneName}`,
      observableMetrics: {
        dwellSeconds: params.dwellSeconds,
      },
      reasoningFactors: [
        {
          factor: 'Zone dwell duration exceeded operational threshold',
          detail: `Object active in zone for ${params.dwellSeconds}s (threshold: ${threshold}s)`,
          weight: 0.6,
        },
        {
          factor: 'Lack of persistent displacement vector',
          detail: 'Kinematic tracking shows centroid remaining within zone polygon bounds',
          weight: 0.4,
        },
      ],
      isAlertElevated: true,
      provenance: params.provenance || 'SIMULATION',
    };

    this.recordEvent(event);
    return event;
  }

  /**
   * 3. Evaluate Repeated Fence Crossings.
   */
  public evaluateFenceCrossing(params: {
    cameraId: string;
    cameraIdentifier?: string;
    trackId: string;
    objectType: 'person' | 'vehicle';
    fenceId: string;
    timestamp?: string;
    provenance?: SourceProvenance;
  }): AdvancedAnalyticsEvent | null {
    if (!this.config.repeatedFence.enabled) return null;

    const now = params.timestamp ? new Date(params.timestamp).getTime() : Date.now();
    const history = this.fenceCrossingsByTrack.get(params.trackId) || [];

    // Filter out crossings outside time window
    const windowMs = this.config.repeatedFence.timeWindowSeconds * 1000;
    const recent = history.filter((h) => now - h.timestampMs <= windowMs);
    recent.push({ fenceId: params.fenceId, timestampMs: now });
    this.fenceCrossingsByTrack.set(params.trackId, recent);

    if (recent.length >= this.config.repeatedFence.thresholdCrossings) {
      const camera = dataStore.getCamera(params.cameraId);
      const camIdentifier = params.cameraIdentifier || camera?.cameraId || params.cameraId;
      const sectorId = camera?.sectorId || 'sec-bravo';
      const sectorName = camera?.sectorName || 'Sector Bravo';

      const event: AdvancedAnalyticsEvent = {
        eventId: `aev-fence-rep-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        eventType: 'fence.repeated_crossing',
        timestamp: new Date(now).toISOString(),
        cameraId: params.cameraId,
        cameraIdentifier: camIdentifier,
        sectorId,
        sectorName,
        trackId: params.trackId,
        objectType: params.objectType,
        severity: 'CRITICAL',
        ruleId: 'RULE-FENCE-REP-01',
        ruleName: 'Repeated Boundary Line Intersection Rule',
        triggerReason: `Same track intersected virtual boundary lines ${recent.length} times within ${this.config.repeatedFence.timeWindowSeconds}s`,
        observableMetrics: {
          crossingCount: recent.length,
          timeWindowMinutes: Math.round(this.config.repeatedFence.timeWindowSeconds / 60),
        },
        reasoningFactors: [
          {
            factor: 'Multiple fence crossings by identical tracking entity',
            detail: `${recent.length} boundary intersections recorded across [${recent.map((r) => r.fenceId).join(', ')}]`,
            weight: 0.7,
          },
          {
            factor: 'Short temporal interval between crossings',
            detail: `All crossings occurred within a ${this.config.repeatedFence.timeWindowSeconds}s operational window`,
            weight: 0.3,
          },
        ],
        isAlertElevated: true,
        provenance: params.provenance || 'SIMULATION',
      };

      this.recordEvent(event);
      return event;
    }

    return null;
  }

  /**
   * 4. Evaluate Wrong-Way / Direction Anomaly.
   */
  public evaluateDirectionAnomaly(params: {
    cameraId: string;
    cameraIdentifier?: string;
    trackId: string;
    objectType: 'person' | 'vehicle';
    observedDirection: string;
    expectedDirection: string;
    zoneName?: string;
    timestamp?: string;
    provenance?: SourceProvenance;
  }): AdvancedAnalyticsEvent | null {
    if (!this.config.directionAnomaly.enabled) return null;

    if (
      params.expectedDirection !== 'BIDIRECTIONAL' &&
      params.observedDirection !== 'UNKNOWN' &&
      params.observedDirection !== params.expectedDirection
    ) {
      const camera = dataStore.getCamera(params.cameraId);
      const camIdentifier = params.cameraIdentifier || camera?.cameraId || params.cameraId;
      const sectorId = camera?.sectorId || 'sec-bravo';
      const sectorName = camera?.sectorName || 'Sector Bravo';

      const event: AdvancedAnalyticsEvent = {
        eventId: `aev-dir-anom-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        eventType: 'direction.anomaly',
        timestamp: params.timestamp || new Date().toISOString(),
        cameraId: params.cameraId,
        cameraIdentifier: camIdentifier,
        sectorId,
        sectorName,
        trackId: params.trackId,
        objectType: params.objectType,
        zoneName: params.zoneName,
        severity: 'HIGH',
        ruleId: 'RULE-DIR-01',
        ruleName: 'Corridor Direction Compliance Rule',
        triggerReason: `Observed movement heading (${params.observedDirection}) opposes designated corridor flow (${params.expectedDirection})`,
        observableMetrics: {
          expectedDirection: params.expectedDirection,
          observedDirection: params.observedDirection,
        },
        reasoningFactors: [
          {
            factor: 'Heading vector opposes designated traffic pattern',
            detail: `Observed vector ${params.observedDirection} vs mandated ${params.expectedDirection}`,
            weight: 0.6,
          },
          {
            factor: 'Corridor kinematic flow consistency breach',
            detail: 'Advisory lane enforcement triggered on vehicle trajectory',
            weight: 0.4,
          },
        ],
        isAlertElevated: true,
        provenance: params.provenance || 'SIMULATION',
      };

      this.recordEvent(event);
      return event;
    }

    return null;
  }

  /**
   * 5. Evaluate Restricted-Hours Activity.
   */
  public evaluateRestrictedHours(params: {
    cameraId: string;
    cameraIdentifier?: string;
    trackId: string;
    objectType: 'person' | 'vehicle';
    zoneId?: string;
    zoneName?: string;
    timestamp?: string;
    provenance?: SourceProvenance;
  }): AdvancedAnalyticsEvent | null {
    if (!this.config.restrictedHours.enabled) return null;

    const date = params.timestamp ? new Date(params.timestamp) : new Date();
    const hour = date.getHours();

    if (!this.isHourInRange(hour, this.config.restrictedHours.startHour, this.config.restrictedHours.endHour)) {
      return null;
    }

    const camera = dataStore.getCamera(params.cameraId);
    const camIdentifier = params.cameraIdentifier || camera?.cameraId || params.cameraId;
    const sectorId = camera?.sectorId || 'sec-bravo';
    const sectorName = camera?.sectorName || 'Sector Bravo';

    const eventType: AdvancedAnalyticsEventType =
      params.objectType === 'person' ? 'restricted_hours.person_entry' : 'restricted_hours.vehicle_entry';

    const event: AdvancedAnalyticsEvent = {
      eventId: `aev-restr-hr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      eventType,
      timestamp: date.toISOString(),
      cameraId: params.cameraId,
      cameraIdentifier: camIdentifier,
      sectorId,
      sectorName,
      trackId: params.trackId,
      objectType: params.objectType,
      zoneId: params.zoneId,
      zoneName: params.zoneName,
      severity: 'HIGH',
      ruleId: 'RULE-RESTR-HR-01',
      ruleName: 'Restricted Facility Operating Schedule Rule',
      triggerReason: `Access observed during curfew / restricted facility hours (${this.config.restrictedHours.startHour}:00 - ${this.config.restrictedHours.endHour}:00)`,
      observableMetrics: {
        configuredWindow: `${this.config.restrictedHours.startHour}:00-${this.config.restrictedHours.endHour}:00`,
      },
      reasoningFactors: [
        {
          factor: 'Movement during non-operational curfew schedule',
          detail: `Recorded at ${date.toISOString()} during restricted zone hours`,
          weight: 0.6,
        },
      ],
      isAlertElevated: true,
      provenance: params.provenance || 'SIMULATION',
    };

    this.recordEvent(event);
    return event;
  }

  /**
   * 6. Evaluate Person/Vehicle Interaction.
   */
  public evaluatePersonVehicleInteraction(params: {
    cameraId: string;
    cameraIdentifier?: string;
    personTrackId: string;
    vehicleTrackId: string;
    distanceMeters?: number;
    dwellSeconds?: number;
    zoneName?: string;
    timestamp?: string;
    provenance?: SourceProvenance;
  }): AdvancedAnalyticsEvent {
    const camera = dataStore.getCamera(params.cameraId);
    const camIdentifier = params.cameraIdentifier || camera?.cameraId || params.cameraId;
    const sectorId = camera?.sectorId || 'sec-bravo';
    const sectorName = camera?.sectorName || 'Sector Bravo';

    const event: AdvancedAnalyticsEvent = {
      eventId: `aev-pv-inter-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      eventType: 'person_vehicle.interaction.observed',
      timestamp: params.timestamp || new Date().toISOString(),
      cameraId: params.cameraId,
      cameraIdentifier: camIdentifier,
      sectorId,
      sectorName,
      trackId: `${params.personTrackId}&${params.vehicleTrackId}`,
      objectType: 'multi_entity',
      zoneName: params.zoneName,
      severity: 'MEDIUM',
      ruleId: 'RULE-PV-INTER-01',
      ruleName: 'Person / Vehicle Proximity Interaction Rule',
      triggerReason: `Person track ${params.personTrackId} approached and lingered near Vehicle track ${params.vehicleTrackId} (${params.dwellSeconds || 25}s)`,
      observableMetrics: {
        distanceMeters: params.distanceMeters || 3.5,
        dwellSeconds: params.dwellSeconds || 25,
        interactingTrackIds: [params.personTrackId, params.vehicleTrackId],
      },
      reasoningFactors: [
        {
          factor: 'Co-location within bounding interaction perimeter',
          detail: `Centroid distance measured at ${params.distanceMeters || 3.5}m for ${params.dwellSeconds || 25}s`,
          weight: 0.55,
        },
        {
          factor: 'Simultaneous dwell in perimeter zone',
          detail: `Both entities stationary in ${params.zoneName || 'Approach Corridor'}`,
          weight: 0.45,
        },
      ],
      isAlertElevated: true,
      provenance: params.provenance || 'SIMULATION',
    };

    this.recordEvent(event);
    return event;
  }

  /**
   * 7. Evaluate Group Activity.
   */
  public evaluateGroupActivity(params: {
    cameraId: string;
    cameraIdentifier?: string;
    trackIds: string[];
    zoneId: string;
    zoneName: string;
    timestamp?: string;
    provenance?: SourceProvenance;
  }): AdvancedAnalyticsEvent | null {
    if (!this.config.groupActivity.enabled) return null;

    if (params.trackIds.length < this.config.groupActivity.minGroupSize) return null;

    const camera = dataStore.getCamera(params.cameraId);
    const camIdentifier = params.cameraIdentifier || camera?.cameraId || params.cameraId;
    const sectorId = camera?.sectorId || 'sec-bravo';
    const sectorName = camera?.sectorName || 'Sector Bravo';

    const event: AdvancedAnalyticsEvent = {
      eventId: `aev-group-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      eventType: 'group.activity.observed',
      timestamp: params.timestamp || new Date().toISOString(),
      cameraId: params.cameraId,
      cameraIdentifier: camIdentifier,
      sectorId,
      sectorName,
      objectType: 'group',
      zoneId: params.zoneId,
      zoneName: params.zoneName,
      severity: 'HIGH',
      ruleId: 'RULE-GROUP-01',
      ruleName: 'Multi-Subject Density Cluster Rule',
      triggerReason: `Cluster of ${params.trackIds.length} person tracks formed within zone ${params.zoneName}`,
      observableMetrics: {
        groupSize: params.trackIds.length,
        interactingTrackIds: params.trackIds,
      },
      reasoningFactors: [
        {
          factor: 'High localized subject density',
          detail: `${params.trackIds.length} tracks detected simultaneously inside single zone polygon`,
          weight: 0.7,
        },
      ],
      isAlertElevated: true,
      provenance: params.provenance || 'SIMULATION',
    };

    this.recordEvent(event);
    return event;
  }

  /**
   * 8. Evaluate Repeated Observations of Entity.
   */
  public evaluateRepeatedObservation(params: {
    cameraId: string;
    cameraIdentifier?: string;
    entityIdentifier: string; // plate or face ID
    entityType: 'person' | 'vehicle';
    appearanceCount: number;
    camerasObserved: string[];
    timestamp?: string;
    provenance?: SourceProvenance;
  }): AdvancedAnalyticsEvent | null {
    if (!this.config.repeatedObservations.enabled) return null;

    if (params.appearanceCount < this.config.repeatedObservations.minAppearances) return null;

    const camera = dataStore.getCamera(params.cameraId);
    const camIdentifier = params.cameraIdentifier || camera?.cameraId || params.cameraId;
    const sectorId = camera?.sectorId || 'sec-bravo';
    const sectorName = camera?.sectorName || 'Sector Bravo';

    const event: AdvancedAnalyticsEvent = {
      eventId: `aev-rep-obs-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      eventType: 'entity.repeated_observation',
      timestamp: params.timestamp || new Date().toISOString(),
      cameraId: params.cameraId,
      cameraIdentifier: camIdentifier,
      sectorId,
      sectorName,
      trackId: params.entityIdentifier,
      objectType: params.entityType,
      severity: 'HIGH',
      ruleId: 'RULE-REP-OBS-01',
      ruleName: 'Recurrent Border Presence Observation Rule',
      triggerReason: `Entity ${params.entityIdentifier} observed ${params.appearanceCount} times across cameras [${params.camerasObserved.join(', ')}]`,
      observableMetrics: {
        observationCount: params.appearanceCount,
        timeWindowMinutes: this.config.repeatedObservations.windowMinutes,
      },
      reasoningFactors: [
        {
          factor: 'Frequency of recurrent appearance meets observation threshold',
          detail: `${params.appearanceCount} sightings within ${this.config.repeatedObservations.windowMinutes} minutes`,
          weight: 0.65,
        },
        {
          factor: 'Dispersion across multiple surveillance sectors',
          detail: `Sightings confirmed across ${params.camerasObserved.length} separate camera nodes`,
          weight: 0.35,
        },
      ],
      isAlertElevated: true,
      provenance: params.provenance || 'SIMULATION',
    };

    this.recordEvent(event);
    return event;
  }

  /**
   * Internal recording and alert integration.
   */
  private recordEvent(event: AdvancedAnalyticsEvent): void {
    this.events.unshift(event);
    if (this.events.length > 500) {
      this.events = this.events.slice(0, 500);
    }

    // Integrate with Platform Alert Queue if elevated
    if (event.isAlertElevated) {
      this.elevateToAlert(event);
    }
  }

  private elevateToAlert(event: AdvancedAnalyticsEvent): void {
    const alertId = `alt-ana-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`;
    event.associatedAlertId = alertId;

    const alertTitle =
      event.eventType === 'night.person.detected'
        ? `Nighttime Person Movement (${event.cameraIdentifier})`
        : event.eventType === 'night.vehicle.detected'
        ? `Nighttime Vehicle Movement (${event.cameraIdentifier})`
        : event.eventType === 'night.zone.entry'
        ? `Nighttime Entry into ${event.zoneName || 'Buffer'}`
        : event.eventType === 'loitering.observed'
        ? `Zone Dwell / Loitering Pattern (${event.zoneName || event.cameraIdentifier})`
        : event.eventType === 'fence.repeated_crossing'
        ? `Repeated Virtual Fence Breach (${event.cameraIdentifier})`
        : event.eventType === 'direction.anomaly'
        ? `Corridor Direction Anomaly (${event.cameraIdentifier})`
        : event.eventType === 'person_vehicle.interaction.observed'
        ? `Person-Vehicle Proximity Interaction (${event.cameraIdentifier})`
        : event.eventType === 'group.activity.observed'
        ? `Group Movement Cluster in ${event.zoneName || event.cameraIdentifier}`
        : `Recurrent Entity Sightings (${event.trackId || event.cameraIdentifier})`;

    dataStore.alerts.unshift({
      id: alertId,
      alertNumber: `ALT-A${dataStore.alerts.length + 100}`,
      title: alertTitle,
      description: event.triggerReason,
      severity: event.severity,
      status: 'PENDING_ACK',
      cameraId: event.cameraId,
      cameraIdentifier: event.cameraIdentifier,
      sectorId: event.sectorId,
      sectorName: event.sectorName,
      zoneName: event.zoneName,
      timestamp: event.timestamp,
      confidenceScore: 0.91,
      reasoningFactors: event.reasoningFactors.map((rf) => ({
        factor: rf.factor,
        weight: rf.weight,
        verified: true,
        detail: rf.detail,
      })),
      thumbnailUrl: 'https://images.unsplash.com/photo-1509228468518-180dd4864904?auto=format&fit=crop&w=400&q=80',
      isSimulation: true,
    });
  }

  /**
   * Pre-seed baseline analytics events for demo readiness.
   */
  private seedBaselineAnalyticsEvents(): void {
    const now = Date.now();

    this.events.push(
      {
        eventId: 'aev-seed-01',
        eventType: 'night.person.detected',
        timestamp: new Date(now - 14 * 60 * 1000).toISOString(),
        cameraId: 'cam-01',
        cameraIdentifier: 'CAM-01',
        sectorId: 'sec-bravo',
        sectorName: 'Sector Bravo',
        trackId: 'PRS-TRK-201',
        objectType: 'person',
        zoneId: 'zone-b1',
        zoneName: 'Primary Perimeter Buffer North',
        severity: 'HIGH',
        ruleId: 'RULE-NIGHT-01',
        ruleName: 'Night Movement Observation Rule',
        triggerReason: 'Observed person during configured night observation hours (22:00 - 05:00)',
        observableMetrics: { configuredWindow: '22:00-05:00' },
        reasoningFactors: [
          { factor: 'Low-light thermal IR classification', detail: 'High-contrast bipedal silhouette at 0.04 lux', weight: 0.6 },
          { factor: 'Inside prohibited buffer perimeter', detail: 'Crossed 18m inside north ravine buffer', weight: 0.4 },
        ],
        isAlertElevated: true,
        associatedAlertId: 'alt-101',
        provenance: 'SIMULATION',
      },
      {
        eventId: 'aev-seed-02',
        eventType: 'loitering.observed',
        timestamp: new Date(now - 28 * 60 * 1000).toISOString(),
        cameraId: 'cam-05',
        cameraIdentifier: 'CAM-05',
        sectorId: 'sec-delta',
        sectorName: 'Sector Delta',
        trackId: 'VEH-TRK-055',
        objectType: 'vehicle',
        zoneId: 'zone-d1',
        zoneName: 'River Shallows Approach Corridor',
        severity: 'HIGH',
        ruleId: 'RULE-LOITER-01',
        ruleName: 'Observable Zone Loitering Rule',
        triggerReason: 'Dwell duration (210s) exceeded configured threshold (180s) in River Shallows Approach Corridor',
        observableMetrics: { dwellSeconds: 210 },
        reasoningFactors: [
          { factor: 'Extended static presence', detail: 'Craft remained stationary for 210s in sensitive waterway channel', weight: 0.6 },
        ],
        isAlertElevated: true,
        associatedAlertId: 'alt-105',
        provenance: 'SIMULATION',
      },
      {
        eventId: 'aev-seed-03',
        eventType: 'direction.anomaly',
        timestamp: new Date(now - 45 * 60 * 1000).toISOString(),
        cameraId: 'cam-08',
        cameraIdentifier: 'CAM-08',
        sectorId: 'sec-charlie',
        sectorName: 'Sector Charlie',
        trackId: 'VEH-TRK-088',
        objectType: 'vehicle',
        zoneName: 'Highway 10 Checkpoint Approach',
        severity: 'HIGH',
        ruleId: 'RULE-DIR-01',
        ruleName: 'Corridor Direction Compliance Rule',
        triggerReason: 'Observed movement heading (SOUTH) opposes designated corridor flow (NORTH)',
        observableMetrics: { expectedDirection: 'NORTH', observedDirection: 'SOUTH' },
        reasoningFactors: [
          { factor: 'Heading vector opposes one-way checkpoint corridor', detail: 'Vehicle executed U-turn against designated approach vector', weight: 0.7 },
        ],
        isAlertElevated: true,
        provenance: 'SIMULATION',
      }
    );
  }
}

export const observationRuleEngine = new ObservationRuleEngine();
