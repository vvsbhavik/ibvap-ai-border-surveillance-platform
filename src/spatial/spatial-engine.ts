/**
 * IBVAP Spatial Rules & Zone Intelligence Evaluation Engine
 * Evaluates real-time Multi-Object Tracker output against camera-scoped geometries.
 * Guarantees zero fake events, strict state transitions, and persistent track awareness.
 */

import {
  SpatialZone,
  SpatialEvent,
  TrackSpatialState,
  SpatialEngineMetrics,
  ZoneOccupancy,
} from './types';
import { Track } from '../tracking/types';
import {
  getTrackAnchorPoint,
  isPointInPolygon,
  checkFenceCrossing,
  pointDistance,
} from './geometry';

export type SpatialEventListener = (event: SpatialEvent) => void;

export class SpatialEngine {
  // Active track state indexed by trackId
  private trackStates: Map<string, TrackSpatialState> = new Map();

  // Registered event listeners
  private listeners: Set<SpatialEventListener> = new Set();

  // Metrics and telemetry
  private metrics: SpatialEngineMetrics = {
    totalEvaluations: 0,
    activeTracksTracked: 0,
    totalZoneEntries: 0,
    totalZoneExits: 0,
    totalFenceCrossings: 0,
    eventsEmitted: 0,
    avgLatencyMs: 0,
  };

  private latencies: number[] = [];

  // In-memory ring buffer of recent spatial events
  private recentEvents: SpatialEvent[] = [];
  private readonly maxEventsHistory = 1000;

