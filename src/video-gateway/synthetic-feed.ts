import fs from 'fs';
import path from 'path';
import { RawFrame, SyntheticTestScene } from './types';

export interface SyntheticFeedOptions {
  cameraId: string;
  identifier: string;
  cameraName: string;
  sectorName?: string;
  cameraType?: string;
  azimuth?: number;
  width?: number;
  height?: number;
  palette?: 'OPTICAL' | 'THERMAL' | 'NIGHT_IR' | 'PTZ';
  testScene?: SyntheticTestScene;
}

// Pre-load test photographic assets for genuine AI detection
let person1Base64 = '';
let person3Base64 = '';

try {
  const p1 = path.join(process.cwd(), 'public', 'test-assets', 'person-sample-1.jpg');
  if (fs.existsSync(p1)) {
    person1Base64 = fs.readFileSync(p1).toString('base64');
  }
  const p3 = path.join(process.cwd(), 'public', 'test-assets', 'person-sample-3.jpg');
  if (fs.existsSync(p3)) {
    person3Base64 = fs.readFileSync(p3).toString('base64');
  }
} catch (err) {
  console.warn('[SyntheticFrameGenerator] Test asset load notice:', err);
}

/**
 * Generates realistic border surveillance frames with HUD reticles, timecode overlays,
 * sensor coordinates, and explicit simulation watermarks.
 */
export class SyntheticFrameGenerator {
  private sequenceCounter: number = 0;

