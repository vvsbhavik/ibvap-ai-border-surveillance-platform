import { CameraPermission, PermissionDefinition, PermissionKey, RoleDefinition, UserRole } from '../server/types';

export const ALL_PERMISSIONS: PermissionDefinition[] = [
  // Dashboard
  {
    key: 'dashboard.view',
    label: 'View Command Dashboard',
    category: 'Dashboard',
    description: 'Access primary perimeter situational overview, threat telemetry, and real-time KPI metrics.',
  },

  // Cameras
  {
    key: 'camera.view',
    label: 'View Camera Feeds & Inventory',
    category: 'Cameras',
    description: 'Inspect camera telemetry, live video streams, optic health, and spatial coordinates.',
  },
  {
    key: 'camera.create',
    label: 'Commission Sensor Nodes',
    category: 'Cameras',
    description: 'Register and commission new physical, thermal, or PTZ sensor units into the perimeter inventory.',
  },
  {
    key: 'camera.update',
    label: 'Configure Sensor Parameters',
    category: 'Cameras',
    description: 'Modify camera resolution, mounting angles, RTSP stream parameters, and AI inference pipelines.',
  },
  {
    key: 'camera.enable',
    label: 'Enable Camera Feeds',
    category: 'Cameras',
    description: 'Restore offline or disabled camera feeds to active operational status.',
  },
  {
    key: 'camera.disable',
    label: 'Disable Camera Feeds',
    category: 'Cameras',
    description: 'Temporarily take cameras offline for scheduled maintenance or optical realignment.',
  },
  {
    key: 'camera.decommission',
    label: 'Decommission Sensor Units',
    category: 'Cameras',
    description: 'Permanently remove and archive sensor units from active surveillance registry.',
  },
  {
    key: 'camera.configure',
    label: 'Configure Sensor Hardware',
    category: 'Cameras',
    description: 'Update camera hardware profiles, credentials references, and sensor mounting settings.',
  },
  {
    key: 'camera.stream.view',
    label: 'View Video Streams & Telemetry',
    category: 'Cameras',
    description: 'View active video stream sessions, frame rates, latency telemetry, and raw feed snapshots.',
  },
  {
    key: 'camera.stream.test',
    label: 'Execute Stream Diagnostics',
    category: 'Cameras',
    description: 'Execute live RTSP/socket handshake diagnostics, test connectivity, and probe gateway status.',
  },
  {
    key: 'camera.stream.reconnect',
    label: 'Trigger Stream Reconnect',
    category: 'Cameras',
    description: 'Manually command the video gateway to re-establish and re-synchronize camera stream sessions.',
  },

  // Monitoring
  {
    key: 'monitoring.view',
    label: 'View Live Video Wall',
    category: 'Monitoring',
    description: 'Access the high-density tactical video wall, live PTZ controls, and grid layouts.',
  },

  // Alerts
  {
    key: 'alert.view',
    label: 'View Perimeter Alerts',
    category: 'Alerts',
    description: 'Inspect real-time perimeter tripwire, loitering, and AI detection alert queues.',
  },
  {
    key: 'alert.acknowledge',
    label: 'Acknowledge Alerts',
    category: 'Alerts',
    description: 'Acknowledge pending alerts and record operational notes during initial assessment.',
  },
  {
    key: 'alert.dismiss',
    label: 'Dismiss False Positives',
    category: 'Alerts',
    description: 'Dismiss verified false-positive alerts with required operator justification.',
  },

  // Incidents
  {
    key: 'incident.view',
    label: 'View Incident Command',
    category: 'Incidents',
    description: 'Access active border incidents, situational timelines, and forensic logs.',
  },
  {
    key: 'incident.create',
    label: 'Declare Incidents',
    category: 'Incidents',
    description: 'Declare and initialize high-priority border operational incidents.',
  },
  {
    key: 'incident.update',
    label: 'Update Incident Dossier',
    category: 'Incidents',
    description: 'Update containment notes, operational status, and append timeline entries.',
  },
  {
    key: 'incident.assign',
    label: 'Assign Command Personnel',
    category: 'Incidents',
    description: 'Assign lead commanders and response units to active incident operations.',
  },
  {
    key: 'incident.escalate',
    label: 'Escalate Alerts to Incidents',
    category: 'Incidents',
    description: 'Escalate verified perimeter alerts into formal incident command cases.',
  },
  {
    key: 'incident.resolve',
    label: 'Resolve & Close Incidents',
    category: 'Incidents',
    description: 'Declare containment, resolve active incidents, and finalize incident summaries.',
  },

  // Evidence
  {
    key: 'evidence.view',
    label: 'View Evidence Vault',
    category: 'Evidence',
    description: 'Inspect digital evidence repository, media captures, and cryptographic audit proofs.',
  },
  {
    key: 'evidence.verify',
    label: 'Verify Evidence Hashes',
    category: 'Evidence',
    description: 'Perform real-time SHA-256 cryptographic chain-of-custody checksum verification.',
  },
  {
    key: 'evidence.export',
    label: 'Export Evidence Packages',
    category: 'Evidence',
    description: 'Export cryptographically signed evidence dossiers and court-admissible packages.',
  },

  // GIS
  {
    key: 'gis.view',
    label: 'View GIS Geospatial Map',
    category: 'GIS',
    description: 'Access geospatial sector maps, camera field-of-view cones, and zone boundaries.',
  },

  // ANPR
  {
    key: 'anpr.view',
    label: 'View ANPR Detections',
    category: 'ANPR',
    description: 'Inspect automated license plate recognitions, plate confidence scores, and vehicle crops.',
  },
  {
    key: 'anpr.search',
    label: 'Search ANPR History',
    category: 'ANPR',
    description: 'Query historical plate recognition database by plate number, color, or timeframe.',
  },
  {
    key: 'anpr.watchlist',
    label: 'Triage ANPR Matches',
    category: 'ANPR',
    description: 'Inspect automated alerts generated by vehicles matching watchlist entries.',
  },

  // Watchlists
  {
    key: 'watchlist.view',
    label: 'View Surveillance Watchlists',
    category: 'Watchlists',
    description: 'Access target lists for persons of interest, suspect vehicles, and high-risk plates.',
  },
  {
    key: 'watchlist.create',
    label: 'Create Watchlist Target',
    category: 'Watchlists',
    description: 'Enroll new suspect vehicles, license plates, or target profiles to watchlists.',
  },
  {
    key: 'watchlist.update',
    label: 'Update Watchlist Entry',
    category: 'Watchlists',
    description: 'Modify watchlist notes, threat levels, or toggle active alert matching status.',
  },
  {
    key: 'watchlist.delete',
    label: 'Remove Watchlist Entry',
    category: 'Watchlists',
    description: 'Delete or deactivate targets from active surveillance alert watchlists.',
  },

  // AI & Copilot
  {
    key: 'copilot.use',
    label: 'Use Gemini AI Copilot',
    category: 'AI',
    description: 'Query conversational Gemini tactical assistant for real-time sensor summaries.',
  },
  {
    key: 'gemini_live.use',
    label: 'Stream to Gemini Live',
    category: 'AI',
    description: 'Initiate multimodal low-latency live video streaming directly to Gemini models.',
  },

  // System & Health
  {
    key: 'system_health.view',
    label: 'View System Telemetry & Health',
    category: 'System',
    description: 'Inspect server cluster telemetry, stream latency, pipeline queue, and component status.',
  },
  {
    key: 'system.configure',
    label: 'Configure Platform Settings',
    category: 'System',
    description: 'Modify global platform retention rules, network configurations, and subsystem switches.',
  },

  // Zones & Virtual Fences
  {
    key: 'zone.view',
    label: 'View Zones & Virtual Fences',
    category: 'Zones',
    description: 'View configured spatial zones, virtual fences, boundaries, and spatial events.',
  },
  {
    key: 'zone.create',
    label: 'Create Spatial Zones & Fences',
    category: 'Zones',
    description: 'Draw and define new polygon zones and virtual tripwire fences on camera viewports.',
  },
  {
    key: 'zone.update',
    label: 'Update Zone Geometries & Rules',
    category: 'Zones',
    description: 'Modify zone boundaries, vertices, directional rules, sensitivity, and schedules.',
  },
  {
    key: 'zone.activate',
    label: 'Activate Spatial Rules',
    category: 'Zones',
    description: 'Enable spatial boundary monitoring and fence breach detection on cameras.',
  },
  {
    key: 'zone.deactivate',
    label: 'Deactivate Spatial Rules',
    category: 'Zones',
    description: 'Temporarily disarm spatial zone triggers and fence intrusion tracking.',
  },
  {
    key: 'zone.delete',
    label: 'Delete Spatial Zones',
    category: 'Zones',
    description: 'Remove spatial boundary definitions and virtual fence configurations from camera.',
  },

  // Administration
  {
    key: 'user.view',
    label: 'View Operator Accounts',
    category: 'Administration',
    description: 'View user directory, callsigns, assigned roles, and terminal activity status.',
  },
  {
    key: 'user.create',
    label: 'Commission Operator Accounts',
    category: 'Administration',
    description: 'Provision new operator accounts, assign roles, and issue access credentials.',
  },
  {
    key: 'user.update',
    label: 'Update Operator Profiles',
    category: 'Administration',
    description: 'Modify user callsigns, contact details, badge numbers, and role assignments.',
  },
  {
    key: 'user.disable',
    label: 'Disable / Lock Operators',
    category: 'Administration',
    description: 'Suspend or permanently disable operator access credentials to the platform.',
  },
  {
    key: 'role.view',
    label: 'View Role Permissions',
    category: 'Administration',
    description: 'Inspect the platform role hierarchy and associated permission matrices.',
  },
  {
    key: 'role.manage',
    label: 'Manage Role Matrix',
    category: 'Administration',
    description: 'Reconfigure fine-grained permission assignments across platform roles.',
  },
  {
    key: 'audit.view',
    label: 'View Security Audit Logs',
    category: 'Administration',
    description: 'Inspect immutable platform audit trails, access logs, and administrative actions.',
  },
];

