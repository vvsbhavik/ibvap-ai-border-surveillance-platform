// ============================================================================
// IBVAP In-Memory Repository & Data-Access Store
// High-performance operational state storage with strict simulation labeling
// ============================================================================

import crypto from 'crypto';
import { credentialVault } from '../video-gateway/credential-vault';
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
  RealtimeEventEnvelope,
  CameraPermission,
  UserRole,
  PermissionKey,
  RoleDefinition,
  Session,
  SpatialZone,
  SpatialEvent,
} from './types';
import {
  ALL_PERMISSIONS,
  DEFAULT_ROLE_DEFINITIONS,
  INITIAL_ROLE_PERMISSIONS,
  canonicalRole,
} from '../utils/permissions';

class DataStore {
  users: User[] = [
    {
      id: 'usr-000',
      callsign: 'COMMANDER-1',
      email: 'commander1@ibvap.gov',
      fullName: 'Commander John Vance',
      role: 'WATCH_COMMANDER',
      badgeNumber: 'BC-9901-WC',
      status: 'ACTIVE',
      lastLoginAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      createdAt: '2026-01-10T08:00:00.000Z',
      isSimulated: true,
    },
    {
      id: 'usr-001',
      callsign: 'SENTINEL-LEAD',
      email: 'commander@ibvap.gov',
      fullName: 'Elena Vance',
      role: 'WATCH_COMMANDER',
      badgeNumber: 'BC-9904-WC',
      status: 'ACTIVE',
      lastLoginAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      createdAt: '2026-01-15T08:00:00.000Z',
      isSimulated: true,
    },
    {
      id: 'usr-01',
      callsign: 'OPERATOR-01',
      email: 'operator01@ibvap.gov',
      fullName: 'Operator Alpha',
      role: 'SURVEILLANCE_OPERATOR',
      badgeNumber: 'BC-4401-SO',
      sectorAssignmentId: 'sec-bravo',
      status: 'ACTIVE',
      lastLoginAt: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
      createdAt: '2026-01-25T08:00:00.000Z',
      isSimulated: true,
    },
    {
      id: 'usr-002',
      callsign: 'WATCH-OP-01',
      email: 'operator1@ibvap.gov',
      fullName: 'David Chen',
      role: 'SURVEILLANCE_OPERATOR',
      badgeNumber: 'BC-4412-SO',
      sectorAssignmentId: 'sec-bravo',
      status: 'ACTIVE',
      lastLoginAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
      createdAt: '2026-02-01T08:00:00.000Z',
      isSimulated: true,
    },
    {
      id: 'usr-003',
      callsign: 'INVESTIGATOR-01',
      email: 'investigator@ibvap.gov',
      fullName: 'Marcus Holloway',
      role: 'EVIDENCE_INVESTIGATOR',
      badgeNumber: 'BC-1102-EI',
      status: 'ACTIVE',
      lastLoginAt: new Date(Date.now() - 120 * 60 * 1000).toISOString(),
      createdAt: '2026-02-10T08:00:00.000Z',
      isSimulated: true,
    },
    {
      id: 'usr-004',
      callsign: 'SYS-ADMIN',
      email: 'admin@ibvap.gov',
      fullName: 'Sarah Connor',
      role: 'SYSTEM_ADMINISTRATOR',
      badgeNumber: 'BC-0001-SA',
      status: 'ACTIVE',
      lastLoginAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      createdAt: '2026-01-01T08:00:00.000Z',
      isSimulated: true,
    },
    {
      id: 'usr-005',
      callsign: 'TECH-OP-01',
      email: 'techops@ibvap.gov',
      fullName: 'Alex Miller',
      role: 'TECHNICAL_OPERATOR',
      badgeNumber: 'BC-7721-TO',
      status: 'ACTIVE',
      lastLoginAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      createdAt: '2026-02-15T08:00:00.000Z',
      isSimulated: true,
    },
    {
      id: 'usr-006',
      callsign: 'REVOKED-OP-09',
      email: 'revoked@ibvap.gov',
      fullName: 'Jordan Hayes',
      role: 'SURVEILLANCE_OPERATOR',
      badgeNumber: 'BC-8801-XX',
      status: 'DISABLED',
      lastLoginAt: new Date(Date.now() - 500 * 60 * 1000).toISOString(),
      createdAt: '2026-01-20T08:00:00.000Z',
      isSimulated: true,
    },
  ];

  sectors: Sector[] = [
    {
      id: 'sec-bravo',
      code: 'SEC-B',
      name: 'Sector Bravo — Northern Ridge',
      description: 'Mountain pass corridor covering checkpoints B1 through B6. High thermal contrast zone.',
      centerLatitude: 31.4285,
      centerLongitude: -109.9124,
      activeCamerasCount: 5,
      activeAlertsCount: 2,
    },
    {
      id: 'sec-delta',
      code: 'SEC-D',
      name: 'Sector Delta — River Confluence',
      description: 'Lowland marsh and river crossing corridor. Heavy night-time vegetation and thermal reflection.',
      centerLatitude: 31.3912,
      centerLongitude: -109.8451,
      activeCamerasCount: 4,
      activeAlertsCount: 1,
    },
    {
      id: 'sec-sierra',
      code: 'SEC-S',
      name: 'Sector Sierra — Desert Plain',
      description: 'Open desert scrub perimeter with radar-slaved long range PTZ towers.',
      centerLatitude: 31.3415,
      centerLongitude: -109.7890,
      activeCamerasCount: 3,
      activeAlertsCount: 0,
    },
  ];

  zones: Zone[] = [
    {
      id: 'zone-b1',
      sectorId: 'sec-bravo',
      sectorName: 'Sector Bravo',
      code: 'ZB-RESTRICTED-01',
      name: 'Primary Perimeter Buffer North',
      zoneType: 'RESTRICTED_BUFFER',
      sensitivityLevel: 'MAXIMUM',
      coordinates: [
        [31.4310, -109.9180],
        [31.4335, -109.9090],
        [31.4290, -109.9040],
        [31.4260, -109.9140],
      ],
    },
    {
      id: 'zone-b2',
      sectorId: 'sec-bravo',
      sectorName: 'Sector Bravo',
      code: 'ZB-VIRTUAL-FENCE-A',
      name: 'Ridge Virtual Boundary Line East',
      zoneType: 'VIRTUAL_FENCE',
      sensitivityLevel: 'HIGH',
      coordinates: [
        [31.4350, -109.9200],
        [31.4320, -109.8980],
      ],
    },
    {
      id: 'zone-d1',
      sectorId: 'sec-delta',
      sectorName: 'Sector Delta',
      code: 'ZD-RIVER-CORRIDOR',
      name: 'River Shallows Approach Corridor',
      zoneType: 'APPROACH_CORRIDOR',
      sensitivityLevel: 'HIGH',
      coordinates: [
        [31.3950, -109.8510],
        [31.3920, -109.8390],
        [31.3880, -109.8430],
      ],
    },
  ];

  // Camera-Scoped Spatial Zones & Virtual Fences
  spatialZones: SpatialZone[] = [
    {
      zoneId: 'zone-sp-cam01-buf',
      cameraId: 'CAM-01',
      cameraIdentifier: 'CAM-01',
      name: 'North Ridge Restricted Buffer',
      description: 'Primary restricted polygon zone covering high-altitude approach ridge.',
      type: 'RESTRICTED_AREA',
      geometry: 'POLYGON',
      coordinates: [
        { x: 0.22, y: 0.28 },
        { x: 0.78, y: 0.28 },
        { x: 0.85, y: 0.82 },
        { x: 0.15, y: 0.82 },
      ],
      active: true,
      color: '#ef4444',
      sectorId: 'sec-bravo',
      sectorName: 'Sector Bravo',
      createdBy: 'SYS-INIT',
      createdAt: '2026-02-01T00:00:00.000Z',
      updatedAt: '2026-02-01T00:00:00.000Z',
    },
    {
      zoneId: 'zone-sp-cam01-fnc',
      cameraId: 'CAM-01',
      cameraIdentifier: 'CAM-01',
      name: 'Perimeter Cutoff Virtual Fence',
      description: 'Directional virtual fence line along sector boundary line.',
      type: 'RESTRICTED_AREA',
      geometry: 'LINE',
      coordinates: [
        { x: 0.48, y: 0.20 },
        { x: 0.48, y: 0.88 },
      ],
      active: true,
      direction: 'LEFT_TO_RIGHT',
      color: '#f59e0b',
      sectorId: 'sec-bravo',
      sectorName: 'Sector Bravo',
      createdBy: 'SYS-INIT',
      createdAt: '2026-02-01T00:00:00.000Z',
      updatedAt: '2026-02-01T00:00:00.000Z',
    },
    {
      zoneId: 'zone-sp-cam02-fnc',
      cameraId: 'CAM-02',
      cameraIdentifier: 'CAM-02',
      name: 'East Ridge Pass Virtual Fence',
      description: 'Transverse boundary fence covering east ridge pass.',
      type: 'MONITORING_AREA',
      geometry: 'LINE',
      coordinates: [
        { x: 0.15, y: 0.68 },
        { x: 0.85, y: 0.68 },
      ],
      active: true,
      direction: 'BIDIRECTIONAL',
      color: '#38bdf8',
      sectorId: 'sec-bravo',
      sectorName: 'Sector Bravo',
      createdBy: 'SYS-INIT',
      createdAt: '2026-02-01T00:00:00.000Z',
      updatedAt: '2026-02-01T00:00:00.000Z',
    },
    {
      zoneId: 'zone-sp-cam02-choke',
      cameraId: 'CAM-02',
      cameraIdentifier: 'CAM-02',
      name: 'Passage Chokepoint Observation',
      description: 'Monitoring zone centered on narrow mountain pass.',
      type: 'OBSERVATION_AREA',
      geometry: 'POLYGON',
      coordinates: [
        { x: 0.30, y: 0.38 },
        { x: 0.70, y: 0.38 },
        { x: 0.70, y: 0.78 },
        { x: 0.30, y: 0.78 },
      ],
      active: true,
      color: '#10b981',
      sectorId: 'sec-bravo',
      sectorName: 'Sector Bravo',
      createdBy: 'SYS-INIT',
      createdAt: '2026-02-01T00:00:00.000Z',
      updatedAt: '2026-02-01T00:00:00.000Z',
    },
    {
      zoneId: 'zone-sp-cam05-river',
      cameraId: 'CAM-05',
      cameraIdentifier: 'CAM-05',
      name: 'River Shallows Virtual Tripwire',
      description: 'Critical river bank crossing tripwire.',
      type: 'RESTRICTED_AREA',
      geometry: 'LINE',
      coordinates: [
        { x: 0.10, y: 0.65 },
        { x: 0.90, y: 0.65 },
      ],
      active: true,
      direction: 'BIDIRECTIONAL',
      color: '#ef4444',
      sectorId: 'sec-delta',
      sectorName: 'Sector Delta',
      createdBy: 'SYS-INIT',
      createdAt: '2026-02-01T00:00:00.000Z',
      updatedAt: '2026-02-01T00:00:00.000Z',
    },
  ];

