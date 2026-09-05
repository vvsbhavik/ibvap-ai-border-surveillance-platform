import React, { useState, useEffect } from 'react';
import { Maximize2, AlertTriangle, Radio, UserCheck, Compass } from 'lucide-react';
import { Camera, SpatialZone } from '../../server/types';
import { formatFps, formatLatency } from '../../utils/formatters';
import { api } from '../../api/client';
import { NormalizedDetection, AiSubsystemHealth } from '../../ai-inference/types';
import { Track } from '../../tracking/types';
import { DetectionOverlay } from './DetectionOverlay';

export interface CameraTileProps {
  camera: Camera;
  isSelected?: boolean;
  onSelect?: (camera: Camera) => void;
  onMaximize?: (camera: Camera) => void;
  showAiOverlays?: boolean;
  showZones?: boolean;
  showTrackId?: boolean;
  showTrajectory?: boolean;
  showDirection?: boolean;
  showState?: boolean;
  filterState?: 'ALL' | 'ACTIVE' | 'LOST';
  compact?: boolean;
  className?: string;
}

export const CameraTile: React.FC<CameraTileProps> = ({
  camera,
  isSelected = false,
  onSelect,
  onMaximize,
  showAiOverlays = true,
  showZones = true,
  showTrackId = true,
  showTrajectory = true,
  showDirection = true,
  showState = true,
  filterState = 'ALL',
  compact = false,
  className = '',
}) => {
  const [frameDataUri, setFrameDataUri] = useState<string | null>(null);
  const [detections, setDetections] = useState<NormalizedDetection[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [spatialZones, setSpatialZones] = useState<SpatialZone[]>([]);
  const [aiHealth, setAiHealth] = useState<AiSubsystemHealth | null>(null);

  const isOffline = camera.status === 'OFFLINE' || camera.connectionStatus === 'DISCONNECTED';
  const isDegraded = camera.status === 'DEGRADED' || camera.status === 'INTEGRITY_ANOMALY';
  const isHealthy = camera.status === 'ONLINE' && camera.connectionStatus !== 'DISCONNECTED';

  // Acquire active frame preview, genuine AI detections, real multi-object tracks, and spatial zones
  useEffect(() => {
    let isMounted = true;
    if (isOffline) {
      setFrameDataUri(null);
      setDetections([]);
      setTracks([]);
      setSpatialZones([]);
      return;
    }

    const fetchFrameAndDetections = async () => {
      try {
        const camKey = camera.cameraId || camera.id;
        const [frameRes, detRes, trackRes, zonesRes] = await Promise.allSettled([
          api.video.getFrame(camera.id),
          api.detections.getCameraDetections(camera.id),
          api.tracks.getCameraTracks(camera.id),
          api.zones.getCameraZones(camKey),
        ]);

        if (!isMounted) return;

        if (frameRes.status === 'fulfilled' && frameRes.value?.frame?.dataUri) {
          setFrameDataUri(frameRes.value.frame.dataUri);
        }

        if (detRes.status === 'fulfilled' && detRes.value?.activeDetections) {
          setDetections(detRes.value.activeDetections);
        }

        if (trackRes.status === 'fulfilled' && trackRes.value?.activeTracks) {
          setTracks(trackRes.value.activeTracks);
        }

        if (zonesRes.status === 'fulfilled' && zonesRes.value?.zones) {
          setSpatialZones(zonesRes.value.zones);
        }
      } catch {
        // Fallback silently if gateway is busy
      }
    };

    fetchFrameAndDetections();
    const interval = setInterval(fetchFrameAndDetections, 1500);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [camera.id, isOffline]);

  const statusLabel = isHealthy
    ? 'Live'
    : camera.status === 'INTEGRITY_ANOMALY'
    ? 'Integrity Anomaly'
    : isDegraded
    ? 'Degraded'
    : 'Offline';

  const statusDotColor = isHealthy
    ? 'bg-[#34C759]'
    : isDegraded
    ? 'bg-[#FF9500]'
    : 'bg-[#FF4D4D]';

  return (
    <div
      onClick={() => onSelect?.(camera)}
      className={`group flex flex-col bg-[#0F1115] border ${
        isSelected ? 'border-[#007AFF] shadow-sm shadow-[#007AFF]/20' : 'border-[#23262B] hover:border-[#3A3F4A]'
      } rounded overflow-hidden cursor-pointer transition-all ${className}`}
    >
      {/* 1. TOP: CAMERA ID & NAME */}
      <div className="p-2.5 bg-[#14161A] border-b border-[#23262B] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-2 h-2 rounded-full shrink-0 ${statusDotColor}`} />
          <span className="font-mono-num font-bold text-xs text-white">
            {camera.identifier || camera.cameraId}
          </span>
          <span className="text-xs text-[#6C727A] truncate">
            {camera.name}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {!isOffline && camera.currentFps !== undefined && (
            <span className="text-[10px] font-mono-num text-[#6C727A]">
              {formatFps(camera.currentFps)}
              {camera.currentLatencyMs ? ` · ${formatLatency(camera.currentLatencyMs)}` : ''}
            </span>
          )}
          {onMaximize && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMaximize(camera);
              }}
              className="p-1 text-[#6C727A] hover:text-white rounded hover:bg-[#23262B] transition-colors"
              title="Maximize feed"
            >
              <Maximize2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* 2. MIDDLE: VIDEO VIEWPORT */}
      <div className="relative aspect-video bg-black overflow-hidden flex items-center justify-center">
        {isOffline ? (
          <div className="flex flex-col items-center justify-center text-center p-4">
            <AlertTriangle className="w-6 h-6 text-[#FF4D4D] mb-1.5 opacity-80" />
            <span className="text-xs font-medium text-[#FF4D4D]">Signal Lost</span>
            <span className="text-[10px] text-[#6C727A] mt-0.5 font-mono-num">
              {camera.model || 'Perimeter Optical Sensor'}
            </span>
          </div>
        ) : (
          <>
            {/* Live Video Gateway Frame */}
            {frameDataUri ? (
              <img
                src={frameDataUri}
                alt={camera.name}
                className="w-full h-full object-cover select-none pointer-events-none"
              />
            ) : (
              <div className="absolute inset-0 bg-[#06080A] flex items-center justify-center">
                <div className="flex items-center gap-2 text-[#6C727A] text-xs font-mono">
                  <Radio className="w-3.5 h-3.5 animate-pulse text-[#007AFF]" />
                  <span>Connecting to Gateway...</span>
                </div>
              </div>
            )}

            {/* Mandatory Simulation Watermark Badge (Section 4 & 24) */}
            {camera.isSimulated !== false && (
              <div className="absolute top-1.5 right-1.5 z-10 px-1.5 py-0.5 bg-[#DC2626]/80 text-white rounded border border-[#EF4444]/60 text-[9px] font-mono font-bold tracking-tight shadow-xs">
                SIMULATED RTSP FEED
              </div>
            )}

            {/* Genuine Computer Vision AI Bounding Box & Multi-Object Tracking Overlays */}
            {showAiOverlays && (
              <DetectionOverlay
                detections={detections}
                tracks={tracks}
                zones={spatialZones}
                showZones={showZones}
                aiHealth={aiHealth}
                aiPipelineEnabled={camera.aiPipelineEnabled}
                isOffline={isOffline}
                showTrackId={showTrackId}
                showTrajectory={showTrajectory}
                showDirection={showDirection}
                showState={showState}
                filterState={filterState}
              />
            )}
          </>
        )}
      </div>

      {/* 3. BOTTOM: CURRENT STATE & AI STATUS */}
      <div className="p-2 bg-[#14161A] border-t border-[#23262B] flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-[#E0E2E6]">{statusLabel}</span>
          {camera.sectorName && (
            <span className="text-[11px] text-[#6C727A]">· {camera.sectorName}</span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {camera.protocol && (
            <span className="text-[10px] font-mono px-1 py-0.5 rounded bg-[#23262B] text-[#A9ACB1]">
              {camera.protocol}
            </span>
          )}
          {camera.aiPipelineEnabled ? (
            tracks.length > 0 ? (
              <span className="text-[10px] text-[#38BDF8] font-bold flex items-center gap-1 font-mono">
                <Compass className="w-3 h-3 text-[#38BDF8]" />
                {tracks.length} {tracks.length === 1 ? 'Track' : 'Tracks'}
              </span>
            ) : detections.length > 0 ? (
              <span className="text-[10px] text-[#F59E0B] font-bold flex items-center gap-1">
                <UserCheck className="w-3 h-3 text-[#F59E0B]" />
                {detections.length} {detections.length === 1 ? 'Person' : 'Persons'}
              </span>
            ) : (
              <span className="text-[10px] text-[#10B981] font-medium">Tracking Active</span>
            )
          ) : (
            <span className="text-[10px] text-[#6C727A]">AI Standby</span>
          )}
        </div>
      </div>
    </div>
  );
};
