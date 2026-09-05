import React, { useState } from 'react';
import {
  Camera as CameraIcon,
  Video,
  Compass,
  AlertTriangle,
  RotateCw,
  Plus,
  SlidersHorizontal,
  ShieldCheck,
  ShieldAlert,
  Activity,
  Cpu,
  Layers,
  Archive,
} from 'lucide-react';
import { Camera, CameraStatus, Sector, User } from '../server/types';
import { Badge } from '../components/ui/Badge';
import { StatusIndicator } from '../components/ui/StatusIndicator';
import { Button } from '../components/ui/Button';
import { Search } from '../components/ui/Search';
import { EmptyState } from '../components/ui/FeedbackStates';
import { formatFps, formatLatency } from '../utils/formatters';
import { CameraDetailDrawer } from '../components/cameras/CameraDetailDrawer';
import { RegisterCameraModal } from '../components/cameras/RegisterCameraModal';
import { canPerformCameraAction } from '../utils/permissions';
import { api } from '../api/client';

export interface CamerasScreenProps {
  cameras: Camera[];
  sectors: Sector[];
  currentUser?: User | null;
  onSelectCamera: (camera: Camera) => void;
  onPtzPreset: (cameraId: string, presetName: string) => Promise<void>;
  onUpdateStatus: (cameraId: string, status: string, reason?: string) => Promise<void>;
  onCameraUpdated?: (updatedCamera: Camera) => void;
  onCameraRegistered?: (registeredCamera: Camera) => void;
}

