/**
 * IBVAP — Edge Node & Offline Resilience Service
 *
 * Simulates ruggedized forward edge compute nodes, local bounded queuing,
 * network outage buffering, and deduplicated event synchronization.
 */

import {
  EdgeNode,
  BufferedEdgeEvent,
  EdgeSyncResult,
} from './types';
import { dataStore } from '../server/store';
import { logger } from '../server/logger';

class EdgeNodeService {
  private edgeNodes: Map<string, EdgeNode> = new Map();
  private localBuffers: Map<string, BufferedEdgeEvent[]> = new Map();
  // Global set of processed event IDs to guarantee strict deduplication
  private processedEventIds: Set<string> = new Set();

  constructor() {
    this.initializeEdgeNodes();
  }

  private initializeEdgeNodes(): void {
    const defaultNodes: EdgeNode[] = [
      {
        edgeNodeId: 'EDGE-NODE-NORTH-01',
        name: 'Sector Bravo Ruggedized Edge Gateway 01',
        sectorId: 'sec-bravo',
        sectorName: 'Sector Bravo — Northern Ridge',
        assignedCameras: ['CAM-01', 'CAM-02', 'CAM-03', 'CAM-04'],
        connectivityState: 'ONLINE',
        localProcessingState: 'ACTIVE',
        bufferState: {
          queueLength: 0,
          maxQueueSize: 500,
          oldestEventTimestamp: null,
          droppedEventsCount: 0,
        },
        lastSyncTimestamp: new Date().toISOString(),
        softwareVersion: 'ibvap-edge-daemon-v2.3.4-alpine',
        hardwareProfile: 'Mil-Spec Xeon-D 8-Core / 32GB ECC / Dual SFP+ Optical',
        isSimulatedArchitecture: true,
        provenanceLabel: 'SIMULATED EDGE NODE ARCHITECTURE',
      },
      {
        edgeNodeId: 'EDGE-NODE-RIVER-02',
        name: 'Sector Delta River Confluence Edge Gateway 02',
        sectorId: 'sec-delta',
        sectorName: 'Sector Delta — River Confluence',
        assignedCameras: ['CAM-05', 'CAM-06', 'CAM-07', 'CAM-08'],
        connectivityState: 'ONLINE',
        localProcessingState: 'ACTIVE',
        bufferState: {
          queueLength: 0,
          maxQueueSize: 500,
          oldestEventTimestamp: null,
          droppedEventsCount: 0,
        },
        lastSyncTimestamp: new Date().toISOString(),
        softwareVersion: 'ibvap-edge-daemon-v2.3.4-alpine',
        hardwareProfile: 'Mil-Spec Xeon-D 8-Core / 32GB ECC / Dual SFP+ Optical',
        isSimulatedArchitecture: true,
        provenanceLabel: 'SIMULATED EDGE NODE ARCHITECTURE',
      },
      {
        edgeNodeId: 'EDGE-NODE-SOUTH-03',
        name: 'Sector Sierra High-Mast Radar Edge Gateway 03',
        sectorId: 'sec-sierra',
        sectorName: 'Sector Sierra — Desert Plain',
        assignedCameras: ['CAM-09', 'CAM-10', 'CAM-11', 'CAM-12'],
        connectivityState: 'ONLINE',
        localProcessingState: 'ACTIVE',
        bufferState: {
          queueLength: 0,
          maxQueueSize: 500,
          oldestEventTimestamp: null,
          droppedEventsCount: 0,
        },
        lastSyncTimestamp: new Date().toISOString(),
        softwareVersion: 'ibvap-edge-daemon-v2.3.4-alpine',
        hardwareProfile: 'Mil-Spec Xeon-D 8-Core / 32GB ECC / Dual SFP+ Optical',
        isSimulatedArchitecture: true,
        provenanceLabel: 'SIMULATED EDGE NODE ARCHITECTURE',
      },
    ];

    defaultNodes.forEach((node) => {
      this.edgeNodes.set(node.edgeNodeId, node);
      this.localBuffers.set(node.edgeNodeId, []);
    });
  }

  public getAllNodes(): EdgeNode[] {
    return Array.from(this.edgeNodes.values());
  }

  public getNode(edgeNodeId: string): EdgeNode | undefined {
    return this.edgeNodes.get(edgeNodeId);
  }

  public getNodeForCamera(cameraId: string): EdgeNode | undefined {
    return this.getAllNodes().find((n) => n.assignedCameras.includes(cameraId));
  }

  /**
   * Buffers an event into the local edge queue (bounded FIFO).
   */
  public bufferEvent(edgeNodeId: string, event: Omit<BufferedEdgeEvent, 'queuedAt'>): void {
    const node = this.edgeNodes.get(edgeNodeId);
    let queue = this.localBuffers.get(edgeNodeId);

    if (!node || !queue) {
      throw new Error(`Edge node [${edgeNodeId}] not found`);
    }

    const queuedEvent: BufferedEdgeEvent = {
      ...event,
      queuedAt: new Date().toISOString(),
    };

    // FIFO eviction if max queue size reached
    if (queue.length >= node.bufferState.maxQueueSize) {
      queue.shift(); // drop oldest
      node.bufferState.droppedEventsCount += 1;
    }

    queue.push(queuedEvent);
    node.bufferState.queueLength = queue.length;
    node.bufferState.oldestEventTimestamp = queue[0]?.timestamp || null;
  }

