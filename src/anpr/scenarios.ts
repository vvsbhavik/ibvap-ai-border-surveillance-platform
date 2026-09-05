/**
 * IBVAP — Deterministic Synthetic ANPR Test Scenarios
 *
 * Provides reproducible test scenarios explicitly marked as simulation data:
 * - SCENARIO_A: Vehicle with clearly readable plate (TS09AB1234 -> CONFIRMED)
 * - SCENARIO_B: Vehicle with partially unreadable plate (low confidence / UNCERTAIN / UNREADABLE)
 * - SCENARIO_C: Two vehicles with distinct plates (AZ-982-FX and NM-441-BP)
 * - SCENARIO_D: Vehicle temporarily occluded while preserving persistent plate association
 * - SCENARIO_E: Multi-frame progressive consensus (Frame 1: TS09AB12?4, Frame 2: TS09AB1234, Frame 3: TS09AB1234)
 */

import { Track } from '../tracking/types';
import { PlateDetection } from './types';
import { AnprService } from './anpr-service';

export interface AnprScenarioResult {
  scenarioName: string;
  description: string;
  isSimulation: true;
  records: any[];
  assertionsPass: boolean;
  notes: string[];
}

/**
 * Creates a synthetic Track object with strict vehicle parameters.
 */
export function createSyntheticVehicleTrack(params: {
  trackId: string;
  cameraId: string;
  vehicleClass?: 'CAR' | 'TRUCK' | 'BUS' | 'VAN' | 'MOTORCYCLE';
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  confidence?: number;
  timestamp?: string;
}): Track {
  const timestamp = params.timestamp || new Date().toISOString();
  const box = {
    x: params.x ?? 0.35,
    y: params.y ?? 0.45,
    width: params.width ?? 0.30,
    height: params.height ?? 0.25,
  };

  return {
    trackId: params.trackId,
    numericId: parseInt(params.trackId.replace(/\D/g, ''), 10) || 1,
    cameraId: params.cameraId,
    objectType: 'vehicle',
    vehicleClass: params.vehicleClass || 'CAR',
    class: params.vehicleClass || 'CAR',
    createdAt: timestamp,
    firstSeenAt: timestamp,
    lastSeenAt: timestamp,
    lastBoundingBox: box,
    lastPixelBox: {
      xmin: Math.round(box.x * 1920),
      ymin: Math.round(box.y * 1080),
      xmax: Math.round((box.x + box.width) * 1920),
      ymax: Math.round((box.y + box.height) * 1080),
    },
    trajectory: [
      {
        timestamp,
        x: box.x,
        y: box.y,
        centerX: box.x + box.width / 2,
        centerY: box.y + box.height / 2,
        boundingBox: { ...box },
      },
    ],
    detectionCount: 1,
    missedFrames: 0,
    currentConfidence: params.confidence ?? 0.95,
    state: 'ACTIVE',
    direction: 'NORTH',
    dwellTimeSeconds: 5,
    contributingDetectionIds: [`det-${params.trackId}-1`],
    modelVersion: 'YOLOS-tiny',
    isSimulation: true,
  };
}

/**
 * Creates a localized plate detection relative to vehicle bounding box.
 */
export function createSyntheticPlateDetection(params: {
  plateDetectionId: string;
  vehicleTrack: Track;
  confidence?: number;
  relX?: number;
  relY?: number;
  relW?: number;
  relH?: number;
  timestamp?: string;
}): PlateDetection {
  const vBox = params.vehicleTrack.lastBoundingBox;
  const relX = params.relX ?? 0.28;
  const relY = params.relY ?? 0.70;
  const relW = params.relW ?? 0.44;
  const relH = params.relH ?? 0.22;

  const boundingBox = {
    x: Number((vBox.x + relX * vBox.width).toFixed(4)),
    y: Number((vBox.y + relY * vBox.height).toFixed(4)),
    width: Number((relW * vBox.width).toFixed(4)),
    height: Number((relH * vBox.height).toFixed(4)),
  };

  return {
    plateDetectionId: params.plateDetectionId,
    cameraId: params.vehicleTrack.cameraId,
    vehicleTrackId: params.vehicleTrack.trackId,
    boundingBox,
    pixelBox: {
      xmin: Math.round(boundingBox.x * 1920),
      ymin: Math.round(boundingBox.y * 1080),
      xmax: Math.round((boundingBox.x + boundingBox.width) * 1920),
      ymax: Math.round((boundingBox.y + boundingBox.height) * 1080),
    },
    relativeToVehicleBox: { x: relX, y: relY, width: relW, height: relH },
    confidence: params.confidence ?? 0.92,
    timestamp: params.timestamp || params.vehicleTrack.lastSeenAt,
    frameReference: 'frame-sim-001',
  };
}