  generateFrame(options: SyntheticFeedOptions): RawFrame {
    this.sequenceCounter++;
    const width = options.width || 640;
    const height = options.height || 360;
    const now = new Date();
    const timestamp = now.toISOString();
    const timecode = now.toISOString().replace('T', ' ').replace('Z', ' UTC');
    const seqFormatted = String(this.sequenceCounter).padStart(6, '0');
    const azimuth = options.azimuth ?? 110;
    const palette = options.palette || (options.cameraType?.includes('THERMAL') ? 'THERMAL' : 'OPTICAL');

    let backgroundSvg = '';
    let hudColor = '#38bdf8';
    let themeBadge = 'OPTICAL DAYLIGHT';

    if (palette === 'THERMAL') {
      hudColor = '#fb923c';
      themeBadge = 'THERMAL IR (IRONBOW)';
      backgroundSvg = `
        <defs>
          <linearGradient id="thermalBg" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#0a051b"/>
            <stop offset="45%" stop-color="#3b0f53"/>
            <stop offset="70%" stop-color="#8c1b50"/>
            <stop offset="90%" stop-color="#cf4424"/>
            <stop offset="100%" stop-color="#f7be38"/>
          </linearGradient>
          <filter id="thermalNoise">
            <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" result="noise"/>
            <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.15 0"/>
          </filter>
        </defs>
        <rect width="100%" height="100%" fill="url(#thermalBg)"/>
        <rect width="100%" height="100%" filter="url(#thermalNoise)" opacity="0.6"/>
        <!-- Thermal Terrain Silhouette -->
        <polygon points="0,${height * 0.65} 120,${height * 0.58} 240,${height * 0.62} 360,${height * 0.52} 480,${height * 0.59} 640,${height * 0.54} 640,${height} 0,${height}" fill="#160829" opacity="0.85"/>
        <!-- Heat Signature Hotspots -->
        <ellipse cx="${(width * 0.42 + (this.sequenceCounter % 80) * 0.5)}" cy="${height * 0.68}" rx="28" ry="14" fill="#fff59d" opacity="0.85" filter="blur(2px)"/>
        <ellipse cx="${(width * 0.72)}" cy="${height * 0.62}" rx="18" ry="10" fill="#fed7aa" opacity="0.7" filter="blur(1.5px)"/>
      `;
    } else if (palette === 'NIGHT_IR') {
      hudColor = '#4ade80';
      themeBadge = 'NIGHT IR (ACTIVE ILLUMINATOR)';
      backgroundSvg = `
        <defs>
          <radialGradient id="nightVignette" cx="50%" cy="50%" r="65%">
            <stop offset="0%" stop-color="#0f2619"/>
            <stop offset="60%" stop-color="#07150d"/>
            <stop offset="100%" stop-color="#020805"/>
          </radialGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#nightVignette)"/>
        <!-- Perimeter Fence Line -->
        <line x1="0" y1="${height * 0.7}" x2="${width}" y2="${height * 0.7}" stroke="#166534" stroke-width="2" stroke-dasharray="8,6"/>
        <line x1="0" y1="${height * 0.65}" x2="${width}" y2="${height * 0.65}" stroke="#14532d" stroke-width="1"/>
      `;
    } else {
      // Daylight / High Resolution Optical
      hudColor = '#38bdf8';
      themeBadge = 'OPTICAL SENSOR';
      backgroundSvg = `
        <defs>
          <linearGradient id="skyGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#09111e"/>
            <stop offset="50%" stop-color="#141f32"/>
            <stop offset="70%" stop-color="#242b35"/>
            <stop offset="100%" stop-color="#1b1c20"/>
          </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#skyGrad)"/>
        <!-- Mountain Range Silhouette -->
        <polygon points="0,${height * 0.55} 90,${height * 0.46} 190,${height * 0.5} 310,${height * 0.42} 430,${height * 0.48} 540,${height * 0.43} 640,${height * 0.52} 640,${height} 0,${height}" fill="#111317"/>
        <!-- Ground / Buffer zone -->
        <polygon points="0,${height * 0.68} 640,${height * 0.68} 640,${height} 0,${height}" fill="#17191e"/>
        <!-- Perimeter Fence Grid -->
        <line x1="0" y1="${height * 0.75}" x2="${width}" y2="${height * 0.75}" stroke="#2e3540" stroke-width="1.5" stroke-dasharray="12,4"/>
        <line x1="0" y1="${height * 0.78}" x2="${width}" y2="${height * 0.78}" stroke="#23272f" stroke-width="1"/>
      `;
    }

    // Default CAM-01 to PERSON_SOLITARY so operators can observe genuine person detection immediately.
    // Default CAM-02 and others to EMPTY so negative (0 detections) can be verified truthfully.
    const effectiveScene: SyntheticTestScene =
      options.testScene ||
      (options.cameraId === 'CAM-01' || options.identifier === 'CAM-01'
        ? 'PERSON_SOLITARY'
        : 'EMPTY');

    let personElementSvg = '';
    if ((effectiveScene === 'PERSON_SOLITARY' || effectiveScene === 'PERSON_STATIC') && person1Base64) {
      const pX = Math.round(width * 0.32);
      const pY = Math.round(height * 0.22);
      const pW = Math.round(width * 0.36);
      const pH = Math.round(height * 0.68);
      personElementSvg = `
        <!-- Real photographic person subject for genuine computer vision detection -->
        <image href="data:image/jpeg;base64,${person1Base64}" x="${pX}" y="${pY}" width="${pW}" height="${pH}" preserveAspectRatio="none"/>
      `;
    } else if (effectiveScene === 'PERSON_MOVING' && person1Base64) {
      // Dynamic moving person translating Eastward across the perimeter
      const stepOffset = (this.sequenceCounter * 8) % Math.round(width * 0.45);
      const pX = Math.round(width * 0.15 + stepOffset);
      const pY = Math.round(height * 0.24);
      const pW = Math.round(width * 0.32);
      const pH = Math.round(height * 0.66);
      personElementSvg = `
        <!-- Moving photographic person across frames to test trajectory & direction -->
        <image href="data:image/jpeg;base64,${person1Base64}" x="${pX}" y="${pY}" width="${pW}" height="${pH}" preserveAspectRatio="none"/>
      `;
    } else if (effectiveScene === 'PERSON_DISAPPEARS_TEMPORARILY' && person1Base64) {
      // Periodic occlusion test: visible for 4 cycles, occluded for 2 cycles
      const isVisible = (this.sequenceCounter % 6) < 4;
      if (isVisible) {
        const pX = Math.round(width * 0.35);
        const pY = Math.round(height * 0.24);
        const pW = Math.round(width * 0.34);
        const pH = Math.round(height * 0.66);
        personElementSvg = `
          <!-- Intermittent person to test TEMPORARILY_LOST -> ACTIVE resumption -->
          <image href="data:image/jpeg;base64,${person1Base64}" x="${pX}" y="${pY}" width="${pW}" height="${pH}" preserveAspectRatio="none"/>
        `;
      }
    } else if ((effectiveScene === 'PERSON_CROSSING' || effectiveScene === 'TWO_PERSONS_CROSSING') && person1Base64) {
      // Two distinct persons at different coordinates to test multi-object tracking
      const step1 = (this.sequenceCounter * 6) % Math.round(width * 0.25);
      const p1X = Math.round(width * 0.12 + step1);
      const p1Y = Math.round(height * 0.26);
      const p1W = Math.round(width * 0.26);
      const p1H = Math.round(height * 0.64);

      const step2 = (this.sequenceCounter * 5) % Math.round(width * 0.20);
      const p2X = Math.round(width * 0.68 - step2);
      const p2Y = Math.round(height * 0.24);
      const p2W = Math.round(width * 0.26);
      const p2H = Math.round(height * 0.66);

      personElementSvg = `
        <!-- Dual person scenario for genuine multi-object detection & tracking -->
        <image href="data:image/jpeg;base64,${person1Base64}" x="${p1X}" y="${p1Y}" width="${p1W}" height="${p1H}" preserveAspectRatio="none"/>
        <image href="data:image/jpeg;base64,${person3Base64 || person1Base64}" x="${p2X}" y="${p2Y}" width="${p2W}" height="${p2H}" preserveAspectRatio="none"/>
      `;
    } else if (effectiveScene === 'PERSON_OUTSIDE_ZONE' && person1Base64) {
      // Stationary person outside any security polygon or fence
      const pX = Math.round(width * 0.04);
      const pY = Math.round(height * 0.26);
      const pW = Math.round(width * 0.20);
      const pH = Math.round(height * 0.60);
      personElementSvg = `
        <!-- Person outside configured spatial boundary -->
        <image href="data:image/jpeg;base64,${person1Base64}" x="${pX}" y="${pY}" width="${pW}" height="${pH}" preserveAspectRatio="none"/>
      `;
    } else if (effectiveScene === 'PERSON_ENTERING_ZONE' && person1Base64) {
      // Person moving from outside (0.05) into zone buffer (0.45)
      const step = (this.sequenceCounter * 8) % Math.round(width * 0.40);
      const pX = Math.round(width * 0.05 + step);
      const pY = Math.round(height * 0.24);
      const pW = Math.round(width * 0.26);
      const pH = Math.round(height * 0.65);
      personElementSvg = `
        <!-- Person entering zone boundary -->
        <image href="data:image/jpeg;base64,${person1Base64}" x="${pX}" y="${pY}" width="${pW}" height="${pH}" preserveAspectRatio="none"/>
      `;
    } else if (effectiveScene === 'PERSON_EXITING_ZONE' && person1Base64) {
      // Person moving from deep inside zone (0.40) to far right exterior (0.88)
      const step = (this.sequenceCounter * 8) % Math.round(width * 0.45);
      const pX = Math.round(width * 0.38 + step);
      const pY = Math.round(height * 0.24);
      const pW = Math.round(width * 0.26);
      const pH = Math.round(height * 0.65);
      personElementSvg = `
        <!-- Person exiting zone boundary -->
        <image href="data:image/jpeg;base64,${person1Base64}" x="${pX}" y="${pY}" width="${pW}" height="${pH}" preserveAspectRatio="none"/>
      `;
    } else if (effectiveScene === 'PERSON_CROSSING_FENCE' && person1Base64) {
      // Person traversing from West (0.28) across fence (0.48) to East (0.75)
      const step = (this.sequenceCounter * 9) % Math.round(width * 0.48);
      const pX = Math.round(width * 0.28 + step);
      const pY = Math.round(height * 0.24);
      const pW = Math.round(width * 0.26);
      const pH = Math.round(height * 0.66);
      personElementSvg = `
        <!-- Person breaching virtual fence line -->
        <image href="data:image/jpeg;base64,${person1Base64}" x="${pX}" y="${pY}" width="${pW}" height="${pH}" preserveAspectRatio="none"/>
      `;
    } else if (effectiveScene === 'PERSON_PARALLEL_TO_FENCE' && person1Base64) {
      // Moving vertically at x=0.28, parallel to fence at x=0.48 without crossing
      const stepY = (this.sequenceCounter * 6) % Math.round(height * 0.35);
      const pX = Math.round(width * 0.26);
      const pY = Math.round(height * 0.16 + stepY);
      const pW = Math.round(width * 0.24);
      const pH = Math.round(height * 0.58);
      personElementSvg = `
        <!-- Person moving parallel to fence without crossing -->
        <image href="data:image/jpeg;base64,${person1Base64}" x="${pX}" y="${pY}" width="${pW}" height="${pH}" preserveAspectRatio="none"/>
      `;
    } else if (effectiveScene === 'PERSON_TOUCHING_FENCE_BUT_NOT_CROSSING' && person1Base64) {
      // Approaches near fence at x=0.44 then oscillates/turns back to 0.35 without breaching 0.48
      const wave = Math.abs(Math.sin(this.sequenceCounter * 0.4)) * (width * 0.12);
      const pX = Math.round(width * 0.32 + wave);
      const pY = Math.round(height * 0.25);
      const pW = Math.round(width * 0.25);
      const pH = Math.round(height * 0.64);
      personElementSvg = `
        <!-- Person near fence without line crossing -->
        <image href="data:image/jpeg;base64,${person1Base64}" x="${pX}" y="${pY}" width="${pW}" height="${pH}" preserveAspectRatio="none"/>
      `;
    } else if (effectiveScene === 'TEMPORARY_OCCLUSION_NEAR_ZONE' && person1Base64) {
      // Person in zone, occluded intermittently for 2 frames
      const isVisible = (this.sequenceCounter % 5) < 3;
      if (isVisible) {
        const step = (this.sequenceCounter * 4) % Math.round(width * 0.20);
        const pX = Math.round(width * 0.38 + step);
        const pY = Math.round(height * 0.24);
        const pW = Math.round(width * 0.28);
        const pH = Math.round(height * 0.65);
        personElementSvg = `
          <!-- Intermittent occlusion inside zone boundary -->
          <image href="data:image/jpeg;base64,${person1Base64}" x="${pX}" y="${pY}" width="${pW}" height="${pH}" preserveAspectRatio="none"/>
        `;
      }
    }

    const sceneBadge =
      effectiveScene === 'PERSON_SOLITARY' || effectiveScene === 'PERSON_STATIC'
        ? 'PERSON IN SECTOR'
        : effectiveScene === 'PERSON_MOVING'
        ? 'TARGET IN MOTION'
        : effectiveScene === 'PERSON_DISAPPEARS_TEMPORARILY'
        ? 'TEMPORARY OCCLUSION TEST'
        : effectiveScene === 'PERSON_CROSSING' || effectiveScene === 'TWO_PERSONS_CROSSING'
        ? 'MULTI-INTRUDER'
        : 'CLEAR PERIMETER';

    const svgContent = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  ${backgroundSvg}
  ${personElementSvg}

  <!-- HUD Grid & Optical Crosshair -->
  <g stroke="${hudColor}" stroke-opacity="0.35" stroke-width="1">
    <!-- Center reticle -->
    <line x1="${width / 2 - 24}" y1="${height / 2}" x2="${width / 2 + 24}" y2="${height / 2}"/>
    <line x1="${width / 2}" y1="${height / 2 - 24}" x2="${width / 2}" y2="${height / 2 + 24}"/>
    <circle cx="${width / 2}" cy="${height / 2}" r="14" fill="none" stroke-width="1.2" stroke-dasharray="4,4"/>
    
    <!-- Corner brackets -->
    <path d="M 18,32 L 18,18 L 32,18" fill="none" stroke-width="2" stroke="${hudColor}" stroke-opacity="0.8"/>
    <path d="M ${width - 32},18 L ${width - 18},18 L ${width - 18},32" fill="none" stroke-width="2" stroke="${hudColor}" stroke-opacity="0.8"/>
    <path d="M 18,${height - 32} L 18,${height - 18} L 32,${height - 18}" fill="none" stroke-width="2" stroke="${hudColor}" stroke-opacity="0.8"/>
    <path d="M ${width - 32},${height - 18} L ${width - 18},${height - 18} L ${width - 18},${height - 32}" fill="none" stroke-width="2" stroke="${hudColor}" stroke-opacity="0.8"/>
  </g>

  <!-- TOP HUD BAR: MANDATORY SIMULATED WATERMARK & SENSOR ID -->
  <rect x="0" y="0" width="${width}" height="28" fill="#000000" fill-opacity="0.75"/>
  <text x="14" y="18" fill="#ffffff" font-family="monospace" font-size="11" font-weight="bold">${options.identifier || options.cameraId}</text>
  <text x="85" y="18" fill="${hudColor}" font-family="monospace" font-size="10">${options.cameraName}</text>
  
  <!-- Mandatory simulation watermark (Section 4 & 24) -->
  <rect x="${width - 180}" y="5" width="168" height="18" fill="#dc2626" fill-opacity="0.25" stroke="#ef4444" stroke-width="1" rx="2"/>
  <text x="${width - 96}" y="17" fill="#fca5a5" font-family="monospace" font-size="9" font-weight="bold" text-anchor="middle">SIMULATED RTSP FEED</text>

  <!-- BOTTOM HUD BAR: TIMECODE, FRAME SEQ, OPTICAL METRICS -->
  <rect x="0" y="${height - 28}" width="${width}" height="28" fill="#000000" fill-opacity="0.75"/>
  <text x="14" y="${height - 10}" fill="#94a3b8" font-family="monospace" font-size="10">${timecode}</text>
  <text x="${width / 2}" y="${height - 10}" fill="${hudColor}" font-family="monospace" font-size="10" text-anchor="middle">FRM #${seqFormatted} · AZ: ${azimuth.toFixed(1)}°</text>
  <text x="${width - 14}" y="${height - 10}" fill="#64748b" font-family="monospace" font-size="9" text-anchor="end">${themeBadge} · ${sceneBadge}</text>
</svg>
    `.trim();

    const dataUri = `data:image/svg+xml;utf8,${encodeURIComponent(svgContent)}`;

    return {
      cameraId: options.cameraId,
      timestamp,
      sequenceNumber: this.sequenceCounter,
      width,
      height,
      format: 'svg+xml',
      dataUri,
      sizeBytes: Buffer.byteLength(svgContent, 'utf8'),
      isSynthetic: true,
      metadata: {
        cameraName: options.cameraName,
        sectorName: options.sectorName,
        cameraType: options.cameraType,
        opticalCoordinates: `AZ: ${azimuth.toFixed(1)}°`,
        palette,
        testScene: effectiveScene,
      },
    };
  }
}
