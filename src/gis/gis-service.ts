/**
 * IBVAP — GIS Geospatial & Operational Map Service
 *
 * Provides projection transformations, coverage arc calculations,
 * sector bounding polygons, and consolidated operational map context.
 */

import {
  GisOperationalContext,
  CameraGeographicProfile,
  MapSectorRegion,
  MapZonePolygon,
  MapVirtualFenceLine,
  MapIncidentPin,
  MapAlertPin,
  MapTopologyCorridor,
  MapReconstructedRoute,
} from './types';
import { dataStore } from '../server/store';
import { cameraTrustEngine } from '../camera-trust/trust-engine';
import { cameraGraphManager } from '../analytics/camera-graph';
import { calculateFovArcPath } from './gis-math';

export class GisService {
  /**
   * Compiles the comprehensive authoritative GIS operational context.
   */
  public getOperationalContext(): GisOperationalContext {
    const cameras = this.getEnrichedCameras();
    const sectors = this.getSectorRegions();
    const zones = this.getZonePolygons();
    const fences = this.getVirtualFenceLines();
    const incidents = this.getPlottedIncidents(cameras);
    const alerts = this.getPlottedAlerts(cameras);
    const topologyCorridors = this.getTopologyCorridors(cameras);
    const reconstructedRoutes = this.getReconstructedRoutes(cameras);

    // Compute bounding box encompassing all plotted border cameras
    let minLat = 90;
    let maxLat = -90;
    let minLon = 180;
    let maxLon = -180;

    cameras.forEach((c) => {
      if (c.latitude < minLat) minLat = c.latitude;
      if (c.latitude > maxLat) maxLat = c.latitude;
      if (c.longitude < minLon) minLon = c.longitude;
      if (c.longitude > maxLon) maxLon = c.longitude;
    });

    // Add padding margin to bounding box
    const padding = 0.015;
    const bounds = {
      minLat: minLat - padding,
      maxLat: maxLat + padding,
      minLon: minLon - padding,
      maxLon: maxLon + padding,
    };

    const onlineCameras = cameras.filter((c) => c.status === 'ONLINE').length;
    const degradedCameras = cameras.filter((c) => c.status === 'DEGRADED' || c.trustStatus === 'DEGRADED' || c.trustStatus === 'STALE').length;
    const offlineCameras = cameras.filter((c) => c.status === 'OFFLINE' || c.trustStatus === 'OFFLINE').length;
    const anomalyCameras = cameras.filter((c) => c.status === 'INTEGRITY_ANOMALY' || c.trustStatus === 'INTEGRITY_ANOMALY').length;

    return {
      timestamp: new Date().toISOString(),
      isSimulatedData: true,
      provenanceLabel: 'SIMULATED MAP DATA',
      bounds,
      cameras,
      sectors,
      zones,
      fences,
      incidents,
      alerts,
      topologyCorridors,
      reconstructedRoutes,
      summary: {
        totalCameras: cameras.length,
        onlineCameras,
        degradedCameras,
        offlineCameras,
        anomalyCameras,
        activeIncidents: incidents.length,
        highPriorityAlerts: alerts.filter((a) => a.severity === 'CRITICAL' || a.severity === 'HIGH').length,
      },
    };
  }

