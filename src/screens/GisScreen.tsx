import React, { useState, useEffect } from 'react';
import {
  Map as MapIcon,
  Layers,
  Camera as CameraIcon,
  Compass,
  Eye,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Shield,
  Activity,
  Server,
  Sliders,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import { Camera, Sector, Zone } from '../server/types';
import { GisOperationalContext, CameraGeographicProfile } from '../gis/types';
import { GisMapCanvas, GisMapLayers } from '../gis/components/GisMapCanvas';
import { CameraTrustInspector } from '../gis/components/CameraTrustInspector';
import { DigitalTwinControls } from '../gis/components/DigitalTwinControls';
import { EdgeNodesDrawer } from '../gis/components/EdgeNodesDrawer';
import { Button } from '../components/ui/Button';
import { StatusIndicator } from '../components/ui/StatusIndicator';
import { formatFps, formatLatency } from '../utils/formatters';

export interface GisScreenProps {
  cameras: Camera[];
  sectors: Sector[];
  zones: Zone[];
  onSelectCamera: (cam: Camera) => void;
}

export const GisScreen: React.FC<GisScreenProps> = ({
  cameras,
  sectors,
  zones,
  onSelectCamera,
}) => {
  const safeCameras = Array.isArray(cameras) ? cameras : [];
  const [gisContext, setGisContext] = useState<GisOperationalContext | null>(null);
  const [selectedCameraId, setSelectedCameraId] = useState<string>(
    safeCameras[0]?.cameraId || safeCameras[0]?.id || 'CAM-01'
  );
  const [activeTab, setActiveTab] = useState<'MAP' | 'SIMULATION' | 'EDGE'>('MAP');
  const [activeSectorId, setActiveSectorId] = useState<string>('ALL');
  const [zoomLevel, setZoomLevel] = useState<number>(1);

  // Layer Visibility Filters
  const [layers, setLayers] = useState<GisMapLayers>({
    showFovCones: true,
    showSectors: true,
    showZones: true,
    showFences: true,
    showCorridors: true,
    showRoutes: true,
    showIncidents: true,
    showAlerts: true,
    showSimulatedActors: true,
  });

  const fetchGisContext = async () => {
    try {
      const res = await fetch('/api/v1/gis/context');
      if (!res.ok) return;
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) return;
      const json = await res.json();
      if (json.success && json.data) {
        setGisContext(json.data);
      }
    } catch {
      // Soft fail on network/rate-limit throttle
    }
  };

  useEffect(() => {
    fetchGisContext();
    const interval = setInterval(fetchGisContext, 20000);
    return () => clearInterval(interval);
  }, []);

  const selectedCamera = safeCameras.find(
    (c) => c.cameraId === selectedCameraId || c.id === selectedCameraId
  ) || safeCameras[0] || null;

  const handleSelectCameraProfile = (camProfile: CameraGeographicProfile) => {
    setSelectedCameraId(camProfile.cameraId);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0A0B0D] overflow-hidden">
      {/* 1. Sub-Header Toolbar */}
      <div className="p-3.5 sm:px-6 bg-[#0F1115] border-b border-[#23262B] flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0 select-none">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold text-white">GIS Operational Command Map</h1>
            <span className="px-2 py-0.5 bg-[#14161A] border border-[#23262B] text-[#A9ACB1] rounded text-[11px] font-mono-num font-medium">
              {gisContext?.summary.totalCameras ?? safeCameras.length} Surveillance Masts
            </span>
            <span className="px-1.5 py-0.5 text-[10px] font-mono-num font-bold bg-[#FF9500]/15 text-[#FF9500] border border-[#FF9500]/30 rounded">
              SIMULATED MAP DATA
            </span>
          </div>
          <p className="text-xs text-[#6C727A] mt-0.5">
            Geospatial surveillance coverage, terrain elevation, optical health telemetry, and border resilience
          </p>
        </div>

        {/* View Mode Switcher Tabs */}
        <div className="flex items-center gap-2">
          <div className="flex bg-[#14161A] p-0.5 rounded border border-[#23262B]">
            <button
              onClick={() => setActiveTab('MAP')}
              className={`px-3 py-1 text-xs rounded font-medium transition-colors flex items-center gap-1.5 ${
                activeTab === 'MAP'
                  ? 'bg-[#007AFF] text-white'
                  : 'text-[#A9ACB1] hover:text-white'
              }`}
            >
              <MapIcon className="w-3.5 h-3.5" />
              Command Map
            </button>
            <button
              onClick={() => setActiveTab('SIMULATION')}
              className={`px-3 py-1 text-xs rounded font-medium transition-colors flex items-center gap-1.5 ${
                activeTab === 'SIMULATION'
                  ? 'bg-[#007AFF] text-white'
                  : 'text-[#A9ACB1] hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              Digital Twin (A–J)
            </button>
            <button
              onClick={() => setActiveTab('EDGE')}
              className={`px-3 py-1 text-xs rounded font-medium transition-colors flex items-center gap-1.5 ${
                activeTab === 'EDGE'
                  ? 'bg-[#007AFF] text-white'
                  : 'text-[#A9ACB1] hover:text-white'
              }`}
            >
              <Server className="w-3.5 h-3.5" />
              Edge Nodes
            </button>
          </div>

          {/* Zoom controls */}
          <div className="flex items-center bg-[#14161A] border border-[#23262B] rounded px-1 h-8">
            <button
              type="button"
              onClick={() => setZoomLevel((z) => Math.max(0.7, z - 0.1))}
              className="p-1 text-[#6C727A] hover:text-white transition-colors"
              title="Zoom out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[11px] font-mono-num px-1.5 text-[#A9ACB1]">
              {(zoomLevel * 100).toFixed(0)}%
            </span>
            <button
              type="button"
              onClick={() => setZoomLevel((z) => Math.min(1.6, z + 0.1))}
              className="p-1 text-[#6C727A] hover:text-white transition-colors"
              title="Zoom in"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* 2. Secondary Layer Toggles Toolbar (When in MAP mode) */}
      {activeTab === 'MAP' && (
        <div className="px-4 py-2 bg-[#121418] border-b border-[#23262B] flex flex-wrap items-center justify-between gap-2 text-xs select-none">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-mono-num text-[#6C727A] mr-1 uppercase">Layers:</span>
            <button
              onClick={() => setLayers((l) => ({ ...l, showFovCones: !l.showFovCones }))}
              className={`px-2 py-1 rounded text-[11px] font-mono-num border transition-colors ${
                layers.showFovCones
                  ? 'bg-[#007AFF]/20 border-[#007AFF]/40 text-[#007AFF]'
                  : 'bg-[#14161A] border-[#23262B] text-[#6C727A]'
              }`}
            >
              FOV Arcs
            </button>
            <button
              onClick={() => setLayers((l) => ({ ...l, showSectors: !l.showSectors }))}
              className={`px-2 py-1 rounded text-[11px] font-mono-num border transition-colors ${
                layers.showSectors
                  ? 'bg-[#007AFF]/20 border-[#007AFF]/40 text-[#007AFF]'
                  : 'bg-[#14161A] border-[#23262B] text-[#6C727A]'
              }`}
            >
              Sectors
            </button>
            <button
              onClick={() => setLayers((l) => ({ ...l, showZones: !l.showZones }))}
              className={`px-2 py-1 rounded text-[11px] font-mono-num border transition-colors ${
                layers.showZones
                  ? 'bg-[#007AFF]/20 border-[#007AFF]/40 text-[#007AFF]'
                  : 'bg-[#14161A] border-[#23262B] text-[#6C727A]'
              }`}
            >
              Buffer Zones
            </button>
            <button
              onClick={() => setLayers((l) => ({ ...l, showFences: !l.showFences }))}
              className={`px-2 py-1 rounded text-[11px] font-mono-num border transition-colors ${
                layers.showFences
                  ? 'bg-[#FF4D4D]/20 border-[#FF4D4D]/40 text-[#FF4D4D]'
                  : 'bg-[#14161A] border-[#23262B] text-[#6C727A]'
              }`}
            >
              Virtual Fence
            </button>
            <button
              onClick={() => setLayers((l) => ({ ...l, showCorridors: !l.showCorridors }))}
              className={`px-2 py-1 rounded text-[11px] font-mono-num border transition-colors ${
                layers.showCorridors
                  ? 'bg-[#007AFF]/20 border-[#007AFF]/40 text-[#007AFF]'
                  : 'bg-[#14161A] border-[#23262B] text-[#6C727A]'
              }`}
            >
              Corridors
            </button>
            <button
              onClick={() => setLayers((l) => ({ ...l, showRoutes: !l.showRoutes }))}
              className={`px-2 py-1 rounded text-[11px] font-mono-num border transition-colors ${
                layers.showRoutes
                  ? 'bg-[#FF9500]/20 border-[#FF9500]/40 text-[#FF9500]'
                  : 'bg-[#14161A] border-[#23262B] text-[#6C727A]'
              }`}
            >
              Reconstructed Routes
            </button>
            <button
              onClick={() => setLayers((l) => ({ ...l, showIncidents: !l.showIncidents }))}
              className={`px-2 py-1 rounded text-[11px] font-mono-num border transition-colors ${
                layers.showIncidents
                  ? 'bg-[#FF4D4D]/20 border-[#FF4D4D]/40 text-[#FF4D4D]'
                  : 'bg-[#14161A] border-[#23262B] text-[#6C727A]'
              }`}
            >
              Incidents ({gisContext?.summary.activeIncidents ?? 0})
            </button>
          </div>

          <div className="flex items-center gap-3 font-mono-num text-[11px] text-[#A9ACB1]">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#34C759]" />
              {gisContext?.summary.onlineCameras ?? 0} Online
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#FF9500]" />
              {gisContext?.summary.degradedCameras ?? 0} Degraded
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#FF4D4D]" />
              {gisContext?.summary.anomalyCameras ?? 0} Anomaly
            </span>
          </div>
        </div>
      )}

      {/* 3. Main Workspace Layout */}
      <div className="flex-1 p-3 sm:p-5 overflow-hidden grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left / Center: Interactive SVG Vector Map (8 Cols) */}
        <div className="lg:col-span-8 bg-[#0F1115] border border-[#23262B] rounded-lg relative overflow-hidden flex items-center justify-center min-h-[440px]">
          <GisMapCanvas
            context={gisContext}
            selectedCameraId={selectedCameraId}
            layers={layers}
            zoomLevel={zoomLevel}
            onSelectCamera={handleSelectCameraProfile}
          />
        </div>

        {/* Right Panel: Contextual Drawer (4 Cols) */}
        <div className="lg:col-span-4 flex flex-col h-full overflow-y-auto pr-1">
          {activeTab === 'MAP' && selectedCamera && (
            <CameraTrustInspector
              camera={selectedCamera}
              onSelectFeed={(cam) => onSelectCamera(cam)}
            />
          )}

          {activeTab === 'SIMULATION' && (
            <DigitalTwinControls onScenarioUpdated={fetchGisContext} />
          )}

          {activeTab === 'EDGE' && (
            <EdgeNodesDrawer onStatusChanged={fetchGisContext} />
          )}
        </div>
      </div>
    </div>
  );
};
