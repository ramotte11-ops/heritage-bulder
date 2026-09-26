/**
 * A13 — G3 Desktop Light — SLOT TERRITORY calibration study V1 (pilot).
 *
 * Transcribed verbatim from `A13_G3_DESKTOP_LIGHT_SLOT_TERRITORY_STUDY_V1.json`
 * (package `A13_G3_DESKTOP_LIGHT_SLOT_TERRITORY_CALIBRATION_STUDY_V1`, GREEN
 * QG for execution on G3 only). The G3 manifest keeps its slots, media
 * order, rotations, anchors and z-index; the witness centre becomes a
 * PREFERRED position that may translate inside a closed territory, and the
 * linear scale may drop to an absolute floor. See
 * `lib/memorial/gallery/g3-territory.ts` for the solver.
 */

export interface G3TerritorySlot {
  slotId: "G3-D1" | "G3-D2" | "G3-D3";
  witnessCenter: { x: number; y: number };
  /** Bounds of the translated slot centre (witness centre + delta). */
  centerTerritory: { xMin: number; xMax: number; yMin: number; yMax: number };
  softMinimumLinearScale: number;
  absoluteMinimumLinearScale: number;
  role: "dominant-left" | "upper-right" | "lower-right-front";
}

export const G3_TERRITORY_SLOTS: readonly G3TerritorySlot[] = [
  { slotId: "G3-D1", witnessCenter: { x: 511.4, y: 470 }, centerTerritory: { xMin: 425, xMax: 600, yMin: 405, yMax: 555 }, softMinimumLinearScale: 0.9, absoluteMinimumLinearScale: 0.82, role: "dominant-left" },
  { slotId: "G3-D2", witnessCenter: { x: 1199.6, y: 379 }, centerTerritory: { xMin: 1085, xMax: 1320, yMin: 270, yMax: 445 }, softMinimumLinearScale: 0.9, absoluteMinimumLinearScale: 0.84, role: "upper-right" },
  { slotId: "G3-D3", witnessCenter: { x: 1087.7, y: 690 }, centerTerritory: { xMin: 965, xMax: 1225, yMin: 600, yMax: 790 }, softMinimumLinearScale: 0.9, absoluteMinimumLinearScale: 0.82, role: "lower-right-front" },
];

export const G3_TITLE_PROTECTION = {
  /** Added around the union of the rendered title + microcopy ink. */
  marginPx: { x: 18, y: 12 },
  /** Witness only — the runtime measurement always prevails. */
  witnessInkBounds: [660, 84, 1024, 154] as const,
  witnessProtectedBounds: [642, 72, 1042, 166] as const,
};

export const G3_RELATIONS = {
  maximumD2PhotoOcclusionPercent: 12,
  maximumContourGapPx: 28,
  minimumPhotoWindowGapPx: 34,
} as const;

export const G3_SEARCH = {
  translationStepPx: 2,
  translationRefinePx: 0.5,
  scaleStep: 0.005,
  scaleRefine: 0.001,
} as const;
