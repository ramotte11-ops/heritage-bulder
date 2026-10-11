import type { SectionId } from "@/config/sections";
import type { MemorialComposition } from "@/lib/memorial/composition/compose-memorial";
import { ARCHIVABLE_SECTIONS, isHideableSection } from "@/lib/memorial/section-visibility";

/**
 * « Gérer les rubriques visibles » — the rows the family sees, computed
 * server-side from the one composition (`composeMemorial`), so the list
 * can never disagree with what the Preview shows.
 *
 * A row exists for every section the family could hide (never the Hero,
 * only a section with a renderer for the memorial's skin — Traditions
 * joins on its own once its renderer exists) that belongs to THIS
 * memorial: applicable and either shown, hidden, or still being filled
 * in. A section that does not apply (A00 = Non / Plus tard, A04 = Non)
 * or has no matter at all gets no row: hiding it would mean nothing.
 */
export interface SectionVisibilityEntry {
  sectionId: SectionId;
  /** The family hid it (content kept, never shown in the flow). */
  hidden: boolean;
  /** Its block is finished: it shows now, or would if not hidden. */
  ready: boolean;
  /** Death notice, ceremony: once hidden, still consultable behind a
   * discreet link. */
  archivable: boolean;
}

const LISTED_STATES = new Set(["renderable", "hidden", "pending"]);

export function resolveVisibilityEntries(composition: MemorialComposition): SectionVisibilityEntry[] {
  return composition.sections
    .filter((section) => isHideableSection(section.sectionId, composition.skin) && LISTED_STATES.has(section.state))
    .map((section) => ({
      sectionId: section.sectionId,
      hidden: section.hiddenByFamily,
      ready: section.state !== "pending",
      archivable: ARCHIVABLE_SECTIONS.includes(section.sectionId),
    }));
}
