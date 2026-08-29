import type { EditorialContext } from "./memorial";

/**
 * Every section id that exists across both editorial contexts. This is an
 * identifier list only — no visual or functional content for any section
 * is built in Mission 001.
 *
 * The Footer is deliberately NOT part of this list. It is a permanent
 * structural element of every memorial — always rendered, in every
 * editorial context — not a section the client activates, disables, or
 * reorders. See EDITORIAL_CONTEXT_SECTIONS below for where it renders.
 * Its visual content is defined in a later mission.
 */
export const SECTION_IDS = [
  "hero",
  "deathNotice",
  "story",
  "ceremony",
  "traditions",
  "gallery",
  "testimonials",
  "condolences",
  "video",
  "memoryMessage",
] as const;

export type SectionId = (typeof SECTION_IDS)[number];

export interface SectionDefinition {
  id: SectionId;
  /**
   * Part of the mandatory socle for this editorial context: always
   * included, and cannot be disabled by the client or the Builder.
   */
  core: boolean;
}

/**
 * Per editorial context: which (toggleable) sections exist, in which
 * order, and which ones are mandatory. The array order IS the canonical
 * rendering order — the client never chooses it (Mission 000: "l'ordre
 * est défini par configuration HERITAGE").
 *
 * The Footer always renders after every section listed here — it is not
 * one of these entries (see the SECTION_IDS comment above) and is always
 * present regardless of which optional sections are enabled.
 */
export const EDITORIAL_CONTEXT_SECTIONS: Record<EditorialContext, SectionDefinition[]> = {
  announcement: [
    { id: "hero", core: true },
    { id: "deathNotice", core: true },
    { id: "story", core: false },
    { id: "ceremony", core: false },
    { id: "traditions", core: false },
    { id: "gallery", core: false },
    { id: "testimonials", core: false },
    { id: "condolences", core: false },
    { id: "video", core: false },
  ],
  remembrance: [
    { id: "hero", core: true },
    { id: "story", core: false },
    { id: "gallery", core: false },
    { id: "testimonials", core: false },
    { id: "memoryMessage", core: false },
    { id: "video", core: false },
  ],
};
