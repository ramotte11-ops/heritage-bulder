import { EDITORIAL_CONTEXT_SECTIONS, SECTION_IDS, type SectionId } from "@/config/sections";
import type { EditorialContext } from "@/config/memorial";
import type { HumanFlowState } from "@/lib/builder/guided-flow/human-steps";

/**
 * Mission 027 — the section selection / recommendation foundation.
 *
 * Pure, framework-free, no I/O, no React: exactly the same contract as
 * `lib/memorial/status-transitions.ts` and `lib/builder/guided-flow/engine.ts`.
 * This module answers one question — "for this editorial context and
 * these explicit family answers/content, what is section X's status?" —
 * so it can be reused unchanged by the Guided Flow, the Builder, the
 * Preview, and publication (mission brief section 6), none of which
 * exist as a dependency here.
 *
 * ## The product rule this module exists to enforce
 *
 * HERITAGE never presents the family an administrative checklist of
 * modules (mission brief section 5), and never lets a skin/offer/assumed
 * religion silently turn a section on (sections 1, 8, 12). The only
 * inputs that may ever make a section MORE relevant than its context's
 * baseline are the editorial context itself, an explicit answer the
 * family already gave through the Guided Flow (today: only A04), and the
 * generic "this section now has real matter" signal described below.
 * There is deliberately no `skin`, `offerId`, or `Skin`/`OfferId` import
 * anywhere in this file — see section-selection.test.ts's compile-time
 * guard, which proves a caller cannot even pass one.
 *
 * ## `optionalAvailable` vs `applicable` — the QG micro-correction
 *
 * A section can be *compatible with the context* (worth offering to the
 * family at all) without yet *having anything to actually render* — e.g.
 * `gallery` is always compatible with `announcement`, but is empty
 * matter until the family adds photos. `optionalAvailable` is the first
 * state, `applicable` is the second; `resolveSectionSelectionStatus`
 * only reaches `applicable` once real matter exists (either `ceremony`'s
 * own UX-A gate, A04, or the generic `explicitContentSectionIds` signal
 * — see that field's own docstring). This is why `isSectionApplicable`
 * below is `true` only for `"structural"`/`"applicable"`, never for
 * `"recommended"`/`"optionalAvailable"`: a future Preview/publication
 * that renders whatever `isSectionApplicable` allows must never render
 * an empty section.
 *
 * Nothing here is a one-way door: every function recomputes from
 * whatever `SectionSelectionInput` it is given, the same way Mission
 * 025's engine recomputes a Guided Flow route from `FlowState` on every
 * call. Add a photo today and `gallery` reads `applicable`; remove it
 * tomorrow and the very next call reads `optionalAvailable` again — no
 * status is ever a persisted, irreversible decision (mission brief
 * section 3).
 *
 * ## Where this reuses existing configuration rather than inventing one
 *
 * `config/sections.ts`'s `EDITORIAL_CONTEXT_SECTIONS` already encodes,
 * per context, which sections exist, in which order, and which are
 * mandatory (`core`) — Mission 001's still-live model. This module does
 * not duplicate that table; it reads it. The only genuinely new logic
 * here is: (a) Hero is never part of the selectable domain at all
 * (mission brief section 2), (b) one optional section — `ceremony` —
 * has its relevance driven by an already-persisted Guided Flow answer
 * (Mission 025's `HumanFlowState`, A04) rather than being a flat
 * per-context default, and (c) every other section reads the generic
 * content signal below instead of a section-specific rule.
 *
 * `Footer` is not a `SectionId` at all (see `config/sections.ts`), so it
 * cannot even be passed to `resolveSectionSelectionStatus` — the type
 * system enforces mission brief section 2 for Footer the same way it
 * does for any other identifier that isn't part of this domain.
 */

/**
 * A section's classification for one editorial context + one set of
 * explicit family answers/content. The exact vocabulary is this
 * implementation's own choice (mission brief section 6 says as much);
 * this is how the five product concepts map onto it:
 *
 *  - "structurelle"                -> `"structural"`
 *  - "recommandée"                 -> `"recommended"`
 *  - "applicable"                  -> `"applicable"`
 *  - "disponible mais facultative" -> `"optionalAvailable"`
 *  - "non pertinente / cachée"     -> `"notRelevant"`
 *
 * All five are genuine, disjoint raw values (the QG's own micro-
 * correction: an earlier revision folded `"applicable"` into a derived
 * predicate, which conflated "HERITAGE suggests this" with "this
 * already has real matter" — see this file's module docstring).
 */
