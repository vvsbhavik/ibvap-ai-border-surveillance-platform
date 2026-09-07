/**
 * Mathematical calculations for Geographic Information Systems (GIS)
 * and SVG mapping geometries. Client & Browser Safe.
 */

/**
 * Mathematical SVG Arc Generator for Camera Field of View Cones:
 * Returns an SVG path `d` string representing an estimated coverage pie slice.
 *
 * @param cx Center X in SVG viewport pixels
 * @param cy Center Y in SVG viewport pixels
 * @param radius Arc radius in SVG pixels
 * @param azimuthDegrees 0 = North (up), 90 = East (right), 180 = South (down), 270 = West (left)
 * @param fovDegrees Total field of view spread angle in degrees
 */
export function calculateFovArcPath(
  cx: number,
  cy: number,
  radius: number,
  azimuthDegrees: number,
  fovDegrees: number
): string {
  const halfFov = fovDegrees / 2;
  const startAngleDeg = azimuthDegrees - halfFov;
  const endAngleDeg = azimuthDegrees + halfFov;

  // Convert to math radians where 0 is East and angles increase counter-clockwise
  // Navigation heading: 0° is North (SVG -Y), 90° is East (SVG +X)
  const toSvgCoords = (angleDeg: number) => {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return {
      x: cx + radius * Math.cos(rad),
      y: cy + radius * Math.sin(rad),
    };
  };

  const start = toSvgCoords(startAngleDeg);
  const end = toSvgCoords(endAngleDeg);
  const largeArcFlag = fovDegrees > 180 ? 1 : 0;

  return `M ${cx} ${cy} L ${start.x.toFixed(1)} ${start.y.toFixed(1)} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x.toFixed(1)} ${end.y.toFixed(1)} Z`;
}
