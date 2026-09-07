import React, { useState, useEffect } from 'react';
import {
  Video,
  Compass,
  Lock,
  ShieldCheck,
  ShieldAlert,
  Sliders,
  Cpu,
  Activity,
  History,
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
  ExternalLink,
  Info,
  Server,
  Zap,
  UserCheck,
  Eye,
  Layers,
  Gauge,
} from 'lucide-react';
import { Camera, CameraStatus, CameraType, CameraProtocol, Sector, User, AiCapabilityStatus, CameraAiAnalyticsConfig } from '../../server/types';
import { StreamTelemetry, StreamFailureMode } from '../../video-gateway/types';
import { NormalizedDetection, AiSubsystemHealth, AiInferenceConfig } from '../../ai-inference/types';
import { Track, TrackingSubsystemHealth } from '../../tracking/types';
import { DetectionOverlay } from '../camera/DetectionOverlay';
import { Drawer } from '../ui/Drawer';
import { Badge } from '../ui/Badge';
import { StatusIndicator } from '../ui/StatusIndicator';
import { Button } from '../ui/Button';
import { canPerformCameraAction } from '../../utils/permissions';
import { formatFps, formatLatency, formatTimestamp } from '../../utils/formatters';
import { api } from '../../api/client';
import { DecommissionConfirmModal } from './DecommissionConfirmModal';
import { liveStreamManager, CameraLiveState } from '../../video-gateway/liveStreamManager';

export interface CameraDetailDrawerProps {
  isOpen: boolean;
  camera: Camera | null;
  sectors: Sector[];
  currentUser: User | null;
  onClose: () => void;
  onSelectCameraForFeed: (camera: Camera) => void;
  onCameraUpdated: (updatedCamera: Camera) => void;
  onPtzPreset: (cameraId: string, presetName: string) => Promise<void>;
}

const defaultAnalyticsConfig: CameraAiAnalyticsConfig = {
  personDetection: 'NOT_CONFIGURED',
  vehicleDetection: 'NOT_CONFIGURED',
  anpr: 'NOT_CONFIGURED',
  faceAnalytics: 'NOT_CONFIGURED',
  nightAnalytics: 'NOT_CONFIGURED',
  behaviorAnalytics: 'NOT_CONFIGURED',
};

