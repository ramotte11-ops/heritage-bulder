/**
 * A13 — Desktop Light — SIMPLIFIED MANIFESTS G2–G5 V2 (GREEN QG).
 *
 * Transcribed verbatim from package
 * `A13_DESKTOP_LIGHT_SIMPLIFIED_MANIFESTS_G2_G3_G4_G5_V2` (common-contract,
 * manifests G2…G5, fixture-matrix, master baselines). Product authority:
 * `A13_GALLERY_RUNTIME_SIMPLIFICATION_CONTRACT_V2` — GALERIE = COMPOSER,
 * VIEWER = CONTEMPLER.
 *
 * Scope: G2, G3, G4, G5 only. G6 exact and Signature 7+ are NOT described
 * here and never go through the V2 runtime. Geometry is theme-free: nothing
 * in this file (or in the V2 solver) depends on Light/Dark.
 *
 * CONTRACT PATCH V2.1 (`A13_DESKTOP_G2_G5_SIMPLIFIED_CONTRACT_PATCH_V2_1`,
 * GREEN QG) prevails on its four points: title authority (real glyph
 * contours per line + 3 px isotropic dilation), Master proximity (essential
 * relation before individual drift; G2-PAIR), G4-D3 ratio semantics, and
 * interactivity. Everything else is V2.
 */

export type V2StateId = "G2" | "G3" | "G4" | "G5";
export type V2Anchor = "left-bottom" | "bottom-center" | "top-center" | "right-top" | "right-bottom";

export interface V2Slot {
  slotId: string;
  mediaIndex: number;
  role: string;
  witness: {
    center: { x: number; y: number };
    outerSize: { width: number; height: number };
    outerArea: number;
    rotationDeg: number;
  };
  /** Local translation of the slot centre from the witness (hard). */
  territory: { xMin: number; xMax: number; yMin: number; yMax: number };
  /** Linear transform scale (witness = 1). */
  scaleBounds: { preferred: [number, number]; hard: [number, number] };
  anchor: V2Anchor;
  zIndex: number;
  /** G5-D5 only: fixed caption band (engine `bottomBandOverridePx`). */
  bottomBandHeightPx?: number;
  /** V2.1 — explicit witness ratio semantics (G4-D3): media ≠ window ≠ paper. */
  witnessMediaRatio?: number;
  witnessPhotoWindowRatio?: number;
  witnessOuterPolaroidRatio?: number;
}

export type V2Relation =
  | { type: "near"; members: string[]; strength: "soft"; witnessCenterDistance?: number; preferredTolerancePx?: number; target?: string }
  | { type: "overlap"; front: string; back: string; strength: "soft"; target: string }
  | { type: "stack"; members: [string, string]; strength: "soft"; relativeRole: Record<string, string> }
  /** V2.1 — essential soft preference (never rejects): signed outer hull gap
   * drift from the witness beyond a 40 px deadband, then front/back order. */
  | {
      type: "pair-coherence";
      relationId: string;
      members: [string, string];
      essentialSoftPreference: true;
      witness: { centerVector: { dx: number; dy: number }; centerDistance: number; front: string; back: string };
      deadbandPx: number;
    };

export interface V2Manifest {
  state: V2StateId;
  mediaCount: number;
  slots: V2Slot[];
  relations: V2Relation[];
  primitivesUsed: string[];
}

const P92: [number, number] = [0.92, 1.06];
const P90: [number, number] = [0.9, 1.07];
const HARD: [number, number] = [0.8, 1.1];
const t = (x: number, y: number) => ({ xMin: -x, xMax: x, yMin: -y, yMax: y });

