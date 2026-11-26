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
 * - video (VID-08): French only until the PO validates EN/ES.
 */
const SECTION_LANGUAGES: Readonly<Partial<Record<SectionId, readonly Language[]>>> = {
  symbolicOfferings: ["fr", "en", "es"],
  // VID-08 : titre et sous-titre officiels validés en français (VID-02) ;
  // les traductions EN/ES de components/memorial/video/texts.ts restent
  // des propositions à valider par la PO avant toute publication.
  video: ["fr"],
};

export function isSectionAvailableInLanguage(sectionId: SectionId, language: Language): boolean {
  return SECTION_LANGUAGES[sectionId]?.includes(language) ?? true;
}
