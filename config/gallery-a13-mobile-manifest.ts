/**
 * A13 — Gallery — MOBILE LIGHT — runtime authority (Handoff V1.4).
 *
 * Transcribed verbatim from package `A13_MOBILE_GALLERY_LIGHT_FINAL_HANDOFF_V1_4`
 * (`contract/mobile-gallery.json`, `contract/ANCHOR_AND_CANVAS_SEMANTICS.md`,
 * `geometry/g2…g6.json`, `geometry/g7plus.json`). V1.4 = V1.3 + the Studio's
 * final arbitration of G6-D5 (centre 642,1212 · 350 × 300 · 17° · D5 in
 * front of D6); Signature 7+ inherits `g6.json` exactly.
 *
 * Mobile ONLY: the 941 × 1672 stage, the state manifests, the centre
 * territories, the title glyph boxes, the CTA box, the Mobile paper tokens
 * and the common Mobile background. Everything else is the SHARED A13
 * engine (state selection, DynamicPolaroid, ratio policy, caption logic,
 * interaction, i18n, STOP policy). No Desktop value is read or changed
 * here, and nothing here is a free aesthetic choice.
 *
 * Units: source pixels of the 941 × 1672 reference frame (origin top-left),
 * unless a name says `Css`. At a stage width W, one source pixel is
 * `W / 941` CSS px (`--k`). Text metrics are CSS `clamp()` tokens and are
 * never raster-scaled (contract `responsive`).
 */

export const A13_MOBILE_HANDOFF_ID = "A13_MOBILE_GALLERY_LIGHT_FINAL_HANDOFF_V1_4" as const;

export const A13_MOBILE_CANVAS = { width: 941, height: 1672 } as const;

/** The Mobile profile is selected ONLY for these viewport widths (no internal breakpoint). */
export const A13_MOBILE_VIEWPORT_RANGE = { min: 375, max: 430 } as const;

export function a13MobileProfileActive(viewportWidth: number): boolean {
  return viewportWidth >= A13_MOBILE_VIEWPORT_RANGE.min && viewportWidth <= A13_MOBILE_VIEWPORT_RANGE.max;
}

/**
 * The ONE runtime artistic asset: the common photo-free background, the same
 * for the six states, byte-identical to the package's
 * `assets/A13_MOBILE_LIGHT_GALLERY_BACKGROUND_COMMON.png`
 * (`AUTHORITIES.json`). `width:100%; height:auto; no crop`.
 */
export const A13_MOBILE_BACKGROUND = {
  src: "/assets/gallery/a13-mobile/a13-mobile-light-gallery-background-common.png",
  width: 941,
  height: 1672,
  sha256: "825439dd5bb6793caf6dbe3cc37a8221a72d43ece32364476fa0dc705fa83b2d",
} as const;

/** Contract `layers`: background 0, prints = their paint order, title 900, CTA 950. */
export const A13_MOBILE_LAYER_Z = { background: 0, runtimeTitle: 900, cta: 950 } as const;

export type A13MobileStateId = "G2" | "G3" | "G4" | "G5" | "G6" | "G7PLUS";
export const A13_MOBILE_STATES: readonly A13MobileStateId[] = ["G2", "G3", "G4", "G5", "G6", "G7PLUS"];

export interface A13MobileRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface A13MobileSlot {
  slotId: string;
  mediaIndex: number;
  /** Centre of the complete outer paper of the witness print. */
  referenceCenter: { x: number; y: number };
  /** Outer paper of the witness print (visual weight). */
  outerReference: { width: number; height: number };
  rotationDeg: number;
  /**
   * Allowed region of the CENTRE of the complete outer paper (before
   * rotation) — never a box the paper, its rotated bounds or its photo
   * window must fit in (`ANCHOR_AND_CANVAS_SEMANTICS.md`).
   */
  centerTerritory: A13MobileRect;
  /** Linear scale of the whole print (witness = 1). */
  scaleRange: readonly [number, number];
  /**
   * Normalised pivot [u, v] of the unrotated outer paper ([0,0] top-left,
   * [1,1] bottom-right) kept fixed when the media ratio / scale reshapes the
   * print, before any bounded centre translation.
   */
  anchorPivot: readonly [number, number];
  /** Stacking: a higher paint order is painted in front. */
  paintOrder: number;
  /** Per-side tolerance of the outer paper beyond the canvas (canvasInset = 0). */
  paperOverflowAllowance: { left: number; right: number; top: number; bottom: number };
}

export interface A13MobileMeasurementTolerance {
  centerPx: number;
  sizePx: number;
  rotationDeg: number;
}

