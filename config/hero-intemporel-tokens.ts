/**
 * Mission 035 v4 (QG-validated `HERITAGE_HERO_RUNTIME_MASTERS_V3_FINAL.zip`)
 * — the Hero Intemporel RUNTIME MASTER tokens, V3 FINAL generation.
 *
 * V3 replaces V1/V2 entirely: the Studio's own README —
 * "Studio = matière et composition. Code = photo et texte vivant." —
 * and its manifest confirm the 4 masters now carry NO raster text and
 * NO raster UI at all (`contains_raster_text_or_ui: false` on every
 * entry), and each photo window is a plain, AXIS-ALIGNED rectangle —
 * no rotation, no polygon. This is what let
 * `components/memorial/hero/HeroIntemporel.tsx` drop the v2 clip-path/
 * bounding-box machinery entirely: a rotated window's own defect
 * category (a `transform: rotate()` on an ancestor visually rotating
 * the family's photo) cannot recur for a window that was never rotated
 * to begin with.
 *
 * Every pixel value below is transcribed verbatim from that package's
 * own `runtime-master-manifest.json` (`photo_opening_runtime_px_exact`)
 * — checksums verified against `CHECKSUMS.sha256` before copying the
 * PNGs into `public/`. The text zone box has no Studio-given coordinates
 * this time (the manifest only names it "right editorial field" /
 * "central field below photo collage") — those four boxes are this
 * mission's own visual placement inside the blank paper area the
 * Studio left for it, tuned against the real masters and the QA
 * screenshots (see the Mission 035 v4 report), not a Studio-specified
 * number like every other box in this file.
 */

import type { SkinVariant } from "@/config/skins";

export const HERO_INTEMPOREL_BREAKPOINT_DESKTOP_PX = 960;

/**
 * Handoff V1.2 — the contract applies only to the Mobile Light scene
 * rendered between 320px and 430px. The existing masters and geometry
 * remain authoritative everywhere else.
 */
export const HERO_INTEMPOREL_MOBILE_LIGHT_PHOTO_RUNTIME = {
  contractedWidthCssPx: { min: 320, max: 430 },
  canvasPx: { width: 941, height: 1672 },
  /** A convenient 4:5 pixel rectangle used only as the CSS transform's
   * source coordinate system. Its aspect ratio, not its resolution, is
   * contractual; the homography below still consumes normalized u/v. */
  logicalRasterPx: { width: 400, height: 500 },
  destinationQuadPx: [
    [257.6950988769531, 219.0428009033203],
    [657.7222290039062, 175.31520080566406],
    [710.5056762695312, 649.205078125],
    [303.7381896972656, 696.8555297851562],
  ],
  homographyNormalizedSourceToReference: [
    [404.319837107753, 40.752744666416, 257.695098876953],
    [-42.583383355159, 465.6752792727, 219.04280090332],
    [0.00652662597, -0.017417454681, 1],
  ],
  plateSrc:
    "/assets/hero/intemporel/runtime/HERO_INTEMPOREL_MOBILE_LIGHT_PHOTO_PLATE_RUNTIME_CLEAN_V1.png",
  maskSrc:
    "/assets/hero/intemporel/runtime/HERO_INTEMPOREL_MOBILE_LIGHT_PHOTO_MASK_RUNTIME_CLEAN_V1.png",
  plateSha256: "6a8f555310613e6dc13b7714c8887c7e4b632c9cea9528d1c2b5ab55e0082980",
  maskSha256: "8df35f9e9222e0dca243e70e629c600cf9c0f1ff72028735f459db2ed82653f8",
} as const;

/**
 * QG Handoff Runtime V1 — Mobile Dark V2 photo runtime. These values
 * are transcribed from the authoritative 982×1602 contract and apply
 * only inside its explicitly supported 320–430px width band.
 */
export const HERO_INTEMPOREL_MOBILE_DARK_PHOTO_RUNTIME = {
  contractedWidthCssPx: { min: 320, max: 430 },
  canvasPx: { width: 982, height: 1602 },
  /** Fixed 4:5 source plane. The contract's homography consumes its
   * normalized 0..4 × 0..5 coordinate system. */
  logicalRasterPx: { width: 400, height: 500 },
  normalizedSourceSize: { width: 4, height: 5 },
  normalizedCropRect: {
    x: 0,
    y: 0.3159091855091911,
    width: 4,
    height: 4.368181628981618,
  },
  destinationQuadPx: [
    [285.387045982091, 185.931750076958],
    [734.530248408402, 135.18266449704],
    [795.67051800863, 625.898221989843],
    [339.571832964632, 684.227521064665],
  ],
  homographyNormalizedSourceToReference: [
    [114.60897005534757, 11.065434355612389, 281.53992671680476],
    [-12.218643662535635, 111.26622935568122, 150.5527559508917],
    [0.003351048606059601, -0.003898191948665708, 1],
  ],
  overlaySrc:
    "/assets/hero/intemporel/runtime/HERO_INTEMPOREL_MOBILE_DARK_ALPHA_RUNTIME_ASSET_V2(1).png",
  overlaySha256: "aab7752aad7d707a0db4c46cef344d852b32dfd86ee3dcfa4eeac1e09c1a36c0",
  fullyTransparentPixels: 226292,
} as const;

