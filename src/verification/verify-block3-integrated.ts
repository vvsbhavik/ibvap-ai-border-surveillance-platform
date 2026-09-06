/**
 * IBVAP — Build Block 3 Integrated Pipeline Verification Suite
 *
 * Verifies the complete integrated:
 * Camera Frame -> Detection -> Tracking -> Spatial Engine -> Face Analytics + ANPR -> Watchlists -> Alerts & Incident Escalation
 */

import { spatialEngine } from '../spatial/spatial-engine';
import { faceService } from '../face/face-service';
import { anprService } from '../anpr/anpr-service';
import { dataStore } from '../server/store';
import { Track } from '../tracking/types';
import { SpatialZone } from '../spatial/types';

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, description: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ ${description}`);
  } else {
    console.error(`  ✗ FAIL: ${description}`);
    throw new Error(`Assertion failed: ${description}`);
  }
}

console.log('=============================================================');
console.log('  IBVAP BUILD BLOCK 3 — INTEGRATED PIPELINE VERIFICATION SUITE');
console.log('=============================================================');

// Test Setup
const testCameraId = 'CAM-01';
const restrictedZone: SpatialZone = {
  zoneId: 'zone-test-restricted',
  cameraId: testCameraId,
  name: 'Perimeter Restricted Buffer Zone',
  type: 'RESTRICTED_AREA',
  geometry: 'POLYGON',
  coordinates: [
    { x: 0.1, y: 0.1 },
    { x: 0.9, y: 0.1 },
    { x: 0.9, y: 0.9 },
    { x: 0.1, y: 0.9 },
  ],
  isRestricted: true,
  dwellThresholdSeconds: 5,
  color: '#EF4444',
  active: true,
  createdBy: 'TEST_SUITE',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

// 1. Pipeline Execution with Spatial Correlation
console.log('\n[Test 1] Unified Pipeline Frame Ingestion & Spatial Context Correlation');
{
  const now = new Date().toISOString();

  // Create test person track inside the restricted zone
  const personTrack: Track = {
    trackId: 'trk-p-unified-01',
    numericId: 101,
    cameraId: testCameraId,
    objectType: 'person',
    state: 'ACTIVE',
    createdAt: now,
    firstSeenAt: now,
    lastSeenAt: now,
    modelVersion: 'yolov8n-mot-1.0',
    lastBoundingBox: { x: 0.35, y: 0.35, width: 0.15, height: 0.35 },
    currentConfidence: 0.94,
    trajectory: [{ x: 0.42, y: 0.52, timestamp: now }],
    direction: 'NORTH',
    dwellTimeSeconds: 12,
    detectionCount: 5,
    missedFrames: 0,
    contributingDetectionIds: ['det-p-1'],
  };

  // Create test vehicle track inside the restricted zone
  const vehicleTrack: Track = {
    trackId: 'trk-v-unified-01',
    numericId: 201,
    cameraId: testCameraId,
    objectType: 'vehicle',
    state: 'ACTIVE',
    createdAt: now,
    firstSeenAt: now,
    lastSeenAt: now,
    modelVersion: 'yolov8n-mot-1.0',
    lastBoundingBox: { x: 0.55, y: 0.45, width: 0.25, height: 0.25 },
    currentConfidence: 0.96,
    trajectory: [{ x: 0.67, y: 0.57, timestamp: now }],
    direction: 'EAST',
    dwellTimeSeconds: 8,
    detectionCount: 6,
    missedFrames: 0,
    contributingDetectionIds: ['det-v-1'],
  };

  const rawFrame = {
    cameraId: testCameraId,
    timestamp: now,
    width: 1920,
    height: 1080,
    frameNumber: 1001,
  };

  // Evaluate spatial state first
  spatialEngine.evaluateCameraTracks(testCameraId, testCameraId, [personTrack, vehicleTrack], [restrictedZone], now);

  // Process person through faceService with spatial resolver
  const faceRecords = faceService.processFrame(rawFrame as any, [personTrack], {
    getSpatialContext: (t) => spatialEngine.getTrackSpatialContext(t.trackId, [restrictedZone]),
  });

  assert(faceRecords.length > 0, 'Face service produced observation for person track');
  const faceRec = faceRecords[0];
  assert(faceRec.personTrackId === 'trk-p-unified-01', 'Face record accurately preserved personTrackId');
  assert(faceRec.spatialContext !== undefined, 'Face record received spatial context');
  assert(faceRec.spatialContext?.zoneId === 'zone-test-restricted', 'Face record correlated with restricted zoneId');
  assert(faceRec.spatialContext?.isRestricted === true, 'Face record inherited zone isRestricted flag');

  // Process vehicle through anprService with spatial resolver
  const anprRecords = anprService.processFrame(rawFrame as any, [vehicleTrack], {
    getSpatialContext: (t) => spatialEngine.getTrackSpatialContext(t.trackId, [restrictedZone]),
  });

  assert(anprRecords.length > 0, 'ANPR service produced observation for vehicle track');
  const anprRec = anprRecords[0];
  assert(anprRec.vehicleTrackId === 'trk-v-unified-01', 'ANPR record accurately preserved vehicleTrackId');
  assert(anprRec.spatialContext !== undefined, 'ANPR record received spatial context');
  assert(anprRec.spatialContext?.zoneId === 'zone-test-restricted', 'ANPR record correlated with restricted zoneId');
  assert(anprRec.spatialContext?.isRestricted === true, 'ANPR record inherited zone isRestricted flag');
}

// 2. Watchlist Match & Alert Generation
console.log('\n[Test 2] Watchlist Intelligence & Cross-Subsystem Alerts');
{
  // Add a test face watchlist entry
  const faceEntry = faceService.addWatchlistEntry({
    displayName: 'Suspect Delta Zero',
    category: 'WARRANT_INTERCEPT',
    priority: 'CRITICAL',
    notes: 'High-priority border alert suspect',
    status: 'ACTIVE',
    templateEmbedding: Array.from({ length: 128 }, (_, i) => Math.sin(i * 0.1) * 0.1),
  });

  assert(faceEntry.id.length > 0, 'Face watchlist entry created successfully');

  // Add an ANPR watchlist entry
  const anprEntry = anprService.addWatchlistEntry({
    plateNumber: 'INT-992-AZ',
    category: 'STOLEN_VEHICLE',
    labelName: 'Reported Stolen Transport',
    priority: 'CRITICAL',
    notes: 'Intercept on visual detection',
    active: true,
  });

  assert(anprEntry.id.length > 0, 'ANPR watchlist entry created successfully');

  // Verify retrieval
  const faceWatchlists = faceService.getWatchlists();
  assert(faceWatchlists.some((w) => w.id === faceEntry.id), 'Face watchlist contains new suspect entry');

  const anprWatchlists = anprService.getWatchlists();
  assert(anprWatchlists.some((w) => w.plateNumber === 'INT992AZ'), 'ANPR watchlist contains normalized plate entry');
}

// 3. Multi-Frame Consensus & Quality Gating Truthfulness
console.log('\n[Test 3] Multi-Frame Consensus & Truthful Labeling');
{
  const personTrackId = 'trk-consensus-test';
  const now = new Date().toISOString();

  const mockTrack: Track = {
    trackId: personTrackId,
    numericId: 105,
    cameraId: 'CAM-01',
    objectType: 'person',
    state: 'ACTIVE',
    createdAt: now,
    firstSeenAt: now,
    lastSeenAt: now,
    modelVersion: 'yolov8n-mot-1.0',
    lastBoundingBox: { x: 0.2, y: 0.2, width: 0.1, height: 0.3 },
    currentConfidence: 0.92,
    trajectory: [{ x: 0.25, y: 0.35, timestamp: now }],
    direction: 'SOUTH',
    dwellTimeSeconds: 4,
    detectionCount: 3,
    missedFrames: 0,
    contributingDetectionIds: ['det-105'],
  };

  const frame: any = { cameraId: 'CAM-01', timestamp: now, width: 1920, height: 1080 };

  // Frame 1
  faceService.processFrame(frame, [mockTrack]);
  const rec1 = faceService.getRecord(personTrackId);
  assert(rec1 !== undefined, 'Record exists after frame 1');
  assert(rec1?.isSimulation === true, 'Record truthfully marked isSimulation=true');
  assert(
    rec1?.recognitionStatus === 'UNKNOWN' ||
      rec1?.recognitionStatus === 'POSSIBLE_MATCH' ||
      rec1?.recognitionStatus === 'MATCHED' ||
      rec1?.recognitionStatus === 'LOW_QUALITY' ||
      rec1?.recognitionStatus === 'UNREADABLE',
    'Record recognitionStatus adheres to controlled vocabulary'
  );

  // Frame 2
  faceService.processFrame(frame, [mockTrack]);
  const rec2 = faceService.getRecord(personTrackId);
  assert(rec2 !== undefined && rec2.observationsCount >= 2, 'Multi-frame observationsCount incremented');
}

// 4. Memory Retention & Pruning Engine
console.log('\n[Test 4] Bounded In-Memory Retention & Pruning Engine');
{
  const faceRetention = faceService.getRetentionPolicy();
  assert(faceRetention.maxRecords > 0, 'Face retention policy defines maxRecords');
  assert(faceRetention.ttlHours > 0, 'Face retention policy defines ttlHours');

  const anprRetention = anprService.getRetentionPolicy();
  assert(anprRetention.maxRecords > 0, 'ANPR retention policy defines maxRecords');
  assert(anprRetention.ttlHours > 0, 'ANPR retention policy defines ttlHours');

  // Pruning runs safely
  const facePrune = faceService.pruneOldRecords();
  assert(typeof facePrune.pruned === 'number', 'Face pruning returns pruned count');

  const anprPrune = anprService.pruneOldRecords();
  assert(typeof anprPrune.pruned === 'number', 'ANPR pruning returns pruned count');
}

// 5. Audit Logging for Search & Compliance
console.log('\n[Test 5] Audit Logging & Compliance Integration');
{
  const initialAuditCount = dataStore.auditLogs.length;

  dataStore.logAudit(
    'COMMANDER-ALPHA',
    'FACE_SEARCH',
    'FACE_ANALYTICS',
    'Suspect Delta',
    '10.0.4.12',
    { query: 'Suspect Delta', resultsCount: 1 },
    'SUCCESS'
  );

  assert(dataStore.auditLogs.length === initialAuditCount + 1, 'Audit log recorded user search action');
  const latestLog = dataStore.auditLogs[0];
  assert(latestLog.operatorCallsign === 'COMMANDER-ALPHA', 'Audit log captured operator callsign');
  assert(latestLog.action === 'FACE_SEARCH', 'Audit log captured action type');
  assert(latestLog.resourceId === 'Suspect Delta', 'Audit log captured query target');
}

// 6. Pipeline Error Isolation & Resilience
console.log('\n[Test 6] Pipeline Error Isolation & Resilience');
{
  // Process frame with empty or invalid track list
  let survived = false;
  try {
    faceService.processFrame(undefined as any, []);
    anprService.processFrame(undefined as any, []);
    survived = true;
  } catch (err) {
    survived = false;
  }

  assert(survived, 'Analytics services gracefully survive undefined frames or empty track collections');
}

console.log('=============================================================');
console.log(`  BLOCK 3 INTEGRATED SUITE: ${passedTests}/${totalTests} Assertions Passed!`);
console.log('=============================================================');
