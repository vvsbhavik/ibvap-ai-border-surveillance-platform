/**
 * IBVAP — Automatic Number Plate Recognition (ANPR) Service
 *
 * Core service orchestrating plate detection, OCR, spatial association,
 * track-persistent consensus, watchlist correlation, and structured event dispatching.
 */

import { RawFrame } from '../video-gateway/types';
import { Track } from '../tracking/types';
import { VehicleClass } from '../ai-inference/types';
import {
  AnprConfig,
  AnprEvent,
  AnprEventType,
  AnprQueryFilter,
  OcrResult,
  PersistentVehicleAnprRecord,
  PlateDetection,
  VehiclePlateAssociation,
} from './types';
import { PlateDetector, plateDetector } from './plate-detector';
import { OcrEngine, ocrEngine } from './ocr-engine';
import { VehiclePlateAssociator, vehiclePlateAssociator } from './associator';
import { updatePersistentVehicleRecord } from './consensus';
import { normalizePlateText } from './normalizer';

export interface AnprServiceMetrics {
  platesDetectedTotal: number;
  platesRecognizedTotal: number;
  platesConfirmedTotal: number;
  platesUncertainTotal: number;
  platesUnreadableTotal: number;
  associationsTotal: number;
  associationsRejectedTotal: number;
  watchlistMatchesTotal: number;
  eventsEmittedTotal: number;
  lastProcessingLatencyMs: number | null;
}

export type AnprEventListener = (event: AnprEvent) => void;

export const DEFAULT_ANPR_CONFIG: AnprConfig = {
  enabled: true,
  minVehicleConfidenceForAnpr: 0.40,
  minPlateConfidence: 0.60,
  minOcrConfidenceConfirmed: 0.85,
  minOcrConfidenceProbable: 0.65,
  maxAssociationDistance: 0.35,
  minContainmentRatio: 0.70,
  consensusMaxFrames: 30,
  throttleFramesPerTrack: 3,
};

export class AnprService {
  private config: AnprConfig;
  private detector: PlateDetector;
  private ocr: OcrEngine;
  private associator: VehiclePlateAssociator;

  // Track ID -> Persistent ANPR Record
  private recordsByTrackId: Map<string, PersistentVehicleAnprRecord> = new Map();
  private readonly maxTrackRecords = 250;

  // In-memory ANPR Watchlists
  private watchlists: Array<{
    id: string;
    plateNumber: string;
    category: string;
    labelName?: string;
    priority?: string;
    notes?: string;
    active?: boolean;
    createdAt?: string;
    updatedAt?: string;
  }> = [
    { id: 'anpr-wl-1', plateNumber: 'AZ982FX', category: 'STOLEN_VEHICLE', labelName: 'Stolen Border Crossing Hotlist', priority: 'CRITICAL', active: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 'anpr-wl-2', plateNumber: 'TX-802-KL', category: 'SMUGGLING_CONVOY', labelName: 'Sector 4 Smuggling Watch', priority: 'HIGH', active: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 'anpr-wl-3', plateNumber: 'TS09AB1234', category: 'BORDER_VIOLATION', labelName: 'Restricted Crossing Evader', priority: 'CRITICAL', active: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  ];

  // Bounded event and observation history
  private eventHistory: AnprEvent[] = [];
  private eventListeners: Set<AnprEventListener> = new Set();

  // Track processing frame counters for throttling
  private trackFrameCounter: Map<string, number> = new Map();

  // Last emitted recognition status cache to prevent duplicate spam: trackId -> signature
  private lastEmittedSignature: Map<string, string> = new Map();

  // Telemetry metrics
  private metrics: AnprServiceMetrics = {
    platesDetectedTotal: 0,
    platesRecognizedTotal: 0,
    platesConfirmedTotal: 0,
    platesUncertainTotal: 0,
    platesUnreadableTotal: 0,
    associationsTotal: 0,
    associationsRejectedTotal: 0,
    watchlistMatchesTotal: 0,
    eventsEmittedTotal: 0,
    lastProcessingLatencyMs: null,
  };

  constructor(
    config: Partial<AnprConfig> = {},
    detector: PlateDetector = plateDetector,
    ocr: OcrEngine = ocrEngine,
    associator: VehiclePlateAssociator = vehiclePlateAssociator
  ) {
    this.config = { ...DEFAULT_ANPR_CONFIG, ...config };
    this.detector = detector;
    this.ocr = ocr;
    this.associator = associator;
  }

  public getConfig(): AnprConfig {
    return { ...this.config };
  }

  public updateConfig(newConfig: Partial<AnprConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  public getMetrics(): AnprServiceMetrics {
    return { ...this.metrics };
  }

  public onAnprEvent(listener: AnprEventListener): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  private dispatchEvent(event: AnprEvent): void {
    this.eventHistory.push(event);
    if (this.eventHistory.length > 500) {
      this.eventHistory.shift();
    }
    this.metrics.eventsEmittedTotal++;

    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('[AnprService] Error in ANPR event listener:', err);
      }
    }
  }

