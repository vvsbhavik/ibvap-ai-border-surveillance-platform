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
      {/* Top Controls Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold tracking-wider uppercase text-slate-100">
              Live Monitoring Wall
            </h1>
            <span className="px-1.5 py-0.5 text-[10px] font-mono-num font-semibold bg-[#007AFF]/15 text-[#007AFF] border border-[#007AFF]/30 rounded">
              SIMULATED VIDEO FEEDS
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Simulated multi-angle border surveillance streams • Edge analytics bounding overlays
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* AI Bounding Box Overlays */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAiOverlays(!showAiOverlays)}
            leftIcon={showAiOverlays ? <Eye className="w-3.5 h-3.5 text-cyan-400" /> : <EyeOff className="w-3.5 h-3.5" />}
          >
            {showAiOverlays ? 'AI Overlays ON' : 'AI Overlays OFF'}
          </Button>

          {/* Virtual Fences & Zones Overlay Toggle */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowZones(!showZones)}
            leftIcon={<Shield className={`w-3.5 h-3.5 ${showZones ? 'text-[#38BDF8]' : 'text-slate-400'}`} />}
          >
            {showZones ? 'Fences & Zones ON' : 'Fences & Zones OFF'}
          </Button>

          {/* Scenario Simulation Runner for CAM-01 */}
          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700/80 rounded-xs px-2 py-0.5">
            <Zap className="w-3 h-3 text-[#F59E0B]" />
            <span className="text-[10px] font-mono text-slate-400">CAM-01 Scene:</span>
            <select
              value={activeTestScene}
              onChange={(e) => handleTestSceneChange(e.target.value)}
              className="h-7 text-[11px] font-mono bg-transparent text-cyan-300 border-none outline-hidden cursor-pointer"
              title="Select synthetic scenario to test real spatial tracking, fence breaches, and zone events"
            >
              <option value="DEFAULT" className="bg-slate-900 text-slate-200">Default Patrol</option>
              <option value="PERSON_CROSSING_FENCE" className="bg-slate-900 text-amber-300">⚡ Cross Virtual Fence</option>
              <option value="PERSON_ENTERING_ZONE" className="bg-slate-900 text-red-300">🛡️ Enter Restricted Zone</option>
              <option value="PERSON_EXITING_ZONE" className="bg-slate-900 text-blue-300">🚪 Exit Restricted Zone</option>
              <option value="PERSON_PARALLEL_TO_FENCE" className="bg-slate-900 text-slate-300">↔ Parallel Movement (No Breach)</option>
              <option value="PERSON_TOUCHING_FENCE_BUT_NOT_CROSSING" className="bg-slate-900 text-yellow-300">⚠️ Fence Proximity / Boundary</option>
              <option value="TWO_PERSONS_CROSSING" className="bg-slate-900 text-red-400">👥 Two Persons Crossing</option>
              <option value="TEMPORARY_OCCLUSION_NEAR_ZONE" className="bg-slate-900 text-slate-300">👁️ Occlusion Near Zone</option>
            </select>
          </div>

          {/* Sector Filter */}
          <select
            value={selectedSector}
            onChange={(e) => setSelectedSector(e.target.value)}
            className="h-8 text-xs font-mono-num bg-slate-900 text-slate-200 border border-slate-700/80 rounded-xs px-2"
          >
            <option value="ALL">All Sectors</option>
            {sectors.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code}
              </option>
            ))}
          </select>

          {/* Grid Layout Toggles */}
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xs p-0.5">
            <button
              type="button"
              onClick={() => setLayout('1x1')}
              className={`p-1.5 rounded-xs cursor-pointer ${
                layout === '1x1' ? 'bg-slate-800 text-cyan-300' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="1x1 Solo Focus"
            >
              <Square className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setLayout('2x2')}
              className={`p-1.5 rounded-xs cursor-pointer ${
                layout === '2x2' ? 'bg-slate-800 text-cyan-300' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="2x2 Quad Grid"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setLayout('3x3')}
              className={`p-1.5 rounded-xs cursor-pointer ${
                layout === '3x3' ? 'bg-slate-800 text-cyan-300' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="3x3 Matrix Grid"
            >
              <Grid3X3 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Tracking HUD Controls Bar (Section 14) */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-1.5 bg-[#0F1115] border border-[#23262B] rounded text-xs">
        <div className="flex items-center gap-2">
          <Compass className="w-3.5 h-3.5 text-[#38BDF8]" />
          <span className="font-mono font-bold text-[11px] text-white">TRACKING CONTROLS</span>
          <span className="text-[10px] font-mono text-[#6C727A]">| Multi-Object Association</span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {/* Show/Hide Track IDs */}
          <button
            type="button"
            onClick={() => setShowTrackId(!showTrackId)}
            className={`px-2 py-0.5 rounded text-[10px] font-mono cursor-pointer border transition-colors ${
              showTrackId
                ? 'bg-[#0284C7]/20 border-[#38BDF8] text-[#38BDF8] font-bold'
                : 'bg-[#14161A] border-[#23262B] text-[#6C727A] hover:text-white'
            }`}
            title="Toggle persistent Track IDs (e.g. TRK-CAM-01-0001)"
          >
            Track IDs {showTrackId ? 'ON' : 'OFF'}
          </button>

          {/* Show/Hide Trajectory Trails */}
          <button
            type="button"
            onClick={() => setShowTrajectory(!showTrajectory)}
            className={`px-2 py-0.5 rounded text-[10px] font-mono cursor-pointer border transition-colors ${
              showTrajectory
                ? 'bg-[#0284C7]/20 border-[#38BDF8] text-[#38BDF8] font-bold'
                : 'bg-[#14161A] border-[#23262B] text-[#6C727A] hover:text-white'
            }`}
            title="Toggle historical trajectory vector trails"
          >
            Trails {showTrajectory ? 'ON' : 'OFF'}
          </button>

          {/* Show/Hide Heading / Velocity Vector */}
          <button
            type="button"
            onClick={() => setShowDirection(!showDirection)}
            className={`px-2 py-0.5 rounded text-[10px] font-mono cursor-pointer border transition-colors ${
              showDirection
                ? 'bg-[#0284C7]/20 border-[#38BDF8] text-[#38BDF8] font-bold'
                : 'bg-[#14161A] border-[#23262B] text-[#6C727A] hover:text-white'
            }`}
            title="Toggle heading compass direction indicator"
          >
            Direction {showDirection ? 'ON' : 'OFF'}
          </button>

          <div className="h-3.5 w-px bg-[#23262B] mx-1" />

          {/* Filter by track state (ACTIVE, LOST, ALL) */}
          <div className="flex items-center gap-1 bg-black/50 p-0.5 rounded border border-[#23262B]">
            {(['ALL', 'ACTIVE', 'LOST'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setTrackFilterState(st)}
                className={`px-1.5 py-0.2 rounded text-[9px] font-mono cursor-pointer ${
                  trackFilterState === st
                    ? 'bg-[#0284C7] text-white font-bold'
                    : 'text-[#6C727A] hover:text-white'
                }`}
              >
                {st}
              </button>
            ))}
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
