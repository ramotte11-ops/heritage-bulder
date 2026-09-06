import { describe, expect, it } from "vitest";
import {
  applicableSteps,
  completedSteps,
  firstIncompleteStep,
  guidedFlowProgress,
  isStepApplicable,
  nextApplicableStep,
  nonApplicableSteps,
  previousApplicableStep,
  resolveGuidedFlow,
  skippedSteps,
  stepRuntimeStatus,
  type FlowDefinition,
  type FlowState,
  type StepDefinition,
} from "./engine";

/**
 * Mission 025 — the engine's own tests use a small SYNTHETIC flow, not
 * UX-A's real steps (human-steps.test.ts covers those). This is
 * deliberate: it proves the engine genuinely knows nothing about
 * "T03"/"announcement" — if these tests needed the real human config to
 * pass, that would itself be evidence of the coupling the mission brief
 * forbids (section 2's "la configuration décrit le parcours", section
 * 14's Pet/future genericity).
 *
 * Synthetic flow: two groups, "alpha" and "omega". "alpha" has a
 * required step (a1), an optional/skippable one (a2), and a
 * conditional one (a3, applicable only once a1's answer is "go").
 * "omega" has one required step (o1). A given run activates "alpha" or
 * "omega" or both, exactly like a human flow activates "common" +
 * "final" + exactly one editorial branch.
 */
type TestId = "a1" | "a2" | "a3" | "o1";
type TestGroup = "alpha" | "omega";

const a3ApplicableWhenA1IsGo = (state: FlowState<TestId>) => state.a1?.answer === "go";

const STEPS: readonly StepDefinition<TestId, TestGroup>[] = [
  { id: "a1", group: "alpha", required: true, skippable: false },
  { id: "a2", group: "alpha", required: false, skippable: true },
  { id: "a3", group: "alpha", required: false, skippable: true, isApplicable: a3ApplicableWhenA1IsGo },
  { id: "o1", group: "omega", required: true, skippable: false },
];

function flow(activeGroups: readonly TestGroup[]): FlowDefinition<TestId, TestGroup> {
  return { steps: STEPS, activeGroups };
}

const ALPHA_ONLY = flow(["alpha"]);
const ALPHA_AND_OMEGA = flow(["alpha", "omega"]);

describe("isStepApplicable / applicableSteps — group + condition, nothing else", () => {
  it("excludes a step whose group isn't active, regardless of any condition", () => {
    const state: FlowState<TestId> = {};
    expect(isStepApplicable(STEPS[3], ALPHA_ONLY, state)).toBe(false); // o1, group omega
    expect(applicableSteps(ALPHA_ONLY, state).map((s) => s.id)).toEqual(["a1", "a2"]);
  });

  it("includes steps from every active group, in canonical (declaration) order", () => {
    const state: FlowState<TestId> = {};
    expect(applicableSteps(ALPHA_AND_OMEGA, state).map((s) => s.id)).toEqual(["a1", "a2", "o1"]);
  });

  it("excludes a conditional step until its condition holds", () => {
    const state: FlowState<TestId> = {};
    expect(applicableSteps(ALPHA_ONLY, state).map((s) => s.id)).not.toContain("a3");
  });

  it("includes a conditional step the moment its condition holds", () => {
    const state: FlowState<TestId> = { a1: { status: "completed", answer: "go" } };
    expect(applicableSteps(ALPHA_ONLY, state).map((s) => s.id)).toEqual(["a1", "a2", "a3"]);
  });

  it("recalculates immediately if the condition later stops holding again — no cached route", () => {
    const wentThenChangedMind: FlowState<TestId> = { a1: { status: "completed", answer: "stop" } };
    expect(applicableSteps(ALPHA_ONLY, wentThenChangedMind).map((s) => s.id)).toEqual(["a1", "a2"]);
  });
});

describe("stepRuntimeStatus — the one place required/optional/skip/non-applicable resolve", () => {
  it("is notApplicable for a step outside the active groups, never incomplete", () => {
    const state: FlowState<TestId> = {};
    expect(stepRuntimeStatus(STEPS[3], ALPHA_ONLY, state)).toBe("notApplicable");
  });

  it("is notApplicable for a conditional step whose condition doesn't hold, never incomplete", () => {
    const state: FlowState<TestId> = { a1: { status: "completed", answer: "stop" } };
    expect(stepRuntimeStatus(STEPS[2], ALPHA_ONLY, state)).toBe("notApplicable");
  });

  it("is incomplete for an untouched applicable step, required or not", () => {
    const state: FlowState<TestId> = {};
    expect(stepRuntimeStatus(STEPS[0], ALPHA_ONLY, state)).toBe("incomplete"); // required a1
    expect(stepRuntimeStatus(STEPS[1], ALPHA_ONLY, state)).toBe("incomplete"); // optional a2
  });

  it("is completed once recorded so, skipped once recorded so", () => {
    const state: FlowState<TestId> = {
      a1: { status: "completed" },
      a2: { status: "skipped" },
    };
    expect(stepRuntimeStatus(STEPS[0], ALPHA_ONLY, state)).toBe("completed");
    expect(stepRuntimeStatus(STEPS[1], ALPHA_ONLY, state)).toBe("skipped");
  });
});