/**
 * QG Handoff Runtime V1 — Desktop Light photo runtime. Geometry is in
 * the authoritative 1672×941 reference canvas and uses the existing
 * HERITAGE desktop breakpoint without introducing another one.
 */
export const HERO_INTEMPOREL_DESKTOP_LIGHT_PHOTO_RUNTIME = {
  canvasPx: { width: 1672, height: 941 },
  logicalRasterPx: { width: 400, height: 500 },
  normalizedSourceSize: { width: 4, height: 5 },
  normalizedCropRect: {
    x: 0,
    y: 0.05862393342704664,
    width: 4,
    height: 4.882752133145907,
  },
  destinationQuadPx: [
    [249.60878661, 219.92887029],
    [700.18878886, 131.96314317],
    [808.46999733, 684.38083385],
    [354.02947306, 772.74426913],
  ],
  homographyNormalizedSourceToReference: [
    [112.52598716490353, 20.77822361049548, 248.36566853615486],
    [-22.009530153937288, 111.88555121460418, 213.34765695803256],
    [-0.00015384940226202226, -0.0017096147467908099, 1],
  ],
  overlaySrc:
    "/assets/hero/intemporel/runtime/HERO_INTEMPOREL_DESKTOP_LIGHT_ALPHA_RUNTIME_ASSET_V1(1).png",
  overlaySha256: "216818582aa1b6c58bd750a2fe4e936f433213b3645eb9a1292f15ebc6e49995",
  fullyTransparentPixels: 295048,
} as const;

/** Exact QG-supplied geometry and byte identity for Desktop Dark Runtime V1. */
export const HERO_INTEMPOREL_DESKTOP_DARK_PHOTO_RUNTIME = {
  canvasPx: { width: 1672, height: 941 },
  logicalRasterPx: { width: 400, height: 500 },
  normalizedSourceSize: { width: 4, height: 5 },
  normalizedCropRect: {
    x: 0,
    y: 0.04768016287499899,
    width: 4,
    height: 4.904639674250002,
  },
  destinationQuadPx: [
    [248.58025692688105, 213.71605447233398],
    [692.7847001103855, 132.91020146330993],
    [807.9103742411495, 686.5327039663346],
    [354.41363947986156, 753.7077330592662],
  ],
  homographyNormalizedSourceToReference: [
    [106.48220936986688, 20.577212488731398, 247.56575323552485],
    [-21.07242999591678, 107.96074197549991, 208.53977135624035],
    [-0.006573455951470907, -0.0028162226428227314, 1],
  ],
  overlaySrc:
    "/assets/hero/intemporel/runtime/HERO_INTEMPOREL_DESKTOP_DARK_ALPHA_RUNTIME_ASSET_V1(1).png",
  overlaySha256: "9e8419e9446838367210893897f1f02434e30a34e61f1231f04634d95a2d2f8b",
  fullyTransparentPixels: 250532,
} as const;

/** Where the 4 runtime masters actually live — copied verbatim (same
 * bytes, `CHECKSUMS.sha256` verified) from the Studio package into
 * `public/`. */
export const HERO_INTEMPOREL_RUNTIME_MASTER_SRC: Record<SkinVariant, { desktop: string; mobile: string }> = {
  light: {
    desktop: "/assets/hero/intemporel/runtime/hero-runtime-light-desktop.png",
    mobile: "/assets/hero/intemporel/runtime/hero-runtime-light-mobile.png",
  },
  dark: {
    desktop: "/assets/hero/intemporel/runtime/hero-runtime-dark-desktop.png",
    mobile: "/assets/hero/intemporel/runtime/hero-runtime-dark-mobile.png",
  },
};

/**
 * One master's own geometry. Pixel space is that master's own canvas
 * (`dimensionsPx`) — light and dark do NOT share identical photo-window
 * geometry even at the same breakpoint (the manifest gives each of the
 * 4 masters its own x/y/width/height), though they stay close.
 */
