/**
 * IBVAP — Gemini Intelligence Layer Types & Schemas
 *
 * Defines contracts for:
 * - Server-side Gemini status and telemetry
 * - Function calling / tool schemas and invocation results
 * - Structured responses with separated facts vs. interpretations
 * - Provenance tracking (LIVE vs. SIMULATION)
 * - Source citations (Camera, Alert, Incident, Track, Event, Zone, Evidence)
 * - Real-time narration and investigation contexts
 */

export type GeminiStatus = 'READY' | 'UNAVAILABLE' | 'DEGRADED' | 'CONFIGURATION_REQUIRED';

export interface GeminiTelemetry {
  provider: 'Google DeepMind Gemini';
  modelName: string;
  status: GeminiStatus;
  isConfigured: boolean;
  lastRequestTimestamp: string | null;
  lastLatencyMs: number | null;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  lastError: string | null;
}

export type CitationType =
  | 'CAMERA'
  | 'ALERT'
  | 'INCIDENT'
  | 'TRACK'
  | 'EVENT'
  | 'ZONE'
  | 'EVIDENCE'
  | 'ANPR'
  | 'FACE';

export type ProvenanceType = 'LIVE' | 'SIMULATION' | 'TEST_DATA' | 'HYBRID';

export interface GeminiSourceCitation {
  type: CitationType;
  id: string;
  label: string;
  provenance: ProvenanceType;
  detail?: string;
}

export interface OperatorAuthContext {
  callsign: string;
  role: string;
  permissions?: string[];
  ipAddress?: string;
}

export interface ToolInvocationRecord {
  tool: string;
  args: Record<string, unknown>;
  authorized: boolean;
  requiredPermission: string;
  executionStatus: 'SUCCESS' | 'DENIED' | 'FAILED' | 'SKIPPED';
  resultSummary?: string;
  timestamp: string;
}

export interface GeminiStructuredResponse {
  /** Synthesized natural language response */
  text: string;
  /** Explicitly verified platform sensor facts */
  verifiedFacts: string[];
  /** AI analytical interpretation / tactical hypothesis */
  interpretation: string;
  /** Referenced platform entities (clickable in UI) */
  citations: GeminiSourceCitation[];
  /** Provenance of source data (SIMULATION vs LIVE) */
  provenance: ProvenanceType;
  /** Truthfulness marker */
  dataSufficiency: 'SUFFICIENT' | 'INSUFFICIENT_DATA' | 'NOT_OBSERVED';
  /** Audit list of tool executions during this reasoning turn */
  toolsInvoked: ToolInvocationRecord[];
  /** Telemetry */
  modelUsed: string;
  latencyMs: number;
  timestamp: string;
  isSimulatedData: boolean;
  geminiStatus: GeminiStatus;
}

export interface IncidentSummaryResult extends GeminiStructuredResponse {
  incidentId: string;
  incidentNumber: string;
  chronology: Array<{ timestamp: string; description: string; source: string }>;
  camerasInvolved: string[];
  tracksInvolved: string[];
  alertsCount: number;
  evidenceItemsCount: number;
}

export interface AlertExplanationResult extends GeminiStructuredResponse {
  alertId: string;
  alertNumber?: string;
  ruleChain: string[];
  severityJustification: string;
  recommendedAction?: string;
}

export interface InvestigationResult extends GeminiStructuredResponse {
  entityType: 'TRACK' | 'CAMERA' | 'PLATE' | 'PERSON';
  entityId: string;
  activityTimeline: Array<{ timestamp: string; event: string; camera: string }>;
}

export interface TimelineNarrationResult extends GeminiStructuredResponse {
  scope: string;
  timelineEntries: Array<{ timestamp: string; text: string; verified: boolean; source: string }>;
}

export interface SelectedCameraCopilotResult extends GeminiStructuredResponse {
  cameraId: string;
  cameraIdentifier: string;
  activeTracksCount: number;
  activeZones: string[];
  recentAlertsCount: number;
}