describe("firstIncompleteStep — the reprise doctrine", () => {
  it("returns the first applicable step when nothing is recorded", () => {
    expect(firstIncompleteStep(ALPHA_ONLY, {})?.id).toBe("a1");
  });

  it("skips a required step once it is completed", () => {
    const state: FlowState<TestId> = { a1: { status: "completed" } };
    expect(firstIncompleteStep(ALPHA_ONLY, state)?.id).toBe("a2");
  });

  it("never re-proposes an optional step the family explicitly skipped", () => {
    const state: FlowState<TestId> = {
      a1: { status: "completed" },
      a2: { status: "skipped" },
    };
    // a3 isn't applicable (a1's answer isn't "go"), so the flow is done.
    expect(firstIncompleteStep(ALPHA_ONLY, state)).toBeNull();
  });

  it("never treats a non-applicable step as the first incomplete one", () => {
    const state: FlowState<TestId> = { a1: { status: "completed", answer: "stop" } };
    // a2 untouched, a3 not applicable — must resolve to a2, never a3.
    expect(firstIncompleteStep(ALPHA_ONLY, state)?.id).toBe("a2");
  });

  it("resolves null once every applicable step is completed or skipped", () => {
    const state: FlowState<TestId> = {
      a1: { status: "completed", answer: "go" },
      a2: { status: "skipped" },
      a3: { status: "completed" },
    };
    expect(firstIncompleteStep(ALPHA_ONLY, state)).toBeNull();
  });
});

describe("nextApplicableStep / previousApplicableStep", () => {
  it("walks forward through the applicable route only", () => {
    const state: FlowState<TestId> = {};
    expect(nextApplicableStep("a1", ALPHA_ONLY, state)?.id).toBe("a2");
  });

  it("skips a non-applicable conditional step when walking forward", () => {
    const state: FlowState<TestId> = {}; // a3 not applicable
    expect(nextApplicableStep("a2", ALPHA_ONLY, state)).toBeNull();
  });

  it("includes a conditional step once applicable when walking forward", () => {
    const state: FlowState<TestId> = { a1: { status: "completed", answer: "go" } };
    expect(nextApplicableStep("a2", ALPHA_ONLY, state)?.id).toBe("a3");
  });

  it("walks backward through the applicable route only", () => {
    const state: FlowState<TestId> = { a1: { status: "completed", answer: "go" } };
    expect(previousApplicableStep("a3", ALPHA_ONLY, state)?.id).toBe("a2");
  });

  it("returns to an earlier step even if it was already completed or skipped", () => {
    const state: FlowState<TestId> = {
      a1: { status: "completed" },
      a2: { status: "skipped" },
    };
    expect(previousApplicableStep("a2", ALPHA_ONLY, state)?.id).toBe("a1");
  });

  it("returns null for the first applicable step's previous", () => {
    expect(previousApplicableStep("a1", ALPHA_ONLY, {})).toBeNull();
  });

  it("returns null when currentId isn't part of the route at all right now", () => {
    const state: FlowState<TestId> = {}; // a3 not applicable
    expect(nextApplicableStep("a3", ALPHA_ONLY, state)).toBeNull();
    expect(previousApplicableStep("a3", ALPHA_ONLY, state)).toBeNull();
  });
});

describe("completedSteps / skippedSteps / nonApplicableSteps", () => {
  it("reports exactly the completed steps, in canonical order", () => {
    const state: FlowState<TestId> = {
      a1: { status: "completed", answer: "go" },
      a3: { status: "completed" },
    };
    expect(completedSteps(ALPHA_ONLY, state).map((s) => s.id)).toEqual(["a1", "a3"]);
  });

  it("reports exactly the explicitly-skipped steps", () => {
    const state: FlowState<TestId> = { a2: { status: "skipped" } };
    expect(skippedSteps(ALPHA_ONLY, state).map((s) => s.id)).toEqual(["a2"]);
  });

  it("reports steps outside the active groups and conditionally-inapplicable steps alike", () => {
    const state: FlowState<TestId> = {}; // a3 condition unmet, o1 wrong group
    expect(nonApplicableSteps(ALPHA_ONLY, state).map((s) => s.id).sort()).toEqual(["a3", "o1"]);
  });
});

