import { EDITORIAL_CONTEXT_SECTIONS, SECTION_IDS, type SectionId } from "@/config/sections";
import type { EditorialContext } from "@/config/memorial";
import type { HumanFlowState } from "@/lib/builder/guided-flow/human-steps";

/**
 * Mission 027 — the section selection / recommendation foundation.
 *
 * Pure, framework-free, no I/O, no React: exactly the same contract as
 * `lib/memorial/status-transitions.ts` and `lib/builder/guided-flow/engine.ts`.
 * This module answers one question — "for this editorial context and
 * these explicit family answers, what is section X's status?" — so it
 * can be reused unchanged by the Guided Flow, the Builder, the Preview,
 * and publication (mission brief section 6), none of which exist as a
 * dependency here.
 *
 * ## The product rule this module exists to enforce
 *
 * HERITAGE never presents the family an administrative checklist of
 * modules (mission brief section 5), and never lets a skin/offer/assumed
 * religion silently turn a section on (sections 1, 8, 12). The only
 * inputs that may ever make a section MORE relevant than its context's
 * baseline are the editorial context itself and an explicit answer the
 * family already gave through the Guided Flow (today: only A04). There
 * is deliberately no `skin`, `offerId`, or `Skin`/`OfferId` import
 * anywhere in this file — see section-selection.test.ts's compile-time
 * guard, which proves a caller cannot even pass one.
 *
 * ## Where this reuses existing configuration rather than inventing one
 *
 * `config/sections.ts`'s `EDITORIAL_CONTEXT_SECTIONS` already encodes,
 * per context, which sections exist, in which order, and which are
 * mandatory (`core`) — Mission 001's still-live model. This module does
 * not duplicate that table; it reads it. The only genuinely new logic
 * here is: (a) Hero is never part of the selectable domain at all
 * (mission brief section 2), and (b) one optional section — `ceremony`
 * — has its relevance driven by an already-persisted Guided Flow answer
 * (Mission 025's `HumanFlowState`, A04) rather than being a flat
 * per-context default.
 *
 * `Footer` is not a `SectionId` at all (see `config/sections.ts`), so it
 * cannot even be passed to `resolveSectionSelectionStatus` — the type
 * system enforces mission brief section 2 for Footer the same way it
 * does for any other identifier that isn't part of this domain.
 */

/**
 * A section's classification for one editorial context + one set of
 * explicit family answers. The exact vocabulary is this implementation's
 * own choice (mission brief section 6 says as much); this is how the
 * five product concepts from that section map onto it:
 *
 *  - "structurelle"            -> `"structural"`
 *  - "recommandée"             -> `"recommended"`
 *  - "disponible mais facultative" -> `"optionalAvailable"`
 *  - "non pertinente / cachée" -> `"notRelevant"`
 *  - "applicable"              -> NOT a fifth raw value. It is the
 *    derived predicate `isSectionApplicable(status)` below: true for
 *    `"structural"`, `"recommended"` and `"optionalAvailable"` alike
 *    (all three could legitimately render), false only for
 *    `"notRelevant"`. Modeling it as a fifth enum member would either
 *    duplicate `"recommended"`/`"optionalAvailable"` or need its own
 *    disjoint meaning nothing in the brief actually asks for — the
 *    brief's own worked examples (section 11) use "applicable" exactly
 *    this way ("ceremony/details become applicable" / "not applicable").
 */
export type SectionSelectionStatus =
  | "structural"
  | "recommended"
  | "optionalAvailable"
  | "notRelevant";

/**
 * What this module needs to classify a section. `flowState` is optional
 * and defaults to "nothing answered yet" — an absent, empty, or
 * malformed `flowState` all resolve identically (fail-safe: see
 * `resolveSectionSelectionStatus`'s A04 handling and mission brief
 * section 12). Deliberately no `skin`/`offerId` field — see this file's
 * docstring.
 */
export interface SectionSelectionInput {
  editorialContext: EditorialContext;
  /** The family's Guided Flow answers so far (Mission 025's
   * `HumanFlowState`, keyed by `StepId`). Reused as-is rather than a
   * parallel "answers" shape invented for this mission (mission brief
   * section 7). */
  flowState?: HumanFlowState;
}

