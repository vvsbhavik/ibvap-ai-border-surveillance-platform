/**
 * IBVAP — Digital Twin & Border Simulation Environment Types
 * Deterministic scenario controls and test data isolation.
 */

export type SimulationScenarioId =
  | 'SCENARIO_A' // Vehicle follows expected camera corridor
  | 'SCENARIO_B' // Vehicle enters restricted zone
  | 'SCENARIO_C' // Person crosses virtual fence
  | 'SCENARIO_D' // Night movement
  | 'SCENARIO_E' // Repeated fence crossing
  | 'SCENARIO_F' // Camera failure during active movement
  | 'SCENARIO_G' // Multi-camera correlated movement
  | 'SCENARIO_H' // ANPR watchlist match
  | 'SCENARIO_I' // Face watchlist match
  | 'SCENARIO_J'; // Combined incident

export interface SimulationScenarioDefinition {
  id: SimulationScenarioId;
  code: string;
  name: string;
  description: string;
  primaryEntityType: 'VEHICLE' | 'PERSON' | 'MULTI_ACTOR';
  involvedCameras: string[];
  involvedSectors: string[];
  estimatedDurationSeconds: number;
  expectedAlertTypes: string[];
  expectedViolations: string[];
  category: 'CORRIDOR_TRANSIT' | 'PERIMETER_BREACH' | 'OPTICAL_FAILURE' | 'WATCHLIST_HIT' | 'COMPLEX_INCIDENT';
}

export interface SimulatedActor {
  actorId: string;
  entityType: 'VEHICLE' | 'PERSON';
  targetIdentifier: string; // Plate text or subject callsign
  currentCameraId: string;
  currentCameraIdentifier: string;
  latitude: number;
  longitude: number;
  heading: number;
  speedKmh: number;
  dwellTimeSeconds: number;
  routeProgress: number; // 0.0 to 1.0
  activeStatus: 'TRANSITING' | 'LOITERING' | 'BREACHING' | 'ESCAPING' | 'RESOLVED';
  matchedWatchlistId?: string;
}

export interface DigitalTwinState {
  status: 'IDLE' | 'RUNNING' | 'PAUSED' | 'COMPLETED';
  activeScenario: SimulationScenarioDefinition | null;
  speedMultiplier: number;
  elapsedSeconds: number;
  activeActors: SimulatedActor[];
  recentEventsEmitted: {
    eventId: string;
    eventType: string;
    timestamp: string;
    description: string;
  }[];
  isSimulationMode: true;
  provenanceLabel: 'SIMULATION MODE / TEST DATA';
  lastResetAt: string;
  simulationRunCount: number;
}