export interface HeroRuntimeMasterSpec {
  /** The master's own canvas size, in pixels. */
  dimensionsPx: readonly [number, number];
  /** The transparent photo window, in the master's own pixel space —
   * `photo_opening_runtime_px_exact` verbatim. Genuinely axis-aligned
   * (no rotation field exists in the V3 manifest at all) and verified
   * against the real PNG's alpha channel before this mission trusted it
   * (never assumed). Ratio is always 4:5 portrait. */
  photoWindowPx: { x: number; y: number; width: number; height: number };
  /** `[x, y, width, height]`, each a fraction (0..1) of the master's own
   * canvas — where the family's context label/name/dates/shortPhrase
   * are injected. See this file's own docstring: unlike every other
   * box here, V3's manifest does not specify this one numerically
   * ("right editorial field" / "central field below photo collage") —
   * this mission placed it inside that named blank area. */
  textZoneNormalized: readonly [number, number, number, number];
}

export const HERO_INTEMPOREL_RUNTIME_MASTER_SPECS: Record<
  SkinVariant,
  { desktop: HeroRuntimeMasterSpec; mobile: HeroRuntimeMasterSpec }
> = {
  light: {
    desktop: {
      dimensionsPx: [1536, 1024],
      photoWindowPx: { x: 326, y: 166, width: 396, height: 495 },
      textZoneNormalized: [0.52, 0.18, 0.42, 0.64],
    },
    mobile: {
      dimensionsPx: [941, 1672],
      photoWindowPx: { x: 259, y: 124, width: 412, height: 515 },
      textZoneNormalized: [0.04, 0.52, 0.92, 0.44],
    },
  },
  dark: {
    desktop: {
      dimensionsPx: [1536, 1024],
      photoWindowPx: { x: 319, y: 168, width: 392, height: 490 },
      textZoneNormalized: [0.52, 0.18, 0.42, 0.64],
    },
    mobile: {
      dimensionsPx: [941, 1672],
      photoWindowPx: { x: 262, y: 138, width: 412, height: 515 },
      textZoneNormalized: [0.04, 0.52, 0.92, 0.44],
    },
  },
};

export const HERO_INTEMPOREL_TYPOGRAPHY = {
  contextLabel: {
    desktopPx: 15,
    mobilePx: 13,
    lineHeight: 1.2,
    letterSpacingEm: 0.34,
    uppercase: true,
  },
  displayedName: {
    desktopPx: 86,
    mobilePx: 72,
    lineHeight: 0.95,
    letterSpacingEm: -0.02,
    /**
     * Mission 035 v4 section 6 (QG-locked, three-tier fitting):
     *
     *   1. "cible normale: 1 ligne" — the nominal size (`desktopPx`/
     *      `mobilePx`) already IS that target; most real names need no
     *      adjustment at all.
     *   2. "cible longue: maximum 2 lignes" — shrink in whole px steps,
     *      never below `minNormalDesktopPx`/`minNormalMobilePx`, until
     *      it wraps into <= `maxLinesNormal`.
     *   3. "exception extrême: maximum 3 lignes" — if it STILL wraps
     *      past `maxLinesNormal` at the normal floor, allow a 3rd line
     *      at that SAME floor size (no further shrink yet).
     *   4. Only if it still exceeds `maxLinesExtreme` even then does
     *      `useFitDisplayName` cross below the normal floor — the
     *      smallest additional reduction that reaches
     *      `maxLinesExtreme`, never further, down to
     *      `extremeFallbackMinPx` at the very worst. This 4th tier is
     *      the documented "fallback extrême" mission section 6 asks
     *      for explicitly — centralized here as the one constant that
     *      bounds it, never invented ad hoc in the component.
     *
     * The full name is ALWAYS rendered whole at every tier — no
     * ellipsis, no dropped word, ever.
     */
    minNormalDesktopPx: 56,
    minNormalMobilePx: 48,
    maxLinesNormal: 2,
    maxLinesExtreme: 3,
    extremeFallbackMinPx: 40,
  },
  dates: {
    desktopPx: 30,
    mobilePx: 28,
    lineHeight: 1.1,
    letterSpacingEm: 0.04,
  },
  shortPhrase: {
    desktopPx: 42,
    mobilePx: 42,
    lineHeight: 1.15,
    letterSpacingEm: 0.0,
    minPx: 34,
  },
} as const;

