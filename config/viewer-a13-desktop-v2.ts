/**
 * A13 — VIEWER DESKTOP V2 — runtime contract (GREEN QG).
 *
 * Transcription of `contract/viewer-desktop-v2.v1.json`
 * (`A13_VIEWER_DESKTOP_V2_RUNTIME_HANDOFF_V1`, SHA-256 fff7277e…a7d2) and of
 * the material package `A13_VIEWER_DESKTOP_V2_RUNTIME_MATERIAL_ASSETS_V1`
 * (GREEN QG — `VIEWER_MATERIAL_SOURCE_STOP` lifted). Artistic authority:
 * `A13_VIEWER_DESKTOP_V2_PROPOSITION_STUDIO.zip` (SHA-256 e299b477…0522).
 *
 * GALERIE = COMPOSER. ALBUM = PARCOURIR. VIEWER = CONTEMPLER.
 *
 * ONE Viewer shared by the Gallery and the Album. The geometry
 * (`viewer-layout.ts`) never reads `theme`: only `A13_VIEWER_MATERIAL`
 * diverges between Light and Dark (GEOMETRY DIVERGENCE LIGHT/DARK: NONE).
 */

export const A13_VIEWER_THEMES = ["light", "dark"] as const;
export type ViewerTheme = (typeof A13_VIEWER_THEMES)[number];

/**
 * Geometry, typography, close, motion, accessibility — theme-free.
 * Accessible names are i18n keys (dette D5: FR / EN / ES under
 * `lib/i18n`), never a literal of one language here.
 */
export const A13_VIEWER_CONTRACT = {
  contractId: "A13_VIEWER_DESKTOP_V2_RUNTIME_HANDOFF_V1",
  referenceCanvas: { width: 1670, height: 941 },
  scale: { min: 0.72, max: 1, captionFontMinPx: 20 },
  safeArea: { xMin: 32, xPerS: 48, yMin: 24, yPerS: 40, closeReservedPx: 64, closeExtraClearancePx: 16 },
  photo: { maxW: 1112, maxH: 622, guaranteedRatioRange: [0.5, 4.0] as const, objectFit: "contain" as const },
  paper: { edgePerS: 40, edgeMin: 14, edgeMax: 42, topEdgeFactor: 0.75, bandNoneExtraPerS: 14, bandTextExtraPerS: 20, radiusPxMax: 1 },
  caption: { maxCharacters: 32, maxLines: 2, fontSizePerS: 27, fontSizeMin: 20, fontSizeMax: 27, lineHeight: 1.05, usableInsetPerS: 16, usableInsetMin: 12 },
  close: { glyph: "×", visualSizePx: 26, fontWeight: 300, targetMinPx: 48, offsetPerS: 28, offsetMin: 16, focusWidthPx: 2, focusOffsetPx: 4, labelKey: "viewer.close" },
  motion: {
    open: { durationMs: 240, easing: "cubic-bezier(.22,1,.36,1)", from: { opacity: 0, translateYPerS: 12, scale: 0.985 }, to: { opacity: 1, translateY: 0, scale: 1 } },
    close: { durationMs: 160, easing: "cubic-bezier(.4,0,1,1)", to: { opacity: 0, translateYPerS: 6, scale: 0.99 } },
    reduced: { durationMs: 0, spatialTransform: false },
  },
  accessibility: { modalDialog: true, initialFocus: "close", focusTrap: true, escape: true, restoreTriggerFocus: true, restoreScroll: true, backgroundInert: true, dialogLabelKey: "viewer.dialogLabel" },
  /**
   * Readings stated for QG (the contract leaves them implicit):
   * - the 64×64 reserved close zone is centred on the 48×48 target (8 px
   *   around it); the paper may not meet it dilated by 16 px;
   * - the caption block starts `20s` under the photo — the band reads
   *   photo | 20s | lines | edge (`edge + n·lineHeight + 20s`), which puts
   *   the Master caption ink at y≈774–815 (measured on both Masters);
   * - "taille intrinsèque utile" = the source's natural width in CSS px.
   */
  readings: {
    closeZone: "64×64 centred on the 48×48 close target",
    captionTop: "photoBottom + 20s",
    intrinsicUsefulWidth: "naturalWidth (1 source px = 1 CSS px)",
  },
} as const;