  /**
   * Main ingest pipeline for an individual plate observation.
   * Can be invoked directly by synthetic scenarios, real inference, or tests.
   */
  public ingestObservation(params: {
    vehicleTrack: Track;
    plate: PlateDetection;
    rawOcrText?: string;
    ocrConfidence?: number;
    characterConfidences?: number[];
    spatialContext?: PersistentVehicleAnprRecord['spatialContext'];
    evidenceReference?: PersistentVehicleAnprRecord['evidenceReference'];
    isSimulation?: boolean;
    watchlists?: Array<{ plateNumber: string; category: string; id: string; active?: boolean }>;
  }): {
    record: PersistentVehicleAnprRecord;
    association: VehiclePlateAssociation;
    ocr: OcrResult;
  } {
    const startTime = performance.now();
    const {
      vehicleTrack,
      plate,
      rawOcrText,
      ocrConfidence,
      characterConfidences,
      spatialContext,
      evidenceReference,
      isSimulation,
      watchlists,
    } = params;

    // 1. Evaluate spatial & temporal vehicle-plate association
    const association = this.associator.evaluateAssociation(plate, vehicleTrack);
    if (!association.isValid) {
      this.metrics.associationsRejectedTotal++;
      throw new Error(`Plate association rejected: ${association.rejectionReason}`);
    }

    this.metrics.platesDetectedTotal++;
    this.metrics.associationsTotal++;

    // 2. Perform OCR recognition
    const ocr = this.ocr.recognizePlate(plate, {
      rawText: rawOcrText,
      confidence: ocrConfidence,
      characterConfidences,
    });

    this.metrics.platesRecognizedTotal++;
    if (ocr.status === 'CONFIRMED') {
      this.metrics.platesConfirmedTotal++;
    } else if (ocr.status === 'UNCERTAIN') {
      this.metrics.platesUncertainTotal++;
    } else if (ocr.status === 'UNREADABLE') {
      this.metrics.platesUnreadableTotal++;
    }

    // 3. Update track-persistent multi-frame consensus
    const existing = this.recordsByTrackId.get(vehicleTrack.trackId);
    const { record, hasRecognitionChanged, isNewlyConfirmed } = updatePersistentVehicleRecord(
      existing,
      {
        vehicleTrackId: vehicleTrack.trackId,
        cameraId: vehicleTrack.cameraId,
        cameraIdentifier: vehicleTrack.cameraId,
        vehicleClass: vehicleTrack.vehicleClass || (vehicleTrack.class as VehicleClass) || 'CAR',
        vehicleConfidence: vehicleTrack.currentConfidence,
        plate,
        ocr,
        association,
        spatialContext,
        evidenceReference,
        isSimulation: isSimulation ?? vehicleTrack.isSimulation ?? true,
      }
    );

    // 4. Correlate with active watchlists
    if (watchlists && record.normalizedPlate) {
      const match = watchlists.find(
        (w) =>
          (w.active !== false) &&
          normalizePlateText(w.plateNumber).normalizedText === record.normalizedPlate
      );
      if (match) {
        const isNewlyMatched = !record.isWatchlistMatch;
        record.isWatchlistMatch = true;
        record.watchlistCategory = match.category;
        record.watchlistEntryId = match.id;
        this.metrics.watchlistMatchesTotal++;

        // Emit anpr.watchlist.match on positive correlation with active watchlist
        if (isNewlyMatched || !existing || !existing.isWatchlistMatch) {
          this.dispatchEvent({
            eventId: `evt-anpr-wl-${Date.now()}-${vehicleTrack.trackId}`,
            eventType: 'anpr.watchlist.match',
            cameraId: plate.cameraId,
            vehicleTrackId: vehicleTrack.trackId,
            plateDetectionId: plate.plateDetectionId,
            timestamp: plate.timestamp,
            plateText: record.bestPlateText,
            normalizedPlate: record.normalizedPlate,
            recognitionStatus: record.recognitionStatus,
            confidence: {
              vehicle: record.vehicleConfidence,
              plate: record.plateDetectionConfidence,
              ocr: record.ocrConfidence,
              association: record.associationConfidence,
              overall: record.overallConfidence,
            },
            vehicleClass: record.vehicleClass,
            position: plate.boundingBox,
            spatialContext: record.spatialContext,
            evidenceReference: record.evidenceReference,
            isSimulation: record.isSimulation,
            watchlistCategory: match.category,
            watchlistEntryId: match.id,
            isWatchlistMatch: true,
          });
        }
      }
    }

    this.recordsByTrackId.set(vehicleTrack.trackId, record);

    // Attach ANPR metadata directly onto vehicle track for UI continuity
    (vehicleTrack as any).anpr = {
      plateText: record.bestPlateText,
      normalizedText: record.normalizedPlate,
      confidence: record.overallConfidence,
      ocrConfidence: record.ocrConfidence,
      recognitionStatus: record.recognitionStatus,
      observationCount: record.observationCount,
      lastObservedAt: record.lastSeenAt,
      isWatchlistMatch: record.isWatchlistMatch,
    };

    // 5. Deduplicated Structured Event Emission
    const signature = `${record.bestPlateText}-${record.recognitionStatus}`;
    const prevSignature = this.lastEmittedSignature.get(vehicleTrack.trackId);

    // Emit anpr.plate.detected on first observation
    if (!existing) {
      this.dispatchEvent({
        eventId: `evt-anpr-det-${Date.now()}-${plate.plateDetectionId}`,
        eventType: 'anpr.plate.detected',
        cameraId: plate.cameraId,
        vehicleTrackId: vehicleTrack.trackId,
        plateDetectionId: plate.plateDetectionId,
        timestamp: plate.timestamp,
        plateText: record.bestPlateText,
        normalizedPlate: record.normalizedPlate,
        recognitionStatus: record.recognitionStatus,
        confidence: {
          vehicle: record.vehicleConfidence,
          plate: record.plateDetectionConfidence,
          ocr: record.ocrConfidence,
          association: record.associationConfidence,
          overall: record.overallConfidence,
        },
        vehicleClass: record.vehicleClass,
        position: plate.boundingBox,
        spatialContext: record.spatialContext,
        evidenceReference: record.evidenceReference,
        isSimulation: record.isSimulation,
      });

      this.dispatchEvent({
        eventId: `evt-anpr-assoc-${Date.now()}-${vehicleTrack.trackId}`,
        eventType: 'anpr.vehicle.associated',
        cameraId: plate.cameraId,
        vehicleTrackId: vehicleTrack.trackId,
        plateDetectionId: plate.plateDetectionId,
        timestamp: plate.timestamp,
        plateText: record.bestPlateText,
        normalizedPlate: record.normalizedPlate,
        recognitionStatus: record.recognitionStatus,
        confidence: {
          vehicle: record.vehicleConfidence,
          plate: record.plateDetectionConfidence,
          ocr: record.ocrConfidence,
          association: record.associationConfidence,
          overall: record.overallConfidence,
        },
        vehicleClass: record.vehicleClass,
        position: plate.boundingBox,
        spatialContext: record.spatialContext,
        evidenceReference: record.evidenceReference,
        isSimulation: record.isSimulation,
      });
    }

    // Only emit recognition update if status or text changed, preventing redundant event spam
    if (hasRecognitionChanged && signature !== prevSignature) {
      this.lastEmittedSignature.set(vehicleTrack.trackId, signature);

      let eventType: AnprEventType = 'anpr.recognition.updated';
      if (isNewlyConfirmed) {
        eventType = 'anpr.recognition.confirmed';
      } else if (record.recognitionStatus === 'UNCERTAIN') {
        eventType = 'anpr.recognition.uncertain';
      }

      this.dispatchEvent({
        eventId: `evt-anpr-rec-${Date.now()}-${vehicleTrack.trackId}`,
        eventType,
        cameraId: plate.cameraId,
        vehicleTrackId: vehicleTrack.trackId,
        plateDetectionId: plate.plateDetectionId,
        timestamp: plate.timestamp,
        plateText: record.bestPlateText,
        normalizedPlate: record.normalizedPlate,
        recognitionStatus: record.recognitionStatus,
        confidence: {
          vehicle: record.vehicleConfidence,
          plate: record.plateDetectionConfidence,
          ocr: record.ocrConfidence,
          association: record.associationConfidence,
          overall: record.overallConfidence,
        },
        vehicleClass: record.vehicleClass,
        position: plate.boundingBox,
        spatialContext: record.spatialContext,
        evidenceReference: record.evidenceReference,
        isSimulation: record.isSimulation,
      });
    }

    const latency = performance.now() - startTime;
    this.metrics.lastProcessingLatencyMs = Number(latency.toFixed(3));

    return { record, association, ocr };
  }

