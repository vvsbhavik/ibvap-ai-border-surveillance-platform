/**
 * IBVAP — Face Analytics Core Service
 *
 * Orchestrates face detection, quality metrics evaluation, person-track association,
 * feature embedding extraction, multi-frame consensus, synthetic watchlist correlation,
 * and structured event emission to the IBVAP realtime event bus.
 */

import { Track } from '../tracking/types';
import {
  FaceConfig,
  FaceDetection,
  FaceEvent,
  FaceEventType,
  FaceObservation,
  FaceQualityMetrics,
  FaceQueryFilter,
  FaceWatchlistEntry,
  PersonFaceAssociation,
  PersistentPersonFaceRecord,
} from './types';
import { FaceQualityEngine, faceQualityEngine } from './quality';
import { PersonFaceAssociator, personFaceAssociator } from './associator';
import { FaceMatcher, faceMatcher } from './matcher';
import { updatePersistentPersonFaceRecord } from './consensus';
import { FaceDetector, faceDetector } from './face-detector';

export interface FaceServiceMetrics {
  facesDetectedTotal: number;
  facesEvaluatedTotal: number;
  facesGoodQualityTotal: number;
  facesAcceptableQualityTotal: number;
  facesPoorQualityTotal: number;
  facesUnreadableTotal: number;
  associationsTotal: number;
  associationsRejectedTotal: number;
  watchlistMatchesTotal: number;
  watchlistPossibleMatchesTotal: number;
  eventsEmittedTotal: number;
  lastProcessingLatencyMs: number | null;
}

export type FaceEventListener = (event: FaceEvent) => void;

export const DEFAULT_FACE_CONFIG: FaceConfig = {
  enabled: true,
  minPersonConfidenceForFace: 0.40,
  minFaceConfidence: 0.50,
  minQualityScoreAcceptable: 0.55,
  minQualityScoreGood: 0.75,
  matchThresholdConfirmed: 0.82,
  matchThresholdPossible: 0.70,
  maxAssociationDistance: 0.35,
  minContainmentRatio: 0.50,
  maxObservationsPerTrack: 30,
  throttleFramesPerTrack: 2,
};

export class FaceService {
  private config: FaceConfig;
  private qualityEngine: FaceQualityEngine;
  private associator: PersonFaceAssociator;
  private matcher: FaceMatcher;
  private detector: FaceDetector;

  // Person Track ID -> Persistent Face Record
  private recordsByTrackId: Map<string, PersistentPersonFaceRecord> = new Map();

  // Bounded event and observation history
  private eventHistory: FaceEvent[] = [];
  private eventListeners: Set<FaceEventListener> = new Set();

  // Last emitted recognition status signature: trackId -> signature
  private lastEmittedSignature: Map<string, string> = new Map();

  // Telemetry metrics
  private metrics: FaceServiceMetrics = {
    facesDetectedTotal: 0,
    facesEvaluatedTotal: 0,
    facesGoodQualityTotal: 0,
    facesAcceptableQualityTotal: 0,
    facesPoorQualityTotal: 0,
    facesUnreadableTotal: 0,
    associationsTotal: 0,
    associationsRejectedTotal: 0,
    watchlistMatchesTotal: 0,
    watchlistPossibleMatchesTotal: 0,
    eventsEmittedTotal: 0,
    lastProcessingLatencyMs: null,
  };

  constructor(
    config: Partial<FaceConfig> = {},
    qualityEngine: FaceQualityEngine = faceQualityEngine,
    associator: PersonFaceAssociator = personFaceAssociator,
    matcher: FaceMatcher = faceMatcher,
    detector: FaceDetector = faceDetector
  ) {
    this.config = { ...DEFAULT_FACE_CONFIG, ...config };
    this.qualityEngine = qualityEngine;
    this.associator = associator;
    this.matcher = matcher;
    this.detector = detector;
  }

  public getConfig(): FaceConfig {
    return { ...this.config };
  }

