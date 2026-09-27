/**
 * A13 — G3 Desktop Light — COUPLED SLOT TERRITORY calibration V1 (pilot).
 *
 * Transcribed verbatim from `coupled-slot-territory-v1.json` (package
 * `A13_G3_DESKTOP_LIGHT_COUPLED_SLOT_TERRITORY_CALIBRATION_V1`, GREEN QG
 * for the runtime pilot). Scope: the G3-D2 ↔ G3-D3 relation only. The
 * individual Slot Territory V1 limits (`gallery-a13-g3-territory.ts`) stay
 * applicable as outer bounds; D1 is unchanged.
 *
 * Vectors and centres are canvas pixels (1670 × 941, origin top-left,
 * y downwards). The relative vector is R = centre(D3) − centre(D2); its
 * angle is atan2(ΔY, ΔX) in that frame (witness 109.8°).
 */

export const G3_COUPLE = {
  members: ["G3-D2", "G3-D3"] as const,
  witness: {
    d2Center: { x: 1199.6, y: 379.0 },
    d3Center: { x: 1087.7, y: 690.0 },
    coupleCenter: { x: 1143.65, y: 534.5 },
    relativeVector: { x: -111.9, y: 311.0 },
    centerDistancePx: 330.5,
    angleDeg: 109.8,
  },
  /** Bounds of C = (centre D2 + centre D3) / 2. */
  coupleCenterTerritory: { xMin: 1065, xMax: 1220, yMin: 470, yMax: 600 },
  relativeVector: {
    /** ((ΔX + 111.9) / 85)² + ((ΔY − 311) / 80)² ≤ 1 */
    ellipse: { center: { x: -111.9, y: 311.0 }, radiusX: 85, radiusY: 80 },
    requireDxNegative: true,
    requireDyPositive: true,
    distancePx: { min: 280, max: 385 },
    angleDeg: { min: 98, max: 122 },
  },
  contourRelation: {
    maximumGapWhenNotOverlappingPx: 24,
    d3AboveD2: true,
    maximumD2PhotoOcclusionPercent: 12,
    d2CaptionGlyphIntersectionPx2: 0,
  },
  /** Proximity after priorities 1–6: E = 3·Er + 1.5·Ec + Ei. */
  proximityWeights: { relative: 3, coupleCenter: 1.5, individual: 1 },
} as const;
