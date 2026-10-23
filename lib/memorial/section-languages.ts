import type { Language } from "@/config/languages";
import type { SectionId } from "@/config/sections";

/**
 * Rubriques whose HERITAGE texts are validated in some languages only.
 * A section listed here is assembled — and offered in « Gérer les
 * rubriques visibles » — only in those languages; elsewhere it does not
 * exist for the family (the adapter refuses `textUnavailable`). A section
 * absent from this table is available in every language.
 *
 * - symbolicOfferings: FR, EN and ES wordings validated by the QG (F1),
 *   in `components/memorial/symbolic-offerings/v1/texts.ts`. A language
 *   added to `LANGUAGES` later stays without the rubrique until its
 *   wording is validated and listed here.
 */
const SECTION_LANGUAGES: Readonly<Partial<Record<SectionId, readonly Language[]>>> = {
  symbolicOfferings: ["fr", "en", "es"],
};

export function isSectionAvailableInLanguage(sectionId: SectionId, language: Language): boolean {
  return SECTION_LANGUAGES[sectionId]?.includes(language) ?? true;
}
