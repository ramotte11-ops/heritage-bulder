import type { SkinVariant } from "@/config/skins";

/**
 * Mission 039B — A03 (Avis de décès) runtime tokens, Studio pack
 * `A03_RUNTIME_CORRECTIONS_V3_1_1_QA_CANONICAL`. Verified byte-for-byte
 * against that pack's own `SHA256SUMS.txt` before copying its 12 runtime
 * PNGs into `public/`. `geometry.json` (this pack's own root file — the
 * mission handoff names it `04_TOKENS/geometry.json`, but the pack as
 * delivered carries it at the package root; same content either way) is
 * the SOLE geometric source of truth — every pixel value below that
 * carries a "geometry.json" reference is transcribed from it verbatim,
 * never measured from a PNG or estimated visually.
 *
 * ## The three-mass SCENE architecture (mission brief section 3, 6)
 *
 * SCENE TOP (once) + SCENE MIDDLE (repeated N times) + SCENE BOTTOM
 * (once), stacked in normal document flow — each `<img>` rendered at
 * `width: 100%; height: auto`, which is exactly the mission's own scale
 * rule (`scale = renderedSceneWidth / nativeCanvasWidth`, uniformly on
 * both axes) applied by the browser's own intrinsic-aspect-ratio scaling,
 * never a second, hand-rolled scale computation for the background
 * images themselves. Four independent variants (mobile/desktop ×
 * light/dark) — no asset is shared or derived from another.
 *
 * ## What this file does NOT provide (flagged, not guessed)
 *
 * `geometry.json` gives Y-anchors (`anchors_y_px`) for where each piece
 * of family content lands in the NOMINAL case (a short single-line name,
 * a brief announcement) — it does not, and structurally cannot, pin an
 * exact Y-coordinate for every element regardless of content length: a
 * name that wraps to two lines must push the dates below it, which is
 * the entire point of "allongement dynamique" (section 6). So these
 * anchors are used here as the STARTING offset for the content block as
 * a whole (`anchors_y_px.eyebrow`) plus the reference deltas this file's
 * own `SPACING` derives its em-based gaps from for the nominal case —
 * never as fixed per-element absolute positions.
 *
 * More importantly: the v3.1.1 canonical package ships `geometry.json`
 * ONLY — no `colors.json`, no `typography.json` (unlike the EARLIER,
 * now-obsolete `A03_HANDOFF_FINAL_V2` pack the previous 039B branch
 * worked from, whose own tokens are explicitly retired — mission brief
 * section 2's "anciens tokens visuels A03"). Two real gaps follow from
 * this, both flagged in the mission report rather than silently guessed:
 *
 *   1. **Text ink color** is not specified anywhere in this package.
 *      Rather than "choisir une nouvelle couleur" (forbidden, mission
 *      brief section 4), `INK` below reuses the ALREADY-CANONICAL
 *      Intemporel-skin ink tokens `HeroIntemporel.module.css` already
 *      established for this exact skin identity
 *      (`HERO_INTEMPOREL_INK` in `config/hero-intemporel-tokens.ts`) —
 *      applying an existing, approved system value, not inventing one.
 *      Flagged for explicit QG/Studio confirmation.
 *   2. **Typography sizes** beyond the name (eyebrow/title/dates/
 *      announcement/detail label/detail text) are not specified either.
 *      `TYPOGRAPHY` below uses conservative, legible sizes reasoned from
 *      `geometry.json`'s own anchor gaps at the nominal case (so text
 *      does not visually overflow its allotted band) — an engineering
 *      placeholder, not a Studio-approved value. Flagged for explicit
 *      QG/Studio confirmation. The NAME's own sizing is the one
 *      exception: the mission brief (section 9) gives it explicitly, and
 *      `TYPOGRAPHY.name` transcribes those numbers verbatim.
 */

export const DEATH_NOTICE_INTEMPOREL_BREAKPOINT_DESKTOP_PX = 960;

const ASSET_ROOT = "/assets/death-notice/intemporel/runtime";

interface FormatAssets {
  desktop: string;
  mobile: string;
}

/** The 12 canonical runtime PNGs — copied verbatim (same bytes,
 * `SHA256SUMS.txt` verified) from the Studio v3.1.1 package into
 * `public/`. No QA/audit file from that package is installed here. */
