/**
 * A13 — Dynamic Polaroid — Desktop Light — PILOT manifest.
 *
 * Transcribed verbatim from `A13_G6_DESKTOP_LIGHT_MANIFEST_1670_V1.json`
 * (package `A13_DYNAMIC_POLAROID_DESKTOP_LIGHT_OPUS_PILOT_PACKAGE_V1`,
 * SHA-256 20b463d0…5c015c). Every slot value below is the manifest's own
 * number — anchors, envelopes, rotations, z-index and expansion strings are
 * never tuned here.
 *
 * ## One coordinate system: 1670 × 941
 *
 * QG pilot authorization: "Référentiel runtime unique : 1670 × 941 px.
 * AUCUNE valeur 1672 px." The manifest's own `sourceNormalization` block
 * (the measurement-time 1672 source it was normalized FROM) is therefore
 * deliberately not transcribed: nothing at runtime ever reads it.
 *
 * ## Foreground O1/O2 — DEFERRED, POST PILOT
 *
 * The manifest lists a `foreground` layer (z 100, required). QG decision for
 * this pilot: "FOREGROUND O1/O2 = DEFERRED — POST PILOT" — Studio Work
 * returned "STOP — FOREGROUND NON EXPORTABLE CONSERVATIVEMENT". No
 * foreground is rendered, approximated, generated or drawn in CSS. The z
 * value is kept below only so the layer order stays documented.
 */

export const A13_PILOT_CANVAS = { width: 1670, height: 941 } as const;

/** Runtime background (photo-free GREEN), 1670 × 941, byte-identical to
 * `A13_G6_DESKTOP_LIGHT_BACKGROUND_PHOTO_FREE_V1.png` (SHA-256 3215073f…3c95d). */
export const A13_PILOT_BACKGROUND_SRC = "/assets/gallery/a13-pilot/g6-desktop-light-background-photo-free-v1.png";

export const A13_PILOT_LAYER_Z = {
  background: 0,
  runtimeText: 60,
  /** DEFERRED — not rendered in the pilot (see module docstring). */
  foreground: 100,
} as const;

export type A13Expansion = "inward-and-up" | "inward-and-vertical" | "inward-and-horizontal" | "inward-and-left";

export interface A13Slot {
  slotId: "D1" | "D2" | "D3" | "D4" | "D5" | "D6";
  mediaIndex: number;
  /** Centre of the slot (= centre of the Master tirage, verified by overlay). */
  anchor: { x: number; y: number };
  /** Maximum OUTER size of the tirage, in the slot's own (rotated) frame. */
  maxEnvelope: { width: number; height: number };
  rotationDeg: number;
  zIndex: number;
  expansion: A13Expansion;
  caption: { maxChars: number; maxLines: number };
}

export const A13_PILOT_SLOTS: readonly A13Slot[] = [
  { slotId: "D1", mediaIndex: 0, anchor: { x: 204.8, y: 568 }, maxEnvelope: { width: 382.5, height: 421 }, rotationDeg: -6, zIndex: 20, expansion: "inward-and-up", caption: { maxChars: 32, maxLines: 2 } },
  { slotId: "D2", mediaIndex: 1, anchor: { x: 557.3, y: 491 }, maxEnvelope: { width: 414.5, height: 520 }, rotationDeg: 3, zIndex: 30, expansion: "inward-and-vertical", caption: { maxChars: 32, maxLines: 2 } },
  { slotId: "D3", mediaIndex: 2, anchor: { x: 819.0, y: 648 }, maxEnvelope: { width: 359.6, height: 408 }, rotationDeg: 7, zIndex: 40, expansion: "inward-and-up", caption: { maxChars: 32, maxLines: 2 } },
  { slotId: "D4", mediaIndex: 3, anchor: { x: 1100.7, y: 446 }, maxEnvelope: { width: 412.5, height: 361 }, rotationDeg: -4, zIndex: 25, expansion: "inward-and-horizontal", caption: { maxChars: 32, maxLines: 2 } },
  { slotId: "D5", mediaIndex: 4, anchor: { x: 1454.3, y: 474 }, maxEnvelope: { width: 360.6, height: 342 }, rotationDeg: 7, zIndex: 35, expansion: "inward-and-left", caption: { maxChars: 32, maxLines: 2 } },
  { slotId: "D6", mediaIndex: 5, anchor: { x: 1266.5, y: 760 }, maxEnvelope: { width: 553.3, height: 330 }, rotationDeg: -7, zIndex: 45, expansion: "inward-and-up", caption: { maxChars: 32, maxLines: 2 } },
];

export const A13_PILOT_PHOTO_POLICY = {
  familyOrderIsAuthority: true,
  ratioSorting: false,
  adaptiveOuterRatioRange: { min: 0.67, max: 1.78 },
  cropVisibleFractionWithFocalPoint: 0.8,
  cropVisibleFractionWithoutFocalPoint: 0.85,
  fallback: "contain-with-paper-breathing-room",
  upscale: { acceptedMax: 1.25, warningMax: 1.5, hardMax: 1.5 },
  distortion: false,
} as const;

/** Contract: "La marge de collision initiale est de 12 px source autour de
 * chaque enveloppe." */
export const A13_PILOT_COLLISION_MARGIN = 12;

/**
 * Paper anatomy of the tirage, in canvas px (1670 frame).
 *
 * NOT in the manifest. The contract states "Papier, texture, liseré, bande
 * basse et double ombre doivent être calibrés par comparaison au Master. Les
 * valeurs finales sont des paramètres de QA". These are the values measured
 * on the Master GREEN QA panel (`QA_MASTER_GREEN_VS_BACKGROUND_V1.png`, left
 * panel, upscaled ×2 to 1670): side/top border ≈ 20 px, bottom band ≈ 72 px
 * on D1/D2/D6 (± 3 px — the panel is a half-resolution preview). One paper
 * stock for all six tirages, as in the Master. Submitted to QG as QA
 * parameters, not as a final lock.
 */
export const A13_PILOT_PAPER = {
  border: 20,
  bottomBand: 72,
} as const;
