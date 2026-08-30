import type { SectionId } from "@/config/sections";

/**
 * Human-readable labels for the Builder shell UI only.
 *
 * This is NOT the product's i18n system — Mission 003 doesn't build one.
 * A memorial's `language` field (config/languages.ts) is not read here;
 * the Builder shell's own interface text is French, hard-coded, for this
 * mission only. Localizing the Builder itself is a future mission's
 * decision, not implied by this file.
 */
export const SECTION_LABELS: Record<SectionId, string> = {
  hero: "Hero",
  deathNotice: "Avis de décès",
  story: "Son histoire",
  ceremony: "Cérémonie",
  traditions: "Traditions & repères",
  gallery: "Galerie",
  testimonials: "Témoignages",
  condolences: "Condoléances",
  video: "Vidéo",
  memoryMessage: "Laisser un mot",
};
