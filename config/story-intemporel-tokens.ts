import type { SkinVariant } from "@/config/skins";

/**
 * "Récit de vie" Intemporel RUNTIME tokens — Studio pack
 * `RECIT_DE_VIE_STUDIO_RUNTIME_V1_1` (STATUT: QG-declared GREEN/
 * CANONIQUE in the mission brief; the package's own `MANIFEST.json`/
 * `spec/geometry.json` still carry the Studio's own internal
 * `"QG_REVIEW_CANDIDATE"` label from before that sign-off — informational
 * only, not acted on here). Every 51 files in the package were verified
 * byte-for-byte against its own `MANIFEST.json` SHA-256 list before a
 * single PNG was copied into `public/assets/story/intemporel/runtime/`
 * (renamed `<decor>-<theme>.png` -> `<theme>/<decor>.png`, content
 * untouched — see that directory).
 *
 * ## Architecturally NOT `single_scene_per_variant` (Ceremony/Hero) NOR
 * `SCENE TOP/MIDDLE×N/BOTTOM` raster tiling (Death Notice)
 *
 * The package's own `spec/geometry.json` names a THIRD architecture,
 * `FRAME_TOP + FLOW_BODY + FRAME_BOTTOM`, explicitly chosen over both
 * existing patterns ("Elle remplace ici toute idée de hauteur fixe ou de
 * MIDDLE × N rasterisé" — mission brief). Concretely:
 *
 *  - FRAME TOP / FRAME BOTTOM are ordinary, non-repeating decorative
 *    PNGs (the botanical/seal/sprig/editorial-note assets), positioned
 *    once each — never percentage-boxed against a fixed canonical
 *    canvas the way Hero/Ceremony/Death Notice position their zones.
 *  - FLOW BODY is NOT a raster at all beyond its own seamless, infinitely
 *    repeatable paper tile (`body-tile.png`, a 512×512 CSS
 *    `background-repeat` tile — `layer-contract.json`: "repeatable,
 *    text-free, icon-free, botanical-free"). Every actual runtime layer
 *    inside it (title, icons, labels, family text, rails) is ordinary
 *    responsive HTML/CSS in normal document flow, so the section's
 *    height is simply `height: auto` — genuinely unbounded, never a
 *    shrink-to-fit/line-clamp technique (`responsive.json`: "no
 *    clipping/ellipsis/line limit").
 *
 * This is why this file carries none of `config/ceremony-intemporel-
 * tokens.ts`'s own `CANONICAL_DIMENSIONS`/`pxBoxToPct` machinery: the
 * package's `spec/geometry.json` itself gives real, direct CSS pixel
 * values (a reference desktop width, real `x_start_px`/`max_width_px`
 * paddings, real per-mobile-width horizontal paddings) rather than a
 * fixed illustration canvas to divide into percentages.
 *
 * ## Ink colors — sampled, not spec'd
 *
 * The package ships no `spec/colors.json`/ink-token file (unlike
 * Ceremony's `runtime-tokens.json`). `STORY_INTEMPOREL_INK` below was
 * obtained by a pixel-histogram sample of the package's own
 * `qa/desktop/desktop-{light,dark}-3-matieres.png` proofs (the dominant
 * near-black/near-cream pixel in a body-text region = primary ink; the
 * dominant warm brown/tan pixel in a small-caps label region =
 * secondary ink) — reported to QG as an assumption, not invented
 * freehand, and correctable without any architecture change if QG
 * supplies an exact hex reference later.
 *
 * ## Typography — no font named either
 *
 * The package specifies no `fontFamily` token. This file reuses
 * `components/builder/fonts.ts`'s already-integrated `ebGaramond` (EB
 * Garamond) — the Intemporel skin's own established serif for the
 * closest sibling section, `CeremonyIntemporel` — rather than
 * introducing a new, unreviewed typeface (mission brief section 2: "pas
 * de nouvelle direction artistique"). Also flagged to QG as an
 * assumption.
 */

