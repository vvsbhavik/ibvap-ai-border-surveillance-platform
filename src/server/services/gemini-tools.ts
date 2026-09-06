/**
 * IBVAP — Controlled Gemini Tools & Function Calling Registry
 *
 * Implements the 14 controlled read-only tools for Gemini to retrieve
 * authoritative IBVAP platform facts.
 *
 * CRITICAL REQUIREMENTS:
 * 1. RBAC enforced on every tool invocation under the operator's security context.
 * 2. Purely read-only; no modifications to watchlists, cameras, or configuration.
 * 3. Structured facts stamped with provenance (SIMULATION vs LIVE).
 * 4. No arbitrary DB, OS, or filesystem access.
 */

import { Type } from '@google/genai';
import { dataStore } from '../store';
import { trackingService } from '../../tracking/tracking-service';
import { spatialEngine } from '../../spatial/spatial-engine';
import { anprService } from '../../anpr/anpr-service';
import { faceService } from '../../face/face-service';
import { OperatorAuthContext, ToolInvocationRecord } from './gemini-types';
import { PermissionKey } from '../types';

/**
 * Mapping of each tool to its canonical required permission.
 */
export const TOOL_PERMISSIONS: Record<string, PermissionKey> = {
  getRecentEvents: 'monitoring.view',
  getEvent: 'monitoring.view',
  getCamera: 'camera.view',
  getCameraStatus: 'camera.view',
  getActiveAlerts: 'alert.view',
  getIncident: 'incident.view',
  getIncidentTimeline: 'incident.view',
  getTrackHistory: 'camera.view',
  getANPRObservations: 'anpr.view',
  getFaceObservations: 'monitoring.view',
  getZoneStatus: 'gis.view',
  getZoneOccupancy: 'gis.view',
  getWatchlistMatch: 'watchlist.view',
  getEvidenceMetadata: 'evidence.view',
};

/**
 * Tool Declarations for Google GenAI function calling
 */
