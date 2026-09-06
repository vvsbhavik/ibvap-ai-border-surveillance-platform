/**
 * IBVAP — Cross-Camera Correlation Engine
 *
 * Implements bounded historical multi-factor entity correlation across camera feeds,
 * movement timeline reconstruction, and route anomaly detection.
 * Adheres strictly to the distinction between OBSERVATION, CORRELATION, and IDENTITY.
 */

import {
  CrossCameraCorrelation,
  CorrelatedObservation,
  CorrelationMethod,
  CorrelationConfidenceLevel,
  CorrelatedEntityType,
  VehicleMovementReconstruction,
  PersonMovementReconstruction,
  RouteAnalysisResult,
  SourceProvenance,
} from './types';
import { cameraGraphManager } from './camera-graph';
import { dataStore } from '../server/store';
import { MovementDirection } from '../tracking/types';

export interface IngestObservationInput {
  cameraId: string;
  cameraIdentifier?: string;
  trackId: string;
  entityType: CorrelatedEntityType;
  timestamp?: string;
  dwellSeconds?: number;
  direction?: MovementDirection | string;
  zoneId?: string;
  zoneName?: string;
  fenceCrossed?: string;
  plateText?: string;
  plateConfidence?: number;
  faceQuality?: string;
  faceMatchScore?: number;
  watchlistMatch?: boolean;
  detectorConfidence: number;
  evidenceRef?: {
    evidenceId?: string;
    mediaType?: string;
    thumbnailUrl?: string;
  };
  provenance?: SourceProvenance;
}

export class CorrelationEngine {
  /** Bounded in-memory store of recent observations (max retention window: 30 minutes) */
  private observations: CorrelatedObservation[] = [];
  /** Active correlations indexed by correlationId */
  private correlations: Map<string, CrossCameraCorrelation> = new Map();
  /** Maximum observation history size to bound memory and CPU footprint */
  private readonly maxObservations: number = 2000;
  private readonly maxHistoryWindowMs: number = 30 * 60 * 1000; // 30 mins

  constructor() {
    this.seedBaselineObservations();
  }