export const A13_V2_MANIFESTS: Record<V2StateId, V2Manifest> = {
  G2: {
    state: "G2",
    mediaCount: 2,
    slots: [
      { slotId: "G2-D1", mediaIndex: 0, role: "dominant-left", witness: { center: { x: 653.2, y: 551 }, outerSize: { width: 668.2, height: 480 }, outerArea: 320736, rotationDeg: -6.5 }, territory: t(60, 45), scaleBounds: { preferred: P92, hard: HARD }, anchor: "left-bottom", zIndex: 30 },
      { slotId: "G2-D2", mediaIndex: 1, role: "secondary-right-front", witness: { center: { x: 1218.5, y: 589 }, outerSize: { width: 479.4, height: 430 }, outerArea: 206142, rotationDeg: 10.5 }, territory: t(50, 45), scaleBounds: { preferred: P92, hard: HARD }, anchor: "right-bottom", zIndex: 40 },
    ],
    // V2.1: G2-PAIR replaces the V2 `near` + `overlap` relations.
    relations: [
      {
        type: "pair-coherence",
        relationId: "G2-PAIR",
        members: ["G2-D1", "G2-D2"],
        essentialSoftPreference: true,
        witness: { centerVector: { dx: 565.3, dy: 38 }, centerDistance: 566.6, front: "G2-D2", back: "G2-D1" },
        deadbandPx: 40,
      },
    ],
    primitivesUsed: ["slot-territory", "role", "near-soft", "overlap-soft", "z-order", "title-protection"],
  },
  G3: {
    state: "G3",
    mediaCount: 3,
    slots: [
      { slotId: "G3-D1", mediaIndex: 0, role: "dominant-left", witness: { center: { x: 511.4, y: 470 }, outerSize: { width: 624.3, height: 520 }, outerArea: 324636, rotationDeg: -10.5 }, territory: t(75, 65), scaleBounds: { preferred: P92, hard: HARD }, anchor: "left-bottom", zIndex: 30 },
      { slotId: "G3-D2", mediaIndex: 1, role: "secondary-upper-right-back", witness: { center: { x: 1199.6, y: 379 }, outerSize: { width: 464.4, height: 335 }, outerArea: 155574, rotationDeg: 9.7 }, territory: t(105, 85), scaleBounds: { preferred: P90, hard: HARD }, anchor: "right-top", zIndex: 40 },
      { slotId: "G3-D3", mediaIndex: 2, role: "secondary-lower-right-front", witness: { center: { x: 1087.7, y: 690 }, outerSize: { width: 537.4, height: 370 }, outerArea: 198838, rotationDeg: 12.7 }, territory: t(110, 90), scaleBounds: { preferred: P90, hard: HARD }, anchor: "right-bottom", zIndex: 50 },
    ],
    relations: [
      { type: "stack", members: ["G3-D2", "G3-D3"], strength: "soft", relativeRole: { "G3-D2": "upper-back", "G3-D3": "lower-front" } },
      { type: "near", members: ["G3-D2", "G3-D3"], strength: "soft", witnessCenterDistance: 330.5, preferredTolerancePx: 105 },
    ],
    primitivesUsed: ["slot-territory", "role", "stack-soft", "near-soft", "z-order", "title-protection"],
  },
  G4: {
    state: "G4",
    mediaCount: 4,
    slots: [
      { slotId: "G4-D1", mediaIndex: 0, role: "dominant-left", witness: { center: { x: 430.5, y: 440 }, outerSize: { width: 549.3, height: 535 }, outerArea: 293876, rotationDeg: -8 }, territory: t(65, 55), scaleBounds: { preferred: P92, hard: HARD }, anchor: "left-bottom", zIndex: 30 },
      { slotId: "G4-D2", mediaIndex: 1, role: "upper-center-right", witness: { center: { x: 1104.7, y: 368 }, outerSize: { width: 471.4, height: 375 }, outerArea: 176775, rotationDeg: 9 }, territory: t(90, 75), scaleBounds: { preferred: P90, hard: HARD }, anchor: "right-top", zIndex: 50 },
      { slotId: "G4-D3", mediaIndex: 2, role: "lower-center-back", witness: { center: { x: 934.9, y: 683 }, outerSize: { width: 557.3, height: 326 }, outerArea: 181680, rotationDeg: 8.8 }, territory: t(100, 70), scaleBounds: { preferred: P90, hard: HARD }, anchor: "bottom-center", zIndex: 40, witnessMediaRatio: 2.09, witnessPhotoWindowRatio: 2.09, witnessOuterPolaroidRatio: 1.7095 },
      { slotId: "G4-D4", mediaIndex: 3, role: "right-front", witness: { center: { x: 1423.3, y: 622 }, outerSize: { width: 331.6, height: 408 }, outerArea: 135293, rotationDeg: 9 }, territory: t(70, 75), scaleBounds: { preferred: P90, hard: HARD }, anchor: "right-bottom", zIndex: 60 },
    ],
    relations: [
      { type: "overlap", front: "G4-D2", back: "G4-D3", strength: "soft", target: "preserve-upper-over-lower-depth" },
      { type: "overlap", front: "G4-D4", back: "G4-D3", strength: "soft", target: "preserve-right-over-lower-depth" },
      { type: "near", members: ["G4-D2", "G4-D3", "G4-D4"], strength: "soft", target: "coherent-right-cluster" },
    ],
    primitivesUsed: ["slot-territory", "role", "overlap-soft", "near-soft", "z-order", "title-protection"],
  },
  G5: {
    state: "G5",
    mediaCount: 5,
    slots: [
      { slotId: "G5-D1", mediaIndex: 0, role: "dominant-left", witness: { center: { x: 358.6, y: 522 }, outerSize: { width: 499.4, height: 490 }, outerArea: 244706, rotationDeg: -10.8 }, territory: t(55, 55), scaleBounds: { preferred: P92, hard: HARD }, anchor: "left-bottom", zIndex: 30 },
      { slotId: "G5-D2", mediaIndex: 1, role: "upper-center", witness: { center: { x: 919.9, y: 383 }, outerSize: { width: 457.5, height: 362 }, outerArea: 165615, rotationDeg: -7 }, territory: t(80, 70), scaleBounds: { preferred: P90, hard: HARD }, anchor: "top-center", zIndex: 50 },
      { slotId: "G5-D3", mediaIndex: 2, role: "upper-right", witness: { center: { x: 1387.3, y: 381 }, outerSize: { width: 379.5, height: 375 }, outerArea: 142313, rotationDeg: 10.5 }, territory: t(65, 65), scaleBounds: { preferred: P90, hard: HARD }, anchor: "right-top", zIndex: 60 },
      { slotId: "G5-D4", mediaIndex: 3, role: "lower-center-back", witness: { center: { x: 781.1, y: 696 }, outerSize: { width: 457.5, height: 330 }, outerArea: 150975, rotationDeg: 6.7 }, territory: t(80, 65), scaleBounds: { preferred: P90, hard: HARD }, anchor: "bottom-center", zIndex: 40 },
      { slotId: "G5-D5", mediaIndex: 4, role: "lower-right-front", witness: { center: { x: 1287.5, y: 681 }, outerSize: { width: 349.6, height: 338 }, outerArea: 118165, rotationDeg: -7.5 }, territory: t(65, 65), scaleBounds: { preferred: P90, hard: HARD }, anchor: "right-bottom", zIndex: 70, bottomBandHeightPx: 72 },
    ],
    relations: [
      { type: "overlap", front: "G5-D2", back: "G5-D4", strength: "soft", target: "preserve-upper-over-lower-depth" },
      { type: "overlap", front: "G5-D3", back: "G5-D4", strength: "soft", target: "preserve-upper-right-over-lower-depth" },
      { type: "overlap", front: "G5-D5", back: "G5-D4", strength: "soft", target: "preserve-lower-right-front-depth" },
      { type: "near", members: ["G5-D2", "G5-D3", "G5-D4", "G5-D5"], strength: "soft", target: "dense-but-readable-right-cluster" },
    ],
    primitivesUsed: ["slot-territory", "role", "overlap-soft", "near-soft", "z-order", "title-protection", "72px-caption-band-D5"],
  },
};