export const IBVAP_FUNCTION_DECLARATIONS = [
  {
    name: 'getRecentEvents',
    description: 'Retrieves recent security, spatial, or sensor events across the border surveillance platform.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        cameraId: { type: Type.STRING, description: 'Optional camera identifier to filter by (e.g. CAM-01)' },
        eventType: { type: Type.STRING, description: 'Optional event type filter (e.g. fence.crossed, zone.entered, alert.triggered)' },
        limit: { type: Type.INTEGER, description: 'Maximum events to retrieve (default 20, max 50)' },
      },
    },
  },
  {
    name: 'getEvent',
    description: 'Retrieves complete payload and metadata for a specific event by its unique ID.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        eventId: { type: Type.STRING, description: 'The unique event identifier (e.g. evt-101)' },
      },
      required: ['eventId'],
    },
  },
  {
    name: 'getCamera',
    description: 'Retrieves camera configuration, hardware profile, mounting sector, and operational state.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        cameraId: { type: Type.STRING, description: 'Camera identifier or ID (e.g. CAM-01 or cam-01)' },
      },
      required: ['cameraId'],
    },
  },
  {
    name: 'getCameraStatus',
    description: 'Retrieves real-time operational telemetry (connection status, fps, latency, optical anomaly).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        cameraId: { type: Type.STRING, description: 'Camera identifier or ID' },
      },
      required: ['cameraId'],
    },
  },
  {
    name: 'getActiveAlerts',
    description: 'Retrieves active, unacknowledged, or high-priority alerts with reasoning factors.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        cameraId: { type: Type.STRING, description: 'Optional camera identifier' },
        severity: { type: Type.STRING, description: 'Optional severity filter (LOW, MEDIUM, HIGH, CRITICAL)' },
        status: { type: Type.STRING, description: 'Optional status filter (PENDING_ACK, ACKNOWLEDGED, RESOLVED)' },
        limit: { type: Type.INTEGER, description: 'Maximum alerts to retrieve' },
      },
    },
  },
  {
    name: 'getIncident',
    description: 'Retrieves the complete incident dossier including containment notes, severity, and related cameras.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        incidentId: { type: Type.STRING, description: 'Incident ID or incident number (e.g. INC-2026-0881)' },
      },
      required: ['incidentId'],
    },
  },
  {
    name: 'getIncidentTimeline',
    description: 'Retrieves verified chronological timeline entries for an incident.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        incidentId: { type: Type.STRING, description: 'Incident ID or incident number' },
      },
      required: ['incidentId'],
    },
  },
  {
    name: 'getTrackHistory',
    description: 'Retrieves kinematic tracking data, trajectory points, dwell duration, and direction for a Track ID.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        trackId: { type: Type.STRING, description: 'Track identifier (e.g. trk-p-01 or VEH-CAM-04-021)' },
        cameraId: { type: Type.STRING, description: 'Optional camera identifier' },
      },
      required: ['trackId'],
    },
  },
  {
    name: 'getANPRObservations',
    description: 'Retrieves automatic number plate recognition observations and vehicle attributes.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        vehicleTrackId: { type: Type.STRING, description: 'Optional vehicle track identifier' },
        plateNumber: { type: Type.STRING, description: 'Optional license plate number to query' },
        limit: { type: Type.INTEGER, description: 'Maximum records to retrieve' },
      },
    },
  },
  {
    name: 'getFaceObservations',
    description: 'Retrieves facial analytics observations, quality gating, and biometric status for person tracks.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        personTrackId: { type: Type.STRING, description: 'Optional person track identifier' },
        cameraId: { type: Type.STRING, description: 'Optional camera identifier' },
        limit: { type: Type.INTEGER, description: 'Maximum records to retrieve' },
      },
    },
  },
  {
    name: 'getZoneStatus',
    description: 'Retrieves configured spatial zones, virtual fences, and restriction parameters for a camera or sector.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        zoneId: { type: Type.STRING, description: 'Optional zone ID' },
        cameraId: { type: Type.STRING, description: 'Optional camera identifier' },
      },
    },
  },
  {
    name: 'getZoneOccupancy',
    description: 'Retrieves real-time occupant counts (person tracks and vehicle tracks) for a spatial zone.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        zoneId: { type: Type.STRING, description: 'The zone identifier' },
      },
      required: ['zoneId'],
    },
  },
  {
    name: 'getWatchlistMatch',
    description: 'Retrieves active watchlist entries and suspect profiles across ANPR and Face subsystems.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        watchlistType: { type: Type.STRING, description: 'Type of watchlist: ANPR, FACE, or ALL' },
        query: { type: Type.STRING, description: 'Optional search text (plate number, name, or suspect tag)' },
      },
    },
  },
  {
    name: 'getEvidenceMetadata',
    description: 'Retrieves cryptographic metadata, SHA-256 checksums, and chain of custody for evidence items.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        evidenceId: { type: Type.STRING, description: 'Optional evidence ID' },
        incidentId: { type: Type.STRING, description: 'Optional incident ID or incident number' },
      },
    },
  },
];

export const IBVAP_TOOLS_CONFIG = [
  {
    functionDeclarations: IBVAP_FUNCTION_DECLARATIONS,
  },
];

/**
 * Checks if the operator has authorization to execute the specified tool.
 */
export function isToolAuthorized(toolName: string, operator: OperatorAuthContext): boolean {
  const reqPerm = TOOL_PERMISSIONS[toolName];
  if (!reqPerm) {
    // Unknown tool is unauthorized by default
    return false;
  }
  return dataStore.hasPermission(operator.role, reqPerm);
}

/**
 * Executes a controlled IBVAP tool under the operator's security context.
 */
