/**
 * IBVAP — Edge Node Abstraction & Offline Resilience Types
 * Models distributed edge gateways, bounded offline queues, and deduplicated synchronization.
 */

export type EdgeConnectivityState =
  | 'ONLINE'
  | 'DEGRADED'
  | 'OFFLINE'
  | 'SYNCING'
  | 'UNKNOWN';

export type EdgeProcessingState = 'ACTIVE' | 'DEGRADED' | 'IDLE';

export interface BufferedEdgeEvent {
  eventId: string;
  eventType: string;
  cameraId: string;
  trackId?: string;
  timestamp: string;
  sourceMode: 'LIVE' | 'SIMULATION';
  payload: Record<string, unknown>;
  queuedAt: string;
}

export interface EdgeBufferState {
  queueLength: number;
  maxQueueSize: number;
  oldestEventTimestamp: string | null;
  droppedEventsCount: number;
}

export interface EdgeNode {
  edgeNodeId: string;
  name: string;
  sectorId: string;
  sectorName: string;
  assignedCameras: string[]; // e.g. ['CAM-01', 'CAM-02', 'CAM-03', 'CAM-04']
  connectivityState: EdgeConnectivityState;
  localProcessingState: EdgeProcessingState;
  bufferState: EdgeBufferState;
  lastSyncTimestamp: string;
  softwareVersion: string;
  hardwareProfile: string;
  isSimulatedArchitecture: true;
  provenanceLabel: 'SIMULATED EDGE NODE ARCHITECTURE';
}

export interface EdgeSyncResult {
  edgeNodeId: string;
  syncedEventsCount: number;
  deduplicatedCount: number;
  remainingQueueLength: number;
  syncDurationMs: number;
  completedAt: string;
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED';
}
