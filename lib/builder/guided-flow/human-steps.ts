import type { EditorialContext } from "@/config/memorial";
import type { FlowDefinition, FlowState, StepDefinition, StepRecord } from "./engine";

/**
 * Mission 025 — the canonical UX-A step configuration for a human
 * (`person`) memorial, as validated at GATE UX-A. This is the ONE file
 * that knows what "T03" or "announcement" mean; `engine.ts` never does
 * (see that file's own docstring) — this is deliberately the seam a
 * future Pet flow's own config would replace, reusing every engine
 * function unchanged.
 *
 * Mission 025 builds ONLY this configuration and the engine that reads
 * it — never the screens, never the per-step content model, never
 * validations, never persistence wiring. See this file's closing note
 * for exactly why persistence wiring is out of scope, not merely
 * deferred by convenience.
 */

export const STEP_IDS = [
  // Tronc commun (before the branch)
  "T03",
  "T04",
  // A00 — "Souhaitez-vous également publier une annonce de décès ?".
  // Listed here, between identity and the Hero, because that is where it
  // is asked; its group is still "announcement" (see STEPS below).
  "A00",
  "T05",
  "T06",
  "T07",
  "T08",
  // Branche Announcement
  "A01",
  "A02",
  "A03",
  "A04",
  "A05",
  "A06",
  "A07",
  "A08",
  "A09",
  "A10",
  "A11",
  "A12",
  "A13",
  // Branche Remembrance
  "M01",
  "M02",
  "M03",
  "M04",
  "M05",
  "M06",
  // Tronc final commun (after the branch)
  "P01",
  "P04",
  "V02",
  "V03",
  "V04",
] as const;

export type StepId = (typeof STEP_IDS)[number];

/**
 * `"common"` = tronc commun before the branch (T03-T08); `"final"` =
 * tronc final commun after it (P01-V04); `"announcement"`/
 * `"remembrance"` mirror `config/memorial.ts`'s own `EditorialContext`
 * values exactly — reused, not re-declared, per the mission brief's
 * explicit "ne pas dupliquer editorial_context" rule.
 */
export type StepGroup = "common" | EditorialContext | "final";

export type HumanStepDefinition = StepDefinition<StepId, StepGroup>;
export type HumanFlowState = FlowState<StepId>;

/**
 * A04's own conceptual answer values (mission brief section 6). Not
 * exported as part of any wider "answer" type — the engine treats
 * `StepRecord.answer` as an opaque string, and this is simply what A05-
 * A08's `isApplicable` below compares it against.
 */
export const A04_ANSWERS = ["yes", "undecided", "no"] as const;
export type A04Answer = (typeof A04_ANSWERS)[number];

const isA04AnsweredYes = (state: HumanFlowState): boolean => state.A04?.answer === "yes";

/**
 * A00's own answer values: "yes" | "no" | "later". "yes"/"no" are
 * recorded `completed`, "later" is recorded `skipped` (the family chose
 * to decide later — never re-proposed automatically, still changeable).
 */
export const A00_ANSWERS = ["yes", "no", "later"] as const;
export type A00Answer = (typeof A00_ANSWERS)[number];

/**
 * A00's resolved record. An explicit record always wins. A draft that
 * has none but already validated an announcement (A01 completed — only
 * ever written inside the announcement steps) is read as "yes": the
 * family wrote and confirmed one before A00 existed. Read-time only,
 * never written back by itself.
 */
export function resolveA00Record(state: HumanFlowState): StepRecord | undefined {
  if (state.A00) return state.A00;
  if (state.A01?.status === "completed") return { status: "completed", answer: "yes" };
  return undefined;
}

/** Is the death notice part of this memorial right now? Only an A00
 * resolved to "yes". Hidden notice data is never deleted — the
 * announcement steps simply stop being applicable. */
/** A00 is part of the route unless the draft predates it and already
 * validated its announcement: that family is never asked (their "yes"
 * is derived), so the step is simply not applicable to them. */
