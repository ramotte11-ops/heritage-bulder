import type { EditorialContext } from "@/config/memorial";
import { stepRuntimeStatus } from "./engine";
import { humanFlowDefinition, type HumanFlowState } from "./human-steps";

/**
 * Mission 026 — the Live Preview unlock rule (mission brief section 3):
 *
 *   avant T08 = aucun Preview
 *   T08 = point de déverrouillage
 *   après T08 = Preview disponible
 *
 * This is the ONE place that rule is decided, and the ONE file outside
 * `human-steps.ts` itself allowed to know that "T08" is the unlock step
 * — every other Mission 026 file (the layout mechanic itself, its own
 * tests exercising layout behaviour) receives only the plain boolean
 * this function returns, never a step id. That mirrors `human-steps.ts`'s
 * own stated role as "the one file that knows what T08 means" and keeps
 * `lib/builder/guided-flow/engine.ts` exactly as generic as its own
 * docstring requires — this module calls `stepRuntimeStatus` exactly the
 * way any other caller of the existing engine would, without touching
 * its implementation.
 *
 * Deliberately reuses `stepRuntimeStatus` rather than reading
 * `state.T08?.status` directly: that is what already applies the
 * engine's own fail-safe (a `state.T08` corrupted into `{ status:
 * "skipped" }` can never unlock the Preview, because T08 is declared
 * `skippable: false` in `human-steps.ts` and `stepRuntimeStatus`
 * downgrades a "skipped" record on a non-skippable step to
 * "incomplete" — see engine.ts's own docstring). A hand-rolled read of
 * the raw record here would have quietly reintroduced that exact bypass
 * for the Preview specifically.
 *
 * Takes the real, live `HumanFlowState` a caller already holds — this
 * module does not simulate T08 as built, does not invent a second state
 * shape, and does not cache or memoize a "was T08 ever done" flag
 * anywhere: a state where T08 later gets legitimately un-recorded (a
 * future correction flow, say) simply re-locks the Preview on the very
 * next call, exactly like every other engine.ts resolution.
 */
export function isPreviewUnlocked(
  editorialContext: EditorialContext,
  state: HumanFlowState,
): boolean {
  const flow = humanFlowDefinition(editorialContext);
  const unlockStep = flow.steps.find((step) => step.id === "T08");
  // Defensive only: human-steps.test.ts's own structural guards already
  // ensure STEPS always contains exactly one "T08" entry. If that were
  // ever to stop being true, failing CLOSED (locked) is the only safe
  // default for a family-facing gate — never open.
  if (!unlockStep) return false;
  return stepRuntimeStatus(unlockStep, flow, state) === "completed";
}