describe("guidedFlowProgress — bounded, monotonic within a stable route, no fixed total", () => {
  it("is 0 when nothing in the route is done", () => {
    expect(guidedFlowProgress(ALPHA_ONLY, {})).toBe(0);
  });

  it("is 1 once every applicable step is completed or skipped", () => {
    const state: FlowState<TestId> = { a1: { status: "completed" }, a2: { status: "skipped" } };
    expect(guidedFlowProgress(ALPHA_ONLY, state)).toBe(1);
  });

  it("stays within [0, 1] and increases monotonically as a STABLE route gets completed", () => {
    let state: FlowState<TestId> = {};
    let previous = guidedFlowProgress(ALPHA_ONLY, state);
    expect(previous).toBeGreaterThanOrEqual(0);

    state = { ...state, a1: { status: "completed" } };
    let next = guidedFlowProgress(ALPHA_ONLY, state);
    expect(next).toBeGreaterThanOrEqual(previous);
    expect(next).toBeLessThanOrEqual(1);
    previous = next;

    state = { ...state, a2: { status: "skipped" } };
    next = guidedFlowProgress(ALPHA_ONLY, state);
    expect(next).toBeGreaterThanOrEqual(previous);
    expect(next).toBeLessThanOrEqual(1);
  });

  it("does not assume every route has the same step count — two flows, two denominators", () => {
    const alphaProgress = guidedFlowProgress(ALPHA_ONLY, { a1: { status: "completed" } });
    const bothProgress = guidedFlowProgress(ALPHA_AND_OMEGA, { a1: { status: "completed" } });
    // Same numerator (1 done), different denominators (2 vs 3 applicable
    // steps) — the two must differ, proving neither is a hardcoded total.
    expect(alphaProgress).not.toBe(bothProgress);
  });

  it("never divides by a hardcoded total — an empty step list resolves to 1, not NaN or a crash", () => {
    const empty: FlowDefinition<TestId, TestGroup> = { steps: [], activeGroups: ["alpha"] };
    expect(guidedFlowProgress(empty, {})).toBe(1);
  });
});

describe("resolveGuidedFlow — one bundled call", () => {
  it("bundles route, firstIncomplete, completed, skipped and progress consistently", () => {
    const state: FlowState<TestId> = { a1: { status: "completed" }, a2: { status: "skipped" } };
    const resolution = resolveGuidedFlow(ALPHA_ONLY, state);

    expect(resolution.route.map((s) => s.id)).toEqual(["a1", "a2"]);
    expect(resolution.firstIncomplete).toBeNull();
    expect(resolution.completed.map((s) => s.id)).toEqual(["a1"]);
    expect(resolution.skipped.map((s) => s.id)).toEqual(["a2"]);
    expect(resolution.progress).toBe(1);
  });
});

describe("determinism and purity — same config + same state -> same result, no mutation", () => {
  it("returns deep-equal results across repeated calls with the same inputs", () => {
    const state: FlowState<TestId> = { a1: { status: "completed", answer: "go" } };
    const first = resolveGuidedFlow(ALPHA_ONLY, state);
    const second = resolveGuidedFlow(ALPHA_ONLY, state);
    expect(second).toEqual(first);
  });

  it("never mutates the FlowState it was given", () => {
    const state: FlowState<TestId> = Object.freeze({
      a1: Object.freeze({ status: "completed" as const, answer: "go" }),
    });
    // Object.freeze makes any attempted mutation throw in strict-mode
    // ESM — calling every function against it is itself the guard.
    expect(() => {
      applicableSteps(ALPHA_ONLY, state);
      firstIncompleteStep(ALPHA_ONLY, state);
      nextApplicableStep("a1", ALPHA_ONLY, state);
      previousApplicableStep("a2", ALPHA_ONLY, state);
      guidedFlowProgress(ALPHA_ONLY, state);
      resolveGuidedFlow(ALPHA_ONLY, state);
    }).not.toThrow();
  });

  it("never mutates the FlowDefinition's steps array", () => {
    const before = JSON.stringify(
      STEPS.map(({ id, group, required, skippable }) => ({ id, group, required, skippable })),
    );
    resolveGuidedFlow(ALPHA_AND_OMEGA, { a1: { status: "completed", answer: "go" } });
    const after = JSON.stringify(
      STEPS.map(({ id, group, required, skippable }) => ({ id, group, required, skippable })),
    );
    expect(after).toBe(before);
  });
});