  public updateConfig(newConfig: Partial<FaceConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  public getMetrics(): FaceServiceMetrics {
    return { ...this.metrics };
  }

  public getWatchlists(): FaceWatchlistEntry[] {
    return this.matcher.getWatchlists();
  }

  public onFaceEvent(listener: FaceEventListener): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  private dispatchEvent(event: FaceEvent): void {
    this.eventHistory.push(event);
    if (this.eventHistory.length > 500) {
      this.eventHistory.shift();
    }
    this.metrics.eventsEmittedTotal++;

    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('[FaceService] Error in Face event listener:', err);
      }
    }
  }

  /**
   * Main ingest pipeline for an individual face observation.
   * Links face to person track, evaluates quality, matches against watchlist,
   * updates track consensus, and dispatches structured events.
   */
  public ingestObservation(params: {
    personTrack: Track;
    face: FaceDetection;
    qualityOverrides?: {
      sharpnessScore?: number;
      luminanceScore?: number;
      yawDegrees?: number;
      pitchDegrees?: number;
      rollDegrees?: number;
      occlusionScore?: number;
      reasons?: string[];
    };
    embeddingOverrides?: {
      templateId?: string;
      vector?: number[];
      similarityOverride?: number;
    };
    spatialContext?: FaceObservation['spatialContext'];
    evidenceReference?: FaceObservation['evidenceReference'];
    isSimulation?: boolean;
    watchlists?: FaceWatchlistEntry[];
  }): {
    record: PersistentPersonFaceRecord;
    association: PersonFaceAssociation;
    quality: FaceQualityMetrics;
    observation: FaceObservation;
  } {
    const startTime = performance.now();
    const {
      personTrack,
      face,
      qualityOverrides,
      embeddingOverrides,
      spatialContext,
      evidenceReference,
      isSimulation,
      watchlists,
    } = params;

    // 1. Evaluate spatial & temporal person-face association
    const association = this.associator.evaluateAssociation(face, personTrack);
    if (!association.isValid) {
      this.metrics.associationsRejectedTotal++;
      throw new Error(`Face association rejected: ${association.rejectionReason}`);
    }

    this.metrics.facesDetectedTotal++;
    this.metrics.associationsTotal++;

    // 2. Assess Optical Quality
    const quality = this.qualityEngine.evaluateQuality({
      boundingBox: face.boundingBox,
      pixelBox: face.pixelBox,
      detectorConfidence: face.confidence,
      sharpnessScore: qualityOverrides?.sharpnessScore,
      luminanceScore: qualityOverrides?.luminanceScore,
      yawDegrees: qualityOverrides?.yawDegrees,
      pitchDegrees: qualityOverrides?.pitchDegrees,
      rollDegrees: qualityOverrides?.rollDegrees,
      occlusionScore: qualityOverrides?.occlusionScore,
      reasons: qualityOverrides?.reasons,
    });

    this.metrics.facesEvaluatedTotal++;
    if (quality.qualityState === 'GOOD') this.metrics.facesGoodQualityTotal++;
    else if (quality.qualityState === 'ACCEPTABLE') this.metrics.facesAcceptableQualityTotal++;
    else if (quality.qualityState === 'POOR') this.metrics.facesPoorQualityTotal++;
    else if (quality.qualityState === 'UNREADABLE') this.metrics.facesUnreadableTotal++;

    // 3. Evaluate Biometric Recognition / Watchlist Correlation
    const matchResult = this.matcher.evaluateMatch(quality, embeddingOverrides, watchlists);

    if (matchResult.isWatchlistMatch) {
      this.metrics.watchlistMatchesTotal++;
    } else if (matchResult.recognitionStatus === 'POSSIBLE_MATCH') {
      this.metrics.watchlistPossibleMatchesTotal++;
    }

    // 4. Construct frame observation
    const observationId = `obs-fc-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
    const observation: FaceObservation = {
      observationId,
      faceDetectionId: face.faceDetectionId,
      personTrackId: personTrack.trackId,
      cameraId: personTrack.cameraId,
      cameraIdentifier: personTrack.cameraId,
      timestamp: face.timestamp || personTrack.lastSeenAt,
      boundingBox: face.boundingBox,
      pixelBox: face.pixelBox,
      detectorConfidence: face.confidence,
      quality,
      recognitionStatus: matchResult.recognitionStatus,
      embeddingRef: matchResult.embeddingRef,
      similarityScore: matchResult.similarityScore,
      matchingThreshold: matchResult.matchingThreshold,
      isWatchlistMatch: matchResult.isWatchlistMatch,
      watchlistEntryId: matchResult.matchedWatchlistEntry?.id,
      watchlistDisplayName: matchResult.matchedWatchlistEntry?.displayName,
      watchlistCategory: matchResult.matchedWatchlistEntry?.category,
      watchlistExternalRef: matchResult.matchedWatchlistEntry?.externalReference,
      spatialContext,
      evidenceReference,
      isSimulation: isSimulation ?? personTrack.isSimulation ?? true,
    };

    // 5. Multi-Frame Track-Persistent Consensus
    const existing = this.recordsByTrackId.get(personTrack.trackId);
    const { record, hasRecognitionChanged, isNewlyMatched, isNewlyPossibleMatch, hasQualityUpgraded } =
      updatePersistentPersonFaceRecord(existing, observation, this.config.maxObservationsPerTrack);

    this.recordsByTrackId.set(personTrack.trackId, record);

    // 6. Attach Face metadata directly onto Person Track for UI continuity
    personTrack.face = {
      faceDetectionId: face.faceDetectionId,
      quality: record.bestQuality,
      qualityScore: record.bestQualityScore,
      recognitionStatus: record.recognitionStatus,
      similarityScore: record.similarityScore,
      isWatchlistMatch: record.isWatchlistMatch,
      watchlistEntryId: record.watchlistEntryId,
      watchlistDisplayName: record.watchlistDisplayName,
      observationCount: record.observationsCount,
      lastObservedAt: record.lastSeenAt,
      boundingBox: face.boundingBox,
    };

    // 7. Structured Event Emission with Duplicate Suppression
    const eventSignature = `${personTrack.trackId}:${record.recognitionStatus}:${record.isWatchlistMatch}:${record.bestQuality}`;
    const previousSignature = this.lastEmittedSignature.get(personTrack.trackId);

    // Always emit face.detected on very first observation
    if (!existing) {
      this.dispatchEvent({
        eventId: `evt-face-det-${observationId}`,
        eventType: 'face.detected',
        timestamp: observation.timestamp,
        cameraId: personTrack.cameraId,
        cameraIdentifier: personTrack.cameraId,
        personTrackId: personTrack.trackId,
        faceDetectionId: face.faceDetectionId,
        confidence: face.confidence,
        quality: quality.qualityState,
        recognitionStatus: matchResult.recognitionStatus,
        zoneId: spatialContext?.zoneId,
        spatialContext,
        evidenceReference,
        details: {
          qualityScore: quality.score,
          qualityReasons: quality.reasons,
        },
        isSimulation: observation.isSimulation,
      });
    }

    // Emit match event if confirmed or changed
    if (isNewlyMatched || (hasRecognitionChanged && record.recognitionStatus === 'MATCHED')) {
      this.dispatchEvent({
        eventId: `evt-face-match-${observationId}`,
        eventType: 'face.match.confirmed',
        timestamp: observation.timestamp,
        cameraId: personTrack.cameraId,
        cameraIdentifier: personTrack.cameraId,
        personTrackId: personTrack.trackId,
        faceDetectionId: face.faceDetectionId,
        watchlistEntryId: record.watchlistEntryId,
        watchlistDisplayName: record.watchlistDisplayName,
        similarity: record.similarityScore,
        confidence: face.confidence,
        quality: record.bestQuality,
        recognitionStatus: 'MATCHED',
        zoneId: spatialContext?.zoneId,
        spatialContext,
        evidenceReference,
        details: {
          watchlistCategory: record.watchlistCategory,
          similarityScore: record.similarityScore,
          matchingThreshold: record.matchingThreshold,
          reasons: quality.reasons,
        },
        isSimulation: observation.isSimulation,
      });
    } else if (isNewlyPossibleMatch || (hasRecognitionChanged && record.recognitionStatus === 'POSSIBLE_MATCH')) {
      this.dispatchEvent({
        eventId: `evt-face-poss-${observationId}`,
        eventType: 'face.match.possible',
        timestamp: observation.timestamp,
        cameraId: personTrack.cameraId,
        cameraIdentifier: personTrack.cameraId,
        personTrackId: personTrack.trackId,
        faceDetectionId: face.faceDetectionId,
        watchlistEntryId: record.watchlistEntryId,
        watchlistDisplayName: record.watchlistDisplayName,
        similarity: record.similarityScore,
        confidence: face.confidence,
        quality: record.bestQuality,
        recognitionStatus: 'POSSIBLE_MATCH',
        zoneId: spatialContext?.zoneId,
        spatialContext,
        evidenceReference,
        details: {
          similarityScore: record.similarityScore,
          matchingThreshold: record.matchingThreshold,
        },
        isSimulation: observation.isSimulation,
      });
    } else if (quality.qualityState === 'POOR' || quality.qualityState === 'UNREADABLE') {
      if (!previousSignature || previousSignature !== eventSignature) {
        this.dispatchEvent({
          eventId: `evt-face-lowq-${observationId}`,
          eventType: 'face.quality.low',
          timestamp: observation.timestamp,
          cameraId: personTrack.cameraId,
          cameraIdentifier: personTrack.cameraId,
          personTrackId: personTrack.trackId,
          faceDetectionId: face.faceDetectionId,
          confidence: face.confidence,
          quality: quality.qualityState,
          recognitionStatus: matchResult.recognitionStatus,
          zoneId: spatialContext?.zoneId,
          spatialContext,
          evidenceReference,
          details: {
            qualityScore: quality.score,
            reasons: quality.reasons,
          },
          isSimulation: observation.isSimulation,
        });
      }
    }

    this.lastEmittedSignature.set(personTrack.trackId, eventSignature);
    this.metrics.lastProcessingLatencyMs = Number((performance.now() - startTime).toFixed(2));

    return {
      record,
      association,
      quality,
      observation,
    };
  }

  /**
   * Helper to extract and ingest a face from an active Person track.
   */
  public processPersonTrack(
    personTrack: Track,
    overrides?: {
      faceConfidence?: number;
      sharpnessScore?: number;
      luminanceScore?: number;
      yawDegrees?: number;
      pitchDegrees?: number;
      occlusionScore?: number;
      templateId?: string;
      similarityOverride?: number;
      spatialContext?: FaceObservation['spatialContext'];
      evidenceReference?: FaceObservation['evidenceReference'];
    }
  ): PersistentPersonFaceRecord | null {
    if (personTrack.objectType !== 'person') return null;

    const face = this.detector.extractFaceFromPersonTrack(personTrack, {
      faceConfidence: overrides?.faceConfidence,
    });
    if (!face) return null;

    const res = this.ingestObservation({
      personTrack,
      face,
      qualityOverrides: {
        sharpnessScore: overrides?.sharpnessScore,
        luminanceScore: overrides?.luminanceScore,
        yawDegrees: overrides?.yawDegrees,
        pitchDegrees: overrides?.pitchDegrees,
        occlusionScore: overrides?.occlusionScore,
      },
      embeddingOverrides: {
        templateId: overrides?.templateId,
        similarityOverride: overrides?.similarityOverride,
      },
      spatialContext: overrides?.spatialContext,
      evidenceReference: overrides?.evidenceReference,
    });

    return res.record;
  }

  public getRecord(personTrackId: string): PersistentPersonFaceRecord | undefined {
    return this.recordsByTrackId.get(personTrackId);
  }

  public getAllRecords(): PersistentPersonFaceRecord[] {
    return Array.from(this.recordsByTrackId.values());
  }

  public queryRecords(filter: FaceQueryFilter): PersistentPersonFaceRecord[] {
    let list = Array.from(this.recordsByTrackId.values());

    if (filter.cameraId) {
      list = list.filter((r) => r.cameraId === filter.cameraId || r.cameraIdentifier === filter.cameraId);
    }
    if (filter.personTrackId) {
      list = list.filter((r) => r.personTrackId.toLowerCase().includes(filter.personTrackId!.toLowerCase()));
    }
    if (filter.recognitionStatus) {
      list = list.filter((r) => r.recognitionStatus === filter.recognitionStatus);
    }
    if (filter.quality) {
      list = list.filter((r) => r.bestQuality === filter.quality);
    }
    if (filter.isWatchlistMatch !== undefined) {
      list = list.filter((r) => r.isWatchlistMatch === filter.isWatchlistMatch);
    }
    if (filter.watchlistCategory) {
      list = list.filter((r) => r.watchlistCategory === filter.watchlistCategory);
    }
    if (filter.startDate) {
      const startMs = new Date(filter.startDate).getTime();
      list = list.filter((r) => new Date(r.lastSeenAt).getTime() >= startMs);
    }
    if (filter.endDate) {
      const endMs = new Date(filter.endDate).getTime();
      list = list.filter((r) => new Date(r.lastSeenAt).getTime() <= endMs);
    }
    if (filter.limit && filter.limit > 0) {
      list = list.slice(0, filter.limit);
    }

    return list;
  }

  public getEventHistory(limit = 100): FaceEvent[] {
    return this.eventHistory.slice(-limit).reverse();
  }

  public clear(): void {
    this.recordsByTrackId.clear();
    this.eventHistory = [];
    this.lastEmittedSignature.clear();
  }
}

export const faceService = new FaceService();