  /**
   * Frame-level ANPR processing for active vehicle tracks.
   * Throttles OCR passes per track and gracefully handles errors.
   */
  public processFrame(
    frame: RawFrame,
    activeTracks: Track[],
    options: {
      getSpatialContext?: (track: Track) => PersistentVehicleAnprRecord['spatialContext'];
      watchlists?: Array<{ plateNumber: string; category: string; id: string; active?: boolean }>;
    } = {}
  ): PersistentVehicleAnprRecord[] {
    if (!this.config.enabled) {
      return [];
    }

    const updatedRecords: PersistentVehicleAnprRecord[] = [];
    const vehicleTracks = activeTracks.filter((t) => t.objectType === 'vehicle');

    for (const track of vehicleTracks) {
      try {
        // Gating: Vehicle confidence threshold
        if (track.currentConfidence < this.config.minVehicleConfidenceForAnpr) {
          continue;
        }

        // Throttling: Check frame skip count unless newly seen
        const count = (this.trackFrameCounter.get(track.trackId) || 0) + 1;
        this.trackFrameCounter.set(track.trackId, count);

        const existingRecord = this.recordsByTrackId.get(track.trackId);
        // If already confirmed, throttle OCR checks to once every N frames
        if (existingRecord?.recognitionStatus === 'CONFIRMED' && count % this.config.throttleFramesPerTrack !== 0) {
          continue;
        }

        // Detect plate region from vehicle bounding box
        const plate = this.detector.detectPlateInVehicle(
          {
            detectionId: `det-v-${track.trackId}`,
            cameraId: track.cameraId,
            frameReference: `frame-${frame.cameraId}-${frame.sequenceNumber}`,
            modelVersion: track.modelVersion || 'YOLOS-tiny',
            timestamp: frame.timestamp,
            inferenceTimestamp: frame.timestamp,
            objectType: 'vehicle',
            vehicleClass: track.vehicleClass,
            class: track.class || 'CAR',
            confidence: track.currentConfidence,
            boundingBox: track.lastBoundingBox,
            pixelBox: track.lastPixelBox,
          },
          {
            width: frame.width,
            height: frame.height,
            timestamp: frame.timestamp,
            sequenceNumber: frame.sequenceNumber,
          },
          { vehicleTrackId: track.trackId }
        );

        if (!plate || plate.confidence < this.config.minPlateConfidence) {
          continue;
        }

        // Retrieve spatial context if provider provided
        const spatialContext = options.getSpatialContext?.(track);

        // Ingest observation
        const { record } = this.ingestObservation({
          vehicleTrack: track,
          plate,
          rawOcrText: (track as any).simulatedPlateText,
          ocrConfidence: (track as any).simulatedOcrConfidence,
          spatialContext,
          watchlists: options.watchlists || this.getWatchlists(),
        });

        updatedRecords.push(record);
      } catch (err) {
        // Failure isolation: log error but never crash the overall frame pipeline
        console.warn(`[AnprService] ANPR error on track ${track.trackId}:`, err);
      }
    }

    this.pruneOldRecords();
    return updatedRecords;
  }