/**
 * Executes Scenario A: Clearly readable plate resulting in CONFIRMED recognition.
 */
export function runScenarioA(service: AnprService): AnprScenarioResult {
  const track = createSyntheticVehicleTrack({
    trackId: 'VEH-CAM-09-0010',
    cameraId: 'CAM-09',
    vehicleClass: 'CAR',
  });

  const plate = createSyntheticPlateDetection({
    plateDetectionId: 'pld-sc-a-01',
    vehicleTrack: track,
    confidence: 0.94,
  });

  const { record } = service.ingestObservation({
    vehicleTrack: track,
    plate,
    rawOcrText: 'TS09AB1234',
    ocrConfidence: 0.92,
    isSimulation: true,
  });

  const passes =
    record.normalizedPlate === 'TS09AB1234' &&
    record.recognitionStatus === 'CONFIRMED' &&
    record.vehicleTrackId === 'VEH-CAM-09-0010';

  return {
    scenarioName: 'SCENARIO_A',
    description: 'Vehicle with clearly readable license plate (TS09AB1234)',
    isSimulation: true,
    records: [record],
    assertionsPass: passes,
    notes: [
      `Normalized plate: ${record.normalizedPlate}`,
      `Status: ${record.recognitionStatus}`,
      `Overall confidence: ${record.overallConfidence}`,
    ],
  };
}

/**
 * Executes Scenario B: Partially unreadable/obscured plate resulting in UNCERTAIN status.
 */
export function runScenarioB(service: AnprService): AnprScenarioResult {
  const track = createSyntheticVehicleTrack({
    trackId: 'VEH-CAM-09-0020',
    cameraId: 'CAM-09',
    vehicleClass: 'TRUCK',
  });

  const plate = createSyntheticPlateDetection({
    plateDetectionId: 'pld-sc-b-01',
    vehicleTrack: track,
    confidence: 0.65,
  });

  const { record } = service.ingestObservation({
    vehicleTrack: track,
    plate,
    rawOcrText: 'TX?80_KL',
    ocrConfidence: 0.48,
    isSimulation: true,
  });

  const passes =
    (record.recognitionStatus === 'UNCERTAIN' || record.recognitionStatus === 'UNREADABLE') &&
    record.vehicleTrackId === 'VEH-CAM-09-0020';

  return {
    scenarioName: 'SCENARIO_B',
    description: 'Vehicle with partially unreadable / low-confidence plate',
    isSimulation: true,
    records: [record],
    assertionsPass: passes,
    notes: [
      `Raw text: ${record.rawPlateText}`,
      `Status: ${record.recognitionStatus}`,
      `OCR Confidence: ${record.ocrConfidence}`,
    ],
  };
}

/**
 * Executes Scenario C: Multiple vehicles with distinct license plates in same scene.
 */
export function runScenarioC(service: AnprService): AnprScenarioResult {
  const track1 = createSyntheticVehicleTrack({
    trackId: 'VEH-CAM-09-0031',
    cameraId: 'CAM-09',
    vehicleClass: 'VAN',
    x: 0.10,
    y: 0.35,
  });

  const track2 = createSyntheticVehicleTrack({
    trackId: 'VEH-CAM-09-0032',
    cameraId: 'CAM-09',
    vehicleClass: 'TRUCK',
    x: 0.55,
    y: 0.40,
  });

  const plate1 = createSyntheticPlateDetection({
    plateDetectionId: 'pld-sc-c-01',
    vehicleTrack: track1,
    confidence: 0.95,
  });

  const plate2 = createSyntheticPlateDetection({
    plateDetectionId: 'pld-sc-c-02',
    vehicleTrack: track2,
    confidence: 0.91,
  });

  const res1 = service.ingestObservation({
    vehicleTrack: track1,
    plate: plate1,
    rawOcrText: 'AZ-982-FX',
    ocrConfidence: 0.96,
    isSimulation: true,
  });

  const res2 = service.ingestObservation({
    vehicleTrack: track2,
    plate: plate2,
    rawOcrText: 'NM-441-BP',
    ocrConfidence: 0.93,
    isSimulation: true,
  });

  const passes =
    res1.record.normalizedPlate === 'AZ982FX' &&
    res2.record.normalizedPlate === 'NM441BP' &&
    res1.record.vehicleTrackId !== res2.record.vehicleTrackId;

  return {
    scenarioName: 'SCENARIO_C',
    description: 'Two concurrent vehicles with distinct license plates (AZ-982-FX and NM-441-BP)',
    isSimulation: true,
    records: [res1.record, res2.record],
    assertionsPass: passes,
    notes: [
      `Track 1: ${track1.trackId} -> ${res1.record.normalizedPlate}`,
      `Track 2: ${track2.trackId} -> ${res2.record.normalizedPlate}`,
    ],
  };
}

