/**
 * IBVAP — ANPR Verification Test Suite
 *
 * Verifies all 14 core functional capabilities specified in the ANPR requirements:
 * 1. Plate detection object creation with required fields
 * 2. OCR normalization (uppercase, whitespace, separator removal, preserving raw & normalized)
 * 3. Low-confidence recognition handling (marking UNCERTAIN/UNREADABLE, no fabricated identity)
 * 4. Plate-to-vehicle association (containment and spatial proximity gating)
 * 5. Incorrect association rejection (out-of-bounds containment, temporal mismatch, category mismatch)
 * 6. Multi-frame consensus (temporal voting: TS09AB12?4 + TS09AB1234 -> TS09AB1234)
 * 7. Duplicate suppression (no redundant event spam for unchanged reads)
 * 8. Track ID persistence (multiple observations aggregate under same VEH track ID)
 * 9. Multiple vehicles with distinct plates in same scene
 * 10. Unreadable plate handling
 * 11. ANPR structured event generation (anpr.plate.detected, anpr.recognition.confirmed, etc.)
 * 12. Spatial context propagation (zoneId, fenceCrossing, dwellDuration)
 * 13. Search behavior and query filtering
 * 14. Deterministic synthetic scenarios (SCENARIO_A through SCENARIO_E)
 */

import { AnprService } from './anpr-service';
import { normalizePlateText } from './normalizer';
import { PlateDetector } from './plate-detector';
import { OcrEngine } from './ocr-engine';
import { VehiclePlateAssociator } from './associator';
import {
  createSyntheticPlateDetection,
  createSyntheticVehicleTrack,
  runScenarioA,
  runScenarioB,
  runScenarioC,
  runScenarioD,
  runScenarioE,
} from './scenarios';

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

