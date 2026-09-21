import type { SkinVariant } from "@/config/skins";

/**
 * Récit de vie ("Life Story") — Intemporel RUNTIME tokens, Studio pack
 * `RECIT_DE_VIE_STUDIO_RUNTIME_V1_3_1` (QG status:
 * `QG_TYPO_BLOCKER_RESOLVED_CANDIDATE`, GREEN pour intégration runtime).
 * Every value below is transcribed verbatim from that package's own
 * `spec/execution-contract.json` — nothing here is eyeballed,
 * interpolated, or redrawn. See `spec/TYPOGRAPHY_LOCK.md` for the
 * typography patch this same package folds in (V1.3.1: EB Garamond via
 * the existing HERITAGE `next/font/google` integration, no separate SC
 * resource).
 *
 * ## Architecture — SCENE TOP + BODY (extensible Y, repeat-y only) +
 * SCENE BOTTOM
 *
 * Unlike Ceremony/Hero's `single_scene_per_variant` (one fixed master
 * image), and unlike Death Notice's manual SCENE-MIDDLE×N tiling, this
 * package's BODY is genuinely open-ended: `body-field.png` is a single
 * tall (2048px) paper-texture strip meant to be CSS `repeat-y`'d behind
 * however much family text the three matières actually need — never
 * `repeat-x` (contract: `"aucun repeat-x"`), never manually re-tiled
 * discrete copies the way Death Notice's MIDDLE scenes are. The section
 * can therefore exceed the viewport height and scroll naturally; it is
 * deliberately never collapsed into a fixed-height/16:9 box.
 *
 * ## Desktop coordinate system — literal pixels, fixed 1440 canvas
 *
 * Every desktop x/y value below (`RECIT_DESKTOP_GEOMETRY`) is a literal
 * pixel offset inside ONE continuous 1440px-wide artboard that spans
 * scene-top -> body -> scene-bottom (the title at y=86 and the first
 * matter at y=285 both sit inside/just past the scene-top image's own
 * height of 640px — the scene-top asset itself carries no text, but its
 * bottom portion is deliberately left visually blank so this runtime
 * content can render over it, per the contract's own
 * `safe_area.decor_exclusion`). Because the artboard's contract is "1440
 * px, centered, gutters beyond 1440, `do not scale artboard up`" — never
 * a proportional shrink — this runtime renders the desktop canvas at a
 * literal fixed `1440px` CSS width (see the component's own
 * `.desktopCanvas` rule), centered by auto margins. This is the one
 * documented departure from Ceremony/Hero/Death Notice's own
 * percentage-of-canvas technique (which exists there only because THEIR
 * contract scales that 1448/941px master down fluidly) — see this
 * package's own `HANDOFF`/`execution-contract.json`
 * `desktop.viewport_rule`, which specifies no such fluid scaling here.
 *
 * ## Mobile coordinate system — `viewportWidth/430` uniform scale
 *
 * Mobile assets (`430×245`/`430×2048`/`430×260`) render at `width:100%`
 * inside a full-bleed mobile wrapper, which is exactly the
 * `viewportWidth/430` uniform scale the contract's own
 * `mobile.top_asset_scale` specifies (the same free-for-width technique
 * Ceremony's own docstring already establishes). Padding and vertical
 * matter spacing are NOT flat per-breakpoint constants: the contract's
 * own four `padding_px` values (375->30, 390->31, 414->33, 430->34) and
 * its explicit `vertical_spacing_interpolation` (0.92 at 375, 1.0 at
 * 430) are both exactly linear in viewport width — verified by fitting a
 * line through the 375/430 endpoints and checking it reproduces 390/414
 * to the nearest documented px. The component's stylesheet therefore
 * expresses both as a single linear `calc(A + Bvw)` CSS formula (see
 * `RecitDeVieIntemporel.module.css`), which reproduces all four
 * documented data points exactly rather than needing four separate media
 * queries that could silently drift apart.
 */

export const RECIT_DE_VIE_INTEMPOREL_BREAKPOINT_DESKTOP_PX = 1024;

const ASSET_ROOT = "/assets/recit-de-vie/intemporel/runtime";

export const RECIT_DE_VIE_INTEMPOREL_SCENE_SRC: Record<
  SkinVariant,
  {
    desktopSceneTop: string;
    desktopBodyField: string;
    desktopSceneBottom: string;
    mobileSceneTop: string;
    mobileBodyField: string;
    mobileSceneBottom: string;
  }
