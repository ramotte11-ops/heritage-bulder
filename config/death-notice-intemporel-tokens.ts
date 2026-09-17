import type { SkinVariant } from "@/config/skins";

/**
 * Mission 039B — A03 (Avis de décès) runtime tokens, Studio pack
 * `A03_CANONICAL_FINAL_PACKAGE` (the QG-issued final canonical package,
 * superseding every earlier A03 upload — no previous ZIP, geometry file,
 * QA board, or asset was reused). Desktop geometry (`04_TOKENS/geometry.json`)
 * is numerically identical to the prior package (art frozen per this
 * package's own rule); its 6 runtime PNGs are nonetheless replaced
 * (opaque RGB exports, no alpha channel — fixes the hairline export
 * fringe the prior RGBA exports baked in). Mobile geometry, safe areas,
 * anchors, colors, and mobile typography are entirely new (Mobile was
 * recomposed by Studio for real smartphone widths). Icons are now 5 SVGs
 * (`05_ICONS/`, `stroke="currentColor"`) instead of PNGs.
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

/**
 * The five functional precision pictograms — raw SVG markup transcribed
 * verbatim from `05_ICONS/*.svg` (SHA-256 verified against the package's
 * own `SHA256SUMS.txt`), rendered inline (`dangerouslySetInnerHTML`) so
 * their `stroke="currentColor"` paths pick up the CSS `color` the
 * package's own `05_ICONS/README.md` mandates — never as an `<img>`
 * (which cannot be tinted by `currentColor`) and never a second Dark
 * file, mask, icon library, or emoji substitute.
 */
export const DEATH_NOTICE_INTEMPOREL_ICONS = {
  generalLocation:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 22s7-6.1 7-13A7 7 0 1 0 5 9c0 6.9 7 13 7 13Z" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="9" r="2.2" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
  familyMessage:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="8" cy="8" r="2.3" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="16" cy="8" r="2.3" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="5.7" r="2.1" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M3.5 19v-2.1c0-2.4 2-4.4 4.4-4.4h.2M20.5 19v-2.1c0-2.4-2-4.4-4.4-4.4h-.2M7.4 19v-2.4c0-2.5 2.1-4.6 4.6-4.6s4.6 2.1 4.6 4.6V19" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  thought:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 21V9m0 6c-3.6 0-6-2-6-5 3.6 0 6 2 6 5Zm0-2c3.6 0 6-2 6-5-3.6 0-6 2-6 5Zm0-6c-2.5 0-4.2-1.5-4.2-3.8C10.3 4.2 12 5.7 12 8Z" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  quote:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3Z" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  other:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3.5 5.5h7v13h-7zM13.5 5.5h7v13h-7z" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10.5 9H7.2c0 3.2-1.2 4.6-3.7 5.7M20.5 9h-3.3c0 3.2-1.2 4.6-3.7 5.7" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
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
      nativeCanvasWidthPx: 841,
      sceneTopHeightPx: 680,
      sceneMiddleHeightPx: 260,
      sceneBottomHeightPx: 430,
      safeAreaXPx: { left: 104, right: 737 },
      anchorsYPx: {
        eyebrow: 235,
        title: 294,
        branchCenter: 419,
        nameTop: 487,
        datesTop: 593,
        announcementTop: 648,
        detailsFlowTop: 895,
      },
      detailColumnsPx: { left: { left: 104, right: 737 }, right: null },
      bottomArtReservePx: 170,
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
      nativeCanvasWidthPx: 841,
      sceneTopHeightPx: 640,
      sceneMiddleHeightPx: 260,
      sceneBottomHeightPx: 430,
      safeAreaXPx: { left: 120, right: 721 },
      anchorsYPx: {
        eyebrow: 186,
        title: 241,
        branchCenter: 355,
        nameTop: 416,
        datesTop: 511,
        announcementTop: 577,
        detailsFlowTop: 848,
      },
      detailColumnsPx: { left: { left: 120, right: 721 }, right: null },
      bottomArtReservePx: 180,
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
    eyebrow: { sizePx: 11, lineHeight: 1.15, letterSpacingEm: 0.2, weight: 500 },
    title: { sizePx: 29, lineHeight: 1.0, weight: 500 },
    dates: { sizePx: 18, lineHeight: 1.1, letterSpacingEm: 0.04, weight: 400 },
    announcement: { sizePx: 16, lineHeight: 1.38, weight: 400 },
    detailLabel: { sizePx: 11, lineHeight: 1.15, letterSpacingEm: 0.16, weight: 600 },
    detailText: { sizePx: 14, lineHeight: 1.38, weight: 400 },
    quote: { sizePx: 14, lineHeight: 1.38, weight: 400 },
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
      // typography.json's mobile `name` gives a single `normal_px: 42`
      // (no min), unlike desktop's own min/max shrink range — mobile's
      // "cas normal" tier is a fixed size, not a shrink-to-fit range;
      // min=max encodes that without a second code path in
      // useFitLongName (its shrink loop simply never iterates here).
      minPx: 42,
      maxPx: 42,
      lineHeight: 0.95,
      weight: 500,
      maxLinesNormal: 2,
      fallback: { targetPx: 32, minPx: 30, lineHeight: 0.94, maxLines: 3 },
    },
  },
} as const;

/**
 * Ink tokens, transcribed verbatim from the package's own `colors.json`
 * (`ink` -> textPrimary, `muted_ink` -> textSecondary, `separator` ->
 * rule, `accent` -> bronze). Light and Dark each own their complete set
 * — never a CSS filter/inversion deriving one from the other.
 * `stage_background`/`paper` are not consumed here — this component
 * never paints its own background, only the Studio's own scene pixels
 * (see `DeathNoticeIntemporel.tsx`'s own docstring).
 */
export const DEATH_NOTICE_INTEMPOREL_COLORS: Record<
  SkinVariant,
  { textPrimary: string; textSecondary: string; rule: string; bronze: string }
> = {
  light: {
    textPrimary: "#2E2923",
    textSecondary: "#6E675D",
    rule: "#8B8479",
    bronze: "#9A6436",
  },
  dark: {
    textPrimary: "#F0E7DA",
    textSecondary: "#CFC3B2",
    rule: "#B7874A",
    bronze: "#C69352",
  },
};