/**
 * HERO INTEMPOREL — MOBILE TEXT CONTRACT V1 REV1
 * (`HERO_INTEMPOREL_MOBILE_TEXT_CONTRACT_V1_REV1.zip`, SHA-256
 * `2c9f7fc5269f93e70354cdd311f54b13a3610390af8764d73ac4df8cd5086ae8`).
 *
 * Applies ONLY inside the contracted 320–430px band — the same band the
 * Mobile Light/Dark photo runtimes above already own, so the text and
 * the scene it sits on are always switched together. Below 320px,
 * 431–959px and Desktop keep `HERO_INTEMPOREL_TYPOGRAPHY` and the
 * legacy `textZoneNormalized` flow, untouched.
 *
 * Every box is `[x0, y0, x1, y1]` in its variant's OWN native scene:
 * Light is the 941×1672 clean plate, Dark the 982×1602 alpha overlay —
 * Dark is never derived from Light coordinates (REV1 `MAPPING_DARK.md`).
 * Typography is in `vw`; the renderer resolves it against the Hero's own
 * width (identical to the viewport width wherever the Hero is rendered
 * full-bleed on mobile, which is every current caller).
 */
export const HERO_INTEMPOREL_MOBILE_TEXT_CONTRACT = {
  contractedWidthCssPx: { min: 320, max: 430 },
  typography: {
    name: {
      vw: 10.0,
      normalMinVw: 7.6,
      extremeMinVw: 6.8,
      lineHeight: 0.95,
      letterSpacingEm: -0.02,
      maxLinesNormal: 2,
      maxLinesExtreme: 3,
    },
    dates: { vw: 3.25, lineHeight: 1.1, letterSpacingEm: 0.04 },
    phrase: { vw: 5.15, lineHeight: 1.15, maxWidthVw: 72.0 },
  },
  light: {
    canvasPx: [941, 1672],
    axisX: 470.5,
    nameBox: [150, 1008, 791, 1104],
    datesBox: [260, 1107, 681, 1131],
    /** REV1 `MAPPING_LIGHT.md`: the traits+cœur baked into the frozen
     * clean plate IS the Light separator — never a second runtime one. */
    separator: { mode: "baked", bbox: [346, 1134, 594, 1159] },
    phraseBox: [145, 1174, 796, 1296],
    leafKeepout: [398, 1307, 543, 1370],
  },
  dark: {
    canvasPx: [982, 1602],
    axisX: 491.0,
    nameBox: [155, 884, 827, 978],
    datesBox: [270, 991, 712, 1017],
    separator: { mode: "runtime", bbox: [350, 1032, 632, 1062] },
    phraseBox: [150, 1082, 832, 1206],
  },
} as const;

/**
 * Geometry of the Dark runtime traits+cœur, in the Light clean plate's
 * own pixel space. `viewBox` is the baked Light separator's measured ink
 * bbox (pixels 346–594 × 1134–1159). Every value below was measured on
 * the frozen plate itself (sub-pixel, from its anti-aliased coverage):
 * rules on y=1146, ~0.95px, x 346.2–430.6 and 509.5–594.6; outline heart
 * ink 456–485 × 1134–1160, ~2.2px stroke. The heart is the historical
 * HERITAGE outline-heart path (`hero-heart-divider-intemporel.svg`,
 * commit 6d11aeb) scaled onto that measured bbox — a reproduction of the
 * existing ornament, never a new one. The renderer fits this viewBox
 * into REV1's Dark bbox (282×30 in the 982×1602 scene).
 */
export const HERO_INTEMPOREL_MOBILE_SEPARATOR_GEOMETRY = {
  viewBox: "346 1134 249 26",
  ruleY: 1146.5,
  ruleStrokeWidth: 0.95,
  leftRule: [346.2, 430.6],
  rightRule: [509.5, 594.6],
  heartStrokeWidth: 2.2,
  /** Historical path (`M450 132 C442 119 389 88 389 52 C389 25 421 13
   * 450 43 C479 13 511 25 511 52 C511 88 458 119 450 132Z`, centerline
   * bbox 389,25.42 → 511,132) uniformly scaled by 0.21967 onto the baked
   * heart's centerline bbox (ink bbox inset by half the stroke), written
   * in absolute plate coordinates so the stroke stays in plate pixels. */
  heartPath:
    "M470.5 1158.71 C468.74 1155.85 457.1 1149.04 457.1 1141.13 C457.1 1135.2 464.13 1132.57 470.5 1139.16 C476.87 1132.57 483.9 1135.2 483.9 1141.13 C483.9 1149.04 472.26 1155.85 470.5 1158.71Z",
} as const;

