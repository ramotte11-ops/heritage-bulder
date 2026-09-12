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
 * Text-only ink colors, still needed because the master's own paper
 * tone differs Light/Dark — everything else (papers, botanicals, seal,
 * frame, postcard, textures, shadows) is baked into the master and has
 * no token here at all.
 */
export const HERO_INTEMPOREL_INK = {
  light: { primary: "#3D3A2B", secondary: "#6B6256", accent: "#6F7255" },
  dark: { primary: "#F0E1CD", secondary: "#C8B8A4", accent: "#707052" },
} as const;