  // In-memory spatial events history
  spatialEvents: SpatialEvent[] = [];

  get events(): SpatialEvent[] {
    return this.spatialEvents;
  }

  set events(evts: SpatialEvent[]) {
    this.spatialEvents = evts;
  }

  cameras: Camera[] = [
    {
      id: 'cam-01',
      cameraId: 'CAM-01',
      identifier: 'CAM-01',
      name: 'North Ridge Tower Primary',
      sectorId: 'sec-bravo',
      sectorName: 'Sector Bravo',
      zoneId: 'zone-b1',
      zoneName: 'Primary Perimeter Buffer North',
      siteName: 'North Ridge Observation Mast B1',
      latitude: 31.4305,
      longitude: -109.9152,
      cameraType: 'DUAL_THERMAL_PTZ',
      resolution: '3840x2160 (4K)',
      fps: 30,
      protocol: 'RTSP',
      streamEndpointReference: 'cfg-ref://stream-gw/sec-bravo/cam-01/main',
      credentialSecretRef: 'sec-ref-vault-cam01',
      status: 'ONLINE',
      aiAnalyticsStatus: {
        personDetection: 'CONFIGURED',
        vehicleDetection: 'CONFIGURED',
        anpr: 'NOT_CONFIGURED',
        faceAnalytics: 'NOT_CONFIGURED',
        nightAnalytics: 'CONFIGURED',
        behaviorAnalytics: 'NOT_CONFIGURED',
      },
      installationDate: '2025-03-15T10:00:00.000Z',
      description: 'Primary long-range thermal and optical mast covering border ridge sector Bravo.',
      createdAt: '2025-03-15T10:00:00.000Z',
      updatedAt: new Date().toISOString(),
      isSimulated: true,
      streamConfigStatus: 'VALID',
      connectionStatus: 'CONNECTED',
      azimuthDegrees: 42.0,
      fieldOfViewDegrees: 85.0,
      currentFps: 30.0,
      currentLatencyMs: 38,
      codec: 'H.265 / HEVC',
      model: 'FLIR BorderGuard Dual Thermal-4K',
      firmwareVersion: 'v2.4.1-sec',
      aiPipelineEnabled: true,
      isPtSupported: true,
      lastHeartbeatAt: new Date().toISOString(),
      thumbnailUrl: 'https://images.unsplash.com/photo-1509228468518-180dd4864904?auto=format&fit=crop&w=640&q=80',
    },
    {
      id: 'cam-02',
      cameraId: 'CAM-02',
      identifier: 'CAM-02',
      name: 'Ridge Pass Overlook East',
      sectorId: 'sec-bravo',
      sectorName: 'Sector Bravo',
      zoneId: 'zone-b2',
      zoneName: 'Ridge Virtual Boundary Line East',
      siteName: 'East Ridge Pass Overlook Tower',
      latitude: 31.4328,
      longitude: -109.9085,
      cameraType: 'PTZ_OPTICAL',
      resolution: '2560x1440 (2K)',
      fps: 30,
      protocol: 'ONVIF',
      streamEndpointReference: 'cfg-ref://stream-gw/sec-bravo/cam-02/main',
      credentialSecretRef: 'sec-ref-vault-cam02',
      status: 'ONLINE',
      aiAnalyticsStatus: {
        personDetection: 'CONFIGURED',
        vehicleDetection: 'CONFIGURED',
        anpr: 'NOT_CONFIGURED',
        faceAnalytics: 'NOT_CONFIGURED',
        nightAnalytics: 'NOT_CONFIGURED',
        behaviorAnalytics: 'NOT_CONFIGURED',
      },
      installationDate: '2025-03-18T14:30:00.000Z',
      description: 'High-speed heavy duty PTZ unit covering East Ridge pass boundary line.',
      createdAt: '2025-03-18T14:30:00.000Z',
      updatedAt: new Date().toISOString(),
      isSimulated: true,
      streamConfigStatus: 'VALID',
      connectionStatus: 'CONNECTED',
      azimuthDegrees: 110.0,
      fieldOfViewDegrees: 90.0,
      currentFps: 29.8,
      currentLatencyMs: 44,
      codec: 'H.265',
      model: 'Axis Q6225-LE PTZ Heavy Duty',
      firmwareVersion: 'v11.8.42',
      aiPipelineEnabled: true,
      isPtSupported: true,
      lastHeartbeatAt: new Date().toISOString(),
      thumbnailUrl: 'https://images.unsplash.com/photo-1541888946425-d0fbb18086f6?auto=format&fit=crop&w=640&q=80',
    },
    {
      id: 'cam-03',
      cameraId: 'CAM-03',
      identifier: 'CAM-03',
      name: 'Canyon Funnel Thermal Camera',
      sectorId: 'sec-bravo',
      sectorName: 'Sector Bravo',
      zoneId: 'zone-b1',
      zoneName: 'Primary Perimeter Buffer North',
      siteName: 'Canyon Funnel Choke Post',
      latitude: 31.4271,
      longitude: -109.9198,
      cameraType: 'THERMAL_FIXED',
      resolution: '1920x1080 (FHD)',
      fps: 30,
      protocol: 'RTSP',
      streamEndpointReference: 'cfg-ref://stream-gw/sec-bravo/cam-03/ch0',
      credentialSecretRef: 'sec-ref-vault-cam03',
      status: 'ONLINE',
      aiAnalyticsStatus: {
        personDetection: 'CONFIGURED',
        vehicleDetection: 'NOT_CONFIGURED',
        anpr: 'NOT_CONFIGURED',
        faceAnalytics: 'NOT_CONFIGURED',
        nightAnalytics: 'CONFIGURED',
        behaviorAnalytics: 'NOT_CONFIGURED',
      },
      installationDate: '2025-04-02T11:15:00.000Z',
      description: 'Fixed high-contrast fusion thermal sensor positioned at natural funnel terrain choke point.',
      createdAt: '2025-04-02T11:15:00.000Z',
      updatedAt: new Date().toISOString(),
      isSimulated: true,
      streamConfigStatus: 'VALID',
      connectionStatus: 'CONNECTED',
      azimuthDegrees: 15.0,
      fieldOfViewDegrees: 60.0,
      currentFps: 30.0,
      currentLatencyMs: 32,
      codec: 'H.264 High',
      model: 'Bosch MIC IP Fusion 9000i',
      firmwareVersion: 'v7.62.001',
      aiPipelineEnabled: true,
      isPtSupported: false,
      lastHeartbeatAt: new Date().toISOString(),
      thumbnailUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=640&q=80',
    },
    {
      id: 'cam-04',
      cameraId: 'CAM-04',
      identifier: 'CAM-04',
      name: 'Ridge Line Crest Cam 04',
      sectorId: 'sec-bravo',
      sectorName: 'Sector Bravo',
      zoneId: 'zone-b2',
      zoneName: 'Ridge Virtual Boundary Line East',
      siteName: 'Crest Outpost Post 04',
      latitude: 31.4344,
      longitude: -109.9012,
      cameraType: 'DUAL_THERMAL_PTZ',
      resolution: '1920x1080 (FHD)',
      fps: 25,
      protocol: 'RTSP',
      streamEndpointReference: 'cfg-ref://stream-gw/sec-bravo/cam-04/main',
      credentialSecretRef: 'sec-ref-vault-cam04',
      status: 'INTEGRITY_ANOMALY',
      aiAnalyticsStatus: {
        personDetection: 'CONFIGURED',
        vehicleDetection: 'NOT_CONFIGURED',
        anpr: 'NOT_CONFIGURED',
        faceAnalytics: 'NOT_CONFIGURED',
        nightAnalytics: 'CONFIGURED',
        behaviorAnalytics: 'NOT_CONFIGURED',
      },
      installationDate: '2025-04-10T09:00:00.000Z',
      description: 'Ridge crest line surveillance unit experiencing partial optical obstruction.',
      createdAt: '2025-04-10T09:00:00.000Z',
      updatedAt: new Date().toISOString(),
      isSimulated: true,
      streamConfigStatus: 'INVALID',
      connectionStatus: 'CONNECTED',
      azimuthDegrees: 85.0,
      fieldOfViewDegrees: 75.0,
      currentFps: 18.2,
      currentLatencyMs: 142,
      codec: 'H.264',
      model: 'FLIR BorderGuard Dual Thermal-4K',
      firmwareVersion: 'v2.4.1-sec',
      aiPipelineEnabled: true,
      isPtSupported: true,
      lastHeartbeatAt: new Date(Date.now() - 40 * 1000).toISOString(),
      statusDetail: 'Lens occlusion anomaly detected: partial field obstruction (54% optical degradation)',
      thumbnailUrl: 'https://images.unsplash.com/photo-1508873696983-2df5293cb32f?auto=format&fit=crop&w=640&q=80',
    },
    {
      id: 'cam-05',
      cameraId: 'CAM-05',
      identifier: 'CAM-05',
      name: 'River Bank Confluence North',
      sectorId: 'sec-delta',
      sectorName: 'Sector Bravo',
      zoneId: 'zone-d1',
      zoneName: 'River Shallows Approach Corridor',
      siteName: 'River Confluence North Bank',
      latitude: 31.3934,
      longitude: -109.8472,
      cameraType: 'FIXED_OPTICAL',
      resolution: '3840x2160 (4K)',
      fps: 30,
      protocol: 'RTSP',
      streamEndpointReference: 'cfg-ref://stream-gw/sec-delta/cam-05/stream',
      credentialSecretRef: 'sec-ref-vault-cam05',
      status: 'ONLINE',
      aiAnalyticsStatus: {
        personDetection: 'CONFIGURED',
        vehicleDetection: 'CONFIGURED',
        anpr: 'NOT_CONFIGURED',
        faceAnalytics: 'NOT_CONFIGURED',
        nightAnalytics: 'NOT_CONFIGURED',
        behaviorAnalytics: 'NOT_CONFIGURED',
      },
      installationDate: '2025-04-15T13:00:00.000Z',
      description: 'Ultra 4K fixed surveillance covering northern bank of river crossing approach.',
      createdAt: '2025-04-15T13:00:00.000Z',
      updatedAt: new Date().toISOString(),
      isSimulated: true,
      streamConfigStatus: 'VALID',
      connectionStatus: 'CONNECTED',
      azimuthDegrees: 180.0,
      fieldOfViewDegrees: 105.0,
      currentFps: 30.0,
      currentLatencyMs: 41,
      codec: 'H.265',
      model: 'Hikvision DarkFighterX Ultra 4K',
      firmwareVersion: 'v5.7.1',
      aiPipelineEnabled: true,
      isPtSupported: false,
      lastHeartbeatAt: new Date().toISOString(),
      thumbnailUrl: 'https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=640&q=80',
    },
    {
      id: 'cam-06',
      cameraId: 'CAM-06',
      identifier: 'CAM-06',
      name: 'River Shallows South Mast',
      sectorId: 'sec-delta',
      sectorName: 'Sector Delta',
      zoneId: 'zone-d1',
      zoneName: 'River Shallows Approach Corridor',
      siteName: 'River Shallows South Mast Station',
      latitude: 31.3892,
      longitude: -109.8415,
      cameraType: 'PTZ_OPTICAL',
      resolution: '2560x1440 (2K)',
      fps: 30,
      protocol: 'ONVIF',
      streamEndpointReference: 'cfg-ref://stream-gw/sec-delta/cam-06/stream',
      credentialSecretRef: 'sec-ref-vault-cam06',
      status: 'ONLINE',
      aiAnalyticsStatus: {
        personDetection: 'CONFIGURED',
        vehicleDetection: 'CONFIGURED',
        anpr: 'NOT_CONFIGURED',
        faceAnalytics: 'NOT_CONFIGURED',
        nightAnalytics: 'NOT_CONFIGURED',
        behaviorAnalytics: 'NOT_CONFIGURED',
      },
      installationDate: '2025-04-20T16:00:00.000Z',
      description: 'Pan-tilt-zoom mast unit with integrated IR illuminator covering shallow river crossing.',
      createdAt: '2025-04-20T16:00:00.000Z',
      updatedAt: new Date().toISOString(),
      isSimulated: true,
      streamConfigStatus: 'VALID',
      connectionStatus: 'CONNECTED',
      azimuthDegrees: 220.0,
      fieldOfViewDegrees: 90.0,
      currentFps: 30.0,
      currentLatencyMs: 47,
      codec: 'H.265',
      model: 'Axis Q6225-LE PTZ Heavy Duty',
      firmwareVersion: 'v11.8.42',
      aiPipelineEnabled: true,
      isPtSupported: true,
      lastHeartbeatAt: new Date().toISOString(),
      thumbnailUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=640&q=80',
    },
    {
      id: 'cam-07',
      cameraId: 'CAM-07',
      identifier: 'CAM-07',
      name: 'Marsh Watch Tower Remote',
      sectorId: 'sec-delta',
      sectorName: 'Sector Delta',
      siteName: 'Delta Marsh Outpost Tower 7',
      latitude: 31.3850,
      longitude: -109.8390,
      cameraType: 'FIXED_OPTICAL',
      resolution: '1280x720 (HD)',
      fps: 15,
      protocol: 'RTSP',
      streamEndpointReference: 'cfg-ref://stream-gw/sec-delta/cam-07/eco',
      credentialSecretRef: 'sec-ref-vault-cam07',
      status: 'DEGRADED',
      aiAnalyticsStatus: {
        personDetection: 'NOT_CONFIGURED',
        vehicleDetection: 'NOT_CONFIGURED',
        anpr: 'NOT_CONFIGURED',
        faceAnalytics: 'NOT_CONFIGURED',
        nightAnalytics: 'NOT_CONFIGURED',
        behaviorAnalytics: 'NOT_CONFIGURED',
      },
      installationDate: '2025-05-01T08:30:00.000Z',
      description: 'Solar-powered remote wetland perimeter sensor operating in fallback eco-profile.',
      createdAt: '2025-05-01T08:30:00.000Z',
      updatedAt: new Date().toISOString(),
      isSimulated: true,
      streamConfigStatus: 'VALID',
      connectionStatus: 'CONNECTED',
      azimuthDegrees: 310.0,
      fieldOfViewDegrees: 80.0,
      currentFps: 14.5,
      currentLatencyMs: 185,
      codec: 'H.264 Baseline',
      model: 'Pelco Sarix Pro 3 Environmental',
      firmwareVersion: 'v3.2.14',
      aiPipelineEnabled: false,
      isPtSupported: false,
      lastHeartbeatAt: new Date(Date.now() - 15 * 1000).toISOString(),
      statusDetail: 'Solar battery reserve below 22%; switched to low-bandwidth 720p fallback mode',
      thumbnailUrl: 'https://images.unsplash.com/photo-1513836279014-a89f7a76ae86?auto=format&fit=crop&w=640&q=80',
    },
    {
      id: 'cam-08',
      cameraId: 'CAM-08',
      identifier: 'CAM-08',
      name: 'Desert Scrub Perimeter Gate',
      sectorId: 'sec-sierra',
      sectorName: 'Sector Sierra',
      siteName: 'Sierra Perimeter Gate Alpha',
      latitude: 31.3440,
      longitude: -109.7925,
      cameraType: 'DUAL_THERMAL_PTZ',
      resolution: '3840x2160 (4K)',
      fps: 30,
      protocol: 'RTSP',
      streamEndpointReference: 'cfg-ref://stream-gw/sec-sierra/cam-08/main',
      credentialSecretRef: 'sec-ref-vault-cam08',
      status: 'ONLINE',
      aiAnalyticsStatus: {
        personDetection: 'CONFIGURED',
        vehicleDetection: 'CONFIGURED',
        anpr: 'NOT_CONFIGURED',
        faceAnalytics: 'NOT_CONFIGURED',
        nightAnalytics: 'CONFIGURED',
        behaviorAnalytics: 'NOT_CONFIGURED',
      },
      installationDate: '2025-05-12T11:00:00.000Z',
      description: 'Perimeter access road gate monitor with thermal intrusion trigger.',
      createdAt: '2025-05-12T11:00:00.000Z',
      updatedAt: new Date().toISOString(),
      isSimulated: true,
      streamConfigStatus: 'VALID',
      connectionStatus: 'CONNECTED',
      azimuthDegrees: 90.0,
      fieldOfViewDegrees: 70.0,
      currentFps: 30.0,
      currentLatencyMs: 36,
      codec: 'H.265',
      model: 'FLIR BorderGuard Dual Thermal-4K',
      firmwareVersion: 'v2.4.1-sec',
      aiPipelineEnabled: true,
      isPtSupported: true,
      lastHeartbeatAt: new Date().toISOString(),
      thumbnailUrl: 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&w=640&q=80',
    },
    {
      id: 'cam-09',
      cameraId: 'CAM-09',
      identifier: 'CAM-09',
      name: 'Desert Roadway ANPR Checkpoint S1',
      sectorId: 'sec-sierra',
      sectorName: 'Sector Sierra',
      siteName: 'Sector Sierra Checkpoint S1',
      latitude: 31.3395,
      longitude: -109.7840,
      cameraType: 'ANPR_SPECIALIZED',
      resolution: '1920x1080 (FHD)',
      fps: 60,
      protocol: 'ONVIF',
      streamEndpointReference: 'cfg-ref://stream-gw/sec-sierra/cam-09/anpr',
      credentialSecretRef: 'sec-ref-vault-cam09',
      status: 'ONLINE',
      aiAnalyticsStatus: {
        personDetection: 'NOT_CONFIGURED',
        vehicleDetection: 'CONFIGURED',
        anpr: 'ACTIVE',
        faceAnalytics: 'NOT_CONFIGURED',
        nightAnalytics: 'NOT_CONFIGURED',
        behaviorAnalytics: 'NOT_CONFIGURED',
      },
      installationDate: '2025-05-25T14:45:00.000Z',
      description: 'Dedicated high-shutter OCR optical capture unit with infrared retro-reflective illumination.',
      createdAt: '2025-05-25T14:45:00.000Z',
      updatedAt: new Date().toISOString(),
      isSimulated: true,
      streamConfigStatus: 'VALID',
      connectionStatus: 'CONNECTED',
      azimuthDegrees: 180.0,
      fieldOfViewDegrees: 45.0,
      currentFps: 60.0,
      currentLatencyMs: 25,
      codec: 'H.265',
      model: 'Tattile Vega 2HD ANPR Specialized',
      firmwareVersion: 'v4.1.0-anpr',
      aiPipelineEnabled: true,
      isPtSupported: false,
      lastHeartbeatAt: new Date().toISOString(),
      thumbnailUrl: 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=640&q=80',
    },
    {
      id: 'cam-10',
      cameraId: 'CAM-10',
      identifier: 'CAM-10',
      name: 'Perimeter Cutout South Outpost',
      sectorId: 'sec-sierra',
      sectorName: 'Sector Sierra',
      siteName: 'South Outpost Tower 10',
      latitude: 31.3360,
      longitude: -109.7801,
      cameraType: 'PTZ_OPTICAL',
      resolution: '2560x1440 (2K)',
      fps: 30,
      protocol: 'ONVIF',
      streamEndpointReference: 'cfg-ref://stream-gw/sec-sierra/cam-10/feed',
      credentialSecretRef: 'sec-ref-vault-cam10',
      status: 'ONLINE',
      aiAnalyticsStatus: {
        personDetection: 'CONFIGURED',
        vehicleDetection: 'CONFIGURED',
        anpr: 'NOT_CONFIGURED',
        faceAnalytics: 'NOT_CONFIGURED',
        nightAnalytics: 'NOT_CONFIGURED',
        behaviorAnalytics: 'NOT_CONFIGURED',
      },
      installationDate: '2025-06-02T10:30:00.000Z',
      description: 'Southern outpost wide-area scanning PTZ sensor.',
      createdAt: '2025-06-02T10:30:00.000Z',
      updatedAt: new Date().toISOString(),
      isSimulated: true,
      streamConfigStatus: 'VALID',
      connectionStatus: 'CONNECTED',
      azimuthDegrees: 240.0,
      fieldOfViewDegrees: 85.0,
      currentFps: 30.0,
      currentLatencyMs: 40,
      codec: 'H.265',
      model: 'Axis Q6225-LE PTZ Heavy Duty',
      firmwareVersion: 'v11.8.42',
      aiPipelineEnabled: true,
      isPtSupported: true,
      lastHeartbeatAt: new Date().toISOString(),
      thumbnailUrl: 'https://images.unsplash.com/photo-1473448912268-2022ce9509d8?auto=format&fit=crop&w=640&q=80',
    },
    {
      id: 'cam-11',
      cameraId: 'CAM-11',
      identifier: 'CAM-11',
      name: 'Ridge Auxiliary Relay Station',
      sectorId: 'sec-bravo',
      sectorName: 'Sector Bravo',
      siteName: 'Ridge Relay Substation B-Aux',
      latitude: 31.4210,
      longitude: -109.9230,
      cameraType: 'RADAR_SLAVED_PTZ',
      resolution: '1920x1080 (FHD)',
      fps: 30,
      protocol: 'RTSP',
      streamEndpointReference: 'cfg-ref://stream-gw/sec-bravo/cam-11/link',
      credentialSecretRef: 'sec-ref-vault-cam11',
      status: 'OFFLINE',
      aiAnalyticsStatus: {
        personDetection: 'NOT_CONFIGURED',
        vehicleDetection: 'NOT_CONFIGURED',
        anpr: 'NOT_CONFIGURED',
        faceAnalytics: 'NOT_CONFIGURED',
        nightAnalytics: 'NOT_CONFIGURED',
        behaviorAnalytics: 'NOT_CONFIGURED',
      },
      installationDate: '2025-06-15T15:00:00.000Z',
      description: 'Auxiliary radar-slaved optical station currently offline due to physical link loss.',
      createdAt: '2025-06-15T15:00:00.000Z',
      updatedAt: new Date().toISOString(),
      isSimulated: true,
      streamConfigStatus: 'INVALID',
      connectionStatus: 'DISCONNECTED',
      azimuthDegrees: 0.0,
      fieldOfViewDegrees: 90.0,
      currentFps: 0.0,
      currentLatencyMs: 0,
      codec: 'H.264',
      model: 'FLIR BorderGuard Dual Thermal-4K',
      firmwareVersion: 'v2.4.1-sec',
      aiPipelineEnabled: false,
      isPtSupported: true,
      lastHeartbeatAt: new Date(Date.now() - 3600 * 1000).toISOString(),
      statusDetail: 'No RTSP signal response since 22:18 UTC; switch port cycle scheduled',
      thumbnailUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=640&q=80',
    },
    {
      id: 'cam-12',
      cameraId: 'CAM-12',
      identifier: 'CAM-12',
      name: 'River Confluence Pumping Sump',
      sectorId: 'sec-delta',
      sectorName: 'Sector Delta',
      siteName: 'River Confluence Sump Station D-04',
      latitude: 31.3810,
      longitude: -109.8350,
      cameraType: 'THERMAL_FIXED',
      resolution: '1920x1080 (FHD)',
      fps: 30,
      protocol: 'RTSP',
      streamEndpointReference: 'cfg-ref://stream-gw/sec-delta/cam-12/main',
      credentialSecretRef: 'sec-ref-vault-cam12',
      status: 'MAINTENANCE',
      aiAnalyticsStatus: {
        personDetection: 'NOT_CONFIGURED',
        vehicleDetection: 'NOT_CONFIGURED',
        anpr: 'NOT_CONFIGURED',
        faceAnalytics: 'NOT_CONFIGURED',
        nightAnalytics: 'NOT_CONFIGURED',
        behaviorAnalytics: 'NOT_CONFIGURED',
      },
      installationDate: '2025-07-01T09:00:00.000Z',
      description: 'Industrial basin monitoring unit under scheduled maintenance.',
      createdAt: '2025-07-01T09:00:00.000Z',
      updatedAt: new Date().toISOString(),
      isSimulated: true,
      streamConfigStatus: 'UNVALIDATED',
      connectionStatus: 'UNCHECKED',
      azimuthDegrees: 45.0,
      fieldOfViewDegrees: 90.0,
      currentFps: 0.0,
      currentLatencyMs: 0,
      codec: 'H.264',
      model: 'Bosch MIC IP Fusion 9000i',
      firmwareVersion: 'v7.62.001',
      aiPipelineEnabled: false,
      isPtSupported: false,
      lastHeartbeatAt: new Date(Date.now() - 7200 * 1000).toISOString(),
      statusDetail: 'Scheduled firmware integrity patch and wiper blade replacement',
      thumbnailUrl: 'https://images.unsplash.com/photo-1541888946425-d0fbb18086f6?auto=format&fit=crop&w=640&q=80',
    },
  ];

