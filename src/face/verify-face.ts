/**
 * IBVAP — Face Analytics Verification Test Suite
 *
 * Verifies all 12 core functional capabilities for the Face Analytics subsystem:
 * 1. Face detection object creation with required fields and model versioning
 * 2. Person-to-face spatial & temporal association
 * 3. Association rejection (category mismatch, spatial out-of-bounds, vertical misalignment)
 * 4. Optical quality assessment (GOOD, ACCEPTABLE, POOR, UNREADABLE states)
 * 5. Low-quality / unreadable handling without fabricating biometric identities
 * 6. Feature embedding reference model versioning and vector properties
 * 7. Watchlist matching (MATCHED state on similarity >= threshold)
 * 8. Ambiguous similarity handling (POSSIBLE_MATCH state for operator triage)
 * 9. Multi-frame consensus & progressive quality promotion
 * 10. Duplicate event emission suppression
 * 11. Spatial intelligence propagation (zoneId, fence, dwell duration)
 * 12. Complete deterministic scenarios (Scenarios A through G)
 */

import { FaceService } from './face-service';
import { FaceQualityEngine } from './quality';
import { PersonFaceAssociator } from './associator';
import { FaceMatcher, SYNTHETIC_FACE_WATCHLISTS, computeCosineSimilarity, generateSyntheticEmbedding } from './matcher';
import { FaceDetector } from './face-detector';
import {
  createSyntheticPersonTrack,
  createSyntheticFaceDetection,
  runScenarioA,
  runScenarioB,
  runScenarioC,
  runScenarioD,
  runScenarioE,
  runScenarioF,
  runScenarioG,
} from './scenarios';
import { Track } from '../tracking/types';

let totalAssertions = 0;
let passedAssertions = 0;