type SlotInput = {
  slotId: string;
  mediaIndex: number;
  referenceCenter: [number, number];
  outerReference: [number, number];
  rotationDeg: number;
  centerTerritory: [number, number, number, number];
  scaleRange: [number, number];
  anchorPivot: [number, number];
  paintOrder: number;
  paperOverflowAllowance?: Partial<A13MobileSlot["paperOverflowAllowance"]>;
};

const slot = (s: SlotInput): A13MobileSlot => ({
  slotId: s.slotId,
  mediaIndex: s.mediaIndex,
  referenceCenter: { x: s.referenceCenter[0], y: s.referenceCenter[1] },
  outerReference: { width: s.outerReference[0], height: s.outerReference[1] },
  rotationDeg: s.rotationDeg,
  centerTerritory: { x: s.centerTerritory[0], y: s.centerTerritory[1], width: s.centerTerritory[2], height: s.centerTerritory[3] },
  scaleRange: s.scaleRange,
  anchorPivot: s.anchorPivot,
  paintOrder: s.paintOrder,
  paperOverflowAllowance: { left: 0, right: 0, top: 0, bottom: 0, ...s.paperOverflowAllowance },
});

/** `geometry/g6.json` — also the geometry of Signature 7+ (`g7plus.json`: "geometry/g6.json exactly"). */
const G6_SLOTS: readonly A13MobileSlot[] = [
  slot({ slotId: "G6-D1", mediaIndex: 0, referenceCenter: [322, 542], outerReference: [444, 570], rotationDeg: -7.0, centerTerritory: [287, 507, 70, 70], scaleRange: [0.82, 1.08], anchorPivot: [0, 0], paintOrder: 10 }),
  slot({ slotId: "G6-D2", mediaIndex: 1, referenceCenter: [736, 444], outerReference: [313, 348], rotationDeg: 7.8, centerTerritory: [711, 419, 50, 50], scaleRange: [0.84, 1.08], anchorPivot: [1, 0], paintOrder: 20 }),
  slot({ slotId: "G6-D3", mediaIndex: 2, referenceCenter: [717, 789], outerReference: [367, 288], rotationDeg: 9.6, centerTerritory: [687, 764, 60, 50], scaleRange: [0.84, 1.08], anchorPivot: [1, 0.5], paintOrder: 30 }),
  slot({ slotId: "G6-D4", mediaIndex: 3, referenceCenter: [299, 1011], outerReference: [396, 368], rotationDeg: -5.2, centerTerritory: [269, 981, 60, 60], scaleRange: [0.84, 1.08], anchorPivot: [0, 0.5], paintOrder: 40 }),
  // Studio arbitration V1.4 — authority for this slot.
  slot({ slotId: "G6-D5", mediaIndex: 4, referenceCenter: [642, 1212], outerReference: [350, 300], rotationDeg: 17.0, centerTerritory: [612, 1187, 60, 50], scaleRange: [0.84, 1.08], anchorPivot: [1, 0.5], paintOrder: 60 }),
  slot({ slotId: "G6-D6", mediaIndex: 5, referenceCenter: [303, 1352], outerReference: [422, 295], rotationDeg: 2.9, centerTerritory: [273, 1327, 60, 50], scaleRange: [0.84, 1.08], anchorPivot: [0, 1], paintOrder: 50 }),
];

