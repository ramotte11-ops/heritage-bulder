import type { EditorialContext } from "@/config/memorial";
import type { MemorialContent } from "@/types/memorial";
import { readPersonWords } from "./person-words";
import { readLovedThings } from "./loved-things";
import { readLegacy } from "./legacy";
import { isSectionApplicable, resolveSectionSelectionStatus } from "./section-selection";

/**
 * Récit de vie Runtime V1.3.1 — the one question a future Memorial page
 * asks before mounting `RecitDeVieIntemporel`: "is the Récit de vie
 * section genuinely pertinent right now?"
 *
 * Mission brief section 13's own signal is explicit and different from
 * Ceremony's: not a Guided Flow answer (there is no "A10/A11/A12 wanted?"
 * question), but plain content presence — "au moins une matière
 * réellement présente parmi A10/A11/A12" — exactly the generic
 * `explicitContentSectionIds` signal `lib/memorial/section-selection.ts`
 * already defines for every optional section that isn't Ceremony
 * (that module's own docstring: "the *consequence* of content that
 * already exists... a story written"). `config/sections.ts` already
 * reserves the `"story"` `SectionId` for exactly this content (A10's own
 * type docstring: "Ce futur composé... peut lire cette clé — et celles
 * d'A11/A12 — sans que cette mission n'ait pré-décidé de leur
 * composition"). This function is the composition that decision left
 * open: it reads A10/A11/A12 through their own fail-safe `read*`
 * functions (never throws on corrupted content), and feeds "story" into
 * `resolveSectionSelectionStatus` exactly the way any other caller would
 * feed in a real content signal — never a second, parallel "is there a
 * life story" flag invented for the Memorial side (mission brief
 * section 13: "ne pas dupliquer la logique... ne pas créer une deuxième
 * vérité produit").
 */

/** Trimmed, non-blank text only — mirrors every `read*Words`/`readLoved
 * Things`/`readLegacy` fail-safe read's own "blanks-only normalizes to
 * null" rule, so a `text` that is technically a non-null string of only
 * whitespace never counts as "present" here either. */
function isPresentText(text: string | null): boolean {
  return text !== null && text.trim() !== "";
}

/**
 * Which of A10/A11/A12 currently have real, non-blank family text, in
 * canonical order. The one place this mission computes "matter
 * presence" — the renderer and the section-activity check below both
 * read this same function rather than re-deriving it independently.
 */
export function presentLifeStoryMatterIds(content: MemorialContent): ("A10" | "A11" | "A12")[] {
  const ids: ("A10" | "A11" | "A12")[] = [];
  if (isPresentText(readPersonWords(content).text)) ids.push("A10");
  if (isPresentText(readLovedThings(content).text)) ids.push("A11");
  if (isPresentText(readLegacy(content).text)) ids.push("A12");
  return ids;
}

/** `true` the moment at least one of A10/A11/A12 has real text — the
 * exact "au moins une matière réellement présente" signal the mission
 * brief specifies, never a stricter "all three" or a looser "the sheet
 * was visited" reading. */
export function hasLifeStoryMatter(content: MemorialContent): boolean {
  return presentLifeStoryMatterIds(content).length > 0;
}

/**
 * Is the Récit de vie section genuinely pertinent for this editorial
 * context and this content? Composed over the existing
 * `resolveSectionSelectionStatus("story", ...)` mechanism — never a
 * bespoke rule — so `story` being absent from `remembrance`'s
 * `EDITORIAL_CONTEXT_SECTIONS` entry, or "core" there, is honored for
 * free, exactly like every other section.
 */
export function isLifeStorySectionActive(
  editorialContext: EditorialContext,
  content: MemorialContent,
): boolean {
  const hasMatter = hasLifeStoryMatter(content);
  return isSectionApplicable(
    resolveSectionSelectionStatus("story", {
      editorialContext,
      explicitContentSectionIds: hasMatter ? ["story"] : [],
    }),
  );
}
