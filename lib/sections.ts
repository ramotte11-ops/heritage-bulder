import { EDITORIAL_CONTEXT_SECTIONS, type SectionDefinition, type SectionId } from "@/config/sections";
import type { EditorialContext } from "@/config/memorial";

/**
 * Resolves which sections a memorial should render, in the correct order.
 *
 * Core sections are always included. Optional sections are included only if
 * their id is present in `enabledSectionIds`. The returned order always
 * follows the HERITAGE configuration in config/sections.ts, never the order
 * ids happen to appear in `enabledSectionIds`.
 *
 * This is a pure configuration helper — it does not render anything.
 */
export function getOrderedSections(
  context: EditorialContext,
  enabledSectionIds: readonly SectionId[],
): SectionDefinition[] {
  const enabled = new Set(enabledSectionIds);

  return EDITORIAL_CONTEXT_SECTIONS[context].filter(
    (section) => section.core || enabled.has(section.id),
  );
}
