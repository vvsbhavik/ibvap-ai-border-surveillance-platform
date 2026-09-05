import React, { useState } from 'react';
import {
  ShieldAlert,
  AlertTriangle,
  Camera as CameraIcon,
  Activity,
  ArrowRight,
  Maximize2,
  CheckCircle2,
  Clock,
  MapPin,
  Play,
} from 'lucide-react';
import { Camera, Alert, Incident } from '../server/types';
import { CameraTile } from '../components/camera/CameraTile';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Drawer } from '../components/ui/Drawer';
import { ExplainableReasoning } from '../components/ai/ExplainableReasoning';
import { tokens } from '../design-system/tokens';
import { formatTimestamp, formatPercentage } from '../utils/formatters';

export interface DashboardScreenProps {
  cameras: Camera[];
  alerts: Alert[];
  incidents: Incident[];
  selectedSector: string;
  onAcknowledgeAlert: (alertId: string) => void;
  onEscalateAlert: (alert: Alert) => void;
  onDismissAlert: (alertId: string) => void;
  onNavigateToScreen: (screen: string) => void;
  onSelectCamera: (camera: Camera) => void;
  onRunSimulation: () => void;
}

export const DashboardScreen: React.FC<DashboardScreenProps> = ({
  cameras,
  alerts,
  incidents,
  selectedSector,
  onAcknowledgeAlert,
  onEscalateAlert,
  onDismissAlert,
  onNavigateToScreen,
  onSelectCamera,
  onRunSimulation,
}) => {
  const [inspectingAlert, setInspectingAlert] = useState<Alert | null>(null);
  const [maximizedCamera, setMaximizedCamera] = useState<Camera | null>(null);

  // Operational metrics
  const activeAlerts = alerts.filter((a) => a.status === 'PENDING_ACK');
  const criticalAlerts = alerts.filter(
    (a) => a.severity === 'CRITICAL' && a.status === 'PENDING_ACK'
  );
  const activeIncidents = incidents.filter(
    (i) => i.status === 'OPEN' || i.status === 'INVESTIGATING'
  );
  const onlineCameras = cameras.filter((c) => c.status === 'ONLINE').length;
  const cameraUptimePct = cameras.length > 0 ? (onlineCameras / cameras.length) * 100 : 100;

  // Filter cameras to top priority feeds for surveillance workspace
  const priorityCameras = [...cameras]
    .sort((a, b) => {
      if (a.status === 'INTEGRITY_ANOMALY') return -1;
      if (b.status === 'INTEGRITY_ANOMALY') return 1;
      if (a.status === 'DEGRADED') return -1;
      if (b.status === 'DEGRADED') return 1;
      return 0;
    })
    .slice(0, 4);

  // Sort alerts: CRITICAL first, then HIGH, then others
  const sortedPriorityAlerts = [...alerts]
    .filter((a) => a.status === 'PENDING_ACK')
    .sort((a, b) => {
      const weight: Record<string, number> = { CRITICAL: 3, HIGH: 2, MEDIUM: 1, LOW: 0 };
      return (weight[b.severity] || 0) - (weight[a.severity] || 0);
    });

  return (
    <div className="flex-1 flex flex-col gap-5 overflow-y-auto p-4 sm:p-5 select-none">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#23262B] pb-3 shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-semibold text-white tracking-tight">Dashboard</h1>
            <span className="px-1.5 py-0.5 text-[10px] font-mono-num font-semibold bg-[#007AFF]/15 text-[#007AFF] border border-[#007AFF]/30 rounded">
              SIMULATED DATA
            </span>
          </div>
          <p className="text-xs text-[#6C727A] mt-0.5">
            Operational command overview, perimeter alert triage, and sensor health telemetry
          </p>
        </div>
      </div>

      {/* 1. OPERATIONAL SUMMARY (4 PRIMARY METRICS) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Active Alerts */}
        <div className="p-3.5 bg-[#0F1115] border border-[#23262B] rounded flex flex-col justify-between">
          <div className="flex items-center justify-between text-[#6C727A]">
            <span className="text-xs font-medium">Active Alerts</span>
            <AlertTriangle className="w-4 h-4 text-[#FF9500]" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono-num text-white">
              {activeAlerts.length}
            </span>
            {criticalAlerts.length > 0 ? (
              <span className="text-xs font-semibold text-[#FF4D4D]">
                {criticalAlerts.length} High Priority
              </span>
            ) : (
              <span className="text-xs text-[#6C727A]">Normal</span>
            )}
          </div>
        </div>

        {/* Active Incidents */}
        <div className="p-3.5 bg-[#0F1115] border border-[#23262B] rounded flex flex-col justify-between">
          <div className="flex items-center justify-between text-[#6C727A]">
            <span className="text-xs font-medium">Active Incidents</span>
            <ShieldAlert className="w-4 h-4 text-[#FF4D4D]" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono-num text-white">
              {activeIncidents.length}
            </span>
            <span className="text-xs text-[#007AFF] font-medium">
              {incidents.filter((i) => i.status === 'INVESTIGATING').length} In Progress
            </span>
          </div>
        </div>

        {/* Camera Health */}
        <div className="p-3.5 bg-[#0F1115] border border-[#23262B] rounded flex flex-col justify-between">
          <div className="flex items-center justify-between text-[#6C727A]">
            <span className="text-xs font-medium">Camera Health</span>
            <CameraIcon className="w-4 h-4 text-[#34C759]" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono-num text-white">
              {onlineCameras}{' '}
              <span className="text-xs text-[#6C727A] font-normal font-sans">
                / {cameras.length}
              </span>
            </span>
            <span className="text-xs font-semibold text-[#34C759]">
              {formatPercentage(cameraUptimePct)} Available
            </span>
          </div>
        </div>

        {/* Sector Status */}
        <div className="p-3.5 bg-[#0F1115] border border-[#23262B] rounded flex flex-col justify-between">
          <div className="flex items-center justify-between text-[#6C727A]">
            <span className="text-xs font-medium">Sector Status</span>
            <Activity className="w-4 h-4 text-[#007AFF]" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-sm font-semibold text-white truncate max-w-[120px]">
              {selectedSector === 'ALL' ? 'All Sectors' : selectedSector}
            </span>
            <span className="text-xs text-[#34C759] font-medium flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#34C759]" />
              Nominal
            </span>
          </div>
        </div>
      </div>

      {/* 2 & 3: PRIORITY SURVEILLANCE & PRIORITY ALERTS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* 2. PRIORITY SURVEILLANCE (7 COLS) */}
        <div className="lg:col-span-7 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-white">Priority Surveillance</h2>
              <p className="text-xs text-[#6C727A]">
                Real-time operational streams prioritized by anomaly and alert activity
              </p>
            </div>
            <Button
              variant="subtle"
              size="sm"
              onClick={() => onNavigateToScreen('live')}
              rightIcon={<ArrowRight className="w-3 h-3" />}
            >
              All Cameras
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {priorityCameras.map((cam) => (
              <CameraTile
                key={cam.id}
                camera={cam}
                onSelect={onSelectCamera}
                onMaximize={(c) => setMaximizedCamera(c)}
              />
            ))}
          </div>
        </div>

        {/* 3. PRIORITY ALERTS QUEUE (5 COLS) */}
        <div className="lg:col-span-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-white">Priority Alerts</h2>
              {activeAlerts.length > 0 && (
                <span className="text-xs font-mono-num font-semibold px-2 py-0.5 bg-[#FF4D4D]/20 text-[#FF4D4D] border border-[#FF4D4D]/30 rounded">
                  {activeAlerts.length} Pending
                </span>
              )}
            </div>
            <Button
              variant="subtle"
              size="sm"
              onClick={() => onNavigateToScreen('alerts')}
              rightIcon={<ArrowRight className="w-3 h-3" />}
            >
              Alert Center
            </Button>
          </div>

          {/* Simple Vertical Queue */}
          <div className="space-y-2.5 max-h-[520px] overflow-y-auto pr-1">
            {sortedPriorityAlerts.length === 0 ? (
              <div className="p-8 text-center bg-[#0F1115] border border-[#23262B] rounded text-xs text-[#6C727A]">
                No pending priority alerts. All perimeter sectors quiet.
              </div>
            ) : (
              sortedPriorityAlerts.map((alert, idx) => {
                const isCritical = alert.severity === 'CRITICAL';
                const isTopPriority = idx === 0 && isCritical;

                return (
                  <div
                    key={alert.id}
                    onClick={() => setInspectingAlert(alert)}
                    className={`p-3.5 rounded border transition-all cursor-pointer ${
                      isTopPriority
                        ? 'bg-[#1C1314] border-[#FF4D4D] shadow-sm'
                        : isCritical
                        ? 'bg-[#14161A] border-[#FF4D4D]/50 hover:bg-[#1A1D23]'
                        : 'bg-[#14161A] border-[#23262B] hover:bg-[#1A1D23]'
                    }`}
                  >
                    {/* Header: Priority & Time */}
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-xs ${
                            isCritical
                              ? 'bg-[#FF4D4D] text-white'
                              : 'bg-[#FF9500] text-black'
                          }`}
                        >
                          {alert.severity} PRIORITY
                        </span>
                        <span className="text-xs font-mono-num text-[#6C727A]">
                          {alert.alertNumber}
                        </span>
                      </div>

                      <span className="text-xs font-mono-num text-[#6C727A]">
                        {formatTimestamp(alert.detectedAt || alert.timestamp, { format: 'time-only' })}
                      </span>
                    </div>

                    {/* Event Type / Title */}
                    <h3 className="text-sm font-semibold text-white mb-1">
                      {alert.title}
                    </h3>

                    {/* Camera & Location */}
                    <div className="text-xs text-[#E0E2E6] flex items-center gap-1.5 mb-3 font-mono-num">
                      <CameraIcon className="w-3.5 h-3.5 text-[#007AFF]" />
                      <span>{alert.cameraIdentifier}</span>
                      <span className="text-[#6C727A]">·</span>
                      <span className="text-[#6C727A]">{alert.sectorName}</span>
                    </div>

                    {/* Action Buttons */}
                    <div
                      className="flex items-center justify-end gap-2 pt-2 border-t border-[#23262B]"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        variant="subtle"
                        size="sm"
                        onClick={() => onAcknowledgeAlert(alert.id)}
                      >
                        Acknowledge
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => onEscalateAlert(alert)}
                      >
                        View Incident
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* 4. OPERATIONAL OVERVIEW (UNIFIED CONTAINER) */}
      <div className="bg-[#0F1115] border border-[#23262B] rounded p-4">
        <div className="flex items-center justify-between border-b border-[#23262B] pb-3 mb-4">
          <div>
            <h2 className="text-sm font-semibold text-white">Operational Overview</h2>
            <p className="text-xs text-[#6C727A]">
              System events, active perimeter containment, and sensor status summary
            </p>
          </div>

          <div className="flex items-center gap-2">
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          {/* Recent Events Column */}
          <div className="space-y-2">
            <h3 className="font-semibold text-white text-xs uppercase tracking-wider text-[#6C727A]">
              Recent Activity
            </h3>
            <div className="space-y-2">
              {alerts.slice(0, 3).map((a) => (
                <div
                  key={a.id}
                  className="p-2.5 bg-[#14161A] border border-[#23262B] rounded flex items-start justify-between gap-2"
                >
                  <div>
                    <div className="font-medium text-white">{a.title}</div>
                    <div className="text-[11px] text-[#6C727A] mt-0.5 font-mono-num">
                      {a.cameraIdentifier} · {a.sectorName}
                    </div>
                  </div>
                  <span className="text-[10px] text-[#6C727A] font-mono-num whitespace-nowrap">
                    {formatTimestamp(a.detectedAt || a.timestamp, { format: 'time-only' })}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Active Containment / Incidents Column */}
          <div className="space-y-2">
            <h3 className="font-semibold text-white text-xs uppercase tracking-wider text-[#6C727A]">
              Incident Containment
            </h3>
            <div className="space-y-2">
              {incidents.slice(0, 3).map((inc) => (
                <div
                  key={inc.id}
                  onClick={() => onNavigateToScreen('incidents')}
                  className="p-2.5 bg-[#14161A] border border-[#23262B] rounded cursor-pointer hover:bg-[#1A1D23] transition-colors"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-mono-num font-bold text-[#007AFF]">
                      {inc.incidentNumber}
                    </span>
                    <span className="text-[10px] uppercase font-semibold text-[#E0E2E6]">
                      {inc.status}
                    </span>
                  </div>
                  <div className="font-medium text-white truncate mt-1">{inc.title}</div>
                  <div className="text-[11px] text-[#6C727A] mt-0.5">
                    {inc.sectorName} · Primary: {inc.primaryCameraIdentifier}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Camera Health Distribution Column */}
          <div className="space-y-2">
            <h3 className="font-semibold text-white text-xs uppercase tracking-wider text-[#6C727A]">
              Camera Fleet Health
            </h3>
            <div className="p-3 bg-[#14161A] border border-[#23262B] rounded space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-white">
                  <span className="w-2 h-2 rounded-full bg-[#34C759]" />
                  Online & Streaming
                </span>
                <span className="font-mono-num font-bold text-white">
                  {onlineCameras}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-white">
                  <span className="w-2 h-2 rounded-full bg-[#FF9500]" />
                  Optical Anomaly / Degraded
                </span>
                <span className="font-mono-num font-bold text-[#FF9500]">
                  {cameras.filter((c) => c.status === 'INTEGRITY_ANOMALY' || c.status === 'DEGRADED').length}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-white">
                  <span className="w-2 h-2 rounded-full bg-[#FF4D4D]" />
                  Offline
                </span>
                <span className="font-mono-num font-bold text-[#FF4D4D]">
                  {cameras.filter((c) => c.status === 'OFFLINE').length}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Alert Inspection Drawer */}
      <Drawer
        isOpen={!!inspectingAlert}
        onClose={() => setInspectingAlert(null)}
        title={inspectingAlert ? `${inspectingAlert.alertNumber} — Alert Details` : ''}
        subtitle={inspectingAlert?.title}
      >
        {inspectingAlert && (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-[#0F1115] border border-[#23262B] rounded">
              <div>
                <span className="text-[11px] text-[#6C727A]">Camera Source</span>
                <div className="text-xs font-mono-num text-white font-semibold">
                  {inspectingAlert.cameraIdentifier}
                </div>
              </div>
              <Badge variant={inspectingAlert.severity === 'CRITICAL' ? 'critical' : 'attention'}>
                {inspectingAlert.severity} PRIORITY
              </Badge>
            </div>

            <p className="text-xs text-[#E0E2E6] leading-relaxed bg-[#14161A] p-3 border border-[#23262B] rounded">
              {inspectingAlert.description}
            </p>

            {/* Explainable Reasoning */}
            <ExplainableReasoning
              factors={inspectingAlert.reasoningFactors}
              confidenceScore={inspectingAlert.confidenceScore}
              isSimulation={inspectingAlert.isSimulation}
            />

            <div className="flex gap-2 pt-2 border-t border-[#23262B]">
              {inspectingAlert.status === 'PENDING_ACK' && (
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => {
                    onAcknowledgeAlert(inspectingAlert.id);
                    setInspectingAlert(null);
                  }}
                >
                  Acknowledge Alert
                </Button>
              )}
              <Button
                variant="primary"
                className="flex-1"
                onClick={() => {
                  onEscalateAlert(inspectingAlert);
                  setInspectingAlert(null);
                }}
              >
                Escalate to Incident
              </Button>
            </div>
          </div>
        )}
      </Drawer>

      {/* Maximized Camera Feed Modal */}
      {maximizedCamera && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="w-full max-w-4xl bg-[#0F1115] border border-[#23262B] rounded overflow-hidden flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#23262B] bg-[#14161A]">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold font-mono-num text-[#007AFF]">
                  {maximizedCamera.identifier}
                </span>
                <span className="text-xs font-semibold text-white">{maximizedCamera.name}</span>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setMaximizedCamera(null)}>
                Close
              </Button>
            </div>
            <div className="relative aspect-video bg-black flex items-center justify-center">
              <CameraTile camera={maximizedCamera} className="w-full h-full" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
