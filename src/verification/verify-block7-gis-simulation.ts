/**
 * IBVAP — Build Block 7 Verification Suite
 * GIS Operational Command Map, Digital Twin, Camera Trust, and Edge Resilience
 */

import { gisService, GisService } from '../gis/gis-service';
import { cameraTrustEngine } from '../camera-trust/trust-engine';
import { digitalTwinService, SIMULATION_SCENARIOS } from '../simulation/digital-twin-service';
import { edgeNodeService } from '../edge/edge-service';
import { executeTool, TOOL_PERMISSIONS, isToolAuthorized } from '../server/services/gemini-tools';
import { OperatorAuthContext } from '../server/services/gemini-types';
import { dataStore } from '../server/store';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${message}`);
  }
}

async function runBlock7Verification() {
  console.log('\n=============================================================');
  console.log('  IBVAP BUILD BLOCK 7 — GIS, DIGITAL TWIN, CAMERA TRUST & EDGE');
  console.log('=============================================================\n');

  // -------------------------------------------------------------------------
  // Test 1: GIS Operational Context & Geospatial Modeling
  // -------------------------------------------------------------------------
  console.log('[Test 1] GIS Operational Context & Geospatial Modeling');
  const context = gisService.getOperationalContext();

  assert(context !== null && typeof context === 'object', 'Operational context returned');
  assert(context.provenanceLabel === 'SIMULATED MAP DATA', 'Truthful provenance label is SIMULATED MAP DATA');
  assert(context.isSimulatedData === true, 'isSimulatedData flag is true');
  assert(context.cameras.length >= 12, `All ${context.cameras.length} surveillance masts are geographically plotted`);
  assert(context.sectors.length >= 3, `All ${context.sectors.length} sectors defined with boundary polygons`);
  assert(context.zones.length > 0, `Spatial zones compiled (${context.zones.length} zones)`);
  assert(context.fences.length > 0, `Virtual fence tripwires compiled (${context.fences.length} fences)`);
  assert(context.topologyCorridors.length > 0, `Camera topology corridors connected (${context.topologyCorridors.length} corridors)`);

  const cam1 = context.cameras.find((c) => c.cameraId === 'CAM-01');
  assert(!!cam1, 'CAM-01 exists in geographic profiles');
  assert(cam1?.elevationMeters === 1420, 'CAM-01 has measured terrain elevation 1420m');
  assert(cam1?.azimuthDegrees === 42, 'CAM-01 has optical azimuth calibrated at 42°');
  assert(cam1?.fieldOfViewDegrees === 85, 'CAM-01 has calibrated 85° FOV');
  assert(cam1?.estimatedCoverageRadiusMeters === 550, 'CAM-01 has estimated coverage radius 550m');
  assert(cam1?.capabilities.hasThermal === true, 'CAM-01 capability detects thermal sensor');

  // Test SVG FOV Arc generation math
  const arcD = GisService.calculateFovArcPath(500, 300, 60, 45, 75);
  assert(arcD.startsWith('M 500 300 L'), 'FOV Arc path generated valid SVG path data');
  assert(!arcD.includes('NaN'), 'Arc path contains no NaN values');

  // -------------------------------------------------------------------------
  // Test 2: Camera Trust & Health Subsystem (Explainable Scoring & Integrity)
  // -------------------------------------------------------------------------
  console.log('\n[Test 2] Camera Trust & Operational Integrity Engine');
  const cam1Eval = cameraTrustEngine.evaluateCamera('CAM-01', false);

  assert(cam1Eval.trustScore >= 0 && cam1Eval.trustScore <= 100, `Trust score computed: ${cam1Eval.trustScore}/100`);
  assert(cam1Eval.factors.length === 5, 'Evaluates all 5 explainable trust factors');

  const factorSum = cam1Eval.factors.reduce((sum, f) => sum + f.weight, 0);
  assert(Math.abs(factorSum - 1.0) < 0.001, 'Sum of factor weights equals strictly 1.0 (100%)');

  // Test Anomaly State Injection & Explainable Labeling (Strict Rule: No "HACKED" hype)
  cameraTrustEngine.setStreamState('CAM-01', 'STREAM_AVAILABLE', { isFrozen: true });
  const anomalyEval = cameraTrustEngine.getEvaluation('CAM-01');

  assert(anomalyEval.status === 'INTEGRITY_ANOMALY', 'Status transitioned to INTEGRITY_ANOMALY on frozen frame');
  assert(
    anomalyEval.statusLabel === 'CAMERA INTEGRITY ANOMALY — VERIFICATION REQUIRED',
    'Truthful label strictly uses "CAMERA INTEGRITY ANOMALY — VERIFICATION REQUIRED"'
  );
  assert(!anomalyEval.statusLabel.includes('HACKED'), 'Never claims "HACKED" or sensationalized hype');
  assert(!anomalyEval.statusLabel.includes('CYBER ATTACK'), 'Never claims "CYBER ATTACK" without security detection');
  assert(anomalyEval.isVerificationRequired === true, 'isVerificationRequired is true during integrity anomaly');

  // Restore camera health baseline
  const restoredEval = cameraTrustEngine.resetCameraToOptimal('CAM-01');
  assert(restoredEval.status === 'HEALTHY', 'Camera restored to HEALTHY status');
  assert(restoredEval.trustScore >= 95, `Restored trust score is optimal: ${restoredEval.trustScore}/100`);

  // -------------------------------------------------------------------------
  // Test 3: Digital Twin & Border Simulation Environment (Scenarios A - J)
  // -------------------------------------------------------------------------
  console.log('\n[Test 3] Digital Twin & Border Simulation Environment');
  assert(SIMULATION_SCENARIOS.length === 10, `All 10 scenarios A through J are defined (${SIMULATION_SCENARIOS.length} scenarios)`);

  const scenarioIds = SIMULATION_SCENARIOS.map((s) => s.id);
  assert(scenarioIds.includes('SCENARIO_A'), 'Includes Scenario A: Expected corridor');
  assert(scenarioIds.includes('SCENARIO_B'), 'Includes Scenario B: Restricted zone');
  assert(scenarioIds.includes('SCENARIO_C'), 'Includes Scenario C: Virtual fence');
  assert(scenarioIds.includes('SCENARIO_D'), 'Includes Scenario D: Night movement');
  assert(scenarioIds.includes('SCENARIO_E'), 'Includes Scenario E: Repeated crossing');
  assert(scenarioIds.includes('SCENARIO_F'), 'Includes Scenario F: Camera failure');
  assert(scenarioIds.includes('SCENARIO_G'), 'Includes Scenario G: Multi-camera correlated');
  assert(scenarioIds.includes('SCENARIO_H'), 'Includes Scenario H: ANPR watchlist match');
  assert(scenarioIds.includes('SCENARIO_I'), 'Includes Scenario I: Face watchlist match');
  assert(scenarioIds.includes('SCENARIO_J'), 'Includes Scenario J: Combined incident');

  // Launch Scenario B
  const startedState = digitalTwinService.startScenario('SCENARIO_B', 'TEST-COMMANDER');
  assert(startedState.status === 'RUNNING', 'Simulation state is RUNNING');
  assert(startedState.activeScenario?.id === 'SCENARIO_B', 'Active scenario is SCENARIO_B');
  assert(startedState.activeActors.length > 0, 'Active simulated actors populated');
  assert(startedState.provenanceLabel === 'SIMULATION MODE / TEST DATA', 'Provenance strictly labeled SIMULATION MODE / TEST DATA');

  // Speed multiplier
  const speedState = digitalTwinService.setSpeed(2);
  assert(speedState.speedMultiplier === 2, 'Speed multiplier updated to 2x');

  // Safe reset
  const resetState = digitalTwinService.resetSimulation('TEST-COMMANDER');
  assert(resetState.status === 'IDLE', 'Simulation reset to IDLE');
  assert(resetState.activeActors.length === 0, 'Transient actors cleared');

  // -------------------------------------------------------------------------
  // Test 4: Edge Node Abstraction & Offline Resilience
  // -------------------------------------------------------------------------
  console.log('\n[Test 4] Edge Node Abstraction & Offline Resilience');
  const edgeNodes = edgeNodeService.getAllNodes();
  assert(edgeNodes.length === 3, `All 3 ruggedized edge gateways initialized (${edgeNodes.length} nodes)`);

  const nodeNorth = edgeNodes.find((n) => n.edgeNodeId === 'EDGE-NODE-NORTH-01');
  assert(!!nodeNorth, 'EDGE-NODE-NORTH-01 exists');
  assert(nodeNorth?.assignedCameras.includes('CAM-01'), 'Assigned to Sector Bravo cameras (CAM-01 - CAM-04)');
  assert(nodeNorth?.connectivityState === 'ONLINE', 'Initial connectivity is ONLINE');

  // Simulate network disconnection
  const disconnectedNode = edgeNodeService.simulateDisconnect('EDGE-NODE-NORTH-01', 'TECH-OP-01');
  assert(disconnectedNode.connectivityState === 'OFFLINE', 'Edge node successfully transitioned to OFFLINE');
  assert(disconnectedNode.bufferState.queueLength > 0, `Autonomous edge queue buffered ${disconnectedNode.bufferState.queueLength} events`);

  // Simulate reconnect and deduplicated synchronization
  const syncResult = await edgeNodeService.simulateReconnectAndSync('EDGE-NODE-NORTH-01', 'TECH-OP-01');
  assert(syncResult.status === 'SUCCESS', 'Synchronization completed with status SUCCESS');
  assert(syncResult.syncedEventsCount > 0, `Flushed and synced ${syncResult.syncedEventsCount} buffered events`);
  assert(syncResult.remainingQueueLength === 0, 'Edge buffer queue flushed to 0');
  assert(nodeNorth?.connectivityState === 'ONLINE', 'Edge node returned to ONLINE after verified sync');

  // -------------------------------------------------------------------------
  // Test 5: Gemini Controlled Tools & Function Calling Integration
  // -------------------------------------------------------------------------
  console.log('\n[Test 5] Gemini Controlled Tools Integration');
  const commanderContext: OperatorAuthContext = {
    callsign: 'COMMANDER-1',
    role: 'WATCH_COMMANDER',
    ipAddress: '127.0.0.1',
  };

  assert(isToolAuthorized('getCameraTrustStatus', commanderContext), 'Commander authorized for getCameraTrustStatus');
  assert(isToolAuthorized('getCameraTopology', commanderContext), 'Commander authorized for getCameraTopology');
  assert(isToolAuthorized('getSectorMapContext', commanderContext), 'Commander authorized for getSectorMapContext');
  assert(isToolAuthorized('getSimulationState', commanderContext), 'Commander authorized for getSimulationState');
  assert(isToolAuthorized('getEdgeNodeStatus', commanderContext), 'Commander authorized for getEdgeNodeStatus');

  // Execute getCameraTrustStatus tool
  const trustToolRes = await executeTool('getCameraTrustStatus', { cameraId: 'CAM-01' }, commanderContext);
  assert(trustToolRes.record.executionStatus === 'SUCCESS', 'Executed getCameraTrustStatus tool');
  assert((trustToolRes.result as any).provenance === 'SIMULATION', 'Tool facts stamped with SIMULATION provenance');
  assert((trustToolRes.result as any).trustScore >= 0, 'Tool returned authoritative trust score');

  // Execute getSectorMapContext tool
  const mapToolRes = await executeTool('getSectorMapContext', {}, commanderContext);
  assert(mapToolRes.record.executionStatus === 'SUCCESS', 'Executed getSectorMapContext tool');
  assert((mapToolRes.result as any).camerasCount >= 12, 'Tool returned map context with cameras');

  // Execute getEdgeNodeStatus tool
  const edgeToolRes = await executeTool('getEdgeNodeStatus', { edgeNodeId: 'EDGE-NODE-NORTH-01' }, commanderContext);
  assert(edgeToolRes.record.executionStatus === 'SUCCESS', 'Executed getEdgeNodeStatus tool');
  assert((edgeToolRes.result as any).connectivityState === 'ONLINE', 'Tool returned edge connectivity state');

  console.log('\n=============================================================');
  console.log(`  BLOCK 7 VERIFICATION RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('=============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runBlock7Verification().catch((err) => {
  console.error('Fatal error during Block 7 verification:', err);
  process.exit(1);
});