export type SectionSelectionStatus =
  | "structural"
  | "recommended"
  | "applicable"
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
  /**
   * Generic, section-id-keyed signal: "the family's current
   * answers/content give this section real matter right now" (mission
   * brief section 5). This is deliberately NOT a list of modules the
   * family ticked in some settings screen — it is the *consequence* of
   * content that already exists (photos added, a tradition explicitly
   * chosen, a story written, ...), computed by whatever future caller
   * actually holds that content (Guided Flow state, draft content, ...).
   *
   * Generic over every `SectionId`, tied to no particular step/screen
   * (not A09, not any future T03+ screen), tied to no skin or
   * `OfferId`, and not persisted anywhere by Mission 027 itself — this
   * module only ever reads it for the duration of one call. Absent or
   * empty is the fail-safe default: no section is ever promoted to
   * `"applicable"` on unknown input (section 12).
   */
  explicitContentSectionIds?: readonly SectionId[];
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
 * that decides a section's status. Nothing below is cached or persisted
 * — every call recomputes fresh from `input`, so a status is never a
 * one-way door (mission brief section 3).
 *
 * Rules, in order:
 *  1. `hero` is always `"structural"` — never evaluated against context
 *     configuration at all (mission brief section 2).
 *  2. A section this editorial context's `EDITORIAL_CONTEXT_SECTIONS`
 *     entry doesn't list at all is `"notRelevant"` — this is how
 *     `deathNotice` in `remembrance` and `traditions` in `remembrance`
 *     both fail closed, for free, with no context-specific code here,
 *     and it is checked before anything else so the context always wins
 *     over any signal a caller might pass in (mission brief section 8).
 *  3. `ceremony` (the only section whose relevance this module ties to
 *     a specific Guided Flow answer rather than the generic content
 *     signal) is `"applicable"` when A04 is answered `"yes"` — the
 *     family has just explicitly said a moment is planned, which IS the
 *     real matter — and `"notRelevant"` for `"no"`, `"undecided"`, or no
 *     answer at all, matching Mission 025's own `isApplicable` for
 *     A05-A08 (mission brief section 7).
 *  4. Otherwise, if `input.explicitContentSectionIds` names this
 *     section, it is `"applicable"` — the generic "real matter exists
 *     now" signal (mission brief section 5), which applies identically
 *     to a mandatory section (`deathNotice` before vs. after its own
 *     content exists — section 8) and to an ordinary optional one
 *     (`gallery`, `story`, `traditions`, ... — section 9).
 *  5. Otherwise: `"recommended"` for a `core: true` section (mandatory,
 *     so HERITAGE actively proposes it, but nothing proves it has
 *     content yet) or `"optionalAvailable"` for any other optional
 *     section — `traditions` included. `traditions` receives no
 *     special-case branch anywhere in this file: there is no rule, here
 *     or in `config/skins.ts`/`config/offers.ts`, capable of raising it
 *     above `"optionalAvailable"` except the same generic signal every
 *     other optional section reads (mission brief section 6/8).
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

  if (sectionId === "ceremony") {
    return isA04AnsweredYes(input.flowState ?? {}) ? "applicable" : "notRelevant";
  }

  if ((input.explicitContentSectionIds ?? []).includes(sectionId)) return "applicable";

  return definition.core ? "recommended" : "optionalAvailable";
}

/**
 * `true` for `"structural"` and `"applicable"` — a section that either
 * is permanent structure or genuinely has matter to render right now.
 * `false` for `"recommended"` and `"optionalAvailable"` alike: both mean
 * "HERITAGE could offer this", never "this already has content" (mission
 * brief section 4's QG micro-correction) — and `false` for
 * `"notRelevant"` as before. A future Preview/publication should read
 * this, not the raw status, before deciding whether to render a
 * section, so it never renders one that is merely suggested or merely
 * available but still empty.
 */
export function isSectionApplicable(status: SectionSelectionStatus): boolean {
  return status === "structural" || status === "applicable";
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
