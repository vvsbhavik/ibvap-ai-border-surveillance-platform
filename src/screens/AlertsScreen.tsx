import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Filter,
  Camera,
  Play,
  ArrowUpRight,
  Clock,
  MapPin,
} from 'lucide-react';
import { Alert, Sector } from '../server/types';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Search } from '../components/ui/Search';
import { Drawer } from '../components/ui/Drawer';
import { Modal } from '../components/ui/Modal';
import { ExplainableReasoning } from '../components/ai/ExplainableReasoning';
import { tokens } from '../design-system/tokens';
import { formatTimestamp, formatPercentage } from '../utils/formatters';

export interface AlertsScreenProps {
  alerts: Alert[];
  sectors: Sector[];
  onAcknowledgeAlert: (alertId: string, notes?: string) => Promise<void>;
  onEscalateAlert: (alertId: string, incidentTitle: string, incidentSummary: string) => Promise<void>;
  onDismissAlert: (alertId: string, reason: string) => Promise<void>;
  onRunSimulation: () => void;
}

export const AlertsScreen: React.FC<AlertsScreenProps> = ({
  alerts,
  sectors,
  onAcknowledgeAlert,
  onEscalateAlert,
  onDismissAlert,
  onRunSimulation,
}) => {
  const [selectedSeverity, setSelectedSeverity] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [search, setSearch] = useState('');
  const [activeAlert, setActiveAlert] = useState<Alert | null>(null);

  // Escalate modal state
  const [escalateTarget, setEscalateTarget] = useState<Alert | null>(null);
  const [escalateTitle, setEscalateTitle] = useState('');
  const [escalateSummary, setEscalateSummary] = useState('');
  const [isEscalating, setIsEscalating] = useState(false);

  // Dismiss modal state
  const [dismissTarget, setDismissTarget] = useState<Alert | null>(null);
  const [dismissReason, setDismissReason] = useState('False Positive - Verified Environmental');

  const filteredAlerts = alerts
    .filter((a) => {
      const matchSev = selectedSeverity === 'ALL' || a.severity === selectedSeverity;
      const matchStatus = selectedStatus === 'ALL' || a.status === selectedStatus;
      const alertIdOrNum = (a.alertNumber || a.id).toLowerCase();
      const matchSearch =
        a.title.toLowerCase().includes(search.toLowerCase()) ||
        alertIdOrNum.includes(search.toLowerCase()) ||
        a.cameraIdentifier.toLowerCase().includes(search.toLowerCase());
      return matchSev && matchStatus && matchSearch;
    })
    .sort((a, b) => {
      // Pending first, then by priority
      if (a.status === 'PENDING_ACK' && b.status !== 'PENDING_ACK') return -1;
      if (b.status === 'PENDING_ACK' && a.status !== 'PENDING_ACK') return 1;
      const weight: Record<string, number> = { CRITICAL: 3, HIGH: 2, MEDIUM: 1, LOW: 0 };
      return (weight[b.severity] || 0) - (weight[a.severity] || 0);
    });

  const pendingCount = alerts.filter((a) => a.status === 'PENDING_ACK').length;

  const openEscalateModal = (alert: Alert) => {
    setEscalateTarget(alert);
    setEscalateTitle(`Perimeter Breach Response - ${alert.alertNumber || alert.id}`);
    setEscalateSummary(`Operator escalation of ${alert.title}. ${alert.description}`);
  };

  const handleConfirmEscalate = async () => {
    if (!escalateTarget) return;
    setIsEscalating(true);
    try {
      await onEscalateAlert(escalateTarget.id, escalateTitle, escalateSummary);
      setEscalateTarget(null);
      setActiveAlert(null);
    } finally {
      setIsEscalating(false);
    }
  };

  const handleConfirmDismiss = async () => {
    if (!dismissTarget) return;
    await onDismissAlert(dismissTarget.id, dismissReason);
    setDismissTarget(null);
    setActiveAlert(null);
  };

  return (
    <div className="flex-1 flex flex-col gap-4 p-4 sm:p-5 overflow-y-auto select-none">
      {/* Header & Filter Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#23262B] pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-semibold text-white tracking-tight">
              Alert Center
            </h1>
            <span className="px-1.5 py-0.5 text-[10px] font-mono-num font-semibold bg-[#007AFF]/15 text-[#007AFF] border border-[#007AFF]/30 rounded">
              SIMULATED DATA
            </span>
            {pendingCount > 0 && (
              <span className="text-xs font-mono-num font-semibold px-2 py-0.5 bg-[#FF4D4D]/20 text-[#FF4D4D] border border-[#FF4D4D]/30 rounded">
                {pendingCount} Pending Triage
              </span>
            )}
          </div>
          <p className="text-xs text-[#6C727A] mt-0.5">
            Automated sensor detections, prioritized by severity and status
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Search
            value={search}
            onChange={setSearch}
            placeholder="Search alerts or cameras..."
            className="w-52"
          />

          <select
            value={selectedSeverity}
            onChange={(e) => setSelectedSeverity(e.target.value)}
            className="h-8 text-xs bg-[#0F1115] text-[#E0E2E6] border border-[#23262B] rounded px-2.5 cursor-pointer focus:outline-hidden"
          >
            <option value="ALL">All Priorities</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="h-8 text-xs bg-[#0F1115] text-[#E0E2E6] border border-[#23262B] rounded px-2.5 cursor-pointer focus:outline-hidden"
          >
            <option value="ALL">All States</option>
            <option value="PENDING_ACK">Pending Triage</option>
            <option value="ACKNOWLEDGED">Acknowledged</option>
            <option value="ESCALATED">Escalated</option>
            <option value="DISMISSED">Dismissed</option>
          </select>

          <Button
            variant="outline"
            size="sm"
            onClick={onRunSimulation}
            leftIcon={<Play className="w-3 h-3 text-[#007AFF]" />}
          >
            Simulate Event
          </Button>
        </div>
      </div>

      {/* Alert Stream */}
      <div className="space-y-3">
        {filteredAlerts.length === 0 ? (
          <div className="py-16 text-center text-xs text-[#6C727A] bg-[#0F1115] border border-[#23262B] rounded">
            No alerts match the selected criteria.
          </div>
        ) : (
          filteredAlerts.map((alert, idx) => {
            const isCritical = alert.severity === 'CRITICAL';
            const isHigh = alert.severity === 'HIGH';
            const isPending = alert.status === 'PENDING_ACK';
            const isTopAlert = idx === 0 && isCritical && isPending;

            return (
              <div
                key={alert.id}
                onClick={() => setActiveAlert(alert)}
                className={`p-4 rounded border transition-all cursor-pointer ${
                  isTopAlert
                    ? 'bg-[#1C1314] border-[#FF4D4D] shadow-sm'
                    : isPending && isCritical
                    ? 'bg-[#14161A] border-[#FF4D4D]/50 hover:bg-[#1A1D23]'
                    : isPending && isHigh
                    ? 'bg-[#14161A] border-[#FF9500]/50 hover:bg-[#1A1D23]'
                    : 'bg-[#0F1115] border-[#23262B] hover:bg-[#14161A]'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="space-y-2 flex-1 min-w-0">
                    {/* Header: Priority, State, ID, Time */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-xs ${
                          isCritical
                            ? 'bg-[#FF4D4D] text-white'
                            : isHigh
                            ? 'bg-[#FF9500] text-black'
                            : 'bg-[#23262B] text-[#E0E2E6]'
                        }`}
                      >
                        {alert.severity} PRIORITY
                      </span>

                      <span className="text-xs font-mono-num font-bold text-[#007AFF]">
                        {alert.alertNumber || alert.id}
                      </span>

                      <span className="text-xs font-mono-num text-[#6C727A]">
                        {formatTimestamp(alert.detectedAt || alert.timestamp, { format: 'time-only' })}
                      </span>

                      <Badge
                        variant={
                          isPending
                            ? 'attention'
                            : alert.status === 'ESCALATED'
                            ? 'critical'
                            : 'healthy'
                        }
                        size="sm"
                      >
                        {alert.status === 'PENDING_ACK'
                          ? 'Pending Triage'
                          : alert.status.replace('_', ' ')}
                      </Badge>
                    </div>

                    {/* Event Type / Title */}
                    <h2 className="text-sm font-semibold text-white">
                      {alert.title}
                    </h2>

                    {/* Description */}
                    <p className="text-xs text-[#6C727A] leading-relaxed max-w-4xl">
                      {alert.description}
                    </p>

                    {/* Camera & Location Metadata */}
                    <div className="flex flex-wrap items-center gap-4 text-xs text-[#E0E2E6] pt-1 font-mono-num">
                      <span className="flex items-center gap-1.5">
                        <Camera className="w-3.5 h-3.5 text-[#007AFF]" />
                        <span className="font-semibold text-white">{alert.cameraIdentifier}</span>
                      </span>

                      <span className="flex items-center gap-1 text-[#6C727A]">
                        <MapPin className="w-3.5 h-3.5" />
                        <span>Sector: {alert.sectorName}</span>
                      </span>

                      <span className="text-[#6C727A]">
                        Confidence: {formatPercentage(alert.confidenceScore * 100)}
                      </span>
                    </div>
                  </div>

                  {/* Right Action Buttons */}
                  <div
                    className="flex sm:flex-col items-stretch sm:items-end gap-2 shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {isPending && (
                      <Button
                        variant="subtle"
                        size="sm"
                        className="justify-center"
                        onClick={() => onAcknowledgeAlert(alert.id)}
                      >
                        Acknowledge
                      </Button>
                    )}

                    {alert.status !== 'ESCALATED' && (
                      <Button
                        variant="primary"
                        size="sm"
                        className="justify-center"
                        onClick={() => openEscalateModal(alert)}
                        rightIcon={<ArrowUpRight className="w-3 h-3" />}
                      >
                        View Incident
                      </Button>
                    )}

                    {isPending && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="justify-center text-[#6C727A] hover:text-[#FF4D4D]"
                        onClick={() => setDismissTarget(alert)}
                      >
                        Dismiss
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Alert Detail Drawer */}
      <Drawer
        isOpen={!!activeAlert}
        onClose={() => setActiveAlert(null)}
        title={activeAlert ? `${activeAlert.alertNumber} — Alert Details` : ''}
        subtitle={activeAlert?.title}
      >
        {activeAlert && (
          <div className="space-y-4">
            <div className="p-3 bg-[#0F1115] border border-[#23262B] rounded space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono-num font-bold text-white">
                  {activeAlert.cameraIdentifier}
                </span>
                <Badge variant={activeAlert.severity === 'CRITICAL' ? 'critical' : 'attention'}>
                  {activeAlert.severity} PRIORITY
                </Badge>
              </div>
              <div className="text-xs text-[#6C727A]">
                Sector: {activeAlert.sectorName} · Detected:{' '}
                {formatTimestamp(activeAlert.detectedAt || activeAlert.timestamp, { format: 'utc' })}
              </div>
            </div>

            <p className="text-xs text-[#E0E2E6] leading-relaxed bg-[#14161A] p-3 border border-[#23262B] rounded">
              {activeAlert.description}
            </p>

            <ExplainableReasoning
              factors={activeAlert.reasoningFactors}
              confidenceScore={activeAlert.confidenceScore}
              isSimulation={activeAlert.isSimulation}
            />

            <div className="flex gap-2 pt-2 border-t border-[#23262B]">
              {activeAlert.status === 'PENDING_ACK' && (
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => {
                    onAcknowledgeAlert(activeAlert.id);
                    setActiveAlert(null);
                  }}
                >
                  Acknowledge
                </Button>
              )}
              <Button
                variant="primary"
                className="flex-1"
                onClick={() => openEscalateModal(activeAlert)}
              >
                Escalate to Incident
              </Button>
            </div>
          </div>
        )}
      </Drawer>

      {/* Escalate Modal */}
      {escalateTarget && (
        <Modal
          isOpen={true}
          onClose={() => setEscalateTarget(null)}
          title="Escalate Alert to Operational Incident"
        >
          <div className="space-y-4">
            <p className="text-xs text-[#6C727A]">
              Declaring an operational incident assigns a tracking identifier, initiates chain of custody logging, and alerts watch commanders.
            </p>

            <div className="space-y-1">
              <label className="text-xs text-[#6C727A]">Incident Title</label>
              <input
                type="text"
                value={escalateTitle}
                onChange={(e) => setEscalateTitle(e.target.value)}
                className="w-full h-8 text-xs bg-[#0F1115] border border-[#23262B] rounded px-2.5 text-white"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-[#6C727A]">Summary & Context</label>
              <textarea
                value={escalateSummary}
                onChange={(e) => setEscalateSummary(e.target.value)}
                rows={3}
                className="w-full text-xs bg-[#0F1115] border border-[#23262B] rounded p-2 text-white resize-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#23262B]">
              <Button variant="ghost" size="sm" onClick={() => setEscalateTarget(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleConfirmEscalate}
                disabled={isEscalating}
              >
                Confirm Incident Escalation
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Dismiss Modal */}
      {dismissTarget && (
        <Modal
          isOpen={true}
          onClose={() => setDismissTarget(null)}
          title="Dismiss Perimeter Alert"
        >
          <div className="space-y-4">
            <p className="text-xs text-[#6C727A]">
              Select dismissal rationale for audit trail compliance.
            </p>

            <select
              value={dismissReason}
              onChange={(e) => setDismissReason(e.target.value)}
              className="w-full h-8 text-xs bg-[#0F1115] border border-[#23262B] rounded px-2 text-white"
            >
              <option value="False Positive - Verified Environmental">False Positive - Environmental</option>
              <option value="Authorized Activity - Verified Personnel">Authorized Personnel Activity</option>
              <option value="Duplicate Alert - Already Handled">Duplicate Event</option>
              <option value="Sensor Calibration / Test Event">Sensor Test Event</option>
            </select>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#23262B]">
              <Button variant="ghost" size="sm" onClick={() => setDismissTarget(null)}>
                Cancel
              </Button>
              <Button variant="danger" size="sm" onClick={handleConfirmDismiss}>
                Confirm Dismissal
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
