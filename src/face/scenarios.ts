/**
 * IBVAP — Deterministic Face Analytics Test & Verification Scenarios
 *
 * Provides repeatable scenario runners for verifying all required functional capabilities:
 * - Scenario A: Single high-quality face observation (unflagged person)
 * - Scenario B: Low-quality / blurred face (no fabricated match)
 * - Scenario C: Multiple faces linked to separate Person Track IDs
 * - Scenario D: Temporary face occlusion while Person Track remains active
 * - Scenario E: Progressive multi-frame quality improvement
 * - Scenario F: Synthetic watchlist match confirmed (POI match)
 * - Scenario G: Ambiguous biometric similarity (operator review)
 */

import { BoundingBox } from '../ai-inference/types';
import { Track } from '../tracking/types';
import { FaceService } from './face-service';
import { FaceDetection } from './types';
import { SYNTHETIC_FACE_WATCHLISTS } from './matcher';

export function createSyntheticPersonTrack(params: {
  trackId: string;
  cameraId: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  confidence?: number;
  lastSeenAt?: string;
}): Track {
  const x = params.x ?? 0.35;
  const y = params.y ?? 0.20;
  const width = params.width ?? 0.12;
  const height = params.height ?? 0.45;
  const now = params.lastSeenAt ?? new Date().toISOString();

  return {
    trackId: params.trackId,
    numericId: parseInt(params.trackId.replace(/\D/g, ''), 10) || 101,
    cameraId: params.cameraId,
    objectType: 'person',
    class: 'person',
    createdAt: now,
    firstSeenAt: now,
    lastSeenAt: now,
    lastBoundingBox: { x, y, width, height },
    lastPixelBox: {
      xmin: Math.round(x * 1920),
      xmax: Math.round((x + width) * 1920),
      ymin: Math.round(y * 1080),
      ymax: Math.round((y + height) * 1080),
      width: Math.round(width * 1920),
      height: Math.round(height * 1080),
    },
    trajectory: [
      {
        x: x + width / 2,
        y: y + height / 2,
        centerX: x + width / 2,
        centerY: y + height / 2,
        timestamp: now,
      },
    ],
    detectionCount: 1,
    missedFrames: 0,
    currentConfidence: params.confidence ?? 0.92,
    state: 'ACTIVE',
    direction: 'SOUTH',
    dwellTimeSeconds: 4.5,
    contributingDetectionIds: [`det-${params.trackId}-01`],
    modelVersion: 'YOLOv8x-Border-v3',
    isSimulation: true,
  };
}

export function createSyntheticFaceDetection(params: {
  faceDetectionId: string;
  cameraId: string;
  personTrack: Track;
  confidence?: number;
  boundingBox?: BoundingBox;
}): FaceDetection {
  const tb = params.personTrack.lastBoundingBox;
  const headWidth = tb.width * 0.44;
  const headHeight = tb.height * 0.20;
  const headX = tb.x + (tb.width - headWidth) / 2;
  const headY = tb.y + tb.height * 0.03;

  const box: BoundingBox = params.boundingBox || {
    x: headX,
    y: headY,
    width: headWidth,
    height: headHeight,
  };

  return {
    faceDetectionId: params.faceDetectionId,
    cameraId: params.cameraId,
    cameraIdentifier: params.cameraId,
    personTrackId: params.personTrack.trackId,
    boundingBox: box,
    pixelBox: {
      xmin: Math.round(box.x * 1920),
      xmax: Math.round((box.x + box.width) * 1920),
      ymin: Math.round(box.y * 1080),
      ymax: Math.round((box.y + box.height) * 1080),
      width: Math.round(box.width * 1920),
      height: Math.round(box.height * 1080),
    },
    confidence: params.confidence ?? 0.94,
    timestamp: params.personTrack.lastSeenAt,
    modelVersion: 'YOLOS-Face-v2',
    isSimulation: true,
  };
}

/**
 * Scenario A: Single High-Quality Face Observation
 * Clear, sharp, frontal face associated with active person track; no watchlist hit.
 */
export function runScenarioA(service: FaceService = new FaceService()) {
  const person = createSyntheticPersonTrack({
    trackId: 'PER-CAM-01-0042',
    cameraId: 'CAM-01',
    x: 0.40,
    y: 0.25,
    width: 0.14,
    height: 0.50,
  });

  const face = createSyntheticFaceDetection({
    faceDetectionId: 'FACE-CAM-01-0042-01',
    cameraId: 'CAM-01',
    personTrack: person,
  });

  const result = service.ingestObservation({
    personTrack: person,
    face,
    qualityOverrides: {
      sharpnessScore: 0.92,
      luminanceScore: 0.85,
      yawDegrees: 2.0,
      pitchDegrees: -1.5,
      occlusionScore: 0.02,
    },
    spatialContext: {
      zoneId: 'zone-b1',
      zoneName: 'Primary Perimeter Buffer North',
      dwellTimeSeconds: 4.5,
      sectorId: 'sec-bravo',
      sectorName: 'Sector Bravo',
    },
  });

  return { person, face, ...result };
}