  alerts: Alert[] = [
    {
      id: 'alt-101',
      title: 'Restricted-zone intrusion',
      description: 'Human figure tracked entering Restricted Buffer Zone B1 from unmonitored ravine.',
      severity: 'CRITICAL',
      status: 'PENDING_ACK',
      cameraId: 'cam-01',
      cameraIdentifier: 'CAM-01',
      sectorId: 'sec-bravo',
      sectorName: 'Sector Bravo',
      zoneId: 'zone-b1',
      zoneName: 'Primary Perimeter Buffer North',
      timestamp: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
      confidenceScore: 0.942,
      reasoningFactors: [
        { factor: 'Restricted zone polygon boundary breached', weight: 0.40, verified: true, detail: 'Crossed 15m inside prohibited perimeter zone' },
        { factor: 'Thermal signature classification: Bipedal Human', weight: 0.30, verified: true, detail: 'Estimated height 1.78m, movement velocity 1.4 m/s' },
        { factor: 'Nighttime low-visibility condition', weight: 0.20, verified: true, detail: 'Ambient illuminance 0.02 lux, thermal IR confirmed' },
        { factor: 'Cross-camera correlation with CAM-03', weight: 0.10, verified: true, detail: 'Vector heading 112 degrees toward Ridge Pass' },
      ],
      thumbnailUrl: 'https://images.unsplash.com/photo-1509228468518-180dd4864904?auto=format&fit=crop&w=400&q=80',
      isSimulation: true,
    },
    {
      id: 'alt-102',
      title: 'Camera integrity anomaly',
      description: 'Optical field obstruction detected; 54% lens surface covered by external matter.',
      severity: 'HIGH',
      status: 'PENDING_ACK',
      cameraId: 'cam-04',
      cameraIdentifier: 'CAM-04',
      sectorId: 'sec-bravo',
      sectorName: 'Sector Bravo',
      zoneId: 'zone-b2',
      zoneName: 'Ridge Virtual Boundary Line East',
      timestamp: new Date(Date.now() - 14 * 60 * 1000).toISOString(),
      confidenceScore: 0.985,
      reasoningFactors: [
        { factor: 'Structural edge map loss across quadrant 2 and 3', weight: 0.50, verified: true, detail: 'High-frequency gradient drop from baseline 82.4 to 11.2' },
        { factor: 'Optical tamper alert triggered by sensor DSP', weight: 0.35, verified: true, detail: 'Sudden luminance step decrease without scene transition' },
        { factor: 'Thermal auxiliary sensor unaffected', weight: 0.15, verified: true, detail: 'IR sensor continues to operate without obstruction' },
      ],
      thumbnailUrl: 'https://images.unsplash.com/photo-1508873696983-2df5293cb32f?auto=format&fit=crop&w=400&q=80',
      isSimulation: true,
    },
    {
      id: 'alt-103',
      title: 'Virtual fence boundary breach',
      description: 'Movement path intersected Virtual Boundary East line from east flank.',
      severity: 'HIGH',
      status: 'ACKNOWLEDGED',
      cameraId: 'cam-02',
      cameraIdentifier: 'CAM-02',
      sectorId: 'sec-bravo',
      sectorName: 'Sector Bravo',
      zoneId: 'zone-b2',
      zoneName: 'Ridge Virtual Boundary Line East',
      timestamp: new Date(Date.now() - 32 * 60 * 1000).toISOString(),
      confidenceScore: 0.891,
      reasoningFactors: [
        { factor: 'Virtual line tripwire trigger', weight: 0.50, verified: true, detail: 'Trajectory crossed line segment within 1.2s' },
        { factor: 'Target tracked for > 45 continuous frames', weight: 0.30, verified: true, detail: 'Stable bounding box without track fragmentation' },
        { factor: 'Sector Bravo heightened alert tier', weight: 0.20, verified: true, detail: 'Automated elevation due to concurrent CAM-01 alert' },
      ],
      acknowledgedBy: 'SENTINEL-LEAD',
      acknowledgedAt: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
      thumbnailUrl: 'https://images.unsplash.com/photo-1541888946425-d0fbb18086f6?auto=format&fit=crop&w=400&q=80',
      isSimulation: true,
    },
    {
      id: 'alt-104',
      title: 'Watchlist vehicle plate match',
      description: 'ANPR plate hit: AZ-982-FX matched Category A Alert (Stolen Border Utility).',
      severity: 'HIGH',
      status: 'ESCALATED',
      cameraId: 'cam-09',
      cameraIdentifier: 'CAM-09',
      sectorId: 'sec-sierra',
      sectorName: 'Sector Sierra',
      timestamp: new Date(Date.now() - 55 * 60 * 1000).toISOString(),
      confidenceScore: 0.967,
      escalatedToIncidentId: 'inc-2026-0814',
      reasoningFactors: [
        { factor: 'Exact OCR match on primary jurisdiction registry', weight: 0.60, verified: true, detail: 'Plate AZ-982-FX verified against FBI/NCIC border hotlist' },
        { factor: 'Vehicle class match: Utility 4x4 Heavy', weight: 0.25, verified: true, detail: 'Model silhouette matches Ford F-250 SuperDuty' },
        { factor: 'Checkpoint approach velocity anomaly', weight: 0.15, verified: true, detail: 'Approaching at 78 km/h in 35 km/h advisory lane' },
      ],
      thumbnailUrl: 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=400&q=80',
      isSimulation: true,
    },
    {
      id: 'alt-105',
      title: 'River corridor loitering pattern',
      description: 'Unidentified low-speed craft stationary near south bank for > 180 seconds.',
      severity: 'MEDIUM',
      status: 'ACKNOWLEDGED',
      cameraId: 'cam-05',
      cameraIdentifier: 'CAM-05',
      sectorId: 'sec-delta',
      sectorName: 'Sector Delta',
      zoneId: 'zone-d1',
      zoneName: 'River Shallows Approach Corridor',
      timestamp: new Date(Date.now() - 85 * 60 * 1000).toISOString(),
      confidenceScore: 0.824,
      reasoningFactors: [
        { factor: 'Stationary dwell time threshold exceeded', weight: 0.50, verified: true, detail: 'Object remained in restricted channel polygon for 210s' },
        { factor: 'Water surface wake analysis', weight: 0.30, verified: true, detail: 'Vessel engine idle with low thermal plume signature' },
        { factor: 'Distance to international marker line: 42 meters', weight: 0.20, verified: true, detail: 'Proximity alert generated' },
      ],
      acknowledgedBy: 'WATCH-OP-01',
      acknowledgedAt: new Date(Date.now() - 70 * 60 * 1000).toISOString(),
      thumbnailUrl: 'https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=400&q=80',
      isSimulation: true,
    },
  ];

