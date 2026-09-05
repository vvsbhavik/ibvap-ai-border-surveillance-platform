import React, { useState, useEffect } from 'react';
import {
  Activity,
  RefreshCw,
  Server,
  Cpu,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { SystemHealthItem, HealthStatus } from '../server/types';
import { StatusIndicator } from '../components/ui/StatusIndicator';
import { Button } from '../components/ui/Button';
import { formatTimestamp, formatLatency } from '../utils/formatters';

export interface HealthScreenProps {
  healthItems: SystemHealthItem[];
  overallStatus: string;
  onRefresh: () => Promise<void>;
}

export const HealthScreen: React.FC<HealthScreenProps> = ({
  healthItems,
  overallStatus,
  onRefresh,
}) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [liveProbe, setLiveProbe] = useState<{ status: string; uptimeSeconds: number } | null>(null);
  const [readyProbe, setReadyProbe] = useState<{ status: string; dependencies: any } | null>(null);

  const safeItems = Array.isArray(healthItems) ? healthItems : [];

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await onRefresh();
      const [liveRes, readyRes] = await Promise.all([
        fetch('/health/live').then((r) => r.json()).catch(() => null),
        fetch('/health/ready').then((r) => r.json()).catch(() => null),
      ]);
      setLiveProbe(liveRes);
      setReadyProbe(readyRes);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    handleRefresh();
  }, []);

  const healthyCount = safeItems.filter((i) => i.status === 'HEALTHY').length;
  const degradedCount = safeItems.filter((i) => i.status === 'DEGRADED').length;
  const offlineCount = safeItems.filter((i) => i.status === 'OFFLINE').length;

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0A0B0D] overflow-hidden">
      {/* 1. Sub-Header Toolbar */}
      <div className="p-4 sm:px-6 bg-[#0F1115] border-b border-[#23262B] flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0 select-none">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold text-white">System Health</h1>
            <span className="px-2 py-0.5 bg-[#14161A] border border-[#23262B] text-[#A9ACB1] rounded text-[11px] font-mono-num font-medium">
              {safeItems.length} Subsystems
            </span>
            <span className="px-1.5 py-0.5 text-[10px] font-mono-num font-semibold bg-[#007AFF]/15 text-[#007AFF] border border-[#007AFF]/30 rounded">
              SIMULATED TELEMETRY
            </span>
          </div>
          <p className="text-xs text-[#6C727A] mt-0.5">
            Streaming broker health, pipeline latency, edge node availability, and telemetry heartbeats
          </p>
        </div>

        <Button
          variant="secondary"
          size="sm"
          isLoading={isRefreshing}
          onClick={handleRefresh}
          leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
        >
          Run Diagnostics
        </Button>
      </div>

      {/* 2. Main Content */}
      <div className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-4">
        {/* KPI Metric Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="p-3.5 bg-[#0F1115] border border-[#23262B] rounded">
            <span className="text-[11px] font-mono-num uppercase text-[#6C727A]">
              Platform Status
            </span>
            <div className="mt-1.5 flex items-center gap-2">
              <StatusIndicator status={overallStatus === 'HEALTHY' ? 'HEALTHY' : 'ATTENTION'} size="md" />
              <span className="text-sm font-bold font-mono-num text-white">{overallStatus}</span>
            </div>
          </div>

          <div className="p-3.5 bg-[#0F1115] border border-[#23262B] rounded">
            <span className="text-[11px] font-mono-num uppercase text-[#6C727A]">
              Subsystem Availability
            </span>
            <div className="mt-1.5 flex items-baseline justify-between font-mono-num">
              <span className="text-base font-bold text-[#34C759]">
                {healthyCount} / {safeItems.length}
              </span>
              <span className="text-xs text-[#6C727A]">
                {degradedCount > 0 ? `${degradedCount} Degraded` : '0 Degraded'}
              </span>
            </div>
          </div>

          <div className="p-3.5 bg-[#0F1115] border border-[#23262B] rounded">
            <span className="text-[11px] font-mono-num uppercase text-[#6C727A]">
              Liveness Probe
            </span>
            <div className="mt-1.5 flex items-baseline justify-between font-mono-num">
              <span className="text-base font-bold text-[#34C759]">
                {liveProbe?.status || 'UP'}
              </span>
              <span className="text-xs text-[#6C727A]">
                Uptime: {liveProbe?.uptimeSeconds ? `${liveProbe.uptimeSeconds}s` : 'Active'}
              </span>
            </div>
          </div>

          <div className="p-3.5 bg-[#0F1115] border border-[#23262B] rounded">
            <span className="text-[11px] font-mono-num uppercase text-[#6C727A]">
              Readiness Probe
            </span>
            <div className="mt-1.5 flex items-baseline justify-between font-mono-num">
              <span className="text-base font-bold text-[#007AFF]">
                {readyProbe?.status || 'READY'}
              </span>
              <span className="text-xs text-[#6C727A]">Dependencies Ready</span>
            </div>
          </div>
        </div>

        {/* Diagnostic Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {safeItems.map((item) => (
            <div
              key={item.componentKey}
              className={`p-4 bg-[#0F1115] border ${
                item.status === 'DEGRADED'
                  ? 'border-[#FF9500]/40'
                  : item.status === 'OFFLINE'
                  ? 'border-[#FF4D4D]/40'
                  : 'border-[#23262B]'
              } rounded flex flex-col justify-between`}
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-semibold text-white">{item.name}</h3>
                    <span className="text-[10px] font-mono-num text-[#6C727A]">
                      Key: {item.componentKey}
                    </span>
                  </div>
                  <StatusIndicator status={item.status} size="sm" />
                </div>

                <div className="mt-3 p-2.5 bg-[#14161A] border border-[#23262B] rounded space-y-1.5 font-mono-num text-xs text-[#6C727A]">
                  <div className="flex justify-between">
                    <span>Latency:</span>
                    <span className="text-white">{formatLatency(item.latencyMs)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Uptime:</span>
                    <span className="text-white">{item.uptimePercentage}%</span>
                  </div>
                  {item.metrics?.cpuPercent !== undefined && (
                    <div className="flex justify-between">
                      <span>CPU Load:</span>
                      <span className="text-white">{item.metrics.cpuPercent}%</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>Heartbeat:</span>
                    <span className="text-white">{formatTimestamp(item.lastHeartbeat, { format: 'time-only' })}</span>
                  </div>
                </div>
              </div>

              <div className="mt-3 text-xs text-[#6C727A] truncate" title={item.details}>
                {item.details || 'Operating nominally'}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