/** `common-contract.json` — the parts the runtime reads. */
export const A13_V2_CONTRACT = {
  contract: "A13_GALLERY_RUNTIME_SIMPLIFICATION_CONTRACT_V2",
  engine: "DynamicPolaroid-V2.1",
  canvas: { width: 1670, height: 941 },
  themeGeometry: { sharedLightDark: true, geometryDivergenceLightDark: "NONE" },
  media: { familyOrderStrict: true, sortByRatio: false, distortion: false, destructiveCrop: false, adaptiveMediaRatio: [0.67, 1.78] },
  caption: {
    maxChars: 32,
    maxLines: 2,
    autoShrink: false,
    /** Soft: ink occlusion above this is reported, never rejected. */
    preferredMaximumInkOcclusion: 0.15,
    /** Hard: min(0.60, Master caption visible ink fraction). */
    hardMinimumVisibleInkFractionCap: 0.6,
  },
  accessibility: { minimumConnectedHitTargetCssPx: [44, 44] as const, wholePolaroidInteractive: true, keyboardActivation: true },
  occlusion: {
    /** Hard: min(0.35, Master visible photo fraction). */
    hardMinimumVisiblePhotoFractionCap: 0.35,
    /** Hard: min(0.30, Master visible outer fraction). */
    hardMinimumVisibleOuterFractionCap: 0.3,
  },
  /** V2 title margin (union box + 12 × 8) — SUPERSEDED by V2.1 `A13_V2_1_TITLE`. */
  titleMarginPx: { x: 12, y: 8 },
  /** No manifest declares an overflow: every tirage stays in the canvas. */
  canvasOverflowsDeclared: [] as string[],
  solverPriority: [
    "photo-integrity-and-structural-protection",
    "item-accessibility",
    "territory-and-role-validity",
    "global-master-proximity",
    "declared-soft-artistic-relations",
    "generous-group-presence",
    "visibility-above-master-safe-minima",
    "minimum-displacement",
  ],
} as const;

