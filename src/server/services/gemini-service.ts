/**
 * IBVAP — Server-Side Gemini Intelligence Service
 *
 * Provides real Gemini API connectivity with:
 * - Lazy client initialization via @google/genai
 * - Controlled function/tool calling with strict RBAC inheritance
 * - Strict separation of VERIFIED PLATFORM FACTS vs AI INTERPRETATION
 * - Provenance tracking (SIMULATION DATA vs LIVE DATA)
 * - Anti-fabrication guarantees (INSUFFICIENT DATA / NOT OBSERVED)
 * - Safe error handling (CONFIGURATION_REQUIRED, DEGRADED, UNAVAILABLE)
 * - Full audit trail integration
 */

import { GoogleGenAI } from '@google/genai';
import { logger } from '../logger';
import { dataStore } from '../store';
import {
  GeminiStatus,
  GeminiTelemetry,
  GeminiStructuredResponse,
  GeminiSourceCitation,
  OperatorAuthContext,
  IncidentSummaryResult,
  AlertExplanationResult,
  InvestigationResult,
  TimelineNarrationResult,
  SelectedCameraCopilotResult,
} from './gemini-types';
import {
  IBVAP_TOOLS_CONFIG,
  executeTool,
} from './gemini-tools';

export class GeminiService {
  private client: GoogleGenAI | null = null;
  private modelName: string;
  private status: GeminiStatus = 'CONFIGURATION_REQUIRED';
  private lastRequestTimestamp: string | null = null;
  private lastLatencyMs: number | null = null;
  private totalRequests = 0;
  private successfulRequests = 0;
  private failedRequests = 0;
  private lastError: string | null = null;

  constructor() {
    this.modelName = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
    this.initializeClient();
  }

  /**
   * Initializes or refreshes the Gemini API client lazily.
   */
  private initializeClient(): boolean {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey.trim() === '') {
      this.client = null;
      this.status = 'CONFIGURATION_REQUIRED';
      return false;
    }