  incidents: Incident[] = [
    {
      id: 'inc-2026-0814',
      incidentNumber: 'INC-2026-0814',
      title: 'Restricted-zone intrusion Sector Bravo — Buffer Fence 04',
      summary: 'Multi-sensor alert sequence confirmed human movement across perimeter boundary. Field response patrol dispatched.',
      severity: 'CRITICAL',
      status: 'INVESTIGATING',
      sectorId: 'sec-bravo',
      sectorName: 'Sector Bravo',
      primaryCameraId: 'cam-01',
      primaryCameraIdentifier: 'CAM-01',
      leadCommanderCallsign: 'SENTINEL-LEAD',
      createdAt: new Date(Date.now() - 22 * 60 * 1000).toISOString(),
      relatedCameraIdentifiers: ['CAM-01', 'CAM-02', 'CAM-03'],
      evidenceCount: 3,
      containmentNotes: 'Ground patrol Unit-4 en route. ETA 4 mins. Thermal tracking maintained by CAM-01 and CAM-03.',
      timeline: [
        {
          id: 'tl-1',
          timestamp: new Date(Date.now() - 22 * 60 * 1000).toISOString(),
          actorCallsign: 'SYSTEM_AI',
          actionType: 'TRIGGER_ALARM',
          description: 'Automated alert ALT-101 promoted to formal incident based on multi-zone correlation.',
        },
        {
          id: 'tl-2',
          timestamp: new Date(Date.now() - 19 * 60 * 1000).toISOString(),
          actorCallsign: 'SENTINEL-LEAD',
          actionType: 'OPERATOR_ACK',
          description: 'Watch Commander acknowledged event, designated priority Level 1.',
        },
        {
          id: 'tl-3',
          timestamp: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
          actorCallsign: 'SENTINEL-LEAD',
          actionType: 'COMMANDER_DISPATCH',
          description: 'Dispatched Sector Bravo Rapid Response Unit 4 (callsign VANGUARD-4).',
        },
        {
          id: 'tl-4',
          timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
          actorCallsign: 'ANALYST-02',
          actionType: 'EVIDENCE_LOCKED',
          description: 'Extracted 180s continuous H.265 clip from CAM-01 with SHA-256 verification hash.',
        },
      ],
    },
    {
      id: 'inc-2026-0810',
      incidentNumber: 'INC-2026-0810',
      title: 'Optical Tamper & Lens Occlusion Anomaly CAM-04',
      summary: 'Deliberate or natural occlusion of Ridge Crest optical sensor during high-wind period.',
      severity: 'HIGH',
      status: 'OPEN',
      sectorId: 'sec-bravo',
      sectorName: 'Sector Bravo',
      primaryCameraId: 'cam-04',
      primaryCameraIdentifier: 'CAM-04',
      leadCommanderCallsign: 'SENTINEL-LEAD',
      createdAt: new Date(Date.now() - 50 * 60 * 1000).toISOString(),
      relatedCameraIdentifiers: ['CAM-04', 'CAM-02'],
      evidenceCount: 1,
      containmentNotes: 'Physical maintenance inspection required to confirm whether debris or deliberate paint spray.',
      timeline: [
        {
          id: 'tl-20',
          timestamp: new Date(Date.now() - 50 * 60 * 1000).toISOString(),
          actorCallsign: 'SYSTEM_HEALTH',
          actionType: 'TRIGGER_ALARM',
          description: 'Integrity monitoring daemon detected abrupt edge loss of 54%.',
        },
        {
          id: 'tl-21',
          timestamp: new Date(Date.now() - 42 * 60 * 1000).toISOString(),
          actorCallsign: 'WATCH-OP-01',
          actionType: 'OPERATOR_ACK',
          description: 'Operator reviewed frame history; slaved CAM-02 to inspect CAM-04 mast.',
        },
      ],
    },
    {
      id: 'inc-2026-0808',
      incidentNumber: 'INC-2026-0808',
      title: 'Unauthorized Vehicle Approach Checkpoint Sierra',
      summary: 'Stolen vehicle matched against national watchlist intercepted at secondary security barrier.',
      severity: 'HIGH',
      status: 'CONTAINED',
      sectorId: 'sec-sierra',
      sectorName: 'Sector Sierra',
      primaryCameraId: 'cam-09',
      primaryCameraIdentifier: 'CAM-09',
      leadCommanderCallsign: 'SENTINEL-LEAD',
      createdAt: new Date(Date.now() - 140 * 60 * 1000).toISOString(),
      resolvedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      relatedCameraIdentifiers: ['CAM-09', 'CAM-10'],
      evidenceCount: 4,
      containmentNotes: 'Barrier deployed. Occupant detained by border security unit S-3 without resistance.',
      timeline: [
        {
          id: 'tl-30',
          timestamp: new Date(Date.now() - 140 * 60 * 1000).toISOString(),
          actorCallsign: 'ANPR_ENGINE',
          actionType: 'TRIGGER_ALARM',
          description: 'Plate AZ-982-FX flagged on primary capture line.',
        },
        {
          id: 'tl-31',
          timestamp: new Date(Date.now() - 138 * 60 * 1000).toISOString(),
          actorCallsign: 'WATCH-OP-01',
          actionType: 'ZONE_SEALED',
          description: 'Actuated hydraulic wedge barrier at Checkpoint S1 Lane 2.',
        },
        {
          id: 'tl-32',
          timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
          actorCallsign: 'SENTINEL-LEAD',
          actionType: 'STATUS_CHANGE',
          description: 'Target secured. Scene handed over to investigation bureau.',
        },
      ],
    },
  ];