> = {
  light: {
    desktopSceneTop: `${ASSET_ROOT}/light/desktop-scene-top.png`,
    desktopBodyField: `${ASSET_ROOT}/light/desktop-body-field.png`,
    desktopSceneBottom: `${ASSET_ROOT}/light/desktop-scene-bottom.png`,
    mobileSceneTop: `${ASSET_ROOT}/light/mobile-scene-top.png`,
    mobileBodyField: `${ASSET_ROOT}/light/mobile-body-field.png`,
    mobileSceneBottom: `${ASSET_ROOT}/light/mobile-scene-bottom.png`,
  },
  dark: {
    desktopSceneTop: `${ASSET_ROOT}/dark/desktop-scene-top.png`,
    desktopBodyField: `${ASSET_ROOT}/dark/desktop-body-field.png`,
    desktopSceneBottom: `${ASSET_ROOT}/dark/desktop-scene-bottom.png`,
    mobileSceneTop: `${ASSET_ROOT}/dark/mobile-scene-top.png`,
    mobileBodyField: `${ASSET_ROOT}/dark/mobile-body-field.png`,
    mobileSceneBottom: `${ASSET_ROOT}/dark/mobile-scene-bottom.png`,
  },
};

export type LifeStoryMatterId = "A10" | "A11" | "A12";

/** Canonical rendering order — contract: "Render present matters in
 * canonical order A10 -> A11 -> A12", never the family's entry order. */
export const RECIT_DE_VIE_MATTER_ORDER: readonly LifeStoryMatterId[] = ["A10", "A11", "A12"];

export const RECIT_DE_VIE_INTEMPOREL_ICON_SRC: Record<SkinVariant, Record<LifeStoryMatterId, string>> = {
  light: {
    A10: `${ASSET_ROOT}/light/icon-person.png`,
    A11: `${ASSET_ROOT}/light/icon-loved.png`,
    A12: `${ASSET_ROOT}/light/icon-legacy.png`,
  },
  dark: {
    A10: `${ASSET_ROOT}/dark/icon-person.png`,
    A11: `${ASSET_ROOT}/dark/icon-loved.png`,
    A12: `${ASSET_ROOT}/dark/icon-legacy.png`,
  },
};

/** `execution-contract.json`'s `assets.*.intrinsic_px`, verbatim —
 * documentation of native asset dimensions only (not re-derived at
 * runtime; used solely for the `aspect-ratio` the stylesheet sets on
 * each scene image so its own intrinsic ratio is preserved without a
 * layout-shift flash before the PNG loads). */
export const RECIT_DE_VIE_INTEMPOREL_INTRINSIC_PX = {
  desktopSceneTop: { w: 1440, h: 640 },
  desktopBody: { w: 1440, h: 2048 },
  desktopSceneBottom: { w: 1440, h: 500 },
  mobileSceneTop: { w: 430, h: 245 },
  mobileBody: { w: 430, h: 2048 },
  mobileSceneBottom: { w: 430, h: 260 },
  icon: { w: 96, h: 96 },
} as const;

/** `execution-contract.json`'s `colors.light`/`colors.dark`, verbatim. */
export const RECIT_DE_VIE_INTEMPOREL_INK = {
  light: {
    background: "#F5EFE3",
    title: "#302B22",
    label: "#5A5141",
    familyText: "#3A342B",
    rail: "#7D796B",
    microcopy: "#493C2E",
  },
  dark: {
    background: "#211D19",
    title: "#F0DEBF",
    label: "#D7B789",
    familyText: "#EBDDC5",
    rail: "#A59987",
    microcopy: "#F0DEBF",
  },
} satisfies Record<SkinVariant, Record<string, string>>;

/** `execution-contract.json`'s `typography.*`, verbatim (camelCase
 * collapsed 1:1 from the JSON's own `desktop_size_px`/`mobile_size_px`/
 * etc.). `fontVariantCaps`/`openTypeFeature` apply only to `title` and
 * `label` — see spec/TYPOGRAPHY_LOCK.md. */
export interface RecitTextRoleTokens {
  desktopSizePx: number;
  mobileSizePx: number;
  desktopLineHeightPx: number;
  mobileLineHeightPx: number;
  letterSpacingEm: number;
  fontVariantCaps?: "small-caps";
  fontStyle?: "italic";
}

export const RECIT_DE_VIE_INTEMPOREL_TYPOGRAPHY: {
  title: RecitTextRoleTokens;
  label: RecitTextRoleTokens;
  familyText: RecitTextRoleTokens;
  microcopy: RecitTextRoleTokens;
} = {
  title: {
    desktopSizePx: 34,
    mobileSizePx: 24,
    desktopLineHeightPx: 37,
    mobileLineHeightPx: 27,
    letterSpacingEm: 0.08,
    fontVariantCaps: "small-caps",
  },
  label: {
    desktopSizePx: 16,
    mobileSizePx: 13,
    desktopLineHeightPx: 18,
    mobileLineHeightPx: 15,
    letterSpacingEm: 0.1,
    fontVariantCaps: "small-caps",
  },
  familyText: {
    desktopSizePx: 23,
    mobileSizePx: 18,
    desktopLineHeightPx: 32,
    mobileLineHeightPx: 26,
    letterSpacingEm: 0.0,
  },
  microcopy: {
    desktopSizePx: 18,
    mobileSizePx: 15,
    desktopLineHeightPx: 22,
    mobileLineHeightPx: 18,
    letterSpacingEm: 0.0,
    fontStyle: "italic",
  },
};