  /**
   * Enforces bounded in-memory retention of persistent vehicle ANPR records.
   */
  public pruneOldRecords(maxAgeHours = 24): { pruned: number; remaining: number } {
    let pruned = 0;
    const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000;
    for (const [id, rec] of this.recordsByTrackId.entries()) {
      if (new Date(rec.lastSeenAt).getTime() < cutoff) {
        this.recordsByTrackId.delete(id);
        this.lastEmittedSignature.delete(id);
        this.trackFrameCounter.delete(id);
        pruned++;
      }
    }

    if (this.recordsByTrackId.size > this.maxTrackRecords) {
      const entries = Array.from(this.recordsByTrackId.entries());
      entries.sort((a, b) => Date.parse(a[1].lastSeenAt) - Date.parse(b[1].lastSeenAt));

      const toRemove = entries.slice(0, entries.length - this.maxTrackRecords);
      for (const [id] of toRemove) {
        this.recordsByTrackId.delete(id);
        this.lastEmittedSignature.delete(id);
        this.trackFrameCounter.delete(id);
        pruned++;
      }
    }

    return { pruned, remaining: this.recordsByTrackId.size };
  }

  public getRetentionPolicy() {
    return {
      maxRecords: this.maxTrackRecords,
      maxTrackRecords: this.maxTrackRecords,
      currentRecordCount: this.recordsByTrackId.size,
      maxEventHistory: 500,
      ttlHours: 24,
      strategy: 'BOUNDED_LRU_IN_MEMORY' as const,
    };
  }

