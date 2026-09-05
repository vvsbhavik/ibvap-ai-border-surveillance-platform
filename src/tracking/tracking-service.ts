/**
 * IBVAP — Tracking Subsystem Orchestration Service
 *
 * Manages per-camera tracking engines, aggregates association metrics,
 * enforces bounded retention, and dispatches normalized tracking events.
 */

import { NormalizedDetection } from '../ai-inference/types';
import { CameraTracker, DEFAULT_TRACKING_CONFIG } from './tracker';
import {
  Track,
  TrackState,
  TrackingConfig,
  TrackingEvent,
  TrackingPerformanceMetrics,
  TrackingStepResult,
  TrackingSubsystemHealth,
} from './types';

export type TrackingEventListener = (event: TrackingEvent) => void;

export interface TrackingFrameEvent {
  cameraId: string;
  timestamp: string;
  tracks: Track[];
  endedTracks: Track[];
  createdTracks: Track[];
  updatedTracks: Track[];
  lostTracks: Track[];
}

export type TrackingFrameListener = (frame: TrackingFrameEvent) => void;

export class TrackingService {
  private trackers: Map<string, CameraTracker> = new Map();
  private listeners: Set<TrackingEventListener> = new Set();
  private frameListeners: Set<TrackingFrameListener> = new Set();
  private config: TrackingConfig = { ...DEFAULT_TRACKING_CONFIG };

  private metrics: TrackingPerformanceMetrics = {
    detectionsReceived: 0,
    tracksCreated: 0,
    tracksActive: 0,
    tracksEnded: 0,
    associationOperations: 0,
    lastTrackingLatencyMs: 0,
    averageTrackingLatencyMs: 0,
    framesProcessed: 0,
  };

  private totalLatencySum: number = 0;
  private lastProcessedAt: string | null = null;

  /**
   * Retrieves or instantiates a CameraTracker instance scoped to the specified camera.
   */
  public getOrCreateTracker(cameraId: string): CameraTracker {
    let tracker = this.trackers.get(cameraId);
    if (!tracker) {
      tracker = new CameraTracker(cameraId, this.config);
      this.trackers.set(cameraId, tracker);
    }
    return tracker;
  }

