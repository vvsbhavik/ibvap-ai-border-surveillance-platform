import React, { useState, useRef, useEffect } from 'react';
import {
  Bot,
  Send,
  Sparkles,
  Camera as CameraIcon,
  AlertTriangle,
  FileText,
  Clock,
  CornerDownLeft,
} from 'lucide-react';
import { Camera, Alert, Incident } from '../server/types';
import { Button } from '../components/ui/Button';
import { formatTimestamp } from '../utils/formatters';

export interface CopilotScreenProps {
  cameras: Camera[];
  alerts: Alert[];
  incidents: Incident[];
}

interface Message {
  id: string;
  sender: 'USER' | 'ASSISTANT';
  text: string;
  timestamp: string;
  citations?: { type: 'CAMERA' | 'ALERT' | 'INCIDENT'; id: string; label: string }[];
}

export const CopilotScreen: React.FC<CopilotScreenProps> = ({
  cameras,
  alerts,
  incidents,
}) => {
  const safeCameras = Array.isArray(cameras) ? cameras : [];
  const safeAlerts = Array.isArray(alerts) ? alerts : [];
  const safeIncidents = Array.isArray(incidents) ? incidents : [];

  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'm-init',
      sender: 'ASSISTANT',
      text: `Surveillance Intelligence Assistant ready. Connected to ${safeCameras.length} cameras, ${safeAlerts.length} alerts, and ${safeIncidents.length} incidents. Ask questions regarding sensor health, recent sector incidents, or unacknowledged alerts.`,
      timestamp: new Date().toISOString(),
      citations: [
        { type: 'INCIDENT', id: 'INC-2026-0881', label: 'INC-2026-0881' },
        { type: 'CAMERA', id: 'CAM-01', label: 'CAM-01' },
      ],
    },
  ]);

  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isProcessing]);

  const suggestedQueries = [
    'Which cameras report optical anomalies or degradation?',
    'Summarize active incidents in Sector Delta',
    'List unacknowledged high-priority alerts',
    'Show health summary across all cameras',
  ];

  const handleSend = (queryText?: string) => {
    const query = queryText || input;
    if (!query.trim()) return;

    const userMsg: Message = {
      id: `usr-${Date.now()}`,
      sender: 'USER',
      text: query,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsProcessing(true);

    setTimeout(() => {
      let replyText = '';
      let citations: Message['citations'] = [];

      const lower = query.toLowerCase();
      if (lower.includes('anomaly') || lower.includes('optical') || lower.includes('tamper') || lower.includes('degradation')) {
        const anomalies = safeCameras.filter((c) => c.status === 'INTEGRITY_ANOMALY' || c.status === 'DEGRADED');
        if (anomalies.length > 0) {
          replyText = `Found ${anomalies.length} camera(s) reporting status anomalies:\n\n` +
            anomalies.map((c) => `• ${c.identifier} (${c.name}): Status is ${c.status}${c.statusDetail ? ` — ${c.statusDetail}` : ''}`).join('\n') +
            `\n\nRecommendation: Check the camera feed directly or dispatch maintenance if physical occlusion is observed.`;
          citations = anomalies.map((c) => ({ type: 'CAMERA', id: c.identifier, label: `${c.identifier}` }));
        } else {
          replyText = 'All surveillance cameras are currently reporting nominal optical integrity and stream quality.';
        }
      } else if (lower.includes('incident') || lower.includes('delta')) {
        const matchingIncidents = safeIncidents.filter((i) => (i.sectorName || '').toLowerCase().includes('delta') || i.status !== 'RESOLVED');
        if (matchingIncidents.length > 0) {
          replyText = `Identified ${matchingIncidents.length} incident(s) requiring attention:\n\n` +
            matchingIncidents.map((i) => `• [${i.incidentNumber}] ${i.title} (${i.status}) — Primary Camera: ${i.primaryCameraIdentifier}`).join('\n') +
            `\n\nAll linked evidence files and event chronologies are documented in the Incidents screen.`;
          citations = matchingIncidents.map((i) => ({ type: 'INCIDENT', id: i.incidentNumber, label: i.incidentNumber }));
        } else {
          replyText = 'No active incidents currently logged for the specified sector.';
        }
      } else if (lower.includes('unacknowledged') || lower.includes('alert') || lower.includes('priority')) {
        const unacked = safeAlerts.filter((a) => a.status === 'PENDING_ACK');
        if (unacked.length > 0) {
          replyText = `There are currently ${unacked.length} unacknowledged alert(s) in the triage queue:\n\n` +
            unacked.slice(0, 4).map((a) => `• [${a.alertNumber}] ${a.title} (${a.cameraIdentifier}) — Severity: ${a.severity}`).join('\n');
          citations = unacked.slice(0, 4).map((a) => ({ type: 'ALERT', id: a.alertNumber, label: a.alertNumber }));
        } else {
          replyText = 'No pending unacknowledged alerts found in the queue.';
        }
      } else {
        replyText = `System telemetry summary:\n\n` +
          `• Cameras: ${safeCameras.length} total (${safeCameras.filter((c) => c.status === 'ONLINE').length} online)\n` +
          `• Active Alerts: ${safeAlerts.length}\n` +
          `• Open Incidents: ${safeIncidents.filter((i) => i.status !== 'RESOLVED').length}\n\n` +
          `All sensor streams and analytics pipelines are operating within standard parameters.`;
        citations = safeCameras.slice(0, 2).map((c) => ({ type: 'CAMERA', id: c.identifier, label: c.identifier }));
      }

      const botMsg: Message = {
        id: `bot-${Date.now()}`,
        sender: 'ASSISTANT',
        text: replyText,
        timestamp: new Date().toISOString(),
        citations,
      };

      setMessages((prev) => [...prev, botMsg]);
      setIsProcessing(false);
    }, 600);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0A0B0D] overflow-hidden">
      {/* 1. Header Toolbar */}
      <div className="p-4 sm:px-6 bg-[#0F1115] border-b border-[#23262B] flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0 select-none">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold text-white">Gemini AI Copilot</h1>
            <span className="px-1.5 py-0.5 text-[10px] font-mono-num font-semibold bg-[#007AFF]/15 text-[#007AFF] border border-[#007AFF]/30 rounded">
              SIMULATION MODE
            </span>
          </div>
          <p className="text-xs text-[#6C727A] mt-0.5">
            Query sensor states, correlate incident chronologies, and inspect operational reasoning
          </p>
        </div>
      </div>

      {/* 2. Main Chat Area */}
      <div className="flex-1 flex flex-col overflow-hidden p-4 sm:p-6 max-w-4xl w-full mx-auto">
        {/* Suggested Queries Chips */}
        <div className="mb-3">
          <span className="text-xs text-[#6C727A] mb-1.5 block">Common Queries:</span>
          <div className="flex flex-wrap gap-1.5">
            {suggestedQueries.map((q, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSend(q)}
                className="text-xs bg-[#0F1115] hover:bg-[#14161A] text-[#A9ACB1] hover:text-white px-2.5 py-1 border border-[#23262B] rounded transition-colors cursor-pointer text-left"
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
                  className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-2xl ${
                    isUser ? 'ml-auto' : ''
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-[11px] font-mono-num text-[#6C727A] mb-1">
                    {isUser ? (
                      <span>Operator</span>
                    ) : (
                      <span className="text-[#007AFF] flex items-center gap-1 font-medium">
                        <Bot className="w-3.5 h-3.5" /> Intelligence Assistant
                      </span>
                    )}
                    <span>· {formatTimestamp(m.timestamp, { format: 'time-only' })}</span>
                  </div>

                  <div
                    className={`p-3 text-xs leading-relaxed rounded whitespace-pre-line ${
                      isUser
                        ? 'bg-[#007AFF] text-white'
                        : 'bg-[#14161A] text-[#E0E2E6] border border-[#23262B]'
                    }`}
                  >
                    {m.text}

                    {/* Citations */}
                    {m.citations && m.citations.length > 0 && (
                      <div className="mt-3 pt-2.5 border-t border-[#23262B] flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] font-mono-num text-[#6C727A]">References:</span>
                        {m.citations.map((c, i) => (
                          <span
                            key={i}
                            className="text-[10px] font-mono-num bg-[#0F1115] border border-[#23262B] px-1.5 py-0.5 rounded text-[#007AFF]"
                          >
                            {c.label}
                          </span>
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
                <span>Analyzing surveillance data...</span>
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
              placeholder="Ask a question about cameras, alerts, or incident records..."
              className="flex-1 h-9 bg-[#14161A] text-xs px-3 text-white border border-[#23262B] rounded placeholder-[#6C727A] focus:outline-none focus:border-[#007AFF]"
            />
            <Button
              type="submit"
              variant="primary"
              size="md"
              rightIcon={<Send className="w-3.5 h-3.5" />}
              disabled={!input.trim()}
            >
              Send
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};
