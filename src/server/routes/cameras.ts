import { Router, Request, Response } from 'express';
import { dataStore, sanitizeStreamEndpoint, hasCameraPermission } from '../store';
import { logger } from '../logger';
import { Camera, CameraStatus, CameraType, CameraProtocol } from '../types';
import { videoGateway } from '../../video-gateway/video-gateway';

export const camerasRouter = Router();

/**
 * Extracts and validates operator authentication and role context.
 */
function getOperatorContext(req: Request): { callsign: string; role: string } {
  const headerCallsign = (req.headers['x-operator-callsign'] as string) || (req.body?.operatorCallsign as string);
  const headerRole = (req.headers['x-operator-role'] as string) || (req.body?.operatorRole as string);

  if (headerCallsign) {
    const user = dataStore.users.find((u) => u.callsign.toUpperCase() === headerCallsign.toUpperCase());
    if (user) {
      return { callsign: user.callsign, role: user.role };
    }
    return { callsign: headerCallsign, role: headerRole || 'WATCH_COMMANDER' };
  }

  // Default fallback for development sessions
  return { callsign: 'COMMANDER-1', role: 'WATCH_COMMANDER' };
}

// GET /api/v1/cameras
camerasRouter.get('/', (req: Request, res: Response) => {
  const { sectorId, status, search, includeDecommissioned, sortBy, sortOrder } = req.query;
  let result = [...dataStore.cameras];

  // Decommission filter
  if (includeDecommissioned === 'false') {
    result = result.filter((c) => !c.isDecommissioned);
  }

  // Sector filter
  if (sectorId && typeof sectorId === 'string') {
    result = result.filter((c) => c.sectorId === sectorId);
  }

  // Status filter
  if (status && typeof status === 'string') {
    if (status.toUpperCase() === 'DECOMMISSIONED') {
      result = result.filter((c) => c.isDecommissioned);
    } else {
      result = result.filter((c) => c.status === status && !c.isDecommissioned);
    }
  }

  // Search filter
  if (search && typeof search === 'string' && search.trim()) {
    const q = search.trim().toLowerCase();
    result = result.filter((c) => {
      const matchId = (c.cameraId || c.identifier || '').toLowerCase().includes(q);
      const matchName = (c.name || '').toLowerCase().includes(q);
      const matchSite = (c.siteName || '').toLowerCase().includes(q);
      const matchModel = (c.model || '').toLowerCase().includes(q);
      const matchSector = (c.sectorName || '').toLowerCase().includes(q);
      return matchId || matchName || matchSite || matchModel || matchSector;
    });
  }

  // Sorting
  if (sortBy && typeof sortBy === 'string') {
    const dir = sortOrder === 'desc' ? -1 : 1;
    result.sort((a, b) => {
      let aVal = (a as any)[sortBy];
      let bVal = (b as any)[sortBy];
      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();
      if (aVal < bVal) return -1 * dir;
      if (aVal > bVal) return 1 * dir;
      return 0;
    });
  }

  res.json({
    success: true,
    total: result.length,
    cameras: result,
  });
});

// GET /api/v1/cameras/:id
camerasRouter.get('/:id', (req: Request, res: Response) => {
  const idParam = req.params.id.trim().toLowerCase();
  const camera = dataStore.cameras.find(
    (c) => c.id.toLowerCase() === idParam || 
           (c.cameraId && c.cameraId.toLowerCase() === idParam) || 
           (c.identifier && c.identifier.toLowerCase() === idParam)
  );

  if (!camera) {
    res.status(404).json({ success: false, error: 'Camera not found' });
    return;
  }
  res.json({ success: true, camera });
});