/**
 * Executes Scenario D: Vehicle temporarily occluded while preserving persistent plate association.
 */
export function runScenarioD(service: AnprService): AnprScenarioResult {
  const track = createSyntheticVehicleTrack({
    trackId: 'VEH-CAM-09-0040',
    cameraId: 'CAM-09',
    vehicleClass: 'BUS',
  });

  const plate = createSyntheticPlateDetection({
    plateDetectionId: 'pld-sc-d-01',
    vehicleTrack: track,
    confidence: 0.93,
  });

  // Initial read
  const resInitial = service.ingestObservation({
    vehicleTrack: track,
    plate,
    rawOcrText: 'TX-802-KL',
    ocrConfidence: 0.91,
    isSimulation: true,
  });

  // Simulate occlusion: track missed frames increment, but persistent record remains linked
  track.missedFrames = 2;
  track.state = 'TEMPORARILY_LOST';

  const persistedRecord = service.getRecordByTrackId('VEH-CAM-09-0040');

  const passes =
    persistedRecord !== undefined &&
    persistedRecord.normalizedPlate === 'TX802KL' &&
    persistedRecord.observationCount === 1;

  return {
    scenarioName: 'SCENARIO_D',
    description: 'Vehicle temporarily occluded while retaining persistent plate association',
    isSimulation: true,
    records: persistedRecord ? [persistedRecord] : [],
    assertionsPass: passes,
    notes: [
      `Track state during occlusion: ${track.state}`,
      `Retained Plate: ${persistedRecord?.normalizedPlate}`,
    ],
  };
}

/**
 * Executes Scenario E: Progressive multi-frame consensus
 * Frame 1: TS09AB12?4 (confidence 0.60)
 * Frame 2: TS09AB1234 (confidence 0.88)
 * Frame 3: TS09AB1234 (confidence 0.92)
 * Final Result -> TS09AB1234 CONFIRMED
 */
export function runScenarioE(service: AnprService): AnprScenarioResult {
  const track = createSyntheticVehicleTrack({
    trackId: 'VEH-CAM-09-0050',
    cameraId: 'CAM-09',
    vehicleClass: 'CAR',
  });

  const plate1 = createSyntheticPlateDetection({
    plateDetectionId: 'pld-sc-e-01',
    vehicleTrack: track,
    confidence: 0.70,
  });

  // Frame 1
  service.ingestObservation({
    vehicleTrack: track,
    plate: plate1,
    rawOcrText: 'TS09AB12?4',
    ocrConfidence: 0.60,
    isSimulation: true,
  });

  const plate2 = createSyntheticPlateDetection({
    plateDetectionId: 'pld-sc-e-02',
    vehicleTrack: track,
    confidence: 0.90,
  });

  // Frame 2
  service.ingestObservation({
    vehicleTrack: track,
    plate: plate2,
    rawOcrText: 'TS09AB1234',
    ocrConfidence: 0.88,
    isSimulation: true,
  });

  const plate3 = createSyntheticPlateDetection({
    plateDetectionId: 'pld-sc-e-03',
    vehicleTrack: track,
    confidence: 0.95,
  });

  // Frame 3
  const finalRes = service.ingestObservation({
    vehicleTrack: track,
    plate: plate3,
    rawOcrText: 'TS09AB1234',
    ocrConfidence: 0.94,
    isSimulation: true,
  });

  const passes =
    finalRes.record.normalizedPlate === 'TS09AB1234' &&
    finalRes.record.observationCount === 3 &&
    finalRes.record.recognitionStatus === 'CONFIRMED';

  return {
    scenarioName: 'SCENARIO_E',
    description: 'Progressive multi-frame consensus overcoming partial obstruction',
    isSimulation: true,
    records: [finalRes.record],
    assertionsPass: passes,
    notes: [
      `Frame 1 raw: TS09AB12?4`,
      `Frame 2 raw: TS09AB1234`,
      `Frame 3 raw: TS09AB1234`,
      `Consensus Plate: ${finalRes.record.normalizedPlate}`,
      `Final Status: ${finalRes.record.recognitionStatus}`,
      `Total Observations: ${finalRes.record.observationCount}`,
    ],
  };
}