  /**
   * Enriches raw Camera datastore objects with geographic elevation, optical azimuth,
   * estimated coverage radius, capabilities, and real-time trust scores.
   */
  public getEnrichedCameras(): CameraGeographicProfile[] {
    const elevationLookup: Record<string, number> = {
      'CAM-01': 1420,
      'CAM-02': 1450,
      'CAM-03': 1380,
      'CAM-04': 1390,
      'CAM-05': 1120,
      'CAM-06': 1115,
      'CAM-07': 1130,
      'CAM-08': 1110,
      'CAM-09': 1250,
      'CAM-10': 1280,
      'CAM-11': 1240,
      'CAM-12': 1260,
    };

    const coverageRadiusLookup: Record<string, number> = {
      'CAM-01': 550,
      'CAM-02': 450,
      'CAM-03': 380,
      'CAM-04': 480,
      'CAM-05': 420,
      'CAM-06': 360,
      'CAM-07': 300,
      'CAM-08': 320,
      'CAM-09': 350,
      'CAM-10': 850,
      'CAM-11': 420,
      'CAM-12': 460,
    };

    return dataStore.cameras.map((cam) => {
      const trustEval = cameraTrustEngine.getEvaluation(cam.cameraId);
      const telemetry = cameraTrustEngine.getTelemetry(cam.cameraId);

      const activeAlerts = dataStore.alerts.filter(
        (a) => a.cameraId === cam.cameraId && a.status === 'PENDING_ACK'
      ).length;

      const sourceMode = 'SIMULATION';
      let sourceStatus: CameraGeographicProfile['sourceStatus'] = 'SIMULATION';
      if (cam.status === 'OFFLINE' || trustEval.status === 'OFFLINE') sourceStatus = 'OFFLINE';
      else if (cam.status === 'DEGRADED' || trustEval.status === 'DEGRADED') sourceStatus = 'DEGRADED';

      return {
        cameraId: cam.cameraId,
        cameraIdentifier: cam.identifier || cam.cameraId,
        name: cam.name,
        sectorId: cam.sectorId,
        sectorName: cam.sectorName || 'Sector Unknown',
        siteName: cam.siteName,
        latitude: cam.latitude,
        longitude: cam.longitude,
        elevationMeters: elevationLookup[cam.cameraId] ?? 1200,
        azimuthDegrees: cam.azimuthDegrees ?? 0,
        fieldOfViewDegrees: cam.fieldOfViewDegrees ?? 75,
        estimatedCoverageRadiusMeters: coverageRadiusLookup[cam.cameraId] ?? 400,
        cameraType: cam.cameraType,
        capabilities: {
          hasANPR: cam.aiAnalyticsStatus?.anpr === 'ACTIVE' || cam.aiAnalyticsStatus?.anpr === 'CONFIGURED',
          hasThermal: cam.cameraType.includes('THERMAL'),
          hasFaceAnalytics: cam.aiAnalyticsStatus?.faceAnalytics === 'ACTIVE' || cam.aiAnalyticsStatus?.faceAnalytics === 'CONFIGURED',
          hasPTZ: !!cam.isPtSupported || cam.cameraType.includes('PTZ'),
          hasNightAnalytics: cam.aiAnalyticsStatus?.nightAnalytics === 'ACTIVE' || cam.aiAnalyticsStatus?.nightAnalytics === 'CONFIGURED',
        },
        status: cam.status,
        sourceMode,
        sourceStatus,
        trustScore: trustEval.trustScore,
        trustStatus: trustEval.status,
        activeTracksCount: cam.status === 'ONLINE' ? (cam.cameraId === 'CAM-01' ? 2 : cam.cameraId === 'CAM-07' ? 1 : 0) : 0,
        activeAlertsCount: activeAlerts,
        lastFrameTimestamp: telemetry?.lastFrameTimestamp || undefined,
        frameAgeMs: telemetry?.frameAgeMs !== null ? telemetry?.frameAgeMs : undefined,
        streamState: telemetry?.streamState || 'STREAM_AVAILABLE',
        isSimulated: true,
      };
    });
  }

  /**
   * Generates geographic polygons for all sectors.
   */
  public getSectorRegions(): MapSectorRegion[] {
    const boundaryMap: Record<string, [number, number][]> = {
      'sec-bravo': [
        [31.4360, -109.9250],
        [31.4380, -109.9020],
        [31.4220, -109.8980],
        [31.4200, -109.9240],
      ],
      'sec-delta': [
        [31.4020, -109.8600],
        [31.4010, -109.8320],
        [31.3820, -109.8350],
        [31.3830, -109.8590],
      ],
      'sec-sierra': [
        [31.3550, -109.8050],
        [31.3520, -109.7750],
        [31.3280, -109.7780],
        [31.3300, -109.8020],
      ],
    };

    return dataStore.sectors.map((sec) => {
      const activeIncidents = dataStore.incidents.filter(
        (i) => i.sectorId === sec.id && (i.status === 'OPEN' || i.status === 'INVESTIGATING')
      ).length;

      const activeAlerts = dataStore.alerts.filter(
        (a) => a.sectorId === sec.id && a.status === 'PENDING_ACK'
      ).length;

      return {
        sectorId: sec.id,
        code: sec.code,
        name: sec.name,
        description: sec.description,
        centerLatitude: sec.centerLatitude,
        centerLongitude: sec.centerLongitude,
        boundaryPolygon: boundaryMap[sec.id] || [
          [sec.centerLatitude + 0.01, sec.centerLongitude - 0.01],
          [sec.centerLatitude + 0.01, sec.centerLongitude + 0.01],
          [sec.centerLatitude - 0.01, sec.centerLongitude + 0.01],
          [sec.centerLatitude - 0.01, sec.centerLongitude - 0.01],
        ],
        activeCamerasCount: sec.activeCamerasCount,
        activeAlertsCount: activeAlerts,
        activeIncidentsCount: activeIncidents,
      };
    });
  }