/**
 * Scenario B: Low-Quality / Blurred Face
 * Defocused optical capture or high motion blur; system flags LOW_QUALITY / POOR without fabricating identity.
 */
export function runScenarioB(service: FaceService = new FaceService()) {
  const person = createSyntheticPersonTrack({
    trackId: 'PER-CAM-02-0089',
    cameraId: 'CAM-02',
    x: 0.55,
    y: 0.30,
    width: 0.10,
    height: 0.40,
  });

  const face = createSyntheticFaceDetection({
    faceDetectionId: 'FACE-CAM-02-0089-01',
    cameraId: 'CAM-02',
    personTrack: person,
  });

  const result = service.ingestObservation({
    personTrack: person,
    face,
    qualityOverrides: {
      sharpnessScore: 0.42, // motion blur
      luminanceScore: 0.48, // marginal light
      yawDegrees: 35.0, // profile angle
      occlusionScore: 0.25,
      reasons: ['Defocus blur from thermal lens transition', 'Severe motion vector artifact'],
    },
  });

  return { person, face, ...result };
}

/**
 * Scenario C: Multiple distinct persons with separate Person Track IDs
 * Two individuals walking together; each maintains its own independent Face Record and Person Track ID.
 */
export function runScenarioC(service: FaceService = new FaceService()) {
  const person1 = createSyntheticPersonTrack({
    trackId: 'PER-CAM-05-0101',
    cameraId: 'CAM-05',
    x: 0.20,
    y: 0.22,
    width: 0.12,
    height: 0.48,
  });

  const person2 = createSyntheticPersonTrack({
    trackId: 'PER-CAM-05-0102',
    cameraId: 'CAM-05',
    x: 0.60,
    y: 0.24,
    width: 0.13,
    height: 0.46,
  });

  const face1 = createSyntheticFaceDetection({
    faceDetectionId: 'FACE-CAM-05-0101-01',
    cameraId: 'CAM-05',
    personTrack: person1,
  });

  const face2 = createSyntheticFaceDetection({
    faceDetectionId: 'FACE-CAM-05-0102-01',
    cameraId: 'CAM-05',
    personTrack: person2,
  });

  const res1 = service.ingestObservation({
    personTrack: person1,
    face: face1,
    qualityOverrides: { sharpnessScore: 0.88, luminanceScore: 0.80 },
  });

  const res2 = service.ingestObservation({
    personTrack: person2,
    face: face2,
    qualityOverrides: { sharpnessScore: 0.86, luminanceScore: 0.78 },
  });

  return { person1, person2, face1, face2, res1, res2 };
}

/**
 * Scenario D: Temporary Face Occlusion
 * Person track continues across 3 frames: Frame 1 face visible, Frame 2 face occluded (no face), Frame 3 face re-acquired.
 */
export function runScenarioD(service: FaceService = new FaceService()) {
  const person = createSyntheticPersonTrack({
    trackId: 'PER-CAM-06-0314',
    cameraId: 'CAM-06',
    x: 0.42,
    y: 0.20,
  });

  // Frame 1: Face detected
  const faceFrame1 = createSyntheticFaceDetection({
    faceDetectionId: 'FACE-CAM-06-0314-F1',
    cameraId: 'CAM-06',
    personTrack: person,
  });
  const res1 = service.ingestObservation({
    personTrack: person,
    face: faceFrame1,
    qualityOverrides: { sharpnessScore: 0.85 },
  });

  // Frame 2: Person track advances, face occluded by foliage/hat (no face ingested; person track state stays ACTIVE)
  person.lastSeenAt = new Date(Date.now() + 500).toISOString();
  person.detectionCount++;
  person.dwellTimeSeconds += 0.5;

  // Frame 3: Face re-acquired
  person.lastSeenAt = new Date(Date.now() + 1000).toISOString();
  person.detectionCount++;
  person.dwellTimeSeconds += 0.5;

  const faceFrame3 = createSyntheticFaceDetection({
    faceDetectionId: 'FACE-CAM-06-0314-F3',
    cameraId: 'CAM-06',
    personTrack: person,
  });
  const res3 = service.ingestObservation({
    personTrack: person,
    face: faceFrame3,
    qualityOverrides: { sharpnessScore: 0.89 },
  });

  return { person, res1, res3, totalObservations: res3.record.observationsCount };
}

/**
 * Scenario E: Progressive Multi-Frame Quality Improvement
 * Frame 1: POOR (distant / blurred), Frame 2: ACCEPTABLE, Frame 3: GOOD (approached camera).
 * Consensus promotes best quality and elevates metrics.
 */
