import type { EditorialContext } from "./memorial";
import type { SectionId } from "./sections";

/**
 * Fondation Memorial assemblé — the canonical order in which an assembled
 * Memorial lists its sections, per editorial context.
 *
 * PROVISOIRE — ordre artistique NON validé par le QG.
 *
 * This is the ONE place the composition model
 * (lib/memorial/composition/compose-memorial.ts) reads section order
 * from. It deliberately does not derive order from anything else:
 *
 *  - not from the Guided Flow (the order in which the family is ASKED
 *    for each matter is a conversation design, not a page layout);
 *  - not from `config/sections.ts`'s `EDITORIAL_CONTEXT_SECTIONS` (Mission
 *    001's catalog, which predates the Studio and remains the source of
 *    WHICH sections exist per context — read through Mission 027's
 *    section-selection, never through this file);
 *  - not from the order components happen to appear in code.
 *
 * The initial values below are a COPY of the only order documented in
 * the repository today (`EDITORIAL_CONTEXT_SECTIONS`), taken as a neutral
 * starting point — not an artistic decision. The QG has explicitly not
 * locked the final order (known conflict: this copy puts `story` before
 * `ceremony`, while the Guided Flow asks for the ceremony first). It will
 * be decided after observing the assembled Memorial; reordering is a
 * change to these two arrays only — no engine or test change needed
 * (memorial-section-order.test.ts only checks each list is an exact
 * permutation of its context's sections).
 */
export const MEMORIAL_SECTION_ORDER: Readonly<Record<EditorialContext, readonly SectionId[]>> = {
  announcement: [
    "hero",
    "deathNotice",
    "story",
    "ceremony",
    "traditions",
    "gallery",
    "testimonials",
    "condolences",
    "video",
  ],
  remembrance: ["hero", "story", "gallery", "testimonials", "memoryMessage", "video"],
};
