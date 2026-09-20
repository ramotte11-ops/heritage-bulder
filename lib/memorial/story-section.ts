import type { EditorialContext } from "@/config/memorial";
import type { MemorialContent } from "@/types/memorial";
import { readPersonWords } from "./person-words";
import { readLovedThings } from "./loved-things";
import { readLegacy } from "./legacy";
import { isSectionApplicable, resolveSectionSelectionStatus } from "./section-selection";

/**
 * "Récit de vie" Memorial integration — the one question a future
 * Memorial page asks before mounting `StoryIntemporel`: "is the Récit de
 * vie section genuinely pertinent right now?"
 *
 * Deliberately NOT a second decision: `lib/memorial/section-selection.ts`
 * (Mission 027) already reserves the `story` `SectionId` for exactly this
 * ("gallery, story, traditions, ..." are its own docstring's own example
 * of the generic content signal, `explicitContentSectionIds`) — this
 * function is a thin, framework-free composition over that existing
 * mechanism, mirroring `lib/memorial/ceremony-section.ts`'s
 * `isCeremonySectionActive` shape exactly.
 *
 * Unlike Ceremony (whose relevance is tied to A04's own flow ANSWER),
 * "story" is one of the sections that reads the generic CONTENT signal —
 * it has real matter the moment at least one of the three Récit de vie
 * matières (A10 `content.personWords.text`, A11 `content.lovedThings.text`,
 * A12 `content.legacy.text`) is genuinely non-null. This mirrors
 * `absence-rules.json`'s own rule from the Studio package: "If all three
 * are absent, the entire Récit de vie section does not render" — the
 * exact same rule, expressed once here rather than duplicated inside the
 * renderer's own render-nothing branch (`StoryIntemporel.tsx` reads
 * these same three fields itself, fail-safe, for the identical reason
 * `CeremonyIntemporel.tsx` re-reads `content.ceremony` itself rather than
 * trusting a caller's already-computed boolean).
 */
export function hasStoryContent(content: MemorialContent): boolean {
  return (
    readPersonWords(content).text !== null ||
    readLovedThings(content).text !== null ||
    readLegacy(content).text !== null
  );
}

export function isStorySectionActive(
  editorialContext: EditorialContext,
  content: MemorialContent,
): boolean {
  const explicitContentSectionIds = hasStoryContent(content) ? (["story"] as const) : [];
  return isSectionApplicable(
    resolveSectionSelectionStatus("story", { editorialContext, explicitContentSectionIds }),
  );
}
