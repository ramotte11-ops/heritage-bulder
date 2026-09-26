/**
 * A13 — Dynamic Polaroid — Desktop Light — PILOT manifest, CALIBRATION V2
 * + CALIBRATION V2.1 corrections.
 *
 * V2.1 (`A13_G6_DESKTOP_LIGHT_MANIFEST_1670_V2_1.json`, "inherits" V2,
 * "composition": "UNCHANGED_FROM_V2") only changes three things, all
 * transcribed below: the caption contract (real glyph bounds, local X text
 * shift, D5 band 72 px), the ratio contract (classification on the MEDIA
 * ratio only) and the D1 left extension (−12 ± 3 px). The V2 caption safe
 * zones are kept as provenance but are no longer a collision rule
 * ("removedFromV2": whole-caption-band safe-zone inviolability, D3
 * mechanical area reduction).
 *
 * Transcribed verbatim from `A13_G6_DESKTOP_LIGHT_MANIFEST_1670_V2.json`
 * (package `A13_DYNAMIC_POLAROID_DESKTOP_LIGHT_CALIBRATION_V2`) and its
 * contract `A13_DYNAMIC_POLAROID_DESKTOP_LIGHT_CALIBRATION_V2.md`. V2
 * replaces every V1 geometry value: the V1 `maxEnvelope`, anchors-as-centres
 * and expansion strings are gone. Nothing below is tuned by the renderer.
 *
 * ## Weight comes from the target surface, never from an envelope
 *
 * Contract §1: "Le prototype V2 ne doit jamais utiliser « le plus grand
 * tirage qui entre dans l'enveloppe »… la surface cible porte le poids
 * visuel." Each slot carries a reference box (the Master tirage), its
 * target OUTER area, comfortable/hard area ranges, a fixed anchor point of
 * that box and the directions the tirage may grow in.
 *
 * ## One coordinate system: 1670 × 941
 *
 * The manifest's `normalization` block records how the 1672-wide Master
 * measurements were brought to 1670; it is provenance only and is
 * deliberately not transcribed — nothing at runtime ever reads a 1672 value.
 *
 * ## Foreground O1/O2 — DEFERRED, POST PILOT (not reopened by V2)
 */

export const A13_PILOT_CANVAS = { width: 1670, height: 941 } as const;

/** Runtime background (photo-free GREEN), 1670 × 941, byte-identical to
 * `A13_G6_DESKTOP_LIGHT_BACKGROUND_PHOTO_FREE_V1.png` (SHA-256 3215073f…3c95d). */
export const A13_PILOT_BACKGROUND_SRC = "/assets/gallery/a13-pilot/g6-desktop-light-background-photo-free-v1.png";

export const A13_PILOT_LAYER_Z = {
  background: 0,
  runtimeText: 60,
} as const;

/** Contract §8: ±2 px source, ±0.3°. */
export const A13_PILOT_GEOMETRY_TOLERANCE = { positionPx: 2, sizePx: 2, rotationDeg: 0.3 } as const;

/** Point of the (unrotated) reference box that stays fixed when the ratio
 * changes. The tirage grows away from it (manifest `expansion`). */
export type A13Anchor = "left-bottom" | "bottom-center" | "top-center" | "right-top" | "right-bottom";