  /**
   * Ingest a structured observation from the camera tracking / spatial / ANPR / face pipelines.
   */
  public ingestObservation(input: IngestObservationInput): CorrelatedObservation {
    const timestamp = input.timestamp || new Date().toISOString();
    const camera = dataStore.getCamera(input.cameraId);
    const cameraIdentifier = input.cameraIdentifier || camera?.cameraId || input.cameraId;
    const sectorId = camera?.sectorId || 'sec-bravo';
    const sectorName = camera?.sectorName || 'Sector Bravo';

    const observation: CorrelatedObservation = {
      observationId: `obs-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      cameraId: input.cameraId,
      cameraIdentifier,
      sectorId,
      sectorName,
      trackId: input.trackId,
      entityType: input.entityType,
      timestamp,
      dwellSeconds: input.dwellSeconds || 0,
      direction: input.direction || 'UNKNOWN',
      zoneId: input.zoneId,
      zoneName: input.zoneName,
      fenceCrossed: input.fenceCrossed,
      plateText: input.plateText?.toUpperCase().trim(),
      plateConfidence: input.plateConfidence,
      faceQuality: input.faceQuality,
      faceMatchScore: input.faceMatchScore,
      watchlistMatch: input.watchlistMatch,
      detectorConfidence: Math.max(0.1, Math.min(1.0, input.detectorConfidence)),
      evidenceRef: input.evidenceRef,
      provenance: input.provenance || 'SIMULATION',
    };

    this.observations.push(observation);
    this.pruneOldObservations();

    // Evaluate correlation against candidate observations across other cameras
    this.evaluateCrossCameraCorrelations(observation);

    return observation;
  }

  /**
   * Prune observations outside maximum capacity and retention window.
   */
  private pruneOldObservations(): void {
    const cutoff = Date.now() - this.maxHistoryWindowMs;
    if (this.observations.length > this.maxObservations) {
      this.observations = this.observations.slice(-this.maxObservations);
    }
    // Retain at least a reasonable window for investigations
    this.observations = this.observations.filter((obs) => {
      const t = new Date(obs.timestamp).getTime();
      return isNaN(t) || t >= cutoff || obs.watchlistMatch; // keep matches for evidence
    });
  }

  /**
   * Core correlation evaluation logic across cameras.
   */
  private evaluateCrossCameraCorrelations(currentObs: CorrelatedObservation): void {
    const currentMs = new Date(currentObs.timestamp).getTime();

    // Candidates must be from DIFFERENT cameras within plausible time window
    const candidates = this.observations.filter(
      (c) =>
        c.cameraId !== currentObs.cameraId &&
        c.entityType === currentObs.entityType &&
        Math.abs(currentMs - new Date(c.timestamp).getTime()) <= 15 * 60 * 1000 // 15 min max transit
    );

    for (const priorObs of candidates) {
      const priorMs = new Date(priorObs.timestamp).getTime();
      const elapsedSec = Math.abs(currentMs - priorMs) / 1000;
      const isPriorEarlier = priorMs <= currentMs;
      const sourceObs = isPriorEarlier ? priorObs : currentObs;
      const targetObs = isPriorEarlier ? currentObs : priorObs;

      const sourceCam = sourceObs.cameraIdentifier;
      const targetCam = targetObs.cameraIdentifier;

      let method: CorrelationMethod = 'TEMPORAL_PROXIMITY';
      let confidenceScore = 0.0;
      const reasoning: { factor: string; evidence: string; confidenceDelta: number }[] = [];

      // 1. ANPR Plate Correlation
      if (
        currentObs.entityType === 'VEHICLE' &&
        sourceObs.plateText &&
        targetObs.plateText
      ) {
        if (sourceObs.plateText === targetObs.plateText) {
          method = 'PLATE_MATCH';
          confidenceScore += 0.70;
          reasoning.push({
            factor: 'Identical normalized license plate observation',
            evidence: `Observed plate "${sourceObs.plateText}" on both ${sourceCam} and ${targetCam}`,
            confidenceDelta: +0.70,
          });

          // Check transit timing plausibility
          const transitEdge = cameraGraphManager.getExpectedTransit(sourceCam, targetCam);
          if (transitEdge) {
            if (elapsedSec >= transitEdge.minTransitSeconds && elapsedSec <= transitEdge.maxTransitSeconds) {
              confidenceScore += 0.20;
              reasoning.push({
                factor: 'Transit elapsed time matches corridor speed limits',
                evidence: `Elapsed ${Math.round(elapsedSec)}s within expected window [${transitEdge.minTransitSeconds}s - ${transitEdge.maxTransitSeconds}s]`,
                confidenceDelta: +0.20,
              });
            } else if (elapsedSec < transitEdge.minTransitSeconds) {
              confidenceScore -= 0.15;
              reasoning.push({
                factor: 'Velocity anomaly: transit time faster than physical road limit',
                evidence: `Elapsed ${Math.round(elapsedSec)}s under minimum realistic ${transitEdge.minTransitSeconds}s`,
                confidenceDelta: -0.15,
              });
            }
          }
        }
      }

      // 2. Face Analytics Watchlist / Embedding Match Correlation
      if (
        currentObs.entityType === 'PERSON' &&
        sourceObs.watchlistMatch &&
        targetObs.watchlistMatch
      ) {
        method = 'FACE_MATCH';
        confidenceScore += 0.65;
        reasoning.push({
          factor: 'Consistent facial biometric watchlist target correlation',
          evidence: `Synthetic match detected on both ${sourceCam} and ${targetCam}`,
          confidenceDelta: +0.65,
        });
      }

      // 3. Camera Graph Adjacency Check
      const isAdjacent = cameraGraphManager.isAdjacent(sourceCam, targetCam);
      if (isAdjacent) {
        confidenceScore += 0.15;
        reasoning.push({
          factor: 'Direct corridor topology adjacency',
          evidence: `${sourceCam} and ${targetCam} share physical corridor boundary in Camera Graph`,
          confidenceDelta: +0.15,
        });
      }

      // 4. Directional Continuity Check
      if (sourceObs.direction && sourceObs.direction !== 'UNKNOWN' && targetObs.direction && targetObs.direction !== 'UNKNOWN') {
        const edge = cameraGraphManager.getExpectedTransit(sourceCam, targetCam);
        if (edge && edge.expectedDirection === sourceObs.direction) {
          confidenceScore += 0.10;
          reasoning.push({
            factor: 'Observed heading aligns with expected corridor vector',
            evidence: `Direction ${sourceObs.direction} matches corridor transition to ${targetCam}`,
            confidenceDelta: +0.10,
          });
        }
      }

      // Clamp confidence score
      confidenceScore = Math.max(0.1, Math.min(0.99, confidenceScore));

      // Only record if meets minimal baseline hypothesis threshold
      if (confidenceScore >= 0.35 || method === 'PLATE_MATCH' || method === 'FACE_MATCH') {
        const confidenceLevel: CorrelationConfidenceLevel =
          confidenceScore >= 0.80
            ? 'HIGH_CONFIDENCE_CORRELATION'
            : confidenceScore >= 0.55
            ? 'MODERATE_CONFIDENCE_CORRELATION'
            : confidenceScore >= 0.35
            ? 'LOW_CONFIDENCE_CORRELATION'
            : 'UNVERIFIED_HYPOTHESIS';

        const correlationId = `CORR-${sourceObs.trackId}-${targetObs.trackId}-${sourceCam}-${targetCam}`;

        const correlation: CrossCameraCorrelation = {
          correlationId,
          sourceCameraId: sourceObs.cameraId,
          targetCameraId: targetObs.cameraId,
          sourceTrackId: sourceObs.trackId,
          targetTrackId: targetObs.trackId,
          entityType: currentObs.entityType,
          correlationMethod: method,
          confidenceLevel,
          confidenceScore: parseFloat(confidenceScore.toFixed(3)),
          firstObservedAt: sourceObs.timestamp,
          lastObservedAt: targetObs.timestamp,
          elapsedSeconds: Math.round(elapsedSec),
          sourceMode: currentObs.provenance,
          observations: [sourceObs, targetObs],
          involvedCameras: Array.from(new Set([sourceCam, targetCam])),
          involvedSectors: Array.from(new Set([sourceObs.sectorName, targetObs.sectorName])),
          relatedANPRObservation: sourceObs.plateText
            ? {
                plateNumber: sourceObs.plateText,
                normalizedPlate: sourceObs.plateText,
                recognitionStatus: 'CONFIRMED',
                isWatchlistMatch: !!sourceObs.watchlistMatch,
              }
            : undefined,
          relatedFaceObservation: sourceObs.watchlistMatch
            ? {
                faceDetectionId: `fdet-${sourceObs.trackId}`,
                recognitionStatus: 'MATCHED',
                isWatchlistMatch: true,
                similarityScore: sourceObs.faceMatchScore || 0.88,
              }
            : undefined,
          relatedZones: [sourceObs.zoneName, targetObs.zoneName].filter(Boolean) as string[],
          directionSummary: `${sourceObs.direction || 'UNKNOWN'} -> ${targetObs.direction || 'UNKNOWN'}`,
          evidenceReferences: [sourceObs.observationId, targetObs.observationId],
          reasoningFactors: reasoning,
          provenance: currentObs.provenance,
        };

        this.correlations.set(correlationId, correlation);
      }
    }
  }

  /**
   * Return all stored correlations, optionally filtered.
   */
  public getCorrelations(filters?: {
    entityType?: CorrelatedEntityType;
    cameraId?: string;
    minConfidence?: number;
    method?: CorrelationMethod;
  }): CrossCameraCorrelation[] {
    let list = Array.from(this.correlations.values());

    if (filters?.entityType) {
      list = list.filter((c) => c.entityType === filters.entityType);
    }
    if (filters?.cameraId) {
      list = list.filter((c) => c.involvedCameras.includes(filters.cameraId!));
    }
    if (filters?.minConfidence !== undefined) {
      list = list.filter((c) => c.confidenceScore >= filters.minConfidence!);
    }
    if (filters?.method) {
      list = list.filter((c) => c.correlationMethod === filters.method);
    }

    return list.sort((a, b) => new Date(b.lastObservedAt).getTime() - new Date(a.lastObservedAt).getTime());
  }

  /**
   * Return a single correlation by ID.
   */
  public getCorrelationById(id: string): CrossCameraCorrelation | undefined {
    return this.correlations.get(id);
  }

  /**
   * Get all raw observations matching a filter.
   */
  public getObservations(filters?: {
    trackId?: string;
    cameraId?: string;
    entityType?: CorrelatedEntityType;
    plateText?: string;
  }): CorrelatedObservation[] {
    let list = [...this.observations];
    if (filters?.trackId) list = list.filter((o) => o.trackId === filters.trackId);
    if (filters?.cameraId) list = list.filter((o) => o.cameraId === filters.cameraId || o.cameraIdentifier === filters.cameraId);
    if (filters?.entityType) list = list.filter((o) => o.entityType === filters.entityType);
    if (filters?.plateText) list = list.filter((o) => o.plateText === filters.plateText?.toUpperCase());
    return list.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  /**
   * Build cross-camera chronological timeline for an entity.
   */
  public buildCorrelatedTimeline(query: {
    trackId?: string;
    plateNumber?: string;
    correlationId?: string;
  }): CorrelatedObservation[] {
    if (query.correlationId) {
      const corr = this.correlations.get(query.correlationId);
      if (corr) return [...corr.observations].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    }

    if (query.plateNumber) {
      const plate = query.plateNumber.toUpperCase().trim();
      return this.observations
        .filter((o) => o.plateText === plate)
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    }

    if (query.trackId) {
      // Find all observations directly matching this trackId or correlated with this trackId
      const direct = this.observations.filter((o) => o.trackId === query.trackId);
      const correlatedTrackIds = new Set<string>([query.trackId]);

      for (const corr of this.correlations.values()) {
        if (corr.sourceTrackId === query.trackId) correlatedTrackIds.add(corr.targetTrackId);
        if (corr.targetTrackId === query.trackId) correlatedTrackIds.add(corr.sourceTrackId);
      }

      return this.observations
        .filter((o) => correlatedTrackIds.has(o.trackId))
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    }

    return [];
  }

  /**
   * Reconstruct vehicle movement across cameras.
   */
  public reconstructVehicleMovement(params: {
    trackId?: string;
    plateNumber?: string;
    timeWindowMinutes?: number;
  }): VehicleMovementReconstruction {
    const timeline = this.buildCorrelatedTimeline({
      trackId: params.trackId,
      plateNumber: params.plateNumber,
    }).filter((o) => o.entityType === 'VEHICLE');

    const camerasObserved = timeline.map((o) => ({
      cameraId: o.cameraId,
      cameraIdentifier: o.cameraIdentifier,
      timestamp: o.timestamp,
      dwellSeconds: o.dwellSeconds || 0,
      direction: o.direction || 'UNKNOWN',
      zoneName: o.zoneName,
    }));

    const routeSequence = Array.from(new Set(timeline.map((o) => o.cameraIdentifier)));
    const zonesTraversed = Array.from(new Set(timeline.map((o) => o.zoneName).filter(Boolean) as string[]));

    const fenceInteractions = timeline
      .filter((o) => !!o.fenceCrossed)
      .map((o) => ({
        fenceId: o.fenceCrossed!,
        cameraId: o.cameraIdentifier,
        crossedAt: o.timestamp,
        direction: o.direction || 'UNKNOWN',
      }));

    const plateObservations = timeline
      .filter((o) => !!o.plateText)
      .map((o) => ({
        cameraId: o.cameraIdentifier,
        plateText: o.plateText!,
        confidence: o.plateConfidence || 0.90,
        timestamp: o.timestamp,
      }));

    let totalTransitSeconds = 0;
    if (timeline.length >= 2) {
      const tStart = new Date(timeline[0].timestamp).getTime();
      const tEnd = new Date(timeline[timeline.length - 1].timestamp).getTime();
      totalTransitSeconds = Math.max(0, Math.round((tEnd - tStart) / 1000));
    }

    // Determine overall correlation confidence
    const matchingCorrelations = this.getCorrelations({ entityType: 'VEHICLE' }).filter((c) =>
      c.observations.some((o) => o.trackId === params.trackId || (params.plateNumber && o.plateText === params.plateNumber))
    );
    const avgConfidence = matchingCorrelations.length > 0
      ? matchingCorrelations.reduce((sum, c) => sum + c.confidenceScore, 0) / matchingCorrelations.length
      : timeline.length > 0 ? 0.85 : 0.0;

    return {
      reconstructionId: `recon-veh-${Date.now()}`,
      queryTrackId: params.trackId,
      plateNumber: params.plateNumber,
      queryTimeRange: {
        start: timeline[0]?.timestamp || new Date().toISOString(),
        end: timeline[timeline.length - 1]?.timestamp || new Date().toISOString(),
      },
      camerasObserved,
      timeline,
      routeSequence,
      zonesTraversed,
      fenceInteractions,
      plateObservations,
      totalTransitSeconds,
      correlationConfidence: parseFloat(avgConfidence.toFixed(3)),
      provenance: timeline[0]?.provenance || 'SIMULATION',
      disclaimer: 'Reconstructed from discrete camera observations. Continuous GPS tracking is not implied.',
    };
  }

  /**
   * Reconstruct person movement across cameras.
   */
  public reconstructPersonMovement(params: {
    personTrackId?: string;
    faceObservationId?: string;
    timeWindowMinutes?: number;
  }): PersonMovementReconstruction {
    const timeline = this.buildCorrelatedTimeline({
      trackId: params.personTrackId,
    }).filter((o) => o.entityType === 'PERSON');

    const camerasObserved = timeline.map((o) => ({
      cameraId: o.cameraId,
      cameraIdentifier: o.cameraIdentifier,
      timestamp: o.timestamp,
      dwellSeconds: o.dwellSeconds || 0,
      direction: o.direction || 'UNKNOWN',
      zoneName: o.zoneName,
    }));

    const routeSequence = Array.from(new Set(timeline.map((o) => o.cameraIdentifier)));
    const zonesTraversed = Array.from(new Set(timeline.map((o) => o.zoneName).filter(Boolean) as string[]));

    const fenceInteractions = timeline
      .filter((o) => !!o.fenceCrossed)
      .map((o) => ({
        fenceId: o.fenceCrossed!,
        cameraId: o.cameraIdentifier,
        crossedAt: o.timestamp,
        direction: o.direction || 'UNKNOWN',
      }));

    const faceObservations = timeline
      .filter((o) => !!o.faceQuality)
      .map((o) => ({
        cameraId: o.cameraIdentifier,
        quality: o.faceQuality!,
        recognitionStatus: o.watchlistMatch ? 'MATCHED' : 'UNKNOWN',
        similarityScore: o.faceMatchScore,
        isWatchlistMatch: o.watchlistMatch,
        timestamp: o.timestamp,
      }));

    let totalTransitSeconds = 0;
    if (timeline.length >= 2) {
      const tStart = new Date(timeline[0].timestamp).getTime();
      const tEnd = new Date(timeline[timeline.length - 1].timestamp).getTime();
      totalTransitSeconds = Math.max(0, Math.round((tEnd - tStart) / 1000));
    }

    const matchingCorrelations = this.getCorrelations({ entityType: 'PERSON' }).filter((c) =>
      c.observations.some((o) => o.trackId === params.personTrackId)
    );
    const avgConfidence = matchingCorrelations.length > 0
      ? matchingCorrelations.reduce((sum, c) => sum + c.confidenceScore, 0) / matchingCorrelations.length
      : timeline.length > 0 ? 0.78 : 0.0;

    return {
      reconstructionId: `recon-prs-${Date.now()}`,
      queryTrackId: params.personTrackId,
      faceObservationId: params.faceObservationId,
      queryTimeRange: {
        start: timeline[0]?.timestamp || new Date().toISOString(),
        end: timeline[timeline.length - 1]?.timestamp || new Date().toISOString(),
      },
      camerasObserved,
      timeline,
      routeSequence,
      zonesTraversed,
      fenceInteractions,
      faceObservations,
      totalTransitSeconds,
      correlationConfidence: parseFloat(avgConfidence.toFixed(3)),
      provenance: timeline[0]?.provenance || 'SIMULATION',
      disclaimer: 'Designated as PERSON TRACK. Real-world identity is not assigned without authoritative legal confirmation.',
    };
  }

  /**
   * Analyze camera route sequence against topological graph.
   */
  public analyzeRoute(
    sequence: { cameraId: string; timestamp: string }[],
    entityType: CorrelatedEntityType = 'VEHICLE'
  ): RouteAnalysisResult {
    const observedSequence = sequence.map((s) => s.cameraId);
    const expectedTransitions: RouteAnalysisResult['expectedTransitions'] = [];
    const anomaliesDetected: string[] = [];

    let overallStatus: RouteAnalysisResult['overallStatus'] = 'EXPECTED_ROUTE';
    let totalDurationSeconds = 0;

    if (sequence.length >= 2) {
      const tStart = new Date(sequence[0].timestamp).getTime();
      const tEnd = new Date(sequence[sequence.length - 1].timestamp).getTime();
      totalDurationSeconds = Math.max(0, Math.round((tEnd - tStart) / 1000));
    }

    for (let i = 0; i < sequence.length - 1; i++) {
      const fromCam = sequence[i].cameraId;
      const toCam = sequence[i + 1].cameraId;
      const t1 = new Date(sequence[i].timestamp).getTime();
      const t2 = new Date(sequence[i + 1].timestamp).getTime();
      const elapsed = Math.round(Math.abs(t2 - t1) / 1000);

      const edge = cameraGraphManager.getExpectedTransit(fromCam, toCam);
      if (edge) {
        if (elapsed < edge.minTransitSeconds) {
          expectedTransitions.push({
            fromCamera: fromCam,
            toCamera: toCam,
            isExpected: true,
            expectedTransitRangeSeconds: [edge.minTransitSeconds, edge.maxTransitSeconds],
            actualElapsedSeconds: elapsed,
            status: 'UNEXPECTED_TRANSITION',
          });
          anomaliesDetected.push(`Transition from ${fromCam} to ${toCam} completed in ${elapsed}s (below physical minimum ${edge.minTransitSeconds}s)`);
          overallStatus = 'ROUTE_ANOMALY';
        } else if (elapsed > edge.maxTransitSeconds) {
          expectedTransitions.push({
            fromCamera: fromCam,
            toCamera: toCam,
            isExpected: true,
            expectedTransitRangeSeconds: [edge.minTransitSeconds, edge.maxTransitSeconds],
            actualElapsedSeconds: elapsed,
            status: 'ANOMALOUS_DELAY',
          });
          anomaliesDetected.push(`Extended delay in corridor between ${fromCam} and ${toCam} (${elapsed}s vs expected max ${edge.maxTransitSeconds}s)`);
          if (overallStatus !== 'UNEXPECTED_CAMERA_TRANSITION') overallStatus = 'ROUTE_ANOMALY';
        } else {
          expectedTransitions.push({
            fromCamera: fromCam,
            toCamera: toCam,
            isExpected: true,
            expectedTransitRangeSeconds: [edge.minTransitSeconds, edge.maxTransitSeconds],
            actualElapsedSeconds: elapsed,
            status: 'NORMAL_TRANSIT',
          });
        }
      } else {
        // Non-adjacent or unexpected camera jump
        expectedTransitions.push({
          fromCamera: fromCam,
          toCamera: toCam,
          isExpected: false,
          expectedTransitRangeSeconds: [0, 0],
          actualElapsedSeconds: elapsed,
          status: 'UNEXPECTED_TRANSITION',
        });
        anomaliesDetected.push(`Non-adjacent camera transition: ${fromCam} to ${toCam} does not exist in topological adjacency matrix`);
        overallStatus = 'UNEXPECTED_CAMERA_TRANSITION';
      }
    }

    return {
      routeId: `route-${Date.now()}`,
      entityId: sequence[0]?.cameraId || 'entity',
      entityType,
      observedSequence,
      expectedTransitions,
      directionConsistency: anomaliesDetected.length > 0 ? 'REVERSING' : 'CONSISTENT',
      overallStatus,
      totalDurationSeconds,
      anomaliesDetected,
      provenance: 'SIMULATION',
    };
  }

  /**
   * Seed initial baseline observations from existing cameras for rich demo readiness.
   */
  private seedBaselineObservations(): void {
    const now = Date.now();

    // Seed Corridor Sequence 1: Vehicle Plate AZ-982-FX observed moving from CAM-01 to CAM-02 to CAM-04
    this.ingestObservation({
      cameraId: 'cam-01',
      cameraIdentifier: 'CAM-01',
      trackId: 'VEH-TRK-101',
      entityType: 'VEHICLE',
      timestamp: new Date(now - 8 * 60 * 1000).toISOString(),
      dwellSeconds: 24,
      direction: 'SOUTHEAST',
      zoneId: 'zone-b1',
      zoneName: 'Primary Perimeter Buffer North',
      plateText: 'AZ-982-FX',
      plateConfidence: 0.96,
      detectorConfidence: 0.94,
      provenance: 'SIMULATION',
    });

    this.ingestObservation({
      cameraId: 'cam-02',
      cameraIdentifier: 'CAM-02',
      trackId: 'VEH-TRK-102',
      entityType: 'VEHICLE',
      timestamp: new Date(now - 6 * 60 * 1000).toISOString(),
      dwellSeconds: 32,
      direction: 'SOUTHEAST',
      zoneId: 'zone-b2',
      zoneName: 'Ridge Virtual Boundary Line East',
      fenceCrossed: 'FENCE-02',
      plateText: 'AZ-982-FX',
      plateConfidence: 0.97,
      detectorConfidence: 0.96,
      provenance: 'SIMULATION',
    });

    this.ingestObservation({
      cameraId: 'cam-04',
      cameraIdentifier: 'CAM-04',
      trackId: 'VEH-TRK-104',
      entityType: 'VEHICLE',
      timestamp: new Date(now - 3 * 60 * 1000).toISOString(),
      dwellSeconds: 40,
      direction: 'EAST',
      zoneId: 'zone-b2',
      zoneName: 'Ridge Virtual Boundary Line East',
      plateText: 'AZ-982-FX',
      plateConfidence: 0.95,
      detectorConfidence: 0.93,
      provenance: 'SIMULATION',
    });

    // Seed Person Sequence 2: Person Track across CAM-01 and CAM-03
    this.ingestObservation({
      cameraId: 'cam-01',
      cameraIdentifier: 'CAM-01',
      trackId: 'PRS-TRK-201',
      entityType: 'PERSON',
      timestamp: new Date(now - 12 * 60 * 1000).toISOString(),
      dwellSeconds: 45,
      direction: 'SOUTH',
      zoneId: 'zone-b1',
      zoneName: 'Primary Perimeter Buffer North',
      fenceCrossed: 'FENCE-01',
      faceQuality: 'GOOD',
      faceMatchScore: 0.91,
      watchlistMatch: true,
      detectorConfidence: 0.92,
      provenance: 'SIMULATION',
    });

    this.ingestObservation({
      cameraId: 'cam-03',
      cameraIdentifier: 'CAM-03',
      trackId: 'PRS-TRK-203',
      entityType: 'PERSON',
      timestamp: new Date(now - 10 * 60 * 1000).toISOString(),
      dwellSeconds: 65,
      direction: 'SOUTHEAST',
      zoneId: 'zone-b1',
      zoneName: 'Primary Perimeter Buffer North',
      faceQuality: 'ACCEPTABLE',
      faceMatchScore: 0.89,
      watchlistMatch: true,
      detectorConfidence: 0.89,
      provenance: 'SIMULATION',
    });
  }
}

export const correlationEngine = new CorrelationEngine();