// POST /api/v1/cameras (Register Camera)
camerasRouter.post('/', (req: Request, res: Response) => {
  const operator = getOperatorContext(req);

  // RBAC Enforcement
  if (!hasCameraPermission(operator.role, 'camera.create')) {
    dataStore.logCameraAudit(operator.callsign, 'CAMERA_CREATE_ATTEMPT', req.body?.cameraId || 'UNKNOWN', 'FAILURE', {
      reason: 'Unauthorized: insufficient permissions',
      role: operator.role,
    }, req.ip);
    res.status(403).json({ success: false, error: 'Forbidden: Insufficient permissions to register cameras (requires camera.create)' });
    return;
  }

  const {
    cameraId,
    name,
    sectorId,
    siteName,
    latitude,
    longitude,
    cameraType,
    resolution,
    fps,
    protocol,
    streamEndpointReference,
    description,
    installationDate,
    model,
    codec,
    isPtSupported,
  } = req.body;

  // Validation: Required fields
  const missingFields: string[] = [];
  if (!cameraId) missingFields.push('cameraId');
  if (!name) missingFields.push('name');
  if (!sectorId) missingFields.push('sectorId');
  if (!siteName) missingFields.push('siteName');
  if (latitude === undefined || latitude === null) missingFields.push('latitude');
  if (longitude === undefined || longitude === null) missingFields.push('longitude');
  if (!cameraType) missingFields.push('cameraType');
  if (!resolution) missingFields.push('resolution');
  if (fps === undefined || fps === null) missingFields.push('fps');
  if (!protocol) missingFields.push('protocol');
  if (!streamEndpointReference) missingFields.push('streamEndpointReference');

  if (missingFields.length > 0) {
    res.status(400).json({
      success: false,
      error: `Missing required camera fields: ${missingFields.join(', ')}`,
      missingFields,
    });
    return;
  }

  // Identifier format validation (alphanumeric, hyphen, underscore, 3-20 chars)
  const normalizedId = String(cameraId).trim().toUpperCase();
  const idRegex = /^[A-Z0-9_-]{3,20}$/;
  if (!idRegex.test(normalizedId)) {
    res.status(400).json({
      success: false,
      error: 'Invalid Camera ID format. Must be 3-20 characters containing letters, numbers, hyphens, or underscores (e.g. CAM-13).',
    });
    return;
  }

  // Duplicate Camera ID check
  const duplicate = dataStore.cameras.some(
    (c) => (c.cameraId && c.cameraId.toUpperCase() === normalizedId) ||
           (c.identifier && c.identifier.toUpperCase() === normalizedId)
  );
  if (duplicate) {
    res.status(400).json({
      success: false,
      error: `Camera ID '${normalizedId}' already exists in registry. Business identifiers must be unique.`,
    });
    return;
  }

  // Coordinate range validation
  const numLat = Number(latitude);
  const numLng = Number(longitude);
  if (isNaN(numLat) || numLat < -90 || numLat > 90) {
    res.status(400).json({
      success: false,
      error: 'Invalid latitude. Must be a decimal number between -90.0 and 90.0 degrees.',
    });
    return;
  }
  if (isNaN(numLng) || numLng < -180 || numLng > 180) {
    res.status(400).json({
      success: false,
      error: 'Invalid longitude. Must be a decimal number between -180.0 and 180.0 degrees.',
    });
    return;
  }

  // FPS validation
  const numFps = parseInt(String(fps), 10);
  if (isNaN(numFps) || numFps < 1 || numFps > 120) {
    res.status(400).json({
      success: false,
      error: 'Invalid FPS. Frame rate must be an integer between 1 and 120.',
    });
    return;
  }

  // Protocol validation
  const normalizedProtocol = String(protocol).toUpperCase() as CameraProtocol;
  const supportedProtocols: string[] = ['RTSP', 'RTSPS', 'ONVIF', 'HLS', 'WEBRTC', 'WEBCAM', 'SIMULATED'];
  if (!supportedProtocols.includes(normalizedProtocol)) {
    res.status(400).json({
      success: false,
      error: `Invalid protocol. Supported protocols are: ${supportedProtocols.join(', ')}.`,
    });
    return;
  }

  // Camera Type validation
  const validCameraTypes: CameraType[] = [
    'FIXED_OPTICAL',
    'PTZ_OPTICAL',
    'THERMAL_FIXED',
    'DUAL_THERMAL_PTZ',
    'RADAR_SLAVED_PTZ',
    'ANPR_SPECIALIZED',
  ];
  if (!validCameraTypes.includes(cameraType as CameraType)) {
    res.status(400).json({
      success: false,
      error: `Invalid cameraType. Allowed types: ${validCameraTypes.join(', ')}`,
    });
    return;
  }

  // Find sector name
  const sector = dataStore.sectors.find((s) => s.id === sectorId);
  const sectorName = sector ? sector.name : 'Unknown Sector';

  // Sanitize stream endpoint and extract secret token (protects plaintext passwords)
  const { streamEndpointReference: safeEndpoint, credentialSecretRef } = sanitizeStreamEndpoint(
    streamEndpointReference,
    normalizedId
  );

  const newCamera: Camera = {
    id: `cam-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
    cameraId: normalizedId,
    identifier: normalizedId,
    name: String(name).trim(),
    sectorId,
    sectorName,
    siteName: String(siteName).trim(),
    latitude: numLat,
    longitude: numLng,
    cameraType: cameraType as CameraType,
    resolution: String(resolution).trim(),
    fps: numFps,
    protocol: normalizedProtocol,
    streamEndpointReference: safeEndpoint,
    credentialSecretRef,
    status: 'ONLINE',
    aiAnalyticsStatus: {
      personDetection: 'NOT_CONFIGURED',
      vehicleDetection: 'NOT_CONFIGURED',
      anpr: 'NOT_CONFIGURED',
      faceAnalytics: 'NOT_CONFIGURED',
      nightAnalytics: 'NOT_CONFIGURED',
      behaviorAnalytics: 'NOT_CONFIGURED',
    },
    installationDate: installationDate || new Date().toISOString(),
    description: description ? String(description).trim() : 'Operational perimeter camera.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isDecommissioned: false,
    isSimulated: req.body.sourceMode === 'SIMULATION' || normalizedProtocol === 'SIMULATED',
    sourceMode: (req.body.sourceMode as any) || (normalizedProtocol === 'SIMULATED' ? 'SIMULATION' : 'LIVE'),
    sourceType:
      (req.body.sourceType as any) ||
      (normalizedProtocol === 'WEBCAM'
        ? 'WEBCAM'
        : normalizedProtocol === 'HLS'
        ? 'HLS'
        : normalizedProtocol === 'WEBRTC'
        ? 'WEBRTC'
        : normalizedProtocol === 'SIMULATED'
        ? 'SIMULATED'
        : 'RTSP'),
    browserStreamUrl: req.body.browserStreamUrl || (normalizedProtocol === 'HLS' || normalizedProtocol === 'WEBRTC' ? safeEndpoint : undefined),
    sourceAttribution: req.body.sourceAttribution || (req.body.sourceMode === 'SIMULATION' ? 'Synthetic Border Simulation' : 'Operator Added Live Stream'),
    aiProcessingStatus:
      (req.body.aiProcessingStatus as any) ||
      (req.body.sourceMode === 'SIMULATION' || normalizedProtocol === 'SIMULATED'
        ? 'READY'
        : normalizedProtocol === 'WEBCAM'
        ? 'READY'
        : 'UNAVAILABLE'),
    streamConfigStatus: 'UNVALIDATED',
    connectionStatus: 'UNCHECKED',
    currentFps: numFps,
    currentLatencyMs: 40,
    model: model ? String(model).trim() : `${cameraType} Sensor Head`,
    codec: codec ? String(codec).trim() : 'H.265',
    isPtSupported: isPtSupported ?? cameraType.includes('PTZ'),
    lastHeartbeatAt: new Date().toISOString(),
  };

  dataStore.cameras.unshift(newCamera);

  // Register with video gateway for immediate ingestion
  try {
    videoGateway.registerCameraStream(newCamera);
  } catch (err) {
    logger.warn(`Failed to auto-register stream for new camera ${newCamera.cameraId}: ${err}`);
  }

  dataStore.logCameraAudit(
    operator.callsign,
    'CAMERA_CREATED',
    newCamera.cameraId,
    'SUCCESS',
    {
      name: newCamera.name,
      sectorId: newCamera.sectorId,
      siteName: newCamera.siteName,
      cameraType: newCamera.cameraType,
    },
    req.ip
  );

  dataStore.broadcastEvent({
    eventId: `evt-${Date.now()}`,
    eventType: 'camera.created',
    timestamp: new Date().toISOString(),
    source: newCamera.cameraId,
    payload: { camera: newCamera },
  });

  logger.info(`Camera ${newCamera.cameraId} registered successfully by ${operator.callsign}`);
  res.status(201).json({ success: true, camera: newCamera });
});

// PATCH /api/v1/cameras/:id (Configure / Edit Camera)
camerasRouter.patch('/:id', (req: Request, res: Response) => {
  const operator = getOperatorContext(req);

  // RBAC Enforcement
  if (!hasCameraPermission(operator.role, 'camera.update')) {
    res.status(403).json({ success: false, error: 'Forbidden: Insufficient permissions to update camera configuration (requires camera.update)' });
    return;
  }

  const idParam = req.params.id.trim().toLowerCase();
  const camera = dataStore.cameras.find(
    (c) => c.id.toLowerCase() === idParam || 
           (c.cameraId && c.cameraId.toLowerCase() === idParam) || 
           (c.identifier && c.identifier.toLowerCase() === idParam)
  );

  if (!camera) {
    res.status(404).json({ success: false, error: 'Camera not found' });
    return;
  }

  // Prevent modification of decommissioned camera
  if (camera.isDecommissioned) {
    res.status(400).json({ success: false, error: 'Cannot modify a decommissioned camera.' });
    return;
  }

  // Protect immutable identifiers: Camera ID cannot be changed once created
  if (req.body.cameraId && req.body.cameraId.toUpperCase() !== camera.cameraId.toUpperCase()) {
    res.status(400).json({
      success: false,
      error: 'Camera ID is immutable and cannot be altered after initial registration.',
    });
    return;
  }

  const allowedUpdates = [
    'name',
    'sectorId',
    'siteName',
    'latitude',
    'longitude',
    'cameraType',
    'resolution',
    'fps',
    'protocol',
    'streamEndpointReference',
    'description',
    'model',
    'codec',
    'firmwareVersion',
    'isPtSupported',
    'azimuthDegrees',
    'fieldOfViewDegrees',
    'aiAnalyticsStatus',
  ];

  const changes: Record<string, any> = {};

  // Validate coordinates if updating
  if (req.body.latitude !== undefined) {
    const lat = Number(req.body.latitude);
    if (isNaN(lat) || lat < -90 || lat > 90) {
      res.status(400).json({ success: false, error: 'Latitude must be between -90 and 90 degrees.' });
      return;
    }
    camera.latitude = lat;
    changes.latitude = lat;
  }

  if (req.body.longitude !== undefined) {
    const lng = Number(req.body.longitude);
    if (isNaN(lng) || lng < -180 || lng > 180) {
      res.status(400).json({ success: false, error: 'Longitude must be between -180 and 180 degrees.' });
      return;
    }
    camera.longitude = lng;
    changes.longitude = lng;
  }

  // Validate FPS if updating
  if (req.body.fps !== undefined) {
    const fpsNum = parseInt(String(req.body.fps), 10);
    if (isNaN(fpsNum) || fpsNum < 1 || fpsNum > 120) {
      res.status(400).json({ success: false, error: 'FPS must be an integer between 1 and 120.' });
      return;
    }
    camera.fps = fpsNum;
    changes.fps = fpsNum;
  }

  // Validate protocol if updating
  if (req.body.protocol !== undefined) {
    const proto = String(req.body.protocol).toUpperCase() as CameraProtocol;
    const supportedProtocols = ['RTSP', 'RTSPS', 'ONVIF', 'HLS', 'WEBRTC', 'WEBCAM', 'SIMULATED'];
    if (!supportedProtocols.includes(proto)) {
      res.status(400).json({ success: false, error: `Protocol must be one of: ${supportedProtocols.join(', ')}.` });
      return;
    }
    camera.protocol = proto;
    changes.protocol = proto;
  }

  // Live Stream Abstraction fields
  if (req.body.sourceMode !== undefined) {
    const mode = req.body.sourceMode;
    camera.sourceMode = mode;
    camera.isSimulated = mode === 'SIMULATION';
    changes.sourceMode = mode;
    if (mode === 'OFFLINE') camera.status = 'OFFLINE';
    if (mode === 'LIVE' || mode === 'SIMULATION') camera.status = 'ONLINE';
    if (mode === 'UNAVAILABLE') camera.status = 'DEGRADED';
  }
  if (req.body.sourceType !== undefined) {
    camera.sourceType = req.body.sourceType;
    changes.sourceType = camera.sourceType;
  }
  if (req.body.browserStreamUrl !== undefined) {
    camera.browserStreamUrl = req.body.browserStreamUrl;
    changes.browserStreamUrl = camera.browserStreamUrl;
  }
  if (req.body.sourceAttribution !== undefined) {
    camera.sourceAttribution = req.body.sourceAttribution;
    changes.sourceAttribution = camera.sourceAttribution;
  }
  if (req.body.aiProcessingStatus !== undefined) {
    camera.aiProcessingStatus = req.body.aiProcessingStatus;
    changes.aiProcessingStatus = camera.aiProcessingStatus;
  } else if (req.body.sourceMode !== undefined) {
    camera.aiProcessingStatus = camera.sourceMode === 'LIVE' ? (camera.sourceType === 'WEBCAM' ? 'READY' : 'UNAVAILABLE') : 'READY';
  }

  // Sync with video gateway
  try {
    videoGateway.updateCameraStreamConfig(camera.id, {
      sourceMode: camera.sourceMode,
      sourceType: camera.sourceType,
      browserStreamUrl: camera.browserStreamUrl,
      sourceAttribution: camera.sourceAttribution,
      aiProcessingStatus: camera.aiProcessingStatus,
    });
  } catch (err) {
    logger.warn(`Failed to sync gateway config for camera ${camera.cameraId}: ${err}`);
  }

  // Stream reference update (sanitizes secret passwords)
  if (req.body.streamEndpointReference !== undefined) {
    const { streamEndpointReference: safeRef, credentialSecretRef } = sanitizeStreamEndpoint(
      req.body.streamEndpointReference,
      camera.cameraId
    );
    camera.streamEndpointReference = safeRef;
    if (credentialSecretRef) camera.credentialSecretRef = credentialSecretRef;
    changes.streamEndpointReference = safeRef;
  }

  // String fields
  if (req.body.name !== undefined) {
    camera.name = String(req.body.name).trim();
    changes.name = camera.name;
  }
  if (req.body.siteName !== undefined) {
    camera.siteName = String(req.body.siteName).trim();
    changes.siteName = camera.siteName;
  }
  if (req.body.description !== undefined) {
    camera.description = String(req.body.description).trim();
    changes.description = camera.description;
  }
  if (req.body.resolution !== undefined) {
    camera.resolution = String(req.body.resolution).trim();
    changes.resolution = camera.resolution;
  }
  if (req.body.cameraType !== undefined) {
    camera.cameraType = req.body.cameraType;
    changes.cameraType = camera.cameraType;
  }
  if (req.body.sectorId !== undefined) {
    camera.sectorId = req.body.sectorId;
    const s = dataStore.sectors.find((sec) => sec.id === req.body.sectorId);
    if (s) camera.sectorName = s.name;
    changes.sectorId = camera.sectorId;
  }
  if (req.body.model !== undefined) {
    camera.model = String(req.body.model).trim();
    changes.model = camera.model;
  }
  if (req.body.codec !== undefined) {
    camera.codec = String(req.body.codec).trim();
    changes.codec = camera.codec;
  }
  if (req.body.isPtSupported !== undefined) {
    camera.isPtSupported = Boolean(req.body.isPtSupported);
    changes.isPtSupported = camera.isPtSupported;
  }

  // AI analytics configuration updates (config only, no simulated detections)
  if (req.body.aiAnalyticsStatus && typeof req.body.aiAnalyticsStatus === 'object') {
    camera.aiAnalyticsStatus = {
      ...camera.aiAnalyticsStatus,
      ...req.body.aiAnalyticsStatus,
    };
    changes.aiAnalyticsStatus = camera.aiAnalyticsStatus;
  }

  camera.updatedAt = new Date().toISOString();

  dataStore.logCameraAudit(
    operator.callsign,
    'CAMERA_UPDATED',
    camera.cameraId,
    'SUCCESS',
    { changes },
    req.ip
  );

  dataStore.broadcastEvent({
    eventId: `evt-${Date.now()}`,
    eventType: 'camera.updated',
    timestamp: new Date().toISOString(),
    source: camera.cameraId,
    payload: { camera, changes },
  });

  logger.info(`Camera ${camera.cameraId} updated by ${operator.callsign}`);
  res.json({ success: true, camera });
});

// POST /api/v1/cameras/:id/enable
camerasRouter.post('/:id/enable', (req: Request, res: Response) => {
  const operator = getOperatorContext(req);

  // RBAC Enforcement
  if (!hasCameraPermission(operator.role, 'camera.enable')) {
    res.status(403).json({ success: false, error: 'Forbidden: Insufficient permissions to enable camera (requires camera.enable)' });
    return;
  }

  const idParam = req.params.id.trim().toLowerCase();
  const camera = dataStore.cameras.find(
    (c) => c.id.toLowerCase() === idParam || 
           (c.cameraId && c.cameraId.toLowerCase() === idParam) || 
           (c.identifier && c.identifier.toLowerCase() === idParam)
  );

  if (!camera) {
    res.status(404).json({ success: false, error: 'Camera not found' });
    return;
  }

  if (camera.isDecommissioned) {
    res.status(400).json({ success: false, error: 'Cannot enable a decommissioned camera. Re-commissioning required.' });
    return;
  }

  camera.status = 'ONLINE';
  camera.updatedAt = new Date().toISOString();
  camera.lastHeartbeatAt = new Date().toISOString();

  dataStore.logCameraAudit(
    operator.callsign,
    'CAMERA_ENABLED',
    camera.cameraId,
    'SUCCESS',
    { previousStatus: camera.status },
    req.ip
  );

  dataStore.broadcastEvent({
    eventId: `evt-${Date.now()}`,
    eventType: 'camera.status_change',
    timestamp: new Date().toISOString(),
    source: camera.cameraId,
    payload: { cameraId: camera.id, status: 'ONLINE' },
  });

  logger.info(`Camera ${camera.cameraId} enabled by ${operator.callsign}`);
  res.json({ success: true, camera });
});

// POST /api/v1/cameras/:id/disable
camerasRouter.post('/:id/disable', (req: Request, res: Response) => {
  const operator = getOperatorContext(req);

  // RBAC Enforcement
  if (!hasCameraPermission(operator.role, 'camera.disable')) {
    res.status(403).json({ success: false, error: 'Forbidden: Insufficient permissions to disable camera (requires camera.disable)' });
    return;
  }

  const idParam = req.params.id.trim().toLowerCase();
  const camera = dataStore.cameras.find(
    (c) => c.id.toLowerCase() === idParam || 
           (c.cameraId && c.cameraId.toLowerCase() === idParam) || 
           (c.identifier && c.identifier.toLowerCase() === idParam)
  );

  if (!camera) {
    res.status(404).json({ success: false, error: 'Camera not found' });
    return;
  }

  camera.status = 'OFFLINE';
  camera.updatedAt = new Date().toISOString();
  const reason = req.body?.reason || 'Disabled by operator';
  camera.statusDetail = reason;

  dataStore.logCameraAudit(
    operator.callsign,
    'CAMERA_DISABLED',
    camera.cameraId,
    'SUCCESS',
    { reason },
    req.ip
  );

  dataStore.broadcastEvent({
    eventId: `evt-${Date.now()}`,
    eventType: 'camera.status_change',
    timestamp: new Date().toISOString(),
    source: camera.cameraId,
    payload: { cameraId: camera.id, status: 'OFFLINE', reason },
  });

  logger.info(`Camera ${camera.cameraId} disabled by ${operator.callsign}`);
  res.json({ success: true, camera });
});

// POST /api/v1/cameras/:id/decommission (Safe Decommissioning)
camerasRouter.post('/:id/decommission', (req: Request, res: Response) => {
  const operator = getOperatorContext(req);

  // RBAC Enforcement: Strict Administrator role required
  if (!hasCameraPermission(operator.role, 'camera.decommission')) {
    dataStore.logCameraAudit(
      operator.callsign,
      'CAMERA_DECOMMISSION_ATTEMPT',
      req.params.id,
      'FAILURE',
      { reason: 'Unauthorized: requires ADMINISTRATOR role', role: operator.role },
      req.ip
    );
    res.status(403).json({
      success: false,
      error: 'Forbidden: Decommissioning cameras is a restricted lifecycle operation requiring ADMINISTRATOR role.',
    });
    return;
  }

  const idParam = req.params.id.trim().toLowerCase();
  const camera = dataStore.cameras.find(
    (c) => c.id.toLowerCase() === idParam || 
           (c.cameraId && c.cameraId.toLowerCase() === idParam) || 
           (c.identifier && c.identifier.toLowerCase() === idParam)
  );

  if (!camera) {
    res.status(404).json({ success: false, error: 'Camera not found' });
    return;
  }

  if (camera.isDecommissioned) {
    res.status(400).json({ success: false, error: 'Camera is already decommissioned.' });
    return;
  }

  const reason = req.body?.reason ? String(req.body.reason).trim() : 'Decommissioned by administrator';

  // Safe Decommission: Preserves historical records & references, marks status OFFLINE and isDecommissioned
  camera.isDecommissioned = true;
  camera.decommissionedAt = new Date().toISOString();
  camera.decommissionReason = reason;
  camera.status = 'OFFLINE';
  camera.statusDetail = `Decommissioned: ${reason}`;
  camera.updatedAt = new Date().toISOString();

  dataStore.logCameraAudit(
    operator.callsign,
    'CAMERA_DECOMMISSIONED',
    camera.cameraId,
    'SUCCESS',
    { reason, decommissionedAt: camera.decommissionedAt },
    req.ip
  );

  dataStore.broadcastEvent({
    eventId: `evt-${Date.now()}`,
    eventType: 'camera.decommissioned',
    timestamp: new Date().toISOString(),
    source: camera.cameraId,
    payload: { camera, reason },
  });

  logger.warn(`Camera ${camera.cameraId} decommissioned by ${operator.callsign}. Reason: ${reason}`);
  res.json({ success: true, camera });
});

// POST /api/v1/cameras/:id/test-connection (Live Video Gateway Stream Diagnostics)
camerasRouter.post('/:id/test-connection', async (req: Request, res: Response) => {
  const operator = getOperatorContext(req);
  if (!dataStore.hasPermission(operator.role, 'camera.stream.test') && !dataStore.hasPermission(operator.role, 'camera.view')) {
    res.status(403).json({
      success: false,
      status: 'UNAVAILABLE',
      message: 'Access denied: missing camera.stream.test permission',
    });
    return;
  }

  const camera = dataStore.cameras.find((c) => c.id === req.params.id || c.cameraId === req.params.id);
  if (!camera) {
    res.status(404).json({
      success: false,
      status: 'INVALID_CONFIGURATION',
      message: 'Camera not found in registry',
    });
    return;
  }

  try {
    const result = await videoGateway.testConnection(camera.id, req.body);
    dataStore.logCameraAudit(
      operator.callsign,
      'CAMERA_STREAM_TEST',
      camera.cameraId,
      result.success ? 'SUCCESS' : 'FAILURE',
      { status: result.status, message: result.message },
      req.ip
    );
    res.json(result);
  } catch (err: any) {
    res.status(500).json({
      success: false,
      status: 'CONNECTION_FAILED',
      message: 'Stream diagnostic failure',
      detail: err.message,
    });
  }
});

// PATCH /api/v1/cameras/:id/status (Legacy status toggle for backward compatibility)
camerasRouter.patch('/:id/status', (req: Request, res: Response) => {
  const { status, reason, operatorCallsign } = req.body;
  const camera = dataStore.cameras.find((c) => c.id === req.params.id || c.cameraId === req.params.id);
  if (!camera) {
    res.status(404).json({ success: false, error: 'Camera not found' });
    return;
  }

  const oldStatus = camera.status;
  camera.status = status as CameraStatus;
  camera.lastHeartbeatAt = new Date().toISOString();
  camera.updatedAt = new Date().toISOString();
  if (reason) camera.statusDetail = reason;

  dataStore.logCameraAudit(
    operatorCallsign || 'OPERATOR',
    'CAMERA_STATUS_UPDATE',
    camera.cameraId,
    'SUCCESS',
    { oldStatus, newStatus: status, reason },
    req.ip
  );

  dataStore.broadcastEvent({
    eventId: `evt-${Date.now()}`,
    eventType: 'camera.status_change',
    timestamp: new Date().toISOString(),
    source: camera.cameraId,
    payload: { cameraId: camera.id, identifier: camera.cameraId, status, reason },
  });

  logger.info(`Camera ${camera.cameraId} status changed from ${oldStatus} to ${status}`);
  res.json({ success: true, camera });
});

// POST /api/v1/cameras/:id/ptz/preset
camerasRouter.post('/:id/ptz/preset', (req: Request, res: Response) => {
  const { presetName, operatorCallsign } = req.body;
  const camera = dataStore.cameras.find((c) => c.id === req.params.id || c.cameraId === req.params.id);
  if (!camera) {
    res.status(404).json({ success: false, error: 'Camera not found' });
    return;
  }
  if (!camera.isPtSupported) {
    res.status(400).json({ success: false, error: 'PTZ operations not supported by this camera model' });
    return;
  }

  dataStore.logCameraAudit(
    operatorCallsign || 'OPERATOR',
    'CAMERA_PTZ_COMMAND',
    camera.cameraId,
    'SUCCESS',
    { presetName },
    req.ip
  );

  res.json({
    success: true,
    message: `PTZ slewed to preset: ${presetName}`,
    targetCamera: camera.cameraId,
  });
});

// GET /api/v1/cameras/:id/zones
camerasRouter.get('/:id/zones', (req: Request, res: Response) => {
  const idParam = req.params.id.trim().toLowerCase();
  const camera = dataStore.cameras.find(
    (c) =>
      c.id.toLowerCase() === idParam ||
      (c.cameraId && c.cameraId.toLowerCase() === idParam) ||
      (c.identifier && c.identifier.toLowerCase() === idParam)
  );

  if (!camera) {
    res.status(404).json({ success: false, error: 'Camera not found' });
    return;
  }

  const zones = dataStore.getSpatialZones({ cameraId: camera.cameraId });
  res.json({
    success: true,
    cameraId: camera.cameraId,
    total: zones.length,
    zones,
  });
});