export const DEATH_NOTICE_INTEMPOREL_ASSETS = {
  top: {
    light: { desktop: `${ASSET_ROOT}/light/desktop/a03-scene-top.png`, mobile: `${ASSET_ROOT}/light/mobile/a03-scene-top.png` },
    dark: { desktop: `${ASSET_ROOT}/dark/desktop/a03-scene-top.png`, mobile: `${ASSET_ROOT}/dark/mobile/a03-scene-top.png` },
  } satisfies Record<SkinVariant, FormatAssets>,
  middle: {
    light: { desktop: `${ASSET_ROOT}/light/desktop/a03-scene-middle.png`, mobile: `${ASSET_ROOT}/light/mobile/a03-scene-middle.png` },
    dark: { desktop: `${ASSET_ROOT}/dark/desktop/a03-scene-middle.png`, mobile: `${ASSET_ROOT}/dark/mobile/a03-scene-middle.png` },
  } satisfies Record<SkinVariant, FormatAssets>,
  bottom: {
    light: { desktop: `${ASSET_ROOT}/light/desktop/a03-scene-bottom.png`, mobile: `${ASSET_ROOT}/light/mobile/a03-scene-bottom.png` },
    dark: { desktop: `${ASSET_ROOT}/dark/desktop/a03-scene-bottom.png`, mobile: `${ASSET_ROOT}/dark/mobile/a03-scene-bottom.png` },
  } satisfies Record<SkinVariant, FormatAssets>,
} as const;

/** One format×variant's full geometry — transcribed verbatim from the
 * package's own `geometry.json`. */
export interface DeathNoticeSceneGeometry {
  nativeCanvasWidthPx: number;
  sceneTopHeightPx: number;
  sceneMiddleHeightPx: number;
  sceneBottomHeightPx: number;
  safeAreaXPx: { left: number; right: number };
  anchorsYPx: {
    eyebrow: number;
    title: number;
    branchCenter: number;
    nameTop: number;
    datesTop: number;
    announcementTop: number;
    detailsFlowTop: number;
  };
  detailColumnsPx: {
    left: { left: number; right: number };
    right: { left: number; right: number } | null;
  };
  bottomArtReservePx: number;
}

/** `geometry.json`, transcribed verbatim — see this file's own docstring.
 * Desktop is identical Light/Dark on the X axis; Y anchors differ
 * slightly (the two TOP arts are independently composed). */
export const DEATH_NOTICE_INTEMPOREL_GEOMETRY: Record<
  SkinVariant,
  { desktop: DeathNoticeSceneGeometry; mobile: DeathNoticeSceneGeometry }
> = {
  light: {
    desktop: {
      nativeCanvasWidthPx: 1672,
      sceneTopHeightPx: 420,
      sceneMiddleHeightPx: 128,
      sceneBottomHeightPx: 393,
      safeAreaXPx: { left: 403, right: 1266 },
      anchorsYPx: {
        eyebrow: 84,
        title: 111,
        branchCenter: 169,
        nameTop: 205,
        datesTop: 277,
        announcementTop: 332,
        detailsFlowTop: 475,
      },
      detailColumnsPx: { left: { left: 403, right: 816 }, right: { left: 856, right: 1266 } },
      bottomArtReservePx: 138,
    },
    mobile: {
      nativeCanvasWidthPx: 941,
      sceneTopHeightPx: 760,
      sceneMiddleHeightPx: 220,
      sceneBottomHeightPx: 692,
      safeAreaXPx: { left: 262, right: 676 },
      anchorsYPx: {
        eyebrow: 243,
        title: 277,
        branchCenter: 344,
        nameTop: 386,
        datesTop: 445,
        announcementTop: 507,
        detailsFlowTop: 742,
      },
      detailColumnsPx: { left: { left: 262, right: 676 }, right: null },
      bottomArtReservePx: 196,
    },
  },
  dark: {
    desktop: {
      nativeCanvasWidthPx: 1672,
      sceneTopHeightPx: 420,
      sceneMiddleHeightPx: 128,
      sceneBottomHeightPx: 393,
      safeAreaXPx: { left: 403, right: 1266 },
      anchorsYPx: {
        eyebrow: 68,
        title: 94,
        branchCenter: 150,
        nameTop: 190,
        datesTop: 255,
        announcementTop: 312,
        detailsFlowTop: 450,
      },
      detailColumnsPx: { left: { left: 403, right: 816 }, right: { left: 856, right: 1266 } },
      bottomArtReservePx: 138,
    },
    mobile: {
      nativeCanvasWidthPx: 941,
      sceneTopHeightPx: 700,
      sceneMiddleHeightPx: 220,
      sceneBottomHeightPx: 752,
      safeAreaXPx: { left: 250, right: 686 },
      anchorsYPx: {
        eyebrow: 294,
        title: 328,
        branchCenter: 402,
        nameTop: 447,
        datesTop: 519,
        announcementTop: 575,
        detailsFlowTop: 786,
      },
      detailColumnsPx: { left: { left: 250, right: 686 }, right: null },
      bottomArtReservePx: 190,
    },
  },
};

