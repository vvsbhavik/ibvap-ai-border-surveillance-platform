/**
 * IBVAP Spatial Geometry Engine
 * Deterministic computational geometry: Point-in-Polygon, Line-Segment Intersection,
 * Directional Cross Product, and Anchor Point Extraction.
 */

import { NormalizedPoint, SpatialGeometryType } from './types';
import { Track } from '../tracking/types';

/**
 * Surveillance convention:
 * In a 2D camera view, a person's foot contact position on the terrain (ground footprint)
 * is represented by the bottom-center of their detected bounding box.
 * This ensures that a person standing on a border line or entering a restricted zone
 * is evaluated based on where their feet are on the ground, rather than head or torso.
 */
export function getTrackAnchorPoint(track: Track, mode: 'GROUND_FOOTPRINT' | 'CENTER' = 'GROUND_FOOTPRINT'): NormalizedPoint {
  const box = track.lastBoundingBox;
  const centerX = Math.max(0, Math.min(1, box.x + box.width / 2));

  if (mode === 'CENTER') {
    const centerY = Math.max(0, Math.min(1, box.y + box.height / 2));
    return { x: centerX, y: centerY };
  }

  // GROUND_FOOTPRINT: bottom-center (y + height)
  const bottomY = Math.max(0, Math.min(1, box.y + box.height));
  return { x: centerX, y: bottomY };
}

/**
 * Robust Point-in-Polygon test using Ray-Casting algorithm (Even-Odd Rule).
 * Handles boundary edge points and vertex coincidence cleanly.
 */
export function isPointInPolygon(point: NormalizedPoint, polygon: NormalizedPoint[]): boolean {
  if (!polygon || polygon.length < 3) return false;

  const { x, y } = point;
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    // Check if point is exactly on vertex
    if (Math.abs(xi - x) < 1e-6 && Math.abs(yi - y) < 1e-6) {
      return true;
    }

    // Check if point is on segment
    if (isPointOnSegment(point, polygon[j], polygon[i])) {
      return true;
    }

    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) {
      inside = !inside;
    }
  }

  return inside;
}

/**
 * Determines if point P lies on line segment AB.
 */
export function isPointOnSegment(p: NormalizedPoint, a: NormalizedPoint, b: NormalizedPoint, epsilon = 1e-5): boolean {
  const crossProduct = (p.y - a.y) * (b.x - a.x) - (p.x - a.x) * (b.y - a.y);
  if (Math.abs(crossProduct) > epsilon) return false;

  const dotProduct = (p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y);
  if (dotProduct < 0) return false;

  const squaredLength = (b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y);
  if (dotProduct > squaredLength) return false;

  return true;
}

/**
 * Helper to determine 2D orientation of triplet (p, q, r).
 * 0 -> Collinear
 * 1 -> Clockwise
 * 2 -> Counterclockwise
 */
