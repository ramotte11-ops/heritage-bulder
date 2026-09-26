import { A13_PILOT_SLOTS, type A13Slot } from "@/config/gallery-a13-pilot-manifest";
import type { Language } from "@/config/languages";

/**
 * A13 — Dynamic Polaroid — Desktop Light — MULTI-STATE manifests V1.
 *
 * Transcribed verbatim from `A13_MULTI_STATE_MANIFESTS_V1.json` and
 * `A13_CTA_7PLUS_DESKTOP_LIGHT_CONTRACT_V1.json` (package
 * `A13_DYNAMIC_POLAROID_DESKTOP_LIGHT_MULTI_STATE_MANIFEST_PACKAGE_V1`,
 * GREEN QG). One closed manifest per state, one common background, one
 * engine (DynamicPolaroid V2.1, unchanged):
 *
 * - the NUMBER of media selects a manifest (`selectGalleryState`); it never
 *   computes a composition — no reflow, no masonry, no derivation from G6;
 * - G6 exact IS the V2.1 GREEN manifest (`A13_PILOT_SLOTS`), referenced, not
 *   copied or recalibrated (accepted pilot deviation D1 = −16.4 px);
 * - every other value below is the package's own number. The JSON's shared
 *   area factors ([0.94, 1.06] / [0.90, 1.10]) are spelled out per slot;
 *   `bottomBandHeightPx` (G7-D5) is the engine's existing
 *   `bottomBandOverridePx` field.
 */

export const A13_GALLERY_STATES = ["G2", "G3", "G4", "G5", "G6", "G6_SIGNATURE_7PLUS"] as const;
export type A13GalleryStateId = (typeof A13_GALLERY_STATES)[number];

const COMFORT = { min: 0.94, max: 1.06 } as const;
const HARD = { min: 0.9, max: 1.1 } as const;

type SlotInput = Omit<A13Slot, "comfortableAreaFactor" | "hardAreaFactor">;
const closed = (slots: SlotInput[]): readonly A13Slot[] =>
  slots.map((s) => ({ ...s, comfortableAreaFactor: COMFORT, hardAreaFactor: HARD }));

export const A13_STATE_SLOTS: Record<A13GalleryStateId, readonly A13Slot[]> = {
  G2: closed([
    { slotId: "G2-D1", mediaIndex: 0, center: { x: 653.2, y: 551 }, referenceSize: { width: 668.2, height: 480 }, targetOuterArea: 320736, rotationDeg: -6.5, anchor: "left-bottom", expansion: ["right", "up"], zIndex: 30 },
    { slotId: "G2-D2", mediaIndex: 1, center: { x: 1218.5, y: 589 }, referenceSize: { width: 479.4, height: 430 }, targetOuterArea: 206142, rotationDeg: 10.5, anchor: "right-bottom", expansion: ["left", "up"], zIndex: 40 },
  ]),
  G3: closed([
    { slotId: "G3-D1", mediaIndex: 0, center: { x: 511.4, y: 470 }, referenceSize: { width: 624.3, height: 520 }, targetOuterArea: 324636, rotationDeg: -10.5, anchor: "left-bottom", expansion: ["right", "up"], zIndex: 30 },
    { slotId: "G3-D2", mediaIndex: 1, center: { x: 1199.6, y: 379 }, referenceSize: { width: 464.4, height: 335 }, targetOuterArea: 155574, rotationDeg: 9.7, anchor: "right-top", expansion: ["left", "down"], zIndex: 40 },
    { slotId: "G3-D3", mediaIndex: 2, center: { x: 1087.7, y: 690 }, referenceSize: { width: 537.4, height: 370 }, targetOuterArea: 198838, rotationDeg: 12.7, anchor: "right-bottom", expansion: ["left", "up"], zIndex: 50 },
  ]),
  G4: closed([
    { slotId: "G4-D1", mediaIndex: 0, center: { x: 430.5, y: 440 }, referenceSize: { width: 549.3, height: 535 }, targetOuterArea: 293876, rotationDeg: -8.0, anchor: "left-bottom", expansion: ["right", "up"], zIndex: 30 },
    { slotId: "G4-D2", mediaIndex: 1, center: { x: 1104.7, y: 368 }, referenceSize: { width: 471.4, height: 375 }, targetOuterArea: 176775, rotationDeg: 9.0, anchor: "right-top", expansion: ["left", "down"], zIndex: 50 },
    { slotId: "G4-D3", mediaIndex: 2, center: { x: 934.9, y: 683 }, referenceSize: { width: 557.3, height: 326 }, targetOuterArea: 181680, rotationDeg: 8.8, anchor: "bottom-center", expansion: ["up", "horizontal-symmetric"], zIndex: 40 },
    { slotId: "G4-D4", mediaIndex: 3, center: { x: 1423.3, y: 622 }, referenceSize: { width: 331.6, height: 408 }, targetOuterArea: 135293, rotationDeg: 9.0, anchor: "right-bottom", expansion: ["left", "up"], zIndex: 60 },
  ]),
  G5: closed([
    { slotId: "G5-D1", mediaIndex: 0, center: { x: 358.6, y: 522 }, referenceSize: { width: 499.4, height: 490 }, targetOuterArea: 244706, rotationDeg: -10.8, anchor: "left-bottom", expansion: ["right", "up"], zIndex: 30 },
    { slotId: "G5-D2", mediaIndex: 1, center: { x: 919.9, y: 383 }, referenceSize: { width: 457.5, height: 362 }, targetOuterArea: 165615, rotationDeg: -7.0, anchor: "top-center", expansion: ["down", "horizontal-symmetric"], zIndex: 50 },
    { slotId: "G5-D3", mediaIndex: 2, center: { x: 1387.3, y: 381 }, referenceSize: { width: 379.5, height: 375 }, targetOuterArea: 142313, rotationDeg: 10.5, anchor: "right-top", expansion: ["left", "down"], zIndex: 60 },
    { slotId: "G5-D4", mediaIndex: 3, center: { x: 781.1, y: 696 }, referenceSize: { width: 457.5, height: 330 }, targetOuterArea: 150975, rotationDeg: 6.7, anchor: "bottom-center", expansion: ["up", "horizontal-symmetric"], zIndex: 40 },
    { slotId: "G5-D5", mediaIndex: 4, center: { x: 1287.5, y: 681 }, referenceSize: { width: 349.6, height: 338 }, targetOuterArea: 118165, rotationDeg: -7.5, anchor: "right-bottom", expansion: ["left", "up"], zIndex: 70 },
  ]),
  G6: A13_PILOT_SLOTS,
  G6_SIGNATURE_7PLUS: closed([
    { slotId: "G7-D1", mediaIndex: 0, center: { x: 204, y: 580 }, referenceSize: { width: 320, height: 375 }, targetOuterArea: 120000, rotationDeg: -10.0, anchor: "left-bottom", expansion: ["right", "up"], zIndex: 30 },
    { slotId: "G7-D2", mediaIndex: 1, center: { x: 550, y: 490 }, referenceSize: { width: 390, height: 490 }, targetOuterArea: 191100, rotationDeg: 7.5, anchor: "bottom-center", expansion: ["up", "horizontal-symmetric"], zIndex: 40 },
    { slotId: "G7-D3", mediaIndex: 2, center: { x: 821, y: 645 }, referenceSize: { width: 322, height: 380 }, targetOuterArea: 122360, rotationDeg: 7.0, anchor: "bottom-center", expansion: ["up", "horizontal-symmetric"], zIndex: 60 },
    { slotId: "G7-D4", mediaIndex: 3, center: { x: 1085, y: 434 }, referenceSize: { width: 345, height: 315 }, targetOuterArea: 108675, rotationDeg: -7.0, anchor: "top-center", expansion: ["down", "horizontal-symmetric"], zIndex: 50 },
    { slotId: "G7-D5", mediaIndex: 4, center: { x: 1465, y: 468 }, referenceSize: { width: 300, height: 312 }, targetOuterArea: 93600, rotationDeg: 9.5, anchor: "right-top", expansion: ["left", "down"], zIndex: 70, bottomBandOverridePx: 72 },
    { slotId: "G7-D6", mediaIndex: 5, center: { x: 1268, y: 739 }, referenceSize: { width: 493, height: 285 }, targetOuterArea: 140505, rotationDeg: -5.0, anchor: "right-bottom", expansion: ["left", "up"], zIndex: 35 },
  ]),
};

