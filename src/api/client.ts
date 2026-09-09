// ============================================================================
// IBVAP Frontend Typed API Client Layer
// ============================================================================

import {
  User,
  Sector,
  Zone,
  Camera,
  Alert,
  Incident,
  EvidenceItem,
  AnprRecord,
  WatchlistEntry,
  SystemHealthItem,
  AuditLog,
  RoleDefinition,
  PermissionDefinition,
  PermissionKey,
  Session,
  SpatialZone,
  SpatialEvent,
  SpatialPerformanceMetrics,
  ZoneOccupancy,
} from '../server/types';
import {
  StreamTelemetry,
  ConnectionTestResult,
  RawFrame,
  StreamFailureMode,
} from '../video-gateway/types';
import {
  NormalizedDetection,
  AiSubsystemHealth,
  AiInferenceConfig,
} from '../ai-inference/types';
import {
  Track,
  TrackingConfig,
  TrackingSubsystemHealth,
  TrackState,
} from '../tracking/types';
import {
  PersistentPersonFaceRecord,
  FaceTelemetryMetrics,
  FaceEventPayload,
  SyntheticFaceWatchlist,
  FaceQualityState,
  FaceRecognitionStatus,
} from '../face/types';
import {
  CameraGraph,
  CrossCameraCorrelation,
  CorrelatedObservation,
  VehicleMovementReconstruction,
  PersonMovementReconstruction,
  RouteAnalysisResult,
  AdvancedAnalyticsEvent,
  ObservableRuleConfig,
  CorrelatedEntityType,
  CorrelationConfidenceLevel,
} from '../analytics/types';

const BASE_URL = '/api/v1';

let currentSessionToken: string | null = typeof window !== 'undefined' ? localStorage.getItem('ibvap_session_token') : null;
let currentOperatorContext: { callsign: string; role: string } | null = null;

export function getSessionToken(): string | null {
  return currentSessionToken;
}

export function setApiOperator(user: User | null, token?: string | null) {
  if (user) {
    currentOperatorContext = { callsign: user.callsign, role: user.role };
    if (token) {
      currentSessionToken = token;
      if (typeof window !== 'undefined') {
        localStorage.setItem('ibvap_session_token', token);
      }
    }
  } else {
    currentOperatorContext = null;
    currentSessionToken = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('ibvap_session_token');
    }
  }
}

export interface ApiError extends Error {
  status?: number;
  code?: string;
  requiredPermission?: string;
  attemptsRemaining?: number;
  retryAfterSeconds?: number;
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>),
  };

  if (currentSessionToken) {
    headers['Authorization'] = `Bearer ${currentSessionToken}`;
    headers['x-session-token'] = currentSessionToken;
  }

  if (currentOperatorContext) {
    headers['x-operator-callsign'] = currentOperatorContext.callsign;
    headers['x-operator-role'] = currentOperatorContext.role;
  }

  const res = await fetch(url, {
    ...options,
    headers,
  });

  if (!res.ok) {
    let errorMsg = `HTTP ${res.status} ${res.statusText}`;
    let code: string | undefined;
    let requiredPermission: string | undefined;
    let attemptsRemaining: number | undefined;
    let retryAfterSeconds: number | undefined;

    try {
      const body = await res.json();
      if (body.message) errorMsg = body.message;
      else if (body.error) errorMsg = body.error;
      code = body.code;
      requiredPermission = body.requiredPermission;
      attemptsRemaining = body.attemptsRemaining;
      retryAfterSeconds = body.retryAfterSeconds;
    } catch {
      // ignore json parse error
    }

    const err = new Error(errorMsg) as ApiError;
    err.status = res.status;
    err.code = code;
    err.requiredPermission = requiredPermission;
    err.attemptsRemaining = attemptsRemaining;
    err.retryAfterSeconds = retryAfterSeconds;
    throw err;
  }

  return res.json();
}