/** Stop / review codes of the Handoff (§12) plus the §3.5 review signal. */
export const A13_VIEWER_STOPS = [
  "VIEWER_CROP_STOP",
  "VIEWER_DISTORTION_STOP",
  "VIEWER_VIEWPORT_FIT_STOP",
  "VIEWER_CAPTION_OVERFLOW_STOP",
  "VIEWER_CLOSE_INACCESSIBLE_STOP",
  "VIEWER_SCROLL_RESTORE_STOP",
  "VIEWER_FOCUS_RESTORE_STOP",
  "VIEWER_REDUCED_MOTION_STOP",
  "THEME_GEOMETRY_PARITY_STOP",
  "VIEWER_DARK_PHOTO_PROCESSING_STOP",
  "VIEWER_MATERIAL_SOURCE_STOP",
] as const;
export type ViewerStop = (typeof A13_VIEWER_STOPS)[number];
export const VIEWER_EXTREME_RATIO_REVIEW = "VIEWER_EXTREME_RATIO_REVIEW" as const;

const ASSET_DIR = "/assets/viewer/a13-desktop-v2";

/** Studio material assets — byte-identical copies (SHA-256 of the package). */
export const A13_VIEWER_ASSETS = {
  environment: {
    light: { src: `${ASSET_DIR}/a13-viewer-environment-light-tile-v1.png`, packageAsset: "A13_VIEWER_ENVIRONMENT_LIGHT_TILE_V1.png", size: 1024, sha256: "4ef7c853cc201f0104e54177d91e9e9c2261feaf418bbe5a23895dbaed4db4db", targetToken: "#F2EADF" },
    dark: { src: `${ASSET_DIR}/a13-viewer-environment-dark-tile-v1.png`, packageAsset: "A13_VIEWER_ENVIRONMENT_DARK_TILE_V1.png", size: 1024, sha256: "38a0e9267223465d05249404015e46cdd1d7e58d02048526c46628e45a5bc7b0", targetToken: "#24150E" },
  },
  paper: {
    light: { src: `${ASSET_DIR}/a13-viewer-print-paper-light-tile-v1.png`, packageAsset: "A13_VIEWER_PRINT_PAPER_LIGHT_TILE_V1.png", size: 1024, sha256: "98ea98d6921fd1ead4ad82898b0106fda9ab97a46dacb03f89c84e8630a47d69" },
    dark: { src: `${ASSET_DIR}/a13-viewer-print-paper-dark-tile-v1.png`, packageAsset: "A13_VIEWER_PRINT_PAPER_DARK_TILE_V1.png", size: 1024, sha256: "d52bf978b5b4f577ec0d3732b47fa4506dbe700aa4bc0b73da34147b7116ef89" },
  },
  /**
   * 9-slice RGBA edge mask V2 (`A13_VIEWER_DESKTOP_V2_RUNTIME_MASK_PATCH_V2`,
   * SHA-256 620a2e6e…1bbd — GREEN QG; replaces the V1 mask only): common to
   * both themes, corners fixed, periodic edge bands (alpha delta 0 on the
   * four sides) repeated with `round`, centre opaque, never stretched as a
   * whole. One mask px renders as `s` CSS px (canonical 1670 px). The
   * measured median contour (first α ≥ 128 from the border: 14.47 / 13.53 /
   * 14.51 / 13.55 px, top / bottom / left / right — 14.0 on average, as V1)
   * is aligned on the paper geometry box: the mask is laid `14s` outside
   * it, so the fringe straddles the geometric edge and the paper envelope
   * keeps the Master measurements.
   */
  edgeMask: { src: `${ASSET_DIR}/a13-viewer-irregular-edge-mask-9slice-v2.png`, packageAsset: "A13_VIEWER_IRREGULAR_EDGE_MASK_9SLICE_V2.png", size: 512, slice: 96, medianContour: 14, sha256: "7c0d9d6300e310f2cb010d75048cf79630052a82ceb2f88a82d458faa782c4db" },
  /** Both paper tiles are 1024 × 1024, rendered at `1024s` from the paper origin. */
  paperTileSize: 1024,
  recolor: false,
} as const;

/** Colours and shadows only — never read by the layout. */
export const A13_VIEWER_MATERIAL = {
  light: {
    environment: "#F2EADF",
    paperBase: "#EFE3CF",
    paperHighlight: "#F7EEDF",
    paperLowlight: "#D7C3A4",
    captionInk: "#5A4030",
    closeInk: "#61452F",
    shadowContact: "0 2px 3px rgba(64,43,27,.20)",
    shadowMain: "0 18px 34px rgba(64,43,27,.18)",
  },
  dark: {
    environment: "#24150E",
    paperBase: "#E7D3B2",
    paperHighlight: "#F1E2C8",
    paperLowlight: "#C9AE86",
    captionInk: "#4A3527",
    closeInk: "#E2BE87",
    shadowContact: "0 2px 3px rgba(6,4,3,.44)",
    shadowMain: "0 18px 36px rgba(6,4,3,.42)",
  },
  photo: { filter: "none", opacity: 1, mixBlendMode: "normal", backdropFilter: "none" },
} as const satisfies Record<ViewerTheme, Record<string, string>> & { photo: Record<string, string | number> };
