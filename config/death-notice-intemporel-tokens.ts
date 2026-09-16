import type { SkinVariant } from "@/config/skins";

/**
 * Mission 039B — A03 (Avis de décès) runtime tokens, Studio pack
 * `HERITAGE_A03_CLAUDE_FINAL_LEAN_UNDER30MB` (the QG-issued single
 * canonical correction package, superseding the earlier
 * `A03_RUNTIME_CORRECTIONS_V3_1_1_QA_CANONICAL` upload — its
 * `03_RUNTIME_ASSETS_CANONICAL/` PNGs are byte-for-byte identical to
 * that earlier package's own `02_RUNTIME_ASSETS/`, verified before
 * reuse, so no asset churn was needed; `02_SPEC_TOKENS_ICONS/04_TOKENS/`
 * is what is NEW here — the real `typography.json`/`colors.json` this
 * mission's first pass lacked).
 *
 * ## The three-mass SCENE architecture (mission brief section 10)
 *
 * SCENE TOP (once) + SCENE MIDDLE (repeated N times) + SCENE BOTTOM
 * (once), stacked in normal document flow — each `<img>` rendered at
 * `width: 100%; height: auto`, which is exactly the mission's own scale
 * rule (`scale = renderedSceneWidth / nativeCanvasWidth`, uniformly on
 * both axes) applied by the browser's own intrinsic-aspect-ratio
 * scaling, never a second, hand-rolled scale computation for the
 * background images themselves.
 *
 * ## Every value below now comes from the package's own tokens — no
 * placeholder survives
 *
 * `TYPOGRAPHY` (except `name`, already mission-specified) and `INK` are
 * transcribed VERBATIM from `02_SPEC_TOKENS_ICONS/04_TOKENS/typography.json`
 * and `colors.json` — the first pass's placeholder sizes and its
 * borrowed-from-Hero ink colors are both gone. `RHYTHM` below is new:
 * the exact vertical percentages (`paddingTopPct`, `titleMarginTopPct`,
 * `branchSpacePct`) a fixed, single-line eyebrow/title header needs to
 * clear the Studio's own baked rameau décoratif before `name` starts —
 * derived arithmetically from `geometry.json`'s own `anchors_y_px`
 * deltas (`(anchorA - anchorB) / nativeCanvasWidthPx`), the same
 * width-based scale rule every other coordinate in this file uses,
 * never eyeballed. This is deliberately NOT extended past the header
 * zone (name/dates/announcement/details keep ordinary flow-based
 * margins, `DeathNoticeIntemporel.module.css`) — a name that wraps to 2
 * lines, or a long announcement, must be able to push later elements
 * down; the Studio's own nominal anchors for those (`name_top`,
 * `dates_top`, ...) describe the SHORT-content reference case only, per
 * `A03_RUNTIME_SPEC.md` section 8, not a fixed pin every content length
 * must satisfy.
 */

export const DEATH_NOTICE_INTEMPOREL_BREAKPOINT_DESKTOP_PX = 960;

const ASSET_ROOT = "/assets/death-notice/intemporel";

interface FormatAssets {
  desktop: string;
  mobile: string;
}

/** The 12 canonical runtime PNGs — copied verbatim (same bytes,
 * `SHA256SUMS.txt` verified) from the Studio package into `public/`. No
 * QA/audit/reference file from that package is installed here. */
export const DEATH_NOTICE_INTEMPOREL_ASSETS = {
  top: {
    light: { desktop: `${ASSET_ROOT}/runtime/light/desktop/a03-scene-top.png`, mobile: `${ASSET_ROOT}/runtime/light/mobile/a03-scene-top.png` },
    dark: { desktop: `${ASSET_ROOT}/runtime/dark/desktop/a03-scene-top.png`, mobile: `${ASSET_ROOT}/runtime/dark/mobile/a03-scene-top.png` },
  } satisfies Record<SkinVariant, FormatAssets>,
  middle: {
    light: { desktop: `${ASSET_ROOT}/runtime/light/desktop/a03-scene-middle.png`, mobile: `${ASSET_ROOT}/runtime/light/mobile/a03-scene-middle.png` },
    dark: { desktop: `${ASSET_ROOT}/runtime/dark/desktop/a03-scene-middle.png`, mobile: `${ASSET_ROOT}/runtime/dark/mobile/a03-scene-middle.png` },
  } satisfies Record<SkinVariant, FormatAssets>,
  bottom: {
    light: { desktop: `${ASSET_ROOT}/runtime/light/desktop/a03-scene-bottom.png`, mobile: `${ASSET_ROOT}/runtime/light/mobile/a03-scene-bottom.png` },
    dark: { desktop: `${ASSET_ROOT}/runtime/dark/desktop/a03-scene-bottom.png`, mobile: `${ASSET_ROOT}/runtime/dark/mobile/a03-scene-bottom.png` },
  } satisfies Record<SkinVariant, FormatAssets>,
} as const;

/** The five functional precision pictograms — one file, variant-independent
 * (tinted via CSS mask against the current ink accent, never a second Dark
 * file), copied verbatim from `02_SPEC_TOKENS_ICONS/icons/`. */
