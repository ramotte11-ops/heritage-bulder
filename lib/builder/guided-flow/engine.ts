/**
 * Mission 025 — the Guided Flow Engine.
 *
 * Pure, framework-free, no I/O: every function here reads plain data in
 * and returns plain data out. It never touches Supabase, never calls
 * `Date.now()`, never mutates an argument. That is what makes it fully
 * testable without a browser or a database, and what makes "same state
 * + same config -> same result" a guarantee rather than a hope (see
 * engine.test.ts's determinism suite).
 *
 * ## The one architectural rule this module exists to enforce
 *
 * The mission brief's absolute principle: THE CONFIGURATION DESCRIBES
 * THE FLOW. This file must never learn what "T03" or "announcement"
 * mean — there is no `if (step.id === "T08")`, no `if (editorialContext
 * === "announcement")`, anywhere below. Every function is generic over
 * `TGroup extends string` and takes a `FlowDefinition<TGroup>` (a list
 * of steps + which groups are "in scope" for this run) as a plain
 * parameter. `lib/builder/guided-flow/human-steps.ts` is the one file
 * that actually describes UX-A's steps and wires `EditorialContext`
 * into a `FlowDefinition` — swapping in a different config (a future
 * Pet flow, say) reuses every function here unchanged. That is also
 * this module's answer to the mission brief's Pet/future requirement:
 * genericity falls out of the human flow's own design, nothing Pet-
 * specific is added.
 *
 * ## What this module deliberately does NOT do
 *
 * It holds no state of its own — no `current_step` pointer, no cache,
 * nothing persisted. A caller (a future Server Component, a future
 * hook) always hands in the FULL `FlowState` it read from wherever it
 * actually lives, and always reads back a freshly computed answer. This
 * is deliberate: the mission brief is explicit that the real data (what
 * is actually completed, what was actually skipped) must remain the one
 * source of truth, never a second, potentially-stale index alongside
 * it. Route recalculation after an earlier answer changes (e.g. A04
 * flips from "no" to "yes") is therefore not a special case this module
 * handles — every function simply recomputes from the state it was
 * given, every time, so there is nothing to invalidate.
 *
 * It also does not decide "obligatoire" vs "facultatif" vs "skip
 * explicite" copy, and does not render anything — see
 * `human-steps.ts`'s own docstring for where the UX-A-specific meaning
 * of each field lives.
 */

/**
 * One step's declarative definition. `TGroup` is left generic so this
 * type (and everything below) is reusable by a config whose groups
 * aren't "common"/"announcement"/"remembrance"/"final" at all.
 */
export interface StepDefinition<TId extends string = string, TGroup extends string = string> {
  id: TId;
  group: TGroup;
  /** Must this step actually be completed for the flow to consider
   * itself done? (mission brief section 9: "obligatoire"). */
  required: boolean;
  /** May the family explicitly choose "Skip / Later" on this step?
   * (mission brief section 9: "facultatif" + "passable"). Today, in the
   * UX-A config, `required` and `skippable` are always each other's
   * negation — see human-steps.test.ts — but they are independent
   * fields here on purpose: nothing in this engine assumes they must
   * stay correlated. */
  skippable: boolean;
  /**
   * Is this step even part of the route, given everything answered so
   * far? Absent means "always applicable within its group" (the common
   * case). Present for a step whose relevance depends on an earlier
   * answer — UX-A's A05-A08 depending on A04, for example. The engine
   * never inspects what `state` means beyond calling this predicate;
   * only the config that defines a given step knows what to look up in
   * it.
   */
  isApplicable?: (state: FlowState<TId>) => boolean;
}

/**
 * The recorded outcome of one step, exactly as far as this engine's
 * contract goes: has the family completed it, or explicitly skipped it
 * (mission brief section 9 — these must stay distinguishable, or resume
 * would re-propose a consciously-skipped optional step forever).
 * `answer` is an opaque string a later step's own `isApplicable` may
 * choose to read (UX-A's A04 -> "yes" | "undecided" | "no") — this
 * engine only ever compares it for equality, never interprets it.
 *
 * Deliberately NOT a type this module derives from real persistence
 * itself (see the module docstring and the Mission 025 report): a
 * caller supplies this, already resolved from wherever it actually
 * keeps a step's real answer content and its explicit-skip marker.
 */
export interface StepRecord {
  status: "completed" | "skipped";
  answer?: string;
}

/** Every step this engine has ever heard of, keyed by id. A step with
 * no entry is simply "not yet touched" — see `stepRuntimeStatus`. */
export type FlowState<TId extends string = string> = Partial<Record<TId, StepRecord>>;