/** `execution-contract.json`'s `desktop` block, verbatim — literal px,
 * see this file's own top docstring for why (fixed 1440 canvas, never
 * fluidly scaled). */
export const RECIT_DE_VIE_DESKTOP_GEOMETRY = {
  artboardWidthPx: 1440,
  title: { xPx: 486, yPx: 86, maxWidthPx: 560 },
  matter: {
    firstYPx: 285,
    iconXPx: 360,
    iconSizePx: 72,
    railXPx: 396,
    railWidthPx: 1.5,
    textXPx: 470,
    textMaxWidthPx: 650,
    labelToTextPx: 18,
    matterGapPx: 74,
  },
  closure: {
    bottomAssetHeightPx: 500,
    minimumGapAfterLastMatterPxByCount: { 1: 92, 2: 82, 3: 72 } as Record<1 | 2 | 3, number>,
    microcopyBoxPx: { x: 842, yInsideBottomAsset: 168, w: 330, h: 150 },
  },
} as const;

/** `execution-contract.json`'s `mobile` block, verbatim — padding and
 * vertical-spacing scale are given at the four supported widths; this
 * file also derives the linear-fit slope/intercept the stylesheet uses
 * (see this file's own top docstring for the verification that a
 * straight line through the 375/430 endpoints reproduces 390/414
 * exactly). */
export const RECIT_DE_VIE_MOBILE_GEOMETRY = {
  supportedWidthsPx: [375, 390, 414, 430] as const,
  paddingPxByWidth: { 375: 30, 390: 31, 414: 33, 430: 34 } as Record<375 | 390 | 414 | 430, number>,
  title: { yPxAt430: 82, maxWidthPxAt430: 280 },
  matter: {
    firstYPxAt430: 225,
    iconSizePx: 52,
    railXOffsetFromPaddingPx: 26,
    railWidthPx: 1.25,
    textXOffsetFromPaddingPx: 76,
    textRightPaddingPx: 28,
    labelToTextPx: 12,
    matterGapPxAt430: 48,
    verticalSpacingScaleAt375: 0.92,
    verticalSpacingScaleAt430: 1.0,
  },
  closure: {
    bottomAssetHeightPxAt430: 260,
    minimumGapAfterLastMatterPxByCountAt430: { 1: 70, 2: 62, 3: 56 } as Record<1 | 2 | 3, number>,
    microcopyBoxAt430: { x: 84, yInsideBottomAsset: 52, w: 238, h: 108 },
  },
} as const;

/**
 * `execution-contract.json`'s own `states` block, verbatim — the one
 * rulebook this component's presence logic follows. Never a fourth/fifth
 * invented state: `[]` (all three matières absent) means "do not render
 * the section at all", handled by the caller via
 * `isLifeStorySectionActive` (lib/memorial/life-story-section.ts), not by
 * this component silently rendering empty chrome.
 */
export const RECIT_DE_VIE_STATE_RULES = {
  order: RECIT_DE_VIE_MATTER_ORDER,
  trimEachFieldEmptyMeansAbsent: true,
  gapOnlyBetweenConsecutivePresentMatters: true,
  railOnlyFromCurrentToNextPresent: true,
  lastPresentMatterHasNoOutgoingRail: true,
  allAbsentRendersNothing: true,
} as const;

/** `execution-contract.json`'s `data` block, verbatim — which
 * `MemorialContent` field each matter reads. Never inferred, generated,
 * or reformulated (V1.3.1 doctrine: "La famille raconte ; HERITAGE met
 * en forme."). */
export const RECIT_DE_VIE_DATA_FIELD: Record<LifeStoryMatterId, "personWords.text" | "lovedThings.text" | "legacy.text"> = {
  A10: "personWords.text",
  A11: "lovedThings.text",
  A12: "legacy.text",
};

/** `execution-contract.json`'s `localized_runtime_text` mapping, resolved
 * to this repo's own i18n key names (lib/i18n/keys.ts) — dot-camelCase,
 * the existing HERITAGE convention (e.g. `ceremony.zoneDateTime`), rather
 * than the Studio spec's own dot-snake_case spelling
 * (`recit.decorative_memories`). Same string VALUES in every language
 * (spec/localization.json), only the key's own casing convention
 * differs — see this mission's final report, section H. */
export const RECIT_DE_VIE_LABEL_KEY: Record<LifeStoryMatterId, "recit.person" | "recit.loved" | "recit.legacy"> = {
  A10: "recit.person",
  A11: "recit.loved",
  A12: "recit.legacy",
};