/**
 * Typography tokens. `name` is the mission brief's own explicit numbers
 * (section 9), transcribed verbatim — the one part of this table that IS
 * a Studio/QG-locked contract, not a placeholder. Every other entry is
 * this mission's own conservative, legible sizing, reasoned from
 * `geometry.json`'s anchor gaps at the nominal case — see this file's own
 * docstring ("What this file does NOT provide").
 */
export const DEATH_NOTICE_INTEMPOREL_TYPOGRAPHY = {
  desktop: {
    eyebrow: { sizePx: 14, lineHeight: 1.2, letterSpacingEm: 0.28, weight: 500 },
    title: { sizePx: 32, lineHeight: 1.05, weight: 500 },
    dates: { sizePx: 26, lineHeight: 1.1, letterSpacingEm: 0.04, weight: 400 },
    announcement: { sizePx: 20, lineHeight: 1.35, weight: 400 },
    detailLabel: { sizePx: 13, lineHeight: 1.2, letterSpacingEm: 0.2, weight: 600 },
    detailText: { sizePx: 16, lineHeight: 1.3, weight: 400 },
  },
  mobile: {
    eyebrow: { sizePx: 11, lineHeight: 1.2, letterSpacingEm: 0.24, weight: 500 },
    title: { sizePx: 24, lineHeight: 1.05, weight: 500 },
    dates: { sizePx: 19, lineHeight: 1.1, letterSpacingEm: 0.03, weight: 400 },
    announcement: { sizePx: 16, lineHeight: 1.38, weight: 400 },
    detailLabel: { sizePx: 11, lineHeight: 1.2, letterSpacingEm: 0.18, weight: 600 },
    detailText: { sizePx: 14, lineHeight: 1.35, weight: 400 },
  },
  /**
   * Mission brief section 9 (QG-locked, verbatim) — the name's own
   * sizing. "Nom complet TOUJOURS affiché" — never ellipsis, truncation,
   * or a dropped word at any tier, only the font-size (and, only in
   * fallback, the max-width) ever changes.
   */
  name: {
    desktop: { minPx: 48, maxPx: 72, lineHeight: 0.95, weight: 500, maxLinesNormal: 2 },
    mobile: {
      minPx: 38,
      maxPx: 50,
      lineHeight: 0.95,
      weight: 500,
      maxLinesNormal: 2,
      /** The exceptional Mobile-only fallback (section 9) — only entered
       * when the name does not wrap into `maxLinesNormal` lines at
       * `minPx`. Desktop never enters an equivalent fallback: a name
       * that fails 2 lines / 48px on Desktop is the mission's own
       * documented STOP condition, not something this hook resolves. */
      fallback: { targetPx: 34, minPx: 32, lineHeight: 0.92, maxWidthPct: 88, maxLines: 3 },
    },
  },
} as const;

/**
 * Text ink colors — reused verbatim from the already-canonical
 * Intemporel-skin tokens (`HERO_INTEMPOREL_INK`,
 * `config/hero-intemporel-tokens.ts`), never a new color invented for
 * A03 specifically. See this file's own docstring for why.
 */
export const DEATH_NOTICE_INTEMPOREL_INK = {
  light: { primary: "#3D3A2B", secondary: "#6B6256", accent: "#6F7255" },
  dark: { primary: "#F0E1CD", secondary: "#C8B8A4", accent: "#707052" },
} as const;