export const STORY_INTEMPOREL_BREAKPOINT_DESKTOP_PX = 960;

const ASSET_ROOT = "/assets/story/intemporel/runtime";

export interface StoryIntemporelAssetSrc {
  bodyTile: string;
  botanicalDesktopLeft: string;
  botanicalDesktopRight: string;
  botanicalMobileTop: string;
  botanicalMobileBottom: string;
  editorialNote: string;
  seal: string;
  sprig: string;
  iconPerson: string;
  iconLoved: string;
  iconLegacy: string;
}

function assetsFor(theme: SkinVariant): StoryIntemporelAssetSrc {
  const root = `${ASSET_ROOT}/${theme}`;
  return {
    bodyTile: `${root}/body-tile.png`,
    botanicalDesktopLeft: `${root}/botanical-desktop-left.png`,
    botanicalDesktopRight: `${root}/botanical-desktop-right.png`,
    botanicalMobileTop: `${root}/botanical-mobile-top.png`,
    botanicalMobileBottom: `${root}/botanical-mobile-bottom.png`,
    editorialNote: `${root}/editorial-note.png`,
    seal: `${root}/seal.png`,
    sprig: `${root}/sprig.png`,
    iconPerson: `${root}/icon-person.png`,
    iconLoved: `${root}/icon-loved.png`,
    iconLegacy: `${root}/icon-legacy.png`,
  };
}

export const STORY_INTEMPOREL_ASSET_SRC: Record<SkinVariant, StoryIntemporelAssetSrc> = {
  light: assetsFor("light"),
  dark: assetsFor("dark"),
};

/** Sampled from the package's own QA proofs — see this file's top
 * docstring. */
export const STORY_INTEMPOREL_INK: Record<SkinVariant, { textPrimary: string; textSecondary: string }> = {
  light: { textPrimary: "#2c281f", textSecondary: "#6e5a43" },
  dark: { textPrimary: "#f1e5cf", textSecondary: "#decaa8" },
};

/** `spec/geometry.json`'s own `desktop` block, transcribed verbatim. */
export const STORY_INTEMPOREL_DESKTOP_GEOMETRY = {
  referenceWidthPx: 1440,
  xStartPx: 365,
  maxWidthPx: 800,
  textColumnMaxWidthPx: 650,
  iconRailWidthPx: 72,
  iconToTextGapPx: 38,
  labelToTextPx: 18,
  matterGapPx: 72,
} as const;

/** `spec/geometry.json`'s own `mobile` block, transcribed verbatim —
 * `horizontalPaddingPx` keyed by the exact supported width. */
export const STORY_INTEMPOREL_MOBILE_GEOMETRY = {
  supportedWidthsPx: [375, 390, 414, 430] as const,
  horizontalPaddingPx: { 375: 28, 390: 30, 414: 32, 430: 34 } as const,
  iconPx: 50,
  labelToTextPx: 14,
  matterGapPx: 48,
} as const;

/** `spec/geometry.json`'s own `growth` block. */
export const STORY_INTEMPOREL_GROWTH = {
  minimumAfterLastMatterPx: { desktop: 86, mobile: 56 },
} as const;

/** A10/A11/A12, in `spec/absence-rules.json`'s own canonical `order` —
 * this array's order IS the render order, and the one place that maps
 * each matière to its icon + i18n label key. `StoryIntemporel.tsx` walks
 * this array rather than hand-listing three near-identical blocks, so a
 * future matière could not silently fall out of sync between icon,
 * label and read function. */
export const STORY_INTEMPOREL_MATTERS = [
  { id: "A10", labelKey: "story.person", iconKey: "iconPerson" },
  { id: "A11", labelKey: "story.loved", iconKey: "iconLoved" },
  { id: "A12", labelKey: "story.legacy", iconKey: "iconLegacy" },
] as const;
