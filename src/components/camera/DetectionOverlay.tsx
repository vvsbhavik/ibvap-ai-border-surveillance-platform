import React from 'react';
import { NormalizedDetection, AiSubsystemHealth } from '../../ai-inference/types';
import { Track, MovementDirection, TrackState } from '../../tracking/types';
import { SpatialZone } from '../../spatial/types';
import { AlertCircle, UserCheck, Compass, Shield, ShieldAlert, ArrowRight, ArrowLeft, ArrowLeftRight } from 'lucide-react';

export interface DetectionOverlayProps {
  detections: NormalizedDetection[];
  tracks?: Track[];
  zones?: SpatialZone[];
  showZones?: boolean;
  showAnchorFootprint?: boolean;
  aiHealth?: AiSubsystemHealth | null;
  aiPipelineEnabled?: boolean;
  isOffline?: boolean;
  showTrackId?: boolean;
  showTrajectory?: boolean;
  showDirection?: boolean;
  showState?: boolean;
  filterState?: 'ALL' | 'ACTIVE' | 'LOST';
  className?: string;
}

function getDirectionSymbol(dir: MovementDirection): { symbol: string; angle: number; isMoving: boolean } {
  switch (dir) {
    case 'NORTH':
      return { symbol: '↑', angle: 0, isMoving: true };
    case 'NORTHEAST':
      return { symbol: '↗', angle: 45, isMoving: true };
    case 'EAST':
      return { symbol: '→', angle: 90, isMoving: true };
    case 'SOUTHEAST':
      return { symbol: '↘', angle: 135, isMoving: true };
    case 'SOUTH':
      return { symbol: '↓', angle: 180, isMoving: true };
    case 'SOUTHWEST':
      return { symbol: '↙', angle: 225, isMoving: true };
    case 'WEST':
      return { symbol: '←', angle: 270, isMoving: true };
    case 'NORTHWEST':
      return { symbol: '↖', angle: 315, isMoving: true };
    case 'STATIONARY':
      return { symbol: '⊙', angle: 0, isMoving: false };
    default:
      return { symbol: '·', angle: 0, isMoving: false };
  }
}