export const CameraDetailDrawer: React.FC<CameraDetailDrawerProps> = ({
  isOpen,
  camera,
  sectors,
  currentUser,
  onClose,
  onSelectCameraForFeed,
  onCameraUpdated,
  onPtzPreset,
}) => {
  const [activeTab, setActiveTab] = useState<'TELEMETRY' | 'CONFIG' | 'ANALYTICS' | 'LIFECYCLE' | 'PTZ'>('TELEMETRY');
  
  // Configuration Form State
  const [name, setName] = useState('');
  const [sectorId, setSectorId] = useState('');
  const [siteName, setSiteName] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [cameraType, setCameraType] = useState<CameraType>('FIXED_OPTICAL');
  const [resolution, setResolution] = useState('');
  const [fps, setFps] = useState('');
  const [protocol, setProtocol] = useState<CameraProtocol>('RTSP');
  const [streamEndpointReference, setStreamEndpointReference] = useState('');
  const [model, setModel] = useState('');
  const [codec, setCodec] = useState('');
  const [description, setDescription] = useState('');
  const [isPtSupported, setIsPtSupported] = useState(false);

  // Live Stream Abstraction State
  const [sourceMode, setSourceMode] = useState<'LIVE' | 'SIMULATION' | 'OFFLINE' | 'UNAVAILABLE'>('SIMULATION');
  const [sourceType, setSourceType] = useState<'WEBCAM' | 'HLS' | 'WEBRTC' | 'RTSP' | 'SIMULATED'>('SIMULATED');
  const [sourceAttribution, setSourceAttribution] = useState('');
  const [browserStreamUrl, setBrowserStreamUrl] = useState('');
  const [aiProcessingStatus, setAiProcessingStatus] = useState<'READY' | 'STANDBY' | 'UNAVAILABLE' | 'ERROR'>('READY');
  const [liveState, setLiveState] = useState<CameraLiveState | null>(null);
  const [isTogglingWebcam, setIsTogglingWebcam] = useState(false);
  const [streamSwitchNotice, setStreamSwitchNotice] = useState<string | null>(null);
  const drawerVideoRef = React.useRef<HTMLVideoElement | null>(null);

  // AI Analytics status local state
  const [aiAnalytics, setAiAnalytics] = useState<CameraAiAnalyticsConfig>(defaultAnalyticsConfig);

  // Operational status & lifecycle state
  const [statusReason, setStatusReason] = useState('');
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [isPtzMoving, setIsPtzMoving] = useState(false);
  const [configSuccessMsg, setConfigSuccessMsg] = useState<string | null>(null);
  const [configErrorMsg, setConfigErrorMsg] = useState<string | null>(null);

  // Connection Test State
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionTestResult, setConnectionTestResult] = useState<{
    status: string;
    message: string;
    detail?: string;
    latencyMs?: number;
  } | null>(null);

  // Video Gateway Stream Telemetry & Simulation States
  const [streamTelemetry, setStreamTelemetry] = useState<StreamTelemetry | null>(null);
  const [liveFrameUri, setLiveFrameUri] = useState<string | null>(null);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationNotice, setSimulationNotice] = useState<string | null>(null);

  // Decommission Modal State
  const [isDecommissionModalOpen, setIsDecommissionModalOpen] = useState(false);

  // AI Inference & Detection State
  const [cameraDetections, setCameraDetections] = useState<NormalizedDetection[]>([]);
  const [cameraTracks, setCameraTracks] = useState<Track[]>([]);
  const [trackingHealth, setTrackingHealth] = useState<TrackingSubsystemHealth | null>(null);
  const [isResettingTracker, setIsResettingTracker] = useState(false);
  const [trackerResetNotice, setTrackerResetNotice] = useState<string | null>(null);
  const [aiHealth, setAiHealth] = useState<AiSubsystemHealth | null>(null);
  const [aiConfig, setAiConfig] = useState<AiInferenceConfig | null>(null);
  const [isInferringNow, setIsInferringNow] = useState(false);
  const [inferenceNotice, setInferenceNotice] = useState<string | null>(null);
  const [activeTestScene, setActiveTestScene] = useState<string>('PERSON_SOLITARY');
  const [isUpdatingScene, setIsUpdatingScene] = useState(false);
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.5);

  // Sync form with active camera and fetch live Video Gateway stream telemetry
  useEffect(() => {
    if (camera) {
      setName(camera.name || '');
      setSectorId(camera.sectorId || (sectors[0]?.id || ''));
      setSiteName(camera.siteName || '');
      setLatitude(String(camera.latitude ?? ''));
      setLongitude(String(camera.longitude ?? ''));
      setCameraType(camera.cameraType || 'FIXED_OPTICAL');
      setResolution(camera.resolution || '1920x1080 (FHD)');
      setFps(String(camera.fps || 30));
      setProtocol(camera.protocol || 'RTSP');
      setStreamEndpointReference(camera.streamEndpointReference || '');
      setModel(camera.model || '');
      setCodec(camera.codec || 'H.265');
      setDescription(camera.description || '');
      setIsPtSupported(Boolean(camera.isPtSupported));

      // Live Stream State sync
      const effMode: 'LIVE' | 'SIMULATION' | 'OFFLINE' | 'UNAVAILABLE' =
        camera.sourceMode ||
        (camera.status === 'OFFLINE'
          ? 'OFFLINE'
          : camera.status === 'DEGRADED'
          ? 'UNAVAILABLE'
          : camera.isSimulated !== false
          ? 'SIMULATION'
          : 'LIVE');
      setSourceMode(effMode);
      setSourceType(camera.sourceType || (camera.isSimulated !== false ? 'SIMULATED' : 'WEBCAM'));
      setSourceAttribution(camera.sourceAttribution || '');
      setBrowserStreamUrl(camera.browserStreamUrl || '');
      setAiProcessingStatus(camera.aiProcessingStatus || (effMode === 'LIVE' ? 'UNAVAILABLE' : 'READY'));
      setLiveState(liveStreamManager.getState(camera.id));
      setStreamSwitchNotice(null);

      setAiAnalytics(camera.aiAnalyticsStatus || {
        personDetection: 'NOT_CONFIGURED',
        vehicleDetection: 'NOT_CONFIGURED',
        anpr: 'NOT_CONFIGURED',
        faceAnalytics: 'NOT_CONFIGURED',
        nightAnalytics: 'NOT_CONFIGURED',
        behaviorAnalytics: 'NOT_CONFIGURED',
      });
      setConfigSuccessMsg(null);
      setConfigErrorMsg(null);
      setConnectionTestResult(null);
      setSimulationNotice(null);
      setInferenceNotice(null);

      // Default test scene based on camera
      setActiveTestScene(
        camera.cameraId === 'CAM-01' || camera.identifier === 'CAM-01'
          ? 'PERSON_SOLITARY'
          : 'EMPTY'
      );

      // Fetch Video Gateway telemetry, AI health, tracking data, and latest frame
      let isMounted = true;
      const loadTelemetryAndFrame = async () => {
        try {
          const [streamRes, frameRes, detRes, trackRes, aiHealthRes, aiConfigRes, trackingHealthRes] = await Promise.allSettled([
            api.video.getStream(camera.id),
            api.video.getFrame(camera.id),
            api.detections.getCameraDetections(camera.id),
            api.tracks.getCameraTracks(camera.id),
            api.ai.getHealth(),
            api.ai.getConfig(),
            api.tracking.getHealth(),
          ]);

          if (isMounted) {
            if (streamRes.status === 'fulfilled' && streamRes.value?.stream) {
              setStreamTelemetry(streamRes.value.stream);
              if (streamRes.value.stream.testScene) {
                setActiveTestScene(streamRes.value.stream.testScene);
              }
            }
            if (frameRes.status === 'fulfilled' && frameRes.value?.frame?.dataUri) {
              setLiveFrameUri(frameRes.value.frame.dataUri);
            }
            if (detRes.status === 'fulfilled' && detRes.value?.activeDetections) {
              setCameraDetections(detRes.value.activeDetections);
            }
            if (trackRes.status === 'fulfilled' && trackRes.value?.activeTracks) {
              setCameraTracks(trackRes.value.activeTracks);
            }
            if (aiHealthRes.status === 'fulfilled' && aiHealthRes.value?.data) {
              setAiHealth(aiHealthRes.value.data);
            }
            if (aiConfigRes.status === 'fulfilled' && aiConfigRes.value?.data) {
              setAiConfig(aiConfigRes.value.data);
              setConfidenceThreshold(aiConfigRes.value.data.confidenceThreshold);
            }
            if (trackingHealthRes.status === 'fulfilled' && trackingHealthRes.value?.data) {
              setTrackingHealth(trackingHealthRes.value.data);
            }
          }
        } catch {
          // Silent fallback
        }
      };

      loadTelemetryAndFrame();
      const interval = setInterval(loadTelemetryAndFrame, 2000);

      return () => {
        isMounted = false;
        clearInterval(interval);
      };
    }
  }, [camera, sectors, isOpen]);

  // Subscribe to live stream manager updates
  useEffect(() => {
    if (!camera) return;
    const unsub = liveStreamManager.subscribe((states) => {
      const s = states.get(camera.id);
      if (s) setLiveState(s);
    });
    return unsub;
  }, [camera?.id]);

  // Attach webcam stream to drawer video element when active
  useEffect(() => {
    if (drawerVideoRef.current && liveState?.isStreaming && liveState.mediaStream) {
      if (drawerVideoRef.current.srcObject !== liveState.mediaStream) {
        drawerVideoRef.current.srcObject = liveState.mediaStream;
        drawerVideoRef.current.play().catch((err) => console.warn('Drawer video play error:', err));
      }
    }
  }, [liveState?.isStreaming, liveState?.mediaStream]);

  if (!camera) return null;

  const userRole = currentUser?.role;
  const canUpdate = canPerformCameraAction(userRole, 'camera.update');
  const canEnable = canPerformCameraAction(userRole, 'camera.enable');
  const canDisable = canPerformCameraAction(userRole, 'camera.disable');
  const canDecommission = canPerformCameraAction(userRole, 'camera.decommission');

  const handleSwitchSourceMode = async (newMode: 'LIVE' | 'SIMULATION' | 'OFFLINE' | 'UNAVAILABLE') => {
    if (!camera) return;
    setStreamSwitchNotice(null);
    try {
      let newType = sourceType;
      if (newMode === 'SIMULATION' && (sourceType === 'WEBCAM' || sourceType === 'HLS')) {
        newType = 'SIMULATED';
        setSourceType('SIMULATED');
      } else if (newMode === 'LIVE' && sourceType === 'SIMULATED') {
        newType = 'WEBCAM';
        setSourceType('WEBCAM');
      }

      setSourceMode(newMode);
      const res = await api.video.setSourceMode(camera.id, {
        sourceMode: newMode,
        sourceType: newType,
        sourceAttribution: sourceAttribution.trim() || undefined,
        browserStreamUrl: browserStreamUrl.trim() || undefined,
        aiProcessingStatus: newMode === 'LIVE' ? 'UNAVAILABLE' : 'READY',
      });

      if (newMode !== 'LIVE' && liveState?.isStreaming) {
        liveStreamManager.stopWebcamStream(camera.id);
      }

      setStreamSwitchNotice(`Switched stream mode to ${newMode}`);
      if (onCameraUpdated && res?.camera) {
        onCameraUpdated(res.camera);
      }
    } catch (err: any) {
      alert(`Failed to switch stream mode: ${err.message}`);
    }
  };

  const handleToggleWebcam = async () => {
    if (!camera) return;
    setIsTogglingWebcam(true);
    setStreamSwitchNotice(null);
    try {
      if (liveState?.isStreaming) {
        liveStreamManager.stopWebcamStream(camera.id);
        const res = await api.video.setSourceMode(camera.id, {
          sourceMode: 'SIMULATION',
          sourceType: 'SIMULATED',
          sourceAttribution: 'Synthetic Border Patrol Feed',
        });
        setSourceMode('SIMULATION');
        setSourceType('SIMULATED');
        setStreamSwitchNotice('Stopped live webcam. Restored simulated RTSP feed.');
        if (onCameraUpdated && res?.camera) onCameraUpdated(res.camera);
      } else {
        await liveStreamManager.startWebcamStream(camera.id);
        const res = await api.video.setSourceMode(camera.id, {
          sourceMode: 'LIVE',
          sourceType: 'WEBCAM',
          sourceAttribution: sourceAttribution.trim() || 'Operator Station Live Feed',
          aiProcessingStatus: 'UNAVAILABLE',
        });
        setSourceMode('LIVE');
        setSourceType('WEBCAM');
        setStreamSwitchNotice('Live webcam connected! Video frames transmitting to gateway.');
        if (onCameraUpdated && res?.camera) onCameraUpdated(res.camera);
      }
    } catch (err: any) {
      alert(`Webcam error: ${err.message}`);
    } finally {
      setIsTogglingWebcam(false);
    }
  };

  const handleResetTracker = async () => {
    if (!camera) return;
    setIsResettingTracker(true);
    setTrackerResetNotice(null);
    try {
      const res = await api.tracking.resetCamera(camera.id);
      setTrackerResetNotice(res.message || 'Tracking state reset successfully.');
      setCameraTracks([]);
      setTimeout(() => setTrackerResetNotice(null), 3500);
    } catch (err: any) {
      setTrackerResetNotice(`Reset failed: ${err.message || 'Unknown error'}`);
    } finally {
      setIsResettingTracker(false);
    }
  };

  const handleTestConnection = async () => {
    setIsTestingConnection(true);
    setConnectionTestResult(null);
    try {
      const res = await api.video.testStream(camera.id);
      setConnectionTestResult({
        status: res.status,
        message: res.message,
        detail: res.detail,
        latencyMs: res.latencyMs,
      });
    } catch (err: any) {
      setConnectionTestResult({
        status: 'CONNECTION_FAILED',
        message: 'Connection diagnostic failed',
        detail: err.message || 'Service unreachable',
      });
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleReconnectStream = async () => {
    setIsReconnecting(true);
    try {
      const res = await api.video.reconnect(camera.id);
      if (res?.stream) {
        setStreamTelemetry(res.stream);
      }
    } catch (err: any) {
      alert(`Reconnect request failed: ${err.message}`);
    } finally {
      setIsReconnecting(false);
    }
  };

  const handleInjectFailure = async (mode: StreamFailureMode) => {
    setIsSimulating(true);
    setSimulationNotice(null);
    try {
      const res = await api.video.simulateFailure(camera.id, mode);
      if (res?.stream) {
        setStreamTelemetry(res.stream);
        setSimulationNotice(`Injected stream failure simulation: ${mode}`);
      }
    } catch (err: any) {
      alert(`Simulation injection failed: ${err.message}`);
    } finally {
      setIsSimulating(false);
    }
  };

  const handleClearFailure = async () => {
    setIsSimulating(true);
    setSimulationNotice(null);
    try {
      const res = await api.video.simulateRestore(camera.id);
      if (res?.stream) {
        setStreamTelemetry(res.stream);
        setSimulationNotice('Cleared simulated fault. Stream pipeline restored.');
      }
    } catch (err: any) {
      alert(`Fault clearance failed: ${err.message}`);
    } finally {
      setIsSimulating(false);
    }
  };

  const handleSaveConfiguration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canUpdate) return;

    setIsSavingConfig(true);
    setConfigSuccessMsg(null);
    setConfigErrorMsg(null);

    try {
      const lat = Number(latitude);
      const lng = Number(longitude);
      const numFps = parseInt(fps, 10);

      if (isNaN(lat) || lat < -90 || lat > 90) {
        throw new Error('Latitude must be a valid number between -90 and 90');
      }
      if (isNaN(lng) || lng < -180 || lng > 180) {
        throw new Error('Longitude must be a valid number between -180 and 180');
      }
      if (isNaN(numFps) || numFps < 1 || numFps > 120) {
        throw new Error('FPS must be an integer between 1 and 120');
      }

      const res = await api.cameras.update(camera.id, {
        name: name.trim(),
        sectorId,
        siteName: siteName.trim(),
        latitude: lat,
        longitude: lng,
        cameraType,
        resolution: resolution.trim(),
        fps: numFps,
        protocol,
        streamEndpointReference: streamEndpointReference.trim(),
        model: model.trim(),
        codec: codec.trim(),
        description: description.trim(),
        isPtSupported,
        aiAnalyticsStatus: aiAnalytics,
      });

      if (res.camera) {
        onCameraUpdated(res.camera);
        setConfigSuccessMsg('Configuration updated and saved to audit registry.');
      }
    } catch (err: any) {
      setConfigErrorMsg(err.message || 'Failed to update camera configuration.');
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleStatusChange = async (newStatus: CameraStatus) => {
    try {
      let res;
      if (newStatus === 'ONLINE') {
        res = await api.cameras.enable(camera.id);
      } else if (newStatus === 'OFFLINE') {
        res = await api.cameras.disable(camera.id, statusReason || undefined);
      } else {
        res = await api.cameras.updateStatus(camera.id, {
          status: newStatus,
          reason: statusReason || undefined,
        });
      }

      if (res.camera) {
        onCameraUpdated(res.camera);
        setStatusReason('');
      }
    } catch (err: any) {
      alert(`Status update failed: ${err.message}`);
    }
  };

  const handleConfirmDecommission = async (cameraId: string, reason: string) => {
    const res = await api.cameras.decommission(cameraId, reason);
    if (res.camera) {
      onCameraUpdated(res.camera);
    }
  };

  const handleRunInferenceNow = async () => {
    setIsInferringNow(true);
    setInferenceNotice(null);
    try {
      const res = await api.ai.inferCamera(camera.id);
      if (res.success) {
        setCameraDetections(res.detections);
        setInferenceNotice(
          `Real model inference completed in ${res.latencyMs}ms on CPU. Detected ${res.personCount} person(s).`
        );
      }
    } catch (err: any) {
      setInferenceNotice(`Inference error: ${err.message || 'Execution failed'}`);
    } finally {
      setIsInferringNow(false);
    }
  };

  const handleSwitchTestScene = async (scene: string) => {
    setIsUpdatingScene(true);
    try {
      await api.ai.setTestScene(camera.id, scene);
      setActiveTestScene(scene);
      setInferenceNotice(`Test scene switched to ${scene}. Refreshing frame & model detections...`);
      // Trigger a quick follow-up detection query
      setTimeout(async () => {
        try {
          const detRes = await api.detections.getCameraDetections(camera.id);
          if (detRes.activeDetections) {
            setCameraDetections(detRes.activeDetections);
          }
        } catch {
          // ignore
        }
      }, 1200);
    } catch (err: any) {
      alert(`Scene switch failed: ${err.message}`);
    } finally {
      setIsUpdatingScene(false);
    }
  };

  const handleConfidenceChange = async (val: number) => {
    setConfidenceThreshold(val);
    try {
      await api.ai.updateConfig({ confidenceThreshold: val });
    } catch {
      // ignore
    }
  };

  const handlePtzTrigger = async (preset: string) => {
    setIsPtzMoving(true);
    try {
      await onPtzPreset(camera.id, preset);
    } finally {
      setIsPtzMoving(false);
    }
  };

  const ptzPresets = [
    'Perimeter Fence Line',
    'North Approach Corridor',
    'Gate 04 Checkpoint',
    'Buffer Zone Sector',
    'High Ridge Sentry Horizon',
  ];

  return (
    <>
      <Drawer
        isOpen={isOpen}
        onClose={onClose}
        title={`${camera.cameraId || camera.identifier} — Sensor Dossier`}
        subtitle={`${camera.name} · ${camera.sectorName || 'Border Sector'}`}
      >
        <div className="flex flex-col h-full space-y-4">
          {/* Top Banner: Status & Quick Live Feed Button */}
          <div className="flex items-center justify-between p-3 bg-[#14161A] border border-[#23262B] rounded">
            <div className="flex items-center gap-2">
              <StatusIndicator status={camera.status} size="md" />
              {camera.isDecommissioned ? (
                <Badge variant="offline" size="sm">
                  DECOMMISSIONED
                </Badge>
              ) : (
                <Badge variant="info" size="sm">
                  {camera.cameraType.replace(/_/g, ' ')}
                </Badge>
              )}
              {camera.isSimulated && (
                <Badge variant="simulation" size="sm">
                  SIMULATED DATA
                </Badge>
              )}
            </div>

            <Button
              variant="primary"
              size="sm"
              onClick={() => onSelectCameraForFeed(camera)}
              leftIcon={<Video className="w-3.5 h-3.5" />}
            >
              Live Feed
            </Button>
          </div>

          {/* Navigation Sub-Tabs */}
          <div className="flex border-b border-[#23262B] gap-1 shrink-0 overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveTab('TELEMETRY')}
              className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'TELEMETRY'
                  ? 'border-[#007AFF] text-white bg-[#14161A]/50'
                  : 'border-transparent text-[#6C727A] hover:text-[#A9ACB1]'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Telemetry & Stream</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('CONFIG')}
              className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'CONFIG'
                  ? 'border-[#007AFF] text-white bg-[#14161A]/50'
                  : 'border-transparent text-[#6C727A] hover:text-[#A9ACB1]'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Configuration</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('ANALYTICS')}
              className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'ANALYTICS'
                  ? 'border-[#007AFF] text-white bg-[#14161A]/50'
                  : 'border-transparent text-[#6C727A] hover:text-[#A9ACB1]'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>AI Analytics</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('LIFECYCLE')}
              className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'LIFECYCLE'
                  ? 'border-[#007AFF] text-white bg-[#14161A]/50'
                  : 'border-transparent text-[#6C727A] hover:text-[#A9ACB1]'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Lifecycle & Ops</span>
            </button>

            {camera.isPtSupported && (
              <button
                type="button"
                onClick={() => setActiveTab('PTZ')}
                className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  activeTab === 'PTZ'
                    ? 'border-[#007AFF] text-white bg-[#14161A]/50'
                    : 'border-transparent text-[#6C727A] hover:text-[#A9ACB1]'
                }`}
              >
                <Compass className="w-3.5 h-3.5" />
                <span>PTZ Slew</span>
              </button>
            )}
          </div>

          {/* TAB 1: TELEMETRY & STREAM */}
          {activeTab === 'TELEMETRY' && (
            <div className="space-y-4">
              {/* Snapshot / Live Frame Preview */}
              <div className="relative aspect-video bg-black rounded overflow-hidden border border-[#23262B]">
                {liveFrameUri ? (
                  <img
                    src={liveFrameUri}
                    alt={camera.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <img
                    src={
                      camera.thumbnailUrl ||
                      'https://images.unsplash.com/photo-1541888946425-d0fbb186244f?w=800&auto=format&fit=crop&q=80'
                    }
                    alt={camera.identifier}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                )}

                <div className="absolute top-2 left-2 bg-[#0F1115]/90 px-2 py-0.5 rounded border border-[#23262B] text-[10px] font-mono-num text-white flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    streamTelemetry?.connectionState === 'CONNECTED' ? 'bg-[#34C759]' :
                    streamTelemetry?.connectionState === 'DEGRADED' ? 'bg-[#FF9500]' : 'bg-[#FF4D4D]'
                  }`} />
                  <span>{camera.cameraId || camera.identifier}</span>
                  <span className="text-[#A9ACB1]">·</span>
                  <span className="font-semibold text-[#007AFF]">{streamTelemetry?.connectionState || camera.status}</span>
                </div>

                {camera.isSimulated !== false && (
                  <div className="absolute top-2 right-2 bg-[#DC2626]/85 px-2 py-0.5 rounded border border-[#EF4444]/60 text-[9px] font-mono font-bold text-white shadow-xs">
                    SIMULATED RTSP FEED
                  </div>
                )}

                <div className="absolute bottom-2 right-2 bg-[#0F1115]/90 px-2 py-0.5 rounded border border-[#23262B] text-[10px] font-mono-num text-[#A9ACB1]">
                  {streamTelemetry?.resolution || camera.resolution} · {streamTelemetry?.codec || camera.codec || 'H.265'}
                </div>

                {/* Real-time AI Person Detection & Multi-Object Tracking Overlay */}
                <DetectionOverlay
                  detections={cameraDetections}
                  tracks={cameraTracks}
                  aiHealth={aiHealth}
                  aiPipelineEnabled={camera.aiPipelineEnabled}
                />
              </div>

              {/* Stream Health & Telemetry Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono-num">
                <div className="p-2.5 bg-[#0F1115] border border-[#23262B] rounded">
                  <span className="text-[10px] text-[#6C727A] block">Current / Target FPS</span>
                  <span className="text-xs font-bold text-white mt-0.5 block">
                    {formatFps(streamTelemetry?.currentFps ?? camera.currentFps)} / {streamTelemetry?.nominalFps || camera.fps || 30}
                  </span>
                </div>
                <div className="p-2.5 bg-[#0F1115] border border-[#23262B] rounded">
                  <span className="text-[10px] text-[#6C727A] block">Roundtrip Latency</span>
                  <span className="text-xs font-bold text-white mt-0.5 block">
                    {formatLatency(streamTelemetry?.currentLatencyMs ?? camera.currentLatencyMs)}
                  </span>
                </div>
                <div className="p-2.5 bg-[#0F1115] border border-[#23262B] rounded">
                  <span className="text-[10px] text-[#6C727A] block">Frames Acquired</span>
                  <span className="text-xs font-bold text-white mt-0.5 block">
                    {streamTelemetry?.framesAcquiredTotal?.toLocaleString() || '—'}
                  </span>
                </div>
                <div className="p-2.5 bg-[#0F1115] border border-[#23262B] rounded">
                  <span className="text-[10px] text-[#6C727A] block">Stream Health</span>
                  <span className={`text-xs font-bold mt-0.5 block ${
                    streamTelemetry?.healthState === 'HEALTHY' ? 'text-[#34C759]' :
                    streamTelemetry?.healthState === 'DEGRADED' ? 'text-[#FF9500]' : 'text-[#FF4D4D]'
                  }`}>
                    {streamTelemetry?.healthState || 'ONLINE'}
                  </span>
                </div>
              </div>

              {/* Stream Ingestion Actions & Connection Diagnostics */}
              <div className="p-3 bg-[#0F1115] border border-[#23262B] rounded space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Server className="w-3.5 h-3.5 text-[#007AFF]" />
                    <span className="text-xs font-semibold text-white">Stream Pipeline Controls</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="subtle"
                      size="sm"
                      isLoading={isReconnecting}
                      onClick={handleReconnectStream}
                      leftIcon={<RefreshCw className="w-3 h-3" />}
                    >
                      Reconnect Stream
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      isLoading={isTestingConnection}
                      onClick={handleTestConnection}
                      leftIcon={<Zap className="w-3 h-3" />}
                    >
                      Test Connection
                    </Button>
                  </div>
                </div>

                {/* Last Error / Retry telemetry if any */}
                {streamTelemetry?.lastError && (
                  <div className="p-2.5 bg-[#FF4D4D]/10 border border-[#FF4D4D]/30 rounded text-xs space-y-1">
                    <div className="flex items-center gap-2 text-[#FF4D4D] font-medium font-mono text-[11px]">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span>FAULT: {streamTelemetry.lastError.code || 'STREAM_ERROR'}</span>
                    </div>
                    <p className="text-[11px] text-white/80">{streamTelemetry.lastError.message}</p>
                    {streamTelemetry.nextRetryAt && (
                      <div className="text-[10px] font-mono text-[#FF9500]">
                        Reconnect attempt {streamTelemetry.reconnectAttempts}/{streamTelemetry.maxReconnectAttempts} scheduled for {new Date(streamTelemetry.nextRetryAt).toLocaleTimeString()}
                      </div>
                    )}
                  </div>
                )}

                {connectionTestResult && (
                  <div className="p-2.5 bg-[#14161A] border border-[#23262B] rounded space-y-1">
                    <div className="flex items-center gap-2">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-medium border ${
                        connectionTestResult.status === 'CONNECTED'
                          ? 'bg-[#34C759]/15 text-[#34C759] border-[#34C759]/30'
                          : 'bg-[#FF4D4D]/15 text-[#FF4D4D] border-[#FF4D4D]/30'
                      }`}>
                        {connectionTestResult.status}
                      </span>
                      <span className="text-xs font-medium text-white">{connectionTestResult.message}</span>
                      {connectionTestResult.latencyMs && (
                        <span className="text-[10px] font-mono text-[#6C727A]">
                          ({connectionTestResult.latencyMs}ms)
                        </span>
                      )}
                    </div>
                    {connectionTestResult.detail && (
                      <p className="text-[11px] text-[#6C727A]">{connectionTestResult.detail}</p>
                    )}
                  </div>
                )}
              </div>

              {/* Developer / Operator Fault Simulation Sandbox */}
              <div className="p-3 bg-[#14161A] border border-[#23262B] rounded space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-[#FF9500]" />
                    <span className="text-xs font-semibold text-white">Simulation Pipeline & Fault Injection</span>
                  </div>
                  {streamTelemetry?.failureMode && streamTelemetry.failureMode !== 'NONE' && (
                    <span className="px-1.5 py-0.5 rounded bg-[#FF4D4D]/20 border border-[#FF4D4D]/40 text-[#FF4D4D] text-[10px] font-mono font-bold">
                      INJECTED: {streamTelemetry.failureMode}
                    </span>
                  )}
                </div>

                <p className="text-[11px] text-[#6C727A]">
                  Inject synthetic network conditions to test pipeline fault tolerance, frame drop handling, and automatic reconnection.
                </p>

                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    disabled={isSimulating}
                    onClick={() => handleInjectFailure('DISCONNECT')}
                    className="px-2 py-1 text-[10px] font-mono bg-[#1E2228] hover:bg-[#2A2E36] text-white border border-[#2E333D] rounded transition-colors"
                  >
                    Fault: Disconnect
                  </button>
                  <button
                    type="button"
                    disabled={isSimulating}
                    onClick={() => handleInjectFailure('TIMEOUT')}
                    className="px-2 py-1 text-[10px] font-mono bg-[#1E2228] hover:bg-[#2A2E36] text-white border border-[#2E333D] rounded transition-colors"
                  >
                    Fault: Timeout
                  </button>
                  <button
                    type="button"
                    disabled={isSimulating}
                    onClick={() => handleInjectFailure('FROZEN')}
                    className="px-2 py-1 text-[10px] font-mono bg-[#1E2228] hover:bg-[#2A2E36] text-white border border-[#2E333D] rounded transition-colors"
                  >
                    Fault: Freeze Stream
                  </button>
                  <button
                    type="button"
                    disabled={isSimulating}
                    onClick={() => handleInjectFailure('SLOW')}
                    className="px-2 py-1 text-[10px] font-mono bg-[#1E2228] hover:bg-[#2A2E36] text-white border border-[#2E333D] rounded transition-colors"
                  >
                    Fault: Degrade FPS
                  </button>
                  <button
                    type="button"
                    disabled={isSimulating}
                    onClick={handleClearFailure}
                    className="px-2.5 py-1 text-[10px] font-mono bg-[#34C759]/15 hover:bg-[#34C759]/25 text-[#34C759] border border-[#34C759]/30 rounded transition-colors font-medium"
                  >
                    Restore Normal Stream
                  </button>
                </div>

                {simulationNotice && (
                  <div className="text-[11px] text-[#34C759] font-mono flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{simulationNotice}</span>
                  </div>
                )}
              </div>

              {/* Location & Site Dossier */}
              <div className="p-3 bg-[#0F1115] border border-[#23262B] rounded space-y-2 font-mono-num text-xs">
                <div className="text-white font-semibold font-sans mb-1">Geospatial Placement</div>
                <div className="flex justify-between py-1 border-b border-[#23262B]/50">
                  <span className="text-[#6C727A]">Site Mast:</span>
                  <span className="text-white font-sans">{camera.siteName || 'Perimeter Mast'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#23262B]/50">
                  <span className="text-[#6C727A]">Coordinates (WGS84):</span>
                  <span className="text-white">
                    {camera.latitude?.toFixed(4)}° N, {camera.longitude?.toFixed(4)}° W
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#23262B]/50">
                  <span className="text-[#6C727A]">Sector Boundary:</span>
                  <span className="text-white font-sans">{camera.sectorName}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#23262B]/50">
                  <span className="text-[#6C727A]">Azimuth / Field of View:</span>
                  <span className="text-white">
                    {camera.azimuthDegrees ?? 180}° / {camera.fieldOfViewDegrees ?? 90}°
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-[#6C727A]">Last Heartbeat:</span>
                  <span className="text-white">
                    {formatTimestamp(camera.lastHeartbeatAt, { format: 'time-only' })}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: CONFIGURATION & EDIT FORM */}
          {activeTab === 'CONFIG' && (
            <form onSubmit={handleSaveConfiguration} className="space-y-4">
              {!canUpdate && (
                <div className="p-3 bg-[#FF9500]/10 border border-[#FF9500]/30 rounded text-xs text-[#FF9500] flex items-center gap-2">
                  <Lock className="w-4 h-4 shrink-0" />
                  <span>Read-only: Operator role does not permit modifying camera parameters (requires WATCH_COMMANDER or ADMINISTRATOR).</span>
                </div>
              )}

              {configSuccessMsg && (
                <div className="p-2.5 bg-[#34C759]/10 border border-[#34C759]/30 rounded text-xs text-[#34C759] flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{configSuccessMsg}</span>
                </div>
              )}

              {configErrorMsg && (
                <div className="p-2.5 bg-[#FF4D4D]/10 border border-[#FF4D4D]/30 rounded text-xs text-[#FF4D4D] flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{configErrorMsg}</span>
                </div>
              )}

              {/* Immutable Camera ID */}
              <div>
                <label className="block text-xs font-medium text-[#6C727A] mb-1 flex items-center gap-1.5">
                  <Lock className="w-3 h-3 text-[#6C727A]" />
                  <span>Camera Identifier (Immutable Business Key)</span>
                </label>
                <input
                  type="text"
                  disabled
                  value={camera.cameraId || camera.identifier}
                  className="w-full h-8 px-2.5 bg-[#14161A] border border-[#23262B] rounded text-xs font-mono font-bold text-[#A9ACB1] cursor-not-allowed"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-white mb-1">Camera Name</label>
                  <input
                    type="text"
                    disabled={!canUpdate}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full h-8 px-2.5 bg-[#14161A] border border-[#23262B] rounded text-xs text-white focus:outline-none focus:border-[#007AFF] disabled:opacity-60"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-white mb-1">Sector</label>
                  <select
                    disabled={!canUpdate}
                    value={sectorId}
                    onChange={(e) => setSectorId(e.target.value)}
                    className="w-full h-8 px-2.5 bg-[#14161A] border border-[#23262B] rounded text-xs text-white focus:outline-none focus:border-[#007AFF] disabled:opacity-60"
                  >
                    {sectors.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-white mb-1">Site / Post Name</label>
                  <input
                    type="text"
                    disabled={!canUpdate}
                    value={siteName}
                    onChange={(e) => setSiteName(e.target.value)}
                    className="w-full h-8 px-2.5 bg-[#14161A] border border-[#23262B] rounded text-xs text-white focus:outline-none focus:border-[#007AFF] disabled:opacity-60"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-white mb-1">Sensor Architecture</label>
                  <select
                    disabled={!canUpdate}
                    value={cameraType}
                    onChange={(e) => setCameraType(e.target.value as CameraType)}
                    className="w-full h-8 px-2.5 bg-[#14161A] border border-[#23262B] rounded text-xs text-white focus:outline-none focus:border-[#007AFF] disabled:opacity-60"
                  >
                    <option value="FIXED_OPTICAL">Fixed Optical</option>
                    <option value="PTZ_OPTICAL">PTZ Optical</option>
                    <option value="THERMAL_FIXED">Thermal Fixed</option>
                    <option value="DUAL_THERMAL_PTZ">Dual Thermal PTZ</option>
                    <option value="RADAR_SLAVED_PTZ">Radar-Slaved PTZ</option>
                    <option value="ANPR_SPECIALIZED">ANPR Specialized</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-white mb-1">Latitude</label>
                  <input
                    type="text"
                    disabled={!canUpdate}
                    value={latitude}
                    onChange={(e) => setLatitude(e.target.value)}
                    className="w-full h-8 px-2.5 bg-[#14161A] border border-[#23262B] rounded text-xs font-mono-num text-white focus:outline-none focus:border-[#007AFF] disabled:opacity-60"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-white mb-1">Longitude</label>
                  <input
                    type="text"
                    disabled={!canUpdate}
                    value={longitude}
                    onChange={(e) => setLongitude(e.target.value)}
                    className="w-full h-8 px-2.5 bg-[#14161A] border border-[#23262B] rounded text-xs font-mono-num text-white focus:outline-none focus:border-[#007AFF] disabled:opacity-60"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-white mb-1">Resolution</label>
                  <select
                    disabled={!canUpdate}
                    value={resolution}
                    onChange={(e) => setResolution(e.target.value)}
                    className="w-full h-8 px-2.5 bg-[#14161A] border border-[#23262B] rounded text-xs text-white focus:outline-none focus:border-[#007AFF] disabled:opacity-60"
                  >
                    <option value="1920x1080 (FHD)">1920x1080 (FHD)</option>
                    <option value="2560x1440 (2K)">2560x1440 (2K)</option>
                    <option value="3840x2160 (4K)">3840x2160 (4K)</option>
                    <option value="1280x720 (HD)">1280x720 (HD)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-white mb-1">FPS Target</label>
                  <input
                    type="number"
                    disabled={!canUpdate}
                    min="1"
                    max="120"
                    value={fps}
                    onChange={(e) => setFps(e.target.value)}
                    className="w-full h-8 px-2.5 bg-[#14161A] border border-[#23262B] rounded text-xs font-mono-num text-white focus:outline-none focus:border-[#007AFF] disabled:opacity-60"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-white mb-1">Protocol</label>
                  <select
                    disabled={!canUpdate}
                    value={protocol}
                    onChange={(e) => setProtocol(e.target.value as CameraProtocol)}
                    className="w-full h-8 px-2.5 bg-[#14161A] border border-[#23262B] rounded text-xs text-white focus:outline-none focus:border-[#007AFF] disabled:opacity-60"
                  >
                    <option value="RTSP">RTSP</option>
                    <option value="ONVIF">ONVIF</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-white mb-1">Stream Endpoint Reference</label>
                <input
                  type="text"
                  disabled={!canUpdate}
                  value={streamEndpointReference}
                  onChange={(e) => setStreamEndpointReference(e.target.value)}
                  className="w-full h-8 px-2.5 bg-[#14161A] border border-[#23262B] rounded text-xs font-mono-num text-white focus:outline-none focus:border-[#007AFF] disabled:opacity-60"
                />
                {camera.credentialSecretRef && (
                  <div className="flex items-center gap-1.5 text-[10px] text-[#34C759] mt-1">
                    <ShieldCheck className="w-3 h-3" />
                    <span>Encrypted Secret Vault Reference: {camera.credentialSecretRef}</span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-white mb-1">Operational Description</label>
                <textarea
                  rows={2}
                  disabled={!canUpdate}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-[#14161A] border border-[#23262B] rounded text-xs text-white placeholder-[#6C727A] focus:outline-none focus:border-[#007AFF] disabled:opacity-60"
                />
              </div>

              {canUpdate && (
                <div className="pt-2">
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    isLoading={isSavingConfig}
                    className="w-full"
                  >
                    Save Configuration Changes
                  </Button>
                </div>
              )}
            </form>
          )}

          {/* TAB 3: AI ANALYTICS SUBSYSTEM */}
          {activeTab === 'ANALYTICS' && (
            <div className="space-y-4">
              {/* 1. Real Computer Vision Person Detection Subsystem Dossier */}
              <div className="p-3 bg-[#0F1115] border border-[#23262B] rounded space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-[#F59E0B]" />
                    <span className="text-xs font-semibold text-white">
                      Computer Vision Human Detection Engine
                    </span>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                    aiHealth?.status === 'READY'
                      ? 'bg-[#10B981]/15 text-[#10B981] border-[#10B981]/30'
                      : aiHealth?.status === 'BUSY'
                      ? 'bg-[#F59E0B]/15 text-[#F59E0B] border-[#F59E0B]/30'
                      : 'bg-[#FF4D4D]/15 text-[#FF4D4D] border-[#FF4D4D]/30'
                  }`}>
                    {aiHealth?.status || 'INITIALIZING'}
                  </span>
                </div>

                {/* Subsystem Specs & Truthful Telemetry */}
                <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                  <div className="p-2 bg-[#14161A] border border-[#23262B] rounded">
                    <span className="text-[#6C727A] block text-[10px]">MODEL ARCHITECTURE</span>
                    <span className="text-white font-bold block truncate">{aiHealth?.modelName || 'Xenova/yolos-tiny'}</span>
                    <span className="text-[#8C929D] text-[9px] block">COCO Quantized ONNX</span>
                  </div>
                  <div className="p-2 bg-[#14161A] border border-[#23262B] rounded">
                    <span className="text-[#6C727A] block text-[10px]">HARDWARE BACKEND</span>
                    <span className="text-[#007AFF] font-bold block">CPU (WASM / ONNX)</span>
                    <span className="text-[#8C929D] text-[9px] block">Zero Mock / Truthful Compute</span>
                  </div>
                  <div className="p-2 bg-[#14161A] border border-[#23262B] rounded">
                    <span className="text-[#6C727A] block text-[10px]">LAST INFERENCE LATENCY</span>
                    <span className="text-white font-bold block">
                      {aiHealth?.lastInferenceLatencyMs ? `${(aiHealth.lastInferenceLatencyMs / 1000).toFixed(2)}s` : '—'}
                    </span>
                    <span className="text-[#8C929D] text-[9px] block">Single-core CPU thread</span>
                  </div>
                  <div className="p-2 bg-[#14161A] border border-[#23262B] rounded">
                    <span className="text-[#6C727A] block text-[10px]">SAMPLING / BACKPRESSURE</span>
                    <span className="text-white font-bold block">
                      {aiHealth?.metrics.framesProcessedTotal || 0} proc / {aiHealth?.metrics.framesSkippedTotal || 0} skip
                    </span>
                    <span className="text-[#8C929D] text-[9px] block">Non-blocking queue</span>
                  </div>
                </div>

                {/* Confidence Threshold Slider */}
                <div className="p-2.5 bg-[#14161A] border border-[#23262B] rounded space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-white">Detection Confidence Filter</span>
                    <span className="font-mono text-[#F59E0B] font-bold">
                      {(confidenceThreshold * 100).toFixed(0)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.30"
                    max="0.95"
                    step="0.05"
                    value={confidenceThreshold}
                    onChange={(e) => handleConfidenceChange(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-[#23262B] rounded-lg appearance-none cursor-pointer accent-[#F59E0B]"
                  />
                  <div className="flex justify-between text-[9px] font-mono text-[#6C727A]">
                    <span>30% (High Recall)</span>
                    <span>50% (Standard)</span>
                    <span>95% (High Precision)</span>
                  </div>
                </div>

                {/* On-Demand Inference Trigger */}
                <div className="space-y-2 pt-1">
                  <Button
                    variant="primary"
                    size="sm"
                    isLoading={isInferringNow}
                    onClick={handleRunInferenceNow}
                    leftIcon={<Eye className="w-3.5 h-3.5" />}
                    className="w-full bg-[#F59E0B] hover:bg-[#D97706] text-black font-bold border-none"
                  >
                    Run Real Model Inference On Current Frame
                  </Button>

                  {inferenceNotice && (
                    <div className="p-2 bg-[#14161A] border border-[#23262B] rounded text-[11px] font-mono text-[#FBBF24]">
                      {inferenceNotice}
                    </div>
                  )}
                </div>
              </div>

              {/* 2. MULTI-OBJECT TRACKING DOSSIER & ACTIVE TRACKS (PHASE 07) */}
              <div className="p-3 bg-[#0F1115] border border-[#0284C7]/40 rounded space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Compass className="w-4 h-4 text-[#38BDF8]" />
                    <span className="text-xs font-semibold text-white">Multi-Object Tracking Telemetry</span>
                    <span className="px-1.5 py-0.5 rounded bg-[#0284C7]/20 border border-[#38BDF8]/40 text-[9px] font-mono text-[#38BDF8] font-bold">
                      REAL TRACKING LAYER
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-black/60 border border-[#23262B] text-[10px] font-mono font-bold text-[#38BDF8]">
                      {cameraTracks.filter((t) => t.state === 'ACTIVE').length} Active · {cameraTracks.filter((t) => t.state === 'TEMPORARILY_LOST').length} Lost
                    </span>
                    <Button
                      variant="secondary"
                      size="sm"
                      isLoading={isResettingTracker}
                      onClick={handleResetTracker}
                      leftIcon={<RefreshCw className="w-3 h-3" />}
                      className="text-[10px] h-6 px-2 text-[#EF4444] hover:bg-[#EF4444]/10 border-[#EF4444]/30"
                    >
                      Reset Tracker
                    </Button>
                  </div>
                </div>

                {trackerResetNotice && (
                  <div className="p-2 bg-[#0284C7]/10 border border-[#0284C7]/30 rounded text-[11px] font-mono text-[#38BDF8]">
                    {trackerResetNotice}
                  </div>
                )}

                {/* Tracking Performance Metrics Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-xs">
                  <div className="p-2 bg-[#14161A] border border-[#23262B] rounded">
                    <span className="text-[#6C727A] block text-[9px]">TRACKING LATENCY</span>
                    <span className="text-white font-bold block mt-0.5">
                      {trackingHealth?.metrics?.lastTrackingLatencyMs !== undefined
                        ? `${trackingHealth.metrics.lastTrackingLatencyMs.toFixed(2)} ms`
                        : '< 1.5 ms'}
                    </span>
                    <span className="text-[#10B981] text-[9px] block">Sub-frame overhead</span>
                  </div>
                  <div className="p-2 bg-[#14161A] border border-[#23262B] rounded">
                    <span className="text-[#6C727A] block text-[9px]">ACTIVE PERSISTENT TRACKS</span>
                    <span className="text-[#38BDF8] font-bold block mt-0.5">
                      {cameraTracks.filter((t) => t.state === 'ACTIVE').length} subjects
                    </span>
                    <span className="text-[#6C727A] text-[9px] block">Persistent spatial ID</span>
                  </div>
                  <div className="p-2 bg-[#14161A] border border-[#23262B] rounded">
                    <span className="text-[#6C727A] block text-[9px]">DETECTIONS MATCHED</span>
                    <span className="text-white font-bold block mt-0.5">
                      {cameraTracks.reduce((acc, t) => acc + t.detectionCount, 0)} frames
                    </span>
                    <span className="text-[#6C727A] text-[9px] block">IoU / centroid metric</span>
                  </div>
                  <div className="p-2 bg-[#14161A] border border-[#23262B] rounded">
                    <span className="text-[#6C727A] block text-[9px]">MISSED / LOST COUNT</span>
                    <span className="text-[#F59E0B] font-bold block mt-0.5">
                      {cameraTracks.filter((t) => t.state === 'TEMPORARILY_LOST').length} subjects
                    </span>
                    <span className="text-[#6C727A] text-[9px] block">Max 4 frame memory</span>
                  </div>
                </div>

                {/* Live Track Directory */}
                <div className="space-y-1.5">
                  <span className="text-[11px] font-mono text-[#8C929D] block uppercase">Live Track Directory:</span>
                  {cameraTracks.length === 0 ? (
                    <div className="p-3 bg-[#14161A] border border-[#23262B] rounded text-center text-xs text-[#6C727A]">
                      No active or lost tracks on this sensor head. Perimeter clear.
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-56 overflow-y-auto">
                      {cameraTracks.map((track) => {
                        const isLost = track.state === 'TEMPORARILY_LOST';
                        return (
                          <div
                            key={track.trackId}
                            className={`p-2 bg-[#14161A] border ${
                              isLost ? 'border-[#F59E0B]/50' : 'border-[#38BDF8]/40'
                            } rounded text-xs space-y-1.5`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-white bg-black/60 px-1.5 py-0.5 rounded border border-white/10 text-[10px]">
                                  {track.trackId}
                                </span>
                                <span className="font-mono text-[10px] text-[#A9ACB1] uppercase">
                                  {track.objectType}
                                </span>
                                <span
                                  className={`px-1.5 py-0.2 text-[9px] font-mono font-bold rounded ${
                                    isLost
                                      ? 'bg-[#F59E0B]/20 text-[#F59E0B] border border-[#F59E0B]/40 animate-pulse'
                                      : 'bg-[#10B981]/20 text-[#10B981] border border-[#10B981]/40'
                                  }`}
                                >
                                  {track.state}
                                </span>
                              </div>
                              <span className="text-[10px] font-mono text-[#6C727A]">
                                DWELL {track.dwellTimeSeconds.toFixed(1)}s
                              </span>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] font-mono text-[#8C929D] bg-black/30 p-1.5 rounded">
                              <div>
                                <span className="text-[#6C727A] block text-[9px]">CONFIDENCE</span>
                                <span className="text-white font-bold">
                                  {(track.currentConfidence * 100).toFixed(1)}%
                                </span>
                              </div>
                              <div>
                                <span className="text-[#6C727A] block text-[9px]">DIRECTION</span>
                                <span className="text-[#38BDF8] font-bold">{track.direction}</span>
                              </div>
                              <div>
                                <span className="text-[#6C727A] block text-[9px]">TRAJECTORY</span>
                                <span className="text-white">{track.trajectory.length} points</span>
                              </div>
                              <div>
                                <span className="text-[#6C727A] block text-[9px]">MISSED FRAMES</span>
                                <span
                                  className={
                                    track.missedFrames > 0 ? 'text-[#F59E0B] font-bold' : 'text-[#6C727A]'
                                  }
                                >
                                  {track.missedFrames} / 4
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* 3. Active Detections on this Sensor Head */}
              <div className="p-3 bg-[#0F1115] border border-[#23262B] rounded space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <UserCheck className="w-3.5 h-3.5 text-[#F59E0B]" />
                    <span className="text-xs font-semibold text-white">Active Person Detections</span>
                  </div>
                  <span className="px-1.5 py-0.5 rounded bg-black/60 border border-[#23262B] text-[10px] font-mono text-white">
                    {cameraDetections.length} Detected
                  </span>
                </div>

                {cameraDetections.length === 0 ? (
                  <div className="p-3 bg-[#14161A] border border-[#23262B] rounded text-center text-xs text-[#6C727A]">
                    No persons detected in recent frames. Perimeter clear.
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {cameraDetections.map((det) => (
                      <div
                        key={det.detectionId}
                        className="p-2 bg-[#14161A] border border-[#F59E0B]/40 rounded text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-bold text-[#F59E0B] flex items-center gap-1">
                            <span>PERSON</span>
                            <span className="text-white text-[10px]">
                              · {(det.confidence * 100).toFixed(1)}% confidence
                            </span>
                          </span>
                          <span className="text-[10px] font-mono text-[#8C929D]">
                            {new Date(det.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <div className="text-[10px] font-mono text-[#6C727A] flex items-center gap-2">
                          <span>Coords: [{det.boundingBox.x.toFixed(2)}, {det.boundingBox.y.toFixed(2)}, {det.boundingBox.width.toFixed(2)}, {det.boundingBox.height.toFixed(2)}]</span>
                          <span>·</span>
                          <span>
                            Size:{' '}
                            {det.pixelBox
                              ? (det.pixelBox.width ?? Math.round(det.pixelBox.xmax - det.pixelBox.xmin))
                              : Math.round(det.boundingBox.width * 640)}
                            x
                            {det.pixelBox
                              ? (det.pixelBox.height ?? Math.round(det.pixelBox.ymax - det.pixelBox.ymin))
                              : Math.round(det.boundingBox.height * 360)}
                            px
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 4. Synthetic Test Scene Switcher (Mandated Test Verification) */}
              {camera.isSimulated !== false && (
                <div className="p-3 bg-[#0F1115] border border-[#23262B] rounded space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-[#007AFF]" />
                    <span className="text-xs font-semibold text-white">Controlled Verification Test Scenes</span>
                  </div>
                  <p className="text-[11px] text-[#6C727A]">
                    Test the genuine computer vision model and multi-object tracking pipeline against controlled border camera scenes:
                  </p>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      disabled={isUpdatingScene}
                      onClick={() => handleSwitchTestScene('PERSON_SOLITARY')}
                      className={`p-2 rounded border text-left text-xs transition-colors ${
                        activeTestScene === 'PERSON_SOLITARY'
                          ? 'border-[#F59E0B] bg-[#F59E0B]/10 text-white font-medium'
                          : 'border-[#23262B] bg-[#14161A] text-[#8C929D] hover:text-white'
                      }`}
                    >
                      <span className="block font-bold text-[11px]">Single Subject</span>
                      <span className="block text-[9px] text-[#6C727A] mt-0.5">Photographic subject</span>
                    </button>

                    <button
                      type="button"
                      disabled={isUpdatingScene}
                      onClick={() => handleSwitchTestScene('PERSON_MOVING')}
                      className={`p-2 rounded border text-left text-xs transition-colors ${
                        activeTestScene === 'PERSON_MOVING'
                          ? 'border-[#38BDF8] bg-[#38BDF8]/10 text-white font-medium'
                          : 'border-[#23262B] bg-[#14161A] text-[#8C929D] hover:text-white'
                      }`}
                    >
                      <span className="block font-bold text-[11px]">Moving Subject</span>
                      <span className="block text-[9px] text-[#6C727A] mt-0.5">Dynamic trajectory & heading</span>
                    </button>

                    <button
                      type="button"
                      disabled={isUpdatingScene}
                      onClick={() => handleSwitchTestScene('EMPTY')}
                      className={`p-2 rounded border text-left text-xs transition-colors ${
                        activeTestScene === 'EMPTY'
                          ? 'border-[#10B981] bg-[#10B981]/10 text-white font-medium'
                          : 'border-[#23262B] bg-[#14161A] text-[#8C929D] hover:text-white'
                      }`}
                    >
                      <span className="block font-bold text-[11px]">Clear Perimeter</span>
                      <span className="block text-[9px] text-[#6C727A] mt-0.5">Negative (0 targets)</span>
                    </button>

                    <button
                      type="button"
                      disabled={isUpdatingScene}
                      onClick={() => handleSwitchTestScene('PERSON_CROSSING')}
                      className={`p-2 rounded border text-left text-xs transition-colors ${
                        activeTestScene === 'PERSON_CROSSING'
                          ? 'border-[#007AFF] bg-[#007AFF]/10 text-white font-medium'
                          : 'border-[#23262B] bg-[#14161A] text-[#8C929D] hover:text-white'
                      }`}
                    >
                      <span className="block font-bold text-[11px]">Multi-Intruder</span>
                      <span className="block text-[9px] text-[#6C727A] mt-0.5">Dual crossing targets</span>
                    </button>

                    <button
                      type="button"
                      disabled={isUpdatingScene}
                      onClick={() => handleSwitchTestScene('PERSON_DISAPPEARS_TEMPORARILY')}
                      className={`p-2 rounded border text-left text-xs transition-colors ${
                        activeTestScene === 'PERSON_DISAPPEARS_TEMPORARILY'
                          ? 'border-[#F59E0B] bg-[#F59E0B]/10 text-white font-medium'
                          : 'border-[#23262B] bg-[#14161A] text-[#8C929D] hover:text-white'
                      }`}
                    >
                      <span className="block font-bold text-[11px]">Temporary Obstruction</span>
                      <span className="block text-[9px] text-[#6C727A] mt-0.5">Disappears & recovers</span>
                    </button>

                    <button
                      type="button"
                      disabled={isUpdatingScene}
                      onClick={() => handleSwitchTestScene('TWO_PERSONS_CROSSING')}
                      className={`p-2 rounded border text-left text-xs transition-colors ${
                        activeTestScene === 'TWO_PERSONS_CROSSING'
                          ? 'border-[#A855F7] bg-[#A855F7]/10 text-white font-medium'
                          : 'border-[#23262B] bg-[#14161A] text-[#8C929D] hover:text-white'
                      }`}
                    >
                      <span className="block font-bold text-[11px]">Path Disambiguation</span>
                      <span className="block text-[9px] text-[#6C727A] mt-0.5">Two crossing paths</span>
                    </button>
                  </div>
                </div>
              )}

              {/* 4. Sensor Head Capability Matrix */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-white block">Other Sensor Analytics Capabilities</span>
                {[
                  { key: 'vehicleDetection', label: 'Vehicle & Conveyance Detection', desc: 'All-terrain vehicle, truck, and speed estimator' },
                  { key: 'anpr', label: 'ANPR / License Plate Recognition', desc: 'Optical character recognition for checkpoint vehicles' },
                  { key: 'faceAnalytics', label: 'Face Analytics / Feature Extraction', desc: 'Biometric capture for watchlist matching' },
                  { key: 'nightAnalytics', label: 'Night & Low-Light Thermal Analytics', desc: 'Enhanced thermal contrast & infrared tracking' },
                  { key: 'behaviorAnalytics', label: 'Loitering & Boundary Breach Analytics', desc: 'Temporal velocity tracking across virtual boundaries' },
                ].map((item) => {
                  const currentStatus: AiCapabilityStatus = (aiAnalytics as any)[item.key] || 'NOT_CONFIGURED';
                  return (
                    <div
                      key={item.key}
                      className="p-2.5 bg-[#14161A] border border-[#23262B] rounded flex items-center justify-between gap-3"
                    >
                      <div className="space-y-0.5">
                        <span className="text-xs font-medium text-white block">{item.label}</span>
                        <span className="text-[10px] text-[#6C727A] block">{item.desc}</span>
                      </div>

                      <select
                        disabled={!canUpdate}
                        value={currentStatus}
                        onChange={(e) => {
                          const updated: CameraAiAnalyticsConfig = {
                            ...aiAnalytics,
                            [item.key]: e.target.value as AiCapabilityStatus,
                          };
                          setAiAnalytics(updated);
                        }}
                        className="h-7 px-2 bg-[#0F1115] border border-[#23262B] rounded text-xs font-mono text-white focus:outline-none focus:border-[#007AFF] disabled:opacity-60"
                      >
                        <option value="NOT_CONFIGURED">Not Configured</option>
                        <option value="CONFIGURED">Configured</option>
                        <option value="ACTIVE">Active</option>
                        <option value="DISABLED">Disabled</option>
                      </select>
                    </div>
                  );
                })}
              </div>

              {canUpdate && (
                <Button
                  variant="primary"
                  size="sm"
                  isLoading={isSavingConfig}
                  onClick={handleSaveConfiguration}
                  className="w-full"
                >
                  Save AI Analytics Setup
                </Button>
              )}
            </div>
          )}

          {/* TAB 4: LIFECYCLE & OPERATIONAL CONTROLS */}
          {activeTab === 'LIFECYCLE' && (
            <div className="space-y-4">
              {/* Operational Status Override */}
              <div className="p-3 bg-[#0F1115] border border-[#23262B] rounded space-y-3">
                <span className="text-xs font-semibold text-white block">Operational Status Control</span>
                <p className="text-[11px] text-[#6C727A]">
                  Update sensor operational availability for dispatch coordination and system health dashboards.
                </p>

                <input
                  type="text"
                  placeholder="Operator log note / justification..."
                  value={statusReason}
                  onChange={(e) => setStatusReason(e.target.value)}
                  className="w-full h-8 px-2.5 bg-[#14161A] border border-[#23262B] rounded text-xs text-white placeholder-[#6C727A] focus:outline-none focus:border-[#007AFF]"
                />

                <div className="flex flex-wrap gap-2 pt-1">
                  {canEnable && !camera.isDecommissioned && (
                    <Button
                      variant="subtle"
                      size="sm"
                      onClick={() => handleStatusChange('ONLINE')}
                    >
                      Set Online
                    </Button>
                  )}
                  {canDisable && !camera.isDecommissioned && (
                    <Button
                      variant="subtle"
                      size="sm"
                      onClick={() => handleStatusChange('OFFLINE')}
                    >
                      Disable (Offline)
                    </Button>
                  )}
                  {canUpdate && !camera.isDecommissioned && (
                    <Button
                      variant="subtle"
                      size="sm"
                      onClick={() => handleStatusChange('MAINTENANCE')}
                    >
                      Mark Maintenance
                    </Button>
                  )}
                  {canUpdate && !camera.isDecommissioned && (
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleStatusChange('INTEGRITY_ANOMALY')}
                    >
                      Flag Optical Anomaly
                    </Button>
                  )}
                </div>
              </div>

              {/* Safe Decommissioning Section */}
              <div className="p-3 bg-[#FF4D4D]/10 border border-[#FF4D4D]/30 rounded space-y-2">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-[#FF4D4D]" />
                  <span className="text-xs font-semibold text-white">Safe Sensor Decommissioning</span>
                </div>

                {camera.isDecommissioned ? (
                  <div className="space-y-1 text-xs">
                    <p className="text-[#FF4D4D] font-medium">Sensor is Decommissioned</p>
                    <p className="text-[#A9ACB1]">
                      Decommissioned on {formatTimestamp(camera.decommissionedAt)}
                    </p>
                    {camera.decommissionReason && (
                      <p className="text-[#A9ACB1] italic">Reason: {camera.decommissionReason}</p>
                    )}
                  </div>
                ) : (
                  <>
                    <p className="text-[11px] text-[#A9ACB1] leading-relaxed">
                      Decommissioning archives this sensor and stops video ingestion. Historical audit entries, past alerts, and evidence vault recordings remain permanently preserved.
                    </p>

                    {canDecommission ? (
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => setIsDecommissionModalOpen(true)}
                        leftIcon={<ShieldAlert className="w-3.5 h-3.5" />}
                      >
                        Decommission Sensor
                      </Button>
                    ) : (
                      <div className="p-2 bg-[#14161A] border border-[#23262B] rounded text-[11px] text-[#A9ACB1] flex items-center gap-1.5">
                        <Lock className="w-3 h-3 text-[#FF9500]" />
                        <span>Restricted action: Only operators with ADMINISTRATOR role can decommission sensors.</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* TAB 5: PTZ SLEW */}
          {activeTab === 'PTZ' && camera.isPtSupported && (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-[#0F1115] border border-[#23262B] rounded">
                <div className="flex items-center gap-1.5">
                  <Compass className="w-4 h-4 text-[#007AFF]" />
                  <span className="text-xs font-semibold text-white">Pan-Tilt-Zoom Preset Positions</span>
                </div>
                {isPtzMoving && (
                  <span className="text-[11px] font-mono-num text-[#007AFF] animate-pulse">
                    Slewing optic head...
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {ptzPresets.map((preset) => (
                  <Button
                    key={preset}
                    variant="secondary"
                    size="sm"
                    isLoading={isPtzMoving}
                    onClick={() => handlePtzTrigger(preset)}
                    className="justify-start text-xs truncate"
                  >
                    {preset}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>
      </Drawer>

      {/* Safe Decommissioning Confirmation Dialog */}
      <DecommissionConfirmModal
        isOpen={isDecommissionModalOpen}
        camera={camera}
        onClose={() => setIsDecommissionModalOpen(false)}
        onConfirmDecommission={handleConfirmDecommission}
      />
    </>
  );
};