const isA00Applicable = (state: HumanFlowState): boolean =>
  !(state.A00 === undefined && state.A01?.status === "completed");

export const isAnnouncementVisible = (state: HumanFlowState): boolean => {
  const record = resolveA00Record(state);
  return record?.status === "completed" && record.answer === "yes";
};

/**
 * The full UX-A step list, in canonical order — this array's order IS
 * the route order (same convention as `config/sections.ts`'s
 * `EDITORIAL_CONTEXT_SECTIONS`), before any applicability filtering.
 *
 * T09, T10, P02, P03 and V01 are deliberately ABSENT: they were
 * officially removed as standalone screens at GATE UX-A (mission brief
 * section 8) — not an oversight, a durable guard in human-
 * steps.test.ts checks they never silently reappear.
 */
export const STEPS: readonly HumanStepDefinition[] = [
  // --- Tronc commun ---
  { id: "T03", group: "common", required: true, skippable: false },
  { id: "T04", group: "common", required: false, skippable: true },
  // A00 sits between identity (T03/T04) and the Hero (T05-T08). While
  // T02 still splits the two editorial contexts, it belongs to the
  // announcement group only: a "remembrance" memorial is never offered a
  // death notice (B02-L2 will move it to the common trunk with T02 gone).
  { id: "A00", group: "announcement", required: false, skippable: true, isApplicable: isA00Applicable },
  { id: "T05", group: "common", required: false, skippable: true },
  { id: "T06", group: "common", required: true, skippable: false },
  // T07 (crop) has no isApplicable of its own tied to T06: both are
  // required and non-skippable, always in the common trunk, so T07 is
  // always applicable exactly when T06 is — "OBLIGATOIRE après photo"
  // (mission brief section 5) is a statement about ORDER (it comes
  // right after T06 in this array), not an extra applicability
  // condition to model.
  { id: "T07", group: "common", required: true, skippable: false },
  // Hero: structurally common (always exists, always required, never
  // skippable) even though its editorial rendering differs between
  // Announcement and Memory — that rendering choice belongs to a
  // future UI mission, not to this engine (mission brief section 5's
  // "Hero commun structurellement; Hero Annonce et Hero Mémoire
  // différents éditorialement").
  { id: "T08", group: "common", required: true, skippable: false },

  // --- Branche Announcement ---
  // A01-A03 (the death notice itself): applicable only when A00
  // resolves to "yes". "no" and "later" leave them out of the route —
  // their content and records are kept, never cleared.
  { id: "A01", group: "announcement", required: true, skippable: false, isApplicable: isAnnouncementVisible },
  { id: "A02", group: "announcement", required: false, skippable: true, isApplicable: isAnnouncementVisible },
  { id: "A03", group: "announcement", required: true, skippable: false, isApplicable: isAnnouncementVisible },
  { id: "A04", group: "announcement", required: true, skippable: false },
  // A05-A08: applicable only once A04 has actually been answered "yes"
  // (mission brief section 6) — "undecided" and "no" are both complete,
  // valid answers that leave these four inapplicable for now. If A04
  // later changes to "yes", these become applicable again automatically
  // (isStepApplicable re-reads `state` every call — no cached route).
  { id: "A05", group: "announcement", required: false, skippable: true, isApplicable: isA04AnsweredYes },
  { id: "A06", group: "announcement", required: false, skippable: true, isApplicable: isA04AnsweredYes },
  { id: "A07", group: "announcement", required: false, skippable: true, isApplicable: isA04AnsweredYes },
  { id: "A08", group: "announcement", required: false, skippable: true, isApplicable: isA04AnsweredYes },
  { id: "A09", group: "announcement", required: false, skippable: true },
  { id: "A10", group: "announcement", required: false, skippable: true },
  { id: "A11", group: "announcement", required: false, skippable: true },
  { id: "A12", group: "announcement", required: false, skippable: true },
  { id: "A13", group: "announcement", required: false, skippable: true },

  // --- Branche Remembrance ---
  // Deliberately no death-notice, no funeral-tradition, no recent-loss
  // language, no ceremony step here at all (mission brief section 7) —
  // M06 below is the only, optional, and non-central nod to a possible
  // commemorative moment.
  { id: "M01", group: "remembrance", required: true, skippable: false },
  { id: "M02", group: "remembrance", required: false, skippable: true },
  { id: "M03", group: "remembrance", required: false, skippable: true },
  { id: "M04", group: "remembrance", required: false, skippable: true },
  { id: "M05", group: "remembrance", required: false, skippable: true },
  { id: "M06", group: "remembrance", required: false, skippable: true },

  // --- Tronc final commun ---
  { id: "P01", group: "final", required: false, skippable: true },
  { id: "P04", group: "final", required: false, skippable: true },
  { id: "V02", group: "final", required: true, skippable: false },
  { id: "V03", group: "final", required: true, skippable: false },
  // V04 (Publish/share): required in the sense that publishing needs it
  // done, but the family can leave a draft unpublished and come back —
  // modeled as simply `required + not skippable`, exactly like V02/V03.
  // No special "deferred" status is needed: an unpublished memorial
  // just has V04 sitting at "incomplete", which is already precisely
  // what `firstIncompleteStep` resumes to — the mission brief's own
  // "conserver le brouillon et revenir plus tard" falls out of the
  // existing incomplete/complete model for free.
  { id: "V04", group: "final", required: true, skippable: false },
];