export const api = {
  auth: {
    login: async (credentials: { callsign?: string; identifier?: string; password?: string; quickSwitch?: boolean }) => {
      const result = await fetchJson<{
        success: boolean;
        token: string;
        session: Session;
        user: User;
      }>(`${BASE_URL}/auth/login`, {
        method: 'POST',
        body: JSON.stringify(credentials),
      });
      if (result.user && result.token) {
        setApiOperator(result.user, result.token);
      }
      return result;
    },
    me: () => fetchJson<{ success: boolean; user: User; session?: Session }>(`${BASE_URL}/auth/me`),
    logout: async () => {
      try {
        await fetchJson<{ success: boolean }>(`${BASE_URL}/auth/logout`, { method: 'POST' });
      } finally {
        setApiOperator(null);
      }
      return { success: true };
    },
    getPermissions: () =>
      fetchJson<{ success: boolean; permissions: PermissionDefinition[]; roles: RoleDefinition[] }>(
        `${BASE_URL}/auth/permissions`
      ),
    getSeedUsers: () =>
      fetchJson<{
        success: boolean;
        disclaimer: string;
        users: (User & { demoDefaultPassword?: string })[];
      }>(`${BASE_URL}/auth/seed-users`),
  },

  cameras: {
    list: (params?: { 
      sectorId?: string; 
      status?: string; 
      search?: string; 
      includeDecommissioned?: boolean;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    }) => {
      const q = new URLSearchParams();
      if (params?.sectorId) q.set('sectorId', params.sectorId);
      if (params?.status) q.set('status', params.status);
      if (params?.search) q.set('search', params.search);
      if (params?.includeDecommissioned !== undefined) q.set('includeDecommissioned', String(params.includeDecommissioned));
      if (params?.sortBy) q.set('sortBy', params.sortBy);
      if (params?.sortOrder) q.set('sortOrder', params.sortOrder);
      return fetchJson<{ success: boolean; total: number; cameras: Camera[] }>(
        `${BASE_URL}/cameras?${q.toString()}`
      );
    },
    get: (id: string) => fetchJson<{ success: boolean; camera: Camera }>(`${BASE_URL}/cameras/${id}`),
    create: (data: Partial<Camera>) =>
      fetchJson<{ success: boolean; camera: Camera }>(`${BASE_URL}/cameras`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: string, data: Partial<Camera>) =>
      fetchJson<{ success: boolean; camera: Camera }>(`${BASE_URL}/cameras/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    enable: (id: string) =>
      fetchJson<{ success: boolean; camera: Camera }>(`${BASE_URL}/cameras/${id}/enable`, {
        method: 'POST',
      }),
    disable: (id: string, reason?: string) =>
      fetchJson<{ success: boolean; camera: Camera }>(`${BASE_URL}/cameras/${id}/disable`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),
    decommission: (id: string, reason?: string) =>
      fetchJson<{ success: boolean; camera: Camera }>(`${BASE_URL}/cameras/${id}/decommission`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),
    testConnection: (id: string) =>
      fetchJson<{ success: boolean; status: string; message: string; detail?: string }>(
        `${BASE_URL}/cameras/${id}/test-connection`,
        { method: 'POST' }
      ),
    updateStatus: (id: string, data: { status: string; reason?: string; operatorCallsign?: string }) =>
      fetchJson<{ success: boolean; camera: Camera }>(`${BASE_URL}/cameras/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    ptz: (id: string, presetName: string, operatorCallsign?: string) =>
      fetchJson<{ success: boolean; message: string }>(`${BASE_URL}/cameras/${id}/ptz/preset`, {
        method: 'POST',
        body: JSON.stringify({ presetName, operatorCallsign }),
      }),
  },

  alerts: {
    list: (params?: { severity?: string; status?: string; sectorId?: string }) => {
      const q = new URLSearchParams();
      if (params?.severity) q.set('severity', params.severity);
      if (params?.status) q.set('status', params.status);
      if (params?.sectorId) q.set('sectorId', params.sectorId);
      return fetchJson<{ success: boolean; total: number; alerts: Alert[] }>(
        `${BASE_URL}/alerts?${q.toString()}`
      );
    },
    get: (id: string) => fetchJson<{ success: boolean; alert: Alert }>(`${BASE_URL}/alerts/${id}`),
    acknowledge: (id: string, operatorCallsign?: string, notes?: string) =>
      fetchJson<{ success: boolean; alert: Alert }>(`${BASE_URL}/alerts/${id}/acknowledge`, {
        method: 'PATCH',
        body: JSON.stringify({ operatorCallsign, notes }),
      }),
    escalate: (id: string, data?: { incidentTitle?: string; incidentSummary?: string; operatorCallsign?: string }) =>
      fetchJson<{ success: boolean; alert: Alert; incident: Incident }>(`${BASE_URL}/alerts/${id}/escalate`, {
        method: 'POST',
        body: JSON.stringify(data || {}),
      }),
    dismiss: (id: string, reason?: string, operatorCallsign?: string) =>
      fetchJson<{ success: boolean; alert: Alert }>(`${BASE_URL}/alerts/${id}/dismiss`, {
        method: 'PATCH',
        body: JSON.stringify({ reason, operatorCallsign }),
      }),
  },

  incidents: {
    list: (params?: { status?: string; sectorId?: string }) => {
      const q = new URLSearchParams();
      if (params?.status) q.set('status', params.status);
      if (params?.sectorId) q.set('sectorId', params.sectorId);
      return fetchJson<{ success: boolean; total: number; incidents: Incident[] }>(
        `${BASE_URL}/incidents?${q.toString()}`
      );
    },
    get: (id: string) => fetchJson<{ success: boolean; incident: Incident }>(`${BASE_URL}/incidents/${id}`),
    updateStatus: (id: string, status: string, notes?: string, operatorCallsign?: string) =>
      fetchJson<{ success: boolean; incident: Incident }>(`${BASE_URL}/incidents/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status, notes, operatorCallsign }),
      }),
    addTimeline: (id: string, actionType: string, description: string, operatorCallsign?: string) =>
      fetchJson<{ success: boolean; incident: Incident; entry: unknown }>(`${BASE_URL}/incidents/${id}/timeline`, {
        method: 'POST',
        body: JSON.stringify({ actionType, description, operatorCallsign }),
      }),
  },

  evidence: {
    list: (incidentId?: string) => {
      const q = incidentId ? `?incidentId=${encodeURIComponent(incidentId)}` : '';
      return fetchJson<{ success: boolean; total: number; evidence: EvidenceItem[] }>(
        `${BASE_URL}/evidence${q}`
      );
    },
    verify: (id: string, operatorCallsign?: string) =>
      fetchJson<{ success: boolean; verified: boolean; sha256Checksum: string; evidence: EvidenceItem }>(
        `${BASE_URL}/evidence/${id}/verify`,
        {
          method: 'POST',
          body: JSON.stringify({ operatorCallsign }),
        }
      ),
    export: (id: string, purpose?: string, operatorCallsign?: string) =>
      fetchJson<{ success: boolean; manifest: Record<string, unknown>; evidence: EvidenceItem }>(
        `${BASE_URL}/evidence/${id}/export`,
        {
          method: 'POST',
          body: JSON.stringify({ purpose, operatorCallsign }),
        }
      ),
  },

  zones: {
    sectors: () => fetchJson<{ success: boolean; sectors: Sector[] }>(`${BASE_URL}/zones/sectors`),
    list: (sectorId?: string) => {
      const q = sectorId ? `?sectorId=${encodeURIComponent(sectorId)}` : '';
      return fetchJson<{ success: boolean; total: number; zones: Zone[]; spatialZones?: SpatialZone[] }>(
        `${BASE_URL}/zones${q}`
      );
    },
    getSpatial: (params?: { cameraId?: string; active?: boolean; type?: string }) => {
      const q = new URLSearchParams();
      if (params?.cameraId) q.set('cameraId', params.cameraId);
      if (params?.active !== undefined) q.set('active', String(params.active));
      if (params?.type) q.set('type', params.type);
      const queryStr = q.toString() ? `?${q.toString()}` : '';
      return fetchJson<{ success: boolean; total: number; zones: SpatialZone[] }>(
        `${BASE_URL}/zones/spatial${queryStr}`
      );
    },
    getOccupancy: (params?: { cameraId?: string; zoneId?: string; sectorId?: string }) => {
      const q = new URLSearchParams();
      if (params?.cameraId) q.set('cameraId', params.cameraId);
      if (params?.zoneId) q.set('zoneId', params.zoneId);
      if (params?.sectorId) q.set('sectorId', params.sectorId);
      const queryStr = q.toString() ? `?${q.toString()}` : '';
      return fetchJson<{ success: boolean; total: number; occupancies: ZoneOccupancy[]; occupancy?: ZoneOccupancy }>(
        `${BASE_URL}/zones/occupancy${queryStr}`
      );
    },
    get: (id: string) =>
      fetchJson<{ success: boolean; zone: SpatialZone | Zone; occupants?: Track[] }>(
        `${BASE_URL}/zones/${encodeURIComponent(id)}`
      ),
    create: (data: Partial<SpatialZone>) =>
      fetchJson<{ success: boolean; zone: SpatialZone }>(`${BASE_URL}/zones`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: string, data: Partial<SpatialZone>) =>
      fetchJson<{ success: boolean; zone: SpatialZone }>(`${BASE_URL}/zones/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    activate: (id: string) =>
      fetchJson<{ success: boolean; zone: SpatialZone }>(
        `${BASE_URL}/zones/${encodeURIComponent(id)}/activate`,
        { method: 'POST' }
      ),
    deactivate: (id: string) =>
      fetchJson<{ success: boolean; zone: SpatialZone }>(
        `${BASE_URL}/zones/${encodeURIComponent(id)}/deactivate`,
        { method: 'POST' }
      ),
    delete: (id: string) =>
      fetchJson<{ success: boolean; message: string }>(
        `${BASE_URL}/zones/${encodeURIComponent(id)}`,
        { method: 'DELETE' }
      ),
    getMetrics: () =>
      fetchJson<{ success: boolean; metrics: SpatialPerformanceMetrics }>(
        `${BASE_URL}/zones/spatial/metrics`
      ),
    getEvents: (params?: {
      cameraId?: string;
      zoneId?: string;
      eventType?: string;
      limit?: number;
    }) => {
      const q = new URLSearchParams();
      if (params?.cameraId) q.set('cameraId', params.cameraId);
      if (params?.zoneId) q.set('zoneId', params.zoneId);
      if (params?.eventType) q.set('eventType', params.eventType);
      if (params?.limit) q.set('limit', String(params.limit));
      const queryStr = q.toString() ? `?${q.toString()}` : '';
      return fetchJson<{ success: boolean; total: number; events: SpatialEvent[] }>(
        `${BASE_URL}/zones/spatial/events${queryStr}`
      );
    },
    getCameraZones: (cameraId: string) =>
      fetchJson<{ success: boolean; cameraId: string; total: number; zones: SpatialZone[] }>(
        `${BASE_URL}/cameras/${encodeURIComponent(cameraId)}/zones`
      ),
  },

  users: {
    list: (params?: { role?: string; status?: string; search?: string }) => {
      const q = new URLSearchParams();
      if (params?.role) q.set('role', params.role);
      if (params?.status) q.set('status', params.status);
      if (params?.search) q.set('search', params.search);
      return fetchJson<{ success: boolean; total: number; users: User[] }>(`${BASE_URL}/users?${q.toString()}`);
    },
    get: (id: string) => fetchJson<{ success: boolean; user: User }>(`${BASE_URL}/users/${id}`),
    create: (data: Partial<User> & { password?: string }) =>
      fetchJson<{ success: boolean; message: string; user: User }>(`${BASE_URL}/users`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: string, data: Partial<User> & { password?: string }) =>
      fetchJson<{ success: boolean; message: string; user: User }>(`${BASE_URL}/users/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    disable: (id: string, reason?: string) =>
      fetchJson<{ success: boolean; message: string; user: User }>(`${BASE_URL}/users/${id}/disable`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),
    enable: (id: string) =>
      fetchJson<{ success: boolean; message: string; user: User }>(`${BASE_URL}/users/${id}/enable`, {
        method: 'POST',
      }),
    listRoles: () =>
      fetchJson<{
        success: boolean;
        total: number;
        roles: RoleDefinition[];
        availablePermissions: PermissionDefinition[];
      }>(`${BASE_URL}/users/roles`),
    updateRolePermissions: (role: string, permissions: PermissionKey[]) =>
      fetchJson<{ success: boolean; message: string; role: RoleDefinition }>(
        `${BASE_URL}/users/roles/${encodeURIComponent(role)}`,
        {
          method: 'PUT',
          body: JSON.stringify({ permissions }),
        }
      ),
    resetRolePermissions: (role: string) =>
      fetchJson<{ success: boolean; message: string; role: RoleDefinition }>(
        `${BASE_URL}/users/roles/${encodeURIComponent(role)}/reset`,
        { method: 'POST' }
      ),
  },

  anpr: {
    list: (params?: {
      search?: string;
      plate?: string;
      normalizedPlate?: string;
      vehicleTrackId?: string;
      cameraId?: string;
      vehicleClass?: string;
      recognitionStatus?: string;
      watchlistOnly?: boolean;
      minConfidence?: number;
      limit?: number;
      offset?: number;
    }) => {
      const q = new URLSearchParams();
      if (params?.search) q.set('search', params.search);
      if (params?.plate) q.set('plate', params.plate);
      if (params?.normalizedPlate) q.set('normalizedPlate', params.normalizedPlate);
      if (params?.vehicleTrackId) q.set('vehicleTrackId', params.vehicleTrackId);
      if (params?.cameraId) q.set('cameraId', params.cameraId);
      if (params?.vehicleClass) q.set('vehicleClass', params.vehicleClass);
      if (params?.recognitionStatus) q.set('recognitionStatus', params.recognitionStatus);
      if (params?.watchlistOnly) q.set('watchlistOnly', 'true');
      if (params?.minConfidence !== undefined) q.set('minConfidence', String(params.minConfidence));
      if (params?.limit) q.set('limit', String(params.limit));
      if (params?.offset) q.set('offset', String(params.offset));
      return fetchJson<{ success: boolean; total: number; offset?: number; limit?: number; records: AnprRecord[] }>(
        `${BASE_URL}/anpr?${q.toString()}`
      );
    },
    getVehicle: (trackId: string) =>
      fetchJson<{ success: boolean; record: AnprRecord; observations: any[] }>(
        `${BASE_URL}/anpr/vehicles/${encodeURIComponent(trackId)}`
      ),
    getCamera: (cameraId: string) =>
      fetchJson<{ success: boolean; total: number; records: AnprRecord[] }>(
        `${BASE_URL}/anpr/cameras/${encodeURIComponent(cameraId)}`
      ),
    events: (limit = 100) =>
      fetchJson<{ success: boolean; total: number; events: any[] }>(`${BASE_URL}/anpr/events?limit=${limit}`),
    metrics: () =>
      fetchJson<{ success: boolean; metrics: any }>(`${BASE_URL}/anpr/metrics`),
    search: (plate: string) =>
      fetchJson<{ success: boolean; searchTerm: string; normalizedTerm: string; total: number; records: AnprRecord[] }>(
        `${BASE_URL}/anpr/search?plate=${encodeURIComponent(plate)}`
      ),
    runScenario: (scenarioName: string) =>
      fetchJson<{
        success: boolean;
        scenario: string;
        description: string;
        isSimulation: true;
        assertionsPass: boolean;
        notes: string[];
        records: AnprRecord[];
      }>(`${BASE_URL}/anpr/scenarios/${encodeURIComponent(scenarioName)}`, {
        method: 'POST',
      }),
    export: (format = 'JSON') =>
      fetchJson<{ success: boolean; exportedAt: string; exportedBy: string; count: number; records: AnprRecord[] }>(
        `${BASE_URL}/anpr/export`,
        {
          method: 'POST',
          body: JSON.stringify({ format }),
        }
      ),
  },

  watchlists: {
    list: () => fetchJson<{ success: boolean; total: number; watchlists: WatchlistEntry[] }>(`${BASE_URL}/watchlists`),
    create: (data: Partial<WatchlistEntry>) =>
      fetchJson<{ success: boolean; entry: WatchlistEntry }>(`${BASE_URL}/watchlists`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    toggle: (id: string, operatorCallsign?: string) =>
      fetchJson<{ success: boolean; entry: WatchlistEntry }>(`${BASE_URL}/watchlists/${id}/toggle`, {
        method: 'PATCH',
        body: JSON.stringify({ operatorCallsign }),
      }),
  },

  health: {
    get: () =>
      fetchJson<{
        success: boolean;
        overallStatus: string;
        timestamp: string;
        totalComponents: number;
        degradedCount: number;
        offlineCount: number;
        components: SystemHealthItem[];
      }>(`${BASE_URL}/health`),
    live: () => fetchJson<{ status: string; uptimeSeconds: number }>('/health/live'),
    ready: () => fetchJson<{ status: string; dependencies: Record<string, string> }>('/health/ready'),
  },

  system: {
    auditLogs: (params?: {
      limit?: number;
      offset?: number;
      userCallsign?: string;
      action?: string;
      resourceType?: string;
      result?: string;
      startDate?: string;
      endDate?: string;
      search?: string;
    } | number) => {
      if (typeof params === 'number') {
        return fetchJson<{ success: boolean; total: number; offset: number; limit: number; logs: AuditLog[] }>(
          `${BASE_URL}/system/audit-logs?limit=${params}`
        );
      }
      const q = new URLSearchParams();
      if (params?.limit) q.set('limit', String(params.limit));
      if (params?.offset) q.set('offset', String(params.offset));
      if (params?.userCallsign) q.set('userCallsign', params.userCallsign);
      if (params?.action) q.set('action', params.action);
      if (params?.resourceType) q.set('resourceType', params.resourceType);
      if (params?.result) q.set('result', params.result);
      if (params?.startDate) q.set('startDate', params.startDate);
      if (params?.endDate) q.set('endDate', params.endDate);
      if (params?.search) q.set('search', params.search);
      return fetchJson<{ success: boolean; total: number; offset: number; limit: number; logs: AuditLog[] }>(
        `${BASE_URL}/system/audit-logs?${q.toString()}`
      );
    },
    exportAuditLogs: () =>
      fetchJson<{
        success: boolean;
        exportedAt: string;
        operator: string;
        totalRecords: number;
        logs: AuditLog[];
      }>(`${BASE_URL}/system/audit-logs/export`, { method: 'POST' }),
    config: () => fetchJson<{ success: boolean; systemName: string; version: string; features: Record<string, boolean> }>(`${BASE_URL}/system/config`),
    updateConfig: (data: Record<string, unknown>) =>
      fetchJson<{ success: boolean; message: string; config: Record<string, unknown> }>(`${BASE_URL}/system/config`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
  },

  events: {
    simulate: (data?: { type?: string; sectorId?: string; cameraId?: string }) =>
      fetchJson<{ success: boolean; alert: Alert }>(`${BASE_URL}/events/simulate`, {
        method: 'POST',
        body: JSON.stringify(data || {}),
      }),
  },

  video: {
    getStreams: () =>
      fetchJson<{ streams: StreamTelemetry[]; count: number; timestamp: string }>(`${BASE_URL}/video/streams`),
    getStream: (cameraId: string) =>
      fetchJson<{ stream: StreamTelemetry }>(`${BASE_URL}/video/streams/${cameraId}`),
    testStream: (cameraId: string, options?: { streamEndpointReference?: string; protocol?: string }) =>
      fetchJson<ConnectionTestResult>(`${BASE_URL}/video/streams/${cameraId}/test`, {
        method: 'POST',
        body: JSON.stringify(options || {}),
      }),
    getHealth: (cameraId: string) =>
      fetchJson<{
        cameraId: string;
        healthState: string;
        connectionState: string;
        currentFps: number;
        nominalFps: number;
        currentLatencyMs: number | null;
        lastFrameTimestamp: string | null;
        lastHeartbeatAt: string;
        reconnectAttempts: number;
        maxReconnectAttempts: number;
        nextRetryAt: string | null;
        lastError: any;
        failureMode: string;
      }>(`${BASE_URL}/video/streams/${cameraId}/health`),
    reconnect: (cameraId: string) =>
      fetchJson<{ success: boolean; message: string; stream: StreamTelemetry }>(
        `${BASE_URL}/video/streams/${cameraId}/reconnect`,
        { method: 'POST' }
      ),
    connect: (cameraId: string) =>
      fetchJson<{ success: boolean; message: string; stream: StreamTelemetry }>(
        `${BASE_URL}/video/streams/${cameraId}/connect`,
        { method: 'POST' }
      ),
    disconnect: (cameraId: string) =>
      fetchJson<{ success: boolean; message: string; stream: StreamTelemetry }>(
        `${BASE_URL}/video/streams/${cameraId}/disconnect`,
        { method: 'POST' }
      ),
    getFrame: (cameraId: string) =>
      fetchJson<{ frame: RawFrame }>(`${BASE_URL}/video/streams/${cameraId}/frame`),
    simulateFailure: (cameraId: string, failureMode: StreamFailureMode) =>
      fetchJson<{ success: boolean; message: string; stream: StreamTelemetry }>(
        `${BASE_URL}/video/streams/${cameraId}/simulate-failure`,
        {
          method: 'POST',
          body: JSON.stringify({ failureMode }),
        }
      ),
    simulateRestore: (cameraId: string) =>
      fetchJson<{ success: boolean; message: string; stream: StreamTelemetry }>(
        `${BASE_URL}/video/streams/${cameraId}/simulate-restore`,
        { method: 'POST' }
      ),
    setTestScene: (cameraId: string, scene: string) =>
      fetchJson<{ success: boolean; message: string; cameraId: string; scene: string }>(
        `${BASE_URL}/video/streams/${cameraId}/test-scene`,
        {
          method: 'POST',
          body: JSON.stringify({ scene }),
        }
      ),
    submitLiveFrame: (
      cameraId: string,
      data: {
        dataUri: string;
        width?: number;
        height?: number;
        timestamp?: string;
        metadata?: Record<string, any>;
      }
    ) =>
      fetchJson<{ success: boolean; sequenceNumber: number; timestamp: string; sizeBytes: number }>(
        `${BASE_URL}/video/streams/${cameraId}/frame`,
        {
          method: 'POST',
          body: JSON.stringify(data),
        }
      ),
    setSourceMode: (
      cameraId: string,
      data: {
        sourceMode: 'LIVE' | 'SIMULATION' | 'OFFLINE' | 'UNAVAILABLE';
        sourceType?: string;
        browserStreamUrl?: string;
        sourceAttribution?: string;
        aiProcessingStatus?: string;
      }
    ) =>
      fetchJson<{ success: boolean; camera: Camera; telemetry: StreamTelemetry }>(
        `${BASE_URL}/video/streams/${cameraId}/source-mode`,
        {
          method: 'POST',
          body: JSON.stringify(data),
        }
      ),
  },

  ai: {
    getHealth: () =>
      fetchJson<{ success: boolean; data: AiSubsystemHealth }>(`${BASE_URL}/ai/health`),
    getConfig: () =>
      fetchJson<{ success: boolean; data: AiInferenceConfig }>(`${BASE_URL}/ai/config`),
    updateConfig: (patch: Partial<AiInferenceConfig>) =>
      fetchJson<{ success: boolean; message: string; data: AiInferenceConfig }>(`${BASE_URL}/ai/config`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    inferCamera: (cameraId: string) =>
      fetchJson<{
        success: boolean;
        cameraId: string;
        timestamp: string;
        latencyMs: number;
        personCount: number;
        detections: NormalizedDetection[];
      }>(`${BASE_URL}/ai/infer/${cameraId}`, { method: 'POST' }),
    setTestScene: (cameraId: string, scene: string) =>
      fetchJson<{ success: boolean; cameraId: string; testScene: string; message: string }>(
        `${BASE_URL}/ai/camera/${cameraId}/test-scene`,
        {
          method: 'POST',
          body: JSON.stringify({ scene }),
        }
      ),
    enableCamera: (cameraId: string) =>
      fetchJson<{ success: boolean; message: string }>(`${BASE_URL}/ai/camera/${cameraId}/enable`, {
        method: 'POST',
      }),
    disableCamera: (cameraId: string) =>
      fetchJson<{ success: boolean; message: string }>(`${BASE_URL}/ai/camera/${cameraId}/disable`, {
        method: 'POST',
      }),
    getStatus: () =>
      fetchJson<{
        success: boolean;
        telemetry: {
          status: 'READY' | 'DEGRADED' | 'UNAVAILABLE' | 'CONFIGURATION_REQUIRED';
          modelName: string;
          provider: string;
          isLiveEnvironmentAvailable: boolean;
          isSimulatedData: boolean;
          totalRequests: number;
          successfulRequests: number;
          failedRequests: number;
          lastLatencyMs: number;
          lastError?: string;
        };
        live: {
          state: 'NOT_IMPLEMENTED' | 'READY';
          reason: string;
          supportedModes: string[];
          requiredCapabilities: string[];
        };
      }>(`${BASE_URL}/ai/status`),
    copilotQuery: (params: {
      query: string;
      cameraId?: string;
      incidentId?: string;
      alertId?: string;
      trackId?: string;
    }) =>
      fetchJson<{
        success: boolean;
        data: {
          id: string;
          response: string;
          verifiedFacts?: string[];
          citations?: { type: string; id: string; label: string }[];
          provenance: 'LIVE' | 'SIMULATION' | 'SYNTHETIC';
          toolInvocations?: { toolName: string; resultSummary: string }[];
          latencyMs: number;
          modelName: string;
          safetyRating: string;
        };
      }>(`${BASE_URL}/ai/copilot/query`, {
        method: 'POST',
        body: JSON.stringify(params),
      }),
    summarizeIncident: (incidentId: string) =>
      fetchJson<{
        success: boolean;
        data: {
          incidentId: string;
          incidentNumber: string;
          summary: string;
          keyFacts: string[];
          involvedCameras: string[];
          recommendedActions: string[];
          provenance: 'LIVE' | 'SIMULATION' | 'SYNTHETIC';
          latencyMs: number;
        };
      }>(`${BASE_URL}/ai/incidents/${incidentId}/summarize`, {
        method: 'POST',
      }),
    explainAlert: (alertId: string) =>
      fetchJson<{
        success: boolean;
        data: {
          alertId: string;
          alertNumber: string;
          explanation: string;
          causalFactors: string[];
          recommendedVerification: string;
          provenance: 'LIVE' | 'SIMULATION' | 'SYNTHETIC';
          latencyMs: number;
        };
      }>(`${BASE_URL}/ai/alerts/${alertId}/explain`, {
        method: 'POST',
      }),
    investigateEntity: (params: { entityType: string; entityId: string; query?: string }) =>
      fetchJson<{
        success: boolean;
        data: {
          id: string;
          response: string;
          verifiedFacts?: string[];
          citations?: { type: string; id: string; label: string }[];
          provenance: 'LIVE' | 'SIMULATION' | 'SYNTHETIC';
          toolInvocations?: { toolName: string; resultSummary: string }[];
          latencyMs: number;
        };
      }>(`${BASE_URL}/ai/investigate`, {
        method: 'POST',
        body: JSON.stringify(params),
      }),
    generateTimeline: (params: { incidentId?: string; cameraId?: string; startTime?: string; endTime?: string }) =>
      fetchJson<{
        success: boolean;
        data: {
          id: string;
          response: string;
          verifiedFacts?: string[];
          provenance: 'LIVE' | 'SIMULATION' | 'SYNTHETIC';
          latencyMs: number;
        };
      }>(`${BASE_URL}/ai/timeline`, {
        method: 'POST',
        body: JSON.stringify(params),
      }),
    queryCameraCopilot: (cameraId: string, query: string) =>
      fetchJson<{
        success: boolean;
        data: {
          id: string;
          response: string;
          verifiedFacts?: string[];
          citations?: { type: string; id: string; label: string }[];
          provenance: 'LIVE' | 'SIMULATION' | 'SYNTHETIC';
          toolInvocations?: { toolName: string; resultSummary: string }[];
          latencyMs: number;
        };
      }>(`${BASE_URL}/ai/camera/${cameraId}/copilot`, {
        method: 'POST',
        body: JSON.stringify({ query }),
      }),
    getLiveStatus: () =>
      fetchJson<{
        success: boolean;
        data: {
          state: string;
          reason: string;
          supportedModes: string[];
          requiredCapabilities: string[];
        };
      }>(`${BASE_URL}/ai/live/status`),
  },

  detections: {
    list: (params?: { cameraId?: string; objectType?: string; minConfidence?: number; limit?: number }) => {
      const qs = new URLSearchParams();
      if (params?.cameraId) qs.set('cameraId', params.cameraId);
      if (params?.objectType) qs.set('objectType', params.objectType);
      if (params?.minConfidence !== undefined) qs.set('minConfidence', String(params.minConfidence));
      if (params?.limit) qs.set('limit', String(params.limit));
      return fetchJson<{ success: boolean; total: number; data: NormalizedDetection[] }>(
        `${BASE_URL}/detections?${qs.toString()}`
      );
    },
    getCameraDetections: (cameraId: string, windowMs?: number) => {
      const qs = windowMs ? `?windowMs=${windowMs}` : '';
      return fetchJson<{
        success: boolean;
        cameraId: string;
        activeDetections: NormalizedDetection[];
        latestDetection: NormalizedDetection | null;
        activePersonCount: number;
        recentHistory: NormalizedDetection[];
      }>(`${BASE_URL}/detections/camera/${cameraId}${qs}`);
    },
    getById: (id: string) =>
      fetchJson<{ success: boolean; data: NormalizedDetection }>(`${BASE_URL}/detections/${id}`),
  },

  tracks: {
    list: (params?: { cameraId?: string; state?: TrackState; limit?: number }) => {
      const qs = new URLSearchParams();
      if (params?.cameraId) qs.set('cameraId', params.cameraId);
      if (params?.state) qs.set('state', params.state);
      if (params?.limit) qs.set('limit', String(params.limit));
      return fetchJson<{ success: boolean; total: number; data: Track[] }>(
        `${BASE_URL}/tracks?${qs.toString()}`
      );
    },
    getCameraTracks: (cameraId: string) =>
      fetchJson<{
        success: boolean;
        cameraId: string;
        activeCount: number;
        activeTracks: Track[];
        recentHistory: Track[];
      }>(`${BASE_URL}/tracks/camera/${cameraId}`),
    getById: (id: string) =>
      fetchJson<{ success: boolean; data: Track }>(`${BASE_URL}/tracks/${id}`),
  },

  tracking: {
    getHealth: () =>
      fetchJson<{ success: boolean; data: TrackingSubsystemHealth }>(`${BASE_URL}/tracking/health`),
    getConfig: () =>
      fetchJson<{ success: boolean; data: TrackingConfig }>(`${BASE_URL}/tracking/config`),
    updateConfig: (patch: Partial<TrackingConfig>) =>
      fetchJson<{ success: boolean; message: string; data: TrackingConfig }>(`${BASE_URL}/tracking/config`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    resetCamera: (cameraId: string) =>
      fetchJson<{ success: boolean; message: string }>(`${BASE_URL}/tracking/reset/${cameraId}`, {
        method: 'POST',
      }),
  },

  faces: {
    list: (params?: {
      personTrackId?: string;
      cameraId?: string;
      quality?: FaceQualityState;
      recognitionStatus?: FaceRecognitionStatus;
      isWatchlistMatch?: boolean;
      watchlistCategory?: string;
      limit?: number;
    }) => {
      const qs = new URLSearchParams();
      if (params?.personTrackId) qs.set('personTrackId', params.personTrackId);
      if (params?.cameraId) qs.set('cameraId', params.cameraId);
      if (params?.quality) qs.set('quality', params.quality);
      if (params?.recognitionStatus) qs.set('recognitionStatus', params.recognitionStatus);
      if (params?.isWatchlistMatch !== undefined) qs.set('isWatchlistMatch', String(params.isWatchlistMatch));
      if (params?.watchlistCategory) qs.set('watchlistCategory', params.watchlistCategory);
      if (params?.limit) qs.set('limit', String(params.limit));
      return fetchJson<{ success: boolean; total: number; records: PersistentPersonFaceRecord[] }>(
        `${BASE_URL}/faces?${qs.toString()}`
      );
    },
    getMetrics: () =>
      fetchJson<{ success: boolean; metrics: FaceTelemetryMetrics }>(`${BASE_URL}/faces/metrics`),
    getEvents: (limit?: number) =>
      fetchJson<{ success: boolean; total: number; events: FaceEventPayload[] }>(
        `${BASE_URL}/faces/events${limit ? `?limit=${limit}` : ''}`
      ),
    getWatchlists: () =>
      fetchJson<{ success: boolean; total: number; watchlists: SyntheticFaceWatchlist[] }>(
        `${BASE_URL}/faces/watchlists`
      ),
    getByPersonTrackId: (personTrackId: string) =>
      fetchJson<{ success: boolean; record: PersistentPersonFaceRecord }>(
        `${BASE_URL}/faces/persons/${personTrackId}`
      ),
    runScenario: (scenarioId: string) =>
      fetchJson<{ success: boolean; scenario: string; message: string; result: any }>(
        `${BASE_URL}/faces/scenarios/${scenarioId}`,
        { method: 'POST' }
      ),
  },

  analytics: {
    getGraph: () =>
      fetchJson<{
        success: boolean;
        data: {
          graph: CameraGraph;
          stats: {
            totalNodes: number;
            totalEdges: number;
            activeMasts: number;
            anprEnabledMasts: number;
            thermalEnabledMasts: number;
            faceAnalyticsMasts: number;
            sectorsCovered: string[];
          };
          disclaimer: string;
        };
      }>(`${BASE_URL}/analytics/graph`),
    getAdjacentCameras: (cameraId: string) =>
      fetchJson<{ success: boolean; cameraId: string; neighbors: any[] }>(
        `${BASE_URL}/analytics/graph/adjacent/${cameraId}`
      ),
    getCorrelations: (params?: {
      entityType?: CorrelatedEntityType;
      confidenceLevel?: CorrelationConfidenceLevel;
      cameraId?: string;
      sectorId?: string;
      minConfidence?: number;
      limit?: number;
    }) => {
      const qs = new URLSearchParams();
      if (params?.entityType) qs.set('entityType', params.entityType);
      if (params?.confidenceLevel) qs.set('confidenceLevel', params.confidenceLevel);
      if (params?.cameraId) qs.set('cameraId', params.cameraId);
      if (params?.sectorId) qs.set('sectorId', params.sectorId);
      if (params?.minConfidence) qs.set('minConfidence', String(params.minConfidence));
      if (params?.limit) qs.set('limit', String(params.limit));
      return fetchJson<{
        success: boolean;
        total: number;
        data: CrossCameraCorrelation[];
        disclaimer: string;
      }>(`${BASE_URL}/analytics/correlations?${qs.toString()}`);
    },
    getCorrelationById: (id: string) =>
      fetchJson<{ success: boolean; data: CrossCameraCorrelation }>(
        `${BASE_URL}/analytics/correlations/${id}`
      ),
    getObservations: (params?: { cameraId?: string; entityType?: CorrelatedEntityType; trackId?: string; limit?: number }) => {
      const qs = new URLSearchParams();
      if (params?.cameraId) qs.set('cameraId', params.cameraId);
      if (params?.entityType) qs.set('entityType', params.entityType);
      if (params?.trackId) qs.set('trackId', params.trackId);
      if (params?.limit) qs.set('limit', String(params.limit));
      return fetchJson<{ success: boolean; total: number; data: CorrelatedObservation[] }>(
        `${BASE_URL}/analytics/observations?${qs.toString()}`
      );
    },
    reconstructVehicle: (params: { plateNumber?: string; trackId?: string; startTime?: string; endTime?: string }) => {
      const qs = new URLSearchParams();
      if (params.plateNumber) qs.set('plateNumber', params.plateNumber);
      if (params.trackId) qs.set('trackId', params.trackId);
      if (params.startTime) qs.set('startTime', params.startTime);
      if (params.endTime) qs.set('endTime', params.endTime);
      return fetchJson<{ success: boolean; data: VehicleMovementReconstruction }>(
        `${BASE_URL}/analytics/reconstruction/vehicle?${qs.toString()}`
      );
    },
    reconstructPerson: (params: { trackId?: string; faceObservationId?: string; startTime?: string; endTime?: string }) => {
      const qs = new URLSearchParams();
      if (params.trackId) qs.set('trackId', params.trackId);
      if (params.faceObservationId) qs.set('faceObservationId', params.faceObservationId);
      if (params.startTime) qs.set('startTime', params.startTime);
      if (params.endTime) qs.set('endTime', params.endTime);
      return fetchJson<{ success: boolean; data: PersonMovementReconstruction }>(
        `${BASE_URL}/analytics/reconstruction/person?${qs.toString()}`
      );
    },
    analyzeRoute: (params: { cameras: string[]; entityType?: CorrelatedEntityType; entityId?: string; timestamps?: string[] }) => {
      const qs = new URLSearchParams();
      qs.set('cameras', params.cameras.join(','));
      if (params.entityType) qs.set('entityType', params.entityType);
      if (params.entityId) qs.set('entityId', params.entityId);
      if (params.timestamps) qs.set('timestamps', params.timestamps.join(','));
      return fetchJson<{ success: boolean; data: RouteAnalysisResult }>(
        `${BASE_URL}/analytics/route-analysis?${qs.toString()}`
      );
    },
    getEvents: (params?: { eventType?: string; cameraId?: string; severity?: string; trackId?: string; limit?: number }) => {
      const qs = new URLSearchParams();
      if (params?.eventType) qs.set('eventType', params.eventType);
      if (params?.cameraId) qs.set('cameraId', params.cameraId);
      if (params?.severity) qs.set('severity', params.severity);
      if (params?.trackId) qs.set('trackId', params.trackId);
      if (params?.limit) qs.set('limit', String(params.limit));
      return fetchJson<{ success: boolean; total: number; data: AdvancedAnalyticsEvent[] }>(
        `${BASE_URL}/analytics/events?${qs.toString()}`
      );
    },
    getConfig: () =>
      fetchJson<{ success: boolean; data: ObservableRuleConfig }>(`${BASE_URL}/analytics/config`),
    updateConfig: (patch: Partial<ObservableRuleConfig>) =>
      fetchJson<{ success: boolean; message: string; data: ObservableRuleConfig }>(
        `${BASE_URL}/analytics/config`,
        { method: 'POST', body: JSON.stringify(patch) }
      ),
    simulateScenario: (scenarioType: string, cameraId?: string, trackId?: string) =>
      fetchJson<{ success: boolean; message: string; data: AdvancedAnalyticsEvent }>(
        `${BASE_URL}/analytics/simulate`,
        { method: 'POST', body: JSON.stringify({ scenarioType, cameraId, trackId }) }
      ),
  },
};
