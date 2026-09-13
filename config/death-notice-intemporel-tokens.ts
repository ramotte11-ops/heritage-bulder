import type { SkinVariant } from "@/config/skins";

/**
 * Mission 039B — the Death Notice Intemporel A03 asset tokens.
 *
 * Where the Studio's own asset packs actually live once copied into
 * `public/` — one constant per asset, never re-drawn or approximated.
 * Mirrors `config/hero-intemporel-tokens.ts`'s own "one file, one source
 * of truth for asset paths" discipline, kept in its own file rather than
 * folded into the Hero's tokens — the Death Notice preview (A03) is its
 * own editorial artifact, structurally independent of the Hero renderer,
 * even though both currently render only the `intemporel` skin (see this
 * codebase's own `AGENTS.md` section 12: keep content and skin decoration
 * separable so a future skin can add its own equivalent file without
 * touching this one).
 *
 * ## Mission 039B "intégration finale" — the Runtime Split Pack replaces
 * the earlier CSS-tiled papeterie entirely
 *
 * `HERITAGE_A03_RUNTIME_SPLIT_PACK_V1` is now the SOLE source of the A03
 * sheet's own artistic envelope — torn edges, layered papers, depth,
 * peripheral botanicals, AND the HERITAGE seal are all baked into its
 * three master images per variant:
 *
 *   - `runtimeTop`    — fixed, non-repeating, rendered ONCE at the top
 *     (botanicals + torn edge baked in).
 *   - `runtimeMiddle` — repeated vertically (`background-repeat: repeat-y`)
 *     to fill however much height the family's real content needs —
 *     `DeathNoticeIntemporel.module.css`'s own `.envelopeMiddle`.
 *   - `runtimeBottom` — fixed, non-repeating, rendered ONCE at the
 *     bottom (torn edge + botanicals + THE SEAL baked in).
 *
 * All three masters are 1448×1086 px per the pack's own manifest
 * (`A03_RUNTIME_SPLIT_MANIFEST.csv`) — read before this integration.
 * `README.txt`'s own assembly logic: "TOP + MIDDLE_TILE repeated
 * vertically + BOTTOM". No `CHECKSUMS.sha256` shipped with this
 * particular pack (unlike the earlier Dark V2 pack) — see the mission
 * report for how the copy into `public/` was still verified
 * byte-for-byte reproducible.
 *
 * ## What this REPLACES (Mission 039B "intégration finale" section 3/15)
 *
 * The earlier CSS-tiled paper (`paperTile`) and the separately-composed
 * peripheral botanicals (`botanicalLeft`/`botanicalRight`) and seal
 * (`seal`) are NO LONGER consumed by `DeathNoticeIntemporel.tsx` — all
 * three are now baked into `runtimeTop`/`runtimeMiddle`/`runtimeBottom`,
 * and rendering them separately again would duplicate that exact decor
 * (doubled botanicals, doubled seal — explicitly forbidden). Their PNG
 * files stay physically present in `public/` (removing them carries more
 * risk than benefit and they are unused rather than actively harmful) but
 * are deliberately NOT referenced by this token object anymore — see the
 * mission report's own "orphaned assets" accounting.
 *
 * ## What this KEEPS (Mission 039B "intégration finale" section 4)
 *
 * `ornamentBranch` — the small flourish under the "Avis de décès" title —
 * is part of the DYNAMIC content composition (sits inline with family
 * text, not the sheet's peripheral papeterie) and is NOT part of the
 * Runtime Split Pack; it stays exactly as Mission 039B's earlier
 * correction left it. `precisionIcons` likewise stay untouched and
 * variant-independent — the Dark pack's own README already established
 * "réutiliser les icônes runtime déjà validées ... sans inventer de
 * nouveaux assets", and the Split Pack's own README repeats the same
 * doctrine for these five pictograms explicitly.
 */

export const DEATH_NOTICE_INTEMPOREL_ASSETS = {
  /** Fixed, non-repeating top of the sheet's artistic envelope — torn
   * edge + peripheral botanicals baked in. Rendered exactly once, at its
   * own natural 1448:1086 aspect ratio, NEVER stretched
   * (`DeathNoticeIntemporel.module.css`'s own `.envelopeTop`). */
  runtimeTop: {
    light: "/assets/death-notice/intemporel/runtime-top-light.png",
    dark: "/assets/death-notice/intemporel/runtime-top-dark.png",
  } satisfies Record<SkinVariant, string>,
  /** Repeated vertically to fill exactly as much height as the family's
   * real content needs — `background-repeat: repeat-y`, never
   * redrawn/deformed. May end partially visible at the seam into
   * `runtimeBottom` when the required height doesn't divide evenly into
   * whole tiles — the pack's own README/QG doctrine accepts this
   * explicitly, including its own layered-paper motif repeating on a
   * very long Avis. */
  runtimeMiddle: {
    light: "/assets/death-notice/intemporel/runtime-middle-light.png",
    dark: "/assets/death-notice/intemporel/runtime-middle-dark.png",
  } satisfies Record<SkinVariant, string>,
  /** Fixed, non-repeating bottom of the sheet's artistic envelope — torn
   * edge + peripheral botanicals + THE HERITAGE SEAL, all baked in.
   * Rendered exactly once, at its own natural 1448:1086 aspect ratio,
   * anchored to the sheet's own bottom edge. */
  runtimeBottom: {
    light: "/assets/death-notice/intemporel/runtime-bottom-light.png",
    dark: "/assets/death-notice/intemporel/runtime-bottom-dark.png",
  } satisfies Record<SkinVariant, string>,
  /** The small ornamental branch under the "Avis de décès" title — part
   * of the dynamic content composition, not the sheet's papeterie; see
   * this file's own docstring for why it is deliberately unaffected by
   * the Runtime Split Pack integration. */
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

/** The Runtime Split Pack masters' own shared natural pixel size — every
 * one of the six is exactly this (manifest-confirmed). Not currently
 * consumed for pixel math (the envelope is laid out via `aspect-ratio`/
 * container-query units in CSS, not JS), kept here as the one place this
 * fact is recorded, mirroring how `hero-intemporel-tokens.ts` records its
 * own masters' `dimensionsPx`. */
export const DEATH_NOTICE_INTEMPOREL_RUNTIME_MASTER_SIZE = { width: 1448, height: 1086 } as const;