/**
 * A flow's own definition: its full step list (in canonical order —
 * that array order IS the route order, exactly like
 * `config/sections.ts`'s own `EDITORIAL_CONTEXT_SECTIONS` already
 * documents for the older section-toggle Builder) plus which of those
 * steps' `group`s are actually in scope for one run. For UX-A, that is
 * always `["common", "final", <the chosen editorialContext>]` — see
 * `human-steps.ts`'s `humanFlowDefinition`.
 */
export interface FlowDefinition<TId extends string = string, TGroup extends string = string> {
  steps: readonly StepDefinition<TId, TGroup>[];
  activeGroups: readonly TGroup[];
}

/**
 * Is `step` part of this run's route at all — right group, AND (if it
 * declares one) its `isApplicable` predicate currently says yes?
 */
export function isStepApplicable<TId extends string, TGroup extends string>(
  step: StepDefinition<TId, TGroup>,
  flow: FlowDefinition<TId, TGroup>,
  state: FlowState<TId>,
): boolean {
  if (!flow.activeGroups.includes(step.group)) return false;
  return step.isApplicable ? step.isApplicable(state) : true;
}

/**
 * The actually-applicable route for this state, in canonical order.
 * This is THE route: every other function below is defined in terms of
 * walking this same list, so "previous/next skip non-applicable steps
 * correctly" and "a conditional step disappears the moment its
 * condition stops holding" are true by construction, not by a special
 * case.
 */
export function applicableSteps<TId extends string, TGroup extends string>(
  flow: FlowDefinition<TId, TGroup>,
  state: FlowState<TId>,
): StepDefinition<TId, TGroup>[] {
  return flow.steps.filter((step) => isStepApplicable(step, flow, state));
}

export type StepRuntimeStatus = "completed" | "skipped" | "incomplete" | "notApplicable";

/**
 * The one place "obligatoire / facultatif / skip explicite / non
 * applicable" (mission brief sections 9-10) actually resolve into a
 * single answer for one step:
 *
 *  - not part of the route right now -> "notApplicable" (never
 *    "incomplete" — this is the exact fix for the brief's own example:
 *    announcement + A04="no" must never treat A05-A08 as incomplete);
 *  - recorded "skipped" but the step itself is `skippable: false` ->
 *    "incomplete", never "skipped" (see below — a fail-safe invariant,
 *    not a trusted read of the record);
 *  - the family recorded completing it -> "completed";
 *  - the family explicitly chose Skip/Later on it (and the step really
 *    is skippable) -> "skipped";
 *  - nothing recorded yet -> "incomplete", whether the step is required
 *    or merely optional-but-not-yet-touched.
 *
 * ## Why the `skippable: false` check exists here, not just in config
 *
 * Mission 025's QG audit named this precisely: `skippable` used to be
 * purely declarative — a `StepRecord` claiming `"skipped"` for a
 * non-skippable step (T03, T06, T07, T08, A01, A03, A04, M01, V02, V03,
 * V04 in the human config) was trusted at face value, which would have
 * let a corrupt or malformed `FlowState` silently bypass a mandatory
 * step (`firstIncompleteStep` would step right over it). This function
 * is the one place every other function in this module reads a step's
 * status through, so enforcing the invariant HERE — never trust a
 * "skipped" record for a step that cannot be skipped — makes it
 * structural rather than a rule every future caller must remember to
 * uphold. Deliberately a quiet downgrade to "incomplete", never a
 * thrown exception: bad data must not be able to crash the Builder,
 * only fail closed (mandatory work stays required) rather than open.
 */
export function stepRuntimeStatus<TId extends string, TGroup extends string>(
  step: StepDefinition<TId, TGroup>,
  flow: FlowDefinition<TId, TGroup>,
  state: FlowState<TId>,
): StepRuntimeStatus {
  if (!isStepApplicable(step, flow, state)) return "notApplicable";
  const recorded = state[step.id]?.status;
  if (recorded === "skipped" && !step.skippable) return "incomplete";
  return recorded ?? "incomplete";
}

/** Steps in the current route already completed, in canonical order. */
export function completedSteps<TId extends string, TGroup extends string>(
  flow: FlowDefinition<TId, TGroup>,
  state: FlowState<TId>,
): StepDefinition<TId, TGroup>[] {
  return applicableSteps(flow, state).filter(
    (step) => stepRuntimeStatus(step, flow, state) === "completed",
  );
}

/** Steps in the current route the family explicitly skipped, in
 * canonical order. Never re-proposed as incomplete — see
 * `firstIncompleteStep`. */
export function skippedSteps<TId extends string, TGroup extends string>(
  flow: FlowDefinition<TId, TGroup>,
  state: FlowState<TId>,
): StepDefinition<TId, TGroup>[] {
  return applicableSteps(flow, state).filter(
    (step) => stepRuntimeStatus(step, flow, state) === "skipped",
  );
}

