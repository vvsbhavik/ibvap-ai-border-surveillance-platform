import React, { useState, useEffect, useRef } from 'react';
import {
  Maximize2,
  AlertTriangle,
  Radio,
  UserCheck,
  Compass,
  Video,
  VideoOff,
  RefreshCw,
  Zap,
  Play,
  Square,
  Shield,
  Info,
} from 'lucide-react';
import { Camera, SpatialZone } from '../../server/types';
import { formatFps, formatLatency } from '../../utils/formatters';
import { api } from '../../api/client';
import { NormalizedDetection, AiSubsystemHealth } from '../../ai-inference/types';
import { Track } from '../../tracking/types';
import { DetectionOverlay } from './DetectionOverlay';
import { liveStreamManager, CameraLiveState } from '../../video-gateway/liveStreamManager';

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
  onModeChanged?: (camera: Camera) => void;
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
  onModeChanged,
}) => {
  const [frameDataUri, setFrameDataUri] = useState<string | null>(null);
  const [detections, setDetections] = useState<NormalizedDetection[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [spatialZones, setSpatialZones] = useState<SpatialZone[]>([]);
  const [aiHealth, setAiHealth] = useState<AiSubsystemHealth | null>(null);
  const [liveState, setLiveState] = useState<CameraLiveState>(() =>
    liveStreamManager.getState(camera.id)
  );
  const [isTogglingLive, setIsTogglingLive] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Normalize source mode: LIVE | SIMULATION | OFFLINE | UNAVAILABLE
  const effectiveMode: 'LIVE' | 'SIMULATION' | 'OFFLINE' | 'UNAVAILABLE' =
    camera.sourceMode ||
    (camera.status === 'OFFLINE'
      ? 'OFFLINE'
      : camera.status === 'DEGRADED'
      ? 'UNAVAILABLE'
      : camera.isSimulated !== false
      ? 'SIMULATION'
      : 'LIVE');

  const isOffline = effectiveMode === 'OFFLINE';
  const isUnavailable = effectiveMode === 'UNAVAILABLE';
  const isLive = effectiveMode === 'LIVE';
  const isSimulation = effectiveMode === 'SIMULATION';

  // Subscribe to live stream manager state
  useEffect(() => {
    const unsubscribe = liveStreamManager.subscribe((states) => {
      const s = states.get(camera.id);
      if (s) setLiveState(s);
    });
    return unsubscribe;
  }, [camera.id]);

  // Connect local media stream to video element when live webcam is active
  useEffect(() => {
    if (isLive && liveState.isStreaming && videoRef.current && liveState.mediaStream) {
      if (videoRef.current.srcObject !== liveState.mediaStream) {
        videoRef.current.srcObject = liveState.mediaStream;
        videoRef.current.play().catch((err) => console.warn('Tile video autoplay error:', err));
      }
    }
  }, [isLive, liveState.isStreaming, liveState.mediaStream]);

  // Poll video gateway for frames and CV detections
  useEffect(() => {
    let isMounted = true;
    if (isOffline || isUnavailable) {
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
          // Only fetch CV detections if in simulation or live AI enabled
          isSimulation
            ? api.detections.getCameraDetections(camera.id)
            : Promise.resolve({ activeDetections: [] as NormalizedDetection[] }),
          isSimulation
            ? api.tracks.getCameraTracks(camera.id)
            : Promise.resolve({ activeTracks: [] as Track[] }),
          api.zones.getCameraZones(camKey),
        ]);

        if (!isMounted) return;

        if (frameRes.status === 'fulfilled' && frameRes.value?.frame?.dataUri) {
          setFrameDataUri(frameRes.value.frame.dataUri);
        }

        if (detRes.status === 'fulfilled' && (detRes.value as any)?.activeDetections) {
          setDetections((detRes.value as any).activeDetections);
        } else if (isLive) {
          // Live camera without live model inference: no fake detections
          setDetections([]);
        }

        if (trackRes.status === 'fulfilled' && (trackRes.value as any)?.activeTracks) {
          setTracks((trackRes.value as any).activeTracks);
        } else if (isLive) {
          setTracks([]);
        }

        if (zonesRes.status === 'fulfilled' && (zonesRes.value as any)?.zones) {
          setSpatialZones((zonesRes.value as any).zones);
        }
      } catch {
        // Suppress transient gateway poll error
      }
    };

    fetchFrameAndDetections();
    // Fast polling for smoothly moving frames (500ms for active feeds)
    const interval = setInterval(fetchFrameAndDetections, isLive && liveState.isStreaming ? 1000 : 600);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [camera.id, isOffline, isUnavailable, isLive, isSimulation, liveState.isStreaming]);

  // Quick webcam toggle for live demonstration
  const handleToggleWebcam = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsTogglingLive(true);
    try {
      if (liveState.isStreaming) {
        liveStreamManager.stopWebcamStream(camera.id);
        // Switch back to simulation mode on backend
        await api.video.setSourceMode(camera.id, {
          sourceMode: 'SIMULATION',
          sourceType: 'SIMULATED',
          sourceAttribution: 'Synthetic Border Simulation',
        });
        if (onModeChanged) {
          onModeChanged({
            ...camera,
            sourceMode: 'SIMULATION',
            sourceType: 'SIMULATED',
            isSimulated: true,
          });
        }
      } else {
        // Start webcam stream
        await liveStreamManager.startWebcamStream(camera.id);
        // Inform backend that camera is now in genuine LIVE mode
        await api.video.setSourceMode(camera.id, {
          sourceMode: 'LIVE',
          sourceType: 'WEBCAM',
          sourceAttribution: 'Operator Station Live Camera Feed',
          aiProcessingStatus: 'UNAVAILABLE', // Truthful reporting
        });
        if (onModeChanged) {
          onModeChanged({
            ...camera,
            sourceMode: 'LIVE',
            sourceType: 'WEBCAM',
            isSimulated: false,
            sourceAttribution: 'Operator Station Live Camera Feed',
            aiProcessingStatus: 'UNAVAILABLE',
          });
        }
      }
    } catch (err: any) {
      console.error('Failed to toggle live webcam:', err);
    } finally {
      setIsTogglingLive(false);
    }
  };

  // Reconnect handler for OFFLINE or UNAVAILABLE states
  const handleReconnect = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsReconnecting(true);
    try {
      await api.video.reconnect(camera.id);
      // Restore stream to SIMULATION or LIVE
      await api.video.setSourceMode(camera.id, {
        sourceMode: 'SIMULATION',
        sourceType: 'SIMULATED',
      });
      if (onModeChanged) {
        onModeChanged({
          ...camera,
          status: 'ONLINE',
          sourceMode: 'SIMULATION',
        });
      }
    } catch (err) {
      console.warn('Reconnect failed:', err);
    } finally {
      setIsReconnecting(false);
    }
  };

  // Status labels & color indicators
  const statusLabel = isLive
    ? 'Live Stream'
    : isSimulation
    ? 'Simulated'
    : isUnavailable
    ? 'Unavailable'
    : 'Offline';

  const statusDotColor = isLive
    ? 'bg-[#34C759] shadow-xs shadow-[#34C759]/50 animate-pulse'
    : isSimulation
    ? 'bg-[#007AFF]'
    : isUnavailable
    ? 'bg-[#FF9500]'
    : 'bg-[#FF4D4D]';

  return (
    <div
      onClick={() => onSelect?.(camera)}
      className={`group flex flex-col bg-[#0F1115] border ${
        isSelected
          ? 'border-[#007AFF] shadow-md shadow-[#007AFF]/25'
          : isLive
          ? 'border-emerald-800/60 hover:border-emerald-500/80'
          : 'border-[#23262B] hover:border-[#3A3F4A]'
      } rounded overflow-hidden cursor-pointer transition-all ${className}`}
    >
      {/* 1. TOP HEADER: CAMERA IDENTIFIER, MODE BADGE, AND CONTROLS */}
      <div className="p-2 bg-[#14161A] border-b border-[#23262B] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-2 h-2 rounded-full shrink-0 ${statusDotColor}`} />
          <span className="font-mono-num font-bold text-xs text-white">
            {camera.identifier || camera.cameraId}
          </span>
          <span className="text-xs text-[#8A8F98] truncate">
            {camera.name}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* FPS & Latency Counter */}
          {!isOffline && !isUnavailable && (
            <span className="text-[10px] font-mono-num text-[#8A8F98]">
              {isLive && liveState.fps ? `${liveState.fps} FPS` : formatFps(camera.currentFps || 30)}
              {camera.currentLatencyMs ? ` · ${formatLatency(camera.currentLatencyMs)}` : ''}
            </span>
          )}

          {/* Quick Webcam Go-Live Button */}
          <button
            type="button"
            onClick={handleToggleWebcam}
            disabled={isTogglingLive}
            title={liveState.isStreaming ? 'Stop live webcam stream' : 'Transmit local webcam to this camera'}
            className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-medium flex items-center gap-1 transition-all ${
              liveState.isStreaming
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30'
                : 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 border border-slate-700'
            }`}
          >
            {liveState.isStreaming ? (
              <>
                <Square className="w-2.5 h-2.5 fill-current text-emerald-400" />
                <span>LIVE</span>
              </>
            ) : (
              <>
                <Video className="w-2.5 h-2.5 text-cyan-400" />
                <span>GO LIVE</span>
              </>
            )}
          </button>

          {/* Maximize Feed Icon */}
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
        {/* MODE A: OFFLINE */}
        {isOffline ? (
          <div className="flex flex-col items-center justify-center text-center p-4">
            <AlertTriangle className="w-6 h-6 text-[#FF4D4D] mb-1.5 opacity-80" />
            <span className="text-xs font-semibold text-[#FF4D4D] tracking-wide uppercase">Signal Lost</span>
            <span className="text-[10px] text-[#6C727A] mt-0.5 font-mono-num">
              {camera.streamEndpointReference || camera.model || 'Perimeter Optical Sensor'}
            </span>
            <button
              type="button"
              onClick={handleReconnect}
              disabled={isReconnecting}
              className="mt-2.5 px-2.5 py-1 text-[10px] font-mono bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-700 flex items-center gap-1.5"
            >
              <RefreshCw className={`w-2.5 h-2.5 ${isReconnecting ? 'animate-spin' : ''}`} />
              <span>{isReconnecting ? 'Connecting...' : 'Reconnect Signal'}</span>
            </button>
          </div>
        ) : isUnavailable ? (
          /* MODE B: UNAVAILABLE */
          <div className="flex flex-col items-center justify-center text-center p-4">
            <Radio className="w-6 h-6 text-[#FF9500] mb-1.5 animate-pulse" />
            <span className="text-xs font-semibold text-[#FF9500] tracking-wide uppercase">Stream Unavailable</span>
            <span className="text-[10px] text-[#8A8F98] mt-0.5 max-w-[220px] truncate">
              {camera.sourceAttribution || 'Network degraded or stream buffer starved'}
            </span>
            <button
              type="button"
              onClick={handleReconnect}
              disabled={isReconnecting}
              className="mt-2.5 px-2.5 py-1 text-[10px] font-mono bg-amber-950/40 hover:bg-amber-900/50 text-amber-200 rounded border border-amber-800/60 flex items-center gap-1.5"
            >
              <RefreshCw className={`w-2.5 h-2.5 ${isReconnecting ? 'animate-spin' : ''}`} />
              <span>Retry Stream</span>
            </button>
          </div>
        ) : isLive && liveState.isStreaming ? (
          /* MODE C1: ACTIVE LIVE WEBCAM VIDEO STREAM (Direct HTML5 MediaStream) */
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover select-none"
            />

            {/* Genuine Live Camera Badge */}
            <div className="absolute top-1.5 right-1.5 z-10 flex items-center gap-1 px-1.5 py-0.5 bg-emerald-950/80 border border-emerald-500/70 text-emerald-300 rounded text-[9px] font-mono font-bold tracking-tight shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping shrink-0" />
              <span>LIVE CAMERA ({camera.sourceType || 'WEBCAM'})</span>
            </div>

            {/* Source Attribution Label */}
            {camera.sourceAttribution && (
              <div className="absolute bottom-1.5 left-1.5 z-10 px-1.5 py-0.5 bg-black/75 text-slate-300 rounded text-[9px] font-mono truncate max-w-[75%]">
                {camera.sourceAttribution}
              </div>
            )}
          </>
        ) : isLive && camera.browserStreamUrl ? (
          /* MODE C2: ACTIVE LIVE VIDEO STREAM (HLS / WebRTC URL) */
          <>
            <video
              src={camera.browserStreamUrl}
              autoPlay
              playsInline
              muted
              loop
              className="w-full h-full object-cover select-none"
              onError={() => console.warn(`Direct stream error on ${camera.id}`)}
            />
            <div className="absolute top-1.5 right-1.5 z-10 px-1.5 py-0.5 bg-emerald-950/80 border border-emerald-500/70 text-emerald-300 rounded text-[9px] font-mono font-bold tracking-tight shadow-sm">
              LIVE STREAM ({camera.sourceType || 'HLS'})
            </div>
          </>
        ) : isLive ? (
          /* MODE C3: LIVE CAMERA CONFIGURED BUT INPUT NOT STARTED */
          <div className="flex flex-col items-center justify-center text-center p-4 bg-[#0A0D10]">
            <Video className="w-6 h-6 text-emerald-400 mb-1.5 opacity-90" />
            <span className="text-xs font-semibold text-emerald-400">Live Camera Ready</span>
            <span className="text-[10px] text-slate-400 mt-0.5 max-w-[200px]">
              {camera.sourceAttribution || 'Transmit your webcam to this live surveillance node'}
            </span>
            <button
              type="button"
              onClick={handleToggleWebcam}
              disabled={isTogglingLive}
              className="mt-2.5 px-3 py-1 text-[11px] font-mono bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 rounded border border-emerald-500/40 flex items-center gap-1.5 transition-colors"
            >
              <Video className="w-3 h-3" />
              <span>Connect Camera</span>
            </button>
          </div>
        ) : (
          /* MODE D: SIMULATED VIDEO FEED (Synthetic Frame Generator) */
          <>
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
                  <span>Ingesting Simulation...</span>
                </div>
              </div>
            )}

            {/* Mandatory Simulation Watermark Badge */}
            <div className="absolute top-1.5 right-1.5 z-10 px-1.5 py-0.5 bg-[#DC2626]/85 text-white rounded border border-[#EF4444]/60 text-[9px] font-mono font-bold tracking-tight shadow-xs">
              SIMULATED RTSP FEED
            </div>

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

      {/* 3. BOTTOM FOOTER: STATE, PROTOCOL, & HONEST AI STATUS */}
      <div className="p-2 bg-[#14161A] border-t border-[#23262B] flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-[#E0E2E6] font-medium">{statusLabel}</span>
          {camera.sectorName && (
            <span className="text-[11px] text-[#8A8F98]">· {camera.sectorName}</span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {/* Protocol Badge */}
          <span className="text-[10px] font-mono px-1 py-0.5 rounded bg-[#23262B] text-[#A9ACB1]">
            {camera.protocol || (isLive ? 'WEBCAM' : 'RTSP')}
          </span>

          {/* AI Subsystem Status: Strictly Truthful */}
          {isLive ? (
            <span className="text-[10px] text-amber-400/90 font-mono font-medium flex items-center gap-1 bg-amber-950/30 px-1.5 py-0.5 rounded border border-amber-800/40">
              <Info className="w-2.5 h-2.5" />
              <span>AI: UNAVAILABLE</span>
            </span>
          ) : camera.aiPipelineEnabled ? (
            tracks.length > 0 ? (
              <span className="text-[10px] text-[#38BDF8] font-bold flex items-center gap-1 font-mono">
                <Compass className="w-3 h-3 text-[#38BDF8]" />
                {tracks.length} {tracks.length === 1 ? 'Track' : 'Tracks'}
              </span>
            ) : detections.length > 0 ? (
              <span className="text-[10px] text-[#F59E0B] font-bold flex items-center gap-1 font-mono">
                <UserCheck className="w-3 h-3 text-[#F59E0B]" />
                {detections.length} {detections.length === 1 ? 'Person' : 'Persons'}
              </span>
            ) : (
              <span className="text-[10px] text-[#10B981] font-medium font-mono">Tracking Active</span>
            )
          ) : (
            <span className="text-[10px] text-[#6C727A]">AI Standby</span>
          )}
        </div>
      </div>
    </div>
  );
};
