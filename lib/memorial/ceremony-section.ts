import type { EditorialContext } from "@/config/memorial";
import type { HumanFlowState } from "@/lib/builder/guided-flow/human-steps";
import { isSectionApplicable, resolveSectionSelectionStatus } from "./section-selection";

/**
 * Mission 040B — the one question a future Memorial page asks before
 * mounting `CeremonyIntemporel`: "is the Ceremony section genuinely
 * pertinent right now?"
 *
 * Deliberately NOT a second decision: `lib/memorial/section-selection.ts`
 * (Mission 027) already ties the `ceremony` `SectionId`'s relevance to
 * A04's own answer, and to the editorial context's own section list
 * (`config/sections.ts` — `ceremony` is absent from `remembrance`
 * entirely). This function is a thin, framework-free composition over
 * that existing mechanism — it reads A04's answer from the SAME
 * `HumanFlowState` shape every other Guided Flow module already uses,
 * never a second "is there a ceremony" flag invented for the Memorial
 * side (mission brief: "ne pas dupliquer la logique A04 ; ne pas créer
 * une deuxième source de vérité").
 */
export function isCeremonySectionActive(
  editorialContext: EditorialContext,
  flowState: HumanFlowState,
): boolean {
  return isSectionApplicable(resolveSectionSelectionStatus("ceremony", { editorialContext, flowState }));
}