  /**
   * Subscribes a listener to normalized tracking events (created, updated, lost, ended).
   */
  public onTrackingEvent(listener: TrackingEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Subscribes a listener to full frame tracking cycles for continuous evaluation.
   */
  public onTrackingFrame(listener: TrackingFrameListener): () => void {
    this.frameListeners.add(listener);
    return () => this.frameListeners.delete(listener);
  }

  private dispatchEvent(event: TrackingEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('[TrackingService] Error in tracking event listener:', err);
      }
    }
  }

  /**
   * Ingests a frame's detections and advances the camera's tracking state.
   */
  public processDetections(
    cameraId: string,
    detections: NormalizedDetection[],
    frameTimestamp: string
  ): TrackingStepResult {
    const startTime = performance.now();
    const tracker = this.getOrCreateTracker(cameraId);

    const result = tracker.processFrame(detections, frameTimestamp);
    const latency = performance.now() - startTime;

    // Update global metrics
    this.metrics.detectionsReceived += detections.length;
    this.metrics.tracksCreated += result.createdTracks.length;
    this.metrics.tracksEnded += result.endedTracks.length;
    this.metrics.associationOperations += result.associationOperations;
    this.metrics.framesProcessed += 1;
    this.metrics.lastTrackingLatencyMs = Number(latency.toFixed(3));
    this.totalLatencySum += latency;
    this.metrics.averageTrackingLatencyMs = Number(
      (this.totalLatencySum / this.metrics.framesProcessed).toFixed(3)
    );
    this.lastProcessedAt = new Date().toISOString();

    // Recompute total active tracks across all cameras
    let totalActive = 0;
    for (const t of this.trackers.values()) {
      totalActive += t.getActiveTracks().length;
    }
    this.metrics.tracksActive = totalActive;

    // Dispatch Normalized Events
    for (const track of result.createdTracks) {
      this.dispatchEvent({
        eventId: `evt-trk-create-${Date.now()}-${track.trackId}`,
        eventType: 'track.created',
        cameraId,
        timestamp: frameTimestamp,
        track,
      });
    }

    for (const track of result.updatedTracks) {
      this.dispatchEvent({
        eventId: `evt-trk-update-${Date.now()}-${track.trackId}`,
        eventType: 'track.updated',
        cameraId,
        timestamp: frameTimestamp,
        track,
      });
    }

    for (const track of result.lostTracks) {
      this.dispatchEvent({
        eventId: `evt-trk-lost-${Date.now()}-${track.trackId}`,
        eventType: 'track.lost',
        cameraId,
        timestamp: frameTimestamp,
        track,
      });
    }

    for (const track of result.endedTracks) {
      this.dispatchEvent({
        eventId: `evt-trk-end-${Date.now()}-${track.trackId}`,
        eventType: 'track.ended',
        cameraId,
        timestamp: frameTimestamp,
        track,
      });
    }

    // Dispatch Frame-Level Continuous Evaluation Event for active & ended tracks
    const activeTracks = tracker.getActiveTracks();
    for (const frameListener of this.frameListeners) {
      try {
        frameListener({
          cameraId,
          timestamp: frameTimestamp,
          tracks: activeTracks,
          endedTracks: result.endedTracks,
          createdTracks: result.createdTracks,
          updatedTracks: result.updatedTracks,
          lostTracks: result.lostTracks,
        });
      } catch (err) {
        console.error('[TrackingService] Error in tracking frame listener:', err);
      }
    }

    return result;
  }

  /**
   * Retrieves active tracks for a specific camera.
   */
  public getActiveTracks(cameraId: string): Track[] {
    const tracker = this.trackers.get(cameraId);
    return tracker ? tracker.getActiveTracks() : [];
  }

  /**
   * Retrieves all tracks (active and ended) with filtering options.
   */
  public queryTracks(filter?: {
    cameraId?: string;
    state?: TrackState;
    objectType?: string;
    class?: string;
    limit?: number;
  }): Track[] {
    let list: Track[] = [];

    if (filter?.cameraId) {
      const tracker = this.trackers.get(filter.cameraId);
      if (tracker) {
        list = tracker.getAllTracks();
      }
    } else {
      for (const tracker of this.trackers.values()) {
        list.push(...tracker.getAllTracks());
      }
    }

    if (filter?.state) {
      list = list.filter((t) => t.state === filter.state);
    }

    if (filter?.objectType) {
      list = list.filter((t) => t.objectType === filter.objectType);
    }

    if (filter?.class) {
      const targetClass = filter.class.toUpperCase();
      list = list.filter((t) => (t.class || t.vehicleClass || t.objectType).toUpperCase() === targetClass);
    }

    // Sort by latest seen descending
    list.sort((a, b) => Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt));

    if (filter?.limit && filter.limit > 0) {
      list = list.slice(0, filter.limit);
    }

    return list;
  }

  /**
   * Finds a track by ID across all cameras.
   */
  public getTrackById(trackId: string): Track | undefined {
    for (const tracker of this.trackers.values()) {
      const found = tracker.getTrack(trackId);
      if (found) return found;
    }
    return undefined;
  }

  /**
   * Resets tracking state for a specific camera.
   */
  public resetCamera(cameraId: string): void {
    const tracker = this.trackers.get(cameraId);
    if (tracker) {
      tracker.reset();
    }
  }

  /**
   * Subsystem health, performance telemetry, and configuration status.
   */
  public getHealth(): TrackingSubsystemHealth {
    return {
      status: 'READY',
      algorithm: 'IoU & Centroid Distance Association with Motion Gating',
      algorithmDescription:
        'Deterministic greedy maximum-weight matching using bounding box Intersection-over-Union, centroid proximity gating, velocity-projected kinematics, and compass heading derivation.',
      config: { ...this.config },
      metrics: { ...this.metrics },
      activeCamerasCount: this.trackers.size,
      lastProcessedAt: this.lastProcessedAt,
    };
  }

  /**
   * Updates global tracking parameters and synchronizes existing camera trackers.
   */
  public updateConfig(newConfig: Partial<TrackingConfig>): void {
    this.config = { ...this.config, ...newConfig };
    for (const tracker of this.trackers.values()) {
      tracker.updateConfig(newConfig);
    }
  }
}

export const trackingService = new TrackingService();
