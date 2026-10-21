import { SECTION_IDS, type SectionId } from "@/config/sections";
import { resolveSectionRenderer } from "@/config/memorial-section-renderers";
import type { Skin } from "@/config/skins";
import type { MemorialContent } from "@/types/memorial";

/**
 * « Gérer les rubriques visibles » — which sections the family chose to
 * keep OUT of the memorial's main flow, without ever deleting them.
 *
 * ## Where it lives: `memorial_drafts.content.presentation`
 *
 * `{ presentation: { hiddenSections: SectionId[] } }`, next to the
 * content it governs — so it is saved, reloaded and (later) snapshotted
 * at publication together with it, with no migration. `memorials.
 * enabled_sections` is not used: it is legacy, not writable by the
 * Owner, and drives the messages RLS.
 *
 * ## Owned by ONE write
 *
 * Every Guided Flow screen autosaves its WHOLE content, built from the
 * draft it was given when it mounted. A screen opened before a
 * visibility change would therefore silently revert it on its next
 * autosave. So `presentation` belongs to `saveSectionVisibilityAction`
 * alone: `saveDraftAction` always keeps the STORED value
 * (`withStoredPresentation`) and ignores whatever the client sends.
 *
 * ## Rules (PO)
 *
 * - Hiding never deletes: the section's content is untouched, the
 *   Builder keeps every screen reachable, and showing it again restores
 *   it exactly.
 * - The Hero is structural: it can never be hidden (dropped on read and
 *   refused on write).
 * - Offrandes symboliques (M3, Preview only) cannot be hidden yet:
 *   refused on write, ignored on read.
 * - A section can be hidden only if it can actually appear: a renderer
 *   exists for the memorial's skin (`isHideableSection`). Traditions —
 *   or any future section — joins the moment its renderer is registered.
 * - Nothing expires: there is no date here and nothing hides itself.
 * - A corrupted value reads as "nothing hidden" — a section is never
 *   hidden by accident.
 */

export interface MemorialPresentation {
  hiddenSections: SectionId[];
}

/** Hidden from the main flow, still consultable in a secondary
 * presentation (PO: their former information stays one discreet link
 * away). */
export const ARCHIVABLE_SECTIONS: readonly SectionId[] = ["deathNotice", "ceremony"];

const STRUCTURAL: SectionId = "hero";

/** M3 — Offrandes symboliques live in the Builder Preview only: nothing
 * about them is written, not even a visibility choice. Whether the
 * family may hide them is a QG decision still to come. */
const NOT_HIDEABLE_YET: readonly SectionId[] = ["symbolicOfferings"];

function isSectionId(value: unknown): value is SectionId {
  return typeof value === "string" && (SECTION_IDS as readonly string[]).includes(value);
}

function rawPresentation(content: MemorialContent): unknown {
  return (content as Record<string, unknown>).presentation;
}

/** The family's hidden sections, normalized: known ids only, never the
 * Hero, no duplicates, in catalog order. Anything malformed → `[]`. */
export function readHiddenSections(content: MemorialContent): SectionId[] {
  const raw = rawPresentation(content);
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return [];
  const list = (raw as { hiddenSections?: unknown }).hiddenSections;
  if (!Array.isArray(list)) return [];
  const hidden = new Set(list.filter(isSectionId).filter((id) => id !== STRUCTURAL));
  return SECTION_IDS.filter((id) => hidden.has(id));
}

export function isSectionHidden(content: MemorialContent, sectionId: SectionId): boolean {
  return readHiddenSections(content).includes(sectionId);
}

/** Can the family hide this section at all? Never the Hero; only a
 * section the memorial can actually show (a renderer for its skin). */
export function isHideableSection(sectionId: SectionId, skin: Skin | null): boolean {
  return (
    sectionId !== STRUCTURAL &&
    !NOT_HIDEABLE_YET.includes(sectionId) &&
    resolveSectionRenderer(sectionId, skin) !== null
  );
}

export type SetSectionVisibilityResult =
  | { ok: true; content: MemorialContent }
  | { ok: false; reason: "notHideable" };

/** Hides or shows one section. Pure: returns a new content, touching
 * nothing but `presentation.hiddenSections`. */
export function setSectionVisibility(
  content: MemorialContent,
  sectionId: SectionId,
  visible: boolean,
  skin: Skin | null,
): SetSectionVisibilityResult {
  if (!isHideableSection(sectionId, skin)) return { ok: false, reason: "notHideable" };
  const hidden = new Set(readHiddenSections(content));
  if (visible) hidden.delete(sectionId);
  else hidden.add(sectionId);
  const presentation: MemorialPresentation = { hiddenSections: SECTION_IDS.filter((id) => hidden.has(id)) };
  return { ok: true, content: { ...content, presentation } as MemorialContent };
}

/**
 * What `saveDraftAction` persists: the client's content, with the
 * STORED `presentation` (or none) — never the client's own copy, which
 * may predate a visibility change made since the screen mounted.
 */
export function withStoredPresentation(incoming: MemorialContent, stored: MemorialContent | null): MemorialContent {
  const next: Record<string, unknown> = { ...(incoming as Record<string, unknown>) };
  delete next.presentation;
  const kept = stored === null ? undefined : rawPresentation(stored);
  if (kept !== undefined) next.presentation = kept;
  return next as MemorialContent;
}