export const DEATH_NOTICE_INTEMPOREL_ICONS = {
  generalLocation: `${ASSET_ROOT}/icons/a03-icon-location.png`,
  familyMessage: `${ASSET_ROOT}/icons/a03-icon-family.png`,
  thought: `${ASSET_ROOT}/icons/a03-icon-thought.png`,
  quote: `${ASSET_ROOT}/icons/a03-icon-quote.png`,
  other: `${ASSET_ROOT}/icons/a03-icon-other.png`,
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

/** `geometry.json`, transcribed verbatim. Desktop is identical
 * Light/Dark on the X axis; Y anchors differ slightly (the two TOP arts
 * are independently composed). */
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
 * The fixed, single-line eyebrow/title header's own vertical rhythm is
 * geometry-derived rather than flow-based — see this file's own top
 * docstring. The actual percentages live directly in
 * `DeathNoticeIntemporel.module.css` (not duplicated here as data,
 * to avoid two sources of truth silently drifting apart): `.content`'s
 * own `padding-top` is `(eyebrowAnchorPx / nativeCanvasWidthPx) * 100`,
 * exactly like every other coordinate here (CSS resolves a vertical
 * `padding`/`margin` percentage against the containing block's WIDTH).
 * `.title`'s `margin-top` and `.branchSpace`'s `padding-top`, being
 * CHILDREN of `.content` rather than of `.wrap`, need that same raw
 * percentage multiplied by `1 / contentWidthRatio` first — see that
 * stylesheet's own comment at those rules for why (their containing
 * block is `.content`'s ALREADY safe-area-inset width, not `.wrap`'s
 * full one).
 */

/**
 * Typography tokens, transcribed verbatim from the package's own
 * `typography.json` — `font_family.display`/`body` is `"Cormorant
 * Garamond"` (already integrated, `components/builder/fonts.ts`'s
 * `cormorantGaramond`, reused rather than a second font import). `name`
 * is the mission brief's own explicit numbers (section 13), identical
 * to `typography.json`'s own `name`/`exceptional_fallback` entries —
 * transcribed once here as the single source, not duplicated.
 */
export const DEATH_NOTICE_INTEMPOREL_TYPOGRAPHY = {
  desktop: {
    eyebrow: { sizePx: 13, lineHeight: 1.2, letterSpacingEm: 0.24, weight: 500 },
    title: { sizePx: 48, lineHeight: 1.0, weight: 500 },
    dates: { sizePx: 28, lineHeight: 1.0, letterSpacingEm: 0.06, weight: 400 },
    announcement: { sizePx: 22, lineHeight: 1.22, weight: 400 },
    detailLabel: { sizePx: 13, lineHeight: 1.2, letterSpacingEm: 0.22, weight: 600 },
    detailText: { sizePx: 17, lineHeight: 1.22, weight: 400 },
    quote: { sizePx: 17, lineHeight: 1.22, weight: 400 },
  },
  mobile: {
    eyebrow: { sizePx: 10, lineHeight: 1.2, letterSpacingEm: 0.22, weight: 500 },
    title: { sizePx: 34, lineHeight: 1.0, weight: 500 },
    dates: { sizePx: 21, lineHeight: 1.0, letterSpacingEm: 0.05, weight: 400 },
    announcement: { sizePx: 17, lineHeight: 1.28, weight: 400 },
    detailLabel: { sizePx: 11, lineHeight: 1.2, letterSpacingEm: 0.2, weight: 600 },
    detailText: { sizePx: 15, lineHeight: 1.28, weight: 400 },
    quote: { sizePx: 15, lineHeight: 1.28, weight: 400 },
  },
  /**
   * Mission brief section 13 (QG-locked, verbatim, identical to
   * `typography.json`'s own `name`/`exceptional_fallback`) — the name's
   * own sizing. "Nom complet toujours affiché" — never ellipsis,
   * truncation, or a dropped word at any tier, only the font-size (and,
   * only in fallback, the max-width) ever changes.
   */
  name: {
    desktop: { minPx: 48, maxPx: 72, lineHeight: 0.95, weight: 500, maxLinesNormal: 2 },
    mobile: {
      minPx: 38,
      maxPx: 50,
      lineHeight: 0.95,
      weight: 500,
      maxLinesNormal: 2,
      fallback: { targetPx: 34, minPx: 32, lineHeight: 0.92, maxWidthPct: 88, maxLines: 3 },
    },
  },
} as const;

/**
 * Ink + surface tokens, transcribed verbatim from the package's own
 * `colors.json`. Light and Dark each own their complete set — never a
 * CSS filter/inversion deriving one from the other. Replaces the first
 * pass's placeholder (borrowed from `HERITAGE_HERO_INTEMPOREL_INK`,
 * `config/hero-intemporel-tokens.ts`) entirely.
 */
export const DEATH_NOTICE_INTEMPOREL_COLORS: Record<
  SkinVariant,
  { textPrimary: string; textSecondary: string; rule: string; olive: string; bronze: string; shadow: string }
> = {
  light: {
    textPrimary: "#292A22",
    textSecondary: "#5E5A4C",
    rule: "#948D7C",
    olive: "#5B6045",
    bronze: "#A36F3D",
    shadow: "rgba(73,52,34,0.20)",
  },
  dark: {
    textPrimary: "#F1E5D5",
    textSecondary: "#D8C8B4",
    rule: "#A88D67",
    olive: "#62654A",
    bronze: "#C79A5D",
    shadow: "rgba(0,0,0,0.42)",
  },
};