function getOrientation(p: NormalizedPoint, q: NormalizedPoint, r: NormalizedPoint): number {
  const val = (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
  if (Math.abs(val) < 1e-7) return 0;
  return val > 0 ? 1 : 2;
}

/**
 * Checks if point q lies on segment pr given that p, q, r are collinear.
 */
function onSegment(p: NormalizedPoint, q: NormalizedPoint, r: NormalizedPoint): boolean {
  return (
    q.x <= Math.max(p.x, r.x) + 1e-7 &&
    q.x >= Math.min(p.x, r.x) - 1e-7 &&
    q.y <= Math.max(p.y, r.y) + 1e-7 &&
    q.y >= Math.min(p.y, r.y) - 1e-7
  );
}

/**
 * Rigorous 2D Line-Segment Intersection test.
 * Determines whether segment (p1, p2) intersects segment (q1, q2).
 */
export function doLineSegmentsIntersect(
  p1: NormalizedPoint,
  p2: NormalizedPoint,
  q1: NormalizedPoint,
  q2: NormalizedPoint
): boolean {
  const o1 = getOrientation(p1, p2, q1);
  const o2 = getOrientation(p1, p2, q2);
  const o3 = getOrientation(q1, q2, p1);
  const o4 = getOrientation(q1, q2, p2);

  // General case: segments straddle each other's infinite lines
  if (o1 !== o2 && o3 !== o4) {
    return true;
  }

  // Collinear special cases
  if (o1 === 0 && onSegment(p1, q1, p2)) return true;
  if (o2 === 0 && onSegment(p1, q2, p2)) return true;
  if (o3 === 0 && onSegment(q1, p1, q2)) return true;
  if (o4 === 0 && onSegment(q1, p2, q2)) return true;

  return false;
}

/**
 * Calculates whether a track motion vector from `prevPos` to `currPos`
 * intersects a multi-segment line fence `fencePoints`.
 * Returns the intersected segment index and crossing details, or null if no crossing.
 */
export function checkFenceCrossing(
  prevPos: NormalizedPoint,
  currPos: NormalizedPoint,
  fencePoints: NormalizedPoint[]
): {
  crossed: boolean;
  segmentIndex: number;
  direction: 'LEFT_TO_RIGHT' | 'RIGHT_TO_LEFT';
} | null {
  if (!fencePoints || fencePoints.length < 2) return null;

  // Check each segment of the line fence
  for (let i = 0; i < fencePoints.length - 1; i++) {
    const fA = fencePoints[i];
    const fB = fencePoints[i + 1];

    if (doLineSegmentsIntersect(prevPos, currPos, fA, fB)) {
      const direction = calculateCrossingDirection(fA, fB, prevPos, currPos);
      return {
        crossed: true,
        segmentIndex: i,
        direction,
      };
    }
  }

  return null;
}

/**
 * Calculates crossing direction across a line segment A -> B using 2D vector cross product.
 * Fence vector: F = B - A
 * Movement vector: M = currPos - prevPos
 *
 * Cross(F, M) = F.x * M.y - F.y * M.x
 * - Positive: Motion vector swings to the right of F -> 'LEFT_TO_RIGHT'
 * - Negative: Motion vector swings to the left of F -> 'RIGHT_TO_LEFT'
 */
export function calculateCrossingDirection(
  fenceStart: NormalizedPoint,
  fenceEnd: NormalizedPoint,
  trackPrev: NormalizedPoint,
  trackCurr: NormalizedPoint
): 'LEFT_TO_RIGHT' | 'RIGHT_TO_LEFT' {
  const fx = fenceEnd.x - fenceStart.x;
  const fy = fenceEnd.y - fenceStart.y;
  const mx = trackCurr.x - trackPrev.x;
  const my = trackCurr.y - trackPrev.y;

  const cross = fx * my - fy * mx;
  return cross >= 0 ? 'LEFT_TO_RIGHT' : 'RIGHT_TO_LEFT';
}

/**
 * Calculates Euclidean distance between two normalized points.
 */
export function pointDistance(a: NormalizedPoint, b: NormalizedPoint): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Validates zone or virtual fence geometry.
 */
export function validateGeometry(
  type: SpatialGeometryType,
  coordinates: NormalizedPoint[]
): { valid: boolean; error?: string } {
  if (!Array.isArray(coordinates)) {
    return { valid: false, error: 'Coordinates must be an array of points.' };
  }

  // Range checks
  for (let i = 0; i < coordinates.length; i++) {
    const pt = coordinates[i];
    if (
      typeof pt.x !== 'number' ||
      typeof pt.y !== 'number' ||
      !Number.isFinite(pt.x) ||
      !Number.isFinite(pt.y)
    ) {
      return { valid: false, error: `Point index ${i} has invalid numeric values.` };
    }
    if (pt.x < 0 || pt.x > 1 || pt.y < 0 || pt.y > 1) {
      return { valid: false, error: `Point index ${i} coordinates (${pt.x}, ${pt.y}) out of normalized [0, 1] range.` };
    }
  }

  if (type === 'POLYGON') {
    if (coordinates.length < 3) {
      return { valid: false, error: 'Polygons require at least 3 vertices.' };
    }

    // Check for duplicate consecutive points
    for (let i = 0; i < coordinates.length; i++) {
      const next = (i + 1) % coordinates.length;
      if (pointDistance(coordinates[i], coordinates[next]) < 1e-4) {
        return { valid: false, error: `Vertices ${i} and ${next} are identical or too close.` };
      }
    }

    // Check non-collinear (approximate polygon area > 0)
    let area = 0;
    for (let i = 0, j = coordinates.length - 1; i < coordinates.length; j = i++) {
      area += (coordinates[j].x + coordinates[i].x) * (coordinates[j].y - coordinates[i].y);
    }
    if (Math.abs(area / 2) < 1e-5) {
      return { valid: false, error: 'Polygon vertices are collinear or form zero area.' };
    }
  } else if (type === 'LINE') {
    if (coordinates.length < 2) {
      return { valid: false, error: 'Virtual fence lines require at least 2 points.' };
    }

    // Endpoints cannot be identical
    if (pointDistance(coordinates[0], coordinates[coordinates.length - 1]) < 1e-4) {
      return { valid: false, error: 'Virtual fence endpoints cannot be identical.' };
    }
  }

  return { valid: true };
}