/**
 * Mobile Dark only (320–430px) — the NAME's free territory in the frozen
 * 982×1602 overlay, measured (read-only) by
 * `scripts/pilot/hero-mobile-dark-name-territory.py` from
 * `HERO_INTEMPOREL_MOBILE_DARK_ALPHA_RUNTIME_ASSET_V2(1).png` (its SHA-256
 * is `HERO_INTEMPOREL_MOBILE_DARK_PHOTO_RUNTIME.overlaySha256`).
 *
 * `artLowestY[i]` is, for the 2-px native column band starting at
 * `xStart + i * xStep`, the lowest y in [600, 978] where the frozen art
 * (flowers, leaves, papers, Polaroid, shadows — any tone that departs
 * from the dark paper) is present; 600 = no art in that band. A NAME glyph
 * whose ink top stays below that line (+ `clearancePx`) touches no art,
 * because the NAME's bottom is anchored at y 978.
 *
 * Consumed by `fitMobileDarkName` (HeroIntemporel.tsx). Never an asset
 * edit: the overlay is only read.
 */
export const HERO_INTEMPOREL_MOBILE_DARK_NAME_TERRITORY = {
  canvasPx: [982, 1602],
  xStart: 100,
  xStep: 2,
  clearancePx: 2,
  artLowestY: [
    963, 936, 934, 934, 915, 910, 908, 909, 907, 903, 901, 902, 903, 897, 896, 895, 893, 890, 887,
    887, 888, 885, 885, 885, 877, 875, 874, 872, 870, 869, 868, 865, 863, 862, 859, 858, 856, 855,
    853, 853, 853, 853, 854, 852, 851, 855, 859, 859, 858, 860, 861, 861, 859, 859, 856, 857, 857,
    851, 856, 859, 865, 864, 861, 863, 863, 867, 881, 881, 881, 877, 877, 873, 875, 872, 874, 875,
    877, 877, 879, 887, 889, 889, 892, 893, 896, 903, 903, 900, 900, 901, 901, 900, 901, 906, 905,
    903, 903, 904, 903, 901, 900, 900, 899, 899, 895, 893, 891, 891, 889, 887, 885, 885, 880, 883,
    884, 883, 884, 884, 888, 889, 887, 890, 890, 891, 893, 894, 893, 892, 894, 893, 893, 893, 892,
    891, 892, 897, 902, 902, 901, 899, 881, 887, 887, 889, 889, 889, 893, 895, 895, 895, 891, 887,
    891, 892, 892, 890, 889, 893, 892, 887, 889, 889, 889, 889, 887, 888, 890, 891, 891, 892, 893,
    893, 895, 895, 895, 889, 887, 886, 887, 887, 885, 885, 887, 876, 890, 890, 890, 877, 876, 875,
    871, 872, 872, 874, 874, 875, 876, 877, 877, 878, 879, 880, 881, 882, 883, 884, 885, 886, 886,
    886, 836, 834, 839, 840, 840, 840, 840, 840, 840, 839, 839, 840, 841, 842, 835, 833, 840, 840,
    840, 840, 837, 836, 836, 836, 835, 835, 835, 836, 836, 838, 840, 842, 841, 840, 839, 837, 836,
    836, 835, 835, 836, 837, 837, 841, 842, 842, 839, 840, 842, 844, 845, 846, 844, 844, 843, 839,
    839, 839, 838, 839, 840, 839, 841, 840, 840, 842, 843, 842, 843, 843, 863, 867, 867, 880, 881,
    881, 879, 878, 875, 874, 875, 876, 877, 880, 880, 881, 883, 888, 889, 891, 890, 889, 892, 895,
    895, 895, 895, 897, 897, 896, 900, 903, 903, 903, 904, 913, 914, 914, 911, 913, 915, 915, 914,
    917, 917, 918, 921, 925, 927, 929, 931, 934, 938, 940, 941, 943, 944, 946, 946, 950, 951, 954,
    954, 955, 956, 955, 954, 955, 956, 958, 957, 959, 958, 957, 958, 962, 963, 963, 965, 966, 965,
    966, 967, 967, 971, 973, 969, 977, 978, 976, 978, 978, 978, 978, 978, 978, 978, 978, 978, 978,
    978, 978, 978, 978, 978, 978, 978, 978, 978, 978, 978
  ],
} as const;

/**
 * Text-only ink colors, still needed because the master's own paper
 * tone differs Light/Dark — everything else (papers, botanicals, seal,
 * frame, postcard, textures, shadows) is baked into the master and has
 * no token here at all.
 */
export const HERO_INTEMPOREL_INK = {
  light: { primary: "#3D3A2B", secondary: "#6B6256", accent: "#6F7255" },
  dark: { primary: "#F0E1CD", secondary: "#C8B8A4", accent: "#707052" },
} as const;
