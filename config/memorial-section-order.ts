import type { SectionId } from "./sections";

/**
 * Fondation Memorial assemblé — the canonical order in which an assembled
 * Memorial lists its sections.
 *
 * PROVISOIRE — ordre artistique NON validé par le QG.
 *
 * This is the ONE place the composition model
 * (lib/memorial/composition/compose-memorial.ts) reads section order
 * from. It deliberately does not derive order from anything else:
 *
 *  - not from the Guided Flow (the order in which the family is ASKED
 *    for each matter is a conversation design, not a page layout);
 *  - not from `config/sections.ts`'s `MEMORIAL_SECTIONS` (the catalog of
 *    WHICH sections exist — read through Mission 027's section-selection,
 *    never through this file);
 *  - not from the order components happen to appear in code.
 *
 * B02-L2 — one single HERITAGE route: there is no per-editorial-context
 * order any more. The list below is the former "announcement" order,
 * unchanged; whether the death notice, traditions and condolences show
 * is decided by A00 inside section-selection, not by this list.
 *
 * The QG has explicitly not locked the final order (known conflict: this
 * list puts `story` before `ceremony`, while the Guided Flow asks for the
 * ceremony first). Reordering is a change to this array only — no engine
 * or test change needed (memorial-section-order.test.ts only checks it is
 * an exact permutation of the catalog).
 */
export const MEMORIAL_SECTION_ORDER: readonly SectionId[] = [
  "hero",
  "deathNotice",
  "story",
  "ceremony",
  "traditions",
  "gallery",
  "testimonials",
  "condolences",
  "video",
];
