/**
 * IBVAP — Face Recognition & Watchlist Matching Engine
 *
 * Implements cosine similarity comparison between normalized facial embedding vectors,
 * applies quality gating to prevent false biometric matching on degraded imagery,
 * and correlates observations with synthetic watchlist records.
 */

import {
  FaceEmbeddingRef,
  FaceObservation,
  FaceQualityMetrics,
  FaceRecognitionStatus,
  FaceWatchlistEntry,
} from './types';

export const DEFAULT_EMBEDDING_VERSION = 'v2.1';
export const DEFAULT_MODEL_VERSION = 'FaceNet-Edge-128-v1';
export const DEFAULT_VECTOR_LENGTH = 128;

/**
 * Standard synthetic watchlist for testing and demonstrations.
 * All records are clearly marked as synthetic.
 */
export const SYNTHETIC_FACE_WATCHLISTS: FaceWatchlistEntry[] = [
  {
    id: 'WL-FACE-01',
    displayName: 'SYNTH-POI: Victor Ramos (Synthetic Subject Alpha)',
    category: 'PERSON_OF_INTEREST',
    externalReference: 'REF-SYNTH-PO-4912',
    faceTemplateId: 'tpl-synth-alpha',
    embeddingVersion: DEFAULT_EMBEDDING_VERSION,
    modelVersion: DEFAULT_MODEL_VERSION,
    threshold: 0.82,
    status: 'ACTIVE',
    priority: 'HIGH',
    notes: 'Synthetic record for validation of positive biometric watchlist match.',
    thumbnailUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=160&q=80',
    createdAt: '2026-01-10T00:00:00.000Z',
    updatedAt: '2026-02-01T00:00:00.000Z',
    isSynthetic: true,
  },
  {
    id: 'WL-FACE-02',
    displayName: 'SYNTH-POI: Elena Rostova (Synthetic Subject Beta)',
    category: 'EXPELLED_INDIVIDUAL',
    externalReference: 'REF-SYNTH-EXP-8821',
    faceTemplateId: 'tpl-synth-beta',
    embeddingVersion: DEFAULT_EMBEDDING_VERSION,
    modelVersion: DEFAULT_MODEL_VERSION,
    threshold: 0.84,
    status: 'ACTIVE',
    priority: 'CRITICAL',
    notes: 'Synthetic expelled individual flagged for immediate interdiction upon border approach.',
    thumbnailUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=160&q=80',
    createdAt: '2026-01-15T00:00:00.000Z',
    updatedAt: '2026-02-05T00:00:00.000Z',
    isSynthetic: true,
  },
  {
    id: 'WL-FACE-03',
    displayName: 'SYNTH-STAFF: Officer Carlos Mendez (Synthetic Border Staff)',
    category: 'AUTHORIZED_BORDER_STAFF',
    externalReference: 'STAFF-SYNTH-902',
    faceTemplateId: 'tpl-synth-staff',
    embeddingVersion: DEFAULT_EMBEDDING_VERSION,
    modelVersion: DEFAULT_MODEL_VERSION,
    threshold: 0.80,
    status: 'ACTIVE',
    priority: 'LOW',
    notes: 'Synthetic patrol agent template for authorized zone transit verification.',
    thumbnailUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=160&q=80',
    createdAt: '2026-01-05T00:00:00.000Z',
    updatedAt: '2026-01-05T00:00:00.000Z',
    isSynthetic: true,
  },
];

/**
 * Computes cosine similarity between two numeric vectors.
 */
export function computeCosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length || vecA.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return Math.max(0, Math.min(1.0, dot / (Math.sqrt(normA) * Math.sqrt(normB))));
}

/**
 * Deterministic synthetic embedding generator based on template ID or seed string.
 * Generates reproducible unit vectors for testing without fabricating real biometrics.
 */
export function generateSyntheticEmbedding(seed: string = 'default-seed', length = DEFAULT_VECTOR_LENGTH): number[] {
  const safeSeed = String(seed || 'default-seed');
  let h = 2166136261 >>> 0;
  for (let i = 0; i < safeSeed.length; i++) {
    h = Math.imul(h ^ safeSeed.charCodeAt(i), 16777619) >>> 0;
  }

  const vec: number[] = new Array(length);
  let sumSq = 0;
  for (let i = 0; i < length; i++) {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    const val = ((h >>> 0) / 4294967296) * 2 - 1;
    vec[i] = val;
    sumSq += val * val;
  }

  // Normalize to unit length
  const norm = Math.sqrt(sumSq) || 1;
  return vec.map((v) => v / norm);
}

