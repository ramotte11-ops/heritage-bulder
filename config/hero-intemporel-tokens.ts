/**
 * Mission 035 (QG strategy change, section "NOUVELLE RÈGLE ABSOLUE") —
 * the Hero Intemporel RUNTIME MASTER tokens.
 *
 * This file replaced an earlier version of itself that held the
 * asset-by-asset composition tokens (individual papers/botanicals/
 * postcard/seal/frame coordinates, a 14-level z-index table). The QG
 * and PO refused that reconstruction strategy: the Studio now delivers
 * ~95% of the artistic render as one near-complete PNG per
 * (skin_variant × breakpoint) — a "runtime master" — and the code's
 * only remaining job is to inject the three dynamic pieces of family
 * content (photo, name+dates, shortPhrase) into the exact zones the
 * Studio specifies. See `README_QG.txt` and `runtime-master-specs.json`
 * in `HERITAGE_HERO_RUNTIME_MASTERS_V1.zip` (QG-validated) — every
 * number below is transcribed verbatim from that specs file, never
 * re-measured from a screenshot.
 *
 * `components/memorial/hero/HeroIntemporel.tsx` is the one place these
 * are turned into CSS/positioning — see that file's own docstring for
 * the "master + photo + text, nothing else" doctrine this data serves.
 */

import type { SkinVariant } from "@/config/skins";

export const HERO_INTEMPOREL_BREAKPOINT_DESKTOP_PX = 960;

/** Where the 4 runtime masters actually live — copied verbatim (same
 * bytes, `CHECKSUMS.sha256` verified) from the Studio package into
 * `public/`, nothing else under the old per-asset directories remains
 * referenced. */
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
 * One master's own geometry, exactly as `runtime-master-specs.json`
 * describes it — pixel space is that master's own canvas
 * (`dimensions_px`), never a shared/normalized space across masters
 * (light and dark do NOT share identical photo-window geometry, even
 * at the same breakpoint — the manifest gives each of the 4 masters its
 * own center/size/rotation).
 */
export interface HeroRuntimeMasterSpec {
  /** The master's own canvas size, in pixels — every other field below
   * is a pixel coordinate in this exact space, converted to a percentage
   * of it by `HeroIntemporel.tsx` (so it scales with the rendered
   * master regardless of viewport width). */
  dimensionsPx: readonly [number, number];
  /** The transparent photo window's un-rotated local size, in pixels —
   * ratio is always 4:5 portrait (`photo_window_ratio: 0.8`), per the
   * package's own `photo_rule`: "Ratio applies to inner visible photo
   * opening, not support/canvas." */
  photoWindowLocalSizePx: readonly [number, number];
  /** The window's center point, in the master's own pixel space. */
  photoWindowCenterPx: readonly [number, number];
  /** The window's own rotation, in degrees — kept for reference/
   * documentation only. Mission 035 v3's own audit (section 2) found
   * that applying this as a CSS `transform: rotate()` on an ancestor of
   * the photo `<img>` visually rotates the photo's own pixels too (a
   * child's `rotate(0deg)` does not cancel a parent's rotation — CSS
   * transforms are not additive/cancelling across the DOM tree the way
   * `color` inherits). The family's crop model (`focalX`/`focalY`/
   * `zoom`) has no rotation dimension and must never visually appear
   * to have one, so `HeroIntemporel.tsx` does NOT use this value in any
   * `transform`. It masks the window with `photoWindowPolygonPx`
   * instead (a `clip-path`, which shapes visible area without rotating
   * the coordinate space of anything painted inside it) — this field
   * stays for provenance/documentation and is what `photoWindowPolygonPx`
   * is: that exact rectangle, rotated by this exact angle, about its
   * own center. */
  photoWindowRotationDeg: number;
  /**
   * The photo window's four corners, in the master's own pixel space,
   * exactly as the Studio's `photo_window_polygon_px` gives them — the
   * SAME rotated rectangle `photoWindowCenterPx`/`photoWindowLocalSizePx`/
   * `photoWindowRotationDeg` describe parametrically, but given as
   * concrete points so the render can clip to it directly with no
   * rotation transform anywhere (see `photoWindowRotationDeg`'s own
   * docstring above for why that distinction matters). Order: as given
   * by the Studio — `HeroIntemporel.tsx` only derives a bounding box and
   * per-point percentages from it, never assumes a particular winding.
   */
  photoWindowPolygonPx: readonly [number, number][];
  /** `[x, y, width, height]`, each a fraction (0..1) of the master's own
   * canvas — where the family's name/dates/shortPhrase are injected.
   * Identical between Light and Dark at a given breakpoint (the
   * manifest's own `text_zone_px` confirms this), so this mission keys
   * it by breakpoint only, not by variant. */
  textZoneNormalized: readonly [number, number, number, number];
}