  /**
   * ANPR Watchlist CRUD methods
   */
  public getWatchlists() {
    return [...this.watchlists];
  }

  public addWatchlistEntry(entry: {
    plateNumber: string;
    category: string;
    labelName?: string;
    priority?: string;
    notes?: string;
    active?: boolean;
  }) {
    const normalized = normalizePlateText(entry.plateNumber).normalizedText;
    const newEntry = {
      id: `anpr-wl-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      plateNumber: normalized,
      rawPlateNumber: entry.plateNumber,
      category: entry.category,
      labelName: entry.labelName || `Plate ${entry.plateNumber}`,
      priority: entry.priority || 'HIGH',
      notes: entry.notes || '',
      active: entry.active !== false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.watchlists.unshift(newEntry);
    return newEntry;
  }

  public updateWatchlistEntry(
    id: string,
    updates: Partial<{
      plateNumber: string;
      category: string;
      labelName: string;
      priority: string;
      notes: string;
      active: boolean;
    }>
  ) {
    const idx = this.watchlists.findIndex((w) => w.id === id);
    if (idx === -1) return null;
    this.watchlists[idx] = {
      ...this.watchlists[idx],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    return this.watchlists[idx];
  }

  public toggleWatchlistEntry(id: string) {
    const entry = this.watchlists.find((w) => w.id === id);
    if (!entry) return null;
    entry.active = !entry.active;
    entry.updatedAt = new Date().toISOString();
    return entry;
  }

  public deleteWatchlistEntry(id: string) {
    const idx = this.watchlists.findIndex((w) => w.id === id);
    if (idx === -1) return false;
    this.watchlists.splice(idx, 1);
    return true;
  }

  /**
   * Retrieves persistent ANPR record by vehicle Track ID.
   */
  public getRecordByTrackId(trackId: string): PersistentVehicleAnprRecord | undefined {
    return this.recordsByTrackId.get(trackId);
  }

  /**
   * Retrieves all records for a specific camera.
   */
  public getRecordsByCamera(cameraId: string): PersistentVehicleAnprRecord[] {
    return Array.from(this.recordsByTrackId.values()).filter(
      (r) => r.cameraId === cameraId || r.cameraIdentifier === cameraId
    );
  }

  /**
   * Queries records with comprehensive filtering and pagination.
   */
  public queryRecords(filter: AnprQueryFilter = {}): {
    records: PersistentVehicleAnprRecord[];
    total: number;
    offset: number;
    limit: number;
  } {
    let result = Array.from(this.recordsByTrackId.values());

    if (filter.plate) {
      const term = normalizePlateText(filter.plate).normalizedText;
      result = result.filter((r) => r.normalizedPlate.includes(term) || r.bestPlateText.toLowerCase().includes(filter.plate!.toLowerCase()));
    }

    if (filter.normalizedPlate) {
      result = result.filter((r) => r.normalizedPlate === filter.normalizedPlate);
    }

    if (filter.vehicleTrackId) {
      result = result.filter((r) => r.vehicleTrackId === filter.vehicleTrackId);
    }

    if (filter.cameraId) {
      result = result.filter((r) => r.cameraId === filter.cameraId || r.cameraIdentifier === filter.cameraId);
    }

    if (filter.vehicleClass && filter.vehicleClass !== 'ALL') {
      result = result.filter((r) => r.vehicleClass === filter.vehicleClass);
    }

    if (filter.recognitionStatus && filter.recognitionStatus !== 'ALL') {
      result = result.filter((r) => r.recognitionStatus === filter.recognitionStatus);
    }

    if (filter.watchlistOnly) {
      result = result.filter((r) => r.isWatchlistMatch === true);
    }

    if (filter.minConfidence !== undefined) {
      result = result.filter((r) => r.overallConfidence >= filter.minConfidence!);
    }

    if (filter.startTime) {
      const startMs = Date.parse(filter.startTime);
      result = result.filter((r) => Date.parse(r.lastSeenAt) >= startMs);
    }

    if (filter.endTime) {
      const endMs = Date.parse(filter.endTime);
      result = result.filter((r) => Date.parse(r.lastSeenAt) <= endMs);
    }

    // Sort by latest seen descending
    result.sort((a, b) => Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt));

    const total = result.length;
    const offset = filter.offset || 0;
    const limit = filter.limit || 50;
    const paged = result.slice(offset, offset + limit);

    return {
      records: paged,
      total,
      offset,
      limit,
    };
  }

  /**
   * Retrieves recent structured ANPR events.
   */
  public getEvents(limit = 100): AnprEvent[] {
    return [...this.eventHistory].reverse().slice(0, limit);
  }

  /**
   * Resets all internal ANPR states and metrics.
   */
  public reset(): void {
    this.recordsByTrackId.clear();
    this.eventHistory = [];
    this.trackFrameCounter.clear();
    this.lastEmittedSignature.clear();
    this.metrics = {
      platesDetectedTotal: 0,
      platesRecognizedTotal: 0,
      platesConfirmedTotal: 0,
      platesUncertainTotal: 0,
      platesUnreadableTotal: 0,
      associationsTotal: 0,
      associationsRejectedTotal: 0,
      watchlistMatchesTotal: 0,
      eventsEmittedTotal: 0,
      lastProcessingLatencyMs: null,
    };
  }
}

export const anprService = new AnprService();
