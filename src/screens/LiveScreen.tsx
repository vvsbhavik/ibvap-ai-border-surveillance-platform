import React, { useState } from 'react';
import {
  Grid,
  Square,
  LayoutGrid,
  Grid3X3,
  Sliders,
  Maximize2,
  Filter,
  Eye,
  EyeOff,
  Layers,
  Sparkles,
  Compass,
  Navigation,
  Route,
  Tag,
  Shield,
  Zap,
} from 'lucide-react';
import { Camera, Sector } from '../server/types';
import { CameraTile } from '../components/camera/CameraTile';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { tokens } from '../design-system/tokens';
import { api } from '../api/client';

export interface LiveScreenProps {
  cameras: Camera[];
  sectors: Sector[];
  onSelectCamera: (camera: Camera) => void;
}

export const LiveScreen: React.FC<LiveScreenProps> = ({
  cameras,
  sectors,
  onSelectCamera,
}) => {
  const [layout, setLayout] = useState<'1x1' | '2x2' | '3x3' | 'custom'>('2x2');
  const [selectedSector, setSelectedSector] = useState('ALL');
  const [showAiOverlays, setShowAiOverlays] = useState(true);
  const [showZones, setShowZones] = useState(true);
  const [showTrackId, setShowTrackId] = useState(true);
  const [showTrajectory, setShowTrajectory] = useState(true);
  const [showDirection, setShowDirection] = useState(true);
  const [trackFilterState, setTrackFilterState] = useState<'ALL' | 'ACTIVE' | 'LOST'>('ALL');
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [maximizedCamera, setMaximizedCamera] = useState<Camera | null>(null);
  const [activeTestScene, setActiveTestScene] = useState<string>('DEFAULT');
  const [testSceneStatus, setTestSceneStatus] = useState<string | null>(null);

  const handleTestSceneChange = async (scene: string) => {
    setActiveTestScene(scene);
    try {
      // Apply to primary surveillance camera CAM-01
      const res = await api.video.setTestScene('cam-01', scene);
      if (res.success) {
        setTestSceneStatus(`Scene switched to: ${scene}`);
        setTimeout(() => setTestSceneStatus(null), 3000);
      }
    } catch (err: any) {
      console.warn('Failed to switch test scene:', err);
    }
  };

  const filteredCameras = cameras.filter((c) => {
    const matchSec = selectedSector === 'ALL' || c.sectorId === selectedSector;
    const matchOnline = !onlineOnly || c.status === 'ONLINE';
    return matchSec && matchOnline;
  });

  const displayLimit = layout === '1x1' ? 1 : layout === '2x2' ? 4 : layout === '3x3' ? 9 : 12;
  const activeCameras = filteredCameras.slice(0, displayLimit);

  return (
    <div className="flex-1 flex flex-col gap-3 p-4 sm:p-5 overflow-y-auto select-none">
      {/* Unified Surveillance Operations Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-[#23262B] pb-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <h1 className="text-base font-semibold text-white tracking-tight">
              Live Monitoring Wall
            </h1>
            <span className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              FEEDS ACTIVE
            </span>
          </div>

          <div className="h-4 w-px bg-[#23262B]" />

          {/* Sector Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-[#8A8F98]">Sector:</span>
            <select
              value={selectedSector}
              onChange={(e) => setSelectedSector(e.target.value)}
              className="h-7 text-xs bg-[#14161A] text-white border border-[#23262B] hover:border-[#3A3F4A] rounded px-2 pr-6 appearance-none cursor-pointer focus:outline-hidden focus:border-[#007AFF] transition-colors"
            >
              <option value="ALL">All Sectors</option>
              {sectors.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} • {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Overlay Toggles */}
          <div className="flex items-center bg-[#14161A] border border-[#23262B] rounded p-0.5">
            <button
              type="button"
              onClick={() => setShowAiOverlays(!showAiOverlays)}
              className={`px-2.5 py-1 text-xs rounded transition-colors cursor-pointer flex items-center gap-1.5 ${
                showAiOverlays
                  ? 'bg-[#007AFF]/20 text-[#007AFF] font-medium'
                  : 'text-[#8A8F98] hover:text-white'
              }`}
              title="Toggle AI Detection Bounding Boxes"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>AI</span>
            </button>
            <button
              type="button"
              onClick={() => setShowZones(!showZones)}
              className={`px-2.5 py-1 text-xs rounded transition-colors cursor-pointer flex items-center gap-1.5 ${
                showZones
                  ? 'bg-[#38BDF8]/20 text-[#38BDF8] font-medium'
                  : 'text-[#8A8F98] hover:text-white'
              }`}
              title="Toggle Virtual Fences & Zones"
            >
              <Shield className="w-3.5 h-3.5" />
              <span>Zones</span>
            </button>
            <button
              type="button"
              onClick={() => setShowTrajectory(!showTrajectory)}
              className={`px-2.5 py-1 text-xs rounded transition-colors cursor-pointer flex items-center gap-1.5 ${
                showTrajectory
                  ? 'bg-[#34C759]/20 text-[#34C759] font-medium'
                  : 'text-[#8A8F98] hover:text-white'
              }`}
              title="Toggle Trajectory Trails"
            >
              <Route className="w-3.5 h-3.5" />
              <span>Trails</span>
            </button>
          </div>

          {/* Scenario Simulation Runner for CAM-01 */}
          <div className="flex items-center gap-1.5 bg-[#14161A] border border-[#23262B] rounded px-2 h-7">
            <Zap className="w-3 h-3 text-[#FF9500]" />
            <select
              value={activeTestScene}
              onChange={(e) => handleTestSceneChange(e.target.value)}
              className="text-xs bg-transparent text-[#E0E2E6] border-none outline-hidden cursor-pointer"
              title="Select simulated movement scenario for CAM-01 testing"
            >
              <option value="DEFAULT" className="bg-[#14161A] text-white">Scenario: Normal Patrol</option>
              <option value="PERSON_CROSSING_FENCE" className="bg-[#14161A] text-amber-300">Scenario: Fence Cross</option>
              <option value="PERSON_ENTERING_ZONE" className="bg-[#14161A] text-red-300">Scenario: Zone Breach</option>
              <option value="PERSON_EXITING_ZONE" className="bg-[#14161A] text-blue-300">Scenario: Zone Exit</option>
              <option value="TWO_PERSONS_CROSSING" className="bg-[#14161A] text-red-400">Scenario: Multiple Persons</option>
            </select>
          </div>

          {/* Grid Layout Toggles */}
          <div className="flex items-center bg-[#14161A] border border-[#23262B] rounded p-0.5">
            <button
              type="button"
              onClick={() => setLayout('1x1')}
              className={`p-1.5 rounded cursor-pointer transition-colors ${
                layout === '1x1' ? 'bg-[#1A1D23] text-white' : 'text-[#8A8F98] hover:text-white'
              }`}
              title="1x1 Solo Focus"
            >
              <Square className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setLayout('2x2')}
              className={`p-1.5 rounded cursor-pointer transition-colors ${
                layout === '2x2' ? 'bg-[#1A1D23] text-white' : 'text-[#8A8F98] hover:text-white'
              }`}
              title="2x2 Quad Grid"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setLayout('3x3')}
              className={`p-1.5 rounded cursor-pointer transition-colors ${
                layout === '3x3' ? 'bg-[#1A1D23] text-white' : 'text-[#8A8F98] hover:text-white'
              }`}
              title="3x3 Matrix Grid"
            >
              <Grid3X3 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Video Wall Grid */}
      <div
        className={
          layout === '1x1'
            ? 'grid grid-cols-1 max-w-4xl mx-auto w-full gap-4'
            : layout === '2x2'
            ? 'grid grid-cols-1 md:grid-cols-2 gap-3.5'
            : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3'
        }
      >
        {activeCameras.map((cam) => (
          <CameraTile
            key={cam.id}
            camera={cam}
            showAiOverlays={showAiOverlays}
            showZones={showZones}
            showTrackId={showTrackId}
            showTrajectory={showTrajectory}
            showDirection={showDirection}
            filterState={trackFilterState}
            onSelect={onSelectCamera}
            onMaximize={(c) => setMaximizedCamera(c)}
          />
        ))}
      </div>

      {/* Maximized Camera Feed Modal */}
      {maximizedCamera && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-xs">
          <div className="w-full max-w-5xl bg-slate-900 border border-slate-700 rounded-sm overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-950">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold font-mono-num text-cyan-400">
                  {maximizedCamera.identifier}
                </span>
                <span className="text-xs font-semibold text-slate-200">{maximizedCamera.name}</span>
                <span className="text-[10px] font-mono-num text-slate-400">
                  {maximizedCamera.sectorName}
                </span>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setMaximizedCamera(null)}>
                Exit Maximize
              </Button>
            </div>
            <div className="relative aspect-video bg-black flex items-center justify-center">
              <img
                src={maximizedCamera.thumbnailUrl}
                alt={maximizedCamera.name}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
              <div className="absolute bottom-3 left-3 bg-slate-950/80 border border-slate-800 px-2 py-1 text-xs font-mono-num text-slate-300">
                LIVE RTSP FEED • {maximizedCamera.resolution} • {maximizedCamera.currentFps} FPS • {maximizedCamera.currentLatencyMs}ms
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
