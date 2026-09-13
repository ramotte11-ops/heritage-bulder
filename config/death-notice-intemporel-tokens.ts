import type { SkinVariant } from "@/config/skins";

/**
 * Mission 039B — the Death Notice Intemporel A03 asset tokens.
 *
 * Where the Studio's own asset packs actually live once copied into
 * `public/` — one constant per asset, checksummed against each pack's own
 * `CHECKSUMS.sha256` before copying (see the mission reports), never
 * re-drawn or approximated. Mirrors `config/hero-intemporel-tokens.ts`'s
 * own "one file, one source of truth for asset paths" discipline, kept in
 * its own file rather than folded into the Hero's tokens — the Death
 * Notice preview (A03) is its own editorial artifact, structurally
 * independent of the Hero renderer, even though both currently render
 * only the `intemporel` skin (see this codebase's own `AGENTS.md` section
 * 12: keep content and skin decoration separable so a future skin can add
 * its own equivalent file without touching this one).
 *
 * Unlike the Hero's runtime masters, these packs carry no baked family
 * text and no fixed-canvas manifest coordinates to transcribe — every
 * asset here is a small, independently-placed decorative element (a
 * texture tile, two peripheral botanicals, a seal, an ornament branch),
 * composed by `DeathNoticeIntemporel.tsx` itself rather than positioned
 * against Studio-given pixel geometry.
 *
 * ## Mission 039B correction — Light/Dark (`HERITAGE_A03_DARK_PACK_V2_QG_FINAL`)
 *
 * The original `HERITAGE_A03_ASSETS_V1` mini-pack shipped one
 * ivory-paper (`light`) treatment only. The QG-final Dark pack
 * (`HERITAGE_A03_DARK_PACK_V2_QG_FINAL.zip` — its own README: "REMPLACE
 * intégralement HERITAGE_A03_DARK_PACK_V1... ne pas mélanger avec les
 * références ou la texture de V1") supplies the five equivalents below
 * for the `dark` variant: a corrected, seamlessly-repeatable anthracite
 * paper texture, two Dark botanicals, a Dark-toned seal, and a Dark
 * ornament branch. Every one of the five is now keyed by `SkinVariant`
 * (`Record<SkinVariant, string>`), mirroring
 * `HERO_INTEMPOREL_RUNTIME_MASTER_SRC`'s own light/dark shape — no
 * `filter`, no CSS inversion, no recoloring of the Light assets to fake
 * a Dark look anywhere in this codebase (see `DeathNoticeIntemporel.tsx`'s
 * own docstring).
 *
 * `precisionIcons` stays variant-INDEPENDENT on purpose: the Dark pack's
 * own README is explicit ("les icônes de blocs ne sont pas dupliquées
 * ici : réutiliser les icônes runtime déjà validées ... sans inventer de
 * nouveaux assets") — no second icon set exists or should be fabricated.
 * The exact same five pictogram files are reused for both variants;
 * `DeathNoticeIntemporel.tsx` is what makes them legible against either
 * paper tone (a CSS `mask-image` tint to the current ink color — a
 * generic, single-color pictogram being recolored to match surrounding
 * text, never an approximation of Studio-authored artwork).
 */

export const DEATH_NOTICE_INTEMPOREL_ASSETS = {
  /** Repeatable paper texture — `background-repeat`, never stretched
   * vertically (asset READMEs' own instruction, both packs). The Dark
   * tile is the QG-corrected one, validated seamless at variable section
   * height. */
  paperTile: {
    light: "/assets/death-notice/intemporel/paper-background-tile.png",
    dark: "/assets/death-notice/intemporel/paper-background-dark.png",
  } satisfies Record<SkinVariant, string>,
  /** Peripheral botanical decoration, left/right of the composition —
   * absolutely positioned, out of the content flow, never fixing the
   * section's height (asset READMEs' own instruction). */
  botanicalLeft: {
    light: "/assets/death-notice/intemporel/botanical-left.png",
    dark: "/assets/death-notice/intemporel/botanical-left-dark.png",
  } satisfies Record<SkinVariant, string>,
  botanicalRight: {
    light: "/assets/death-notice/intemporel/botanical-right.png",
    dark: "/assets/death-notice/intemporel/botanical-right-dark.png",
  } satisfies Record<SkinVariant, string>,
  /** The HERITAGE medallion seal, centered at the foot of the
   * composition — decorative only. */
  seal: {
    light: "/assets/death-notice/intemporel/seal-heritage.png",
    dark: "/assets/death-notice/intemporel/seal-heritage-dark.png",
  } satisfies Record<SkinVariant, string>,
  /** The small ornamental branch under the "Avis de décès" title. */
  ornamentBranch: {
    light: "/assets/death-notice/intemporel/ornament-branch.png",
    dark: "/assets/death-notice/intemporel/ornament-branch-dark.png",
  } satisfies Record<SkinVariant, string>,
  /** One pictogram per A02 precision, keyed by the exact
   * `DeathNoticePrecisionField` it illustrates (types/death-notice.ts) —
   * never a second, independently-ordered icon list, and never a second
   * (Dark) icon file — see this file's own docstring. */
  precisionIcons: {
    generalLocation: "/assets/death-notice/intemporel/icon-location.png",
    familyMessage: "/assets/death-notice/intemporel/icon-family.png",
    thought: "/assets/death-notice/intemporel/icon-thought.png",
    quote: "/assets/death-notice/intemporel/icon-quote.png",
    other: "/assets/death-notice/intemporel/icon-other.png",
  },
} as const;
