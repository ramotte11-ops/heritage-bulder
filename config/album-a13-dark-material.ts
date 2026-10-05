/**
 * A13 — ALBUM COMPLET DESKTOP DARK — runtime MATERIAL (V1, GREEN QG).
 *
 * Transcription of `contract/dark-material-tokens.v1.json` (package
 * `A13_ALBUM_COMPLET_DESKTOP_DARK_RUNTIME_MATERIAL_HANDOFF_V1`) and of the
 * Studio backgrounds of `A13_ALBUM_DESKTOP_DARK_RUNTIME_BACKGROUNDS_V1`
 * (GREEN QG — `ALBUM_DARK_BACKGROUND_AUTHORITY_STOP` lifted).
 *
 * SAME ENGINE. SAME GEOMETRY. SAME SOLVER. SAME MEDIA DECISIONS.
 * DARK MATERIALS ONLY. GEOMETRY DIVERGENCE LIGHT/DARK: NONE.
 *
 * MATERIAL ONLY: read by the rendering layer (`AlbumMemoryTable`) after the
 * Light V1.2 layout has fixed every geometry — never by the partition, the
 * local solver, the seams or the layout (guarded by the Album tests on the
 * import graph). No field is a length that the layout reads.
 *
 * The print tokens are identical, value for value, to the Gallery Dark V1.1
 * tokens already carried by `DynamicPolaroid` (theme "dark", CSS keyed on
 * `[data-a13-theme="dark"]`): the Album reuses that material unchanged.
 */

export const A13_ALBUM_THEMES = ["light", "dark"] as const;
export type AlbumTheme = (typeof A13_ALBUM_THEMES)[number];

/** Studio backgrounds — byte-identical copies (SHA-256 of the package). */
export const A13_ALBUM_DARK_BACKGROUNDS = {
  top: {
    src: "/assets/album/a13-dark/a13-album-desktop-dark-top-photo-free-v1.png",
    packageAsset: "A13_ALBUM_DESKTOP_DARK_TOP_PHOTO_FREE_V1.png",
    width: 1670,
    height: 941,
    sha256: "bc5eb591884eaa591658d1ed7bdb401f8daba93847f9974cc1b0fd7355b4b722",
    usage: "once, at the top of the Album canvas",
  },
  body: {
    src: "/assets/album/a13-dark/a13-album-desktop-dark-body-material-v1.png",
    packageAsset: "A13_ALBUM_DESKTOP_DARK_BODY_MATERIAL_V1.png",
    width: 1670,
    height: 941,
    sha256: "f58c94897e07d0cebef39fce0faac8d49c7afd015b9cae37ef72950a186b75a8",
    usage: "repeated vertically below the TOP for the whole remaining height (first and last rows identical; TOP last row = BODY first row)",
  },
  recolor: false,
  filter: "none",
} as const;

export const A13_ALBUM_DARK_MATERIAL = {
  schemaVersion: "1.0",
  scope: "A13_ALBUM_DESKTOP_DARK_MATERIAL_ONLY",
  geometryDivergenceLightDark: "NONE",
  affectsGeometry: false,
  lightRuntimeAuthority: { commit: "96d4dd1d14ff7ef6d86ce8f10bc9aefe21bebb3a", version: "A13_ALBUM_COMPLET_DESKTOP_LIGHT_RUNTIME_V1_2" },
  polaroid: {
    geometry: "INHERIT_LIGHT_V1_2",
    paper: { base: "#E7D3B2", highlight: "#F1E2C8", lowlight: "#C9AE86", fiberColor: "rgba(88,62,39,0.16)", grainOpacityMax: 0.09, grainContrastMax: 0.05, variationSeed: "slotId", variationLightnessPercent: 2.5, variationHueDeg: 0, mustNotChangeAlphaHull: true },
    edge: { color: "rgba(91,64,42,0.34)", innerStrokeColor: "rgba(93,65,42,0.30)", innerStrokeWidth: "INHERIT_LIGHT_V1_2" },
    bottomBand: { geometry: "INHERIT_LIGHT_V1_2", material: "paper", maximumBottomDarkeningPercent: 2 },
    shadow: { contact: "0 2px 3px rgba(6,4,3,0.44)", main: "0 13px 27px rgba(6,4,3,0.36)", ambient: "0 24px 42px rgba(6,4,3,0.16)", includedInGeometry: false, includedInCollision: false, includedInOcclusion: false },
  },
  caption: { geometry: "INHERIT_LIGHT_V1_2", arbitration: "INHERIT_LIGHT_V1_2_SOFT", ink: "#4A3527", inkMuted: "#654B38", textShadow: "none", opacity: 1, minimumContrast: 4.5, targetContrast: 7 },
  photo: { mediaAndDecision: "BYTE_IDENTICAL_TO_LIGHT", filter: "none", opacity: 1, mixBlendMode: "normal", backdropFilter: "none", colorAdjustment: "none", themeProcessing: false },
  runtimeText: { geometry: "INHERIT_LIGHT_V1_2", titleInk: "#D8C39B", titleInkMuted: "#C7AD7F", microcopyInk: "#B99B6C", titleTextShadow: "0 1px 1px rgba(0,0,0,0.22)", minimumContrast: 4.5 },
  focus: { geometry: "INHERIT_LIGHT_V1_2", color: "#F1D6A3", widthPx: 2, offsetPx: 4, style: "solid", minimumContrast: 3, layoutShiftAllowed: false },
  materialOnlyGuard: {
    tokensReadableBySolver: false,
    forbiddenProperties: ["width", "height", "min-width", "max-width", "min-height", "max-height", "padding", "margin", "gap", "inset", "top", "right", "bottom", "left", "transform", "translate", "rotate", "scale", "transform-origin", "z-index", "overflow", "object-fit", "object-position", "aspect-ratio", "font-size", "line-height", "font-weight", "letter-spacing", "border-width"],
    failure: "DARK_TOKEN_GEOMETRY_LEAK_STOP",
  },
  stopConditions: [
    "ALBUM_DARK_BACKGROUND_AUTHORITY_STOP",
    "THEME_GEOMETRY_PARITY_STOP",
    "DARK_SOLVER_FORK_STOP",
    "DARK_PHOTO_PROCESSING_STOP",
    "DARK_TOKEN_GEOMETRY_LEAK_STOP",
    "DARK_BACKGROUND_REPEAT_STOP",
    "DARK_MASTER_EXTRACTION_STOP",
    "DARK_LIGHT_RECOLOR_STOP",
  ],
} as const;
