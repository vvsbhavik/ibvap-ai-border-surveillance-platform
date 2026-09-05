-- ============================================================================
-- IBVAP (Intelligent Border Video Analytics Platform)
-- Production PostgreSQL Database Schema — Phase 01 Foundation
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Enum Types
CREATE TYPE user_role AS ENUM (
  'ADMINISTRATOR',
  'WATCH_COMMANDER',
  'FIELD_OPERATOR',
  'FORENSIC_ANALYST',
  'SECURITY_AUDITOR'
);

CREATE TYPE user_status AS ENUM (
  'ACTIVE',
  'SUSPENDED',
  'DEACTIVATED'
);

CREATE TYPE camera_status AS ENUM (
  'ONLINE',
  'DEGRADED',
  'OFFLINE',
  'INTEGRITY_ANOMALY',
  'MAINTENANCE'
);

CREATE TYPE alert_severity AS ENUM (
  'INFORMATION',
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL'
);

CREATE TYPE alert_status AS ENUM (
  'PENDING_ACK',
  'ACKNOWLEDGED',
  'ESCALATED',
  'DISMISSED'
);

CREATE TYPE incident_status AS ENUM (
  'OPEN',
  'INVESTIGATING',
  'CONTAINED',
  'RESOLVED',
  'CLOSED'
);

CREATE TYPE system_health_status AS ENUM (
  'HEALTHY',
  'DEGRADED',
  'OFFLINE',
  'UNKNOWN'
);

-- 1. Sectors
CREATE TABLE IF NOT EXISTS sectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(32) UNIQUE NOT NULL,
  name VARCHAR(128) NOT NULL,
  description TEXT,
  coordinates_geojson JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Zones & Virtual Fences
CREATE TABLE IF NOT EXISTS zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sector_id UUID NOT NULL REFERENCES sectors(id) ON DELETE CASCADE,
  code VARCHAR(64) NOT NULL,
  name VARCHAR(128) NOT NULL,
  zone_type VARCHAR(64) NOT NULL DEFAULT 'RESTRICTED_BUFFER',
  polygon_coordinates JSONB NOT NULL DEFAULT '[]',
  sensitivity_level VARCHAR(32) NOT NULL DEFAULT 'HIGH',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_sector_zone UNIQUE (sector_id, code)
);

-- 3. Users & RBAC
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  callsign VARCHAR(64) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(128) NOT NULL,
  role user_role NOT NULL DEFAULT 'FIELD_OPERATOR',
  badge_number VARCHAR(64) NOT NULL,
  sector_assignment_id UUID REFERENCES sectors(id) ON DELETE SET NULL,
  status user_status NOT NULL DEFAULT 'ACTIVE',
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Cameras
CREATE TABLE IF NOT EXISTS cameras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier VARCHAR(64) UNIQUE NOT NULL, -- e.g. CAM-01
  name VARCHAR(128) NOT NULL,
  sector_id UUID NOT NULL REFERENCES sectors(id) ON DELETE RESTRICT,
  zone_id UUID REFERENCES zones(id) ON DELETE SET NULL,
  latitude NUMERIC(10, 7) NOT NULL,
  longitude NUMERIC(10, 7) NOT NULL,
  azimuth_degrees NUMERIC(5, 2) NOT NULL DEFAULT 0.0,
  field_of_view_degrees NUMERIC(5, 2) NOT NULL DEFAULT 90.0,
  rtsp_stream_uri VARCHAR(512),
  status camera_status NOT NULL DEFAULT 'ONLINE',
  current_fps NUMERIC(4, 1) NOT NULL DEFAULT 30.0,
  current_latency_ms INTEGER NOT NULL DEFAULT 45,
  firmware_version VARCHAR(64) NOT NULL DEFAULT 'v2.4.1-sec',
  model VARCHAR(128) NOT NULL DEFAULT 'FLIR BorderGuard Thermal-PTZ',
  ai_pipeline_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Sensor Events
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(64) NOT NULL,
  camera_id UUID NOT NULL REFERENCES cameras(id) ON DELETE RESTRICT,
  sector_id UUID NOT NULL REFERENCES sectors(id) ON DELETE RESTRICT,
  zone_id UUID REFERENCES zones(id) ON DELETE SET NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confidence_score NUMERIC(5, 4),
  bounding_box JSONB DEFAULT '{}',
  raw_payload JSONB NOT NULL DEFAULT '{}',
  is_simulation BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Alerts
CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  severity alert_severity NOT NULL DEFAULT 'MEDIUM',
  status alert_status NOT NULL DEFAULT 'PENDING_ACK',
  camera_id UUID NOT NULL REFERENCES cameras(id) ON DELETE RESTRICT,
  sector_id UUID NOT NULL REFERENCES sectors(id) ON DELETE RESTRICT,
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  reasoning_factors JSONB NOT NULL DEFAULT '[]',
  acknowledged_by UUID REFERENCES users(id) ON DELETE SET NULL,
  acknowledged_at TIMESTAMPTZ,
  escalated_to_incident_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Incidents
CREATE TABLE IF NOT EXISTS incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_number VARCHAR(32) UNIQUE NOT NULL, -- e.g. INC-2026-0814
  title VARCHAR(255) NOT NULL,
  summary TEXT NOT NULL,
  severity alert_severity NOT NULL DEFAULT 'HIGH',
  status incident_status NOT NULL DEFAULT 'OPEN',
  sector_id UUID NOT NULL REFERENCES sectors(id) ON DELETE RESTRICT,
  primary_camera_id UUID REFERENCES cameras(id) ON DELETE SET NULL,
  lead_commander_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ai_summary TEXT,
  containment_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Incident Timeline Events
CREATE TABLE IF NOT EXISTS incident_timeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action_type VARCHAR(64) NOT NULL,
  description TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Evidence Packages & Digital Chain of Custody
CREATE TABLE IF NOT EXISTS evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID REFERENCES incidents(id) ON DELETE CASCADE,
  camera_id UUID REFERENCES cameras(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  media_type VARCHAR(64) NOT NULL DEFAULT 'VIDEO_CLIP',
  storage_reference_uri VARCHAR(512) NOT NULL,
  file_size_bytes BIGINT NOT NULL DEFAULT 0,
  sha256_checksum CHAR(64) NOT NULL,
  captured_start_at TIMESTAMPTZ NOT NULL,
  captured_end_at TIMESTAMPTZ NOT NULL,
  chain_of_custody_log JSONB NOT NULL DEFAULT '[]',
  is_verified BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. ANPR Records
CREATE TABLE IF NOT EXISTS anpr_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  camera_id UUID NOT NULL REFERENCES cameras(id) ON DELETE RESTRICT,
  sector_id UUID NOT NULL REFERENCES sectors(id) ON DELETE RESTRICT,
  plate_number VARCHAR(32) NOT NULL,
  vehicle_type VARCHAR(64) NOT NULL DEFAULT 'UTILITY_4X4',
  vehicle_color VARCHAR(32) NOT NULL DEFAULT 'WHITE',
  confidence NUMERIC(5, 4) NOT NULL DEFAULT 0.9500,
  speed_estimate_kmh NUMERIC(5, 1),
  is_watchlist_match BOOLEAN NOT NULL DEFAULT FALSE,
  watchlist_category VARCHAR(64),
  snapshot_url VARCHAR(512),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. Watchlists
CREATE TABLE IF NOT EXISTS watchlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type VARCHAR(32) NOT NULL DEFAULT 'VEHICLE', -- VEHICLE | PERSON
  target_identifier VARCHAR(128) NOT NULL, -- Plate or Identity ID
  label_name VARCHAR(128) NOT NULL,
  category VARCHAR(64) NOT NULL DEFAULT 'STOLEN_CROSSING_ALERT',
  priority alert_severity NOT NULL DEFAULT 'HIGH',
  notes TEXT,
  added_by UUID REFERENCES users(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. Audit Logs (Immutable)
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(128) NOT NULL,
  resource_type VARCHAR(64) NOT NULL,
  resource_id VARCHAR(128) NOT NULL,
  ip_address VARCHAR(45) NOT NULL DEFAULT '127.0.0.1',
  user_agent VARCHAR(255),
  details JSONB NOT NULL DEFAULT '{}',
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. System Health Telemetry
CREATE TABLE IF NOT EXISTS system_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  component_key VARCHAR(64) UNIQUE NOT NULL, -- e.g. VIDEO_GATEWAY, AI_INFERENCE
  name VARCHAR(128) NOT NULL,
  status system_health_status NOT NULL DEFAULT 'HEALTHY',
  latency_ms INTEGER NOT NULL DEFAULT 5,
  uptime_percentage NUMERIC(5, 2) NOT NULL DEFAULT 99.98,
  last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metrics JSONB NOT NULL DEFAULT '{}',
  error_message TEXT
);

-- INDICES for high-speed mission-control queries
CREATE INDEX IF NOT EXISTS idx_cameras_sector ON cameras(sector_id);
CREATE INDEX IF NOT EXISTS idx_cameras_status ON cameras(status);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_events_camera ON events(camera_id);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);
CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts(severity);
CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_created_at ON incidents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_anpr_plate ON anpr_records(plate_number);
CREATE INDEX IF NOT EXISTS idx_anpr_timestamp ON anpr_records(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp DESC);
