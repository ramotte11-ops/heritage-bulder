/**
 * A13 — Desktop DARK — runtime MATERIAL tokens V1.1 (GREEN QG).
 *
 * Transcribed verbatim from `dark-material-tokens.v1.1.json` (package
 * `A13_DESKTOP_DARK_RUNTIME_MATERIAL_HANDOFF_V1_1`, SHA-256
 * 3afbb642…fbb0). Runtime authority: Light commit
 * c2700aeb4966545272429cae77f5a72dee570c0d.
 *
 * SAME ENGINE. SAME GEOMETRY. SAME SOLVER. SAME MEDIA DECISIONS.
 * DARK MATERIALS ONLY.
 *
 * This file is MATERIAL ONLY: colours, grain, visual shadows, inks, focus.
 * It is read by the rendering components (`A13PilotScene`,
 * `DynamicPolaroid`) AFTER the Light V2.1 engine has produced its final
 * geometry — never by the solver, the manifests, the layout, the caption
 * arbitration or the title glyph authority (`DARK_TOKEN_READ_BY_SOLVER_STOP`,
 * enforced by `theme-parity.test.ts` on the import graph). No field here is
 * a length that the layout reads; every `INHERIT_LIGHT_RUNTIME_V2_1` is kept
 * as the package spells it.
 */

export const A13_THEMES = ["light", "dark"] as const;
export type A13Theme = (typeof A13_THEMES)[number];

/** Runtime Dark background — byte-identical copy of the package asset
 * `assets/A13_DESKTOP_DARK_BACKGROUND_PHOTO_FREE_COMMON_V1.png`. Single
 * common background for G2, G3, G4, G5, G6 and G6 Signature 7+; exact
 * thematic replacement of the Light background in the same canvas, with
 * the same responsive transform. No recolour, filter, crop or variant. */
export const A13_DARK_BACKGROUND = {
  src: "/assets/gallery/a13-pilot/a13-desktop-dark-background-photo-free-common-v1.png",
  packageAsset: "assets/A13_DESKTOP_DARK_BACKGROUND_PHOTO_FREE_COMMON_V1.png",
  width: 1670,
  height: 941,
  sha256: "0c28b568f9690bad4a6f8f20dfbcd129aecd25b54cb2ee51a5c3199a599ff643",
  usage: "single-common-background-for-G2-G3-G4-G5-G6-G6_SIGNATURE_7PLUS",
  fit: "exact-canvas",
  recolor: false,
  filter: "none",
} as const;