  /**
   * Extracts zone polygons from datastore.
   */
  public getZonePolygons(): MapZonePolygon[] {
    return dataStore.zones
      .filter((z) => z.zoneType !== 'VIRTUAL_FENCE')
      .map((z) => ({
        zoneId: z.id,
        sectorId: z.sectorId,
        sectorName: z.sectorName,
        name: z.name,
        code: z.code,
        zoneType: z.zoneType as MapZonePolygon['zoneType'],
        coordinates: z.coordinates,
        sensitivityLevel: z.sensitivityLevel,
        isRestricted: z.zoneType === 'RESTRICTED_BUFFER',
        currentOccupancy: z.id === 'zone-b1' ? 1 : 0,
        color: z.zoneType === 'RESTRICTED_BUFFER' ? '#FF4D4D' : '#007AFF',
      }));
  }

  /**
   * Extracts virtual fence line vectors.
   */
  public getVirtualFenceLines(): MapVirtualFenceLine[] {
    const fences: MapVirtualFenceLine[] = [];

    dataStore.zones
      .filter((z) => z.zoneType === 'VIRTUAL_FENCE')
      .forEach((z) => {
        fences.push({
          fenceId: z.id,
          sectorId: z.sectorId,
          sectorName: z.sectorName,
          name: z.name,
          coordinates: z.coordinates,
          direction: 'BIDIRECTIONAL',
          sensitivityLevel: z.sensitivityLevel,
          color: '#FF4D4D',
        });
      });

    // Additional cross-sector perimeter tripwire
    fences.push({
      fenceId: 'fence-perimeter-b-d',
      sectorId: 'sec-bravo',
      sectorName: 'Sector Bravo / Delta Interface',
      name: 'Bravo-Delta Interface Perimeter Tripwire',
      coordinates: [
        [31.4350, -109.9200],
        [31.4250, -109.9050],
        [31.3930, -109.8480],
      ],
      direction: 'LEFT_TO_RIGHT',
      sensitivityLevel: 'MAXIMUM',
      color: '#FF9500',
    });

    return fences;
  }

  /**
   * Maps active incidents to geographic pins.
   */
  public getPlottedIncidents(cameras: CameraGeographicProfile[]): MapIncidentPin[] {
    const camCoordMap = new Map(cameras.map((c) => [c.cameraId, { lat: c.latitude, lon: c.longitude }]));

    return dataStore.incidents
      .filter((inc) => inc.status === 'OPEN' || inc.status === 'INVESTIGATING')
      .map((inc) => {
        const coords = camCoordMap.get(inc.primaryCameraId) || { lat: 31.4305, lon: -109.9152 };
        const elapsed = Math.round((Date.now() - new Date(inc.createdAt).getTime()) / 1000);

        return {
          incidentId: inc.id,
          incidentNumber: inc.incidentNumber,
          title: inc.title,
          severity: inc.severity,
          status: inc.status,
          primaryCameraId: inc.primaryCameraId,
          primaryCameraIdentifier: inc.primaryCameraIdentifier,
          sectorId: inc.sectorId,
          sectorName: inc.sectorName,
          latitude: coords.lat,
          longitude: coords.lon,
          timestamp: inc.createdAt,
          activeTimeElapsedSeconds: Math.max(0, elapsed),
          summary: inc.summary,
          relatedCameraIdentifiers: inc.relatedCameraIdentifiers,
        };
      });
  }

  /**
   * Maps unacknowledged alerts to geographic pins.
   */
  public getPlottedAlerts(cameras: CameraGeographicProfile[]): MapAlertPin[] {
    const camCoordMap = new Map(cameras.map((c) => [c.cameraId, { lat: c.latitude, lon: c.longitude }]));

    return dataStore.alerts
      .filter((a) => a.status === 'PENDING_ACK')
      .slice(0, 15)
      .map((a) => {
        const coords = camCoordMap.get(a.cameraId) || { lat: 31.4305, lon: -109.9152 };
        return {
          alertId: a.id,
          alertNumber: a.alertNumber || `ALT-${a.id.slice(-4)}`,
          title: a.title,
          severity: a.severity,
          status: a.status,
          cameraId: a.cameraId,
          cameraIdentifier: a.cameraIdentifier,
          sectorId: a.sectorId,
          latitude: coords.lat,
          longitude: coords.lon,
          timestamp: a.timestamp,
          reasoningPrimary: a.reasoningFactors[0]?.factor || a.description,
        };
      });
  }