/** `fixture-matrix.json` — 6 assignments × 4 captions × 4 states = 96. */
export const A13_V2_FIXTURES = {
  ratios: { landscape: 4 / 3, square: 1, portrait: 0.75, "narrow-portrait": 0.5625, "wide-landscape": 16 / 9, "bounded-panorama": 2.39 },
  assignments: [
    { id: "master-like", cycle: null },
    { id: "uniform-landscape", cycle: ["landscape"] },
    { id: "uniform-portrait", cycle: ["portrait"] },
    { id: "mixed-natural", cycle: ["portrait", "landscape", "square", "narrow-portrait", "wide-landscape"] },
    { id: "mixed-reverse", cycle: ["wide-landscape", "narrow-portrait", "square", "landscape", "portrait"] },
    { id: "extremes", cycle: ["bounded-panorama", "narrow-portrait", "wide-landscape", "portrait", "square"] },
  ],
  captions: ["none", "short-one-line", "target-24", "maximum-32"],
  states: ["G2", "G3", "G4", "G5"],
  stopCodes: ["MANIFEST_REJECTS_OWN_MASTER_STOP", "GALLERY_ITEM_INACCESSIBLE_STOP", "TITLE_COLLISION_STOP", "NO_CANDIDATE_WITHIN_TERRITORIES_STOP"],
} as const;

export type V2AssignmentId = (typeof A13_V2_FIXTURES.assignments)[number]["id"];
export type V2CaptionState = (typeof A13_V2_FIXTURES.captions)[number];
export type V2RatioId = keyof typeof A13_V2_FIXTURES.ratios;

/** `baselines/master-baselines.json` — Master authorities (not duplicated). */
export const A13_V2_MASTER_BASELINES: Record<V2StateId, { authorityFile: string; sourceSha256: string }> = {
  G2: { authorityFile: "05-Image ChatGPT 25 sept. 2026, 09_07_50.png", sourceSha256: "c67bf547d353da12bcf1a238aa94f2e59be4c7b062586f84c5e32d129128aac8" },
  G3: { authorityFile: "09-Image ChatGPT 25 sept. 2026, 09_17_21.png", sourceSha256: "37041c5c5a202eda99c50b35b24858118094954068bb0b2a39537a06a4e7b0cd" },
  G4: { authorityFile: "03-Image ChatGPT 25 sept. 2026, 09_50_24.png", sourceSha256: "bad37158bc3bbeb12099f9f04dac89fb0e5888bf1a4ca09672f8ef9cc755e1a5" },
  G5: { authorityFile: "02-Image ChatGPT 25 sept. 2026, 10_03_49.png", sourceSha256: "2233575ba08bb8b796155b6daaaa430c958ce6ee8e44ae38d932166331f93e32" },
};

/**
 * TITLE AUTHORITY (V2.1 + QG arbitration "TITLE AUTHORITY FINAL"):
 * collision geometry = the REAL RENDERED GLYPH MASK — the union of the
 * glyph contours of the heading and of the microcopy, rasterised with the
 * loaded runtime font at canvas scale 1, each line separately, dilated
 * isotropically by 3 px. The font must be loaded (checked at runtime).
 *
 * The V2.1 theoretical ink references below are RETIRED as a collision
 * authority and as a gate (the real microcopy renders x 687→983, the
 * reference said 689→939): they are kept for information only and the
 * runtime reports its deviation from them, nothing more.
 */
export const A13_V2_1_TITLE = {
  centerX: 835,
  /** Information only (retired as authority). */
  headingInkReference: { xMin: 657, xMax: 1012, yMin: 114, yMax: 142 },
  /** Information only (retired as authority). */
  microcopyInkReference: { xMin: 689, xMax: 939, yMin: 161, yMax: 181 },
  dilationPx: 3,
} as const;

/** V2.1 Master proximity: lexicographic soft ranking after hard rules. */
export const A13_V2_1_RANKING = [
  "declared-essential-relation-loss",
  "individual-witness-transform-loss",
  "other-declared-soft-relation-loss",
  "additional-visibility",
  "minimum-displacement",
] as const;