export const A13_DARK_MATERIAL = {
  schemaVersion: "1.1",
  scope: "A13_DESKTOP_DARK_MATERIAL_ONLY",
  affectsGeometry: false,
  geometryDivergenceLightDark: "NONE",
  polaroid: {
    geometry: "INHERIT_LIGHT_RUNTIME_V2_1",
    paper: {
      base: "#E7D3B2",
      highlight: "#F1E2C8",
      lowlight: "#C9AE86",
      fiberColor: "rgba(88,62,39,0.16)",
      grainOpacityMax: 0.09,
      grainContrastMax: 0.05,
      variationSeed: "slotId",
      variationLightnessPercent: 2.5,
      variationHueDeg: 0,
      mustNotChangeAlphaHull: true,
    },
    edge: {
      color: "rgba(91,64,42,0.34)",
      innerStrokeColor: "rgba(93,65,42,0.30)",
      innerStrokeWidth: "INHERIT_LIGHT_RUNTIME_V2_1",
    },
    bottomBand: {
      geometry: "INHERIT_LIGHT_RUNTIME_V2_1",
      material: "paper",
      maximumBottomDarkeningPercent: 2,
    },
    shadow: {
      contact: "0 2px 3px rgba(6,4,3,0.44)",
      main: "0 13px 27px rgba(6,4,3,0.36)",
      ambient: "0 24px 42px rgba(6,4,3,0.16)",
      includedInGeometry: false,
      includedInCollision: false,
      includedInOcclusion: false,
    },
  },
  caption: {
    geometry: "INHERIT_LIGHT_RUNTIME_V2_1",
    arbitration: "INHERIT_LIGHT_RUNTIME_V2_1",
    ink: "#4A3527",
    inkMuted: "#654B38",
    textShadow: "none",
    opacity: 1,
    minimumContrast: 4.5,
    targetContrast: 7,
  },
  photo: {
    mediaAndDecision: "BYTE_IDENTICAL_TO_LIGHT",
    filter: "none",
    opacity: 1,
    mixBlendMode: "normal",
    backdropFilter: "none",
    colorAdjustment: "none",
    themeProcessing: false,
  },
  runtimeText: {
    geometry: "INHERIT_LIGHT_RUNTIME_V2_1",
    titleGlyphAuthority: "INHERIT_LIGHT_TITLE_AUTHORITY_V2_1",
    titleInk: "#D8C39B",
    titleInkMuted: "#C7AD7F",
    microcopyInk: "#B99B6C",
    titleTextShadow: "0 1px 1px rgba(0,0,0,0.22)",
    textShadowIncludedInGlyphGeometry: false,
    minimumContrast: 4.5,
  },
  cta7Plus: {
    geometry: "INHERIT_LIGHT_RUNTIME_V2_1",
    rest: { border: "rgba(198,158,94,0.72)", text: "#D7BD8E", background: "transparent" },
    hover: { border: "rgba(215,178,116,0.90)", text: "#E5CDA2", background: "rgba(190,145,78,0.08)" },
    active: { border: "rgba(220,181,117,0.96)", text: "#E8D2AA", background: "rgba(190,145,78,0.13)" },
    disabled: { border: "rgba(183,151,102,0.34)", text: "rgba(215,189,142,0.46)", background: "transparent" },
    layoutShiftAllowed: false,
  },
  focus: {
    geometry: "INHERIT_LIGHT_RUNTIME_V2_1",
    color: "#F1D6A3",
    widthPx: 2,
    offsetPx: 4,
    style: "solid",
    minimumContrast: 3,
    layoutShiftAllowed: false,
  },
  materialOnlyGuard: {
    forbiddenProperties: [
      "width", "height", "min-width", "max-width", "min-height", "max-height",
      "padding", "margin", "gap", "inset", "top", "right", "bottom", "left",
      "transform", "translate", "rotate", "scale", "transform-origin",
      "font-size", "line-height", "font-weight", "letter-spacing",
      "border-width", "outline-offset-as-layout", "z-index", "overflow",
      "object-fit", "object-position", "aspect-ratio",
    ],
    tokensReadableBySolver: false,
    failure: "THEME_GEOMETRY_PARITY_STOP",
  },
  foreground: "DEFERRED_POST_PILOT",
} as const;

/** `parity-and-qa.v1.1.json` — the pilot gate contract. */
export const A13_DARK_PARITY_CONTRACT = {
  fixtureInputsMustMatch: ["state", "mediaIds", "mediaOrder", "intrinsicRatios", "focalPoints", "captions", "locale", "viewport"],
  snapshotFields: [
    "selectedState", "slotIds", "mediaIndexBySlot", "centerX", "centerY",
    "outerWidth", "outerHeight", "photoWindowX", "photoWindowY",
    "photoWindowWidth", "photoWindowHeight", "scale", "rotationDeg",
    "zIndex", "captionGlyphBounds", "titleGlyphBounds", "occlusionDecisions",
    "containOrCropDecision", "solverCandidateId", "solverStopCode",
  ],
  comparison: "deep-strict-equality-after-removing-theme-and-material-fields",
  required: "BYTE_IDENTICAL_GEOMETRY_SNAPSHOT",
  failure: "THEME_GEOMETRY_PARITY_STOP",
  minimalPilotMatrix: {
    states: ["G2", "G3", "G4", "G5", "G6", "G6_SIGNATURE_7PLUS"],
    ratioSets: ["master-like", "mixed-natural", "extremes"],
    captions: ["none", "32-chars-two-lines"],
    themes: ["light", "dark"],
    geometryPairs: 36,
    visualBoardsRequired: [
      "G2-dark-master-like",
      "G3-dark-mixed-natural",
      "G4-dark-extremes",
      "G5-dark-mixed-natural",
      "G6-dark-master-like",
      "G6-signature-7plus-dark-master-like",
    ],
  },
  stopConditions: [
    "THEME_GEOMETRY_PARITY_STOP",
    "DARK_TOKEN_READ_BY_SOLVER_STOP",
    "DARK_PHOTO_PROCESSING_STOP",
    "DARK_BACKGROUND_HASH_MISMATCH_STOP",
    "DARK_BACKGROUND_DIMENSION_MISMATCH_STOP",
    "DARK_CONTRAST_STOP",
    "DARK_LAYOUT_SHIFT_STOP",
    "G6_7PLUS_GEOMETRY_REGRESSION_STOP",
  ],
  gateResultIfAllPass: "GREEN_DARK_PILOT",
} as const;