export const CamerasScreen: React.FC<CamerasScreenProps> = ({
  cameras,
  sectors,
  currentUser,
  onSelectCamera,
  onPtzPreset,
  onUpdateStatus,
  onCameraUpdated,
  onCameraRegistered,
}) => {
  const [search, setSearch] = useState('');
  const [selectedSector, setSelectedSector] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [showDecommissioned, setShowDecommissioned] = useState(false);
  const [activeCamera, setActiveCamera] = useState<Camera | null>(null);
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);

  const safeCameras = Array.isArray(cameras) ? cameras : [];

  const filteredCameras = safeCameras.filter((cam) => {
    // Filter out decommissioned unless toggled
    if (cam.isDecommissioned && !showDecommissioned) {
      return false;
    }
    const term = search.toLowerCase();
    const matchesSearch =
      (cam.name || '').toLowerCase().includes(term) ||
      (cam.identifier || '').toLowerCase().includes(term) ||
      (cam.model || '').toLowerCase().includes(term) ||
      (cam.siteName || '').toLowerCase().includes(term);
    const matchesSector = selectedSector === 'ALL' || cam.sectorId === selectedSector;
    const matchesStatus = selectedStatus === 'ALL' || cam.status === selectedStatus;
    return matchesSearch && matchesSector && matchesStatus;
  });

  // KPI telemetry calculations
  const totalCount = safeCameras.filter((c) => !c.isDecommissioned).length;
  const onlineCount = safeCameras.filter((c) => !c.isDecommissioned && c.status === 'ONLINE').length;
  const issueCount = safeCameras.filter(
    (c) => !c.isDecommissioned && (c.status === 'DEGRADED' || c.status === 'INTEGRITY_ANOMALY' || c.status === 'OFFLINE')
  ).length;
  const aiPipelineCount = safeCameras.filter((c) => !c.isDecommissioned && c.aiPipelineEnabled).length;
  const ptzCapableCount = safeCameras.filter((c) => !c.isDecommissioned && c.isPtSupported).length;

  const handleRegisterCamera = async (cameraData: Partial<Camera>) => {
    const res = await api.cameras.create(cameraData);
    if (res.success && res.camera) {
      onCameraRegistered?.(res.camera);
      setActiveCamera(res.camera);
    }
  };

  const handleCameraUpdated = (updatedCamera: Camera) => {
    if (updatedCamera.isDecommissioned) {
      setActiveCamera(null);
    } else {
      setActiveCamera(updatedCamera);
    }
    onCameraUpdated?.(updatedCamera);
  };

  const canRegister = canPerformCameraAction(currentUser?.role, 'camera.create');

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0A0B0D] overflow-hidden">
      {/* 1. Header Toolbar */}
      <div className="p-4 sm:px-6 bg-[#0F1115] border-b border-[#23262B] flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold text-white">Camera Management</h1>
            <span className="px-2 py-0.5 bg-[#14161A] border border-[#23262B] text-[#A9ACB1] rounded text-[11px] font-mono-num font-medium">
              {totalCount} Active Sensors
            </span>
            <span className="px-1.5 py-0.5 text-[10px] font-mono-num font-semibold bg-[#007AFF]/15 text-[#007AFF] border border-[#007AFF]/30 rounded">
              IBVAP REGISTRY
            </span>
          </div>
          <p className="text-xs text-[#6C727A] mt-0.5">
            Surveillance inventory, zero-plaintext stream security, edge analytics, and optic health
          </p>
        </div>

        {/* Action Controls & Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <Search
            value={search}
            onChange={setSearch}
            placeholder="Search ID, model, site..."
            className="w-48"
          />

          <select
            value={selectedSector}
            onChange={(e) => setSelectedSector(e.target.value)}
            className="h-8 px-2.5 bg-[#14161A] border border-[#23262B] rounded text-xs text-white focus:outline-none focus:border-[#007AFF]"
          >
            <option value="ALL">All Sectors</option>
            {sectors.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="h-8 px-2.5 bg-[#14161A] border border-[#23262B] rounded text-xs text-white focus:outline-none focus:border-[#007AFF]"
          >
            <option value="ALL">All Statuses</option>
            <option value="ONLINE">Online</option>
            <option value="DEGRADED">Degraded</option>
            <option value="OFFLINE">Offline</option>
            <option value="INTEGRITY_ANOMALY">Integrity Anomaly</option>
            <option value="MAINTENANCE">Maintenance</option>
          </select>

          <Button
            variant={showDecommissioned ? 'secondary' : 'subtle'}
            size="sm"
            onClick={() => setShowDecommissioned(!showDecommissioned)}
            leftIcon={<Archive className="w-3.5 h-3.5" />}
            title="Toggle viewing archived and decommissioned sensors"
          >
            {showDecommissioned ? 'Archived Shown' : 'Archived'}
          </Button>

          {canRegister && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsRegisterModalOpen(true)}
              leftIcon={<Plus className="w-3.5 h-3.5" />}
            >
              Commission Sensor
            </Button>
          )}
        </div>
      </div>

      {/* 2. KPI Summary Bar */}
      <div className="px-4 sm:px-6 py-2.5 bg-[#111317] border-b border-[#23262B] flex flex-wrap items-center gap-4 text-xs font-mono-num text-[#A9ACB1] shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[#6C727A]">Total Sensors:</span>
          <span className="text-white font-semibold">{totalCount}</span>
        </div>
        <div className="w-px h-3 bg-[#23262B]" />
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#00FF88] inline-block" />
          <span className="text-[#6C727A]">Online:</span>
          <span className="text-white font-semibold">{onlineCount}</span>
        </div>
        <div className="w-px h-3 bg-[#23262B]" />
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#FF4D4D] inline-block" />
          <span className="text-[#6C727A]">Issues / Offline:</span>
          <span className={issueCount > 0 ? 'text-[#FF4D4D] font-semibold' : 'text-white'}>
            {issueCount}
          </span>
        </div>
        <div className="w-px h-3 bg-[#23262B]" />
        <div className="flex items-center gap-2">
          <Cpu className="w-3.5 h-3.5 text-[#007AFF]" />
          <span className="text-[#6C727A]">AI Inference Active:</span>
          <span className="text-white font-semibold">{aiPipelineCount}</span>
        </div>
        <div className="w-px h-3 bg-[#23262B]" />
        <div className="flex items-center gap-2">
          <Compass className="w-3.5 h-3.5 text-[#007AFF]" />
          <span className="text-[#6C727A]">PTZ Slew Units:</span>
          <span className="text-white font-semibold">{ptzCapableCount}</span>
        </div>
      </div>

      {/* 3. Main Camera Inventory Content */}
      <div className="flex-1 p-4 sm:p-6 overflow-y-auto">
        {filteredCameras.length === 0 ? (
          <EmptyState
            icon={<CameraIcon className="w-6 h-6" />}
            title={search || selectedSector !== 'ALL' || selectedStatus !== 'ALL' ? 'No Matching Sensors' : 'No Cameras Configured'}
            description="Adjust your search query or filter parameters to locate surveillance devices."
          />
        ) : (
          <div className="bg-[#0F1115] border border-[#23262B] rounded overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[#23262B] bg-[#14161A] text-[11px] font-mono-num uppercase tracking-wider text-[#6C727A]">
                    <th className="p-3 font-medium">Identifier & Type</th>
                    <th className="p-3 font-medium">Name & Location</th>
                    <th className="p-3 font-medium">Stream Telemetry</th>
                    <th className="p-3 font-medium">Hardware Model</th>
                    <th className="p-3 font-medium">Health Status</th>
                    <th className="p-3 font-medium">Analytics</th>
                    <th className="p-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#23262B]">
                  {filteredCameras.map((cam) => {
                    const isSelected = activeCamera?.id === cam.id;
                    const isDecom = cam.isDecommissioned;

                    return (
                      <tr
                        key={cam.id}
                        onClick={() => setActiveCamera(cam)}
                        className={`hover:bg-[#1A1D23] cursor-pointer transition-colors ${
                          isSelected ? 'bg-[#1A1D23]' : ''
                        } ${isDecom ? 'opacity-60 bg-[#121316]' : ''}`}
                      >
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <CameraIcon className={`w-3.5 h-3.5 ${isDecom ? 'text-[#6C727A]' : 'text-[#007AFF]'}`} />
                            <span className="font-mono-num font-bold text-white">
                              {cam.identifier || cam.cameraId}
                            </span>
                            {isDecom && (
                              <Badge variant="offline" size="sm">
                                Decommissioned
                              </Badge>
                            )}
                          </div>
                          <span className="text-[10px] font-mono-num text-[#6C727A] mt-0.5 block">
                            {cam.cameraType ? cam.cameraType.replace('_', ' ') : cam.resolution}
                          </span>
                        </td>

                        <td className="p-3">
                          <div className="font-medium text-white">{cam.name}</div>
                          <div className="text-[11px] text-[#6C727A] mt-0.5">
                            {cam.sectorName || 'Sector'} {cam.siteName ? `· ${cam.siteName}` : ''}
                          </div>
                        </td>

                        <td className="p-3 font-mono-num">
                          <div className="text-white">
                            {formatFps(cam.currentFps)} · {formatLatency(cam.currentLatencyMs)}
                          </div>
                          <div className="text-[10px] text-[#6C727A] mt-0.5">
                            {cam.protocol || 'RTSP'} · {cam.codec || 'H.265'}
                          </div>
                        </td>

                        <td className="p-3">
                          <div className="text-white">{cam.model}</div>
                          <div className="text-[10px] font-mono-num text-[#6C727A] mt-0.5">
                            FW: {cam.firmwareVersion || 'v1.0'} {cam.isPtSupported ? '· PTZ' : ''}
                          </div>
                        </td>

                        <td className="p-3">
                          <StatusIndicator status={cam.status} size="sm" />
                          {cam.statusDetail && (
                            <div className="text-[10px] text-[#FF4D4D] mt-0.5 max-w-[180px] truncate">
                              {cam.statusDetail}
                            </div>
                          )}
                        </td>

                        <td className="p-3">
                          {cam.aiPipelineEnabled ? (
                            <Badge variant="healthy" size="sm">
                              Active
                            </Badge>
                          ) : (
                            <Badge variant="offline" size="sm">
                              Standby
                            </Badge>
                          )}
                        </td>

                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="subtle"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveCamera(cam);
                              }}
                            >
                              Dossier
                            </Button>
                            {!isDecom && (
                              <Button
                                variant="primary"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onSelectCamera(cam);
                                }}
                                leftIcon={<Video className="w-3 h-3" />}
                              >
                                Live
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* 4. Comprehensive Camera Management Drawer */}
      <CameraDetailDrawer
        isOpen={!!activeCamera}
        camera={activeCamera}
        sectors={sectors}
        currentUser={currentUser || null}
        onClose={() => setActiveCamera(null)}
        onSelectCameraForFeed={(cam) => onSelectCamera(cam)}
        onCameraUpdated={handleCameraUpdated}
        onPtzPreset={onPtzPreset}
      />

      {/* 5. Register/Commission Camera Modal */}
      <RegisterCameraModal
        isOpen={isRegisterModalOpen}
        onClose={() => setIsRegisterModalOpen(false)}
        sectors={sectors}
        existingCameras={safeCameras}
        onRegisterCamera={handleRegisterCamera}
      />
    </div>
  );
};