export const HERO_INTEMPOREL_RUNTIME_MASTER_SPECS: Record<
  SkinVariant,
  { desktop: HeroRuntimeMasterSpec; mobile: HeroRuntimeMasterSpec }
> = {
  light: {
    desktop: {
      dimensionsPx: [1536, 1024],
      photoWindowLocalSizePx: [420.1, 525.1],
      photoWindowCenterPx: [458.9, 455.3],
      photoWindowRotationDeg: -6.674,
      photoWindowPolygonPx: [
        [280.9, 740.5],
        [219.8, 218.9],
        [637.0, 170.1],
        [698.1, 691.6],
      ],
      textZoneNormalized: [0.515, 0.235, 0.335, 0.56],
    },
    mobile: {
      dimensionsPx: [887, 1774],
      photoWindowLocalSizePx: [395.0, 493.8],
      photoWindowCenterPx: [463.7, 427.8],
      photoWindowRotationDeg: -6.34,
      photoWindowPolygonPx: [
        [294.7, 694.9],
        [240.1, 204.2],
        [632.7, 160.6],
        [687.3, 651.3],
      ],
      textZoneNormalized: [0.12, 0.545, 0.76, 0.38],
    },
  },
  dark: {
    desktop: {
      dimensionsPx: [1536, 1024],
      photoWindowLocalSizePx: [414.5, 518.1],
      photoWindowCenterPx: [462.8, 454.4],
      photoWindowRotationDeg: -5.492,
      photoWindowPolygonPx: [
        [281.3, 732.1],
        [231.8, 216.3],
        [644.3, 176.7],
        [693.9, 692.4],
      ],
      textZoneNormalized: [0.515, 0.235, 0.335, 0.56],
    },
    mobile: {
      dimensionsPx: [887, 1774],
      photoWindowLocalSizePx: [415.2, 519.0],
      photoWindowCenterPx: [485.3, 464.7],
      photoWindowRotationDeg: -6.52,
      photoWindowPolygonPx: [
        [308.5, 746.0],
        [249.6, 230.4],
        [662.1, 183.3],
        [721.0, 698.9],
      ],
      textZoneNormalized: [0.12, 0.545, 0.76, 0.38],
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
    /** Mission 035 v3 section 3 — the name-fitting floor: never shrink
     * past this size, in either direction, however long the name.
     * "1 ligne si possible, 2 lignes maximum, réduction progressive de
     * taille" — see `useFitDisplayName` in HeroIntemporel.tsx for the
     * algorithm this bounds. */
    minDesktopPx: 56,
    minMobilePx: 48,
    maxLines: 2,
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
 * tone differs Light/Dark — everything else (papers, botanicals,
 * seal, frame, textures, shadows) is now baked into the master and
 * has no token here at all (Mission 035's whole point).
 */
export const HERO_INTEMPOREL_INK = {
  light: { primary: "#3D3A2B", secondary: "#6B6256", accent: "#6F7255" },
  dark: { primary: "#F0E1CD", secondary: "#C8B8A4", accent: "#707052" },
} as const;