/**
 * Wires the UX-A `STEPS` + one family's chosen `EditorialContext` into
 * the generic engine's `FlowDefinition` shape — the one place that
 * decides "which groups are in scope for THIS memorial": the common
 * trunk, the final trunk, and exactly one of the two branches, never
 * both (see human-steps.test.ts's "no Announcement step in Remembrance"
 * / "no Remembrance step in Announcement" guards).
 */
export function humanFlowDefinition(
  editorialContext: EditorialContext,
): FlowDefinition<StepId, StepGroup> {
  return {
    steps: STEPS,
    activeGroups: ["common", "final", editorialContext],
  };
}

/**
 * ## Why persistence wiring is out of scope for Mission 025 — not just deferred
 *
 * `HumanFlowState` (`FlowState<StepId>`) is what every function above
 * consumes, but nothing in this codebase produces a real one yet, and
 * that is deliberate rather than an oversight to fix later in this same
 * mission:
 *
 *   - `types/memorial.ts`'s `MemorialContent` is keyed by
 *     `config/sections.ts`'s `SectionId` (`hero`, `deathNotice`,
 *     `story`, ...) — Mission 001's older, still-live section-toggle
 *     model for the demo Builder, a completely different id space from
 *     UX-A's `StepId` (`T03`, `A04`, `M01`, ...). Recording a real T03-
 *     V04 answer or an explicit skip marker means deciding THAT
 *     content's shape — exactly the "ne pas inventer les champs DB de
 *     T03-V04" the mission brief forbids this mission from doing.
 *   - The underlying column it would live in
 *     (`memorial_drafts.content`, read/written today by
 *     `lib/adapters/draft-repository.ts`) is already a schema-flexible
 *     JSON blob — storing a `{ status: "skipped" }` marker per step
 *     needs no new migration, no new grant, no new table once that
 *     content shape exists. That is exactly why this mission reports no
 *     STOP under section 3: the existing mechanism is verified
 *     structurally sufficient, and there is nothing to STOP over.
 *   - What genuinely cannot be decided yet is HOW each future step
 *     derives its own `"completed"` vs `"skipped"` vs untouched from
 *     that future content — that depends on each step's own real data
 *     (a name, a date, a photo, ...), which later missions define one
 *     screen at a time. This module's contract (`FlowState`) is the
 *     stable seam those missions build against; it does not need to
 *     change when they do.
 */