/**
 * Product mapping (QG): 0–1 media → no gallery; 2…6 → G2…G6 exact;
 * ≥ 7 → G6 Signature 7+ (six memories shown + CTA). Selection only.
 */
export function selectGalleryState(mediaCount: number): A13GalleryStateId | null {
  if (!Number.isInteger(mediaCount) || mediaCount < 2) return null;
  if (mediaCount >= 7) return "G6_SIGNATURE_7PLUS";
  return (["G2", "G3", "G4", "G5", "G6"] as const)[mediaCount - 2];
}

/** `CTA_7PLUS_V1` — runtime DOM button, never baked. Source px @1670. */
export const A13_CTA_7PLUS = {
  contractId: "CTA_7PLUS_V1",
  state: "G6_SIGNATURE_7PLUS",
  geometry: { x: 616, y: 848, width: 440, height: 74, contentInset: { x: 24, y: 10 } },
  zIndex: 80,
  typography: { fontFamily: "EB Garamond", style: "italic", weight: 400, fontSizePx: 34, lineHeight: 1.1, maxLines: 1 },
  maxRenderedWidthPx: 392,
  minimumHitAreaCssPx: { width: 44, height: 44 },
  focus: { widthPx: 2, offsetPx: 4 },
} as const satisfies { state: A13GalleryStateId } & Record<string, unknown>;

/**
 * CTA labels for the PILOT only — deliberately NOT in the product i18n
 * dictionaries. Package report: "Son texte témoin ne devient pas contenu
 * produit" and "Les libellés CTA définitifs EN/ES ne sont pas encore
 * fournis". FR is the package's witness text; EN/ES are pilot candidates
 * awaiting QG/translation validation. Each is measured at runtime against
 * `maxRenderedWidthPx` (overflow ⇒ QG STOP, never ellipsis/auto-shrink).
 */
export const A13_CTA_7PLUS_PILOT_LABELS: Record<Language, { text: string; status: "witness" | "pilot-candidate" }> = {
  fr: { text: "Voir plus de souvenirs", status: "witness" },
  en: { text: "See more memories", status: "pilot-candidate" },
  es: { text: "Ver más recuerdos", status: "pilot-candidate" },
};