async function runAnprVerificationSuite() {
  console.log('\n=============================================================');
  console.log('  IBVAP ANPR VERIFICATION SUITE — 14 Functional Capabilities');
  console.log('=============================================================\n');

  const anpr = new AnprService();

  // TEST 1: Plate Detection Object Creation
  console.log('[Test 1] Plate Detection Object Creation');
  const detector = new PlateDetector();
  const testTrack = createSyntheticVehicleTrack({
    trackId: 'VEH-CAM-09-0001',
    cameraId: 'CAM-09',
    vehicleClass: 'CAR',
    x: 0.20,
    y: 0.30,
    width: 0.40,
    height: 0.30,
  });

  const plateDet = detector.detectPlateInVehicle(
    {
      detectionId: 'det-v-1',
      cameraId: 'CAM-09',
      frameReference: 'frame-test-01',
      modelVersion: 'YOLOS-tiny',
      timestamp: testTrack.lastSeenAt,
      inferenceTimestamp: testTrack.lastSeenAt,
      objectType: 'vehicle',
      vehicleClass: 'CAR',
      class: 'CAR',
      confidence: 0.94,
      boundingBox: testTrack.lastBoundingBox,
    },
    { width: 1920, height: 1080, timestamp: testTrack.lastSeenAt, sequenceNumber: 101 },
    { vehicleTrackId: testTrack.trackId }
  );

  assert(plateDet !== null, 'Plate detector creates plate candidate for valid vehicle');
  assert(plateDet!.plateDetectionId.startsWith('pld-'), 'plateDetectionId has standard prefix');
  assert(plateDet!.cameraId === 'CAM-09', 'plate detection preserves cameraId');
  assert(plateDet!.vehicleTrackId === 'VEH-CAM-09-0001', 'plate detection preserves vehicleTrackId');
  assert(plateDet!.confidence >= 0.70, 'plate detection confidence is above minimum threshold');
  assert(plateDet!.boundingBox.width > 0 && plateDet!.boundingBox.height > 0, 'valid normalized bounding box');

  // TEST 2: OCR Normalization
  console.log('\n[Test 2] OCR Normalization Layer');
  const norm1 = normalizePlateText(' ts-09 ab 1234 ');
  assert(norm1.rawText === 'ts-09 ab 1234', 'rawText preserves original casing and spacing');
  assert(norm1.normalizedText === 'TS09AB1234', 'normalizedText is uppercase, no spaces, no dashes');
  assert(norm1.hasPunctuationRemoved === true, 'detects punctuation removal');
  assert(norm1.isValidLength === true, 'valid length flag is true for 10 characters');

  const norm2 = normalizePlateText('AZ.982_FX/1');
  assert(norm2.normalizedText === 'AZ982FX1', 'strips dots, underscores, slashes');

  // TEST 3: Low-Confidence Recognition Handling
  console.log('\n[Test 3] Low-Confidence Recognition Handling');
  const ocr = new OcrEngine();
  const ocrLow = ocr.recognizePlate(plateDet!, {
    rawText: '??44??',
    confidence: 0.35,
  });
  assert(ocrLow.status === 'UNREADABLE', 'very low confidence marked UNREADABLE');
  assert(ocrLow.rawText === '??44??', 'retains raw unreadable text without fabricating characters');

  const ocrUncertain = ocr.recognizePlate(plateDet!, {
    rawText: 'TS09AB1234',
    confidence: 0.52,
  });
  assert(ocrUncertain.status === 'UNCERTAIN', 'moderate-low confidence marked UNCERTAIN');

  // TEST 4: Vehicle-Plate Association (Valid Containment & Gating)
  console.log('\n[Test 4] Vehicle-Plate Association Gating');
  const associator = new VehiclePlateAssociator();
  const validAssoc = associator.evaluateAssociation(plateDet!, testTrack);
  assert(validAssoc.isValid === true, 'Association passes when plate is inside vehicle');
  assert(validAssoc.containmentRatio >= 0.70, 'Containment ratio is high (> 0.70)');
  assert(validAssoc.associationConfidence >= 0.80, 'Association confidence is high');

  // TEST 5: Incorrect Association Rejection
  console.log('\n[Test 5] Incorrect Association Rejection');
  const outsidePlate = {
    ...plateDet!,
    plateDetectionId: 'pld-outside',
    boundingBox: { x: 0.85, y: 0.85, width: 0.08, height: 0.03 }, // Far outside vehicle box
  };
  const rejectedAssoc = associator.evaluateAssociation(outsidePlate, testTrack);
  assert(rejectedAssoc.isValid === false, 'Association rejected when plate is outside vehicle');
  assert(Boolean(rejectedAssoc.rejectionReason), 'Provides explicit rejection diagnostic reason');

  const personTrack = { ...testTrack, objectType: 'person' as const };
  const personAssoc = associator.evaluateAssociation(plateDet!, personTrack);
  assert(personAssoc.isValid === false, 'Rejects association with person track');

  // TEST 6: Multi-Frame Consensus
  console.log('\n[Test 6] Multi-Frame Consensus');
  anpr.reset();
  const scenarioEResult = runScenarioE(anpr);
  assert(scenarioEResult.assertionsPass, 'Scenario E multi-frame consensus passes');
  const consensusRecord = scenarioEResult.records[0];
  assert(consensusRecord.normalizedPlate === 'TS09AB1234', 'Consensus resolves partial obstruction TS09AB12?4 -> TS09AB1234');
  assert(consensusRecord.observationCount === 3, 'Observation count accurately tracks 3 frames');
  assert(consensusRecord.recognitionStatus === 'CONFIRMED', 'Consensus elevates status to CONFIRMED');

  // TEST 7: Duplicate Event Suppression
  console.log('\n[Test 7] Duplicate Event Suppression');
  let eventCount = 0;
  anpr.onAnprEvent(() => {
    eventCount++;
  });

  const trackDup = createSyntheticVehicleTrack({
    trackId: 'VEH-CAM-09-0099',
    cameraId: 'CAM-09',
  });
  const plateDup = createSyntheticPlateDetection({
    plateDetectionId: 'pld-dup-1',
    vehicleTrack: trackDup,
  });

  // First observation emits detected + associated + recognition
  anpr.ingestObservation({
    vehicleTrack: trackDup,
    plate: plateDup,
    rawOcrText: 'TX-802-KL',
    ocrConfidence: 0.92,
  });
  const initialEvents = eventCount;
  assert(initialEvents >= 2, 'First observation emits structured creation events');

  // Second observation with IDENTICAL read and confirmed status
  const plateDup2 = createSyntheticPlateDetection({
    plateDetectionId: 'pld-dup-2',
    vehicleTrack: trackDup,
  });
  anpr.ingestObservation({
    vehicleTrack: trackDup,
    plate: plateDup2,
    rawOcrText: 'TX-802-KL',
    ocrConfidence: 0.94,
  });
  // Should NOT emit another recognition event because status and plate text have not changed
  assert(eventCount === initialEvents, 'Suppressed duplicate recognition event when read is unchanged');

  // TEST 8: Track ID Persistence
  console.log('\n[Test 8] Track ID Persistence');
  const persisted = anpr.getRecordByTrackId('VEH-CAM-09-0099');
  assert(persisted !== undefined, 'Record accessible by vehicle Track ID');
  assert(persisted!.vehicleTrackId === 'VEH-CAM-09-0099', 'Vehicle Track ID is preserved');
  assert(persisted!.observationCount === 2, 'Aggregate history linked to same vehicle track');

  // TEST 9: Multiple Vehicles with Multiple Plates
  console.log('\n[Test 9] Multiple Concurrent Vehicles with Distinct Plates');
  anpr.reset();
  const scenarioCResult = runScenarioC(anpr);
  assert(scenarioCResult.assertionsPass, 'Scenario C passes for two distinct vehicles');
  assert(anpr.getRecordByTrackId('VEH-CAM-09-0031')?.normalizedPlate === 'AZ982FX', 'Vehicle 1 has AZ982FX');
  assert(anpr.getRecordByTrackId('VEH-CAM-09-0032')?.normalizedPlate === 'NM441BP', 'Vehicle 2 has NM441BP');

  // TEST 10: Unreadable Plate Handling
  console.log('\n[Test 10] Unreadable Plate Handling');
  const scenarioBResult = runScenarioB(anpr);
  assert(scenarioBResult.assertionsPass, 'Scenario B properly handles low-confidence unreadable plate');
  const unreadableRec = scenarioBResult.records[0];
  assert(unreadableRec.recognitionStatus === 'UNCERTAIN' || unreadableRec.recognitionStatus === 'UNREADABLE', 'Unreadable plate marked truthfully');

  // TEST 11: Structured ANPR Events
  console.log('\n[Test 11] Structured ANPR Events');
  const events = anpr.getEvents();
  assert(events.length > 0, 'Structured events stored in event history');
  const sampleEvent = events[0];
  assert(Boolean(sampleEvent.eventId), 'Event contains eventId');
  assert(Boolean(sampleEvent.eventType), 'Event contains eventType');
  assert(Boolean(sampleEvent.vehicleTrackId), 'Event preserves vehicleTrackId');
  assert(sampleEvent.confidence.plate !== undefined, 'Event contains separated plate confidence');
  assert(sampleEvent.confidence.ocr !== undefined, 'Event contains separated ocr confidence');

  // TEST 12: Spatial Context Propagation
  console.log('\n[Test 12] Spatial Context Propagation');
  const trackWithSpatial = createSyntheticVehicleTrack({
    trackId: 'VEH-CAM-09-0777',
    cameraId: 'CAM-09',
  });
  const plateSpatial = createSyntheticPlateDetection({
    plateDetectionId: 'pld-sp-1',
    vehicleTrack: trackWithSpatial,
  });

  const { record: recordSpatial } = anpr.ingestObservation({
    vehicleTrack: trackWithSpatial,
    plate: plateSpatial,
    rawOcrText: 'AZ-982-FX',
    ocrConfidence: 0.95,
    spatialContext: {
      zoneId: 'zone-s1-checkpoint',
      zoneName: 'Sierra Checkpoint Gate Lane 1',
      isInsideRestrictedZone: true,
      lastFenceCrossed: 'Ridge Virtual Boundary Line East',
      direction: 'NORTH',
      dwellTimeSeconds: 24,
      sectorId: 'sec-sierra',
      sectorName: 'Sector Sierra',
    },
  });

  assert(recordSpatial.spatialContext?.zoneId === 'zone-s1-checkpoint', 'Propagates zoneId in spatial context');
  assert(recordSpatial.spatialContext?.isInsideRestrictedZone === true, 'Propagates restricted zone flag');
  assert(recordSpatial.spatialContext?.lastFenceCrossed === 'Ridge Virtual Boundary Line East', 'Propagates virtual fence crossed');
  assert(recordSpatial.spatialContext?.dwellTimeSeconds === 24, 'Propagates dwell duration');

  // TEST 13: Query and Search Filtering
  console.log('\n[Test 13] Search Behavior and Query Filtering');
  const searchHit = anpr.queryRecords({ plate: '982' });
  assert(searchHit.records.length >= 1, 'Search finds plate by partial query');
  assert(searchHit.records[0].normalizedPlate.includes('982'), 'Search returns matching record');

  const filterStatus = anpr.queryRecords({ recognitionStatus: 'CONFIRMED' });
  assert(filterStatus.records.every((r) => r.recognitionStatus === 'CONFIRMED'), 'Filter by status returns only confirmed');

  // TEST 14: Deterministic Scenarios A, D
  console.log('\n[Test 14] Scenarios A & D');
  const resA = runScenarioA(anpr);
  assert(resA.assertionsPass, 'Scenario A passes');

  const resD = runScenarioD(anpr);
  assert(resD.assertionsPass, 'Scenario D passes (preserves association during occlusion)');

  console.log('\n=============================================================');
  console.log(`  ALL ${passedAssertions}/${totalAssertions} ANPR VERIFICATION ASSERTIONS PASSED!`);
  console.log('=============================================================\n');
}

runAnprVerificationSuite().catch((err) => {
  console.error('\n❌ Suite execution failed:', err);
  process.exit(1);
});
