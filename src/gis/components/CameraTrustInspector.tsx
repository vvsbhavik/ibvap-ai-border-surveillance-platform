import React, { useState, useEffect } from 'react';
import {
  Shield,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Activity,
  Sliders,
  Radio,
  Eye,
  RotateCcw,
} from 'lucide-react';
import { Camera } from '../../server/types';
import { CameraTrustEvaluation } from '../../camera-trust/types';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';

interface CameraTrustInspectorProps {
  camera: Camera;
  onClose?: () => void;
  onSelectFeed?: (camera: Camera) => void;
}

export const CameraTrustInspector: React.FC<CameraTrustInspectorProps> = ({
  camera,
  onClose,
  onSelectFeed,
}) => {
  const [evaluation, setEvaluation] = useState<CameraTrustEvaluation | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const fetchEvaluation = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/v1/camera-trust/${camera.cameraId}`);
      if (!res.ok) return;
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) return;
      const json = await res.json();
      if (json.success && json.evaluation) {
        setEvaluation(json.evaluation);
      }
    } catch {
      // Gracefully handle transient network or rate limits
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvaluation();
    const interval = setInterval(fetchEvaluation, 15000);
    return () => clearInterval(interval);
  }, [camera.cameraId]);

  const handleSimulateState = async (options: {
    streamState?: string;
    frameAgeMs?: number;
    isFrozen?: boolean;
    azimuthShift?: boolean;
  }) => {
    try {
      setActionLoading(true);
      const res = await fetch(`/api/v1/camera-trust/${camera.cameraId}/set-state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options),
      });
      const json = await res.json();
      if (json.success && json.evaluation) {
        setEvaluation(json.evaluation);
        setStatusMessage(json.message);
        setTimeout(() => setStatusMessage(null), 4000);
      }
    } catch (err: any) {
      setStatusMessage(`Error: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleReset = async () => {
    try {
      setActionLoading(true);
      const res = await fetch(`/api/v1/camera-trust/${camera.cameraId}/reset`, {
        method: 'POST',
      });
      const json = await res.json();
      if (json.success && json.evaluation) {
        setEvaluation(json.evaluation);
        setStatusMessage(json.message);
        setTimeout(() => setStatusMessage(null), 4000);
      }
    } catch (err: any) {
      setStatusMessage(`Error: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const scoreColor =
    !evaluation
      ? 'text-[#A9ACB1]'
      : evaluation.trustScore >= 85
      ? 'text-[#34C759]'
      : evaluation.trustScore >= 65
      ? 'text-[#FF9500]'
      : 'text-[#FF4D4D]';

  const scoreBg =
    !evaluation
      ? 'bg-[#14161A]'
      : evaluation.trustScore >= 85
      ? 'bg-[#34C759]/10 border-[#34C759]/30'
      : evaluation.trustScore >= 65
      ? 'bg-[#FF9500]/10 border-[#FF9500]/30'
      : 'bg-[#FF4D4D]/10 border-[#FF4D4D]/30';

  return (
    <div className="bg-[#0F1115] border border-[#23262B] rounded-lg p-4 space-y-4 text-xs font-sans">
      {/* Header */}
      <div className="flex items-start justify-between border-b border-[#23262B] pb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono-num font-bold text-[#007AFF] text-sm">
              {camera.identifier || camera.cameraId}
            </span>
            <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-[#14161A] text-[#A9ACB1] border border-[#23262B]">
              {camera.sectorName || 'Sector Unknown'}
            </span>
          </div>
          <h3 className="text-white font-medium text-xs mt-0.5">{camera.name}</h3>
        </div>
        <button
          onClick={fetchEvaluation}
          disabled={loading}
          className="p-1.5 text-[#6C727A] hover:text-white rounded hover:bg-[#1A1D23] transition-colors"
          title="Refresh trust telemetry"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Trust Score & Structured Integrity Status */}
      {evaluation ? (
        <div className="space-y-3">
          <div className={`p-3 rounded border flex items-center justify-between ${scoreBg}`}>
            <div>
              <div className="text-[11px] font-mono-num font-semibold uppercase tracking-wider text-[#A9ACB1]">
                Operational Trust Score
              </div>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className={`text-2xl font-mono-num font-bold ${scoreColor}`}>
                  {evaluation.trustScore}
                </span>
                <span className="text-[11px] font-mono-num text-[#6C727A]">/ 100</span>
                <span className="text-[10px] font-mono-num px-1.5 py-0.5 rounded bg-[#0A0B0D] text-[#A9ACB1] border border-[#23262B]">
                  {evaluation.trustLevel.replace('_', ' ')}
                </span>
              </div>
            </div>

            <div className="text-right">
              <span
                className={`inline-block px-2 py-1 text-[10px] font-mono-num font-bold rounded ${
                  evaluation.status === 'HEALTHY'
                    ? 'bg-[#34C759]/20 text-[#34C759] border border-[#34C759]/40'
                    : evaluation.status === 'INTEGRITY_ANOMALY'
                    ? 'bg-[#FF4D4D]/20 text-[#FF4D4D] border border-[#FF4D4D]/40 animate-pulse'
                    : evaluation.status === 'OFFLINE'
                    ? 'bg-[#6C727A]/20 text-[#A9ACB1] border border-[#6C727A]/40'
                    : 'bg-[#FF9500]/20 text-[#FF9500] border border-[#FF9500]/40'
                }`}
              >
                {evaluation.status}
              </span>
            </div>
          </div>

          {evaluation.isVerificationRequired && (
            <div className="p-2.5 rounded bg-[#FF4D4D]/15 border border-[#FF4D4D]/40 flex items-center gap-2 text-[#FF4D4D]">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span className="text-[11px] font-medium leading-tight">
                CAMERA INTEGRITY ANOMALY — VERIFICATION REQUIRED
              </span>
            </div>
          )}

          {/* Explainable Reasoning Factors (5 Factors) */}
          <div>
            <h4 className="text-[11px] font-semibold text-[#A9ACB1] uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-[#007AFF]" />
              Explainable Trust Reasoning
            </h4>
            <div className="space-y-2">
              {evaluation.factors.map((factor) => (
                <div
                  key={factor.factorKey}
                  className="p-2 bg-[#14161A] border border-[#23262B] rounded text-[11px]"
                >
                  <div className="flex items-center justify-between font-mono-num">
                    <span className="text-white font-medium flex items-center gap-1.5">
                      {factor.status === 'OPTIMAL' ? (
                        <CheckCircle2 className="w-3 h-3 text-[#34C759]" />
                      ) : factor.status === 'FAILED' ? (
                        <XCircle className="w-3 h-3 text-[#FF4D4D]" />
                      ) : (
                        <AlertTriangle className="w-3 h-3 text-[#FF9500]" />
                      )}
                      {factor.factorName}
                    </span>
                    <span className="text-[#6C727A]">
                      Weight: {(factor.weight * 100).toFixed(0)}%
                      {factor.deductionPoints > 0 && (
                        <span className="text-[#FF4D4D] ml-1.5">
                          (-{factor.deductionPoints} pts)
                        </span>
                      )}
                    </span>
                  </div>
                  <p className="text-[10px] text-[#A9ACB1] mt-1 leading-normal">
                    {factor.observableEvidence}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Measurable Telemetry Table */}
          <div>
            <h4 className="text-[11px] font-semibold text-[#A9ACB1] uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-[#34C759]" />
              Measurable Telemetry
            </h4>
            <div className="bg-[#14161A] border border-[#23262B] rounded p-2.5 font-mono-num text-[11px] space-y-1.5">
              <div className="flex justify-between">
                <span className="text-[#6C727A]">Frame Age:</span>
                <span className="text-white">
                  {evaluation.measurableTelemetry.frameAgeMs !== null
                    ? `${evaluation.measurableTelemetry.frameAgeMs} ms`
                    : 'NOT AVAILABLE'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#6C727A]">Stream State:</span>
                <span
                  className={
                    evaluation.measurableTelemetry.streamState === 'STREAM_AVAILABLE'
                      ? 'text-[#34C759]'
                      : 'text-[#FF4D4D]'
                  }
                >
                  {evaluation.measurableTelemetry.streamState}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#6C727A]">Reconnects (Session/5m):</span>
                <span className="text-white">
                  {evaluation.measurableTelemetry.reconnectCount} /{' '}
                  {evaluation.measurableTelemetry.recentReconnectsLast5Min}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#6C727A]">Resolution:</span>
                <span className="text-white">
                  {evaluation.measurableTelemetry.currentResolution}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#6C727A]">Processing State:</span>
                <span className="text-white">
                  {evaluation.measurableTelemetry.processingState}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#6C727A]">Frozen Frame Check:</span>
                <span
                  className={
                    evaluation.measurableTelemetry.isFrozenFrameDetected
                      ? 'text-[#FF4D4D]'
                      : 'text-[#34C759]'
                  }
                >
                  {evaluation.measurableTelemetry.isFrozenFrameDetected
                    ? `DETECTED (${evaluation.measurableTelemetry.repeatedFrameCount} repeats)`
                    : 'CLEAN'}
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-4 text-center text-[#6C727A]">Loading trust evaluation...</div>
      )}

      {/* Diagnostics / Drill Injects */}
      <div className="pt-2 border-t border-[#23262B]">
        <h4 className="text-[11px] font-semibold text-[#A9ACB1] uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Sliders className="w-3.5 h-3.5 text-[#FF9500]" />
          Diagnostics & Drill Injects
        </h4>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            onClick={() => handleSimulateState({ streamState: 'STREAM_UNAVAILABLE' })}
            disabled={actionLoading}
            className="px-2 py-1.5 bg-[#14161A] hover:bg-[#1A1D23] border border-[#23262B] text-[11px] font-mono-num text-[#FF4D4D] rounded text-left transition-colors"
          >
            Stream Loss (Offline)
          </button>
          <button
            onClick={() => handleSimulateState({ streamState: 'STREAM_AVAILABLE', frameAgeMs: 6500 })}
            disabled={actionLoading}
            className="px-2 py-1.5 bg-[#14161A] hover:bg-[#1A1D23] border border-[#23262B] text-[11px] font-mono-num text-[#FF9500] rounded text-left transition-colors"
          >
            Stale Ingest Feed
          </button>
          <button
            onClick={() => handleSimulateState({ streamState: 'STREAM_AVAILABLE', isFrozen: true })}
            disabled={actionLoading}
            className="px-2 py-1.5 bg-[#14161A] hover:bg-[#1A1D23] border border-[#23262B] text-[11px] font-mono-num text-[#FF4D4D] rounded text-left transition-colors"
          >
            Frozen Frame Anomaly
          </button>
          <button
            onClick={handleReset}
            disabled={actionLoading}
            className="px-2 py-1.5 bg-[#14161A] hover:bg-[#1A1D23] border border-[#23262B] text-[11px] font-mono-num text-[#34C759] rounded text-left flex items-center gap-1 transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            Restore Health
          </button>
        </div>
        {statusMessage && (
          <div className="mt-2 text-[10px] font-mono-num text-[#34C759] bg-[#34C759]/10 border border-[#34C759]/20 p-1.5 rounded">
            {statusMessage}
          </div>
        )}
      </div>

      {/* Switch to Live Feed Button */}
      {onSelectFeed && (
        <Button
          variant="primary"
          size="sm"
          className="w-full"
          onClick={() => onSelectFeed(camera)}
          leftIcon={<Eye className="w-3.5 h-3.5" />}
        >
          Open Camera Live Feed
        </Button>
      )}
    </div>
  );
};