function assert(condition: boolean, message: string): void {
  totalAssertions++;
  if (!condition) {
    console.error(`❌ Assertion FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  passedAssertions++;
  console.log(`  ✓ ${message}`);
}

async function runFaceVerificationSuite() {
  console.log('\n=============================================================');
  console.log('  IBVAP FACE ANALYTICS VERIFICATION SUITE — 12 Core Capabilities');
  console.log('=============================================================\n');

  const faceService = new FaceService();

  // TEST 1: Face Detection Object Creation & Model Versioning
  console.log('[Test 1] Face Detection Object Creation & Model Versioning');
  const detector = new FaceDetector();
  const testTrack = createSyntheticPersonTrack({
    trackId: 'PER-CAM-01-0010',
    cameraId: 'CAM-01',
  });
  const faceDet = detector.extractFaceFromPersonTrack(testTrack);
  assert(faceDet !== null, 'Detector successfully extracted face from person track');
  assert(faceDet!.faceDetectionId.startsWith('FACE-CAM-01-'), 'Face detection has standardized ID');
  assert(faceDet!.modelVersion === 'YOLOS-Face-v2', 'Face detection includes model version metadata');
  assert(faceDet!.confidence >= 0.50, 'Confidence meets threshold');
  assert(faceDet!.boundingBox.width > 0 && faceDet!.boundingBox.height > 0, 'Bounding box dimensions are valid');

  // TEST 2: Person-to-Face Spatial & Temporal Association
  console.log('\n[Test 2] Person-to-Face Spatial & Temporal Association');
  const associator = new PersonFaceAssociator();
  const assoc = associator.evaluateAssociation(faceDet!, testTrack);
  assert(assoc.isValid === true, 'Association between face and person track is valid');
  assert(assoc.containmentRatio >= 0.80, 'Face is contained within person upper body');
  assert(assoc.verticalRatio <= 0.40, 'Face is located in upper anatomical region of person');
  assert(assoc.associationConfidence >= 0.70, 'Association confidence score is high');

  // TEST 3: Association Rejection Gating
  console.log('\n[Test 3] Association Rejection Gating');
  // 3a. Category mismatch (associating face to a vehicle track)
  const vehicleTrack: Track = {
    trackId: 'VEH-CAM-01-0005',
    numericId: 5,
    cameraId: 'CAM-01',
    objectType: 'vehicle',
    class: 'car',
    createdAt: new Date().toISOString(),
    firstSeenAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    lastBoundingBox: { x: 0.2, y: 0.3, width: 0.3, height: 0.2 },
    trajectory: [],
    detectionCount: 2,
    missedFrames: 0,
    currentConfidence: 0.95,
    state: 'ACTIVE',
    direction: 'EAST',
    dwellTimeSeconds: 3.0,
    contributingDetectionIds: [],
    modelVersion: 'v1',
  };
  const vehAssoc = associator.evaluateAssociation(faceDet!, vehicleTrack);
  assert(vehAssoc.isValid === false, 'Rejected face association with vehicle track');
  assert(vehAssoc.rejectionReason!.includes('Category mismatch'), 'Explicit category rejection reason reported');

  // 3b. Spatial out-of-bounds rejection
  const outOfBoundsFace = {
    ...faceDet!,
    boundingBox: { x: 0.85, y: 0.85, width: 0.05, height: 0.05 },
  };
  const outAssoc = associator.evaluateAssociation(outOfBoundsFace, testTrack);
  assert(outAssoc.isValid === false, 'Rejected face completely outside person bounding box');

  // 3c. Anatomical vertical position rejection (face placed at feet/bottom of person)
  const feetFace = {
    ...faceDet!,
    boundingBox: {
      x: testTrack.lastBoundingBox.x + testTrack.lastBoundingBox.width * 0.3,
      y: testTrack.lastBoundingBox.y + testTrack.lastBoundingBox.height * 0.80, // 80% down body
      width: 0.04,
      height: 0.05,
    },
  };
  const feetAssoc = associator.evaluateAssociation(feetFace, testTrack);
  assert(feetAssoc.isValid === false, 'Rejected face placed at feet/lower body');
  assert(feetAssoc.rejectionReason!.includes('Anatomical vertical misalignment'), 'Anatomical vertical misalignment reason');

  // TEST 4: Optical Quality Assessment (GOOD, ACCEPTABLE, POOR, UNREADABLE)
  console.log('\n[Test 4] Optical Quality Assessment Engine');
  const qualityEngine = new FaceQualityEngine();

  // 4a. High quality evaluation
  const goodQuality = qualityEngine.evaluateQuality({
    boundingBox: { x: 0.4, y: 0.2, width: 0.08, height: 0.10 },
    detectorConfidence: 0.95,
    sharpnessScore: 0.92,
    luminanceScore: 0.80,
    yawDegrees: 2.0,
  });
  assert(goodQuality.qualityState === 'GOOD', 'Good quality face classified correctly');
  assert(goodQuality.score >= 0.80, 'Good quality composite score is >= 0.80');
  assert(goodQuality.blur.isSharp === true, 'Good quality face marked sharp');

  // 4b. Poor quality due to severe motion blur & extreme angle
  const poorQuality = qualityEngine.evaluateQuality({
    boundingBox: { x: 0.4, y: 0.2, width: 0.05, height: 0.06 },
    detectorConfidence: 0.70,
    sharpnessScore: 0.40,
    yawDegrees: 48.0,
  });
  assert(poorQuality.qualityState === 'POOR', 'Blurry and profile face classified as POOR');
  assert(poorQuality.reasons.length > 0, 'Diagnostic degradation reasons provided');

  // 4c. Unreadable due to extreme blur and severe undersize
  const unreadableQuality = qualityEngine.evaluateQuality({
    boundingBox: { x: 0.4, y: 0.2, width: 0.012, height: 0.015 },
    pixelBox: { xmin: 0, xmax: 20, ymin: 0, ymax: 24, width: 20, height: 24 },
    detectorConfidence: 0.40,
    sharpnessScore: 0.15,
  });
  assert(unreadableQuality.qualityState === 'UNREADABLE', 'Undersized and blurred face classified as UNREADABLE');

  // TEST 5: Low-Quality / Unreadable Handling Without Fabricating Biometrics
  console.log('\n[Test 5] Quality Gating Without Biometric Fabrication');
  const matcher = new FaceMatcher();
  const unreadableMatch = matcher.evaluateMatch(unreadableQuality);
  assert(unreadableMatch.recognitionStatus === 'UNREADABLE', 'Unreadable quality returns UNREADABLE status');
  assert(unreadableMatch.isWatchlistMatch === false, 'No watchlist match fabricated for unreadable face');

  const poorMatch = matcher.evaluateMatch(poorQuality);
  assert(poorMatch.recognitionStatus === 'LOW_QUALITY', 'Poor quality returns LOW_QUALITY status');
  assert(poorMatch.isWatchlistMatch === false, 'No biometric match fabricated for low quality face');

  // TEST 6: Feature Embedding Model Versioning and Cosine Math
  console.log('\n[Test 6] Feature Embedding Vector Math & Model Versioning');
  const vecA = generateSyntheticEmbedding('template-sample-A');
  const vecB = generateSyntheticEmbedding('template-sample-A');
  const vecC = generateSyntheticEmbedding('template-sample-B');
  assert(vecA.length === 128, 'Generated embedding vector length is 128');
  const selfSim = computeCosineSimilarity(vecA, vecB);
  assert(Math.abs(selfSim - 1.0) < 0.001, 'Self-similarity is 1.0');
  const diffSim = computeCosineSimilarity(vecA, vecC);
  assert(diffSim < 0.80, 'Distinct templates produce non-matching similarity score');

  // TEST 7: Synthetic Watchlist Match (Confirmed)
  console.log('\n[Test 7] Synthetic Watchlist Match Confirmed');
  const targetWl = SYNTHETIC_FACE_WATCHLISTS[0];
  const matchResult = matcher.evaluateMatch(goodQuality, {
    templateId: targetWl.faceTemplateId,
    similarityOverride: 0.89,
  });
  assert(matchResult.recognitionStatus === 'MATCHED', 'Status is MATCHED for similarity 0.89 >= threshold');
  assert(matchResult.isWatchlistMatch === true, 'isWatchlistMatch flag is true');
  assert(matchResult.matchedWatchlistEntry?.id === targetWl.id, 'Matched correct synthetic watchlist entry');

  // TEST 8: Ambiguous Similarity Handling (POSSIBLE_MATCH)
  console.log('\n[Test 8] Ambiguous Similarity Handling (POSSIBLE_MATCH)');
  const ambigResult = matcher.evaluateMatch(goodQuality, {
    templateId: targetWl.faceTemplateId,
    similarityOverride: 0.74, // between 0.70 and 0.82
  });
  assert(ambigResult.recognitionStatus === 'POSSIBLE_MATCH', 'Ambiguous similarity returns POSSIBLE_MATCH');
  assert(ambigResult.isWatchlistMatch === false, 'isWatchlistMatch remains false for ambiguous match');

  // TEST 9: Multi-Frame Consensus & Progressive Quality Promotion
  console.log('\n[Test 9] Multi-Frame Consensus & Quality Promotion');
  const sE = runScenarioE();
  assert(sE.res1.quality.qualityState === 'POOR', 'Frame 1 was POOR');
  assert(sE.res2.quality.qualityState === 'ACCEPTABLE', 'Frame 2 was ACCEPTABLE');
  assert(sE.res3.quality.qualityState === 'GOOD', 'Frame 3 was GOOD');
  assert(sE.finalRecord.bestQuality === 'GOOD', 'Consensus promoted record to best quality (GOOD)');
  assert(sE.finalRecord.observationsCount === 3, 'Total 3 observations recorded under same Person Track ID');

  // TEST 10: Duplicate Event Emission Suppression
  console.log('\n[Test 10] Structured Events & Duplicate Emission Suppression');
  const cleanService = new FaceService();
  const emittedEvents: string[] = [];
  cleanService.onFaceEvent((evt) => {
    emittedEvents.push(evt.eventType);
  });

  const pTrack = createSyntheticPersonTrack({
    trackId: 'PER-TEST-EVT-01',
    cameraId: 'CAM-01',
  });
  const faceObs1 = createSyntheticFaceDetection({
    faceDetectionId: 'FACE-EVT-01',
    cameraId: 'CAM-01',
    personTrack: pTrack,
  });

  // Observation 1 -> emits face.detected
  cleanService.ingestObservation({ personTrack: pTrack, face: faceObs1 });
  assert(emittedEvents.includes('face.detected'), 'First observation dispatched face.detected event');

  // Observation 2 with identical UNKNOWN and GOOD quality state -> suppressed
  const initialCount = emittedEvents.length;
  cleanService.ingestObservation({ personTrack: pTrack, face: faceObs1 });
  assert(emittedEvents.length === initialCount, 'Identical observation duplicate suppressed');

  // TEST 11: Spatial Context Propagation
  console.log('\n[Test 11] Spatial Intelligence Context Propagation');
  const sF = runScenarioF();
  assert(sF.record.spatialContext?.zoneId === 'zone-b1', 'Zone ID propagated to face record');
  assert(sF.record.spatialContext?.isRestricted === true, 'Restricted zone status propagated');
  assert(sF.record.spatialContext?.sectorName === 'Sector Bravo', 'Sector Bravo context propagated');
  assert(sF.record.isWatchlistMatch === true, 'Scenario F confirmed watchlist match');

  // TEST 12: Execution of All Scenarios (A through G)
  console.log('\n[Test 12] Complete Scenario Suite Execution');
  const resA = runScenarioA();
  assert(resA.record.recognitionStatus === 'UNKNOWN', 'Scenario A: Normal person UNKNOWN');

  const resB = runScenarioB();
  assert(resB.record.bestQuality === 'POOR', 'Scenario B: Low quality POOR');

  const resC = runScenarioC();
  assert(resC.res1.record.personTrackId !== resC.res2.record.personTrackId, 'Scenario C: Distinct Person Track IDs');
  assert(resC.res1.record.primaryFaceDetectionId !== resC.res2.record.primaryFaceDetectionId, 'Scenario C: Distinct face detections');

  const resD = runScenarioD();
  assert(resD.totalObservations === 2, 'Scenario D: 2 face observations around temporary occlusion');
  assert(resD.person.detectionCount === 3, 'Scenario D: Person track continued through occlusion');

  const resG = runScenarioG();
  assert(resG.record.recognitionStatus === 'POSSIBLE_MATCH', 'Scenario G: Ambiguous match marked POSSIBLE_MATCH');

  console.log('\n=============================================================');
  console.log(`  FACE VERIFICATION SUCCESS: ${passedAssertions}/${totalAssertions} Assertions Passed!`);
  console.log('=============================================================\n');
}

runFaceVerificationSuite().catch((err) => {
  console.error('Verification failed with error:', err);
  process.exit(1);
});
