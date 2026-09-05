import { EDITORIAL_CONTEXT_SECTIONS, type SectionDefinition, type SectionId } from "@/config/sections";
import { getOrderedSections } from "@/lib/sections";
import type { EditorialContext } from "@/config/memorial";
import type { BuilderMemorial, MemorialContent } from "@/types/memorial";
import type { DemoSectionContent } from "./demo-content";

/**
 * The Footer is intentionally not part of config/sections.ts's
 * SECTION_IDS or EDITORIAL_CONTEXT_SECTIONS (see the Mission 001
 * correction in that file) — it is a permanent structural element, not
 * a section the Builder manages, toggles, or lets the client select.
 * This label is Builder-shell UI text only, not a new section id.
 */
export const FOOTER_LABEL = "Footer";

export type BuilderMode = "edit" | "preview";

/**
 * The Builder's local editing state. Mission 003 keeps this entirely in
 * memory (see createInitialBuilderState) — no persistence.
 *
 * Shape deliberately mirrors the real model from types/memorial.ts
 * (`editorialContext`, `enabledSections`, `content` is a real
 * `MemorialContent`) so that a future mission can swap
 * createInitialBuilderState's fixture source for
 * `DataRepository<Memorial>.findById(...)`, and add a "save" operation
 * that writes `content`/`enabledSections` back to `memorial_drafts`,
 * without changing any of the pure functions below or the components
 * that call them.
 */
export interface BuilderState {
  editorialContext: EditorialContext;
  enabledSections: SectionId[];
  content: MemorialContent;
  selectedSectionId: SectionId | null;
  mode: BuilderMode;
}

/**
 * Seeds Builder state from a memorial's configuration plus its draft
 * (`BuilderMemorial`, types/memorial.ts). Mission 021 made the real
 * caller supply a real, authorized memorial here rather than a fixture;
 * Mission 021B narrowed the parameter from the full `Memorial` to the
 * fields the Builder genuinely reads, so nothing in this path implies a
 * published snapshot it never displays. A full `Memorial` (the Mission
 * 003 demo fixtures) is still assignable, unchanged.
 */
export function createInitialBuilderState(memorial: BuilderMemorial): BuilderState {
  const sections = EDITORIAL_CONTEXT_SECTIONS[memorial.editorialContext];
  const firstSelectable = sections[0]?.id ?? null;

  return {
    editorialContext: memorial.editorialContext,
    enabledSections: [...memorial.enabledSections],
    content: { ...memorial.draft.content },
    selectedSectionId: firstSelectable,
    mode: "edit",
  };
}

function isOptionalSectionInContext(context: EditorialContext, id: SectionId): boolean {
  return EDITORIAL_CONTEXT_SECTIONS[context].some((section) => section.id === id && !section.core);
}

/**
 * Toggles an optional section on/off. No-ops (returns the same state
 * reference) for a core section, or for a section id that isn't part of
 * this context at all — the Builder must never let the UI violate
 * either rule, regardless of what triggers this call.
 */
export function toggleSection(state: BuilderState, sectionId: SectionId): BuilderState {
  if (!isOptionalSectionInContext(state.editorialContext, sectionId)) {
    return state;
  }

  const isEnabled = state.enabledSections.includes(sectionId);

  return {
    ...state,
    enabledSections: isEnabled
      ? state.enabledSections.filter((id) => id !== sectionId)
      : [...state.enabledSections, sectionId],
  };
}

export function selectSection(state: BuilderState, sectionId: SectionId): BuilderState {
  return { ...state, selectedSectionId: sectionId };
}

export function updateSectionContent(
  state: BuilderState,
  sectionId: SectionId,
  patch: DemoSectionContent,
): BuilderState {
  const existing = (state.content[sectionId] as DemoSectionContent | undefined) ?? {};

  return {
    ...state,
    content: {
      ...state.content,
      [sectionId]: { ...existing, ...patch },
    },
  };
}

export function setMode(state: BuilderState, mode: BuilderMode): BuilderState {
  return { ...state, mode };
}

/**
 * Sections to actually render in preview, in canonical order — reuses
 * the same lib/sections.ts helper a future public memorial page will
 * use, so the Builder's preview and any real rendering stay consistent
 * by construction instead of by convention.
 */
export function getPreviewSections(state: BuilderState): SectionDefinition[] {
  return getOrderedSections(state.editorialContext, state.enabledSections);
}

/**
 * All sections configured for this context — core and optional, enabled
 * or not — in canonical order. What the Builder's section list/manager
 * shows, as opposed to getPreviewSections, which only shows what a
 * visitor would actually see.
 */
export function getManagedSections(state: BuilderState): SectionDefinition[] {
  return EDITORIAL_CONTEXT_SECTIONS[state.editorialContext];
}
