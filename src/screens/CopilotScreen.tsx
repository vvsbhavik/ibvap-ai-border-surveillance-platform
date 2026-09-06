import React, { useState, useRef, useEffect } from 'react';
import {
  Bot,
  Send,
  Sparkles,
  Camera as CameraIcon,
  AlertTriangle,
  FileText,
  Clock,
  Car,
  User,
  Activity,
  CheckCircle2,
  Info,
  ChevronRight,
  RefreshCw,
  Sliders,
  ExternalLink,
  ShieldAlert,
  HelpCircle,
  X,
} from 'lucide-react';
import { Camera, Alert, Incident } from '../server/types';
import { Button } from '../components/ui/Button';
import { api } from '../api/client';
import { formatTimestamp } from '../utils/formatters';

export interface CopilotScreenProps {
  cameras: Camera[];
  alerts: Alert[];
  incidents: Incident[];
  onNavigate?: (screen: string, entityId?: string) => void;
}

interface ChatMessage {
  id: string;
  sender: 'USER' | 'ASSISTANT';
  text: string;
  timestamp: string;
  provenance?: 'LIVE' | 'SIMULATION' | 'SYNTHETIC';
  verifiedFacts?: string[];
  citations?: { type: string; id: string; label: string }[];
  toolInvocations?: { toolName: string; resultSummary: string }[];
  latencyMs?: number;
  modelName?: string;
  isError?: boolean;
}

interface TelemetryState {
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
}

