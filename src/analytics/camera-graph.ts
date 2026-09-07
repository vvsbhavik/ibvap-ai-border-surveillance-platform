/**
 * IBVAP — Authoritative Border Camera Graph & Spatial Topology
 *
 * Models physical camera locations, mast adjacencies, transit corridors,
 * expected route timings, and sector transitions for CAM-01 through CAM-12.
 */

import { CameraGraph, CameraGraphNode, CameraGraphEdge } from './types';
import { MovementDirection } from '../tracking/types';
import { dataStore } from '../server/store';

class CameraGraphManager {
  private graph: CameraGraph;

  constructor() {
    this.graph = this.buildAuthoritativeGraph();
  }

  private buildAuthoritativeGraph(): CameraGraph {
    // Generate nodes from actual registered cameras
    const nodes: CameraGraphNode[] = dataStore.cameras.map((c) => ({
      cameraId: c.cameraId,
      cameraIdentifier: c.identifier || c.cameraId,
      name: c.name,
      sectorId: c.sectorId,
      sectorName: c.sectorName || 'Sector Alpha',
      latitude: c.latitude,
      longitude: c.longitude,
      cameraType: c.cameraType,
      status: c.status,
      hasANPR: c.aiAnalyticsStatus?.anpr === 'ACTIVE' || c.aiAnalyticsStatus?.anpr === 'CONFIGURED',
      hasThermal: c.cameraType.includes('THERMAL'),
      hasFaceAnalytics: c.aiAnalyticsStatus?.faceAnalytics === 'ACTIVE' || c.aiAnalyticsStatus?.faceAnalytics === 'CONFIGURED',
      isPtSupported: !!c.isPtSupported,
    }));

    // Authoritative edges defining real corridor topology
    const edges: CameraGraphEdge[] = [
      // 1. Sector Bravo - Ridge Corridor
      {
        edgeId: 'edge-01-02',
        fromCameraId: 'CAM-01',
        toCameraId: 'CAM-02',
        relationshipType: 'PHYSICAL_ADJACENCY',
        distanceMeters: 850,
        minTransitSeconds: 40,
        maxTransitSeconds: 300,
        expectedDirection: 'SOUTHEAST',
        routeDescription: 'Perimeter Ridge Mast North to Ridge Pass Overlook East',
        isRestrictedTransition: false,
      },
      {
        edgeId: 'edge-02-01',
        fromCameraId: 'CAM-02',
        toCameraId: 'CAM-01',
        relationshipType: 'PHYSICAL_ADJACENCY',
        distanceMeters: 850,
        minTransitSeconds: 40,
        maxTransitSeconds: 300,
        expectedDirection: 'NORTHWEST',
        routeDescription: 'Ridge Pass Overlook East to Perimeter Ridge Mast North',
        isRestrictedTransition: false,
      },
      {
        edgeId: 'edge-01-03',
        fromCameraId: 'CAM-01',
        toCameraId: 'CAM-03',
        relationshipType: 'PHYSICAL_ADJACENCY',
        distanceMeters: 620,
        minTransitSeconds: 30,
        maxTransitSeconds: 240,
        expectedDirection: 'SOUTH',
        routeDescription: 'Ridge Mast North into Canyon Funnel Choke',
        isRestrictedTransition: true,
      },
      {
        edgeId: 'edge-03-01',
        fromCameraId: 'CAM-03',
        toCameraId: 'CAM-01',
        relationshipType: 'PHYSICAL_ADJACENCY',
        distanceMeters: 620,
        minTransitSeconds: 30,
        maxTransitSeconds: 240,
        expectedDirection: 'NORTH',
        routeDescription: 'Canyon Funnel north ascent to Ridge Mast',
        isRestrictedTransition: false,
      },
      {
        edgeId: 'edge-02-04',
        fromCameraId: 'CAM-02',
        toCameraId: 'CAM-04',
        relationshipType: 'PHYSICAL_ADJACENCY',
        distanceMeters: 1100,
        minTransitSeconds: 50,
        maxTransitSeconds: 450,
        expectedDirection: 'EAST',
        routeDescription: 'Ridge Pass Overlook East to Perimeter Fence Bravo-4',
        isRestrictedTransition: true,
      },
      {
        edgeId: 'edge-04-02',
        fromCameraId: 'CAM-04',
        toCameraId: 'CAM-02',
        relationshipType: 'PHYSICAL_ADJACENCY',
        distanceMeters: 1100,
        minTransitSeconds: 50,
        maxTransitSeconds: 450,
        expectedDirection: 'WEST',
        routeDescription: 'Perimeter Fence Bravo-4 return west to Ridge Pass',
        isRestrictedTransition: false,
      },
      {
        edgeId: 'edge-03-04',
        fromCameraId: 'CAM-03',
        toCameraId: 'CAM-04',
        relationshipType: 'EXPECTED_TRANSIT_ROUTE',
        distanceMeters: 950,
        minTransitSeconds: 45,
        maxTransitSeconds: 360,
        expectedDirection: 'SOUTHEAST',
        routeDescription: 'Canyon Funnel egress toward Perimeter Fence Bravo-4',
        isRestrictedTransition: true,
      },

      // 2. Sector Bravo -> Delta Transition (Ridge to River corridor)
      {
        edgeId: 'edge-04-05',
        fromCameraId: 'CAM-04',
        toCameraId: 'CAM-05',
        relationshipType: 'SECTOR_TRANSITION',
        distanceMeters: 1800,
        minTransitSeconds: 90,
        maxTransitSeconds: 600,
        expectedDirection: 'SOUTH',
        routeDescription: 'Perimeter Fence Bravo-4 south descent to River Shallows Approach',
        isRestrictedTransition: true,
      },
      {
        edgeId: 'edge-05-04',
        fromCameraId: 'CAM-05',
        toCameraId: 'CAM-04',
        relationshipType: 'SECTOR_TRANSITION',
        distanceMeters: 1800,
        minTransitSeconds: 90,
        maxTransitSeconds: 600,
        expectedDirection: 'NORTH',
        routeDescription: 'River Shallows north ascent into Sector Bravo Perimeter',
        isRestrictedTransition: true,
      },

      // 3. Sector Delta - River Corridor
      {
        edgeId: 'edge-05-06',
        fromCameraId: 'CAM-05',
        toCameraId: 'CAM-06',
        relationshipType: 'PHYSICAL_ADJACENCY',
        distanceMeters: 750,
        minTransitSeconds: 35,
        maxTransitSeconds: 280,
        expectedDirection: 'EAST',
        routeDescription: 'River Shallows downstream east to River Bank South Choke',
        isRestrictedTransition: true,
      },
      {
        edgeId: 'edge-06-05',
        fromCameraId: 'CAM-06',
        toCameraId: 'CAM-05',
        relationshipType: 'PHYSICAL_ADJACENCY',
        distanceMeters: 750,
        minTransitSeconds: 35,
        maxTransitSeconds: 280,
        expectedDirection: 'WEST',
        routeDescription: 'River Bank South upstream west to River Shallows',
        isRestrictedTransition: true,
      },
      {
        edgeId: 'edge-06-07',
        fromCameraId: 'CAM-06',
        toCameraId: 'CAM-07',
        relationshipType: 'PHYSICAL_ADJACENCY',
        distanceMeters: 1250,
        minTransitSeconds: 60,
        maxTransitSeconds: 420,
        expectedDirection: 'SOUTHEAST',
        routeDescription: 'River Bank South to Floodplain Culvert Watch',
        isRestrictedTransition: true,
      },
      {
        edgeId: 'edge-07-06',
        fromCameraId: 'CAM-07',
        toCameraId: 'CAM-06',
        relationshipType: 'PHYSICAL_ADJACENCY',
        distanceMeters: 1250,
        minTransitSeconds: 60,
        maxTransitSeconds: 420,
        expectedDirection: 'NORTHWEST',
        routeDescription: 'Floodplain Culvert Watch to River Bank South',
        isRestrictedTransition: true,
      },

      // 4. Delta to Charlie Transit (Floodplain to Checkpoint approach)
      {
        edgeId: 'edge-07-08',
        fromCameraId: 'CAM-07',
        toCameraId: 'CAM-08',
        relationshipType: 'SECTOR_TRANSITION',
        distanceMeters: 2200,
        minTransitSeconds: 80,
        maxTransitSeconds: 700,
        expectedDirection: 'NORTHEAST',
        routeDescription: 'Floodplain Culvert egress toward Highway 10 Approach',
        isRestrictedTransition: false,
      },
      {
        edgeId: 'edge-02-08',
        fromCameraId: 'CAM-02',
        toCameraId: 'CAM-08',
        relationshipType: 'SECTOR_TRANSITION',
        distanceMeters: 2800,
        minTransitSeconds: 120,
        maxTransitSeconds: 900,
        expectedDirection: 'SOUTHEAST',
        routeDescription: 'Ridge Pass access road toward Highway 10 Checkpoint Approach',
        isRestrictedTransition: false,
      },

      // 5. Sector Charlie - Highway & Checkpoint Facility
      {
        edgeId: 'edge-08-09',
        fromCameraId: 'CAM-08',
        toCameraId: 'CAM-09',
        relationshipType: 'CHECKPOINT_CORRIDOR',
        distanceMeters: 600,
        minTransitSeconds: 20,
        maxTransitSeconds: 150,
        expectedDirection: 'NORTH',
        routeDescription: 'Highway 10 Approach into Checkpoint Alpha Gate Inbound',
        isRestrictedTransition: false,
      },
      {
        edgeId: 'edge-09-08',
        fromCameraId: 'CAM-09',
        toCameraId: 'CAM-08',
        relationshipType: 'CHECKPOINT_CORRIDOR',
        distanceMeters: 600,
        minTransitSeconds: 20,
        maxTransitSeconds: 150,
        expectedDirection: 'SOUTH',
        routeDescription: 'Checkpoint Gate rejection turnaround back to Highway 10 Approach',
        isRestrictedTransition: false,
      },
      {
        edgeId: 'edge-09-10',
        fromCameraId: 'CAM-09',
        toCameraId: 'CAM-10',
        relationshipType: 'CHECKPOINT_CORRIDOR',
        distanceMeters: 250,
        minTransitSeconds: 15,
        maxTransitSeconds: 120,
        expectedDirection: 'EAST',
        routeDescription: 'Checkpoint Inbound Lane diverted to Commercial Truck Inspection',
        isRestrictedTransition: false,
      },
      {
        edgeId: 'edge-09-11',
        fromCameraId: 'CAM-09',
        toCameraId: 'CAM-11',
        relationshipType: 'CHECKPOINT_CORRIDOR',
        distanceMeters: 200,
        minTransitSeconds: 10,
        maxTransitSeconds: 90,
        expectedDirection: 'NORTHEAST',
        routeDescription: 'Primary Gate redirected to Secondary Inspection Pad',
        isRestrictedTransition: false,
      },
      {
        edgeId: 'edge-10-12',
        fromCameraId: 'CAM-10',
        toCameraId: 'CAM-12',
        relationshipType: 'CHECKPOINT_CORRIDOR',
        distanceMeters: 350,
        minTransitSeconds: 20,
        maxTransitSeconds: 180,
        expectedDirection: 'NORTH',
        routeDescription: 'Commercial Truck Inspection cleared to Border Station Exit',
        isRestrictedTransition: false,
      },
      {
        edgeId: 'edge-11-12',
        fromCameraId: 'CAM-11',
        toCameraId: 'CAM-12',
        relationshipType: 'CHECKPOINT_CORRIDOR',
        distanceMeters: 280,
        minTransitSeconds: 15,
        maxTransitSeconds: 120,
        expectedDirection: 'NORTH',
        routeDescription: 'Secondary Inspection cleared to Border Station Exit',
        isRestrictedTransition: false,
      },
      {
        edgeId: 'edge-09-12',
        fromCameraId: 'CAM-09',
        toCameraId: 'CAM-12',
        relationshipType: 'CHECKPOINT_CORRIDOR',
        distanceMeters: 400,
        minTransitSeconds: 20,
        maxTransitSeconds: 140,
        expectedDirection: 'NORTH',
        routeDescription: 'Primary Gate express clearance straight to Border Station Exit',
        isRestrictedTransition: false,
      },
    ];

    return {
      nodes,
      edges,
      updatedAt: new Date().toISOString(),
    };
  }