  /**
   * Retrieves topology corridors from the authoritative CameraGraphManager.
   */
  public getTopologyCorridors(cameras: CameraGeographicProfile[]): MapTopologyCorridor[] {
    const camCoordMap = new Map(cameras.map((c) => [c.cameraId, { lat: c.latitude, lon: c.longitude }]));
    const corridors = cameraGraphManager.getEdges();

    return corridors.map((edge) => {
      const fromCoords = camCoordMap.get(edge.fromCameraId) || { lat: 31.4305, lon: -109.9152 };
      const toCoords = camCoordMap.get(edge.toCameraId) || { lat: 31.4328, lon: -109.9085 };

      return {
        edgeId: edge.edgeId,
        fromCameraId: edge.fromCameraId,
        toCameraId: edge.toCameraId,
        fromCoords: { latitude: fromCoords.lat, longitude: fromCoords.lon },
        toCoords: { latitude: toCoords.lat, longitude: toCoords.lon },
        distanceMeters: edge.distanceMeters,
        minTransitSeconds: edge.minTransitSeconds,
        maxTransitSeconds: edge.maxTransitSeconds,
        expectedDirection: edge.expectedDirection,
        relationshipType: edge.relationshipType,
        isRestrictedTransition: edge.isRestrictedTransition,
        routeDescription: edge.routeDescription,
      };
    });
  }

  /**
   * Generates reconstructed route demonstrations showing observed vs expected path.
   */
  public getReconstructedRoutes(cameras: CameraGeographicProfile[]): MapReconstructedRoute[] {
    const camCoordMap = new Map(cameras.map((c) => [c.cameraId, { lat: c.latitude, lon: c.longitude }]));
    const now = Date.now();

    const c1 = camCoordMap.get('CAM-01') || { lat: 31.4305, lon: -109.9152 };
    const c2 = camCoordMap.get('CAM-02') || { lat: 31.4328, lon: -109.9085 };
    const c4 = camCoordMap.get('CAM-04') || { lat: 31.4250, lon: -109.9050 };

    return [
      {
        reconstructionId: 'recon-veh-8921-corridor',
        entityType: 'VEHICLE',
        entityIdentifier: 'TX-8921-A',
        cameraSequence: ['CAM-01', 'CAM-02', 'CAM-04'],
        waypoints: [
          {
            cameraId: 'CAM-01',
            cameraIdentifier: 'CAM-01',
            latitude: c1.lat,
            longitude: c1.lon,
            timestamp: new Date(now - 140000).toISOString(),
            elapsedSeconds: 0,
          },
          {
            cameraId: 'CAM-02',
            cameraIdentifier: 'CAM-02',
            latitude: c2.lat,
            longitude: c2.lon,
            timestamp: new Date(now - 75000).toISOString(),
            elapsedSeconds: 65,
          },
          {
            cameraId: 'CAM-04',
            cameraIdentifier: 'CAM-04',
            latitude: c4.lat,
            longitude: c4.lon,
            timestamp: new Date(now - 10000).toISOString(),
            elapsedSeconds: 130,
          },
        ],
        totalDistanceMeters: 1950,
        totalDurationSeconds: 130,
        routeStatus: 'EXPECTED_ROUTE',
        anomaliesDetected: [],
        isObserved: true,
      },
    ];
  }

  /**
   * Mathematical SVG Arc Generator for Camera Field of View Cones:
   * Returns an SVG path `d` string representing an estimated coverage pie slice.
   *
   * @param cx Center X in SVG viewport pixels
   * @param cy Center Y in SVG viewport pixels
   * @param radius Arc radius in SVG pixels
   * @param azimuthDegrees 0 = North (up), 90 = East (right), 180 = South (down), 270 = West (left)
   * @param fovDegrees Total field of view spread angle in degrees
   */
  public static calculateFovArcPath(
    cx: number,
    cy: number,
    radius: number,
    azimuthDegrees: number,
    fovDegrees: number
  ): string {
    return calculateFovArcPath(cx, cy, radius, azimuthDegrees, fovDegrees);
  }
}

export const gisService = new GisService();
