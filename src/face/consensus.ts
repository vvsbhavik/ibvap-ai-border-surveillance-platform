/**
 * IBVAP — Multi-Frame Face Consensus Engine
 *
 * Aggregates progressive face observations under a persistent Person Track ID:
 * - Maintains bounded rolling history per person track
 * - Determines best observation by quality score and sharpness
 * - Promotes recognition consensus (e.g. from UNKNOWN -> POSSIBLE_MATCH -> MATCHED)
 * - Suppresses duplicate event emissions when recognition status is steady
 */

import {
  FaceObservation,
  FaceQualityState,
  FaceRecognitionStatus,
  PersistentPersonFaceRecord,
} from './types';

const QUALITY_ORDER: Record<FaceQualityState, number> = {
  UNREADABLE: 0,
  POOR: 1,
  ACCEPTABLE: 2,
  GOOD: 3,
};

export interface ConsensusUpdateResult {
  record: PersistentPersonFaceRecord;
  hasRecognitionChanged: boolean;
  isNewlyMatched: boolean;
  isNewlyPossibleMatch: boolean;
  hasQualityUpgraded: boolean;
}

/**
 * Updates or creates a persistent person face record with a new frame observation.
 */
export function updatePersistentPersonFaceRecord(
  existingRecord: PersistentPersonFaceRecord | undefined,
  newObservation: FaceObservation,
  maxObservations = 30
): ConsensusUpdateResult {
  if (!existingRecord) {
    const record: PersistentPersonFaceRecord = {
      personTrackId: newObservation.personTrackId,
      cameraId: newObservation.cameraId,
      cameraIdentifier: newObservation.cameraIdentifier || newObservation.cameraId,
      primaryFaceDetectionId: newObservation.faceDetectionId,
      bestQuality: newObservation.quality.qualityState,
      bestQualityScore: newObservation.quality.score,
      recognitionStatus: newObservation.recognitionStatus,
      observationsCount: 1,
      observations: [newObservation],
      bestObservation: newObservation,
      isWatchlistMatch: newObservation.isWatchlistMatch ?? false,
      watchlistEntryId: newObservation.watchlistEntryId,
      watchlistDisplayName: newObservation.watchlistDisplayName,
      watchlistCategory: newObservation.watchlistCategory,
      similarityScore: newObservation.similarityScore,
      matchingThreshold: newObservation.matchingThreshold ?? 0.82,
      firstSeenAt: newObservation.timestamp,
      lastSeenAt: newObservation.timestamp,
      spatialContext: newObservation.spatialContext,
      evidenceReference: newObservation.evidenceReference,
      isSimulation: newObservation.isSimulation,
    };

    return {
      record,
      hasRecognitionChanged: true,
      isNewlyMatched: record.isWatchlistMatch,
      isNewlyPossibleMatch: record.recognitionStatus === 'POSSIBLE_MATCH',
      hasQualityUpgraded: true,
    };
  }

  // Record already exists for this Person Track ID
  const prevStatus = existingRecord.recognitionStatus;
  const prevQuality = existingRecord.bestQuality;
  const prevMatch = existingRecord.isWatchlistMatch;

  // Append observation and bound history
  const updatedObservations = [...existingRecord.observations, newObservation];
  if (updatedObservations.length > maxObservations) {
    updatedObservations.shift();
  }

  // Evaluate whether new observation has superior quality
  const newQualityRank = QUALITY_ORDER[newObservation.quality.qualityState];
  const currentBestRank = QUALITY_ORDER[existingRecord.bestQuality];
  const isSuperiorQuality =
    newQualityRank > currentBestRank ||
    (newQualityRank === currentBestRank && newObservation.quality.score > existingRecord.bestQualityScore);

  const bestObservation = isSuperiorQuality ? newObservation : existingRecord.bestObservation;
  const bestQuality = isSuperiorQuality ? newObservation.quality.qualityState : existingRecord.bestQuality;
  const bestQualityScore = isSuperiorQuality ? newObservation.quality.score : existingRecord.bestQualityScore;

  // Multi-frame consensus for recognition status:
  // If ANY high-quality observation achieved MATCHED status, keep MATCHED
  // If ANY achieved POSSIBLE_MATCH and not MATCHED, keep POSSIBLE_MATCH
  let consensusStatus: FaceRecognitionStatus = newObservation.recognitionStatus;
  let isWatchlistMatch = newObservation.isWatchlistMatch ?? false;
  let watchlistEntryId = newObservation.watchlistEntryId;
  let watchlistDisplayName = newObservation.watchlistDisplayName;
  let watchlistCategory = newObservation.watchlistCategory;
  let similarityScore = newObservation.similarityScore;
  let matchingThreshold = newObservation.matchingThreshold ?? existingRecord.matchingThreshold;

  if (existingRecord.recognitionStatus === 'MATCHED') {
    // Retain positive match across subsequent frames even if momentary blur occurs
    consensusStatus = 'MATCHED';
    isWatchlistMatch = true;
    watchlistEntryId = existingRecord.watchlistEntryId;
    watchlistDisplayName = existingRecord.watchlistDisplayName;
    watchlistCategory = existingRecord.watchlistCategory;
    similarityScore = Math.max(existingRecord.similarityScore ?? 0, newObservation.similarityScore ?? 0);
  } else if (newObservation.recognitionStatus === 'MATCHED') {
    consensusStatus = 'MATCHED';
    isWatchlistMatch = true;
  } else if (existingRecord.recognitionStatus === 'POSSIBLE_MATCH' && newObservation.recognitionStatus === 'POSSIBLE_MATCH') {
    // Multi-frame reinforcement: if two consecutive frames indicate possible match with >=0.75 average, consider promoting
    consensusStatus = 'POSSIBLE_MATCH';
    watchlistEntryId = newObservation.watchlistEntryId || existingRecord.watchlistEntryId;
    watchlistDisplayName = newObservation.watchlistDisplayName || existingRecord.watchlistDisplayName;
    watchlistCategory = newObservation.watchlistCategory || existingRecord.watchlistCategory;
    similarityScore = Math.max(existingRecord.similarityScore ?? 0, newObservation.similarityScore ?? 0);
  } else if (newObservation.recognitionStatus === 'POSSIBLE_MATCH') {
    consensusStatus = 'POSSIBLE_MATCH';
  } else if (newObservation.recognitionStatus === 'LOW_QUALITY' && existingRecord.recognitionStatus !== 'UNKNOWN') {
    consensusStatus = existingRecord.recognitionStatus;
  }

  const hasRecognitionChanged = consensusStatus !== prevStatus;
  const isNewlyMatched = !prevMatch && isWatchlistMatch;
  const isNewlyPossibleMatch = prevStatus !== 'POSSIBLE_MATCH' && consensusStatus === 'POSSIBLE_MATCH';
  const hasQualityUpgraded = newQualityRank > currentBestRank;

  const record: PersistentPersonFaceRecord = {
    ...existingRecord,
    bestQuality,
    bestQualityScore,
    recognitionStatus: consensusStatus,
    observationsCount: existingRecord.observationsCount + 1,
    observations: updatedObservations,
    bestObservation,
    isWatchlistMatch,
    watchlistEntryId: watchlistEntryId || existingRecord.watchlistEntryId,
    watchlistDisplayName: watchlistDisplayName || existingRecord.watchlistDisplayName,
    watchlistCategory: watchlistCategory || existingRecord.watchlistCategory,
    similarityScore: similarityScore ?? existingRecord.similarityScore,
    matchingThreshold,
    lastSeenAt: newObservation.timestamp,
    spatialContext: newObservation.spatialContext || existingRecord.spatialContext,
    evidenceReference: newObservation.evidenceReference || existingRecord.evidenceReference,
  };

  return {
    record,
    hasRecognitionChanged,
    isNewlyMatched,
    isNewlyPossibleMatch,
    hasQualityUpgraded,
  };
}
