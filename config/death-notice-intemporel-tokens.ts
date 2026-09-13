/**
 * Mission 039B — the Death Notice Intemporel A03 asset tokens.
 *
 * Where the Studio's own `HERITAGE_A03_ASSETS_V1` mini-pack actually lives
 * once copied into `public/` — one constant per asset, checksummed against
 * that package's own `CHECKSUMS.sha256` before copying (see the mission
 * report), never re-drawn or approximated. Mirrors
 * `config/hero-intemporel-tokens.ts`'s own "one file, one source of truth
 * for asset paths" discipline, kept in its own file rather than folded
 * into the Hero's tokens — the Death Notice preview (A03) is its own
 * editorial artifact, structurally independent of the Hero renderer, even
 * though both currently render only the `intemporel` skin (see this
 * codebase's own `AGENTS.md` section 12: keep content and skin decoration
 * separable so a future skin can add its own equivalent file without
 * touching this one).
 *
 * Unlike the Hero's runtime masters, this pack carries no baked family
 * text and no fixed-canvas manifest coordinates to transcribe — every
 * asset here is a small, independently-placed decorative element (a
 * texture tile, two peripheral botanicals, a seal, an ornament branch,
 * five line-icon pictograms), composed by `DeathNoticeIntemporel.tsx`
 * itself rather than positioned against Studio-given pixel geometry. No
 * `light`/`dark` split either: the Studio pack shipped one ivory-paper
 * treatment only, so this A03 renderer does not fork on `SkinVariant` the
 * way `HeroIntemporel` does — see that component's own docstring.
 */

export const DEATH_NOTICE_INTEMPOREL_ASSETS = {
  /** Repeatable ivory paper texture — `background-repeat`, never
   * stretched vertically (asset README's own instruction). */
  paperTile: "/assets/death-notice/intemporel/paper-background-tile.png",
  /** Peripheral botanical decoration, left/right of the composition —
   * absolutely positioned, out of the content flow, never fixing the
   * section's height (asset README's own instruction). */
  botanicalLeft: "/assets/death-notice/intemporel/botanical-left.png",
  botanicalRight: "/assets/death-notice/intemporel/botanical-right.png",
  /** The HERITAGE medallion seal, centered at the foot of the
   * composition — decorative only. */
  seal: "/assets/death-notice/intemporel/seal-heritage.png",
  /** The small ornamental branch under the "Avis de décès" title. */
  ornamentBranch: "/assets/death-notice/intemporel/ornament-branch.png",
  /** One pictogram per A02 precision, keyed by the exact
   * `DeathNoticePrecisionField` it illustrates (types/death-notice.ts) —
   * never a second, independently-ordered icon list. */
  precisionIcons: {
    generalLocation: "/assets/death-notice/intemporel/icon-location.png",
    familyMessage: "/assets/death-notice/intemporel/icon-family.png",
    thought: "/assets/death-notice/intemporel/icon-thought.png",
    quote: "/assets/death-notice/intemporel/icon-quote.png",
    other: "/assets/death-notice/intemporel/icon-other.png",
  },
} as const;