  public getGraph(): CameraGraph {
    return this.graph;
  }

  public getNodes(): CameraGraphNode[] {
    return this.graph.nodes;
  }

  public getEdges(): CameraGraphEdge[] {
    return this.graph.edges;
  }

  public getCorridors(): CameraGraphEdge[] {
    return this.graph.edges;
  }

  public getNode(cameraId: string): CameraGraphNode | undefined {
    return this.graph.nodes.find((n) => n.cameraId === cameraId);
  }

  public getAdjacentCameras(cameraId: string): CameraGraphEdge[] {
    return this.graph.edges.filter((e) => e.fromCameraId === cameraId);
  }

  public isAdjacent(camA: string, camB: string): boolean {
    return this.graph.edges.some((e) => e.fromCameraId === camA && e.toCameraId === camB);
  }

  public getExpectedTransit(fromCam: string, toCam: string): CameraGraphEdge | undefined {
    return this.graph.edges.find((e) => e.fromCameraId === fromCam && e.toCameraId === toCam);
  }

  /**
   * Breadth-first search for shortest corridor path between two cameras.
   */
  public findRoute(startCam: string, targetCam: string): string[] | null {
    if (startCam === targetCam) return [startCam];

    const queue: { current: string; path: string[] }[] = [{ current: startCam, path: [startCam] }];
    const visited = new Set<string>([startCam]);

    while (queue.length > 0) {
      const { current, path } = queue.shift()!;
      const neighbors = this.getAdjacentCameras(current);

      for (const edge of neighbors) {
        const next = edge.toCameraId;
        if (next === targetCam) {
          return [...path, next];
        }
        if (!visited.has(next)) {
          visited.add(next);
          queue.push({ current: next, path: [...path, next] });
        }
      }
    }

    return null; // Disjoint or non-contiguous
  }
}

export const cameraGraphManager = new CameraGraphManager();
