import type { SectionId } from "./sections";
import type { Skin } from "./skins";

/**
 * Fondation Memorial assemblé — which real Memorial renderer exists for a
 * given section × skin.
 *
 * Pure data, no React: the values are renderer KEYS, not components. The
 * future assembler maps a key to its component; this file only answers
 * "is there a validated renderer for this section in this skin?", so the
 * composition model (lib/memorial/composition/compose-memorial.ts) can
 * tell "ready but no renderer" apart from "renderable" without importing
 * any UI.
 *
 * Every entry names a renderer that already exists on `main` under
 * components/memorial/. A section or skin absent from this table has NO
 * renderer — the composition fails closed on it (`noRenderer`), it never
 * substitutes another skin's renderer.
 *
 *  - `deathNotice` → `DeathNoticeV2`: l'Avis de décès V2, the four
 *    validated variants (Mobile Light/Dark, Desktop Light/Dark 1 + 4),
 *    drawn as is from `components/memorial/death-notice/v2/`. The V1
 *    renderer `DeathNoticeIntemporel` stays registered: switching this
 *    one line back to it is the whole rollback.
 *  - `story` → `RecitDeVieV2`: the Récit de vie V2 (A10/A11/A12, Mobile
 *    and Desktop, LIGHT = bleu pétrole / DARK = ivoire-champagne). The V1
 *    renderer `RecitDeVieIntemporel` stays registered: switching this one
 *    line back to it is the whole rollback.
 *  - `traditions` → `TraditionsV2` (M1): Traditions & repères V2, the four
 *    validated variants (Mobile/Desktop × Light/Dark), drawn as is from
 *    `components/memorial/traditions/v2/`. Whether it applies is still
 *    decided by section-selection (A00, the family's own entries).
 *  - `ceremony` → `CeremonyV2`: the C5 renderer. Mobile Light/Dark and
 *    Desktop Light are validated; the existing Desktop Dark tokens stay
 *    explicitly `provisional` and are used as the transitional continuity
 *    rendering without any new artistic decision. V1 stays registered for
 *    rollback.
 *  - `gallery` → `GalleryIntemporel` (dettes D2–D4): the product host of
 *    the validated A13 Desktop runtime (Gallery, Viewer, Full Album).
 *  - `symbolicOfferings` → `SymbolicOfferingsV1Section` (M3): the twelve
 *    validated compositions and the M2 animations (`SymbolicOfferingsV1`),
 *    drawn as is from `components/memorial/symbolic-offerings/v1/`. BUILDER PREVIEW ONLY:
 *    the renderer draws nothing outside the Preview's offerings context
 *    (no visitor gesture is ever public before its persistence exists).
 *  - `testimonials`, `condolences`, `video`, `memoryMessage`: no renderer
 *    exists yet — deliberately absent.
 *
 * Known duplication, not resolved here: `DeathNoticePreviewStep`'s own
 * internal `A03_BUILT_SKINS` (A03 Reveal) states the same fact as the
 * `deathNotice` row below. Consolidating it would mean touching A03,
 * which is out of scope for this foundation.
 */
export const RENDERER_KEYS = [
  "HeroIntemporel",
  "DeathNoticeIntemporel",
  "DeathNoticeV2",
  "CeremonyIntemporel",
  "CeremonyV2",
  "RecitDeVieIntemporel",
  "RecitDeVieV2",
  "TraditionsV2",
  "GalleryIntemporel",
  "SymbolicOfferingsV1Section",
] as const;

export type RendererKey = (typeof RENDERER_KEYS)[number];

export const SECTION_RENDERERS: Readonly<
  Partial<Record<SectionId, Readonly<Partial<Record<Skin, RendererKey>>>>>
> = {
  hero: { intemporel: "HeroIntemporel" },
  deathNotice: { intemporel: "DeathNoticeV2" },
  ceremony: { intemporel: "CeremonyV2" },
  story: { intemporel: "RecitDeVieV2" },
  traditions: { intemporel: "TraditionsV2" },
  gallery: { intemporel: "GalleryIntemporel" },
  symbolicOfferings: { intemporel: "SymbolicOfferingsV1Section" },
};

/** The renderer for this section in this skin, or `null` when none
 * exists (including an unresolved skin). Never falls back to another
 * skin. */
export function resolveSectionRenderer(sectionId: SectionId, skin: Skin | null): RendererKey | null {
  if (skin === null) return null;
  return SECTION_RENDERERS[sectionId]?.[skin] ?? null;
}