  evidence: EvidenceItem[] = [
    {
      id: 'evi-801',
      incidentId: 'inc-2026-0814',
      incidentNumber: 'INC-2026-0814',
      cameraId: 'cam-01',
      cameraIdentifier: 'CAM-01',
      title: 'CAM-01 Intrusion Vector Clip 180s',
      mediaType: 'VIDEO_CLIP',
      fileSizeBytes: 48920114,
      sha256Checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      capturedStartAt: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
      capturedEndAt: new Date(Date.now() - 22 * 60 * 1000).toISOString(),
      isVerified: true,
      chainOfCustodyCount: 3,
      previewUrl: 'https://images.unsplash.com/photo-1509228468518-180dd4864904?auto=format&fit=crop&w=400&q=80',
    },
    {
      id: 'evi-802',
      incidentId: 'inc-2026-0814',
      incidentNumber: 'INC-2026-0814',
      cameraId: 'cam-03',
      cameraIdentifier: 'CAM-03',
      title: 'CAM-03 Thermal Confirmation Still',
      mediaType: 'HIGH_RES_STILL',
      fileSizeBytes: 4120980,
      sha256Checksum: 'a718b5b5ff4f932e6047a06411ab9c218206cd2df934f8152345098b1a80c921',
      capturedStartAt: new Date(Date.now() - 23 * 60 * 1000).toISOString(),
      capturedEndAt: new Date(Date.now() - 23 * 60 * 1000).toISOString(),
      isVerified: true,
      chainOfCustodyCount: 2,
      previewUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=400&q=80',
    },
    {
      id: 'evi-803',
      incidentId: 'inc-2026-0810',
      incidentNumber: 'INC-2026-0810',
      cameraId: 'cam-04',
      cameraIdentifier: 'CAM-04',
      title: 'CAM-04 Occlusion Onset Snapshot',
      mediaType: 'HIGH_RES_STILL',
      fileSizeBytes: 3980120,
      sha256Checksum: 'c5804364e7c3e5d0f5e1ef93e0b57e7545bf9487c69992f440fbcf9396e95b06',
      capturedStartAt: new Date(Date.now() - 52 * 60 * 1000).toISOString(),
      capturedEndAt: new Date(Date.now() - 52 * 60 * 1000).toISOString(),
      isVerified: true,
      chainOfCustodyCount: 1,
      previewUrl: 'https://images.unsplash.com/photo-1508873696983-2df5293cb32f?auto=format&fit=crop&w=400&q=80',
    },
    {
      id: 'evi-804',
      incidentId: 'inc-2026-0808',
      incidentNumber: 'INC-2026-0808',
      cameraId: 'cam-09',
      cameraIdentifier: 'CAM-09',
      title: 'CAM-09 High Speed ANPR Plate Crop AZ-982-FX',
      mediaType: 'ANPR_CROP',
      fileSizeBytes: 1845100,
      sha256Checksum: '7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069',
      capturedStartAt: new Date(Date.now() - 141 * 60 * 1000).toISOString(),
      capturedEndAt: new Date(Date.now() - 141 * 60 * 1000).toISOString(),
      isVerified: true,
      chainOfCustodyCount: 4,
      previewUrl: 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=400&q=80',
    },
  ];

  anprRecords: AnprRecord[] = [
    {
      id: 'anpr-01',
      cameraId: 'cam-09',
      cameraIdentifier: 'CAM-09',
      sectorName: 'Sector Sierra',
      plateNumber: 'AZ-982-FX',
      vehicleType: 'Utility Truck 4x4',
      vehicleColor: 'Matte Grey',
      confidence: 0.9842,
      speedKmh: 78.4,
      isWatchlistMatch: true,
      watchlistCategory: 'STOLEN_CROSSING_HOTLIST',
      timestamp: new Date(Date.now() - 55 * 60 * 1000).toISOString(),
      thumbnailUrl: 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=300&q=80',
      isSimulation: true,
    },
    {
      id: 'anpr-02',
      cameraId: 'cam-09',
      cameraIdentifier: 'CAM-09',
      sectorName: 'Sector Sierra',
      plateNumber: 'NM-441-BP',
      vehicleType: 'Commercial Semi Tanker',
      vehicleColor: 'White/Chrome',
      confidence: 0.9912,
      speedKmh: 28.1,
      isWatchlistMatch: false,
      timestamp: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
      thumbnailUrl: 'https://images.unsplash.com/photo-1519003722824-194d4455a60c?auto=format&fit=crop&w=300&q=80',
      isSimulation: true,
    },
    {
      id: 'anpr-03',
      cameraId: 'cam-09',
      cameraIdentifier: 'CAM-09',
      sectorName: 'Sector Sierra',
      plateNumber: 'TX-802-KL',
      vehicleType: 'Border Patrol Interceptor',
      vehicleColor: 'White / Green Stripe',
      confidence: 0.9985,
      speedKmh: 42.0,
      isWatchlistMatch: true,
      watchlistCategory: 'AUTHORIZED_OFFICIAL_FLEET',
      timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      thumbnailUrl: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=300&q=80',
      isSimulation: true,
    },
  ];

  watchlists: WatchlistEntry[] = [
    {
      id: 'wl-001',
      targetType: 'VEHICLE',
      targetIdentifier: 'AZ-982-FX',
      labelName: 'Stolen Ford F-250 SuperDuty',
      category: 'STOLEN_CROSSING_HOTLIST',
      priority: 'CRITICAL',
      notes: 'Associated with contraband transport ring. Issue immediate halt directive.',
      addedByCallsign: 'SENTINEL-LEAD',
      isActive: true,
      createdAt: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
    },
    {
      id: 'wl-002',
      targetType: 'VEHICLE',
      targetIdentifier: 'TX-802-KL',
      labelName: 'Sector Sierra Patrol Interceptor 04',
      category: 'AUTHORIZED_OFFICIAL_FLEET',
      priority: 'LOW',
      notes: 'Authorized quick-clear whitelist entry. Bypass secondary queue.',
      addedByCallsign: 'SYS-ADMIN',
      isActive: true,
      createdAt: new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString(),
    },
    {
      id: 'wl-003',
      targetType: 'PERSON',
      targetIdentifier: 'BIO-REF-89021',
      labelName: 'Suspect #89021 (Smuggling Ring Courier)',
      category: 'WARRANT_INTERCEPT',
      priority: 'HIGH',
      notes: 'Height approx 1.82m, right forearm tattoo. Flag for immediate border agent inspection.',
      addedByCallsign: 'FORENSIC-02',
      isActive: true,
      createdAt: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
    },
  ];

