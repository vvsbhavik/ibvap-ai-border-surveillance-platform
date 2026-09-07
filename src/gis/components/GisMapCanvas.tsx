import React from 'react';
import { Compass } from 'lucide-react';
import {
  GisOperationalContext,
  CameraGeographicProfile,
  MapIncidentPin,
  MapAlertPin,
} from '../types';
import { calculateFovArcPath } from '../gis-math';

export interface GisMapLayers {
  showFovCones: boolean;
  showSectors: boolean;
  showZones: boolean;
  showFences: boolean;
  showCorridors: boolean;
  showRoutes: boolean;
  showIncidents: boolean;
  showAlerts: boolean;
  showSimulatedActors: boolean;
}

interface GisMapCanvasProps {
  context: GisOperationalContext | null;
  selectedCameraId: string | null;
  layers: GisMapLayers;
  zoomLevel: number;
  onSelectCamera: (cam: CameraGeographicProfile) => void;
  onSelectIncident?: (incident: MapIncidentPin) => void;
}

export const GisMapCanvas: React.FC<GisMapCanvasProps> = ({
  context,
  selectedCameraId,
  layers,
  zoomLevel,
  onSelectCamera,
  onSelectIncident,
}) => {
  const mapWidth = 960;
  const mapHeight = 580;

  // Fallback default bounds for Sector Bravo/Delta corridor
  const bounds = context?.bounds || {
    minLat: 31.32,
    maxLat: 31.45,
    minLon: -109.93,
    maxLon: -109.77,
  };

  // Convert lat/lon coordinates accurately into SVG viewBox
  const project = (lat: number, lon: number) => {
    const latSpan = bounds.maxLat - bounds.minLat || 0.1;
    const lonSpan = bounds.maxLon - bounds.minLon || 0.1;

    // Normal navigation: lon increases East (right, +X); lat increases North (up, -Y)
    const x = ((lon - bounds.minLon) / lonSpan) * (mapWidth - 120) + 60;
    const y = ((bounds.maxLat - lat) / latSpan) * (mapHeight - 120) + 60;

    return {
      x: Math.max(25, Math.min(mapWidth - 25, x)),
      y: Math.max(25, Math.min(mapHeight - 25, y)),
    };
  };

  const cameras = context?.cameras || [];
  const sectors = context?.sectors || [];
  const zones = context?.zones || [];
  const fences = context?.fences || [];
  const incidents = context?.incidents || [];
  const alerts = context?.alerts || [];
  const corridors = context?.topologyCorridors || [];
  const routes = context?.reconstructedRoutes || [];

  return (
    <div className="w-full h-full relative overflow-hidden bg-[#0B0D11] select-none flex items-center justify-center">
      <svg
        viewBox={`0 0 ${mapWidth} ${mapHeight}`}
        className="w-full h-full object-contain"
        style={{ transform: `scale(${zoomLevel})`, transition: 'transform 0.2s ease-out' }}
      >
        <defs>
          <pattern id="gisCanvasGrid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#16191F" strokeWidth="0.8" />
          </pattern>
          <linearGradient id="corridorGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#007AFF" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#34C759" stopOpacity="0.4" />
          </linearGradient>
          <filter id="glowIncident" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* 1. Grid Background */}
        <rect width={mapWidth} height={mapHeight} fill="#0B0D11" />
        <rect width={mapWidth} height={mapHeight} fill="url(#gisCanvasGrid)" />

        {/* 2. Sectors Layer */}
        {layers.showSectors &&
          sectors.map((sec) => {
            const points = sec.boundaryPolygon
              .map(([lat, lon]) => {
                const pt = project(lat, lon);
                return `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
              })
              .join(' ');

            const center = project(sec.centerLatitude, sec.centerLongitude);

            return (
              <g key={sec.sectorId}>
                <polygon
                  points={points}
                  fill="rgba(0, 122, 255, 0.03)"
                  stroke="rgba(0, 122, 255, 0.25)"
                  strokeWidth="1.25"
                  strokeDasharray="5 3"
                />
                <text
                  x={center.x}
                  y={center.y - 12}
                  fill="#007AFF"
                  opacity="0.7"
                  fontSize="11"
                  fontFamily="monospace"
                  fontWeight="bold"
                  textAnchor="middle"
                  letterSpacing="1"
                >
                  {sec.name.toUpperCase()}
                </text>
              </g>
            );
          })}

        {/* 3. Spatial Zones Layer */}
        {layers.showZones &&
          zones.map((z) => {
            const points = z.coordinates
              .map(([lat, lon]) => {
                const pt = project(lat, lon);
                return `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
              })
              .join(' ');

            const isRestricted = z.isRestricted;
            const strokeColor = isRestricted ? '#FF4D4D' : '#007AFF';
            const fillColor = isRestricted ? 'rgba(255, 77, 77, 0.08)' : 'rgba(0, 122, 255, 0.06)';

            return (
              <g key={z.zoneId}>
                <polygon
                  points={points}
                  fill={fillColor}
                  stroke={strokeColor}
                  strokeWidth="1.5"
                  strokeDasharray={isRestricted ? '4 3' : '2 2'}
                />
                <text
                  x={project(z.coordinates[0][0], z.coordinates[0][1]).x + 5}
                  y={project(z.coordinates[0][0], z.coordinates[0][1]).y - 6}
                  fill={strokeColor}
                  fontSize="9"
                  fontFamily="monospace"
                  fontWeight="bold"
                >
                  {z.code} {z.isRestricted ? '· RESTRICTED' : ''}
                </text>
              </g>
            );
          })}

        {/* 4. Virtual Fence Tripwires */}
        {layers.showFences &&
          fences.map((fence) => {
            const pathData = fence.coordinates
              .map(([lat, lon], idx) => {
                const pt = project(lat, lon);
                return `${idx === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
              })
              .join(' ');

            return (
              <g key={fence.fenceId}>
                <path
                  d={pathData}
                  fill="none"
                  stroke={fence.color || '#FF4D4D'}
                  strokeWidth="2.5"
                  strokeDasharray="6 4"
                />
              </g>
            );
          })}

        {/* 5. Topology Corridors */}
        {layers.showCorridors &&
          corridors.map((edge) => {
            const p1 = project(edge.fromCoords.latitude, edge.fromCoords.longitude);
            const p2 = project(edge.toCoords.latitude, edge.toCoords.longitude);
            const midX = (p1.x + p2.x) / 2;
            const midY = (p1.y + p2.y) / 2;

            return (
              <g key={edge.edgeId}>
                <line
                  x1={p1.x}
                  y1={p1.y}
                  x2={p2.x}
                  y2={p2.y}
                  stroke="rgba(0, 122, 255, 0.4)"
                  strokeWidth="1.5"
                  strokeDasharray="3 3"
                />
                <circle cx={midX} cy={midY} r="3" fill="#007AFF" />
                <text
                  x={midX + 4}
                  y={midY - 4}
                  fill="#6C727A"
                  fontSize="8"
                  fontFamily="monospace"
                >
                  {edge.distanceMeters}m ({edge.minTransitSeconds}s)
                </text>
              </g>
            );
          })}

        {/* 6. Reconstructed Routes Layer */}
        {layers.showRoutes &&
          routes.map((route) => {
            const pathData = route.waypoints
              .map((wp, idx) => {
                const pt = project(wp.latitude, wp.longitude);
                return `${idx === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
              })
              .join(' ');

            return (
              <g key={route.reconstructionId}>
                <path
                  d={pathData}
                  fill="none"
                  stroke="#FF9500"
                  strokeWidth="3"
                  strokeDasharray="8 4"
                />
                {route.waypoints.map((wp, idx) => {
                  const pt = project(wp.latitude, wp.longitude);
                  return (
                    <g key={idx}>
                      <circle cx={pt.x} cy={pt.y} r="6" fill="#FF9500" stroke="#0B0D11" strokeWidth="2" />
                      <text
                        x={pt.x}
                        y={pt.y + 3}
                        fill="#0B0D11"
                        fontSize="8"
                        fontFamily="monospace"
                        fontWeight="bold"
                        textAnchor="middle"
                      >
                        {idx + 1}
                      </text>
                    </g>
                  );
                })}
              </g>
            );
          })}

        {/* 7. Camera Coverage Arcs (FOV) */}
        {layers.showFovCones &&
          cameras.map((cam) => {
            const pt = project(cam.latitude, cam.longitude);
            const isSelected = selectedCameraId === cam.cameraId;
            const isAnomaly = cam.trustStatus === 'INTEGRITY_ANOMALY';
            const isOffline = cam.status === 'OFFLINE' || cam.trustStatus === 'OFFLINE';

            if (isOffline) return null;

            const arcPath = calculateFovArcPath(
              pt.x,
              pt.y,
              55,
              cam.azimuthDegrees,
              cam.fieldOfViewDegrees
            );

            const fillColor = isAnomaly
              ? 'rgba(255, 77, 77, 0.16)'
              : isSelected
              ? 'rgba(0, 122, 255, 0.25)'
              : 'rgba(52, 199, 89, 0.12)';

            const strokeColor = isAnomaly ? '#FF4D4D' : isSelected ? '#007AFF' : '#34C759';

            return (
              <path
                key={`arc-${cam.cameraId}`}
                d={arcPath}
                fill={fillColor}
                stroke={strokeColor}
                strokeWidth="1"
                strokeDasharray={isAnomaly ? '3 3' : undefined}
                className="transition-colors duration-200"
              />
            );
          })}

        {/* 8. Camera Markers & Status Rings */}
        {cameras.map((cam) => {
          const pt = project(cam.latitude, cam.longitude);
          const isSelected = selectedCameraId === cam.cameraId;
          const isAnomaly = cam.trustStatus === 'INTEGRITY_ANOMALY';
          const isOffline = cam.status === 'OFFLINE' || cam.trustStatus === 'OFFLINE';
          const isDegraded = cam.status === 'DEGRADED' || cam.trustStatus === 'DEGRADED';

          const markerColor = isAnomaly
            ? '#FF4D4D'
            : isOffline
            ? '#6C727A'
            : isDegraded
            ? '#FF9500'
            : '#34C759';

          return (
            <g
              key={cam.cameraId}
              className="cursor-pointer group"
              onClick={() => onSelectCamera(cam)}
            >
              {/* Outer Selection or Anomaly Pulse Ring */}
              {(isSelected || isAnomaly) && (
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r="12"
                  fill="none"
                  stroke={isSelected ? '#007AFF' : '#FF4D4D'}
                  strokeWidth="1.5"
                  className={isAnomaly ? 'animate-ping origin-center' : ''}
                  opacity={isAnomaly ? '0.7' : '1'}
                />
              )}

              {/* Marker Base Ring */}
              <circle
                cx={pt.x}
                cy={pt.y}
                r={isSelected ? '6.5' : '5'}
                fill={markerColor}
                stroke="#0B0D11"
                strokeWidth="2"
              />

              {/* Camera Identifier Tag */}
              <rect
                x={pt.x + 8}
                y={pt.y - 8}
                width={cam.cameraIdentifier.length * 7 + 10}
                height="16"
                rx="3"
                fill="#14161A"
                stroke={isSelected ? '#007AFF' : '#23262B'}
                strokeWidth="1"
              />
              <text
                x={pt.x + 13}
                y={pt.y + 3}
                fill={isSelected ? '#007AFF' : '#E0E2E6'}
                fontSize="9"
                fontFamily="monospace"
                fontWeight="bold"
              >
                {cam.cameraIdentifier}
              </text>
            </g>
          );
        })}

        {/* 9. Incident Pins (Pulsating High-Priority Warning) */}
        {layers.showIncidents &&
          incidents.map((inc) => {
            const pt = project(inc.latitude, inc.longitude);
            return (
              <g
                key={inc.incidentId}
                className="cursor-pointer"
                onClick={() => onSelectIncident?.(inc)}
              >
                <circle
                  cx={pt.x}
                  cy={pt.y - 18}
                  r="10"
                  fill="#FF4D4D"
                  opacity="0.3"
                  className="animate-ping"
                />
                <circle
                  cx={pt.x}
                  cy={pt.y - 18}
                  r="7"
                  fill="#FF4D4D"
                  stroke="#FFFFFF"
                  strokeWidth="1.5"
                />
                <text
                  x={pt.x}
                  y={pt.y - 15}
                  fill="#FFFFFF"
                  fontSize="8"
                  fontWeight="bold"
                  textAnchor="middle"
                >
                  !
                </text>
                <rect
                  x={pt.x - 30}
                  y={pt.y - 34}
                  width="60"
                  height="13"
                  rx="2"
                  fill="#0F1115"
                  stroke="#FF4D4D"
                  strokeWidth="0.75"
                />
                <text
                  x={pt.x}
                  y={pt.y - 25}
                  fill="#FF4D4D"
                  fontSize="7.5"
                  fontFamily="monospace"
                  fontWeight="bold"
                  textAnchor="middle"
                >
                  {inc.incidentNumber}
                </text>
              </g>
            );
          })}

        {/* 10. Alert Pins */}
        {layers.showAlerts &&
          alerts.slice(0, 6).map((alt) => {
            const pt = project(alt.latitude, alt.longitude);
            return (
              <g key={alt.alertId} className="cursor-pointer">
                <polygon
                  points={`${pt.x + 12},${pt.y + 10} ${pt.x + 18},${pt.y + 10} ${pt.x + 15},${pt.y + 5}`}
                  fill="#FF9500"
                />
              </g>
            );
          })}
      </svg>

      {/* Compass Rose */}
      <div className="absolute top-4 right-4 bg-[#0F1115]/90 border border-[#23262B] px-2.5 py-2 rounded flex flex-col items-center pointer-events-none shadow-lg">
        <Compass className="w-5 h-5 text-[#007AFF]" />
        <span className="text-[9px] font-mono-num font-bold text-[#A9ACB1] mt-1">NORTH 000°</span>
      </div>

      {/* Map Provenance Label */}
      <div className="absolute bottom-4 left-4 bg-[#0F1115]/90 border border-[#23262B] px-3 py-1.5 rounded text-[11px] font-mono-num text-[#A9ACB1] pointer-events-none flex items-center gap-2 shadow-lg">
        <span className="w-2 h-2 rounded-full bg-[#007AFF]" />
        <span>WGS84 Coordinates · Nogales West Border Interface</span>
        <span className="px-1.5 py-0.5 rounded bg-[#FF9500]/15 text-[#FF9500] border border-[#FF9500]/30 font-bold text-[9px]">
          SIMULATED MAP DATA
        </span>
      </div>
    </div>
  );
};
