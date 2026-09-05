/**
 * IBVAP — Face Quality Assessment Engine
 *
 * Evaluates optical and spatial quality metrics for face detections:
 * - Geometric resolution & size
 * - Sharpness & blur
 * - Illumination adequacy
 * - 3D head pose orientation (yaw, pitch, roll)
 * - Occlusion estimate
 * - Combined quality score & qualitative state (GOOD, ACCEPTABLE, POOR, UNREADABLE)
 */

import { BoundingBox, PixelBoundingBox } from '../ai-inference/types';
import { FaceQualityMetrics, FaceQualityState } from './types';

export interface QualityAssessmentInput {
  boundingBox: BoundingBox;
  pixelBox?: PixelBoundingBox;
  detectorConfidence: number;
  sharpnessScore?: number; // 0.0 to 1.0, optional override for tests/simulation
  luminanceScore?: number; // 0.0 to 1.0, optional override
  yawDegrees?: number; // optional pose override (-90 to +90)
  pitchDegrees?: number; // (-90 to +90)
  rollDegrees?: number; // (-90 to +90)
  occlusionScore?: number; // 0.0 to 1.0
  reasons?: string[];
}

export class FaceQualityEngine {
  /**
   * Assesses face quality from normalized bounding box and sensory inputs.
   */
  public evaluateQuality(input: QualityAssessmentInput): FaceQualityMetrics {
    const {
      boundingBox,
      pixelBox,
      detectorConfidence,
      sharpnessScore = 0.85,
      luminanceScore = 0.80,
      yawDegrees = 0,
      pitchDegrees = 0,
      rollDegrees = 0,
      occlusionScore = 0.0,
      reasons = [],
    } = input;

    const diagReasons: string[] = [...reasons];

    // 1. Size evaluation
    const normWidth = boundingBox.width;
    const normHeight = boundingBox.height;
    const pixelWidth = pixelBox ? (pixelBox.width ?? (pixelBox.xmax - pixelBox.xmin)) : Math.round(normWidth * 1920);
    const pixelHeight = pixelBox ? (pixelBox.height ?? (pixelBox.ymax - pixelBox.ymin)) : Math.round(normHeight * 1080);
    const minDim = Math.min(normWidth, normHeight);

    // Minimum size requirements:
    // Pixel resolution: < 32px is unreadable, < 50px is poor, 50-80px acceptable, > 80px good
    // In normalized coords (assuming 1080p base): minDim < 0.02 is unreadable, < 0.045 is poor
    let sizeScore = 1.0;
    if (minDim < 0.02 || (pixelWidth < 32 || pixelHeight < 32)) {
      sizeScore = 0.15;
      diagReasons.push('Face resolution severely undersized (<32px or <0.02 norm)');
    } else if (minDim < 0.045 || (pixelWidth < 50 || pixelHeight < 50)) {
      sizeScore = 0.50;
      diagReasons.push('Face resolution suboptimal for biometric extraction (<50px)');
    } else if (minDim < 0.08 || (pixelWidth < 80 || pixelHeight < 80)) {
      sizeScore = 0.80;
    } else {
      sizeScore = 1.0;
    }
    const isSufficientSize = sizeScore >= 0.50;

    // 2. Blur / Sharpness
    const clampedSharpness = Math.max(0, Math.min(1, sharpnessScore));
    const isSharp = clampedSharpness >= 0.60;
    if (!isSharp) {
      diagReasons.push(`Motion blur / optical defocus detected (sharpness: ${(clampedSharpness * 100).toFixed(0)}%)`);
    }

    // 3. Illumination / Luminance
    const clampedLuminance = Math.max(0, Math.min(1, luminanceScore));
    const isAdequateIllumination = clampedLuminance >= 0.40 && clampedLuminance <= 0.95;
    if (clampedLuminance < 0.40) {
      diagReasons.push(`Under-exposed / low-light condition (luminance: ${(clampedLuminance * 100).toFixed(0)}%)`);
    } else if (clampedLuminance > 0.95) {
      diagReasons.push(`Over-exposed / specular glare saturation (luminance: ${(clampedLuminance * 100).toFixed(0)}%)`);
    }

    // 4. Pose (Head Orientation)
    const absYaw = Math.abs(yawDegrees);
    const absPitch = Math.abs(pitchDegrees);
    const absRoll = Math.abs(rollDegrees);
    const isFrontal = absYaw <= 25 && absPitch <= 20 && absRoll <= 15;
    let poseScore = 1.0;
    if (absYaw > 45 || absPitch > 35) {
      poseScore = 0.30;
      diagReasons.push(`Extreme profile head angle (yaw: ${yawDegrees}°, pitch: ${pitchDegrees}°)`);
    } else if (!isFrontal) {
      poseScore = 0.70;
      diagReasons.push(`Non-frontal head pose (yaw: ${yawDegrees}°, pitch: ${pitchDegrees}°)`);
    }

    // 5. Occlusion
    const clampedOcclusion = Math.max(0, Math.min(1, occlusionScore));
    const isOccluded = clampedOcclusion >= 0.35;
    if (isOccluded) {
      diagReasons.push(`Partial facial obstruction / mask / occlusion (${(clampedOcclusion * 100).toFixed(0)}%)`);
    }

    // 6. Detector Confidence
    const clampedConfidence = Math.max(0, Math.min(1, detectorConfidence));
    if (clampedConfidence < 0.60) {
      diagReasons.push(`Marginal detector confidence (${(clampedConfidence * 100).toFixed(1)}%)`);
    }

    // Composite Quality Score Calculation
    // Weights: size: 0.25, sharpness: 0.25, luminance: 0.15, pose: 0.15, occlusion: 0.10, confidence: 0.10
    const compositeScore = Number(
      (
        sizeScore * 0.25 +
        clampedSharpness * 0.25 +
        clampedLuminance * 0.15 +
        poseScore * 0.15 +
        (1.0 - clampedOcclusion) * 0.10 +
        clampedConfidence * 0.10
      ).toFixed(3)
    );

    // Qualitative State Categorization
    let qualityState: FaceQualityState;
    if (compositeScore < 0.38 || sizeScore < 0.25 || clampedSharpness < 0.30 || clampedOcclusion > 0.70) {
      qualityState = 'UNREADABLE';
    } else if (compositeScore < 0.60 || !isSharp || !isFrontal || isOccluded || sizeScore < 0.50) {
      qualityState = 'POOR';
    } else if (compositeScore < 0.85) {
      qualityState = 'ACCEPTABLE';
    } else {
      qualityState = 'GOOD';
    }

    return {
      score: compositeScore,
      qualityState,
      faceSize: {
        normalizedWidth: normWidth,
        normalizedHeight: normHeight,
        pixelWidth,
        pixelHeight,
        isSufficientSize,
      },
      blur: {
        sharpnessScore: clampedSharpness,
        isSharp,
      },
      illumination: {
        luminanceScore: clampedLuminance,
        isAdequate: isAdequateIllumination,
      },
      pose: {
        yawDegrees,
        pitchDegrees,
        rollDegrees,
        isFrontal,
      },
      occlusion: {
        occlusionScore: clampedOcclusion,
        isOccluded,
      },
      detectorConfidence: clampedConfidence,
      reasons: diagReasons,
    };
  }
}

export const faceQualityEngine = new FaceQualityEngine();