export const A13_MOBILE_STATE_SLOTS: Record<A13MobileStateId, readonly A13MobileSlot[]> = {
  G2: [
    slot({ slotId: "G2-D1", mediaIndex: 0, referenceCenter: [452, 628], outerReference: [774, 585], rotationDeg: -7.1, centerTerritory: [412, 583, 80, 90], scaleRange: [0.82, 1.08], anchorPivot: [0, 0], paintOrder: 10 }),
    slot({ slotId: "G2-D2", mediaIndex: 1, referenceCenter: [562, 1188], outerReference: [555, 445], rotationDeg: 8.7, centerTerritory: [527, 1148, 70, 80], scaleRange: [0.84, 1.1], anchorPivot: [1, 1], paintOrder: 20 }),
  ],
  G3: [
    slot({ slotId: "G3-D1", mediaIndex: 0, referenceCenter: [439, 516], outerReference: [686, 499], rotationDeg: -7.8, centerTerritory: [404, 481, 70, 70], scaleRange: [0.82, 1.08], anchorPivot: [0, 0], paintOrder: 10 }),
    slot({ slotId: "G3-D2", mediaIndex: 1, referenceCenter: [664, 894], outerReference: [441, 408], rotationDeg: 11.3, centerTerritory: [634, 854, 60, 80], scaleRange: [0.84, 1.08], anchorPivot: [1, 0], paintOrder: 20 }),
    slot({ slotId: "G3-D3", mediaIndex: 2, referenceCenter: [365, 1300], outerReference: [539, 446], rotationDeg: 7.0, centerTerritory: [325, 1255, 80, 90], scaleRange: [0.82, 1.08], anchorPivot: [0, 1], paintOrder: 30 }),
  ],
  G4: [
    slot({ slotId: "G4-D1", mediaIndex: 0, referenceCenter: [325, 557], outerReference: [477, 545], rotationDeg: -7.5, centerTerritory: [290, 517, 70, 80], scaleRange: [0.82, 1.08], anchorPivot: [0, 0], paintOrder: 10 }),
    slot({ slotId: "G4-D2", mediaIndex: 1, referenceCenter: [749, 718], outerReference: [342, 430], rotationDeg: 7.4, centerTerritory: [724, 683, 50, 70], scaleRange: [0.84, 1.08], anchorPivot: [1, 0], paintOrder: 20, paperOverflowAllowance: { right: 8 } }),
    slot({ slotId: "G4-D3", mediaIndex: 2, referenceCenter: [291, 1102], outerReference: [452, 446], rotationDeg: -8.3, centerTerritory: [261, 1067, 60, 70], scaleRange: [0.84, 1.08], anchorPivot: [0, 0.5], paintOrder: 30 }),
    slot({ slotId: "G4-D4", mediaIndex: 3, referenceCenter: [708, 1245], outerReference: [430, 410], rotationDeg: 10.7, centerTerritory: [678, 1210, 60, 70], scaleRange: [0.84, 1.08], anchorPivot: [1, 1], paintOrder: 40, paperOverflowAllowance: { right: 20 } }),
  ],
  G5: [
    slot({ slotId: "G5-D1", mediaIndex: 0, referenceCenter: [300, 464], outerReference: [494, 518], rotationDeg: -5.8, centerTerritory: [265, 429, 70, 70], scaleRange: [0.82, 1.08], anchorPivot: [0, 0], paintOrder: 10 }),
    slot({ slotId: "G5-D2", mediaIndex: 1, referenceCenter: [758, 506], outerReference: [326, 389], rotationDeg: 7.2, centerTerritory: [733, 476, 50, 60], scaleRange: [0.84, 1.08], anchorPivot: [1, 0], paintOrder: 20, paperOverflowAllowance: { right: 8 } }),
    slot({ slotId: "G5-D3", mediaIndex: 2, referenceCenter: [287, 921], outerReference: [409, 400], rotationDeg: -6.5, centerTerritory: [257, 891, 60, 60], scaleRange: [0.84, 1.08], anchorPivot: [0, 0.5], paintOrder: 30 }),
    slot({ slotId: "G5-D4", mediaIndex: 3, referenceCenter: [716, 964], outerReference: [396, 379], rotationDeg: 7.6, centerTerritory: [686, 934, 60, 60], scaleRange: [0.84, 1.08], anchorPivot: [1, 0.5], paintOrder: 40, paperOverflowAllowance: { right: 8 } }),
    slot({ slotId: "G5-D5", mediaIndex: 4, referenceCenter: [473, 1321], outerReference: [408, 431], rotationDeg: -3.3, centerTerritory: [438, 1286, 70, 70], scaleRange: [0.84, 1.08], anchorPivot: [0.5, 1], paintOrder: 50 }),
  ],
  G6: G6_SLOTS,
  G7PLUS: G6_SLOTS,
};

/**
 * Manifest `relations` (information and QA; the stacking itself is
 * `paintOrder`). `dominant` is the slot whose role the solver keeps as the
 * largest print: G3 declares it (`dominant: G3-D1`); G2's is its own
 * `masterRelation` text, "D1 dominant; D2 lower/front".
 */
export const A13_MOBILE_RELATIONS: Record<A13MobileStateId, readonly { type: string; behind?: string | readonly string[]; front?: string; dominant?: string }[]> = {
  G2: [{ type: "stack", behind: "G2-D1", front: "G2-D2", dominant: "G2-D1" }],
  G3: [{ type: "dominant-plus-stack", dominant: "G3-D1" }],
  G4: [
    { type: "upper-pair", behind: "G4-D1", front: "G4-D2" },
    { type: "lower-pair", behind: "G4-D3", front: "G4-D4" },
  ],
  G5: [
    { type: "upper-pair", behind: "G5-D1", front: "G5-D2" },
    { type: "middle-pair", behind: "G5-D3", front: "G5-D4" },
    { type: "closing-center", behind: ["G5-D3", "G5-D4"], front: "G5-D5" },
  ],
  G6: [
    { type: "upper-stack", behind: "G6-D1", front: "G6-D2" },
    { type: "right-stack", behind: "G6-D2", front: "G6-D3" },
    { type: "middle-stack", behind: "G6-D4", front: "G6-D5" },
    { type: "closing-stack", behind: "G6-D6", front: "G6-D5" },
  ],
  G7PLUS: [
    { type: "upper-stack", behind: "G6-D1", front: "G6-D2" },
    { type: "right-stack", behind: "G6-D2", front: "G6-D3" },
    { type: "middle-stack", behind: "G6-D4", front: "G6-D5" },
    { type: "closing-stack", behind: "G6-D6", front: "G6-D5" },
  ],
};