/**
 * A04's own conceptual answer (mission brief sections 4 and 6): only an
 * exact `"yes"` counts. `"no"`, `"undecided"`, not-yet-answered, and any
 * other/invalid string are all treated identically — this is the fail-
 * safe rule from section 12 ("ne jamais supposer une cérémonie") made
 * structural rather than three separate branches to keep in sync.
 */
function isA04AnsweredYes(flowState: HumanFlowState): boolean {
  return flowState.A04?.answer === "yes";
}

/**
 * The single-section classification. Every other export in this module
 * is defined in terms of this function, so there is exactly one place
 * that decides a section's status.
 *
 * Rules, in order:
 *  1. `hero` is always `"structural"` — never evaluated against context
 *     configuration at all (mission brief section 2).
 *  2. A section this editorial context's `EDITORIAL_CONTEXT_SECTIONS`
 *     entry doesn't list at all is `"notRelevant"` — this is how
 *     `deathNotice` in `remembrance` and `traditions` in `remembrance`
 *     both fail closed, for free, with no context-specific code here.
 *  3. A section marked `core: true` for this context is `"recommended"`
 *     — it is mandatory, so it is trivially the strongest form of
 *     "naturally relevant given the context" (`deathNotice` in
 *     `announcement`).
 *  4. `ceremony` (the only section whose relevance this module ties to
 *     an explicit answer) is `"recommended"` only when A04 is answered
 *     `"yes"`, and `"notRelevant"` for `"no"`, `"undecided"`, or no
 *     answer at all — never `"incomplete"`-shaped blocking, matching
 *     Mission 025's own `isApplicable` for A05-A08 (mission brief
 *     section 11's third and fourth examples).
 *  5. Every other optional section in this context — `traditions`
 *     included — is `"optionalAvailable"`. `traditions` receives no
 *     special-case branch anywhere in this file: there is no rule, here
 *     or in `config/skins.ts`/`config/offers.ts`, capable of raising it
 *     to `"recommended"`, which is the mission brief section 8
 *     requirement made structural rather than merely tested.
 */
export function resolveSectionSelectionStatus(
  sectionId: SectionId,
  input: SectionSelectionInput,
): SectionSelectionStatus {
  if (sectionId === "hero") return "structural";

  const definition = EDITORIAL_CONTEXT_SECTIONS[input.editorialContext].find(
    (section) => section.id === sectionId,
  );
  if (!definition) return "notRelevant";
  if (definition.core) return "recommended";

  if (sectionId === "ceremony") {
    return isA04AnsweredYes(input.flowState ?? {}) ? "recommended" : "notRelevant";
  }

  return "optionalAvailable";
}

/**
 * `true` for `"structural"`, `"recommended"` and `"optionalAvailable"` —
 * anything that could legitimately render in this context right now.
 * `false` only for `"notRelevant"`. See `SectionSelectionStatus`'s
 * docstring for why this is a derived predicate rather than its own
 * status value.
 */
export function isSectionApplicable(status: SectionSelectionStatus): boolean {
  return status !== "notRelevant";
}

/**
 * Every `SectionId` this HERITAGE configuration has ever heard of,
 * classified for one editorial context + one set of explicit answers —
 * the bulk form of `resolveSectionSelectionStatus`, in `SECTION_IDS`'s
 * canonical order. A caller (a future Guided Flow screen, the Builder's
 * section manager, a Preview) reads this once per render instead of
 * calling the single-section form per id.
 */
export function resolveSectionSelection(
  input: SectionSelectionInput,
): Record<SectionId, SectionSelectionStatus> {
  return Object.fromEntries(
    SECTION_IDS.map((id) => [id, resolveSectionSelectionStatus(id, input)]),
  ) as Record<SectionId, SectionSelectionStatus>;
}

/**
 * The `SectionId`s currently at a given status, in canonical order — a
 * convenience over `resolveSectionSelection` for a caller that only
 * cares about one bucket (e.g. "which sections should the Guided Flow
 * suggest right now?" -> `sectionIdsWithStatus(input, "recommended")`).
 */
export function sectionIdsWithStatus(
  input: SectionSelectionInput,
  status: SectionSelectionStatus,
): SectionId[] {
  return SECTION_IDS.filter((id) => resolveSectionSelectionStatus(id, input) === status);
}