/** Every step of the FULL config (both branches, every conditional
 * one) that is not applicable right now — either it belongs to a group
 * outside `flow.activeGroups` (the other editorial-context branch, for
 * a human flow) or its own `isApplicable` currently says no (A05-A08
 * when A04 isn't "yes"). */
export function nonApplicableSteps<TId extends string, TGroup extends string>(
  flow: FlowDefinition<TId, TGroup>,
  state: FlowState<TId>,
): StepDefinition<TId, TGroup>[] {
  return flow.steps.filter((step) => !isStepApplicable(step, flow, state));
}

/**
 * Reprise doctrine (mission brief section 10): the first applicable
 * step that is not yet completed or explicitly skipped — `null` once
 * every applicable step is one or the other, i.e. the flow itself is
 * done. Walks `applicableSteps`, so a step whose condition no longer
 * holds is never returned, and a consciously-skipped optional step is
 * never re-proposed.
 */
export function firstIncompleteStep<TId extends string, TGroup extends string>(
  flow: FlowDefinition<TId, TGroup>,
  state: FlowState<TId>,
): StepDefinition<TId, TGroup> | null {
  for (const step of applicableSteps(flow, state)) {
    if (stepRuntimeStatus(step, flow, state) === "incomplete") return step;
  }
  return null;
}

/**
 * The applicable step right after `currentId` — `null` if `currentId`
 * is the last applicable step, or isn't part of the route at all right
 * now. Computed fresh from `applicableSteps` every call, so a route
 * that changed since `currentId` was last shown (an earlier answer
 * changed) is reflected immediately — there is no stale index to reset.
 */
export function nextApplicableStep<TId extends string, TGroup extends string>(
  currentId: TId,
  flow: FlowDefinition<TId, TGroup>,
  state: FlowState<TId>,
): StepDefinition<TId, TGroup> | null {
  const route = applicableSteps(flow, state);
  const index = route.findIndex((step) => step.id === currentId);
  if (index === -1) return null;
  return route[index + 1] ?? null;
}

/**
 * The applicable step right before `currentId`. Deliberately ignores
 * that step's own completed/skipped status (mission brief section 11:
 * "Previous doit permettre de revenir sur une étape antérieure
 * applicable même si elle avait été complétée ou passée") — only
 * applicability decides whether Previous can land there.
 */
export function previousApplicableStep<TId extends string, TGroup extends string>(
  currentId: TId,
  flow: FlowDefinition<TId, TGroup>,
  state: FlowState<TId>,
): StepDefinition<TId, TGroup> | null {
  const route = applicableSteps(flow, state);
  const index = route.findIndex((step) => step.id === currentId);
  if (index <= 0) return null;
  return route[index - 1] ?? null;
}

/**
 * A normalized 0..1 signal for a purely decorative progress bar
 * (mission brief section 12: no number, no percentage, no `Step X`, no
 * fixed global total is ever shown — this value is only ever consumed
 * by a visual fill width). Computed from the CURRENTLY applicable route
 * only, so `announcement` and `remembrance` are never assumed to have
 * the same step count, and a route that grows or shrinks (A04
 * recalculation) is reflected the moment it changes.
 *
 * Bounded [0, 1] always. Monotonic non-decreasing as more of a STABLE
 * route (nothing added or removed) gets completed/skipped — never
 * claimed across a route change, where the denominator itself moves
 * (see engine.test.ts).
 */
export function guidedFlowProgress<TId extends string, TGroup extends string>(
  flow: FlowDefinition<TId, TGroup>,
  state: FlowState<TId>,
): number {
  const route = applicableSteps(flow, state);
  if (route.length === 0) return 1;
  const done = route.filter((step) => stepRuntimeStatus(step, flow, state) !== "incomplete").length;
  return done / route.length;
}

/** Everything a caller (a future Guided Flow screen) is likely to want
 * in one call, bundled — mission brief section 11's list of primitives,
 * minus `current`/`next`/`previous` (which need a `currentId` a
 * standalone resolution can't guess) and `nonApplicableSteps` (a
 * diagnostic more than a UI need), both still available individually
 * above. */
export interface GuidedFlowResolution<TId extends string = string, TGroup extends string = string> {
  route: StepDefinition<TId, TGroup>[];
  firstIncomplete: StepDefinition<TId, TGroup> | null;
  completed: StepDefinition<TId, TGroup>[];
  skipped: StepDefinition<TId, TGroup>[];
  progress: number;
}

export function resolveGuidedFlow<TId extends string, TGroup extends string>(
  flow: FlowDefinition<TId, TGroup>,
  state: FlowState<TId>,
): GuidedFlowResolution<TId, TGroup> {
  return {
    route: applicableSteps(flow, state),
    firstIncomplete: firstIncompleteStep(flow, state),
    completed: completedSteps(flow, state),
    skipped: skippedSteps(flow, state),
    progress: guidedFlowProgress(flow, state),
  };
}