export const CANONICAL_ROLE_MAP: Record<string, UserRole> = {
  ADMINISTRATOR: 'SYSTEM_ADMINISTRATOR',
  SYSTEM_ADMINISTRATOR: 'SYSTEM_ADMINISTRATOR',
  WATCH_COMMANDER: 'WATCH_COMMANDER',
  FIELD_OPERATOR: 'SURVEILLANCE_OPERATOR',
  SURVEILLANCE_OPERATOR: 'SURVEILLANCE_OPERATOR',
  FORENSIC_ANALYST: 'EVIDENCE_INVESTIGATOR',
  EVIDENCE_INVESTIGATOR: 'EVIDENCE_INVESTIGATOR',
  SECURITY_AUDITOR: 'EVIDENCE_INVESTIGATOR',
  TECHNICAL_OPERATOR: 'TECHNICAL_OPERATOR',
};

export function canonicalRole(role?: string): UserRole {
  if (!role) return 'SURVEILLANCE_OPERATOR';
  const upper = role.toUpperCase().trim();
  return CANONICAL_ROLE_MAP[upper] || (upper as UserRole);
}

export const DEFAULT_ROLE_DEFINITIONS: RoleDefinition[] = [
  {
    id: 'role-sys-admin',
    role: 'SYSTEM_ADMINISTRATOR',
    name: 'System Administrator',
    description: 'Full administrative authority across all IBVAP sensors, user accounts, security roles, and system parameters.',
    permissions: ALL_PERMISSIONS.map((p) => p.key),
    isSystemRole: true,
  },
  {
    id: 'role-watch-cmd',
    role: 'WATCH_COMMANDER',
    name: 'Watch Commander',
    description: 'Operational command authority for perimeter defense, alert escalation, incident management, GIS, and tactical dispatch.',
    permissions: [
      'dashboard.view',
      'monitoring.view',
      'camera.view',
      'camera.stream.view',
      'camera.stream.test',
      'camera.stream.reconnect',
      'alert.view',
      'alert.acknowledge',
      'alert.dismiss',
      'incident.view',
      'incident.create',
      'incident.update',
      'incident.assign',
      'incident.escalate',
      'incident.resolve',
      'gis.view',
      'anpr.view',
      'anpr.search',
      'anpr.watchlist',
      'watchlist.view',
      'watchlist.create',
      'watchlist.update',
      'evidence.view',
      'copilot.use',
      'gemini_live.use',
      'system_health.view',
      'zone.view',
      'zone.create',
      'zone.update',
      'zone.activate',
      'zone.deactivate',
      'zone.delete',
      'audit.view',
    ],
    isSystemRole: true,
  },
  {
    id: 'role-surv-op',
    role: 'SURVEILLANCE_OPERATOR',
    name: 'Surveillance Operator',
    description: 'Real-time observation of perimeter video wall feeds, optical PTZ slew control, alert acknowledgment, and GIS monitoring.',
    permissions: [
      'dashboard.view',
      'monitoring.view',
      'camera.view',
      'camera.stream.view',
      'alert.view',
      'alert.acknowledge',
      'incident.view',
      'gis.view',
      'zone.view',
      'zone.activate',
      'zone.deactivate',
      'copilot.use',
      'gemini_live.use',
    ],
    isSystemRole: true,
  },
  {
    id: 'role-evid-inv',
    role: 'EVIDENCE_INVESTIGATOR',
    name: 'Evidence Investigator',
    description: 'Forensic incident analysis, chain-of-custody verification, court-admissible evidence export, and ANPR historical search.',
    permissions: [
      'dashboard.view',
      'camera.view',
      'camera.stream.view',
      'incident.view',
      'evidence.view',
      'evidence.verify',
      'evidence.export',
      'anpr.view',
      'anpr.search',
      'watchlist.view',
      'gis.view',
      'audit.view',
    ],
    isSystemRole: true,
  },
  {
    id: 'role-tech-op',
    role: 'TECHNICAL_OPERATOR',
    name: 'Technical Operator',
    description: 'Sensor commissioning, hardware diagnostics, camera firmware updates, stream calibration, and platform health telemetry.',
    permissions: [
      'dashboard.view',
      'camera.view',
      'camera.create',
      'camera.update',
      'camera.enable',
      'camera.disable',
      'camera.decommission',
      'camera.configure',
      'camera.stream.view',
      'camera.stream.test',
      'camera.stream.reconnect',
      'monitoring.view',
      'system_health.view',
      'system.configure',
      'zone.view',
      'zone.create',
      'zone.update',
      'zone.activate',
      'zone.deactivate',
      'zone.delete',
      'audit.view',
    ],
    isSystemRole: true,
  },
];

