/**
 * IBVAP Spatial Rules & Zone Intelligence Verification Suite
 * Mathematical and algorithmic test verification across all core requirements.
 */

import {
  isPointInPolygon,
  isPointOnSegment,
  doLineSegmentsIntersect,
  calculateCrossingDirection,
  checkFenceCrossing,
  validateGeometry,
  getTrackAnchorPoint,
} from './geometry';
import { SpatialEngine } from './spatial-engine';
import { SpatialZone } from './types';
import { Track } from '../tracking/types';

interface TestResult {
  suite: string;
  name: string;
  passed: boolean;
  error?: string;
  details?: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, suite: string, name: string, details?: string) {
  if (condition) {
    results.push({ suite, name, passed: true, details });
  } else {
    results.push({ suite, name, passed: false, error: 'Assertion failed', details });
  }
}

export function runSpatialVerification(): {
  total: number;
  passed: number;
  failed: number;
  results: TestResult[];
} {
  results.length = 0;

  // --------------------------------------------------------------------------
  // 1. Point-in-Polygon Tests
  // --------------------------------------------------------------------------
  const suite1 = 'Point-in-Polygon Geometry';

  // Box from (0.2, 0.2) to (0.6, 0.6)
  const squarePoly = [
    { x: 0.2, y: 0.2 },
    { x: 0.6, y: 0.2 },
    { x: 0.6, y: 0.6 },
    { x: 0.2, y: 0.6 },
  ];

  // Point strictly inside
  assert(isPointInPolygon({ x: 0.4, y: 0.4 }, squarePoly), suite1, 'Point strictly inside polygon', '(0.4, 0.4) inside square');

  // Point strictly outside
  assert(!isPointInPolygon({ x: 0.1, y: 0.1 }, squarePoly), suite1, 'Point strictly outside polygon', '(0.1, 0.1) outside square');
  assert(!isPointInPolygon({ x: 0.7, y: 0.4 }, squarePoly), suite1, 'Point outside polygon right', '(0.7, 0.4) outside square');
  assert(!isPointInPolygon({ x: 0.4, y: 0.8 }, squarePoly), suite1, 'Point outside polygon bottom', '(0.4, 0.8) outside square');

  // Point on boundary vertex
  assert(isPointInPolygon({ x: 0.2, y: 0.2 }, squarePoly), suite1, 'Point on vertex', '(0.2, 0.2) vertex match');

  // Point on boundary edge
  assert(isPointInPolygon({ x: 0.4, y: 0.2 }, squarePoly), suite1, 'Point on edge', '(0.4, 0.2) top edge match');

  // Irregular / Concave Polygon (L-shape)
  const lShapePoly = [
    { x: 0.1, y: 0.1 },
    { x: 0.5, y: 0.1 },
    { x: 0.5, y: 0.3 },
    { x: 0.3, y: 0.3 },
    { x: 0.3, y: 0.5 },
    { x: 0.1, y: 0.5 },
  ];
  assert(isPointInPolygon({ x: 0.2, y: 0.2 }, lShapePoly), suite1, 'Point inside concave L-shape', '(0.2, 0.2) in L-shape');
  assert(!isPointInPolygon({ x: 0.4, y: 0.4 }, lShapePoly), suite1, 'Point in concave notch of L-shape', '(0.4, 0.4) outside concave notch');

  // --------------------------------------------------------------------------
  // 2. Line Segment Intersection & Virtual Fence Crossing
  // --------------------------------------------------------------------------
  const suite2 = 'Line Segment & Virtual Fence Intersection';

  // Vertical fence along x = 0.5 from y = 0.1 to y = 0.9
  const verticalFence = [
    { x: 0.5, y: 0.1 },
    { x: 0.5, y: 0.9 },
  ];

  // Motion crossing from left to right: (0.4, 0.5) -> (0.6, 0.5)
  const crossLeftToRight = doLineSegmentsIntersect(
    { x: 0.4, y: 0.5 },
    { x: 0.6, y: 0.5 },
    verticalFence[0],
    verticalFence[1]
  );
  assert(crossLeftToRight, suite2, 'Standard crossing left-to-right intersects fence');

  // Motion direction calculation
  const dirLR = calculateCrossingDirection(
    verticalFence[0],
    verticalFence[1],
    { x: 0.4, y: 0.5 },
    { x: 0.6, y: 0.5 }
  );
  assert(dirLR === 'RIGHT_TO_LEFT' || dirLR === 'LEFT_TO_RIGHT', suite2, 'Crossing direction is determined', `Determined direction: ${dirLR}`);

  // Opposite crossing right-to-left: (0.6, 0.5) -> (0.4, 0.5)
  const dirRL = calculateCrossingDirection(
    verticalFence[0],
    verticalFence[1],
    { x: 0.6, y: 0.5 },
    { x: 0.4, y: 0.5 }
  );
  assert(dirRL !== dirLR, suite2, 'Opposite motion vectors yield opposite crossing directions', `${dirLR} vs ${dirRL}`);

  // Parallel motion that does not cross: (0.4, 0.2) -> (0.4, 0.8)
  const parallelMotion = doLineSegmentsIntersect(
    { x: 0.4, y: 0.2 },
    { x: 0.4, y: 0.8 },
    verticalFence[0],
    verticalFence[1]
  );
  assert(!parallelMotion, suite2, 'Parallel motion does not intersect fence (no false positive)');

  // Near miss: (0.4, 0.5) -> (0.49, 0.5)
  const nearMiss = doLineSegmentsIntersect(
    { x: 0.4, y: 0.5 },
    { x: 0.49, y: 0.5 },
    verticalFence[0],
    verticalFence[1]
  );
  assert(!nearMiss, suite2, 'Near miss motion without crossing does not trigger fence');

  // Diagonal virtual fence
  const diagFence = [
    { x: 0.2, y: 0.2 },
    { x: 0.8, y: 0.8 },
  ];
  // Motion crossing diagonal: (0.2, 0.8) -> (0.8, 0.2)
  const crossDiag = doLineSegmentsIntersect(
    { x: 0.2, y: 0.8 },
    { x: 0.8, y: 0.2 },
    diagFence[0],
    diagFence[1]
  );
  assert(crossDiag, suite2, 'Diagonal fence crossing detected successfully');

  // --------------------------------------------------------------------------
  // 3. Geometry Validation
  // --------------------------------------------------------------------------
  const suite3 = 'Geometry Validation';

  assert(validateGeometry('POLYGON', squarePoly).valid, suite3, 'Valid polygon passes validation');
  assert(validateGeometry('LINE', verticalFence).valid, suite3, 'Valid line fence passes validation');

  // Polygon with < 3 vertices fails
  assert(!validateGeometry('POLYGON', [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }]).valid, suite3, 'Polygon with 2 vertices rejected');

  // Line with < 2 vertices fails
  assert(!validateGeometry('LINE', [{ x: 0.1, y: 0.1 }]).valid, suite3, 'Line with 1 point rejected');

  // Coordinates out of bounds > 1.0 or < 0.0 fail
  assert(!validateGeometry('POLYGON', [
    { x: 0.1, y: 0.1 },
    { x: 1.5, y: 0.2 },
    { x: 0.2, y: 0.2 },
  ]).valid, suite3, 'Out of bounds coordinate rejected (> 1.0)');

  // --------------------------------------------------------------------------
  // 4. Spatial Engine Lifecycle & State Machine Transitions
  // --------------------------------------------------------------------------
  const suite4 = 'Spatial Engine State Machine';

  const engine = new SpatialEngine();
  const testZone: SpatialZone = {
    zoneId: 'test-zone-alpha',
    cameraId: 'CAM-01',
    name: 'Sector Alpha Buffer Zone',
    type: 'RESTRICTED_AREA',
    geometry: 'POLYGON',
    coordinates: squarePoly,
    active: true,
    createdBy: 'SYS-VERIFY',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const testFence: SpatialZone = {
    zoneId: 'test-fence-beta',
    cameraId: 'CAM-01',
    name: 'Perimeter Cut Fence',
    type: 'RESTRICTED_AREA',
    geometry: 'LINE',
    coordinates: verticalFence,
    active: true,
    direction: 'BIDIRECTIONAL',
    createdBy: 'SYS-VERIFY',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockZones = [testZone, testFence];

  // Frame 1: Track-01 starts OUTSIDE at (0.1, 0.4)
  const track1Outside: Track = {
    trackId: 'TRK-001',
    numericId: 1,
    cameraId: 'CAM-01',
    objectType: 'person',
    createdAt: new Date().toISOString(),
    state: 'ACTIVE',
    firstSeenAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    ageFrames: 1,
    detectionCount: 1,
    missedFrames: 0,
    currentConfidence: 0.92,
    direction: 'EAST',
    dwellTimeSeconds: 1,
    contributingDetectionIds: ['det-001'],
    modelVersion: 'v1.0.0',
    lastBoundingBox: { x: 0.05, y: 0.35, width: 0.1, height: 0.1 }, // Footprint: (0.1, 0.45)
    trajectory: [{ x: 0.1, y: 0.45, timestamp: new Date().toISOString() }],
  };

  const eventsFrame1 = engine.evaluateCameraTracks('CAM-01', 'CAM-01', [track1Outside], mockZones);
  assert(eventsFrame1.length === 0, suite4, 'Outside track generates 0 events on initialization');

  // Frame 2: Track-01 moves INSIDE square zone to (0.4, 0.45)
  const track1Inside: Track = {
    ...track1Outside,
    ageFrames: 2,
    lastBoundingBox: { x: 0.35, y: 0.35, width: 0.1, height: 0.1 }, // Footprint: (0.4, 0.45)
    trajectory: [
      { x: 0.1, y: 0.45, timestamp: new Date().toISOString() },
      { x: 0.4, y: 0.45, timestamp: new Date().toISOString() },
    ],
  };

  const eventsFrame2 = engine.evaluateCameraTracks('CAM-01', 'CAM-01', [track1Inside], mockZones);
  assert(eventsFrame2.length === 1, suite4, 'Transition OUTSIDE -> INSIDE emits exactly 1 event');
  assert(eventsFrame2[0]?.eventType === 'zone.entered', suite4, 'Emitted event is zone.entered');
  assert(eventsFrame2[0]?.zoneId === 'test-zone-alpha', suite4, 'Event references correct zoneId');

  // Frame 3: Track-01 remains INSIDE square zone at (0.45, 0.45)
  const track1StillInside: Track = {
    ...track1Inside,
    ageFrames: 3,
    lastBoundingBox: { x: 0.4, y: 0.35, width: 0.1, height: 0.1 }, // Footprint: (0.45, 0.45)
  };

  const eventsFrame3 = engine.evaluateCameraTracks('CAM-01', 'CAM-01', [track1StillInside], mockZones);
  assert(eventsFrame3.length === 0, suite4, 'No duplicate entry event emitted while track remains inside');

  // Frame 4: Track-01 TEMPORARILY_LOST (occluded)
  const track1Lost: Track = {
    ...track1StillInside,
    state: 'TEMPORARILY_LOST',
    missedFrames: 1,
  };

  const eventsFrame4 = engine.evaluateCameraTracks('CAM-01', 'CAM-01', [track1Lost], mockZones);
  assert(eventsFrame4.length === 0, suite4, 'TEMPORARILY_LOST track does NOT trigger false exit');

  // Frame 5: Track-01 moves OUTSIDE square zone to (0.75, 0.45)
  // This motion from (0.45, 0.45) to (0.75, 0.45) ALSO crosses the vertical fence at x = 0.5!
  const track1ExitAndCross: Track = {
    ...track1StillInside,
    state: 'ACTIVE',
    ageFrames: 5,
    lastBoundingBox: { x: 0.7, y: 0.35, width: 0.1, height: 0.1 }, // Footprint: (0.75, 0.45)
    trajectory: [
      { x: 0.45, y: 0.45, timestamp: new Date().toISOString() },
      { x: 0.75, y: 0.45, timestamp: new Date().toISOString() },
    ],
  };

  const eventsFrame5 = engine.evaluateCameraTracks('CAM-01', 'CAM-01', [track1ExitAndCross], mockZones);
  const exitEvent = eventsFrame5.find((e) => e.eventType === 'zone.exited');
  const fenceEvent = eventsFrame5.find((e) => e.eventType === 'fence.crossed');

  assert(Boolean(exitEvent), suite4, 'Transition INSIDE -> OUTSIDE emits zone.exited');
  assert(Boolean(fenceEvent), suite4, 'Crossing fence line emits fence.crossed');
  assert(
    typeof exitEvent?.dwellTimeSeconds === 'number',
    suite4,
    'Exit event includes computed dwellTimeSeconds'
  );

  // Frame 6: Track-01 ENDED
  const track1Ended: Track = {
    ...track1ExitAndCross,
    state: 'ENDED',
  };
  const eventsFrame6 = engine.evaluateCameraTracks('CAM-01', 'CAM-01', [track1Ended], mockZones);
  assert(eventsFrame6.length === 0, suite4, 'Ending an already-exited track emits no extraneous events and cleans up');

  // --------------------------------------------------------------------------
  // 5. Live Occupancy, Continuous Multi-Track Evaluation & Dwell Warnings
  // --------------------------------------------------------------------------
  const suite5 = 'Live Occupancy & Dwell Warning Engine';

  const dwellEngine = new SpatialEngine();
  const testZoneWithDwell: SpatialZone = {
    zoneId: 'zone-dwell-test',
    cameraId: 'CAM-01',
    cameraIdentifier: 'CAM-01',
    name: 'Restricted Storage Depot',
    type: 'RESTRICTED_AREA',
    geometry: 'POLYGON',
    coordinates: [
      { x: 0.1, y: 0.1 },
      { x: 0.5, y: 0.1 },
      { x: 0.5, y: 0.5 },
      { x: 0.1, y: 0.5 },
    ],
    active: true,
    severity: 'CRITICAL',
    dwellWarningSeconds: 5,
    maxDwellSeconds: 30,
    createdBy: 'SYSTEM',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const tStart = 1700000000000;
  const t0Str = new Date(tStart).toISOString();

  // Track A enters at t0
  const trackA_f1: Track = {
    trackId: 'trk-alpha',
    numericId: 101,
    cameraId: 'CAM-01',
    state: 'ACTIVE',
    objectType: 'person',
    direction: 'EAST',
    createdAt: t0Str,
    firstSeenAt: t0Str,
    lastSeenAt: t0Str,
    ageFrames: 1,
    detectionCount: 1,
    missedFrames: 0,
    currentConfidence: 0.96,
    dwellTimeSeconds: 0,
    contributingDetectionIds: ['det-101'],
    modelVersion: 'v1.0.0',
    trajectory: [{ x: 0.25, y: 0.3, timestamp: t0Str }],
    lastBoundingBox: { x: 0.2, y: 0.2, width: 0.1, height: 0.1 },
  };

  // Track B enters at t0
  const trackB_f1: Track = {
    trackId: 'trk-bravo',
    numericId: 102,
    cameraId: 'CAM-01',
    state: 'ACTIVE',
    objectType: 'person',
    direction: 'EAST',
    createdAt: t0Str,
    firstSeenAt: t0Str,
    lastSeenAt: t0Str,
    ageFrames: 1,
    detectionCount: 1,
    missedFrames: 0,
    currentConfidence: 0.94,
    dwellTimeSeconds: 0,
    contributingDetectionIds: ['det-102'],
    modelVersion: 'v1.0.0',
    trajectory: [{ x: 0.35, y: 0.4, timestamp: t0Str }],
    lastBoundingBox: { x: 0.3, y: 0.3, width: 0.1, height: 0.1 },
  };

  // Frame 1: Both tracks enter
  const evtsF1 = dwellEngine.evaluateCameraTracks(
    'CAM-01',
    'CAM-01',
    [trackA_f1, trackB_f1],
    [testZoneWithDwell],
    t0Str
  );
  assert(evtsF1.length === 2, suite5, 'Concurrent multi-track entry generates entry events for each track');

  // Verify Zone Occupancy at t0 has 2 occupants
  const occF1 = dwellEngine.getZoneOccupancy(testZoneWithDwell, [trackA_f1, trackB_f1]);
  assert(occF1.currentOccupants === 2, suite5, 'Zone occupancy reports exactly 2 occupants');
  assert(
    occF1.occupantTrackIds.includes('trk-alpha') && occF1.occupantTrackIds.includes('trk-bravo'),
    suite5,
    'Occupant Track IDs accurately reflect all active targets'
  );

  // Frame 2: 3 seconds elapsed (below 5s dwell warning threshold)
  const t1Str = new Date(tStart + 3000).toISOString();
  const trackA_f2 = { ...trackA_f1, lastSeenAt: t1Str };
  const trackB_f2 = { ...trackB_f1, lastSeenAt: t1Str };
  const evtsF2 = dwellEngine.evaluateCameraTracks(
    'CAM-01',
    'CAM-01',
    [trackA_f2, trackB_f2],
    [testZoneWithDwell],
    t1Str
  );
  assert(evtsF2.length === 0, suite5, 'No dwell warnings emitted before threshold elapsed');

  // Frame 3: 7 seconds elapsed (surpassed 5s dwell warning threshold)
  const t2Str = new Date(tStart + 7000).toISOString();
  const trackA_f3 = { ...trackA_f2, lastSeenAt: t2Str };
  const trackB_f3 = { ...trackB_f2, lastSeenAt: t2Str };
  const evtsF3 = dwellEngine.evaluateCameraTracks(
    'CAM-01',
    'CAM-01',
    [trackA_f3, trackB_f3],
    [testZoneWithDwell],
    t2Str
  );
  const dwellWarnings = evtsF3.filter((e) => e.eventType === 'zone.dwell_warning');
  assert(dwellWarnings.length === 2, suite5, 'Dwell warnings emitted for all tracks surpassing threshold');
  assert(dwellWarnings[0].severity === 'CRITICAL', suite5, 'Restricted zone dwell warning inherits CRITICAL severity');

  // Frame 4: 10 seconds elapsed (tracks continue to dwell - NO duplicate dwell warnings)
  const t3Str = new Date(tStart + 10000).toISOString();
  const trackA_f4 = { ...trackA_f3, lastSeenAt: t3Str };
  const trackB_f4 = { ...trackB_f3, lastSeenAt: t3Str };
  const evtsF4 = dwellEngine.evaluateCameraTracks(
    'CAM-01',
    'CAM-01',
    [trackA_f4, trackB_f4],
    [testZoneWithDwell],
    t3Str
  );
  assert(evtsF4.length === 0, suite5, 'Dwell warning emitted strictly once (no duplicate floods on subsequent frames)');

  // Frame 5: Track Alpha exits zone, Track Bravo remains
  const t4Str = new Date(tStart + 12000).toISOString();
  const trackA_f5: Track = {
    ...trackA_f4,
    lastSeenAt: t4Str,
    trajectory: [
      { x: 0.25, y: 0.3, timestamp: t0Str },
      { x: 0.85, y: 0.9, timestamp: t4Str },
    ],
    lastBoundingBox: { x: 0.8, y: 0.8, width: 0.1, height: 0.1 },
  };
  const trackB_f5 = { ...trackB_f4, lastSeenAt: t4Str };

  const evtsF5 = dwellEngine.evaluateCameraTracks(
    'CAM-01',
    'CAM-01',
    [trackA_f5, trackB_f5],
    [testZoneWithDwell],
    t4Str
  );
  const exitA = evtsF5.find((e) => e.eventType === 'zone.exited' && e.trackId === 'trk-alpha');
  assert(Boolean(exitA), suite5, 'Exiting track emits zone.exited without disturbing continuing occupants');

  // Occupancy now decreases to 1
  const occF5 = dwellEngine.getZoneOccupancy(testZoneWithDwell, [trackA_f5, trackB_f5]);
  assert(occF5.currentOccupants === 1, suite5, 'Zone occupancy immediately decrements to 1 after target exit');
  assert(
    occF5.occupantTrackIds.length === 1 && occF5.occupantTrackIds[0] === 'trk-bravo',
    suite5,
    'Remaining occupant is accurately tracked in isolation'
  );

  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  return { total, passed, failed, results };
}

// Direct execution when invoked as a CLI script
if (typeof process !== 'undefined' && process.argv && process.argv[1]?.includes('verify-spatial')) {
  console.log('================================================================');
  console.log('   IBVAP VIRTUAL FENCE & ZONE INTELLIGENCE VERIFICATION SUITE   ');
  console.log('================================================================\n');

  const report = runSpatialVerification();

  for (const res of report.results) {
    const status = res.passed ? '✓ PASS' : '✗ FAIL';
    console.log(`[${status}] [${res.suite}] ${res.name}`);
    if (res.details) {
      console.log(`       Details: ${res.details}`);
    }
    if (res.error) {
      console.log(`       Error: ${res.error}`);
    }
  }

  console.log('\n----------------------------------------------------------------');
  console.log(`TOTAL: ${report.total} | PASSED: ${report.passed} | FAILED: ${report.failed}`);
  console.log('----------------------------------------------------------------\n');

  if (report.failed > 0) {
    process.exit(1);
  }
}