export interface MatchEvaluationResult {
  recognitionStatus: FaceRecognitionStatus;
  similarityScore?: number;
  matchingThreshold?: number;
  isWatchlistMatch: boolean;
  matchedWatchlistEntry?: FaceWatchlistEntry;
  embeddingRef: FaceEmbeddingRef;
  qualityPassed: boolean;
  diagnosticReason: string;
}

export class FaceMatcher {
  private watchlists: FaceWatchlistEntry[];

  constructor(watchlists: FaceWatchlistEntry[] = SYNTHETIC_FACE_WATCHLISTS) {
    this.watchlists = [...watchlists];
  }

  public getWatchlists(): FaceWatchlistEntry[] {
    return [...this.watchlists];
  }

  public setWatchlists(watchlists: FaceWatchlistEntry[]): void {
    this.watchlists = [...watchlists];
  }

  public addWatchlist(entry: FaceWatchlistEntry): FaceWatchlistEntry {
    this.watchlists.unshift(entry);
    return entry;
  }

  public updateWatchlist(id: string, updates: Partial<FaceWatchlistEntry>): FaceWatchlistEntry | null {
    const idx = this.watchlists.findIndex((w) => w.id === id);
    if (idx === -1) return null;
    this.watchlists[idx] = {
      ...this.watchlists[idx],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    return this.watchlists[idx];
  }

  public toggleWatchlist(id: string): FaceWatchlistEntry | null {
    const entry = this.watchlists.find((w) => w.id === id);
    if (!entry) return null;
    entry.status = entry.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    entry.updatedAt = new Date().toISOString();
    return entry;
  }

  public deleteWatchlist(id: string): boolean {
    const idx = this.watchlists.findIndex((w) => w.id === id);
    if (idx === -1) return false;
    this.watchlists.splice(idx, 1);
    return true;
  }

  /**
   * Matches an observed face against the active watchlists, enforcing strict quality gating.
   */
  public evaluateMatch(
    quality: FaceQualityMetrics,
    embeddingInput?: {
      templateId?: string;
      vector?: number[];
      similarityOverride?: number; // for direct scenario testing
    },
    customWatchlists?: FaceWatchlistEntry[]
  ): MatchEvaluationResult {
    const activeWatchlists = (customWatchlists || this.watchlists).filter((w) => w.status === 'ACTIVE');

    // 1. Strict Quality Gating: Never match degraded, unreadable, or poor imagery
    if (quality.qualityState === 'UNREADABLE') {
      return {
        recognitionStatus: 'UNREADABLE',
        isWatchlistMatch: false,
        qualityPassed: false,
        embeddingRef: {
          faceTemplateId: 'none',
          embeddingVersion: DEFAULT_EMBEDDING_VERSION,
          modelVersion: DEFAULT_MODEL_VERSION,
          vectorLength: DEFAULT_VECTOR_LENGTH,
          createdAt: new Date().toISOString(),
        },
        diagnosticReason: 'Quality gating failed: image is UNREADABLE. Biometric recognition aborted.',
      };
    }

    if (quality.qualityState === 'POOR') {
      return {
        recognitionStatus: 'LOW_QUALITY',
        isWatchlistMatch: false,
        qualityPassed: false,
        embeddingRef: {
          faceTemplateId: 'low-quality',
          embeddingVersion: DEFAULT_EMBEDDING_VERSION,
          modelVersion: DEFAULT_MODEL_VERSION,
          vectorLength: DEFAULT_VECTOR_LENGTH,
          createdAt: new Date().toISOString(),
        },
        diagnosticReason: 'Quality gating failed: image quality is POOR. Feature extraction insufficient for reliable matching.',
      };
    }

    // 2. Feature Embedding Extraction / Reference
    const templateId = embeddingInput?.templateId || `tpl-obs-${Date.now().toString(36)}`;
    const embeddingRef: FaceEmbeddingRef = {
      faceTemplateId: templateId,
      embeddingVersion: DEFAULT_EMBEDDING_VERSION,
      modelVersion: DEFAULT_MODEL_VERSION,
      vectorLength: DEFAULT_VECTOR_LENGTH,
      createdAt: new Date().toISOString(),
    };

    // 3. Scenario Similarity Override (for exact deterministic test vectors)
    if (embeddingInput?.similarityOverride !== undefined) {
      const sim = embeddingInput.similarityOverride;
      // Correlate with target watchlist entry if specified, or first active
      const targetEntry = activeWatchlists.find((w) => w.faceTemplateId === embeddingInput.templateId) || activeWatchlists[0];
      const threshold = targetEntry ? targetEntry.threshold : 0.82;

      if (sim >= threshold && targetEntry) {
        return {
          recognitionStatus: 'MATCHED',
          similarityScore: Number(sim.toFixed(3)),
          matchingThreshold: threshold,
          isWatchlistMatch: true,
          matchedWatchlistEntry: targetEntry,
          embeddingRef,
          qualityPassed: true,
          diagnosticReason: `Biometric correlation confirmed: similarity ${sim.toFixed(3)} >= threshold ${threshold}`,
        };
      } else if (sim >= 0.70) {
        return {
          recognitionStatus: 'POSSIBLE_MATCH',
          similarityScore: Number(sim.toFixed(3)),
          matchingThreshold: threshold,
          isWatchlistMatch: false,
          matchedWatchlistEntry: targetEntry,
          embeddingRef,
          qualityPassed: true,
          diagnosticReason: `Ambiguous biometric similarity: ${sim.toFixed(3)} (requires operator review)`,
        };
      } else {
        return {
          recognitionStatus: 'UNKNOWN',
          similarityScore: Number(sim.toFixed(3)),
          matchingThreshold: threshold,
          isWatchlistMatch: false,
          embeddingRef,
          qualityPassed: true,
          diagnosticReason: `No watchlist correlation: similarity ${sim.toFixed(3)} below threshold`,
        };
      }
    }

    // 4. Vector Cosine Similarity Evaluation
    const obsVector = embeddingInput?.vector || generateSyntheticEmbedding(templateId);

    let bestMatch: FaceWatchlistEntry | undefined;
    let bestSimilarity = 0;

    for (const entry of activeWatchlists) {
      const entryVector =
        (entry as any).templateEmbedding ||
        generateSyntheticEmbedding(entry.faceTemplateId || entry.id || 'seed-default');
      const similarity = computeCosineSimilarity(obsVector, entryVector);
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestMatch = entry;
      }
    }

    const roundedSim = Number(bestSimilarity.toFixed(3));
    const effectiveThreshold = bestMatch ? (bestMatch.threshold ?? 0.82) : 0.82;

    if (bestMatch && roundedSim >= effectiveThreshold) {
      return {
        recognitionStatus: 'MATCHED',
        similarityScore: roundedSim,
        matchingThreshold: effectiveThreshold,
        isWatchlistMatch: true,
        matchedWatchlistEntry: bestMatch,
        embeddingRef,
        qualityPassed: true,
        diagnosticReason: `Biometric match confirmed against ${bestMatch.displayName} (${bestMatch.category}) with similarity ${roundedSim}`,
      };
    } else if (bestMatch && roundedSim >= 0.70) {
      return {
        recognitionStatus: 'POSSIBLE_MATCH',
        similarityScore: roundedSim,
        matchingThreshold: bestMatch.threshold,
        isWatchlistMatch: false,
        matchedWatchlistEntry: bestMatch,
        embeddingRef,
        qualityPassed: true,
        diagnosticReason: `Possible match detected against ${bestMatch.displayName} (${roundedSim} vs threshold ${bestMatch.threshold})`,
      };
    }

    return {
      recognitionStatus: 'UNKNOWN',
      similarityScore: roundedSim,
      matchingThreshold: 0.82,
      isWatchlistMatch: false,
      embeddingRef,
      qualityPassed: true,
      diagnosticReason: 'No watchlist match found. Subject unflagged.',
    };
  }
}

export const faceMatcher = new FaceMatcher();