export const INITIAL_ROLE_PERMISSIONS: Record<UserRole, PermissionKey[]> = {
  SYSTEM_ADMINISTRATOR: ALL_PERMISSIONS.map((p) => p.key),
  WATCH_COMMANDER: DEFAULT_ROLE_DEFINITIONS.find((r) => r.role === 'WATCH_COMMANDER')!.permissions,
  SURVEILLANCE_OPERATOR: DEFAULT_ROLE_DEFINITIONS.find((r) => r.role === 'SURVEILLANCE_OPERATOR')!.permissions,
  EVIDENCE_INVESTIGATOR: DEFAULT_ROLE_DEFINITIONS.find((r) => r.role === 'EVIDENCE_INVESTIGATOR')!.permissions,
  TECHNICAL_OPERATOR: DEFAULT_ROLE_DEFINITIONS.find((r) => r.role === 'TECHNICAL_OPERATOR')!.permissions,
  // Backward compatibility aliases
  ADMINISTRATOR: ALL_PERMISSIONS.map((p) => p.key),
  FIELD_OPERATOR: DEFAULT_ROLE_DEFINITIONS.find((r) => r.role === 'SURVEILLANCE_OPERATOR')!.permissions,
  FORENSIC_ANALYST: DEFAULT_ROLE_DEFINITIONS.find((r) => r.role === 'EVIDENCE_INVESTIGATOR')!.permissions,
  SECURITY_AUDITOR: DEFAULT_ROLE_DEFINITIONS.find((r) => r.role === 'EVIDENCE_INVESTIGATOR')!.permissions,
};

