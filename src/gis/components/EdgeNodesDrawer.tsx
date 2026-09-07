import React, { useState, useEffect } from 'react';
import {
  Server,
  Wifi,
  WifiOff,
  RefreshCw,
  HardDrive,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Zap,
} from 'lucide-react';
import { EdgeNode, EdgeSyncResult } from '../../edge/types';
import { Button } from '../../components/ui/Button';

interface EdgeNodesDrawerProps {
  onStatusChanged?: () => void;
}

export const EdgeNodesDrawer: React.FC<EdgeNodesDrawerProps> = ({
  onStatusChanged,
}) => {
  const [nodes, setNodes] = useState<EdgeNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<EdgeSyncResult | null>(null);

  const fetchNodes = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/v1/edge/nodes');
      const json = await res.json();
      if (json.success && json.nodes) {
        setNodes(json.nodes);
      }
    } catch (err) {
      console.error('Failed to fetch edge nodes', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNodes();
    const interval = setInterval(fetchNodes, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleDisconnect = async (edgeNodeId: string) => {
    try {
      setActionLoading(edgeNodeId);
      const res = await fetch(`/api/v1/edge/nodes/${edgeNodeId}/simulate-disconnect`, {
        method: 'POST',
      });
      const json = await res.json();
      if (json.success) {
        await fetchNodes();
        onStatusChanged?.();
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handleReconnectAndSync = async (edgeNodeId: string) => {
    try {
      setActionLoading(edgeNodeId);
      const res = await fetch(`/api/v1/edge/nodes/${edgeNodeId}/simulate-reconnect`, {
        method: 'POST',
      });
      const json = await res.json();
      if (json.success && json.result) {
        setSyncResult(json.result);
        await fetchNodes();
        onStatusChanged?.();
        setTimeout(() => setSyncResult(null), 5000);
      }
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="bg-[#0F1115] border border-[#23262B] rounded-lg p-4 space-y-4 text-xs font-sans">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#23262B] pb-3">
        <div className="flex items-center gap-2">
          <Server className="w-4 h-4 text-[#007AFF]" />
          <h3 className="text-white font-semibold text-xs">Edge Node Resilience & Offline Buffers</h3>
        </div>
        <span className="px-2 py-0.5 text-[10px] font-mono-num font-bold bg-[#007AFF]/15 text-[#007AFF] border border-[#007AFF]/30 rounded">
          SIMULATED EDGE NODE ARCHITECTURE
        </span>
      </div>

      {syncResult && (
        <div className="p-2.5 bg-[#34C759]/15 border border-[#34C759]/30 rounded text-[#34C759] font-mono-num text-[11px] space-y-1">
          <div className="font-bold flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Deduplicated Edge Synchronization Completed
          </div>
          <div className="text-[10px] text-[#A9ACB1]">
            Synced: {syncResult.syncedEventsCount} events · Deduplicated: {syncResult.deduplicatedCount} · Duration: {syncResult.syncDurationMs}ms
          </div>
        </div>
      )}

      {/* Edge Nodes List */}
      <div className="space-y-3">
        {nodes.map((node) => {
          const isOffline = node.connectivityState === 'OFFLINE';
          const isSyncing = node.connectivityState === 'SYNCING';
          const isOnline = node.connectivityState === 'ONLINE';

          return (
            <div
              key={node.edgeNodeId}
              className="p-3 bg-[#14161A] border border-[#23262B] rounded space-y-2.5"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono-num font-bold text-white text-xs">
                      {node.edgeNodeId}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 text-[10px] font-mono-num font-semibold rounded ${
                        isOnline
                          ? 'bg-[#34C759]/20 text-[#34C759] border border-[#34C759]/40'
                          : isSyncing
                          ? 'bg-[#007AFF]/20 text-[#007AFF] border border-[#007AFF]/40 animate-pulse'
                          : 'bg-[#FF4D4D]/20 text-[#FF4D4D] border border-[#FF4D4D]/40'
                      }`}
                    >
                      {node.connectivityState}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#6C727A] mt-0.5">{node.name}</p>
                </div>
              </div>

              {/* Hardware Profile & Camera Coverage */}
              <div className="bg-[#0A0B0D] p-2 rounded border border-[#23262B] text-[10px] font-mono-num space-y-1 text-[#6C727A]">
                <div className="flex justify-between">
                  <span>Assigned Sensors:</span>
                  <span className="text-[#007AFF]">{node.assignedCameras.join(', ')}</span>
                </div>
                <div className="flex justify-between">
                  <span>Local Queue Length:</span>
                  <span className={node.bufferState.queueLength > 0 ? 'text-[#FF9500] font-bold' : 'text-white'}>
                    {node.bufferState.queueLength} / {node.bufferState.maxQueueSize} events
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Dropped (Buffer Full):</span>
                  <span className="text-white">{node.bufferState.droppedEventsCount}</span>
                </div>
                <div className="flex justify-between">
                  <span>Last Sync:</span>
                  <span className="text-white">
                    {new Date(node.lastSyncTimestamp).toLocaleTimeString()}
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-1">
                {isOnline ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 text-[#FF4D4D] hover:bg-[#FF4D4D]/10 hover:border-[#FF4D4D]/40"
                    onClick={() => handleDisconnect(node.edgeNodeId)}
                    disabled={actionLoading === node.edgeNodeId}
                    leftIcon={<WifiOff className="w-3 h-3" />}
                  >
                    Simulate WAN Outage
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    size="sm"
                    className="flex-1"
                    onClick={() => handleReconnectAndSync(node.edgeNodeId)}
                    disabled={actionLoading === node.edgeNodeId}
                    leftIcon={<RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />}
                  >
                    {isSyncing ? 'Synchronizing...' : 'Reconnect & Sync Queue'}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
