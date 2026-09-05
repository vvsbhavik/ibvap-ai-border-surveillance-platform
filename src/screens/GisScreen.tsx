import React, { useState } from 'react';
import {
  Map as MapIcon,
  Layers,
  Camera as CameraIcon,
  Compass,
  Eye,
  ZoomIn,
  ZoomOut,
  Maximize2,
} from 'lucide-react';
import { Camera, Sector, Zone } from '../server/types';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
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
  const [selectedCamera, setSelectedCamera] = useState<Camera | null>(safeCameras[0] || null);
  const [showFovCones, setShowFovCones] = useState(true);
  const [showVirtualFence, setShowVirtualFence] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [activeSectorId, setActiveSectorId] = useState<string>('ALL');

  // Convert GPS coordinates roughly into SVG map viewport (31.3 to 31.4 Lat, -110.9 to -111.0 Lon)
  const mapWidth = 900;
  const mapHeight = 520;

  const projectCoord = (lat: number, lon: number) => {
    const x = ((lon - -111.02) / 0.12) * mapWidth;
    const y = ((31.37 - lat) / 0.08) * mapHeight;
    return {
      x: Math.max(50, Math.min(mapWidth - 50, x)),
      y: Math.max(50, Math.min(mapHeight - 50, y)),
    };
  };

  const filteredCameras = safeCameras.filter(
    (c) => activeSectorId === 'ALL' || c.sectorId === activeSectorId
  );

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0A0B0D] overflow-hidden">
      {/* 1. Sub-Header Toolbar */}
      <div className="p-4 sm:px-6 bg-[#0F1115] border-b border-[#23262B] flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0 select-none">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold text-white">GIS Operational Map</h1>
            <span className="px-2 py-0.5 bg-[#14161A] border border-[#23262B] text-[#A9ACB1] rounded text-[11px] font-mono-num font-medium">
              {filteredCameras.length} Plotted Sensors
            </span>
            <span className="px-1.5 py-0.5 text-[10px] font-mono-num font-semibold bg-[#007AFF]/15 text-[#007AFF] border border-[#007AFF]/30 rounded">
              SIMULATED MAP DATA
            </span>
          </div>
          <p className="text-xs text-[#6C727A] mt-0.5">
            Geographic camera positions, surveillance coverage arcs, and virtual perimeter boundaries
          </p>
        </div>

        {/* Map View Controls & Filter */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={activeSectorId}
            onChange={(e) => setActiveSectorId(e.target.value)}
            className="h-8 px-2.5 bg-[#14161A] border border-[#23262B] rounded text-xs text-white focus:outline-none focus:border-[#007AFF]"
          >
            <option value="ALL">All Sectors</option>
            {sectors.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          <Button
            variant={showFovCones ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setShowFovCones(!showFovCones)}
          >
            Coverage Arcs
          </Button>

          <Button
            variant={showVirtualFence ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setShowVirtualFence(!showVirtualFence)}
          >
            Virtual Fence
          </Button>

          <div className="flex items-center bg-[#14161A] border border-[#23262B] rounded px-1 h-8">
            <button
              type="button"
              onClick={() => setZoomLevel((z) => Math.max(0.8, z - 0.1))}
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
              onClick={() => setZoomLevel((z) => Math.min(1.5, z + 0.1))}
              className="p-1 text-[#6C727A] hover:text-white transition-colors"
              title="Zoom in"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* 2. Main Map Workspace Layout */}
      <div className="flex-1 p-4 sm:p-6 overflow-hidden grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* SVG Vector Map Container (8 Cols) */}
        <div className="lg:col-span-8 bg-[#0F1115] border border-[#23262B] rounded relative overflow-hidden flex items-center justify-center min-h-[420px]">
          <svg
            viewBox={`0 0 ${mapWidth} ${mapHeight}`}
            className="w-full h-full object-contain"
            style={{ transform: `scale(${zoomLevel})`, transition: 'transform 0.2s ease' }}
          >
            <defs>
              <pattern id="gisGrid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1A1D23" strokeWidth="0.75" />
              </pattern>
            </defs>

            {/* Grid Background */}
            <rect width={mapWidth} height={mapHeight} fill="url(#gisGrid)" />

            {/* Border Buffer Zone Polygon */}
            <path
              d="M 50 180 Q 250 210, 480 200 T 850 230 L 850 310 Q 520 300, 260 290 T 50 270 Z"
              fill="rgba(0, 122, 255, 0.04)"
              stroke="rgba(0, 122, 255, 0.2)"
              strokeWidth="1.5"
              strokeDasharray="4 4"
            />
            <text x="80" y="240" fill="#6C727A" fontSize="10" fontFamily="sans-serif" letterSpacing="1">
              PERIMETER BUFFER ZONE
            </text>

            {/* Virtual Fence Line */}
            {showVirtualFence && (
              <g>
                <path
                  d="M 50 220 Q 250 250, 480 240 T 850 270"
                  fill="none"
                  stroke="#FF4D4D"
                  strokeWidth="2"
                  strokeDasharray="6 4"
                />
                <text x="660" y="255" fill="#FF4D4D" fontSize="10" fontFamily="sans-serif" fontWeight="bold">
                  PERIMETER TRIPWIRE
                </text>
              </g>
            )}

            {/* Camera FOV Cones & Markers */}
            {filteredCameras.map((cam, idx) => {
              const { x, y } = projectCoord(cam.latitude, cam.longitude);
              const isSelected = selectedCamera?.id === cam.id;
              const isAnomaly = cam.status === 'INTEGRITY_ANOMALY';

              return (
                <g
                  key={cam.id}
                  className="cursor-pointer"
                  onClick={() => {
                    setSelectedCamera(cam);
                  }}
                >
                  {/* FOV Cone */}
                  {showFovCones && (
                    <path
                      d={`M ${x} ${y} L ${x - 45} ${y - 65} A 65 65 0 0 1 ${x + 45} ${y - 65} Z`}
                      fill={
                        isAnomaly
                          ? 'rgba(255, 77, 77, 0.15)'
                          : isSelected
                          ? 'rgba(0, 122, 255, 0.25)'
                          : 'rgba(52, 199, 89, 0.1)'
                      }
                      stroke={
                        isAnomaly
                          ? '#FF4D4D'
                          : isSelected
                          ? '#007AFF'
                          : '#34C759'
                      }
                      strokeWidth="1"
                      strokeDasharray={isAnomaly ? '3 3' : undefined}
                    />
                  )}

                  {/* Camera Marker Dot */}
                  <circle
                    cx={x}
                    cy={y}
                    r={isSelected ? '6' : '4.5'}
                    fill={isAnomaly ? '#FF4D4D' : isSelected ? '#007AFF' : '#34C759'}
                    stroke="#0A0B0D"
                    strokeWidth="1.5"
                  />

                  {/* Label */}
                  <text
                    x={x + 8}
                    y={y + 4}
                    fill={isSelected ? '#007AFF' : '#E0E2E6'}
                    fontSize="10"
                    fontFamily="monospace"
                    fontWeight="bold"
                  >
                    {cam.identifier}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Compass Rose overlay */}
          <div className="absolute top-3 right-3 bg-[#0F1115]/90 border border-[#23262B] p-2 rounded flex flex-col items-center pointer-events-none">
            <Compass className="w-4 h-4 text-[#007AFF]" />
            <span className="text-[9px] font-mono-num text-[#6C727A] mt-0.5">NORTH 000°</span>
          </div>

          {/* Map Status Indicator */}
          <div className="absolute bottom-3 left-3 bg-[#0F1115]/90 border border-[#23262B] px-2.5 py-1 rounded text-[11px] font-mono-num text-[#A9ACB1] pointer-events-none">
            WGS84 Coordinates · Nogales West Sector
          </div>
        </div>

        {/* Selected Camera Inspector (4 Cols) */}
        <div className="lg:col-span-4 flex flex-col h-full overflow-y-auto">
          {selectedCamera ? (
            <div className="p-4 bg-[#0F1115] border border-[#23262B] rounded space-y-3.5">
              <div className="flex items-center justify-between border-b border-[#23262B] pb-2.5">
                <div>
                  <span className="text-xs font-mono-num font-bold text-[#007AFF]">
                    {selectedCamera.identifier}
                  </span>
                  <h3 className="text-xs font-semibold text-white">{selectedCamera.name}</h3>
                </div>
                <StatusIndicator status={selectedCamera.status} size="sm" />
              </div>

              {/* Feed Thumbnail */}
              <div className="relative aspect-video bg-black rounded overflow-hidden border border-[#23262B]">
                <img
                  src={selectedCamera.thumbnailUrl || 'https://images.unsplash.com/photo-1541888946425-d0fbb186244f?w=800&auto=format&fit=crop&q=80'}
                  alt={selectedCamera.name}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
                <div className="absolute bottom-2 left-2 bg-[#0F1115]/90 px-2 py-0.5 rounded text-[10px] font-mono-num text-white">
                  {formatFps(selectedCamera.currentFps)} · {formatLatency(selectedCamera.currentLatencyMs)}
                </div>
              </div>

              {/* Spatial Metadata */}
              <div className="p-3 bg-[#14161A] border border-[#23262B] rounded space-y-2 font-mono-num text-xs text-[#6C727A]">
                <div className="flex justify-between">
                  <span>Sector:</span>
                  <span className="text-white">{selectedCamera.sectorName}</span>
                </div>
                {selectedCamera.zoneName && (
                  <div className="flex justify-between">
                    <span>Zone:</span>
                    <span className="text-white">{selectedCamera.zoneName}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Latitude:</span>
                  <span className="text-white">{selectedCamera.latitude.toFixed(5)}° N</span>
                </div>
                <div className="flex justify-between">
                  <span>Longitude:</span>
                  <span className="text-white">{selectedCamera.longitude.toFixed(5)}° W</span>
                </div>
                <div className="flex justify-between">
                  <span>Azimuth / FOV:</span>
                  <span className="text-white">
                    {selectedCamera.azimuthDegrees}° / {selectedCamera.fieldOfViewDegrees}°
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Model:</span>
                  <span className="text-white">{selectedCamera.model}</span>
                </div>
              </div>

              <Button
                variant="primary"
                size="sm"
                className="w-full"
                onClick={() => onSelectCamera(selectedCamera)}
                leftIcon={<Eye className="w-3.5 h-3.5" />}
              >
                Switch to Live Feed
              </Button>
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-[#6C727A] border border-[#23262B] bg-[#0F1115] rounded">
              Click any camera marker on the map to inspect spatial telemetry and coverage arcs.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
