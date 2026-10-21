import type { Language } from "@/config/languages";
import type { SectionId } from "@/config/sections";

/**
 * Rubriques whose HERITAGE texts are validated in some languages only.
 * A section listed here is assembled — and offered in « Gérer les
 * rubriques visibles » — only in those languages; elsewhere it does not
 * exist for the family (the adapter refuses `textUnavailable`). A section
 * absent from this table is available in every language.
 *
 * - symbolicOfferings: the official confirmations are French only
 *   (EN/ES wording still to be validated by the QG).
 */
const SECTION_LANGUAGES: Readonly<Partial<Record<SectionId, readonly Language[]>>> = {
  symbolicOfferings: ["fr"],
};

export function isSectionAvailableInLanguage(sectionId: SectionId, language: Language): boolean {
  return SECTION_LANGUAGES[sectionId]?.includes(language) ?? true;
}