export const DetectionOverlay: React.FC<DetectionOverlayProps> = ({
  detections,
  tracks = [],
  zones = [],
  showZones = true,
  showAnchorFootprint = true,
  aiHealth,
  aiPipelineEnabled = true,
  isOffline = false,
  showTrackId = true,
  showTrajectory = true,
  showDirection = true,
  showState = true,
  filterState = 'ALL',
  className = '',
}) => {
  if (isOffline) return null;

  // If AI pipeline is explicitly disabled on this camera
  if (!aiPipelineEnabled) {
    return (
      <div className={`absolute top-2 left-2 z-10 pointer-events-none ${className}`}>
        <span className="px-1.5 py-0.5 rounded bg-black/70 border border-[#3A3F4A] text-[9px] font-mono text-[#8C929D]">
          AI STANDBY
        </span>
      </div>
    );
  }

  // If AI subsystem is unavailable, degraded, or errored
  if (aiHealth && (aiHealth.status === 'OFFLINE' || aiHealth.status === 'ERROR')) {
    return (
      <div className={`absolute top-2 left-2 z-10 pointer-events-none ${className}`}>
        <span className="px-1.5 py-0.5 rounded bg-[#DC2626]/80 border border-[#EF4444] text-[9px] font-mono font-bold text-white flex items-center gap-1 shadow-sm">
          <AlertCircle className="w-2.5 h-2.5" />
          AI DETECTION UNAVAILABLE
        </span>
      </div>
    );
  }

  // Filter tracks by state if filter applied
  const visibleTracks = tracks.filter((t) => {
    if (filterState === 'ACTIVE') return t.state === 'ACTIVE';
    if (filterState === 'LOST') return t.state === 'TEMPORARILY_LOST';
    return t.state === 'ACTIVE' || t.state === 'TEMPORARILY_LOST';
  });

  const hasTracks = visibleTracks.length > 0;
  const hasDetections = detections.length > 0;

  // Active zones count
  const activeSpatialZones = zones.filter((z) => z.active);
  const polygonZones = activeSpatialZones.filter((z) => z.geometry === 'POLYGON');
  const fenceLines = activeSpatialZones.filter((z) => z.geometry === 'LINE');

  return (
    <div className={`absolute inset-0 pointer-events-none overflow-hidden ${className}`}>
      {/* Top Left: Subsystem status & Tracking count badge */}
      <div className="absolute top-2 left-2 z-10 flex flex-wrap items-center gap-1.5">
        {hasTracks ? (
          <span className="px-1.5 py-0.5 rounded bg-[#0284C7]/90 border border-[#38BDF8] text-[9px] font-mono font-bold text-white flex items-center gap-1 shadow-sm">
            <Compass className="w-2.5 h-2.5 stroke-[2.5]" />
            TRACKING ({visibleTracks.length})
          </span>
        ) : hasDetections ? (
          <span className="px-1.5 py-0.5 rounded bg-[#F59E0B]/90 border border-[#FBBF24] text-[9px] font-mono font-bold text-black flex items-center gap-1 shadow-sm animate-pulse">
            <UserCheck className="w-2.5 h-2.5 stroke-[2.5]" />
            DETECTED ({detections.length})
          </span>
        ) : (
          <span className="px-1.5 py-0.5 rounded bg-black/60 border border-[#23262B] text-[9px] font-mono text-[#10B981] flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
            AI TRACKER READY
          </span>
        )}

        {/* Spatial boundaries badge */}
        {showZones && activeSpatialZones.length > 0 && (
          <span className="px-1.5 py-0.5 rounded bg-[#0F172A]/90 border border-[#38BDF8]/40 text-[9px] font-mono font-medium text-[#38BDF8] flex items-center gap-1 shadow-xs">
            <Shield className="w-2.5 h-2.5" />
            {fenceLines.length > 0 && `${fenceLines.length} FENCE${fenceLines.length > 1 ? 'S' : ''}`}
            {fenceLines.length > 0 && polygonZones.length > 0 && ' · '}
            {polygonZones.length > 0 && `${polygonZones.length} ZONE${polygonZones.length > 1 ? 'S' : ''}`}
          </span>
        )}
      </div>

      {/* SVG Layer for Spatial Zones, Virtual Fences, and Trajectory Trails */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none z-10"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <defs>
          <pattern id="diagonalHatch" width="4" height="4" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="0" y2="4" stroke="#EF4444" strokeWidth="0.8" strokeOpacity="0.25" />
          </pattern>
        </defs>

        {/* 1. Spatial Polygon Zones */}
        {showZones &&
          polygonZones.map((z) => {
            if (!z.coordinates || z.coordinates.length < 3) return null;
            const pointsStr = z.coordinates
              .map((p) => `${(p.x * 100).toFixed(2)},${(p.y * 100).toFixed(2)}`)
              .join(' ');
            const zoneColor = z.color || (z.type === 'RESTRICTED_AREA' ? '#EF4444' : '#38BDF8');

            // Find centroid for label placement
            const cx = (z.coordinates.reduce((sum, p) => sum + p.x, 0) / z.coordinates.length) * 100;
            const cy = (z.coordinates.reduce((sum, p) => sum + p.y, 0) / z.coordinates.length) * 100;

            return (
              <g key={`poly-${z.zoneId}`}>
                {/* Translucent fill */}
                <polygon
                  points={pointsStr}
                  fill={zoneColor}
                  fillOpacity="0.14"
                  stroke={zoneColor}
                  strokeWidth="0.75"
                  strokeDasharray={z.type === 'RESTRICTED_AREA' ? 'none' : '2,1'}
                  strokeOpacity="0.85"
                />
                {/* Polygon vertex anchors */}
                {z.coordinates.map((p, idx) => (
                  <circle
                    key={`poly-vert-${z.zoneId}-${idx}`}
                    cx={p.x * 100}
                    cy={p.y * 100}
                    r="0.8"
                    fill="#FFFFFF"
                    stroke={zoneColor}
                    strokeWidth="0.4"
                  />
                ))}
                {/* Zone Label Watermark at Centroid */}
                <text
                  x={cx}
                  y={cy}
                  fill={zoneColor}
                  fontSize="2.4"
                  fontWeight="bold"
                  fontFamily="monospace"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fillOpacity="0.9"
                  style={{ textShadow: '0 0 2px #000000' }}
                >
                  {z.name.toUpperCase()} [{z.type.replace('_', ' ')}]
                </text>
              </g>
            );
          })}

        {/* 2. Virtual Fence Tripwires (Lines) */}
        {showZones &&
          fenceLines.map((z) => {
            if (!z.coordinates || z.coordinates.length < 2) return null;
            const p1 = z.coordinates[0];
            const p2 = z.coordinates[1];
            const x1 = p1.x * 100;
            const y1 = p1.y * 100;
            const x2 = p2.x * 100;
            const y2 = p2.y * 100;
            const fenceColor = z.color || '#F59E0B';
            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;

            return (
              <g key={`fence-${z.zoneId}`}>
                {/* Outer halo glow for fence visibility */}
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={fenceColor}
                  strokeWidth="2.2"
                  strokeOpacity="0.25"
                />
                {/* Core fence line */}
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={fenceColor}
                  strokeWidth="1.1"
                  strokeDasharray="2,1"
                  strokeOpacity="0.95"
                />
                {/* End terminals */}
                <circle cx={x1} cy={y1} r="1.1" fill={fenceColor} stroke="#FFFFFF" strokeWidth="0.4" />
                <circle cx={x2} cy={y2} r="1.1" fill={fenceColor} stroke="#FFFFFF" strokeWidth="0.4" />

                {/* Tactical Fence HUD Label at Midpoint */}
                <rect
                  x={midX - 16}
                  y={midY - 2.8}
                  width="32"
                  height="5.6"
                  rx="1"
                  fill="#0F1115"
                  fillOpacity="0.9"
                  stroke={fenceColor}
                  strokeWidth="0.4"
                />
                <text
                  x={midX}
                  y={midY + 0.6}
                  fill={fenceColor}
                  fontSize="2.1"
                  fontWeight="bold"
                  fontFamily="monospace"
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  ⚡ {z.name.toUpperCase()} [{z.direction || 'BOTH'}]
                </text>
              </g>
            );
          })}

        {/* 3. Trajectory History Vector Trails */}
        {showTrajectory &&
          hasTracks &&
          visibleTracks.map((track) => {
            if (!track.trajectory || track.trajectory.length < 2) return null;
            const pointsStr = track.trajectory
              .map((p) => `${(p.centerX * 100).toFixed(2)},${(p.centerY * 100).toFixed(2)}`)
              .join(' ');
            const isLost = track.state === 'TEMPORARILY_LOST';
            const strokeColor = isLost ? '#F59E0B' : '#38BDF8';

            return (
              <g key={`traj-${track.trackId}`}>
                <polyline
                  points={pointsStr}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth="0.8"
                  strokeDasharray={isLost ? '1,1' : 'none'}
                  strokeOpacity="0.75"
                />
                {track.trajectory.map((p, pIdx) => {
                  const isLatest = pIdx === track.trajectory.length - 1;
                  return (
                    <circle
                      key={`pt-${track.trackId}-${pIdx}`}
                      cx={p.centerX * 100}
                      cy={p.centerY * 100}
                      r={isLatest ? 1.2 : 0.6}
                      fill={isLatest ? '#FFFFFF' : strokeColor}
                      fillOpacity={isLatest ? 0.95 : 0.5}
                    />
                  );
                })}
              </g>
            );
          })}

        {/* 4. Ground Anchor Footprint Target Reticles */}
        {showAnchorFootprint &&
          hasTracks &&
          visibleTracks.map((track) => {
            const footX = (track.lastBoundingBox.x + track.lastBoundingBox.width / 2) * 100;
            const footY = (track.lastBoundingBox.y + track.lastBoundingBox.height) * 100;
            const isLost = track.state === 'TEMPORARILY_LOST';
            const anchorColor = isLost ? '#F59E0B' : '#38BDF8';

            return (
              <g key={`foot-${track.trackId}`}>
                {/* Ground anchor reticle ellipse */}
                <ellipse
                  cx={footX}
                  cy={footY}
                  rx="1.8"
                  ry="0.8"
                  fill="none"
                  stroke={anchorColor}
                  strokeWidth="0.5"
                  strokeDasharray="0.8,0.8"
                />
                <circle cx={footX} cy={footY} r="0.6" fill="#FFFFFF" stroke={anchorColor} strokeWidth="0.3" />
              </g>
            );
          })}
      </svg>

      {/* Primary: Real Multi-Object Tracked Bounding Boxes */}
      {hasTracks
        ? visibleTracks.map((track) => {
            const box = track.lastBoundingBox;
            const isLost = track.state === 'TEMPORARILY_LOST';
            const leftPercent = Math.max(0, Math.min(100, box.x * 100));
            const topPercent = Math.max(0, Math.min(100, box.y * 100));
            const widthPercent = Math.max(2, Math.min(100 - leftPercent, box.width * 100));
            const heightPercent = Math.max(2, Math.min(100 - topPercent, box.height * 100));
            const confidencePercent = (track.currentConfidence * 100).toFixed(1);
            const dirInfo = getDirectionSymbol(track.direction);

            const borderColor = isLost ? 'border-[#F59E0B]' : 'border-[#38BDF8]';
            const bgColor = isLost ? 'bg-[#F59E0B]/10' : 'bg-[#38BDF8]/10';
            const badgeBg = isLost ? 'bg-[#F59E0B]' : 'bg-[#0284C7]';
            const badgeText = isLost ? 'text-black' : 'text-white';

            return (
              <div
                key={track.trackId}
                id={`track-box-${track.trackId}`}
                className={`absolute border-2 ${isLost ? 'border-dashed' : 'border-solid'} ${borderColor} ${bgColor} transition-all duration-300 pointer-events-none z-20`}
                style={{
                  left: `${leftPercent}%`,
                  top: `${topPercent}%`,
                  width: `${widthPercent}%`,
                  height: `${heightPercent}%`,
                }}
              >
                {/* Corner Reticles */}
                <div className="absolute -top-1 -left-1 w-2 h-2 border-t-2 border-l-2 border-white" />
                <div className="absolute -top-1 -right-1 w-2 h-2 border-t-2 border-r-2 border-white" />
                <div className="absolute -bottom-1 -left-1 w-2 h-2 border-b-2 border-l-2 border-white" />
                <div className="absolute -bottom-1 -right-1 w-2 h-2 border-b-2 border-r-2 border-white" />

                {/* Top Tactical Label HUD */}
                <div
                  className={`absolute -top-6 left-0 z-30 flex items-center gap-1.5 ${badgeBg} ${badgeText} px-1.5 py-0.5 rounded-2xs shadow-md font-mono text-[9px] font-bold tracking-tight whitespace-nowrap`}
                >
                  {showTrackId && (
                    <span className="bg-black/30 px-1 rounded-2xs">{track.trackId}</span>
                  )}
                  <span>PERSON</span>
                  <span className="opacity-90">{confidencePercent}%</span>

                  {showDirection && (
                    <span className="flex items-center gap-0.5 font-bold border-l border-white/30 pl-1">
                      <span className="text-[10px]">{dirInfo.symbol}</span>
                      <span>{track.direction}</span>
                    </span>
                  )}

                  {showState && isLost && (
                    <span className="bg-[#DC2626] text-white px-1 rounded-2xs text-[8px] animate-pulse">
                      LOST ({track.missedFrames})
                    </span>
                  )}
                </div>

                {/* Bottom HUD: Dwell Time & Resolution Bounds */}
                <div className="absolute -bottom-4 right-0 z-30 bg-black/85 text-[#94A3B8] px-1.5 py-0.2 rounded-2xs text-[8px] font-mono flex items-center gap-1.5 whitespace-nowrap border border-white/10">
                  <span>DWELL {track.dwellTimeSeconds.toFixed(1)}s</span>
                  {track.lastPixelBox && (
                    <span>
                      {track.lastPixelBox.width ?? Math.round(track.lastPixelBox.xmax - track.lastPixelBox.xmin)}x
                      {track.lastPixelBox.height ?? Math.round(track.lastPixelBox.ymax - track.lastPixelBox.ymin)}px
                    </span>
                  )}
                </div>
              </div>
            );
          })
        : detections.map((detection) => {
            const { boundingBox, confidence, pixelBox, detectionId } = detection;
            const leftPercent = Math.max(0, Math.min(100, boundingBox.x * 100));
            const topPercent = Math.max(0, Math.min(100, boundingBox.y * 100));
            const widthPercent = Math.max(2, Math.min(100 - leftPercent, boundingBox.width * 100));
            const heightPercent = Math.max(2, Math.min(100 - topPercent, boundingBox.height * 100));
            const confidencePercent = (confidence * 100).toFixed(1);

            return (
              <div
                key={detectionId}
                id={`detection-box-${detectionId}`}
                className="absolute border-2 border-[#F59E0B] bg-[#F59E0B]/10 transition-all duration-300 pointer-events-none z-20"
                style={{
                  left: `${leftPercent}%`,
                  top: `${topPercent}%`,
                  width: `${widthPercent}%`,
                  height: `${heightPercent}%`,
                }}
              >
                <div className="absolute -top-1 -left-1 w-2 h-2 border-t-2 border-l-2 border-white" />
                <div className="absolute -top-1 -right-1 w-2 h-2 border-t-2 border-r-2 border-white" />
                <div className="absolute -bottom-1 -left-1 w-2 h-2 border-b-2 border-l-2 border-white" />
                <div className="absolute -bottom-1 -right-1 w-2 h-2 border-b-2 border-r-2 border-white" />

                <div className="absolute -top-5 left-0 z-20 flex items-center gap-1 bg-[#F59E0B] text-black px-1.5 py-0.5 rounded-2xs shadow-md font-mono text-[9px] font-bold tracking-tight whitespace-nowrap">
                  <span>PERSON</span>
                  <span className="opacity-90">{confidencePercent}%</span>
                </div>

                <div className="absolute -bottom-4 right-0 z-20 bg-black/80 text-[#94A3B8] px-1 py-0.2 rounded-2xs text-[8px] font-mono whitespace-nowrap">
                  {pixelBox ? (pixelBox.width ?? Math.round(pixelBox.xmax - pixelBox.xmin)) : Math.round(boundingBox.width * 640)}x
                  {pixelBox ? (pixelBox.height ?? Math.round(pixelBox.ymax - pixelBox.ymin)) : Math.round(boundingBox.height * 360)}px
                </div>
              </div>
            );
          })}
    </div>
  );
};