export const A13_MOBILE_MEASUREMENT_TOLERANCE: Record<A13MobileStateId, A13MobileMeasurementTolerance> = {
  G2: { centerPx: 10, sizePx: 12, rotationDeg: 0.8 },
  G3: { centerPx: 10, sizePx: 12, rotationDeg: 0.8 },
  G4: { centerPx: 12, sizePx: 14, rotationDeg: 1.0 },
  G5: { centerPx: 12, sizePx: 14, rotationDeg: 1.0 },
  G6: { centerPx: 12, sizePx: 14, rotationDeg: 1.0 },
  G7PLUS: { centerPx: 12, sizePx: 14, rotationDeg: 1.0 },
};

/** A CSS `clamp(minPx, vw, maxPx)` token of the contract. */
export interface A13CssClampToken {
  minPx: number;
  vw: number;
  maxPx: number;
}

/**
 * Resolved CSS px of a clamp token at a Mobile stage width. The contract's
 * `vw` is the stage width: the Mobile stage is full-bleed (the renderer
 * uses `cqw` of the stage, identical to `vw` when stage = viewport).
 */
export function resolveCssClamp(t: A13CssClampToken, stageWidth: number): number {
  return Math.min(t.maxPx, Math.max(t.minPx, (t.vw * stageWidth) / 100));
}

/**
 * Title / subtitle. Collision authority = the RENDERED glyph masks + 8 CSS px
 * (converted per viewport: margin / (W / 941)); `layoutBox` is layout only,
 * never an exclusion zone. The two `…GlyphMaskMax` boxes are the Handoff's
 * nominal glyph extents (self-check), not a runtime gate.
 */
export const A13_MOBILE_TITLE = {
  layoutBox: { x: 160, y: 54, width: 621, height: 174 },
  titleGlyphMaskMax: { x: 210, y: 68, width: 521, height: 58 },
  subtitleGlyphMaskMax: { x: 250, y: 132, width: 441, height: 28 },
  collisionMarginCssPx: 8,
  fontSizeCss: { minPx: 30, vw: 8.1, maxPx: 35 },
  subtitleSizeCss: { minPx: 14, vw: 3.85, maxPx: 16 },
  lineHeight: 1.1,
} as const satisfies Record<string, unknown>;

/**
 * Mobile paper tokens. The caption band is FIXED per viewport whether the
 * caption is absent, one line or two lines; shadows are visual only and
 * excluded from every collision.
 */
export const A13_MOBILE_PAPER = {
  sideBorderCss: { minPx: 6, vw: 1.8, maxPx: 8 },
  topBorderCss: { minPx: 6, vw: 1.8, maxPx: 8 },
  captionBandCss: { minPx: 40, vw: 10.7, maxPx: 46 },
} as const satisfies Record<string, A13CssClampToken>;

export const A13_MOBILE_CAPTION = {
  maxCharacters: 32,
  maxLines: 2,
  fontSizeCss: { minPx: 14, vw: 3.85, maxPx: 16 },
  lineHeight: 1.05,
  autoShrink: false,
  partialOcclusionAllowed: true,
} as const;

/** `geometry/g7plus.json` — the Signature 7+ CTA (runtime DOM button, i18n text). */
export const A13_MOBILE_CTA = {
  box: { x: 247, y: 1553, width: 446, height: 77 },
  safeBox: { x: 220, y: 1530, width: 500, height: 124 },
  fontSizeCss: { minPx: 16, vw: 4.6, maxPx: 20 },
  minTargetCssPx: 44,
  zIndex: 950,
  measurementTolerance: { positionPx: 6, sizePx: 6 },
} as const;

export const A13_MOBILE_INTERACTION = {
  minTargetCssPx: 44,
  keyboard: ["Enter", "Space"],
} as const;

/** Contract `stops` — every code the Mobile runtime can return, never confused. */
export const A13_MOBILE_STOPS = [
  "CENTER_OUTSIDE_TERRITORY",
  "PAPER_OVERFLOW_EXCEEDED",
  "ITEM_INACCESSIBLE",
  "TITLE_GLYPH_COLLISION_UNRESOLVED",
  "CTA_COLLISION_UNRESOLVED",
  "HORIZONTAL_OVERFLOW",
  "MASTER_HANDOFF_CONTRADICTION_STOP",
  "DESKTOP_REGRESSION",
  "BACKGROUND_DIMENSION_OR_HASH_MISMATCH",
] as const;
export type A13MobileStop = (typeof A13_MOBILE_STOPS)[number];