export async function executeTool(
  toolName: string,
  args: Record<string, any>,
  operator: OperatorAuthContext
): Promise<{ result: unknown; record: ToolInvocationRecord }> {
  const reqPerm = TOOL_PERMISSIONS[toolName] || ('monitoring.view' as PermissionKey);
  const isAuth = isToolAuthorized(toolName, operator);

  const invocationRecord: ToolInvocationRecord = {
    tool: toolName,
    args,
    authorized: isAuth,
    requiredPermission: reqPerm,
    executionStatus: isAuth ? 'SUCCESS' : 'DENIED',
    timestamp: new Date().toISOString(),
  };

  if (!isAuth) {
    const deniedResult = {
      error: 'ACCESS_DENIED',
      message: `Operator ${operator.callsign} (${operator.role}) lacks required permission '${reqPerm}' to execute tool '${toolName}'.`,
      provenance: 'SECURITY_GATE',
    };
    invocationRecord.resultSummary = 'Access Denied (RBAC policy)';
    return { result: deniedResult, record: invocationRecord };
  }

  try {
    let output: unknown;

    switch (toolName) {
      case 'getRecentEvents': {
        const { cameraId, eventType, limit = 20 } = args;
        const maxLimit = Math.min(Math.max(1, limit), 50);
        let alertEvents = dataStore.alerts.map((a) => ({
          eventId: a.id,
          eventType: `alert.${a.severity.toLowerCase()}`,
          source: a.cameraIdentifier,
          timestamp: a.timestamp,
          title: a.title,
          description: a.description,
          provenance: 'SIMULATION',
        }));
        if (cameraId) {
          alertEvents = alertEvents.filter((e) => e.source === cameraId);
        }
        if (eventType) {
          alertEvents = alertEvents.filter((e) => e.eventType === eventType);
        }
        const spatial = dataStore.getSpatialEvents({ cameraId, eventType, limit: maxLimit });
        output = {
          count: alertEvents.length + spatial.length,
          events: alertEvents.slice(0, maxLimit),
          spatialEvents: spatial.slice(0, maxLimit).map((e) => ({ ...e, provenance: 'SIMULATION' })),
          provenance: 'SIMULATION',
        };
        break;
      }

      case 'getEvent': {
        const { eventId } = args;
        const alert = dataStore.alerts.find((a) => a.id === eventId || a.alertNumber === eventId);
        if (alert) {
          output = {
            eventId: alert.id,
            alertNumber: alert.alertNumber,
            eventType: `alert.${alert.severity.toLowerCase()}`,
            title: alert.title,
            description: alert.description,
            cameraIdentifier: alert.cameraIdentifier,
            timestamp: alert.timestamp,
            reasoningFactors: alert.reasoningFactors,
            provenance: 'SIMULATION',
          };
        } else {
          const sp = dataStore.spatialEvents.find((e) => e.eventId === eventId);
          output = sp ? { ...sp, provenance: 'SIMULATION' } : { error: 'NOT_FOUND', message: `Event ${eventId} not found.` };
        }
        break;
      }

      case 'getCamera': {
        const { cameraId } = args;
        const cam = dataStore.cameras.find(
          (c) => c.id === cameraId || c.cameraId === cameraId || c.identifier === cameraId
        );
        output = cam
          ? {
              cameraId: cam.cameraId || cam.id,
              identifier: cam.identifier || cam.cameraId,
              name: cam.name,
              status: cam.status,
              statusDetail: cam.statusDetail,
              connectionStatus: cam.connectionStatus,
              sectorName: cam.sectorName,
              resolution: cam.resolution,
              fps: cam.currentFps,
              latencyMs: cam.currentLatencyMs,
              provenance: cam.isSimulated ? 'SIMULATION' : 'LIVE',
            }
          : { error: 'NOT_FOUND', message: `Camera ${cameraId} not found.` };
        break;
      }

      case 'getCameraStatus': {
        const { cameraId } = args;
        const cam = dataStore.cameras.find(
          (c) => c.id === cameraId || c.cameraId === cameraId || c.identifier === cameraId
        );
        output = cam
          ? {
              cameraId: cam.cameraId || cam.id,
              identifier: cam.identifier || cam.cameraId,
              status: cam.status,
              connectionStatus: cam.connectionStatus,
              fps: cam.currentFps,
              latencyMs: cam.currentLatencyMs,
              lastHeartbeatAt: cam.lastHeartbeatAt,
              statusDetail: cam.statusDetail,
              provenance: cam.isSimulated ? 'SIMULATION' : 'LIVE',
            }
          : { error: 'NOT_FOUND', message: `Camera ${cameraId} not found.` };
        break;
      }

      case 'getActiveAlerts': {
        const { cameraId, severity, status, limit = 20 } = args;
        let list = [...dataStore.alerts];
        if (cameraId) {
          list = list.filter((a) => a.cameraId === cameraId || a.cameraIdentifier === cameraId);
        }
        if (severity) {
          list = list.filter((a) => a.severity === severity);
        }
        if (status) {
          list = list.filter((a) => a.status === status);
        } else {
          list = list.filter((a) => a.status !== 'DISMISSED');
        }
        output = {
          count: list.length,
          alerts: list.slice(0, limit).map((a) => ({
            id: a.id,
            alertNumber: a.alertNumber,
            title: a.title,
            description: a.description,
            severity: a.severity,
            status: a.status,
            cameraIdentifier: a.cameraIdentifier,
            zoneName: a.zoneName,
            timestamp: a.timestamp,
            confidenceScore: a.confidenceScore,
            reasoningFactors: a.reasoningFactors,
            provenance: a.isSimulation ? 'SIMULATION' : 'LIVE',
          })),
          provenance: 'SIMULATION',
        };
        break;
      }

      case 'getIncident': {
        const { incidentId } = args;
        const inc = dataStore.incidents.find(
          (i) => i.id === incidentId || i.incidentNumber === incidentId
        );
        output = inc
          ? {
              id: inc.id,
              incidentNumber: inc.incidentNumber,
              title: inc.title,
              summary: inc.summary,
              severity: inc.severity,
              status: inc.status,
              sectorName: inc.sectorName,
              primaryCameraIdentifier: inc.primaryCameraIdentifier,
              relatedCameraIdentifiers: inc.relatedCameraIdentifiers,
              leadCommanderCallsign: inc.leadCommanderCallsign,
              createdAt: inc.createdAt,
              resolvedAt: inc.resolvedAt,
              evidenceCount: inc.evidenceCount,
              containmentNotes: inc.containmentNotes,
              timelineCount: inc.timeline?.length || 0,
              provenance: 'SIMULATION',
            }
          : { error: 'NOT_FOUND', message: `Incident ${incidentId} not found.` };
        break;
      }

      case 'getIncidentTimeline': {
        const { incidentId } = args;
        const inc = dataStore.incidents.find(
          (i) => i.id === incidentId || i.incidentNumber === incidentId
        );
        output = inc
          ? {
              incidentNumber: inc.incidentNumber,
              entries: inc.timeline || [],
              provenance: 'SIMULATION',
            }
          : { error: 'NOT_FOUND', message: `Incident ${incidentId} not found.` };
        break;
      }

      case 'getTrackHistory': {
        const { trackId, cameraId } = args;
        const track = trackingService.getTrackById(trackId);
        if (track) {
          const spatialCtx = spatialEngine.getTrackSpatialContext(trackId, dataStore.spatialZones);
          output = {
            trackId: track.trackId,
            numericId: track.numericId,
            cameraId: track.cameraId,
            objectType: track.objectType,
            state: track.state,
            direction: track.direction,
            dwellTimeSeconds: track.dwellTimeSeconds,
            detectionCount: track.detectionCount,
            currentConfidence: track.currentConfidence,
            firstSeenAt: track.firstSeenAt,
            lastSeenAt: track.lastSeenAt,
            trajectoryPointsCount: track.trajectory.length,
            lastBoundingBox: track.lastBoundingBox,
            spatialContext: spatialCtx,
            provenance: 'SIMULATION',
          };
        } else {
          // Check active tracks
          const active = cameraId ? trackingService.getActiveTracks(cameraId) : [];
          const foundInActive = active.find((t) => t.trackId === trackId);
          output = foundInActive
            ? { ...foundInActive, provenance: 'SIMULATION' }
            : { error: 'NOT_FOUND', message: `Track ${trackId} not found in active tracking table.` };
        }
        break;
      }

      case 'getANPRObservations': {
        const { vehicleTrackId, plateNumber, limit = 20 } = args;
        const queryRes = anprService.queryRecords({
          vehicleTrackId,
          plate: plateNumber,
          limit,
        });
        const records = queryRes.records;
        output = {
          count: records.length,
          observations: records.map((r) => ({
            vehicleTrackId: r.vehicleTrackId,
            plateNumber: r.bestPlateText,
            confidence: r.overallConfidence,
            ocrConfidence: r.ocrConfidence,
            status: r.recognitionStatus,
            isWatchlistMatch: r.isWatchlistMatch,
            watchlistCategory: r.watchlistCategory,
            spatialContext: r.spatialContext,
            observationsCount: r.observationCount,
            firstSeenAt: r.firstSeenAt,
            lastSeenAt: r.lastSeenAt,
            provenance: 'SIMULATION',
          })),
          provenance: 'SIMULATION',
        };
        break;
      }

      case 'getFaceObservations': {
        const { personTrackId, cameraId, limit = 20 } = args;
        const records = faceService.queryRecords({
          personTrackId,
          cameraId,
          limit,
        });
        output = {
          count: records.length,
          observations: records.map((r) => ({
            personTrackId: r.personTrackId,
            recognitionStatus: r.recognitionStatus,
            bestQuality: r.bestQuality,
            isWatchlistMatch: r.isWatchlistMatch,
            matchedDisplayName: r.watchlistDisplayName,
            watchlistCategory: r.watchlistCategory,
            similarityScore: r.similarityScore,
            spatialContext: r.spatialContext,
            observationsCount: r.observationsCount,
            firstSeenAt: r.firstSeenAt,
            lastSeenAt: r.lastSeenAt,
            provenance: 'SIMULATION',
          })),
          provenance: 'SIMULATION',
        };
        break;
      }

      case 'getZoneStatus': {
        const { zoneId, cameraId } = args;
        let zones = [...dataStore.spatialZones];
        if (zoneId) {
          zones = zones.filter((z) => z.zoneId === zoneId);
        }
        if (cameraId) {
          zones = zones.filter((z) => z.cameraId === cameraId);
        }
        output = {
          count: zones.length,
          zones: zones.map((z) => ({
            zoneId: z.zoneId,
            name: z.name,
            type: z.type,
            cameraId: z.cameraId,
            active: z.active,
            isRestricted: z.isRestricted,
            geometry: z.geometry,
            dwellWarningSeconds: z.dwellWarningSeconds,
            maxDwellSeconds: z.maxDwellSeconds,
            provenance: 'SIMULATION',
          })),
          provenance: 'SIMULATION',
        };
        break;
      }

      case 'getZoneOccupancy': {
        const { zoneId } = args;
        const occ = spatialEngine.getZoneOccupancy(zoneId);
        output = occ
          ? { ...occ, provenance: 'SIMULATION' }
          : { error: 'NOT_FOUND', message: `Occupancy telemetry for zone '${zoneId}' not available.` };
        break;
      }

      case 'getWatchlistMatch': {
        const { watchlistType, query } = args;
        const anprList = anprService.getWatchlists();
        const faceList = faceService.getWatchlists();
        output = {
          anprWatchlistCount: anprList.length,
          faceWatchlistCount: faceList.length,
          anprEntries: anprList.slice(0, 10).map((w) => ({
            plateNumber: w.plateNumber,
            labelName: w.labelName,
            category: w.category,
            priority: w.priority,
            active: w.active,
          })),
          faceEntries: faceList.slice(0, 10).map((f) => ({
            displayName: f.displayName,
            category: f.category,
            priority: f.priority,
            status: f.status,
          })),
          provenance: 'SIMULATION',
        };
        break;
      }

      case 'getEvidenceMetadata': {
        const { evidenceId, incidentId } = args;
        let list = [...dataStore.evidence];
        if (evidenceId) {
          list = list.filter((e) => e.id === evidenceId);
        }
        if (incidentId) {
          list = list.filter((e) => e.incidentId === incidentId || e.incidentNumber === incidentId);
        }
        output = {
          count: list.length,
          evidence: list.slice(0, 20).map((e) => ({
            id: e.id,
            incidentNumber: e.incidentNumber,
            cameraIdentifier: e.cameraIdentifier,
            title: e.title,
            mediaType: e.mediaType,
            sha256Checksum: e.sha256Checksum,
            isVerified: e.isVerified,
            capturedStartAt: e.capturedStartAt,
            capturedEndAt: e.capturedEndAt,
            chainOfCustodyCount: e.chainOfCustodyCount,
            provenance: 'SIMULATION',
          })),
          provenance: 'SIMULATION',
        };
        break;
      }

      default:
        output = { error: 'UNKNOWN_TOOL', message: `Tool '${toolName}' is not recognized by IBVAP.` };
        invocationRecord.executionStatus = 'FAILED';
    }

    invocationRecord.resultSummary = `Retrieved facts successfully (${toolName})`;
    return { result: output, record: invocationRecord };
  } catch (err: any) {
    invocationRecord.executionStatus = 'FAILED';
    invocationRecord.resultSummary = err?.message || 'Tool execution threw unexpected error';
    return {
      result: { error: 'EXECUTION_FAILED', message: err?.message || 'Failed tool execution' },
      record: invocationRecord,
    };
  }
}