export function runScenarioE(service: FaceService = new FaceService()) {
  const person = createSyntheticPersonTrack({
    trackId: 'PER-CAM-01-0777',
    cameraId: 'CAM-01',
    x: 0.45,
    y: 0.28,
  });

  // Frame 1: Poor quality
  const face1 = createSyntheticFaceDetection({
    faceDetectionId: 'FACE-CAM-01-0777-F1',
    cameraId: 'CAM-01',
    personTrack: person,
  });
  const res1 = service.ingestObservation({
    personTrack: person,
    face: face1,
    qualityOverrides: { sharpnessScore: 0.45, luminanceScore: 0.40, yawDegrees: 30 },
  });

  // Frame 2: Acceptable quality
  const face2 = createSyntheticFaceDetection({
    faceDetectionId: 'FACE-CAM-01-0777-F2',
    cameraId: 'CAM-01',
    personTrack: person,
  });
  const res2 = service.ingestObservation({
    personTrack: person,
    face: face2,
    qualityOverrides: { sharpnessScore: 0.68, luminanceScore: 0.70, yawDegrees: 15 },
  });

  // Frame 3: Good quality
  const face3 = createSyntheticFaceDetection({
    faceDetectionId: 'FACE-CAM-01-0777-F3',
    cameraId: 'CAM-01',
    personTrack: person,
  });
  const res3 = service.ingestObservation({
    personTrack: person,
    face: face3,
    qualityOverrides: { sharpnessScore: 0.94, luminanceScore: 0.85, yawDegrees: 2 },
  });

  return { person, res1, res2, res3, finalRecord: res3.record };
}

/**
 * Scenario F: Synthetic Watchlist Match Confirmed
 * Matches synthetic subject Victor Ramos (WL-FACE-01) with high similarity (0.91 >= 0.82 threshold).
 */
export function runScenarioF(service: FaceService = new FaceService()) {
  const targetWl = SYNTHETIC_FACE_WATCHLISTS[0]; // Victor Ramos

  const person = createSyntheticPersonTrack({
    trackId: 'PER-CAM-01-0999',
    cameraId: 'CAM-01',
    x: 0.38,
    y: 0.22,
    width: 0.14,
    height: 0.52,
  });

  const face = createSyntheticFaceDetection({
    faceDetectionId: 'FACE-CAM-01-0999-MATCH',
    cameraId: 'CAM-01',
    personTrack: person,
  });

  const result = service.ingestObservation({
    personTrack: person,
    face,
    qualityOverrides: {
      sharpnessScore: 0.95,
      luminanceScore: 0.88,
      yawDegrees: 3.0,
      pitchDegrees: 0,
      occlusionScore: 0.0,
    },
    embeddingOverrides: {
      templateId: targetWl.faceTemplateId,
      similarityOverride: 0.912,
    },
    spatialContext: {
      zoneId: 'zone-b1',
      zoneName: 'Primary Perimeter Buffer North',
      isRestricted: true,
      lastFenceCrossed: 'ZB-RESTRICTED-01',
      dwellTimeSeconds: 12.4,
      sectorId: 'sec-bravo',
      sectorName: 'Sector Bravo',
      direction: 'SOUTH',
    },
    evidenceReference: {
      evidenceId: 'EVD-FACE-SYNTH-0999',
      frameReference: 'FRAME-CAM-01-88192',
      cropUrl: targetWl.thumbnailUrl,
    },
  });

  return { person, face, targetWl, ...result };
}

/**
 * Scenario G: Ambiguous Biometric Similarity
 * Similarity is 0.73 (between 0.70 possible threshold and 0.82 confirmed threshold);
 * triggers POSSIBLE_MATCH without false positive confirmation.
 */
export function runScenarioG(service: FaceService = new FaceService()) {
  const targetWl = SYNTHETIC_FACE_WATCHLISTS[1]; // Elena Rostova

  const person = createSyntheticPersonTrack({
    trackId: 'PER-CAM-03-0555',
    cameraId: 'CAM-03',
    x: 0.44,
    y: 0.26,
  });

  const face = createSyntheticFaceDetection({
    faceDetectionId: 'FACE-CAM-03-0555-AMBIG',
    cameraId: 'CAM-03',
    personTrack: person,
  });

  const result = service.ingestObservation({
    personTrack: person,
    face,
    qualityOverrides: {
      sharpnessScore: 0.82,
      luminanceScore: 0.76,
      yawDegrees: 18.0, // slight angle
    },
    embeddingOverrides: {
      templateId: targetWl.faceTemplateId,
      similarityOverride: 0.735, // ambiguous between 0.70 and 0.84
    },
    spatialContext: {
      zoneId: 'zone-b2',
      zoneName: 'Ridge Virtual Boundary Line East',
      sectorId: 'sec-bravo',
      sectorName: 'Sector Bravo',
    },
  });

  return { person, face, targetWl, ...result };
}
