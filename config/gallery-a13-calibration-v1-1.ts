/**
 * A13 — Desktop Light — Multi-state manifest CALIBRATION V1.1 (G2–G5).
 *
 * Transcribed verbatim from `calibration-v1.1.json` (package
 * `A13_DESKTOP_LIGHT_MULTI_STATE_MANIFEST_CALIBRATION_V1_1`, GREEN QG). It
 * adds ONE variable to the G2–G5 manifests: a uniform scale-down factor
 * `s ≤ 1` of a whole Polaroid around its prescribed anchor, chosen as the
 * largest valid value at 0.001 precision (see
 * `lib/memorial/gallery/manifest-calibration.ts`). Envelopes already include
 * their 4 px measurement margin: no runtime tolerance is added.
 *
 * G6 exact and G6 Signature 7+ are out of scope and unchanged.
 */

export const A13_CALIBRATION_STATES = ["G2", "G3", "G4", "G5"] as const;
export type A13CalibratedStateId = (typeof A13_CALIBRATION_STATES)[number];

/** Protected title zone, source px — allowed intersection 0 px². */
export const A13_PROTECTED_TITLE_ZONE = { x: 640, y: 72, width: 430, height: 116 } as const;

export const A13_SCALE_PRECISION = 0.001;

export interface A13SlotCalibration {
  /** AABB [xMin, yMin, xMax, yMax], tested against the ROTATED outer quad. */
  envelope: readonly [number, number, number, number];
  minScale: number;
  /** Lower slots whose real caption glyphs (+6/4 px) this slot must not cover. */
  protectCaptionOf?: readonly string[];
}

export const A13_SLOT_CALIBRATION: Record<string, A13SlotCalibration> = {
  "G2-D1": { envelope: [290, 271, 1016, 831], minScale: 0.78 },
  "G2-D2": { envelope: [940, 330, 1497, 848], minScale: 0.8 },
  "G3-D1": { envelope: [153, 154, 870, 787], minScale: 0.76 },
  "G3-D2": { envelope: [939, 171, 1461, 587], minScale: 0.8 },
  "G3-D3": { envelope: [781, 447, 1395, 934], minScale: 0.74, protectCaptionOf: ["G3-D2"] },
  "G4-D1": { envelope: [117, 133, 744, 747], minScale: 0.76 },
  "G4-D2": { envelope: [839, 142, 1371, 594], minScale: 0.78 },
  "G4-D3": { envelope: [631, 475, 1240, 891], minScale: 0.74 },
  "G4-D4": { envelope: [1224, 391, 1623, 854], minScale: 0.78 },
  "G5-D1": { envelope: [63, 231, 654, 814], minScale: 0.76 },
  "G5-D2": { envelope: [667, 172, 1173, 595], minScale: 0.78 },
  "G5-D3": { envelope: [1163, 159, 1612, 604], minScale: 0.78 },
  "G5-D4": { envelope: [531, 502, 1032, 891], minScale: 0.74 },
  // bottomBandHeightSourcePx 72 → manifest `bottomBandOverridePx` (G5-D5).
  "G5-D5": { envelope: [1088, 487, 1487, 876], minScale: 0.74, protectCaptionOf: ["G5-D3"] },
};

export interface A13OcclusionCap {
  state: A13CalibratedStateId;
  occluder: string;
  protectedPhoto: string;
  maxPercent: number;
  aggregateMaxPercent: number;
}

/** Share of the lower photo WINDOW covered by the upper opaque outer. */
export const A13_OCCLUSION_CAPS: readonly A13OcclusionCap[] = [
  { state: "G2", occluder: "G2-D2", protectedPhoto: "G2-D1", maxPercent: 10, aggregateMaxPercent: 10 },
  { state: "G3", occluder: "G3-D3", protectedPhoto: "G3-D2", maxPercent: 12, aggregateMaxPercent: 12 },
  { state: "G4", occluder: "G4-D2", protectedPhoto: "G4-D3", maxPercent: 10, aggregateMaxPercent: 15 },
  { state: "G4", occluder: "G4-D4", protectedPhoto: "G4-D3", maxPercent: 12, aggregateMaxPercent: 15 },
  { state: "G5", occluder: "G5-D2", protectedPhoto: "G5-D4", maxPercent: 10, aggregateMaxPercent: 18 },
  { state: "G5", occluder: "G5-D3", protectedPhoto: "G5-D4", maxPercent: 12, aggregateMaxPercent: 18 },
  { state: "G5", occluder: "G5-D5", protectedPhoto: "G5-D4", maxPercent: 12, aggregateMaxPercent: 18 },
  { state: "G5", occluder: "G5-D5", protectedPhoto: "G5-D3", maxPercent: 10, aggregateMaxPercent: 10 },
];

export function isCalibratedState(stateId: string): stateId is A13CalibratedStateId {
  return (A13_CALIBRATION_STATES as readonly string[]).includes(stateId);
}