  /**
   * Subscribe to real-time spatial events.
   */
  public onEvent(listener: SpatialEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private dispatchEvent(event: SpatialEvent): void {
    this.recentEvents.unshift(event);
    if (this.recentEvents.length > this.maxEventsHistory) {
      this.recentEvents.pop();
    }

    this.metrics.eventsEmitted++;

    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('[SpatialEngine] Listener dispatch error:', err);
      }
    }
  }

  /**
   * Check if zone is active based on schedule
   */
  public isZoneActiveInSchedule(zone: SpatialZone, now: Date = new Date()): boolean {
    if (!zone.active) return false;
    if (!zone.schedule || zone.schedule.allTimes !== false) return true;

    if (zone.schedule.daysOfWeek && zone.schedule.daysOfWeek.length > 0) {
      const currentDay = now.getDay();
      if (!zone.schedule.daysOfWeek.includes(currentDay)) {
        return false;
      }
    }

    if (zone.schedule.activeHours) {
      const currentHours = now.getHours();
      const currentMinutes = now.getMinutes();
      const currentMinutesTotal = currentHours * 60 + currentMinutes;

      const [sH, sM] = zone.schedule.activeHours.start.split(':').map(Number);
      const [eH, eM] = zone.schedule.activeHours.end.split(':').map(Number);
      const startMinutes = sH * 60 + (sM || 0);
      const endMinutes = eH * 60 + (eM || 0);

      if (startMinutes <= endMinutes) {
        return currentMinutesTotal >= startMinutes && currentMinutesTotal <= endMinutes;
      } else {
        // Spans midnight
        return currentMinutesTotal >= startMinutes || currentMinutesTotal <= endMinutes;
      }
    }

    return true;
  }

  /**
   * Evaluates tracks for a specific camera against that camera's spatial zones.
   */
  public evaluateCameraTracks(
    cameraId: string,
    cameraIdentifier: string | undefined,
    tracks: Track[],
    zones: SpatialZone[],
    frameTimestamp: string = new Date().toISOString()
  ): SpatialEvent[] {
    const startTime = performance.now();
    const emittedEvents: SpatialEvent[] = [];
    const nowMs = frameTimestamp ? new Date(frameTimestamp).getTime() : Date.now();

    // Filter zones strictly to this camera and active status
    const cameraZones = zones.filter(
      (z) =>
        (z.cameraId === cameraId || (cameraIdentifier && z.cameraId === cameraIdentifier)) &&
        this.isZoneActiveInSchedule(z)
    );

    for (const track of tracks) {
      // 1. LIFECYCLE: TEMPORARILY_LOST
      // When a track is temporarily lost (e.g. occlusion behind post),
      // DO NOT trigger false exit! Retain the spatial relationship during the loss window.
      if (track.state === 'TEMPORARILY_LOST') {
        const existingState = this.trackStates.get(track.trackId);
        if (existingState) {
          existingState.lastUpdated = frameTimestamp;
        }
        continue;
      }

      // 2. LIFECYCLE: ENDED
      // When a track is confirmed ended, cleanly exit all active zones
      if (track.state === 'ENDED') {
        const existingState = this.trackStates.get(track.trackId);
        if (existingState && existingState.activeZones.size > 0) {
          for (const [zoneId, entry] of existingState.activeZones.entries()) {
            const zone = cameraZones.find((z) => z.zoneId === zoneId);
            const dwellSeconds = Math.max(0, Math.round((nowMs - entry.enteredTimestampMs) / 1000));

            const exitEvent: SpatialEvent = {
              eventId: `evt-sp-exit-${Date.now()}-${track.trackId}-${zoneId}`,
              eventType: 'zone.exited',
              timestamp: frameTimestamp,
              cameraId,
              cameraIdentifier,
              trackId: track.trackId,
              zoneId,
              zoneName: zone?.name || zoneId,
              zoneType: zone?.type || 'CUSTOM',
              geometryType: 'POLYGON',
              objectType: track.objectType || 'person',
              position: existingState.lastAnchorPoint || getTrackAnchorPoint(track),
              direction: track.direction,
              dwellTimeSeconds: dwellSeconds,
              severity: 'INFO',
              isViolation: false,
              metadata: { reason: 'TRACK_TERMINATED' },
            };

            this.dispatchEvent(exitEvent);
            emittedEvents.push(exitEvent);
            this.metrics.totalZoneExits++;
          }
        }
        this.trackStates.delete(track.trackId);
        continue;
      }

      // 3. ACTIVE TRACK EVALUATION
      let state = this.trackStates.get(track.trackId);
      if (!state) {
        state = {
          trackId: track.trackId,
          cameraId,
          activeZones: new Map(),
          lastFenceCrossing: new Map(),
          lastAnchorPoint: undefined,
          lastUpdated: frameTimestamp,
        };
        this.trackStates.set(track.trackId, state);
      }

      // Ground plane footprint of the person
      const currentAnchor = getTrackAnchorPoint(track, 'GROUND_FOOTPRINT');
      const prevAnchor = state.lastAnchorPoint || currentAnchor;

      for (const zone of cameraZones) {
        if (zone.geometry === 'POLYGON') {
          // Point-in-polygon evaluation
          const isInside = isPointInPolygon(currentAnchor, zone.coordinates);
          const isCurrentlyActive = state.activeZones.has(zone.zoneId);

          if (isInside && !isCurrentlyActive) {
            // TRANSITION: OUTSIDE -> INSIDE
            // Generate entry event strictly once
            state.activeZones.set(zone.zoneId, {
              enteredAt: frameTimestamp,
              enteredTimestampMs: nowMs,
            });

            const severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO' =
              zone.type === 'RESTRICTED_AREA'
                ? 'CRITICAL'
                : zone.type === 'MONITORING_AREA'
                ? 'HIGH'
                : zone.type === 'OBSERVATION_AREA'
                ? 'MEDIUM'
                : 'LOW';

            const enterEvent: SpatialEvent = {
              eventId: `evt-sp-ent-${Date.now()}-${track.trackId}-${zone.zoneId}`,
              eventType: 'zone.entered',
              timestamp: frameTimestamp,
              cameraId,
              cameraIdentifier,
              trackId: track.trackId,
              zoneId: zone.zoneId,
              zoneName: zone.name,
              zoneType: zone.type,
              geometryType: 'POLYGON',
              objectType: track.objectType || 'person',
              vehicleClass: track.vehicleClass,
              position: currentAnchor,
              direction: track.direction,
              severity,
              isViolation: zone.type === 'RESTRICTED_AREA',
              metadata: {
                confidence: track.currentConfidence,
                dwellTimeSeconds: 0,
                vehicleClass: track.vehicleClass,
              },
            };

            this.dispatchEvent(enterEvent);
            emittedEvents.push(enterEvent);
            this.metrics.totalZoneEntries++;
          } else if (!isInside && isCurrentlyActive) {
            // TRANSITION: INSIDE -> OUTSIDE
            // Generate exit event strictly once
            const entry = state.activeZones.get(zone.zoneId);
            const dwellSeconds = entry
              ? Math.max(0, Math.round((nowMs - entry.enteredTimestampMs) / 1000))
              : 0;

            state.activeZones.delete(zone.zoneId);

            const exitEvent: SpatialEvent = {
              eventId: `evt-sp-ext-${Date.now()}-${track.trackId}-${zone.zoneId}`,
              eventType: 'zone.exited',
              timestamp: frameTimestamp,
              cameraId,
              cameraIdentifier,
              trackId: track.trackId,
              zoneId: zone.zoneId,
              zoneName: zone.name,
              zoneType: zone.type,
              geometryType: 'POLYGON',
              objectType: track.objectType || 'person',
              vehicleClass: track.vehicleClass,
              position: currentAnchor,
              direction: track.direction,
              dwellTimeSeconds: dwellSeconds,
              severity: 'INFO',
              isViolation: false,
              metadata: {
                dwellTimeSeconds: dwellSeconds,
                vehicleClass: track.vehicleClass,
              },
            };

            this.dispatchEvent(exitEvent);
            emittedEvents.push(exitEvent);
            this.metrics.totalZoneExits++;
          } else if (isInside && isCurrentlyActive) {
            // INSIDE -> INSIDE: Dwell state continues, NO duplicate entry event emitted!
            // Evaluate dwell warning threshold if configured
            const entry = state.activeZones.get(zone.zoneId);
            if (entry && zone.dwellWarningSeconds && zone.dwellWarningSeconds > 0) {
              const currentDwellSeconds = (nowMs - entry.enteredTimestampMs) / 1000;
              if (currentDwellSeconds >= zone.dwellWarningSeconds && !entry.dwellWarningEmitted) {
                entry.dwellWarningEmitted = true;
                const dwellWarnSeverity = zone.type === 'RESTRICTED_AREA' ? 'CRITICAL' : 'HIGH';

                const dwellEvent: SpatialEvent = {
                  eventId: `evt-sp-dw-${Date.now()}-${track.trackId}-${zone.zoneId}`,
                  eventType: 'zone.dwell_warning',
                  timestamp: frameTimestamp,
                  cameraId,
                  cameraIdentifier,
                  trackId: track.trackId,
                  zoneId: zone.zoneId,
                  zoneName: zone.name,
                  zoneType: zone.type,
                  geometryType: 'POLYGON',
                  objectType: track.objectType || 'person',
                  vehicleClass: track.vehicleClass,
                  position: currentAnchor,
                  direction: track.direction,
                  dwellTimeSeconds: Math.round(currentDwellSeconds),
                  severity: dwellWarnSeverity,
                  isViolation: zone.type === 'RESTRICTED_AREA',
                  metadata: {
                    dwellWarningSeconds: zone.dwellWarningSeconds,
                    maxDwellSeconds: zone.maxDwellSeconds,
                    dwellTimeSeconds: Math.round(currentDwellSeconds),
                    vehicleClass: track.vehicleClass,
                  },
                };

                this.dispatchEvent(dwellEvent);
                emittedEvents.push(dwellEvent);
              }
            }
          }
        } else if (zone.geometry === 'LINE') {
          // Virtual Fence line-segment intersection
          // Requires motion between distinct coordinates
          const dist = pointDistance(prevAnchor, currentAnchor);
          if (dist > 0.002) {
            const crossing = checkFenceCrossing(prevAnchor, currentAnchor, zone.coordinates);

            if (crossing && crossing.crossed) {
              // Deduplication & hysteresis check:
              // Prevent rapid oscillation re-triggers within 2.5 seconds
              const lastCrossing = state.lastFenceCrossing.get(zone.zoneId);
              const cooldownMs = 2500;
              const hasRecentCrossing = lastCrossing && nowMs - lastCrossing.timestampMs < cooldownMs;

              if (!hasRecentCrossing || lastCrossing.direction !== crossing.direction) {
                state.lastFenceCrossing.set(zone.zoneId, {
                  crossedAt: frameTimestamp,
                  timestampMs: nowMs,
                  direction: crossing.direction,
                });

                // Check direction violation rules
                let isViolation = false;
                if (zone.direction === 'LEFT_TO_RIGHT' && crossing.direction !== 'LEFT_TO_RIGHT') {
                  isViolation = true;
                } else if (zone.direction === 'RIGHT_TO_LEFT' && crossing.direction !== 'RIGHT_TO_LEFT') {
                  isViolation = true;
                } else if (zone.type === 'RESTRICTED_AREA') {
                  isViolation = true;
                }

                const severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO' =
                  isViolation || zone.type === 'RESTRICTED_AREA'
                    ? 'CRITICAL'
                    : zone.type === 'MONITORING_AREA'
                    ? 'HIGH'
                    : 'MEDIUM';

                const fenceEvent: SpatialEvent = {
                  eventId: `evt-sp-fnc-${Date.now()}-${track.trackId}-${zone.zoneId}`,
                  eventType: 'fence.crossed',
                  timestamp: frameTimestamp,
                  cameraId,
                  cameraIdentifier,
                  trackId: track.trackId,
                  zoneId: zone.zoneId,
                  zoneName: zone.name,
                  zoneType: zone.type,
                  geometryType: 'LINE',
                  objectType: track.objectType || 'person',
                  vehicleClass: track.vehicleClass,
                  position: currentAnchor,
                  direction: track.direction,
                  crossingDirection: crossing.direction,
                  severity,
                  isViolation,
                  metadata: {
                    segmentIndex: crossing.segmentIndex,
                    configuredDirection: zone.direction || 'BIDIRECTIONAL',
                    vehicleClass: track.vehicleClass,
                  },
                };

                this.dispatchEvent(fenceEvent);
                emittedEvents.push(fenceEvent);
                this.metrics.totalFenceCrossings++;
              }
            }
          }
        }
      }

      state.lastAnchorPoint = currentAnchor;
      state.lastUpdated = frameTimestamp;
    }

    // Clean up expired tracks not seen in over 60 seconds
    const cleanupThresholdMs = 60 * 1000;
    const now = nowMs;
    for (const [trackId, st] of this.trackStates.entries()) {
      const lastUpdateMs = Date.parse(st.lastUpdated);
      if (!isNaN(lastUpdateMs) && now - lastUpdateMs > cleanupThresholdMs) {
        this.trackStates.delete(trackId);
      }
    }

    // Update telemetry
    const duration = performance.now() - startTime;
    this.latencies.push(duration);
    if (this.latencies.length > 100) this.latencies.shift();

    const sum = this.latencies.reduce((a, b) => a + b, 0);
    this.metrics.totalEvaluations++;
    this.metrics.activeTracksTracked = this.trackStates.size;
    this.metrics.avgLatencyMs = Number((sum / this.latencies.length).toFixed(2));
    this.metrics.lastEvaluatedAt = frameTimestamp;

    return emittedEvents;
  }

  /**
   * Query recent spatial events with filtering.
   */
  public queryEvents(filter?: {
    cameraId?: string;
    zoneId?: string;
    trackId?: string;
    eventType?: string;
    limit?: number;
  }): SpatialEvent[] {
    let result = [...this.recentEvents];

    if (filter?.cameraId) {
      result = result.filter((e) => e.cameraId === filter.cameraId);
    }
    if (filter?.zoneId) {
      result = result.filter((e) => e.zoneId === filter.zoneId);
    }
    if (filter?.trackId) {
      result = result.filter((e) => e.trackId === filter.trackId);
    }
    if (filter?.eventType) {
      result = result.filter((e) => e.eventType === filter.eventType);
    }

    if (filter?.limit && filter.limit > 0) {
      result = result.slice(0, filter.limit);
    }

    return result;
  }

  /**
   * Get active tracks currently residing inside a specific zone.
   */
  public getTracksInZone(zoneId: string): { trackId: string; enteredAt: string; dwellSeconds: number }[] {
    const results: { trackId: string; enteredAt: string; dwellSeconds: number }[] = [];
    const now = Date.now();

    for (const [trackId, state] of this.trackStates.entries()) {
      const entry = state.activeZones.get(zoneId);
      if (entry) {
        const dwellSeconds = Math.max(0, Math.round((now - entry.enteredTimestampMs) / 1000));
        results.push({
          trackId,
          enteredAt: entry.enteredAt,
          dwellSeconds,
        });
      }
    }

    return results;
  }

  /**
   * Get real-time zone occupancy calculation based on active tracks and spatial states.
   */
  public getZoneOccupancy(
    zone: SpatialZone,
    activeTracks?: Track[]
  ): ZoneOccupancy {
    const occupantTrackIds: string[] = [];
    let oldestOccupantMs = Infinity;
    let oldestOccupantAt: string | null = null;
    const nowMs = Date.now();

    // Check currently tracked states inside this zone
    for (const [trackId, state] of this.trackStates.entries()) {
      const entry = state.activeZones.get(zone.zoneId);
      if (entry) {
        // If activeTracks list is provided, ensure track is still present and not ENDED
        if (activeTracks) {
          const t = activeTracks.find((trk) => trk.trackId === trackId);
          if (!t || t.state === 'ENDED') continue;
        }
        if (!occupantTrackIds.includes(trackId)) {
          occupantTrackIds.push(trackId);
        }
        if (entry.enteredTimestampMs < oldestOccupantMs) {
          oldestOccupantMs = entry.enteredTimestampMs;
          oldestOccupantAt = entry.enteredAt;
        }
      }
    }

    // Also, if activeTracks was passed, check any tracks currently physically inside
    // to guarantee live synchronization
    if (activeTracks && zone.geometry === 'POLYGON') {
      for (const track of activeTracks) {
        if (track.state === 'ENDED' || occupantTrackIds.includes(track.trackId)) continue;
        const anchor = getTrackAnchorPoint(track, 'GROUND_FOOTPRINT');
        if (isPointInPolygon(anchor, zone.coordinates)) {
          occupantTrackIds.push(track.trackId);
          if (!oldestOccupantAt) {
            oldestOccupantAt = track.firstSeenAt || new Date(nowMs).toISOString();
          }
        }
      }
    }

    const personTrackIds = occupantTrackIds.filter((id) => {
      const trk = activeTracks?.find((t) => t.trackId === id);
      if (trk) return trk.objectType !== 'vehicle';
      return !id.startsWith('VEH-');
    });

    const vehicleTrackIds = occupantTrackIds.filter((id) => {
      const trk = activeTracks?.find((t) => t.trackId === id);
      if (trk) return trk.objectType === 'vehicle';
      return id.startsWith('VEH-');
    });

    return {
      zoneId: zone.zoneId,
      cameraId: zone.cameraId,
      zoneName: zone.name,
      currentOccupants: occupantTrackIds.length,
      occupantTrackIds,
      personOccupants: personTrackIds.length,
      vehicleOccupants: vehicleTrackIds.length,
      totalOccupants: occupantTrackIds.length,
      personTrackIds,
      vehicleTrackIds,
      oldestOccupantAt,
      updatedAt: new Date(nowMs).toISOString(),
    };
  }

  /**
   * Subsystem health & performance telemetry metrics.
   */
  public getMetrics(): SpatialEngineMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset track state for a camera.
   */
  public resetCameraState(cameraId: string): void {
    for (const [trackId, state] of this.trackStates.entries()) {
      if (state.cameraId === cameraId) {
        this.trackStates.delete(trackId);
      }
    }
  }

  /**
   * Retrieves active spatial intelligence context for a given track,
   * including active zones, restriction status, fence crossing, and dwell duration.
   */
  public getTrackSpatialContext(
    trackId: string,
    cameraZones?: SpatialZone[]
  ): {
    zoneId?: string;
    zoneName?: string;
    isRestricted?: boolean;
    isInsideRestrictedZone?: boolean;
    lastFenceCrossed?: string;
    dwellTimeSeconds?: number;
    sectorId?: string;
    sectorName?: string;
    direction?: string;
  } | undefined {
    const state = this.trackStates.get(trackId);
    if (!state) return undefined;

    let targetZoneId: string | undefined;
    let targetZone: SpatialZone | undefined;
    let dwellTimeSeconds: number | undefined;

    if (state.activeZones.size > 0) {
      const now = Date.now();
      // Look for a restricted zone first, or the first active zone
      for (const [zId, entry] of state.activeZones.entries()) {
        const found = cameraZones?.find((z) => z.zoneId === zId);
        const dwell = Math.max(0, Math.round((now - entry.enteredTimestampMs) / 1000));
        if (found?.isRestricted || found?.type === 'RESTRICTED_AREA') {
          targetZoneId = zId;
          targetZone = found;
          dwellTimeSeconds = dwell;
          break;
        }
        if (!targetZoneId) {
          targetZoneId = zId;
          targetZone = found;
          dwellTimeSeconds = dwell;
        }
      }
    }

    let lastFenceCrossed: string | undefined;
    if (state.lastFenceCrossing.size > 0) {
      let latestCrossMs = 0;
      for (const [fenceId, entry] of state.lastFenceCrossing.entries()) {
        if (entry.timestampMs > latestCrossMs) {
          latestCrossMs = entry.timestampMs;
          lastFenceCrossed = fenceId;
        }
      }
    }

    const isRestrictedArea = targetZone ? (Boolean(targetZone.isRestricted) || targetZone.type === 'RESTRICTED_AREA') : false;

    return {
      zoneId: targetZoneId,
      zoneName: targetZone?.name,
      isRestricted: isRestrictedArea,
      isInsideRestrictedZone: isRestrictedArea,
      lastFenceCrossed,
      dwellTimeSeconds,
      direction: (state as any).direction || (state as any).currentDirection,
    };
  }

  /**
   * Clear all spatial tracking states.
   */
  public resetAll(): void {
    this.trackStates.clear();
    this.recentEvents = [];
  }
}

export const spatialEngine = new SpatialEngine();