export function hasPermission(
  role: UserRole | string | undefined,
  permission: PermissionKey,
  customRolePermissions?: Record<string, PermissionKey[]>
): boolean {
  if (!role) return false;
  const canonical = canonicalRole(role);
  if (canonical === 'SYSTEM_ADMINISTRATOR') return true;

  if (customRolePermissions && customRolePermissions[canonical]) {
    return customRolePermissions[canonical].includes(permission);
  }

  const perms = INITIAL_ROLE_PERMISSIONS[canonical] || [];
  return perms.includes(permission);
}

export function canPerformCameraAction(
  role: UserRole | string | undefined,
  permission: CameraPermission | string,
  customRolePermissions?: Record<string, PermissionKey[]>
): boolean {
  return hasPermission(role, permission as PermissionKey, customRolePermissions);
}

export function getPermissionsByRole(
  role: UserRole | string | undefined,
  customRolePermissions?: Record<string, PermissionKey[]>
): PermissionKey[] {
  if (!role) return [];
  const canonical = canonicalRole(role);
  if (customRolePermissions && customRolePermissions[canonical]) {
    return customRolePermissions[canonical];
  }
  return INITIAL_ROLE_PERMISSIONS[canonical] || [];
}

export function getPermissionDefinition(key: PermissionKey): PermissionDefinition | undefined {
  return ALL_PERMISSIONS.find((p) => p.key === key);
}