  systemHealth: SystemHealthItem[] = [
    {
      componentKey: 'CAMERAS',
      name: 'IP Camera Subsystem',
      status: 'DEGRADED',
      latencyMs: 42,
      uptimePercentage: 99.45,
      lastHeartbeat: new Date().toISOString(),
      details: '10 of 12 cameras active. CAM-04 optical anomaly; CAM-07 low power reserve; CAM-11 offline.',
      metrics: { cpuPercent: 34, memoryPercent: 48, activeConnections: 10, errorRatePerMin: 0.4 },
    },
    {
      componentKey: 'VIDEO_GATEWAY',
      name: 'RTSP/WebRTC Video Ingestion Gateway',
      status: 'HEALTHY',
      latencyMs: 18,
      uptimePercentage: 99.98,
      lastHeartbeat: new Date().toISOString(),
      details: '12 ingest pipelines allocated; H.265 HW transcoding operational on NVENC acceleration.',
      metrics: { cpuPercent: 28, memoryPercent: 62, activeConnections: 24, errorRatePerMin: 0.0 },
    },
    {
      componentKey: 'AI_SERVICES',
      name: 'Edge AI Inference Pipeline (TensorRT)',
      status: 'HEALTHY',
      latencyMs: 24,
      uptimePercentage: 99.95,
      lastHeartbeat: new Date().toISOString(),
      details: 'Object detection, virtual fence tripwire, and night thermal tracking models loaded.',
      metrics: { cpuPercent: 68, memoryPercent: 74, activeConnections: 10, errorRatePerMin: 0.05 },
    },
    {
      componentKey: 'DATABASE',
      name: 'PostgreSQL Core Database & Repositories',
      status: 'HEALTHY',
      latencyMs: 4,
      uptimePercentage: 100.0,
      lastHeartbeat: new Date().toISOString(),
      details: 'Connection pool 18/50 active. Read replicas synced; transaction logs verified.',
      metrics: { cpuPercent: 12, memoryPercent: 38, activeConnections: 18, errorRatePerMin: 0.0 },
    },
    {
      componentKey: 'REALTIME_SERVICES',
      name: 'Realtime Event Stream & WebSocket Bus',
      status: 'HEALTHY',
      latencyMs: 6,
      uptimePercentage: 99.99,
      lastHeartbeat: new Date().toISOString(),
      details: 'Event broadcasting active. Standard envelope dispatching at 14 ms average latency.',
      metrics: { cpuPercent: 8, memoryPercent: 22, activeConnections: 42, errorRatePerMin: 0.0 },
    },
    {
      componentKey: 'N8N',
      name: 'n8n Operational Automation Dispatcher',
      status: 'HEALTHY',
      latencyMs: 35,
      uptimePercentage: 99.92,
      lastHeartbeat: new Date().toISOString(),
      details: 'Automated dispatch workflows primed (radio paging, webhook triggers, evidence snapshot locking).',
      metrics: { cpuPercent: 15, memoryPercent: 41, activeConnections: 5, errorRatePerMin: 0.0 },
    },
    {
      componentKey: 'GEMINI',
      name: 'Gemini Command Copilot Engine',
      status: 'HEALTHY',
      latencyMs: 140,
      uptimePercentage: 99.88,
      lastHeartbeat: new Date().toISOString(),
      details: 'Natural language situation query parser and explainable AI reasoning layer active.',
      metrics: { cpuPercent: 5, memoryPercent: 18, activeConnections: 2, errorRatePerMin: 0.0 },
    },
    {
      componentKey: 'EDGE_NODES',
      name: 'Border Edge Compute Clustering',
      status: 'HEALTHY',
      latencyMs: 12,
      uptimePercentage: 99.85,
      lastHeartbeat: new Date().toISOString(),
      details: '3 Edge clusters (North Ridge, River Confluence, Desert Plain) running synchronized.',
      metrics: { cpuPercent: 42, memoryPercent: 55, activeConnections: 3, errorRatePerMin: 0.1 },
    },
    {
      componentKey: 'STORAGE',
      name: 'Evidence Video & Object Storage Vault',
      status: 'HEALTHY',
      latencyMs: 22,
      uptimePercentage: 100.0,
      lastHeartbeat: new Date().toISOString(),
      details: 'Storage volume: 4.8 TB of 40 TB utilized. Retention policy: 90 days secure retention.',
      metrics: { cpuPercent: 10, memoryPercent: 30, activeConnections: 8, errorRatePerMin: 0.0 },
    },
  ];

  auditLogs: AuditLog[] = [
    {
      id: 'aud-001',
      timestamp: new Date(Date.now() - 19 * 60 * 1000).toISOString(),
      userCallsign: 'SENTINEL-LEAD',
      userRole: 'WATCH_COMMANDER',
      action: 'ACKNOWLEDGE_ALERT',
      resourceType: 'ALERT',
      resourceId: 'alt-103',
      result: 'SUCCESS',
      ipAddress: '10.200.4.12',
      details: { sector: 'SEC-B', notes: 'Slaved CAM-02 PTZ to line boundary' },
      isSimulated: true,
    },
    {
      id: 'aud-002',
      timestamp: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      userCallsign: 'SENTINEL-LEAD',
      userRole: 'WATCH_COMMANDER',
      action: 'DISPATCH_INTERCEPTION_TEAM',
      resourceType: 'INCIDENT',
      resourceId: 'inc-2026-0814',
      result: 'SUCCESS',
      ipAddress: '10.200.4.12',
      details: { unit: 'VANGUARD-4', speed: 'PRIORITY_1' },
      isSimulated: true,
    },
    {
      id: 'aud-003',
      timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      userCallsign: 'INVESTIGATOR-01',
      userRole: 'EVIDENCE_INVESTIGATOR',
      action: 'EXPORT_EVIDENCE_PACKAGE',
      resourceType: 'EVIDENCE',
      resourceId: 'evi-801',
      result: 'SUCCESS',
      ipAddress: '10.200.4.88',
      details: { sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' },
      isSimulated: true,
    },
  ];

  // SSE Realtime Event Listeners
  realtimeClients: Set<(envelope: RealtimeEventEnvelope) => void> = new Set();

  // Private credential storage (hashed with salt, never exposed)
  private credentials: Map<string, { salt: string; hash: string }> = new Map();

  // Active Terminal Sessions
  sessions: Map<string, Session> = new Map();

  // Rate Limiting Map for Auth Endpoints
  private loginRateLimit: Map<string, { count: number; firstAttemptAt: number; lockedUntil?: number }> = new Map();

  // Configurable Role Definitions and Role-Permission Matrix
  roles: RoleDefinition[] = DEFAULT_ROLE_DEFINITIONS.map((r) => ({
    ...r,
    permissions: [...r.permissions],
  }));

  rolePermissions: Record<string, PermissionKey[]> = {
    SYSTEM_ADMINISTRATOR: [...INITIAL_ROLE_PERMISSIONS.SYSTEM_ADMINISTRATOR],
    WATCH_COMMANDER: [...INITIAL_ROLE_PERMISSIONS.WATCH_COMMANDER],
    SURVEILLANCE_OPERATOR: [...INITIAL_ROLE_PERMISSIONS.SURVEILLANCE_OPERATOR],
    EVIDENCE_INVESTIGATOR: [...INITIAL_ROLE_PERMISSIONS.EVIDENCE_INVESTIGATOR],
    TECHNICAL_OPERATOR: [...INITIAL_ROLE_PERMISSIONS.TECHNICAL_OPERATOR],
    // Backward compatibility aliases
    ADMINISTRATOR: [...INITIAL_ROLE_PERMISSIONS.SYSTEM_ADMINISTRATOR],
    FIELD_OPERATOR: [...INITIAL_ROLE_PERMISSIONS.SURVEILLANCE_OPERATOR],
    FORENSIC_ANALYST: [...INITIAL_ROLE_PERMISSIONS.EVIDENCE_INVESTIGATOR],
    SECURITY_AUDITOR: [...INITIAL_ROLE_PERMISSIONS.EVIDENCE_INVESTIGATOR],
  };

  constructor() {
    // Seed default password credentials for all initial users: 'IBVAP-Terminal-2026!'
    for (const u of this.users) {
      this.setPassword(u.id, 'IBVAP-Terminal-2026!');
    }
  }

  // ==========================================================================
  // Password Hashing & Verification
  // ==========================================================================

  private hashPassword(password: string, salt?: string): { salt: string; hash: string } {
    const actualSalt = salt || crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, actualSalt, 100000, 64, 'sha512').toString('hex');
    return { salt: actualSalt, hash };
  }

  setPassword(userId: string, plainText: string): void {
    const creds = this.hashPassword(plainText);
    this.credentials.set(userId, creds);
  }

  verifyPassword(userId: string, plainText: string): boolean {
    const stored = this.credentials.get(userId);
    if (!stored) return false;
    const { hash } = this.hashPassword(plainText, stored.salt);
    return crypto.timingSafeEqual(Buffer.from(stored.hash, 'hex'), Buffer.from(hash, 'hex'));
  }

  // ==========================================================================
  // Rate Limiting (5 failed attempts per 5 minutes -> 5 min lockout)
  // ==========================================================================

  checkLoginRateLimit(identifier: string): { allowed: boolean; retryAfterSeconds?: number } {
    const now = Date.now();
    const record = this.loginRateLimit.get(identifier);

    if (!record) {
      return { allowed: true };
    }

    if (record.lockedUntil && now < record.lockedUntil) {
      const remainingSeconds = Math.ceil((record.lockedUntil - now) / 1000);
      return { allowed: false, retryAfterSeconds: remainingSeconds };
    }

    // If window expired (5 min), reset
    if (now - record.firstAttemptAt > 5 * 60 * 1000) {
      this.loginRateLimit.delete(identifier);
      return { allowed: true };
    }

    if (record.count >= 5) {
      record.lockedUntil = now + 5 * 60 * 1000;
      return { allowed: false, retryAfterSeconds: 300 };
    }

    return { allowed: true };
  }

  recordFailedLogin(identifier: string): { locked: boolean; retryAfterSeconds?: number; attempts: number } {
    const now = Date.now();
    let record = this.loginRateLimit.get(identifier);

    if (!record || now - record.firstAttemptAt > 5 * 60 * 1000) {
      record = { count: 1, firstAttemptAt: now };
      this.loginRateLimit.set(identifier, record);
      return { locked: false, attempts: 1 };
    }

    record.count += 1;
    if (record.count >= 5) {
      record.lockedUntil = now + 5 * 60 * 1000;
      return { locked: true, retryAfterSeconds: 300, attempts: record.count };
    }

    return { locked: false, attempts: record.count };
  }

  resetLoginRateLimit(identifier: string): void {
    this.loginRateLimit.delete(identifier);
  }

  // ==========================================================================
  // Session Management (8 hours duration)
  // ==========================================================================

  createSession(user: User, ipAddress = '127.0.0.1', userAgent?: string): Session {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 8 * 60 * 60 * 1000); // 8 hours
    const token = `ibvap-session-${user.id}-${crypto.randomBytes(24).toString('hex')}`;

    const session: Session = {
      id: `ses-${crypto.randomBytes(8).toString('hex')}`,
      token,
      userId: user.id,
      userCallsign: user.callsign,
      userRole: canonicalRole(user.role),
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      lastActiveAt: now.toISOString(),
      ipAddress,
      userAgent,
      isSimulated: true,
    };