  /**
   * Simulates a wide-area network or fiber outage disconnecting the edge node.
   */
  public simulateDisconnect(edgeNodeId: string, userCallsign: string = 'TECH-OP-01'): EdgeNode {
    const node = this.edgeNodes.get(edgeNodeId);
    if (!node) throw new Error(`Edge node [${edgeNodeId}] not found`);

    node.connectivityState = 'OFFLINE';
    node.localProcessingState = 'ACTIVE'; // Edge continues local inference in autonomous disconnected mode

    // Inject simulated local telemetry events into the offline buffer
    const now = new Date();
    node.assignedCameras.forEach((camId, idx) => {
      this.bufferEvent(edgeNodeId, {
        eventId: `buf-evt-${edgeNodeId.toLowerCase()}-${camId.toLowerCase()}-${now.getTime()}-${idx}`,
        eventType: 'spatial.zone.dwell',
        cameraId: camId,
        trackId: `edge-trk-${camId}-local`,
        timestamp: new Date(now.getTime() - (idx + 1) * 3000).toISOString(),
        sourceMode: 'SIMULATION',
        payload: {
          dwellTimeSeconds: 15 + idx * 5,
          zoneId: 'zone-b1',
          autonomousEdgeProcessed: true,
        },
      });
    });

    dataStore.logAudit(
      userCallsign,
      'EDGE_DISCONNECT_SIMULATION',
      'EDGE_NODE',
      edgeNodeId,
      '127.0.0.1',
      { status: 'OFFLINE', bufferLength: node.bufferState.queueLength },
      'SUCCESS'
    );

    dataStore.broadcastEvent({
      eventId: `evt-edge-disc-${edgeNodeId}`,
      eventType: 'edge.status_change',
      timestamp: new Date().toISOString(),
      source: 'ibvap-edge-service',
      payload: { edgeNodeId, connectivityState: 'OFFLINE', bufferState: node.bufferState },
    });

    logger.warn(`[EdgeService] Edge node ${edgeNodeId} simulated OFFLINE. Autonomous edge buffering active.`);
    return node;
  }

  /**
   * Simulates network recovery, transitioning through SYNCING to ONLINE
   * with complete deduplicated event ingestion.
   */
  public async simulateReconnectAndSync(
    edgeNodeId: string,
    userCallsign: string = 'TECH-OP-01'
  ): Promise<EdgeSyncResult> {
    const node = this.edgeNodes.get(edgeNodeId);
    const queue = this.localBuffers.get(edgeNodeId);

    if (!node || !queue) {
      throw new Error(`Edge node [${edgeNodeId}] not found`);
    }

    const startTime = Date.now();

    // 1. Enter SYNCING state
    node.connectivityState = 'SYNCING';
    dataStore.broadcastEvent({
      eventId: `evt-edge-sync-start-${edgeNodeId}`,
      eventType: 'edge.sync_started',
      timestamp: new Date().toISOString(),
      source: 'ibvap-edge-service',
      payload: { edgeNodeId, queuedEventsCount: queue.length },
    });

    let syncedCount = 0;
    let deduplicatedCount = 0;

    // 2. Process and deduplicate each buffered event
    while (queue.length > 0) {
      const event = queue.shift()!;
      if (this.processedEventIds.has(event.eventId)) {
        deduplicatedCount += 1;
      } else {
        this.processedEventIds.add(event.eventId);
        syncedCount += 1;

        // Broadcast to central SSE consumers with original preserved timestamps
        dataStore.broadcastEvent({
          eventId: event.eventId,
          eventType: event.eventType,
          timestamp: event.timestamp,
          source: `edge-synced:${edgeNodeId}`,
          payload: {
            ...event.payload,
            cameraId: event.cameraId,
            trackId: event.trackId,
            edgeSynchronized: true,
          },
        });
      }
    }

    // 3. Update buffer state and transition back to ONLINE
    node.bufferState.queueLength = 0;
    node.bufferState.oldestEventTimestamp = null;
    node.lastSyncTimestamp = new Date().toISOString();
    node.connectivityState = 'ONLINE';

    const result: EdgeSyncResult = {
      edgeNodeId,
      syncedEventsCount: syncedCount,
      deduplicatedCount,
      remainingQueueLength: 0,
      syncDurationMs: Date.now() - startTime,
      completedAt: node.lastSyncTimestamp,
      status: 'SUCCESS',
    };

    dataStore.logAudit(
      userCallsign,
      'EDGE_SYNC_COMPLETED',
      'EDGE_NODE',
      edgeNodeId,
      '127.0.0.1',
      { syncedCount, deduplicatedCount, durationMs: result.syncDurationMs },
      'SUCCESS'
    );

    dataStore.broadcastEvent({
      eventId: `evt-edge-sync-done-${edgeNodeId}`,
      eventType: 'edge.sync_completed',
      timestamp: result.completedAt,
      source: 'ibvap-edge-service',
      payload: result,
    });

    logger.info(`[EdgeService] Edge node ${edgeNodeId} synced ${syncedCount} events (${deduplicatedCount} deduplicated).`);
    return result;
  }
}

export const edgeNodeService = new EdgeNodeService();