export const CopilotScreen: React.FC<CopilotScreenProps> = ({
  cameras,
  alerts,
  incidents,
  onNavigate,
}) => {
  const safeCameras = Array.isArray(cameras) ? cameras : [];
  const safeAlerts = Array.isArray(alerts) ? alerts : [];
  const safeIncidents = Array.isArray(incidents) ? incidents : [];

  // Chat State
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'm-init',
      sender: 'ASSISTANT',
      text: `Surveillance Copilot initialized and grounded in authoritative state.\n\nConnected to ${safeCameras.length} cameras, ${safeAlerts.length} alerts, and ${safeIncidents.length} incidents.\n\nReady for natural language inquiries, incident summarization, alert root-cause analysis, and cross-sensor entity tracking.`,
      timestamp: new Date().toISOString(),
      provenance: 'SIMULATION',
      verifiedFacts: [
        `Active surveillance sensors: ${safeCameras.length}`,
        `Pending alerts in triage queue: ${safeAlerts.filter((a) => a.status === 'PENDING_ACK').length}`,
        `Unresolved operational incidents: ${safeIncidents.filter((i) => i.status !== 'RESOLVED').length}`,
      ],
      citations: [
        { type: 'CAMERA', id: safeCameras[0]?.identifier || 'CAM-01', label: safeCameras[0]?.identifier || 'CAM-01' },
      ],
    },
  ]);

  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [selectedIncidentId, setSelectedIncidentId] = useState<string>('');
  const [selectedAlertId, setSelectedAlertId] = useState<string>('');
  const [investigationType, setInvestigationType] = useState<'TRACK' | 'PLATE' | 'PERSON' | 'CAMERA'>('PLATE');
  const [investigationId, setInvestigationId] = useState<string>('');

  // Telemetry & Live Modal State
  const [telemetry, setTelemetry] = useState<TelemetryState | null>(null);
  const [showLiveStatusModal, setShowLiveStatusModal] = useState(false);
  const [liveInfo, setLiveInfo] = useState<{
    state: string;
    reason: string;
    supportedModes: string[];
    requiredCapabilities: string[];
  } | null>(null);
  const [activeInspectorItem, setActiveInspectorItem] = useState<{
    type: string;
    id: string;
    label: string;
    data?: any;
  } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isProcessing]);

  // Load backend Gemini AI telemetry and Live adapter status
  const loadTelemetry = async () => {
    try {
      const res = await api.ai.getStatus();
      if (res.success) {
        setTelemetry(res.telemetry);
        setLiveInfo(res.live);
      }
    } catch {
      // Backend may be starting or offline
    }
  };

  useEffect(() => {
    loadTelemetry();
    const interval = setInterval(loadTelemetry, 15000);
    return () => clearInterval(interval);
  }, []);

  const suggestedQueries = [
    'Which cameras report optical anomalies or degradation?',
    'Summarize active incidents in Sector Delta',
    'List unacknowledged high-priority alerts with causal factors',
    'Investigate vehicle with plate 7XYZ890',
    'Explain recent perimeter intrusion alerts',
  ];

  // Primary Query Handler
  const handleSend = async (queryText?: string) => {
    const query = (queryText || input).trim();
    if (!query || isProcessing) return;

    const userMsg: ChatMessage = {
      id: `usr-${Date.now()}`,
      sender: 'USER',
      text: query,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsProcessing(true);

    try {
      const res = await api.ai.copilotQuery({
        query,
        cameraId: selectedCameraId || undefined,
        incidentId: selectedIncidentId || undefined,
        alertId: selectedAlertId || undefined,
      });

      if (res.success && res.data) {
        const assistantMsg: ChatMessage = {
          id: res.data.id || `bot-${Date.now()}`,
          sender: 'ASSISTANT',
          text: res.data.response,
          timestamp: new Date().toISOString(),
          provenance: res.data.provenance || 'SIMULATION',
          verifiedFacts: res.data.verifiedFacts,
          citations: res.data.citations,
          toolInvocations: res.data.toolInvocations,
          latencyMs: res.data.latencyMs,
          modelName: res.data.modelName,
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } else {
        throw new Error('Unsuccessful copilot query response');
      }
    } catch (err: any) {
      // Graceful fallback display
      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        sender: 'ASSISTANT',
        text: `Unable to complete conversational inference: ${err?.message || 'Network error'}.\n\nOperating in fallback telemetry mode. Verified platform facts remain accessible.`,
        timestamp: new Date().toISOString(),
        provenance: 'SIMULATION',
        isError: true,
        verifiedFacts: [
          `Online Cameras: ${safeCameras.filter((c) => c.status === 'ONLINE').length} / ${safeCameras.length}`,
          `Active Alerts: ${safeAlerts.length}`,
        ],
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsProcessing(false);
      loadTelemetry();
    }
  };

  // Quick Action: Summarize Incident
  const handleSummarizeIncident = async (incidentId: string) => {
    if (!incidentId || isProcessing) return;
    setIsProcessing(true);

    const userMsg: ChatMessage = {
      id: `usr-sum-${Date.now()}`,
      sender: 'USER',
      text: `Generate authoritative operational summary for Incident ${incidentId}`,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const res = await api.ai.summarizeIncident(incidentId);
      if (res.success && res.data) {
        const d = res.data;
        let reply = `Authoritative Summary for Incident ${d.incidentNumber}:\n\n${d.summary}`;
        if (d.recommendedActions && d.recommendedActions.length > 0) {
          reply += `\n\nRecommended Operator Actions:\n` + d.recommendedActions.map((a) => `• ${a}`).join('\n');
        }

        const botMsg: ChatMessage = {
          id: `bot-sum-${Date.now()}`,
          sender: 'ASSISTANT',
          text: reply,
          timestamp: new Date().toISOString(),
          provenance: d.provenance || 'SIMULATION',
          verifiedFacts: d.keyFacts,
          citations: [
            { type: 'INCIDENT', id: d.incidentId, label: d.incidentNumber },
            ...(d.involvedCameras || []).map((c) => ({ type: 'CAMERA', id: c, label: c })),
          ],
          latencyMs: d.latencyMs,
        };
        setMessages((prev) => [...prev, botMsg]);
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-sum-${Date.now()}`,
          sender: 'ASSISTANT',
          text: `Failed to generate summary for ${incidentId}: ${err?.message}`,
          timestamp: new Date().toISOString(),
          isError: true,
        },
      ]);
    } finally {
      setIsProcessing(false);
      loadTelemetry();
    }
  };

  // Quick Action: Explain Alert
  const handleExplainAlert = async (alertId: string) => {
    if (!alertId || isProcessing) return;
    setIsProcessing(true);

    const userMsg: ChatMessage = {
      id: `usr-exp-${Date.now()}`,
      sender: 'USER',
      text: `Explain trigger chain and causal factors for Alert ${alertId}`,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const res = await api.ai.explainAlert(alertId);
      if (res.success && res.data) {
        const d = res.data;
        let reply = `Root-Cause Analysis for Alert ${d.alertNumber}:\n\n${d.explanation}`;
        if (d.recommendedVerification) {
          reply += `\n\nVerification Protocol:\n${d.recommendedVerification}`;
        }

        const botMsg: ChatMessage = {
          id: `bot-exp-${Date.now()}`,
          sender: 'ASSISTANT',
          text: reply,
          timestamp: new Date().toISOString(),
          provenance: d.provenance || 'SIMULATION',
          verifiedFacts: d.causalFactors,
          citations: [{ type: 'ALERT', id: d.alertId, label: d.alertNumber }],
          latencyMs: d.latencyMs,
        };
        setMessages((prev) => [...prev, botMsg]);
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-exp-${Date.now()}`,
          sender: 'ASSISTANT',
          text: `Failed to explain alert ${alertId}: ${err?.message}`,
          timestamp: new Date().toISOString(),
          isError: true,
        },
      ]);
    } finally {
      setIsProcessing(false);
      loadTelemetry();
    }
  };

  // Quick Action: Investigate Entity
  const handleInvestigateEntity = async () => {
    if (!investigationId.trim() || isProcessing) return;
    setIsProcessing(true);

    const userMsg: ChatMessage = {
      id: `usr-inv-${Date.now()}`,
      sender: 'USER',
      text: `Investigate ${investigationType}: ${investigationId.trim()}`,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const res = await api.ai.investigateEntity({
        entityType: investigationType,
        entityId: investigationId.trim(),
        query: `Investigate historical sightings and spatial associations for ${investigationType} ${investigationId.trim()}`,
      });

      if (res.success && res.data) {
        const d = res.data;
        const botMsg: ChatMessage = {
          id: d.id || `bot-inv-${Date.now()}`,
          sender: 'ASSISTANT',
          text: d.response,
          timestamp: new Date().toISOString(),
          provenance: d.provenance || 'SIMULATION',
          verifiedFacts: d.verifiedFacts,
          citations: d.citations,
          toolInvocations: d.toolInvocations,
          latencyMs: d.latencyMs,
        };
        setMessages((prev) => [...prev, botMsg]);
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-inv-${Date.now()}`,
          sender: 'ASSISTANT',
          text: `Investigation query failed: ${err?.message}`,
          timestamp: new Date().toISOString(),
          isError: true,
        },
      ]);
    } finally {
      setIsProcessing(false);
      loadTelemetry();
    }
  };

  // Quick Action: Inspect Citation
  const handleInspectCitation = (c: { type: string; id: string; label: string }) => {
    if (c.type === 'CAMERA') {
      const cam = safeCameras.find((x) => x.id === c.id || x.identifier === c.id || x.cameraId === c.id);
      setActiveInspectorItem({ ...c, data: cam });
    } else if (c.type === 'ALERT') {
      const alt = safeAlerts.find((x) => x.id === c.id || x.alertNumber === c.id);
      setActiveInspectorItem({ ...c, data: alt });
    } else if (c.type === 'INCIDENT') {
      const inc = safeIncidents.find((x) => x.id === c.id || x.incidentNumber === c.id);
      setActiveInspectorItem({ ...c, data: inc });
    } else {
      setActiveInspectorItem(c);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0A0B0D] overflow-hidden">
      {/* 1. Top Operations & Telemetry Banner */}
      <div className="p-3.5 sm:px-6 bg-[#0F1115] border-b border-[#23262B] flex flex-col lg:flex-row lg:items-center justify-between gap-3 shrink-0 select-none">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-[#007AFF]/15 border border-[#007AFF]/30 flex items-center justify-center text-[#007AFF]">
            <Bot className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold text-white">Gemini Surveillance Copilot</h1>
              <span className="px-1.5 py-0.5 text-[10px] font-mono-num font-semibold bg-[#007AFF]/15 text-[#007AFF] border border-[#007AFF]/30 rounded">
                SIMULATION PROVENANCE
              </span>
              <span
                className={`px-1.5 py-0.5 text-[10px] font-mono-num font-semibold rounded border ${
                  telemetry?.status === 'READY'
                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                    : telemetry?.status === 'CONFIGURATION_REQUIRED'
                    ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                    : 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                }`}
              >
                {telemetry?.status === 'READY'
                  ? 'MODEL: GEMINI-2.5-FLASH'
                  : telemetry?.status === 'CONFIGURATION_REQUIRED'
                  ? 'API KEY NOT SET (FALLBACK ACTIVE)'
                  : 'INTEGRATED'}
              </span>
            </div>
            <p className="text-xs text-[#6C727A] mt-0.5">
              Authoritative grounding in active camera telemetry, spatial events, ANPR, and incident records
            </p>
          </div>
        </div>

        {/* Status Actions */}
        <div className="flex items-center gap-2">
          {telemetry && (
            <div className="hidden sm:flex items-center gap-3 text-[11px] font-mono-num text-[#8B909A] bg-[#14161A] px-2.5 py-1.5 rounded border border-[#23262B]">
              <span>Latency: <strong className="text-white">{telemetry.lastLatencyMs}ms</strong></span>
              <span className="text-[#3A3F48]">|</span>
              <span>Requests: <strong className="text-white">{telemetry.successfulRequests}/{telemetry.totalRequests}</strong></span>
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowLiveStatusModal(true)}
            className="flex items-center gap-1.5 text-xs bg-[#14161A] hover:bg-[#1A1D23] text-[#A9ACB1] hover:text-white px-2.5 py-1.5 border border-[#23262B] rounded transition-colors"
            title="Inspect Gemini Live Audio/Video adapter capability"
          >
            <Activity className="w-3.5 h-3.5 text-amber-400" />
            <span>Gemini Live Status</span>
          </button>

          <Button
            variant="ghost"
            size="sm"
            onClick={loadTelemetry}
            leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* 2. Structured Action Triggers Bar (Incident / Alert / Entity / Camera scopes) */}
      <div className="px-4 sm:px-6 py-2 bg-[#121418] border-b border-[#23262B] flex flex-wrap items-center gap-3 text-xs">
        {/* Camera Scope Selector */}
        <div className="flex items-center gap-1.5">
          <CameraIcon className="w-3.5 h-3.5 text-[#6C727A]" />
          <span className="text-[#6C727A] font-mono-num text-[11px]">Camera:</span>
          <select
            value={selectedCameraId}
            onChange={(e) => setSelectedCameraId(e.target.value)}
            className="bg-[#181B21] text-[#E0E2E6] border border-[#2B2F38] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#007AFF]"
          >
            <option value="">All Cameras</option>
            {safeCameras.map((c) => (
              <option key={c.id} value={c.identifier}>
                {c.identifier} ({c.name})
              </option>
            ))}
          </select>
        </div>

        {/* Quick Summarize Incident */}
        <div className="flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5 text-[#6C727A]" />
          <span className="text-[#6C727A] font-mono-num text-[11px]">Incident:</span>
          <select
            value={selectedIncidentId}
            onChange={(e) => setSelectedIncidentId(e.target.value)}
            className="bg-[#181B21] text-[#E0E2E6] border border-[#2B2F38] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#007AFF]"
          >
            <option value="">Select Incident...</option>
            {safeIncidents.map((i) => (
              <option key={i.id} value={i.id}>
                {i.incidentNumber} - {i.title}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!selectedIncidentId || isProcessing}
            onClick={() => handleSummarizeIncident(selectedIncidentId)}
            className="px-2 py-1 bg-[#007AFF]/15 hover:bg-[#007AFF]/25 disabled:opacity-50 text-[#007AFF] border border-[#007AFF]/30 rounded text-[11px] font-medium transition-colors"
          >
            Summarize
          </button>
        </div>

        {/* Quick Explain Alert */}
        <div className="flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 text-[#6C727A]" />
          <span className="text-[#6C727A] font-mono-num text-[11px]">Alert:</span>
          <select
            value={selectedAlertId}
            onChange={(e) => setSelectedAlertId(e.target.value)}
            className="bg-[#181B21] text-[#E0E2E6] border border-[#2B2F38] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#007AFF]"
          >
            <option value="">Select Alert...</option>
            {safeAlerts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.alertNumber} ({a.cameraIdentifier})
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!selectedAlertId || isProcessing}
            onClick={() => handleExplainAlert(selectedAlertId)}
            className="px-2 py-1 bg-[#007AFF]/15 hover:bg-[#007AFF]/25 disabled:opacity-50 text-[#007AFF] border border-[#007AFF]/30 rounded text-[11px] font-medium transition-colors"
          >
            Explain
          </button>
        </div>

        {/* Entity Investigation Input */}
        <div className="flex items-center gap-1.5 ml-auto">
          <select
            value={investigationType}
            onChange={(e) => setInvestigationType(e.target.value as any)}
            className="bg-[#181B21] text-[#A9ACB1] border border-[#2B2F38] rounded px-2 py-1 text-xs focus:outline-none"
          >
            <option value="PLATE">Plate</option>
            <option value="TRACK">Vehicle Track</option>
            <option value="PERSON">Person Track</option>
            <option value="CAMERA">Camera</option>
          </select>
          <input
            type="text"
            placeholder="e.g. 7XYZ890 or VEH-01"
            value={investigationId}
            onChange={(e) => setInvestigationId(e.target.value)}
            className="bg-[#181B21] text-white border border-[#2B2F38] rounded px-2 py-1 text-xs w-36 placeholder-[#6C727A] focus:outline-none focus:border-[#007AFF]"
          />
          <button
            type="button"
            disabled={!investigationId.trim() || isProcessing}
            onClick={handleInvestigateEntity}
            className="px-2 py-1 bg-[#1A1E24] hover:bg-[#232832] disabled:opacity-50 text-white border border-[#2B2F38] rounded text-[11px] transition-colors"
          >
            Investigate
          </button>
        </div>
      </div>

      {/* 3. Main Workspace: Chat & Inspector Drawer */}
      <div className="flex-1 flex overflow-hidden">
        {/* Chat Feed */}
        <div className="flex-1 flex flex-col overflow-hidden p-4 sm:p-6 max-w-5xl w-full mx-auto">
          {/* Suggested Queries Chips */}
          <div className="mb-3 shrink-0">
            <span className="text-[11px] font-mono-num text-[#6C727A] mb-1.5 block">
              OPERATIONAL PROMPTS (CLICK TO RUN):
            </span>
            <div className="flex flex-wrap gap-1.5">
              {suggestedQueries.map((q, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSend(q)}
                  disabled={isProcessing}
                  className="text-xs bg-[#0F1115] hover:bg-[#14161A] text-[#A9ACB1] hover:text-white px-2.5 py-1 border border-[#23262B] rounded transition-colors cursor-pointer text-left disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          {/* Chat Messages Workspace */}
          <div className="flex-1 bg-[#0F1115] border border-[#23262B] rounded p-4 flex flex-col justify-between overflow-hidden">
            <div className="flex-1 overflow-y-auto space-y-4 pr-2">
              {messages.map((m) => {
                const isUser = m.sender === 'USER';
                return (
                  <div
                    key={m.id}
                    className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-3xl ${
                      isUser ? 'ml-auto' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2 text-[11px] font-mono-num text-[#6C727A] mb-1">
                      {isUser ? (
                        <span>Operator Callsign</span>
                      ) : (
                        <span className="text-[#007AFF] flex items-center gap-1 font-medium">
                          <Bot className="w-3.5 h-3.5" /> Gemini Copilot
                        </span>
                      )}
                      <span>· {formatTimestamp(m.timestamp, { format: 'time-only' })}</span>
                      {m.latencyMs && (
                        <span className="text-[#4E5460]">({m.latencyMs}ms)</span>
                      )}
                      {m.provenance && (
                        <span className="px-1 text-[9px] bg-[#23262B] text-[#9AA0A6] rounded">
                          {m.provenance}
                        </span>
                      )}
                    </div>

                    <div
                      className={`p-3.5 text-xs leading-relaxed rounded whitespace-pre-line ${
                        isUser
                          ? 'bg-[#007AFF] text-white'
                          : m.isError
                          ? 'bg-rose-950/30 text-rose-200 border border-rose-800/40'
                          : 'bg-[#14161A] text-[#E0E2E6] border border-[#23262B]'
                      }`}
                    >
                      {/* Interpretation Badge */}
                      {!isUser && !m.isError && (
                        <div className="mb-2 flex items-center gap-1.5">
                          <span className="text-[10px] font-mono-num font-semibold text-purple-400 bg-purple-500/10 border border-purple-500/20 px-1.5 py-0.5 rounded">
                            AI INTERPRETATION
                          </span>
                        </div>
                      )}

                      {m.text}

                      {/* Tool Invocations Summary */}
                      {m.toolInvocations && m.toolInvocations.length > 0 && (
                        <div className="mt-3 pt-2.5 border-t border-[#23262B] space-y-1">
                          <div className="text-[10px] font-mono-num text-[#6C727A]">
                            GROUNDED TOOLS EXECUTED:
                          </div>
                          {m.toolInvocations.map((t, idx) => (
                            <div
                              key={idx}
                              className="text-[11px] font-mono-num bg-[#0B0D11] border border-[#23262B] px-2 py-1 rounded text-[#8B909A] flex items-center gap-1.5"
                            >
                              <span className="text-emerald-400 font-semibold">{t.toolName}</span>
                              <span className="text-[#4E5460]">→</span>
                              <span>{t.resultSummary}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Verified Facts Breakdown */}
                      {m.verifiedFacts && m.verifiedFacts.length > 0 && (
                        <div className="mt-3 pt-2.5 border-t border-[#23262B]">
                          <div className="text-[10px] font-mono-num text-emerald-400 mb-1 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                            VERIFIED PLATFORM FACTS:
                          </div>
                          <ul className="list-disc list-inside space-y-0.5 text-[11px] font-mono-num text-[#9AA0A6]">
                            {m.verifiedFacts.map((fact, i) => (
                              <li key={i}>{fact}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Grounded References / Citations */}
                      {m.citations && m.citations.length > 0 && (
                        <div className="mt-3 pt-2.5 border-t border-[#23262B] flex flex-wrap items-center gap-1.5">
                          <span className="text-[10px] font-mono-num text-[#6C727A]">
                            CITATIONS:
                          </span>
                          {m.citations.map((c, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => handleInspectCitation(c)}
                              className="text-[10px] font-mono-num bg-[#0F1115] hover:bg-[#1E222A] border border-[#2B2F38] hover:border-[#007AFF] px-2 py-0.5 rounded text-[#007AFF] flex items-center gap-1 transition-colors cursor-pointer"
                            >
                              <span>{c.type}:</span>
                              <strong>{c.label}</strong>
                              <ChevronRight className="w-2.5 h-2.5 opacity-60" />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {isProcessing && (
                <div className="flex items-center gap-2 text-xs text-[#007AFF] py-1">
                  <Sparkles className="w-3.5 h-3.5 animate-spin" />
                  <span>Grounding facts via Surveillance Knowledge Base & Gemini...</span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Bar */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="mt-3 pt-3 border-t border-[#23262B] flex gap-2"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  selectedCameraId
                    ? `Ask about camera ${selectedCameraId}...`
                    : 'Ask a question about cameras, alerts, incidents, or plate sightings...'
                }
                className="flex-1 h-9 bg-[#14161A] text-xs px-3 text-white border border-[#23262B] rounded placeholder-[#6C727A] focus:outline-none focus:border-[#007AFF]"
              />
              <Button
                type="submit"
                variant="primary"
                size="md"
                rightIcon={<Send className="w-3.5 h-3.5" />}
                disabled={!input.trim() || isProcessing}
              >
                Send
              </Button>
            </form>
          </div>
        </div>

        {/* 4. Side Reference Inspector Drawer (if citation is clicked) */}
        {activeInspectorItem && (
          <div className="w-80 border-l border-[#23262B] bg-[#0E1014] p-4 flex flex-col justify-between shrink-0 overflow-y-auto">
            <div>
              <div className="flex items-center justify-between pb-2 border-b border-[#23262B] mb-3">
                <div className="flex items-center gap-1.5">
                  <Info className="w-4 h-4 text-[#007AFF]" />
                  <h3 className="text-xs font-semibold text-white">Citation Inspector</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveInspectorItem(null)}
                  className="text-[#6C727A] hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <span className="text-[10px] font-mono-num text-[#6C727A] uppercase block">
                    Entity Type
                  </span>
                  <span className="font-semibold text-white">{activeInspectorItem.type}</span>
                </div>
                <div>
                  <span className="text-[10px] font-mono-num text-[#6C727A] uppercase block">
                    Identifier
                  </span>
                  <span className="font-mono-num text-[#007AFF]">{activeInspectorItem.id}</span>
                </div>

                {activeInspectorItem.data && (
                  <div>
                    <span className="text-[10px] font-mono-num text-[#6C727A] uppercase block mb-1">
                      Authoritative Metadata
                    </span>
                    <pre className="text-[10px] font-mono-num bg-[#14161A] p-2 rounded border border-[#23262B] text-[#A9ACB1] overflow-x-auto whitespace-pre-wrap">
                      {JSON.stringify(activeInspectorItem.data, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>

            <div className="pt-3 border-t border-[#23262B] mt-4 space-y-2">
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-center"
                onClick={() => {
                  if (activeInspectorItem.type === 'CAMERA' && onNavigate) {
                    onNavigate('live', activeInspectorItem.id);
                  } else if (activeInspectorItem.type === 'ALERT' && onNavigate) {
                    onNavigate('alerts', activeInspectorItem.id);
                  } else if (activeInspectorItem.type === 'INCIDENT' && onNavigate) {
                    onNavigate('incidents', activeInspectorItem.id);
                  }
                }}
              >
                Open in Primary View
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* 5. Gemini Live Audio/Video Adapter Status Modal */}
      {showLiveStatusModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="bg-[#121418] border border-[#2B2F38] rounded-lg max-w-md w-full p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-[#23262B] pb-3">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-semibold text-white">Gemini Live Subsystem</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowLiveStatusModal(false)}
                className="text-[#6C727A] hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-[#A9ACB1]">
              <div className="bg-[#181B21] p-3 rounded border border-[#2B2F38]">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-mono-num text-[#6C727A]">Current Implementation Status:</span>
                  <span className="text-[10px] font-mono-num font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/25 px-1.5 py-0.5 rounded">
                    {liveInfo?.state || 'NOT_IMPLEMENTED'}
                  </span>
                </div>
                <p className="text-xs text-white leading-relaxed mt-1">
                  {liveInfo?.reason ||
                    'Gemini Live real-time bidirectional audio/video WebSocket streaming is stubbed and not yet implemented. All textual reasoning is fully operational via Gemini 2.5 Flash.'}
                </p>
              </div>

              <div>
                <span className="text-[11px] font-mono-num text-[#6C727A] uppercase block mb-1.5">
                  Required Capabilities for Live Activation:
                </span>
                <ul className="space-y-1">
                  {(liveInfo?.requiredCapabilities || [
                    'Browser microphone and audio capture permission',
                    'Low-latency WebRTC or WebSocket bidirectional streaming pipeline',
                    'Real-time audio PCM chunk encoding/decoding engine',
                    'Grounded video frame multiplexer for active camera feeds',
                  ]).map((cap, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-[11px] text-[#C4C7CE]">
                      <span className="text-amber-400">•</span>
                      <span>{cap}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="text-[11px] text-[#6C727A] border-t border-[#23262B] pt-2">
                Textual grounding, alert analysis, incident summarization, and entity investigations are fully active and production-ready.
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="outline" size="sm" onClick={() => setShowLiveStatusModal(false)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