    this.sessions.set(token, session);
    return session;
  }

  getSession(token: string): Session | null {
    if (!token) return null;
    const session = this.sessions.get(token);
    if (!session) return null;

    // Check expiration
    if (new Date(session.expiresAt).getTime() < Date.now()) {
      this.sessions.delete(token);
      return null;
    }

    // Refresh last active timestamp
    session.lastActiveAt = new Date().toISOString();
    return session;
  }

  revokeSession(token: string): boolean {
    return this.sessions.delete(token);
  }

  destroySession(token: string): boolean {
    return this.revokeSession(token);
  }

  authenticateUser(
    callsign: string,
    plainText: string,
    ipAddress = '127.0.0.1',
    userAgent?: string
  ): {
    success: boolean;
    user?: User;
    session?: Session;
    token?: string;
    code?: string;
    message?: string;
  } {
    const norm = (callsign || '').trim().toUpperCase();
    const rateCheck = this.checkLoginRateLimit(norm);
    if (!rateCheck.allowed) {
      this.logAudit(
        norm,
        'AUTH_LOCKOUT_BLOCKED',
        'AUTH',
        norm,
        ipAddress,
        { reason: 'Rate limit exceeded' },
        'FAILURE'
      );
      return {
        success: false,
        code: 'RATE_LIMITED',
        message: `Account temporarily locked. Retry in ${rateCheck.retryAfterSeconds || 300} seconds.`,
      };
    }

    const user = this.users.find((u) => u.callsign.toUpperCase() === norm);
    if (!user) {
      this.recordFailedLogin(norm);
      this.logAudit(
        norm,
        'AUTH_LOGIN_FAILED',
        'AUTH',
        norm,
        ipAddress,
        { reason: 'User callsign not found' },
        'FAILURE'
      );
      return {
        success: false,
        code: 'USER_NOT_FOUND',
        message: `Operator callsign '${norm}' not found on terminal registry.`,
      };
    }

    if (user.status === 'DISABLED' || (user.status as string) === 'SUSPENDED') {
      this.logAudit(
        norm,
        'AUTH_LOGIN_REJECTED',
        'AUTH',
        user.id,
        ipAddress,
        { status: user.status, reason: 'Account disabled/suspended' },
        'DENIED',
        user.role
      );
      return {
        success: false,
        code: 'ACCOUNT_DISABLED',
        message: `Operator credentials for ${norm} are currently revoked (${user.status}). Contact Watch Commander.`,
      };
    }

    if (user.status === 'LOCKED') {
      return {
        success: false,
        code: 'ACCOUNT_LOCKED',
        message: `Operator credentials for ${norm} are locked due to administrative hold.`,
      };
    }

    const isValid = this.verifyPassword(user.id, plainText);
    if (!isValid) {
      const attempt = this.recordFailedLogin(norm);
      this.logAudit(
        norm,
        'AUTH_LOGIN_FAILED',
        'AUTH',
        user.id,
        ipAddress,
        { reason: 'Invalid secret password', attempts: attempt.attempts },
        'FAILURE',
        user.role
      );
      return {
        success: false,
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid terminal password.',
      };
    }

    this.resetLoginRateLimit(norm);
    user.lastLoginAt = new Date().toISOString();
    const session = this.createSession(user, ipAddress, userAgent);

    this.logAudit(
      user.callsign,
      'AUTH_LOGIN_SUCCESS',
      'SESSION',
      session.id,
      ipAddress,
      {
        role: user.role,
        sessionId: session.id,
      },
      'SUCCESS',
      user.role
    );

    return {
      success: true,
      user,
      session,
      token: session.token,
    };
  }

  // ==========================================================================
  // Role & Permissions
  // ==========================================================================

  hasPermission(role: string | undefined, permission: PermissionKey): boolean {
    if (!role) return false;
    const canonical = canonicalRole(role);
    if (canonical === 'SYSTEM_ADMINISTRATOR') return true;
    const perms = this.rolePermissions[canonical] || [];
    return perms.includes(permission);
  }

  getUserPermissions(user: User): PermissionKey[] {
    const canonical = canonicalRole(user.role);
    return this.rolePermissions[canonical] || [];
  }

  setRolePermissions(
    roleKey: UserRole,
    permissions: PermissionKey[],
    actorCallsign = 'SYSTEM',
    ipAddress = '127.0.0.1'
  ): RoleDefinition {
    return this.updateRolePermissions(roleKey, permissions, actorCallsign, ipAddress);
  }

  updateRolePermissions(
    roleKey: UserRole,
    permissions: PermissionKey[],
    actorCallsign = 'SYSTEM',
    ipAddress = '127.0.0.1'
  ): RoleDefinition {
    const canonical = canonicalRole(roleKey);
    const prevPerms = this.rolePermissions[canonical] || [];
    this.rolePermissions[canonical] = [...permissions];

    const roleDef = this.roles.find((r) => r.role === canonical);
    if (roleDef) {
      roleDef.permissions = [...permissions];
    }

    // Calculate diff for audit
    const added = permissions.filter((p) => !prevPerms.includes(p));
    const removed = prevPerms.filter((p) => !permissions.includes(p));

    this.logAudit(
      actorCallsign,
      'ROLE_PERMISSIONS_UPDATE',
      'ROLE',
      canonical,
      ipAddress,
      {
        role: canonical,
        addedCount: added.length,
        removedCount: removed.length,
        added,
        removed,
        totalPermissions: permissions.length,
      },
      'SUCCESS'
    );

    return roleDef || {
      id: `role-${canonical.toLowerCase()}`,
      role: canonical,
      name: canonical,
      description: '',
      permissions,
    };
  }

  // ==========================================================================
  // User Management
  // ==========================================================================

  createUser(
    data: {
      callsign: string;
      fullName: string;
      email: string;
      role: UserRole;
      badgeNumber?: string;
      sectorAssignmentId?: string;
      password?: string;
      status?: 'ACTIVE' | 'DISABLED' | 'LOCKED';
    },
    actorCallsign = 'SYSTEM',
    ipAddress = '127.0.0.1'
  ): User {
    const normCallsign = data.callsign.trim().toUpperCase();
    const normEmail = data.email.trim().toLowerCase();

    if (this.users.some((u) => u.callsign.toUpperCase() === normCallsign)) {
      throw new Error(`User callsign '${normCallsign}' is already registered.`);
    }

    if (this.users.some((u) => u.email.toLowerCase() === normEmail)) {
      throw new Error(`User email '${normEmail}' is already assigned.`);
    }

    const newUser: User = {
      id: `usr-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
      callsign: normCallsign,
      fullName: data.fullName.trim(),
      email: normEmail,
      role: canonicalRole(data.role),
      badgeNumber: data.badgeNumber?.trim() || `BC-${Math.floor(1000 + Math.random() * 9000)}-OP`,
      sectorAssignmentId: data.sectorAssignmentId,
      status: data.status || 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isSimulated: true,
    };

    this.users.push(newUser);

    // Set initial password
    const plain = data.password || 'IBVAP-Terminal-2026!';
    this.setPassword(newUser.id, plain);

    this.logAudit(
      actorCallsign,
      'USER_CREATE',
      'USER',
      newUser.id,
      ipAddress,
      {
        callsign: newUser.callsign,
        role: newUser.role,
        fullName: newUser.fullName,
        badgeNumber: newUser.badgeNumber,
      },
      'SUCCESS'
    );

    return newUser;
  }

  updateUser(
    id: string,
    data: Partial<User> & { password?: string },
    actorCallsign = 'SYSTEM',
    ipAddress = '127.0.0.1'
  ): User {
    const user = this.users.find((u) => u.id === id);
    if (!user) {
      throw new Error(`User ID '${id}' not found.`);
    }

    if (data.callsign && data.callsign.toUpperCase() !== user.callsign.toUpperCase()) {
      if (this.users.some((u) => u.id !== id && u.callsign.toUpperCase() === data.callsign!.toUpperCase())) {
        throw new Error(`User callsign '${data.callsign}' is already taken.`);
      }
      user.callsign = data.callsign.trim().toUpperCase();
    }

    if (data.email && data.email.toLowerCase() !== user.email.toLowerCase()) {
      if (this.users.some((u) => u.id !== id && u.email.toLowerCase() === data.email!.toLowerCase())) {
        throw new Error(`User email '${data.email}' is already taken.`);
      }
      user.email = data.email.trim().toLowerCase();
    }

    if (data.fullName) user.fullName = data.fullName.trim();
    if (data.role) user.role = canonicalRole(data.role);
    if (data.badgeNumber) user.badgeNumber = data.badgeNumber.trim();
    if (data.sectorAssignmentId !== undefined) user.sectorAssignmentId = data.sectorAssignmentId;
    if (data.status) user.status = data.status;
    user.updatedAt = new Date().toISOString();

    if (data.password) {
      this.setPassword(user.id, data.password);
    }

    this.logAudit(
      actorCallsign,
      'USER_UPDATE',
      'USER',
      user.id,
      ipAddress,
      {
        callsign: user.callsign,
        role: user.role,
        status: user.status,
      },
      'SUCCESS'
    );

    return user;
  }

  disableUser(id: string, reason?: string, actorCallsign = 'SYSTEM', ipAddress = '127.0.0.1'): User {
    const user = this.users.find((u) => u.id === id);
    if (!user) {
      throw new Error(`User ID '${id}' not found.`);
    }

    user.status = 'DISABLED';
    user.updatedAt = new Date().toISOString();

    // Revoke any active sessions for this user
    for (const [token, session] of this.sessions.entries()) {
      if (session.userId === user.id) {
        this.sessions.delete(token);
      }
    }

    this.logAudit(
      actorCallsign,
      'USER_DISABLE',
      'USER',
      user.id,
      ipAddress,
      {
        callsign: user.callsign,
        reason: reason || 'Administrative access revocation',
      },
      'SUCCESS'
    );

    return user;
  }

  enableUser(id: string, actorCallsign = 'SYSTEM', ipAddress = '127.0.0.1'): User {
    const user = this.users.find((u) => u.id === id);
    if (!user) {
      throw new Error(`User ID '${id}' not found.`);
    }

    user.status = 'ACTIVE';
    user.updatedAt = new Date().toISOString();

    this.logAudit(
      actorCallsign,
      'USER_ENABLE',
      'USER',
      user.id,
      ipAddress,
      {
        callsign: user.callsign,
      },
      'SUCCESS'
    );

    return user;
  }

  // ==========================================================================
  // Audit Logging
  // ==========================================================================

  broadcastEvent(envelope: RealtimeEventEnvelope) {
    for (const send of this.realtimeClients) {
      try {
        send(envelope);
      } catch {
        this.realtimeClients.delete(send);
      }
    }
  }

  logAudit(
    userCallsign: string,
    action: string,
    resourceType: string,
    resourceId: string,
    ipAddress = '127.0.0.1',
    details: Record<string, unknown> = {},
    result: 'SUCCESS' | 'FAILURE' | 'DENIED' = 'SUCCESS',
    userRole?: string
  ) {
    // Sanitization: strictly ensure no passwords, secrets, hashes, or auth tokens are logged
    const sanitizedDetails: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(details)) {
      if (/password|token|secret|hash|salt|key/i.test(k)) {
        sanitizedDetails[k] = '[REDACTED]';
      } else {
        sanitizedDetails[k] = v;
      }
    }

    const entry: AuditLog = {
      id: `aud-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      userCallsign,
      operatorCallsign: userCallsign,
      userRole,
      action,
      resourceType,
      resourceId,
      result,
      ipAddress,
      details: sanitizedDetails,
      isSimulated: true,
    };

    this.auditLogs.unshift(entry);
    if (this.auditLogs.length > 500) this.auditLogs.pop();
  }

  getAuditLogs(filter?: {
    operatorCallsign?: string;
    userCallsign?: string;
    action?: string;
    resourceType?: string;
    resourceId?: string;
    result?: string;
    limit?: number;
  }): AuditLog[] {
    let logs = [...this.auditLogs];
    if (filter?.operatorCallsign) {
      const op = filter.operatorCallsign.toLowerCase();
      logs = logs.filter(
        (l) =>
          l.userCallsign.toLowerCase() === op ||
          (l.operatorCallsign && l.operatorCallsign.toLowerCase() === op)
      );
    }
    if (filter?.userCallsign) {
      const u = filter.userCallsign.toLowerCase();
      logs = logs.filter(
        (l) =>
          l.userCallsign.toLowerCase() === u ||
          (l.operatorCallsign && l.operatorCallsign.toLowerCase() === u)
      );
    }
    if (filter?.action) {
      const act = filter.action.toLowerCase();
      logs = logs.filter((l) => l.action.toLowerCase() === act);
    }
    if (filter?.resourceType) {
      const rt = filter.resourceType.toLowerCase();
      logs = logs.filter((l) => l.resourceType.toLowerCase() === rt);
    }
    if (filter?.resourceId) {
      logs = logs.filter((l) => l.resourceId === filter.resourceId);
    }
    if (filter?.result) {
      logs = logs.filter((l) => l.result === filter.result);
    }
    if (filter?.limit && filter.limit > 0) {
      logs = logs.slice(0, filter.limit);
    }
    return logs;
  }

  logCameraAudit(
    actor: string,
    action: string,
    cameraId: string,
    result: 'SUCCESS' | 'FAILURE',
    details: Record<string, unknown> = {},
    ipAddress = '127.0.0.1'
  ) {
    this.logAudit(
      actor,
      action,
      'CAMERA',
      cameraId,
      ipAddress,
      {
        camera: cameraId,
        result,
        ...details,
      },
      result
    );
  }

  // ==========================================================================
  // Spatial Zone & Virtual Fence Management
  // ==========================================================================

  getSpatialZones(filter?: { cameraId?: string; active?: boolean; type?: string }): SpatialZone[] {
    let list = [...this.spatialZones];
    if (filter?.cameraId) {
      list = list.filter(
        (z) => z.cameraId === filter.cameraId || z.cameraIdentifier === filter.cameraId
      );
    }
    if (filter?.active !== undefined) {
      list = list.filter((z) => z.active === filter.active);
    }
    if (filter?.type) {
      list = list.filter((z) => z.type === filter.type);
    }
    return list;
  }

  getSpatialZoneById(zoneId: string): SpatialZone | undefined {
    return this.spatialZones.find((z) => z.zoneId === zoneId);
  }

  createSpatialZone(zoneData: Partial<SpatialZone>, actorCallsign = 'SYSTEM', ipAddress = '127.0.0.1'): SpatialZone {
    if (!zoneData.cameraId) {
      throw new Error('Camera ID is required to create a spatial zone.');
    }
    if (!zoneData.name || !zoneData.name.trim()) {
      throw new Error('Zone name is required.');
    }
    if (!zoneData.coordinates || zoneData.coordinates.length < 2) {
      throw new Error('Valid coordinates are required.');
    }

    const camera = this.cameras.find(
      (c) => c.id === zoneData.cameraId || c.cameraId === zoneData.cameraId || c.identifier === zoneData.cameraId
    );

    const newZone: SpatialZone = {
      zoneId: `zone-sp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      cameraId: camera?.cameraId || zoneData.cameraId,
      cameraIdentifier: camera?.identifier || zoneData.cameraIdentifier || zoneData.cameraId,
      name: zoneData.name.trim(),
      description: zoneData.description?.trim() || '',
      type: zoneData.type || 'MONITORING_AREA',
      geometry: zoneData.geometry || 'POLYGON',
      coordinates: zoneData.coordinates,
      active: zoneData.active !== undefined ? zoneData.active : true,
      direction: zoneData.direction || 'BIDIRECTIONAL',
      schedule: zoneData.schedule,
      color: zoneData.color || (zoneData.geometry === 'LINE' ? '#f59e0b' : '#38bdf8'),
      dwellWarningSeconds: zoneData.dwellWarningSeconds,
      maxDwellSeconds: zoneData.maxDwellSeconds,
      sectorId: camera?.sectorId,
      sectorName: camera?.sectorName,
      createdBy: actorCallsign,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.spatialZones.push(newZone);

    this.logAudit(
      actorCallsign,
      'ZONE_CREATE',
      'ZONE',
      newZone.zoneId,
      ipAddress,
      {
        zoneName: newZone.name,
        cameraId: newZone.cameraId,
        geometry: newZone.geometry,
        type: newZone.type,
      },
      'SUCCESS'
    );

    return newZone;
  }

  updateSpatialZone(
    zoneId: string,
    updates: Partial<SpatialZone>,
    actorCallsign = 'SYSTEM',
    ipAddress = '127.0.0.1'
  ): SpatialZone {
    const zone = this.spatialZones.find((z) => z.zoneId === zoneId);
    if (!zone) {
      throw new Error(`Spatial zone '${zoneId}' not found.`);
    }

    if (updates.name !== undefined) zone.name = updates.name.trim();
    if (updates.description !== undefined) zone.description = updates.description.trim();
    if (updates.type !== undefined) zone.type = updates.type;
    if (updates.geometry !== undefined) zone.geometry = updates.geometry;
    if (updates.coordinates !== undefined) zone.coordinates = updates.coordinates;
    if (updates.active !== undefined) zone.active = updates.active;
    if (updates.direction !== undefined) zone.direction = updates.direction;
    if (updates.schedule !== undefined) zone.schedule = updates.schedule;
    if (updates.color !== undefined) zone.color = updates.color;
    if (updates.dwellWarningSeconds !== undefined) zone.dwellWarningSeconds = updates.dwellWarningSeconds;
    if (updates.maxDwellSeconds !== undefined) zone.maxDwellSeconds = updates.maxDwellSeconds;
    zone.updatedAt = new Date().toISOString();

    this.logAudit(
      actorCallsign,
      'ZONE_UPDATE',
      'ZONE',
      zone.zoneId,
      ipAddress,
      {
        zoneName: zone.name,
        active: zone.active,
        updates: Object.keys(updates),
      },
      'SUCCESS'
    );

    return zone;
  }

  activateSpatialZone(zoneId: string, actorCallsign = 'SYSTEM', ipAddress = '127.0.0.1'): SpatialZone {
    const zone = this.spatialZones.find((z) => z.zoneId === zoneId);
    if (!zone) {
      throw new Error(`Spatial zone '${zoneId}' not found.`);
    }
    zone.active = true;
    zone.updatedAt = new Date().toISOString();

    this.logAudit(
      actorCallsign,
      'ZONE_ACTIVATE',
      'ZONE',
      zone.zoneId,
      ipAddress,
      { zoneName: zone.name, cameraId: zone.cameraId },
      'SUCCESS'
    );

    return zone;
  }

  deactivateSpatialZone(zoneId: string, actorCallsign = 'SYSTEM', ipAddress = '127.0.0.1'): SpatialZone {
    const zone = this.spatialZones.find((z) => z.zoneId === zoneId);
    if (!zone) {
      throw new Error(`Spatial zone '${zoneId}' not found.`);
    }
    zone.active = false;
    zone.updatedAt = new Date().toISOString();

    this.logAudit(
      actorCallsign,
      'ZONE_DEACTIVATE',
      'ZONE',
      zone.zoneId,
      ipAddress,
      { zoneName: zone.name, cameraId: zone.cameraId },
      'SUCCESS'
    );

    return zone;
  }

  deleteSpatialZone(zoneId: string, actorCallsign = 'SYSTEM', ipAddress = '127.0.0.1'): boolean {
    const idx = this.spatialZones.findIndex((z) => z.zoneId === zoneId);
    if (idx === -1) {
      throw new Error(`Spatial zone '${zoneId}' not found.`);
    }
    const [removed] = this.spatialZones.splice(idx, 1);

    this.logAudit(
      actorCallsign,
      'ZONE_DELETE',
      'ZONE',
      zoneId,
      ipAddress,
      { zoneName: removed.name, cameraId: removed.cameraId },
      'SUCCESS'
    );

    return true;
  }

  addSpatialEvent(event: SpatialEvent): void {
    this.spatialEvents.unshift(event);
    if (this.spatialEvents.length > 500) {
      this.spatialEvents.pop();
    }
  }

  getSpatialEvents(filter?: {
    cameraId?: string;
    zoneId?: string;
    eventType?: string;
    limit?: number;
  }): SpatialEvent[] {
    let list = [...this.spatialEvents];
    if (filter?.cameraId) {
      list = list.filter((e) => e.cameraId === filter.cameraId || e.cameraIdentifier === filter.cameraId);
    }
    if (filter?.zoneId) {
      list = list.filter((e) => e.zoneId === filter.zoneId);
    }
    if (filter?.eventType) {
      list = list.filter((e) => e.eventType === filter.eventType);
    }
    if (filter?.limit && filter.limit > 0) {
      list = list.slice(0, filter.limit);
    }
    return list;
  }

  getCamera(id: string): Camera | undefined {
    return this.cameras.find((c) => c.id === id || c.cameraId === id || c.identifier === id);
  }
}

export const dataStore = new DataStore();

/**
 * Strips sensitive credentials from stream URLs and returns a sanitized reference plus a secret reference token.
 * Prevents plaintext credential leakage to frontends or insecure databases.
 */
export function sanitizeStreamEndpoint(rawEndpoint?: string, cameraId?: string): { streamEndpointReference: string; credentialSecretRef?: string } {
  if (!rawEndpoint || typeof rawEndpoint !== 'string' || !rawEndpoint.trim()) {
    return { streamEndpointReference: 'Unavailable' };
  }

  const trimmed = rawEndpoint.trim();

  // Match authentication credentials: scheme://username:password@host:port/path
  const credUrlRegex = /^([a-zA-Z0-9+.-]+):\/\/([^:@]+):([^@]+)@([^/]+)(.*)$/;
  const match = trimmed.match(credUrlRegex);

  if (match) {
    const [, protocol, username, password, host, path] = match;
    const sanitizedUri = `${protocol}://${host}${path || ''}`;
    const token = credentialVault.store(cameraId || 'cam', {
      rawStreamUrl: trimmed,
      username,
      password,
    });
    return {
      streamEndpointReference: sanitizedUri,
      credentialSecretRef: token,
    };
  }

  // Already sanitized or reference
  if (cameraId && (trimmed.startsWith('rtsp://') || trimmed.startsWith('rtsps://') || trimmed.startsWith('http'))) {
    credentialVault.store(cameraId, {
      rawStreamUrl: trimmed,
    });
  }

  return {
    streamEndpointReference: trimmed,
    credentialSecretRef: cameraId ? `sec-ref-${cameraId.toLowerCase().replace(/[^a-z0-9]/g, '')}-ref` : undefined,
  };
}

/**
 * Enforces role-based access control for camera registry and configuration operations.
 */
export function hasCameraPermission(role: string, permission: CameraPermission): boolean {
  return dataStore.hasPermission(role, permission as PermissionKey);
}

