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

/**
 * B02-L2 — one single HERITAGE route. The editorial-context choice (T02)
 * and the "Mémoire & Hommage" branch (M01-M06, never built) are gone: the
 * death notice is decided by A00 alone. A draft that still stores an
 * M01-M06 record keeps it (flow-state.ts never deletes unknown keys); it
 * is simply no longer read.
 */
export const STEP_IDS = [
  // Tronc commun
  "T03",
  "T04",
  // A00 — "Souhaitez-vous également publier une annonce de décès ?",
  // between identity and the Hero.
  "A00",
  "T05",
  "T06",
  "T07",
  "T08",
  // Annonce (A01-A03, only when A00 = yes), cérémonie, repères, fiche, galerie
  "A01",
  "A02",
  "A03",
  "A04",
  "A05",
  "A06",
  "A07",
  // A14 — « Le déroulement de la cérémonie » (Cérémonie V2, B2): declared
  // at its validated place between A07 and A08, never applicable yet
  // (see `isA14InRoute` below).
  "A14",
  "A08",
  "A09",
  "A10",
  "A11",
  "A12",
  "A13",
  // Tronc final commun
  "P01",
  "P04",
  "V02",
  "V03",
  "V04",
] as const;

export type StepId = (typeof STEP_IDS)[number];

/**
 * `"common"` = identity, A00 and the Hero (T03-T08); `"announcement"` =
 * the tribute's own sections (A01-A13 — the historical group name, kept
 * so the step ids keep their meaning); `"final"` = P01-V04. All three
 * are always active: there is one route, and per-step `isApplicable`
 * predicates decide what applies.
 */
export type StepGroup = "common" | "announcement" | "final";

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
 * Cérémonie V2 (B2) — A14 « Le déroulement de la cérémonie » is built
 * (components/builder/CeremonyProgrammeStep.tsx) but NOT part of the
 * route: it must stay unreachable until the CeremonyV2 renderer can show
 * it. Never applicable, so the route, the progress and
 * `firstIncompleteStep` are exactly what they were before A14 existed.
 * Its insertion (GO C5) replaces this predicate with `isA04AnsweredYes`
 * and opens the page gate between A07 and A08
 * (lib/builder/guided-flow/ceremony-step.ts, `needsA14`).
 */
export const isA14InRoute = (): boolean => false;

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

/** A00 is part of the route unless the draft predates it and already
 * validated its announcement: that family is never asked (their "yes"
 * is derived), so the step is simply not applicable to them. */
const isA00Applicable = (state: HumanFlowState): boolean =>
  !(state.A00 === undefined && state.A01?.status === "completed");

/** Is the death notice part of this memorial right now? Only an A00
 * resolved to "yes". Hidden notice data is never deleted — the
 * announcement steps simply stop being applicable. */
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
  // A00 sits between identity (T03/T04) and the Hero (T05-T08), asked of
  // every family whatever its historical editorial context.
  { id: "A00", group: "common", required: false, skippable: true, isApplicable: isA00Applicable },
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
  { id: "A14", group: "announcement", required: false, skippable: true, isApplicable: isA14InRoute },
  { id: "A08", group: "announcement", required: false, skippable: true, isApplicable: isA04AnsweredYes },
  // A09 (Traditions & repères) belongs with the death notice (PO
  // doctrine): applicable only when A00 = yes. Entries already written
  // are kept when it is hidden.
  { id: "A09", group: "announcement", required: false, skippable: true, isApplicable: isAnnouncementVisible },
  { id: "A10", group: "announcement", required: false, skippable: true },
  { id: "A11", group: "announcement", required: false, skippable: true },
  { id: "A12", group: "announcement", required: false, skippable: true },
  { id: "A13", group: "announcement", required: false, skippable: true },

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
 * The single HERITAGE route as the generic engine's `FlowDefinition`:
 * every group active, applicability decided step by step (A00, A04).
 * Takes no editorial context — B02-L2 removed that choice; the column
 * stays in the database as historical data only.
 */
export function humanFlowDefinition(): FlowDefinition<StepId, StepGroup> {
  return {
    steps: STEPS,
    activeGroups: ["common", "announcement", "final"],
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
