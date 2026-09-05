/**
 * IBVAP — Multi-Frame Consensus & Track-Persistent ANPR Aggregator
 *
 * Merges multiple observations of the same vehicle into a unified, high-confidence
 * consensus recognition:
 * - Positional character-by-character confidence voting
 * - Resolves partial/occluded characters across successive frames
 * - Maintains separate, transparent confidence values (vehicle, plate, OCR, association)
 * - Assigns truthful recognition status: CONFIRMED, PROBABLE, UNCERTAIN, UNREADABLE
 * - Preserves complete observation history bounded per vehicle track
 */

import { VehicleClass } from '../ai-inference/types';
import {
  CharacterObservation,
  OcrResult,
  PersistentVehicleAnprRecord,
  PlateDetection,
  PlateObservation,
  PlateRecognitionStatus,
  VehiclePlateAssociation,
} from './types';
import { normalizePlateText } from './normalizer';

export interface ConsensusResult {
  bestPlateText: string;
  normalizedPlate: string;
  ocrConfidence: number;
  overallConfidence: number;
  recognitionStatus: PlateRecognitionStatus;
  characterConsensus: CharacterObservation[];
}

/**
 * Computes multi-frame positional character voting consensus across a list of observations.
 */
export function computeMultiFrameConsensus(observations: PlateObservation[]): ConsensusResult {
  if (observations.length === 0) {
    return {
      bestPlateText: '',
      normalizedPlate: '',
      ocrConfidence: 0,
      overallConfidence: 0,
      recognitionStatus: 'UNREADABLE',
      characterConsensus: [],
    };
  }

  if (observations.length === 1) {
    const single = observations[0];
    return {
      bestPlateText: single.normalizedText || single.rawText,
      normalizedPlate: single.normalizedText,
      ocrConfidence: single.ocrConfidence,
      overallConfidence: Number(
        (
          0.25 * 0.9 +
          0.25 * single.plateConfidence +
          0.35 * single.ocrConfidence +
          0.15 * single.associationConfidence
        ).toFixed(4)
      ),
      recognitionStatus: single.recognitionStatus,
      characterConsensus: single.characterSequence,
    };
  }

  // 1. Determine consensus plate length based on most frequent/highest-confidence observation length
  const lengthVotes = new Map<number, number>();
  for (const obs of observations) {
    if (!obs.normalizedText) continue;
    const len = obs.normalizedText.length;
    lengthVotes.set(len, (lengthVotes.get(len) || 0) + obs.ocrConfidence);
  }

  let consensusLength = 0;
  let maxLenWeight = -1;
  for (const [len, weight] of lengthVotes.entries()) {
    if (weight > maxLenWeight) {
      maxLenWeight = weight;
      consensusLength = len;
    }
  }

  if (consensusLength === 0) {
    return {
      bestPlateText: '',
      normalizedPlate: '',
      ocrConfidence: 0,
      overallConfidence: 0,
      recognitionStatus: 'UNREADABLE',
      characterConsensus: [],
    };
  }

  // 2. Positional voting for each character index
  const characterConsensus: CharacterObservation[] = [];
  const consensusChars: string[] = [];
  let totalConsensusConfidence = 0;

  for (let pos = 0; pos < consensusLength; pos++) {
    // Map char -> accumulated weighted vote
    const charVotes = new Map<string, { weight: number; count: number; maxConf: number }>();

    for (const obs of observations) {
      if (!obs.normalizedText || pos >= obs.normalizedText.length) continue;

      const char = obs.normalizedText[pos];
      // Ignore unknown placeholder chars '?' or '_' during voting if other valid chars exist
      const isPlaceholder = char === '?' || char === '_';

      const existing = charVotes.get(char) || { weight: 0, count: 0, maxConf: 0 };
      const weightBonus = isPlaceholder ? 0.05 : 1.0;
      const obsCharConf = obs.characterSequence[pos]?.confidence ?? obs.ocrConfidence;

      charVotes.set(char, {
        weight: existing.weight + obsCharConf * weightBonus,
        count: existing.count + 1,
        maxConf: Math.max(existing.maxConf, obsCharConf),
      });
    }

    // Filter out placeholders if valid alphanumeric chars competed
    let bestChar = '?';
    let bestCharWeight = -1;
    let bestCharConf = 0.3;

    // Check if there are non-placeholder candidates
    const validCandidates = Array.from(charVotes.entries()).filter(
      ([c]) => c !== '?' && c !== '_'
    );

    const candidatesToEvaluate = validCandidates.length > 0
      ? validCandidates
      : Array.from(charVotes.entries());

    for (const [c, vote] of candidatesToEvaluate) {
      if (vote.weight > bestCharWeight) {
        bestCharWeight = vote.weight;
        bestChar = c;
        bestCharConf = Number(
          Math.min(0.99, (vote.maxConf * 0.7 + (vote.weight / observations.length) * 0.3)).toFixed(4)
        );
      }
    }

    consensusChars.push(bestChar);
    totalConsensusConfidence += bestCharConf;
    characterConsensus.push({
      char: bestChar,
      confidence: bestCharConf,
      positionIndex: pos,
    });
  }

  const consensusText = consensusChars.join('');
  const avgOcrConfidence = Number((totalConsensusConfidence / consensusLength).toFixed(4));

  // 3. Status determination with multi-frame reinforcement
  // If multiple frames agree and confidence is solid, promote to CONFIRMED
  const agreeingObservations = observations.filter((o) => o.normalizedText === consensusText).length;
  let status: PlateRecognitionStatus = 'UNCERTAIN';

  if (consensusText.includes('?') || avgOcrConfidence < 0.40) {
    status = 'UNREADABLE';
  } else if (agreeingObservations >= 2 && avgOcrConfidence >= 0.75) {
    status = 'CONFIRMED';
  } else if (avgOcrConfidence >= 0.85) {
    status = 'CONFIRMED';
  } else if (avgOcrConfidence >= 0.65) {
    status = 'PROBABLE';
  } else {
    status = 'UNCERTAIN';
  }

  // Calculate average plate and association confidences across observations
  const avgPlateConf = observations.reduce((acc, o) => acc + o.plateConfidence, 0) / observations.length;
  const avgAssocConf = observations.reduce((acc, o) => acc + o.associationConfidence, 0) / observations.length;

  const overallConfidence = Number(
    (0.25 * 0.95 + 0.25 * avgPlateConf + 0.35 * avgOcrConfidence + 0.15 * avgAssocConf).toFixed(4)
  );

  return {
    bestPlateText: consensusText,
    normalizedPlate: consensusText,
    ocrConfidence: avgOcrConfidence,
    overallConfidence,
    recognitionStatus: status,
    characterConsensus,
  };
}