    try {
      this.client = new GoogleGenAI({ apiKey: apiKey.trim() });
      this.status = 'READY';
      return true;
    } catch (err: any) {
      this.client = null;
      this.status = 'UNAVAILABLE';
      this.lastError = err?.message || 'Failed to initialize GoogleGenAI client';
      logger.error('Failed to initialize Gemini API client:', { error: this.lastError });
      return false;
    }
  }

  /**
   * Authoritative platform telemetry regarding Gemini status.
   */
  public getTelemetry(): GeminiTelemetry {
    // Check if key status changed
    const apiKeyPresent = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim() !== '');
    if (!apiKeyPresent) {
      this.status = 'CONFIGURATION_REQUIRED';
    } else if (this.status === 'CONFIGURATION_REQUIRED') {
      this.initializeClient();
    }

    return {
      provider: 'Google DeepMind Gemini',
      modelName: this.modelName,
      status: this.status,
      isConfigured: apiKeyPresent,
      lastRequestTimestamp: this.lastRequestTimestamp,
      lastLatencyMs: this.lastLatencyMs,
      totalRequests: this.totalRequests,
      successfulRequests: this.successfulRequests,
      failedRequests: this.failedRequests,
      lastError: this.lastError,
    };
  }

  /**
   * System Instruction grounding Gemini in truthful IBVAP surveillance operations.
   */
  private buildSystemInstruction(): string {
    return `You are the IBVAP Surveillance Intelligence Copilot for border security operations.
You operate on structured facts retrieved from the IBVAP platform via provided tools.

CRITICAL OPERATIONAL DIRECTIVES:
1. TRUTHFULNESS & GROUNDING: Reason ONLY over facts retrieved from the tool calls or structured context provided.
   DO NOT invent, extrapolate, or fabricate surveillance detections, people, vehicles, license plates, biometric identities, virtual fences, timestamps, evidence items, or alerts.
2. MISSING INFORMATION: If requested information is absent or not observed by platform sensors, explicitly say:
   "INSUFFICIENT DATA", "NOT OBSERVED", or "NOT AVAILABLE". Never attempt to guess or hallucinate missing data.
3. STRUCTURED RESPONSE SEPARATION:
   Always structure your answers with two clearly labeled sections:
   [VERIFIED PLATFORM FACTS]
   - Bullet points stating strictly verified sensor/platform records with exact timestamps, camera identifiers, and track IDs.
   [AI INTERPRETATION / SUMMARY]
   - Tactical synthesis, correlation, operational assessment, or recommended next steps. Never present hypotheses as verified sensor facts.
4. PROVENANCE AWARENESS:
   The current operational mode includes SIMULATION DATA (synthetic border defense exercise).
   Explicitly label analyzed events with [SIMULATION DATA] provenance. Do NOT claim simulation records are live operational border incidents.
5. EVIDENCE DISCLAIMER:
   You have access to evidence metadata (hashes, timestamps, sizes). You have NOT inspected raw video frames unless explicitly provided in the prompt.
   When describing evidence, say "Evidence metadata indicates..." and never claim "I viewed the video footage".
6. READ-ONLY CONSTRAINT:
   All operations are strictly read-only. You cannot alter watchlists, delete cameras, or modify platform rules.`;
  }

  /**
   * Core tool-calling reasoning loop with multi-turn execution.
   */
  public async queryCopilot(
    query: string,
    context?: { cameraId?: string; incidentId?: string; alertId?: string; trackId?: string },
    operator: OperatorAuthContext = { callsign: 'OPERATOR-01', role: 'SURVEILLANCE_OPERATOR' }
  ): Promise<GeminiStructuredResponse> {
    const startTime = Date.now();
    this.totalRequests++;
    this.lastRequestTimestamp = new Date().toISOString();

    const toolsInvokedList: any[] = [];
    const citations: GeminiSourceCitation[] = [];

    // Context hint for Gemini prompt
    let contextualPrompt = query;
    if (context?.cameraId) contextualPrompt += `\n[Context: Focused Camera ${context.cameraId}]`;
    if (context?.incidentId) contextualPrompt += `\n[Context: Incident ${context.incidentId}]`;
    if (context?.alertId) contextualPrompt += `\n[Context: Alert ${context.alertId}]`;
    if (context?.trackId) contextualPrompt += `\n[Context: Track ${context.trackId}]`;

    const isClientReady = this.initializeClient();

    if (!isClientReady || !this.client) {
      // Graceful fallback: retrieve facts directly via tools so the operator still gets real data
      return this.handleFallbackQuery(query, context, operator, startTime, 'CONFIGURATION_REQUIRED');
    }

    try {
      const contents: any[] = [{ role: 'user', parts: [{ text: contextualPrompt }] }];

      // Turn 1: Initial call to Gemini with tools enabled
      let response = await this.client.models.generateContent({
        model: this.modelName,
        contents,
        config: {
          systemInstruction: this.buildSystemInstruction(),
          tools: IBVAP_TOOLS_CONFIG as any,
          temperature: 0.2,
        },
      });

      // Handle function calling loop (up to 4 iterations)
      let iterations = 0;
      while (response.functionCalls && response.functionCalls.length > 0 && iterations < 4) {
        iterations++;
        const functionCalls = response.functionCalls;

        // Record assistant response containing function call
        if (response.candidates && response.candidates[0]?.content) {
          contents.push(response.candidates[0].content);
        }

        const functionResponseParts: any[] = [];

        for (const call of functionCalls) {
          const toolName = call.name;
          const toolArgs = (call.args as Record<string, any>) || {};

          // Execute tool under operator security context
          const { result, record } = await executeTool(toolName, toolArgs, operator);
          toolsInvokedList.push(record);

          // Extract citations from tool args / results
          this.extractCitations(toolName, toolArgs, result, citations);

          functionResponseParts.push({
            functionResponse: {
              name: toolName,
              response: { result },
            },
          });
        }

        contents.push({ role: 'user', parts: functionResponseParts });

        // Next turn to let Gemini evaluate tool results
        response = await this.client.models.generateContent({
          model: this.modelName,
          contents,
          config: {
            systemInstruction: this.buildSystemInstruction(),
            tools: IBVAP_TOOLS_CONFIG as any,
            temperature: 0.2,
          },
        });
      }

      const rawText = response.text || 'INSUFFICIENT DATA';
      const duration = Date.now() - startTime;
      this.lastLatencyMs = duration;
      this.successfulRequests++;
      this.status = 'READY';

      // Parse verified facts vs interpretation
      const { verifiedFacts, interpretation } = this.parseSections(rawText);

      // Audit log the Copilot query
      dataStore.logAudit(
        operator.callsign,
        'GEMINI_COPILOT_QUERY',
        'AI_COPILOT',
        context?.cameraId || context?.incidentId || 'GENERAL',
        operator.ipAddress || '127.0.0.1',
        {
          queryLength: query.length,
          toolsInvokedCount: toolsInvokedList.length,
          model: this.modelName,
          latencyMs: duration,
        },
        'SUCCESS',
        operator.role
      );

      return {
        text: rawText,
        verifiedFacts,
        interpretation,
        citations,
        provenance: 'SIMULATION',
        dataSufficiency: rawText.includes('INSUFFICIENT DATA') ? 'INSUFFICIENT_DATA' : 'SUFFICIENT',
        toolsInvoked: toolsInvokedList,
        modelUsed: this.modelName,
        latencyMs: duration,
        timestamp: new Date().toISOString(),
        isSimulatedData: true,
        geminiStatus: this.status,
      };
    } catch (err: any) {
      this.failedRequests++;
      this.status = 'DEGRADED';
      this.lastError = err?.message || 'Gemini API call failed';
      logger.warn('Gemini query encountered error, falling back to deterministic facts:', { error: this.lastError });

      return this.handleFallbackQuery(query, context, operator, startTime, 'DEGRADED', this.lastError);
    }
  }

  /**
   * Deterministic fallback when Gemini API is unconfigured or degraded.
   * Directly extracts authoritative platform facts without fabricating text.
   */
  private async handleFallbackQuery(
    query: string,
    context?: { cameraId?: string; incidentId?: string; alertId?: string; trackId?: string },
    operator: OperatorAuthContext = { callsign: 'OPERATOR-01', role: 'SURVEILLANCE_OPERATOR' },
    startTime: number = Date.now(),
    statusOverride: GeminiStatus = 'CONFIGURATION_REQUIRED',
    errorDetail?: string
  ): Promise<GeminiStructuredResponse> {
    const duration = Date.now() - startTime;
    this.lastLatencyMs = duration;

    const toolsInvokedList: any[] = [];
    const citations: GeminiSourceCitation[] = [];
    const verifiedFacts: string[] = [];

    // Intelligently execute primary tools based on context or query keywords
    const lower = query.toLowerCase();

    if (context?.incidentId || lower.includes('incident')) {
      const incId = context?.incidentId || 'INC-2026-0881';
      const { result, record } = await executeTool('getIncident', { incidentId: incId }, operator);
      toolsInvokedList.push(record);
      if ((result as any)?.incidentNumber) {
        const inc = result as any;
        verifiedFacts.push(`Incident ${inc.incidentNumber}: ${inc.title} (Status: ${inc.status}, Severity: ${inc.severity})`);
        verifiedFacts.push(`Primary Camera: ${inc.primaryCameraIdentifier}, Sector: ${inc.sectorName}`);
        verifiedFacts.push(`Containment Notes: ${inc.containmentNotes || 'None'}`);
        citations.push({ type: 'INCIDENT', id: inc.incidentNumber, label: inc.incidentNumber, provenance: 'SIMULATION' });
        citations.push({ type: 'CAMERA', id: inc.primaryCameraIdentifier, label: inc.primaryCameraIdentifier, provenance: 'SIMULATION' });
      }
    } else if (context?.alertId || lower.includes('alert')) {
      const { result, record } = await executeTool('getActiveAlerts', { limit: 5 }, operator);
      toolsInvokedList.push(record);
      const alerts = (result as any)?.alerts || [];
      if (alerts.length > 0) {
        alerts.forEach((a: any) => {
          verifiedFacts.push(`Alert [${a.alertNumber || a.id}] ${a.title} (${a.cameraIdentifier}) — Severity: ${a.severity}`);
          citations.push({ type: 'ALERT', id: a.alertNumber || a.id, label: a.alertNumber || a.id, provenance: 'SIMULATION' });
        });
      } else {
        verifiedFacts.push('No unacknowledged alerts currently active in queue.');
      }
    } else if (context?.cameraId || lower.includes('camera')) {
      const camId = context?.cameraId || 'CAM-01';
      const { result, record } = await executeTool('getCameraStatus', { cameraId: camId }, operator);
      toolsInvokedList.push(record);
      if ((result as any)?.cameraId) {
        const cam = result as any;
        verifiedFacts.push(`Camera ${cam.identifier}: Status is ${cam.status}, Connection: ${cam.connectionStatus}`);
        verifiedFacts.push(`Stream FPS: ${cam.fps}, Latency: ${cam.latencyMs ?? 'N/A'}ms, Optical Status: ${cam.opticalStatus}`);
        citations.push({ type: 'CAMERA', id: cam.identifier, label: cam.identifier, provenance: 'SIMULATION' });
      }
    } else {
      // Default recent events
      const { result, record } = await executeTool('getRecentEvents', { limit: 5 }, operator);
      toolsInvokedList.push(record);
      const events = (result as any)?.events || [];
      events.forEach((e: any) => {
        verifiedFacts.push(`Event ${e.eventType} at ${e.timestamp} (Source: ${e.source})`);
        citations.push({ type: 'EVENT', id: e.eventId, label: e.eventType, provenance: 'SIMULATION' });
      });
    }

    const interpretationNotice =
      statusOverride === 'CONFIGURATION_REQUIRED'
        ? 'Gemini API key is not configured (GEMINI_API_KEY). Natural language AI synthesis is offline, but platform sensors and verified facts above are operational.'
        : `Gemini API is temporarily degraded (${errorDetail || 'network/timeout'}). Verified facts above were retrieved directly from operational telemetry.`;

    const fullText = `[VERIFIED PLATFORM FACTS]\n${verifiedFacts.map((f) => `• ${f}`).join('\n')}\n\n[AI INTERPRETATION / SUMMARY]\n${interpretationNotice}\n[SIMULATION DATA]`;

    return {
      text: fullText,
      verifiedFacts,
      interpretation: interpretationNotice,
      citations,
      provenance: 'SIMULATION',
      dataSufficiency: verifiedFacts.length > 0 ? 'SUFFICIENT' : 'INSUFFICIENT_DATA',
      toolsInvoked: toolsInvokedList,
      modelUsed: this.modelName,
      latencyMs: duration,
      timestamp: new Date().toISOString(),
      isSimulatedData: true,
      geminiStatus: statusOverride,
    };
  }

  /**
   * Summarizes an incident comprehensively under operator authorization context.
   */
  public async summarizeIncident(
    incidentId: string,
    operator: OperatorAuthContext
  ): Promise<IncidentSummaryResult> {
    const inc = dataStore.incidents.find((i) => i.id === incidentId || i.incidentNumber === incidentId);
    if (!inc) {
      const notFoundText = `Incident '${incidentId}' was NOT OBSERVED in the platform registry.\n[VERIFIED PLATFORM FACTS]\n• Incident ${incidentId}: NOT AVAILABLE\n\n[AI INTERPRETATION / SUMMARY]\nINSUFFICIENT DATA to construct incident chronology.`;
      return {
        incidentId,
        incidentNumber: incidentId,
        chronology: [],
        camerasInvolved: [],
        tracksInvolved: [],
        alertsCount: 0,
        evidenceItemsCount: 0,
        text: notFoundText,
        verifiedFacts: [`Incident ${incidentId}: NOT AVAILABLE`],
        interpretation: 'INSUFFICIENT DATA',
        citations: [],
        provenance: 'SIMULATION',
        dataSufficiency: 'INSUFFICIENT_DATA',
        toolsInvoked: [],
        modelUsed: this.modelName,
        latencyMs: 1,
        timestamp: new Date().toISOString(),
        isSimulatedData: true,
        geminiStatus: this.status,
      };
    }

    const query = `Summarize incident ${inc.incidentNumber} comprehensively.
Include incident start, cameras involved, alerts, chronology, and evidence references.
If any detail is missing, say NOT OBSERVED or NOT AVAILABLE.`;

    const baseResponse = await this.queryCopilot(query, { incidentId: inc.incidentNumber }, operator);

    // Extract structured chronology
    const chronology = (inc.timeline || []).map((t) => ({
      timestamp: t.timestamp,
      description: t.description,
      source: t.actorCallsign,
    }));

    const camerasInvolved = Array.from(new Set([inc.primaryCameraIdentifier, ...(inc.relatedCameraIdentifiers || [])]));

    dataStore.logAudit(
      operator.callsign,
      'GEMINI_INCIDENT_SUMMARY',
      'INCIDENT',
      inc.incidentNumber,
      operator.ipAddress || '127.0.0.1',
      {
        incidentNumber: inc.incidentNumber,
        severity: inc.severity,
        chronologyCount: chronology.length,
      },
      'SUCCESS',
      operator.role
    );

    return {
      ...baseResponse,
      incidentId: inc.id,
      incidentNumber: inc.incidentNumber,
      chronology,
      camerasInvolved,
      tracksInvolved: [],
      alertsCount: dataStore.alerts.filter((a) => a.escalatedToIncidentId === inc.id).length,
      evidenceItemsCount: inc.evidenceCount || 0,
    };
  }

  /**
   * Explains an alert and its causal trigger chain.
   */
  public async explainAlert(
    alertId: string,
    operator: OperatorAuthContext
  ): Promise<AlertExplanationResult> {
    const alert = dataStore.alerts.find((a) => a.id === alertId || a.alertNumber === alertId);
    if (!alert) {
      const missingText = `Alert '${alertId}' was NOT OBSERVED in the triage queue.\n[VERIFIED PLATFORM FACTS]\n• Alert ID: NOT AVAILABLE\n\n[AI INTERPRETATION / SUMMARY]\nINSUFFICIENT DATA to explain alert trigger.`;
      return {
        alertId,
        alertNumber: alertId,
        ruleChain: [],
        severityJustification: 'NOT AVAILABLE',
        text: missingText,
        verifiedFacts: [`Alert ${alertId}: NOT AVAILABLE`],
        interpretation: 'INSUFFICIENT DATA',
        citations: [],
        provenance: 'SIMULATION',
        dataSufficiency: 'INSUFFICIENT_DATA',
        toolsInvoked: [],
        modelUsed: this.modelName,
        latencyMs: 1,
        timestamp: new Date().toISOString(),
        isSimulatedData: true,
        geminiStatus: this.status,
      };
    }

    const query = `Explain why alert ${alert.alertNumber || alert.id} was generated.
Break down the rule chain, sensor triggers, zone parameters, and severity justification.`;

    const baseResponse = await this.queryCopilot(query, { alertId: alert.alertNumber || alert.id, cameraId: alert.cameraIdentifier }, operator);

    const ruleChain = (alert.reasoningFactors || []).map((f) => `${f.factor} (${f.detail})`);

    dataStore.logAudit(
      operator.callsign,
      'GEMINI_ALERT_EXPLANATION',
      'ALERT',
      alert.alertNumber || alert.id,
      operator.ipAddress || '127.0.0.1',
      {
        alertNumber: alert.alertNumber || alert.id,
        camera: alert.cameraIdentifier,
        severity: alert.severity,
      },
      'SUCCESS',
      operator.role
    );

    return {
      ...baseResponse,
      alertId: alert.id,
      alertNumber: alert.alertNumber,
      ruleChain,
      severityJustification: `Configured severity is ${alert.severity} based on confidence score ${Math.round(alert.confidenceScore * 100)}% and spatial zone classification.`,
    };
  }

  /**
   * Investigates an entity (Track ID, Plate, Person, or Camera).
   */
  public async investigateEntity(
    entityType: 'TRACK' | 'CAMERA' | 'PLATE' | 'PERSON',
    entityId: string,
    query: string,
    operator: OperatorAuthContext
  ): Promise<InvestigationResult> {
    const fullQuery = `[Investigation Mode: ${entityType} ${entityId}]\n${query}\nRetrieve related events, zone entries, alerts, ANPR, and face observations.`;
    const context: any = {};
    if (entityType === 'CAMERA') context.cameraId = entityId;
    if (entityType === 'TRACK') context.trackId = entityId;

    const baseResponse = await this.queryCopilot(fullQuery, context, operator);

    dataStore.logAudit(
      operator.callsign,
      'GEMINI_INVESTIGATION',
      entityType,
      entityId,
      operator.ipAddress || '127.0.0.1',
      { entityType, entityId, query },
      'SUCCESS',
      operator.role
    );

    return {
      ...baseResponse,
      entityType,
      entityId,
      activityTimeline: [],
    };
  }

  /**
   * Generates a verified chronological timeline without hallucinated timestamps.
   */
  public async generateTimeline(
    params: { incidentId?: string; trackId?: string; cameraId?: string; startTime?: string; endTime?: string },
    operator: OperatorAuthContext
  ): Promise<TimelineNarrationResult> {
    const query = `Generate a chronological narrative for ${params.incidentId ? `incident ${params.incidentId}` : `camera ${params.cameraId || 'all'}`}.
State exact timestamps for every event. DO NOT invent timestamps.`;

    const baseResponse = await this.queryCopilot(query, params, operator);

    dataStore.logAudit(
      operator.callsign,
      'GEMINI_TIMELINE_GENERATION',
      'TIMELINE',
      params.incidentId || params.trackId || params.cameraId || 'PLATFORM',
      operator.ipAddress || '127.0.0.1',
      params,
      'SUCCESS',
      operator.role
    );

    return {
      ...baseResponse,
      scope: params.incidentId || params.trackId || params.cameraId || 'PLATFORM',
      timelineEntries: [],
    };
  }

  /**
   * Selected-camera conversational copilot mode.
   * Receives camera-specific facts (status, active tracks, zones, alerts).
   */
  public async querySelectedCamera(
    cameraId: string,
    query: string,
    operator: OperatorAuthContext
  ): Promise<SelectedCameraCopilotResult> {
    const cam = dataStore.cameras.find((c) => c.id === cameraId || c.cameraId === cameraId || c.identifier === cameraId);
    const camId = cam?.cameraId || cam?.identifier || cameraId;

    const fullQuery = `[Selected-Camera Focus: ${camId}]\n${query}\nAnalyze camera status, active tracks, recent spatial violations, and unacknowledged alerts on this camera only.`;

    const baseResponse = await this.queryCopilot(fullQuery, { cameraId: camId }, operator);

    const activeTracks = cam ? dataStore.cameras.filter((c) => c.id === cam.id) : [];
    const zones = dataStore.spatialZones.filter((z) => z.cameraId === camId).map((z) => z.name);
    const recentAlerts = dataStore.alerts.filter((a) => a.cameraId === camId || a.cameraIdentifier === camId).length;

    dataStore.logAudit(
      operator.callsign,
      'GEMINI_CAMERA_ANALYSIS',
      'CAMERA',
      camId,
      operator.ipAddress || '127.0.0.1',
      { cameraId: camId, query },
      'SUCCESS',
      operator.role
    );

    return {
      ...baseResponse,
      cameraId: cam?.id || cameraId,
      cameraIdentifier: camId,
      activeTracksCount: activeTracks.length,
      activeZones: zones,
      recentAlertsCount: recentAlerts,
    };
  }

  /**
   * Helper: parses sections into verified facts and interpretation.
   */
  private parseSections(text: string): { verifiedFacts: string[]; interpretation: string } {
    const verifiedFacts: string[] = [];
    let interpretation = '';

    const factsMatch = text.match(/\[VERIFIED PLATFORM FACTS\]([\s\S]*?)(?=\[AI INTERPRETATION|$)/i);
    if (factsMatch && factsMatch[1]) {
      const lines = factsMatch[1].split('\n');
      for (const line of lines) {
        const trimmed = line.trim().replace(/^[•\-\*]\s*/, '');
        if (trimmed && trimmed.length > 3) {
          verifiedFacts.push(trimmed);
        }
      }
    }

    const interpMatch = text.match(/\[AI INTERPRETATION.*?\]([\s\S]*)/i);
    if (interpMatch && interpMatch[1]) {
      interpretation = interpMatch[1].trim();
    } else {
      interpretation = text.replace(/\[VERIFIED PLATFORM FACTS\][\s\S]*?$/i, '').trim() || text;
    }

    return { verifiedFacts, interpretation };
  }

  /**
   * Helper: extracts source citations from tool executions.
   */
  private extractCitations(
    toolName: string,
    toolArgs: Record<string, any>,
    toolResult: any,
    citations: GeminiSourceCitation[]
  ): void {
    if (toolArgs.cameraId) {
      citations.push({ type: 'CAMERA', id: toolArgs.cameraId, label: toolArgs.cameraId, provenance: 'SIMULATION' });
    }
    if (toolArgs.incidentId) {
      citations.push({ type: 'INCIDENT', id: toolArgs.incidentId, label: toolArgs.incidentId, provenance: 'SIMULATION' });
    }
    if (toolArgs.trackId) {
      citations.push({ type: 'TRACK', id: toolArgs.trackId, label: toolArgs.trackId, provenance: 'SIMULATION' });
    }
    if (toolArgs.zoneId) {
      citations.push({ type: 'ZONE', id: toolArgs.zoneId, label: toolArgs.zoneId, provenance: 'SIMULATION' });
    }
    if (toolArgs.eventId) {
      citations.push({ type: 'EVENT', id: toolArgs.eventId, label: toolArgs.eventId, provenance: 'SIMULATION' });
    }

    // Extract from result collections
    if (toolResult?.alerts && Array.isArray(toolResult.alerts)) {
      toolResult.alerts.slice(0, 3).forEach((a: any) => {
        citations.push({ type: 'ALERT', id: a.alertNumber || a.id, label: a.alertNumber || a.id, provenance: 'SIMULATION' });
      });
    }
  }
}

export const geminiService = new GeminiService();