export interface A13SafeZone {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export interface A13Slot {
  slotId: "D1" | "D2" | "D3" | "D4" | "D5" | "D6";
  mediaIndex: number;
  /** Centre of the reference box (Master tirage). Rotation pivot. */
  center: { x: number; y: number };
  referenceSize: { width: number; height: number };
  targetOuterArea: number;
  comfortableAreaFactor: { min: number; max: number };
  hardAreaFactor: { min: number; max: number };
  rotationDeg: number;
  anchor: A13Anchor;
  expansion: readonly string[];
  zIndex: number;
  /** V2 provenance only — V2.1 removed safe-zone inviolability. */
  captionSafeZone: A13SafeZone;
  /** V2.1 — D5 only: fixed bottom band (outer size and target area unchanged). */
  bottomBandOverridePx?: number;
}

export const A13_PILOT_SLOTS: readonly A13Slot[] = [
  { slotId: "D1", mediaIndex: 0, center: { x: 190, y: 585 }, referenceSize: { width: 334, height: 382 }, targetOuterArea: 127588, comfortableAreaFactor: { min: 0.94, max: 1.06 }, hardAreaFactor: { min: 0.9, max: 1.1 }, rotationDeg: -9.5, anchor: "left-bottom", expansion: ["right", "up"], zIndex: 30, captionSafeZone: { xMin: 0.12, xMax: 0.88, yMin: 0.81, yMax: 0.97 } },
  { slotId: "D2", mediaIndex: 1, center: { x: 548.5, y: 493 }, referenceSize: { width: 390, height: 500 }, targetOuterArea: 195000, comfortableAreaFactor: { min: 0.94, max: 1.06 }, hardAreaFactor: { min: 0.9, max: 1.1 }, rotationDeg: 7.5, anchor: "bottom-center", expansion: ["up", "horizontal-symmetric"], zIndex: 40, captionSafeZone: { xMin: 0.19, xMax: 0.81, yMin: 0.82, yMax: 0.97 } },
  { slotId: "D3", mediaIndex: 2, center: { x: 812, y: 648 }, referenceSize: { width: 326, height: 382 }, targetOuterArea: 124532, comfortableAreaFactor: { min: 0.93, max: 1.07 }, hardAreaFactor: { min: 0.89, max: 1.11 }, rotationDeg: 6.5, anchor: "bottom-center", expansion: ["up", "horizontal-symmetric"], zIndex: 60, captionSafeZone: { xMin: 0.12, xMax: 0.88, yMin: 0.81, yMax: 0.97 } },
  { slotId: "D4", mediaIndex: 3, center: { x: 1085, y: 431 }, referenceSize: { width: 365, height: 342 }, targetOuterArea: 124830, comfortableAreaFactor: { min: 0.94, max: 1.06 }, hardAreaFactor: { min: 0.9, max: 1.1 }, rotationDeg: -6.5, anchor: "top-center", expansion: ["down", "horizontal-symmetric"], zIndex: 50, captionSafeZone: { xMin: 0.13, xMax: 0.87, yMin: 0.81, yMax: 0.97 } },
  { slotId: "D5", mediaIndex: 4, center: { x: 1466, y: 467 }, referenceSize: { width: 316, height: 318 }, targetOuterArea: 100488, comfortableAreaFactor: { min: 0.94, max: 1.06 }, hardAreaFactor: { min: 0.9, max: 1.1 }, rotationDeg: 9, anchor: "right-top", expansion: ["left", "down"], zIndex: 70, captionSafeZone: { xMin: 0.12, xMax: 0.88, yMin: 0.81, yMax: 0.97 }, bottomBandOverridePx: 72 },
  { slotId: "D6", mediaIndex: 5, center: { x: 1260, y: 753 }, referenceSize: { width: 520, height: 312 }, targetOuterArea: 162240, comfortableAreaFactor: { min: 0.94, max: 1.06 }, hardAreaFactor: { min: 0.9, max: 1.1 }, rotationDeg: -5, anchor: "right-bottom", expansion: ["left", "up"], zIndex: 35, captionSafeZone: { xMin: 0.15, xMax: 0.85, yMin: 0.82, yMax: 0.97 } },
];

/**
 * V2.1 §4 — the adaptive range applies EXCLUSIVELY to the media's intrinsic
 * ratio (`mediaWidth / mediaHeight`); the outer ratio is a result, never a
 * classification input.
 */
export const A13_PILOT_PHOTO_POLICY = {
  familyOrderStrict: true,
  sortByRatio: false,
  adaptiveMediaRatio: { min: 0.67, max: 1.78 },
  insideRange: "photo-window-ratio-equals-media-ratio",
  outsideRange: "bounded-outer-format-plus-contain",
  distortion: false,
} as const;

/** V2.1 §5 — D1 rotated bounding box min X, source px ("12 px of the rotated
 * bounding box is outside the left canvas edge"; never +12). */
export const A13_PILOT_D1_LEFT_EXTENT = { minX: -12, tolerance: 3 } as const;

/** V2.1 §2 — caption contract. */
export const A13_PILOT_CAPTION = {
  maxChars: 32,
  maxLines: 2,
  fontSizePx: 27,
  lineHeight: 1.05,
  weight: 400,
  color: "#5A4A3E",
  fontFamilyResolved: "La Belle Aurore",
  safetyMarginPx: { x: 6, y: 4 },
  shiftStepPx: 2,
  maxShiftFactorOfBandWidth: 0.18,
  minimumTwoLineContentHeightPx: 65,
} as const;

/** Contract V2 §6 — `DynamicPolaroid` paper and shadow, source px @1670
 * (caption typography: `A13_PILOT_CAPTION`, V2.1). */
export const A13_PILOT_POLAROID = {
  paperColor: "#F4EBDF",
  texture: { maxOpacity: 0.08, maxContrast: 0.04 },
  innerStroke: { widthPx: 1.2, color: "rgba(116,91,67,0.24)" },
  photoSidePadding: { percent: 0.04, minPx: 12, maxPx: 17 },
  bottomBand: { heightFactor: 0.18, minPx: 58, maxPx: 82 },
  shadow: {
    contact: { y: 3, blur: 5, color: "rgba(55,39,25,0.20)" },
    diffusion: { y: 14, blur: 24, color: "rgba(55,39,25,0.14)" },
  },
} as const;