/**
 * Updates or creates a persistent Vehicle ANPR Record with a new observation.
 */
export function updatePersistentVehicleRecord(
  existingRecord: PersistentVehicleAnprRecord | undefined,
  params: {
    vehicleTrackId: string;
    cameraId: string;
    cameraIdentifier: string;
    vehicleClass: VehicleClass;
    vehicleConfidence: number;
    plate: PlateDetection;
    ocr: OcrResult;
    association: VehiclePlateAssociation;
    spatialContext?: PersistentVehicleAnprRecord['spatialContext'];
    evidenceReference?: PersistentVehicleAnprRecord['evidenceReference'];
    isSimulation?: boolean;
  }
): {
  record: PersistentVehicleAnprRecord;
  hasRecognitionChanged: boolean;
  isNewlyConfirmed: boolean;
} {
  const {
    vehicleTrackId,
    cameraId,
    cameraIdentifier,
    vehicleClass,
    vehicleConfidence,
    plate,
    ocr,
    association,
    spatialContext,
    evidenceReference,
    isSimulation,
  } = params;

  const newObservation: PlateObservation = {
    observationId: `obs-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    frameReference: plate.frameReference,
    timestamp: plate.timestamp,
    plateDetectionId: plate.plateDetectionId,
    rawText: ocr.rawText,
    normalizedText: ocr.normalizedText,
    plateConfidence: plate.confidence,
    ocrConfidence: ocr.confidence,
    associationConfidence: association.associationConfidence,
    characterSequence: ocr.characterSequence,
    boundingBox: plate.boundingBox,
    recognitionStatus: ocr.status,
  };

  const observations = existingRecord ? [...existingRecord.observations, newObservation] : [newObservation];

  // Limit observations history to 50 items per track
  if (observations.length > 50) {
    observations.shift();
  }

  // Compute multi-frame consensus
  const consensus = computeMultiFrameConsensus(observations);

  const prevBest = existingRecord?.bestPlateText || '';
  const prevStatus = existingRecord?.recognitionStatus;

  const hasRecognitionChanged = !existingRecord || consensus.bestPlateText !== prevBest || consensus.recognitionStatus !== prevStatus;
  const isNewlyConfirmed = consensus.recognitionStatus === 'CONFIRMED' && prevStatus !== 'CONFIRMED';

  const updatedRecord: PersistentVehicleAnprRecord = {
    vehicleTrackId,
    cameraId,
    cameraIdentifier,
    vehicleClass,
    firstSeenAt: existingRecord?.firstSeenAt || plate.timestamp,
    lastSeenAt: plate.timestamp,
    observationCount: observations.length,
    bestPlateText: consensus.bestPlateText || ocr.rawText,
    rawPlateText: ocr.rawText,
    normalizedPlate: consensus.normalizedPlate,
    vehicleConfidence,
    plateDetectionConfidence: plate.confidence,
    ocrConfidence: consensus.ocrConfidence,
    associationConfidence: association.associationConfidence,
    overallConfidence: consensus.overallConfidence,
    recognitionStatus: consensus.recognitionStatus,
    observations,
    spatialContext: spatialContext || existingRecord?.spatialContext,
    evidenceReference: evidenceReference || existingRecord?.evidenceReference,
    isSimulation: isSimulation ?? existingRecord?.isSimulation,
  };

  return {
    record: updatedRecord,
    hasRecognitionChanged,
    isNewlyConfirmed,
  };
}
