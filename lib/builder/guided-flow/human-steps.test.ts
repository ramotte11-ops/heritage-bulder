import { describe, expect, it } from "vitest";
import {
  applicableSteps,
  firstIncompleteStep,
  nextApplicableStep,
  previousApplicableStep,
  stepRuntimeStatus,
} from "./engine";
import {
  STEP_IDS,
  STEPS,
  humanFlowDefinition,
  type HumanFlowState,
  type StepId,
} from "./human-steps";

const REMOVED_STEP_IDS = ["T09", "T10", "P02", "P03", "V01"];

const ANNOUNCEMENT_ORDER_NO_A04: StepId[] = [
  "T03", "T04", "T05", "T06", "T07", "T08",
  "A01", "A02", "A03", "A04", "A09", "A10", "A11", "A12", "A13",
  "P01", "P04", "V02", "V03", "V04",
];

const ANNOUNCEMENT_ORDER_A04_YES: StepId[] = [
  "T03", "T04", "T05", "T06", "T07", "T08",
  "A01", "A02", "A03", "A04", "A05", "A06", "A07", "A08", "A09", "A10", "A11", "A12", "A13",
  "P01", "P04", "V02", "V03", "V04",
];

const REMEMBRANCE_ORDER: StepId[] = [
  "T03", "T04", "T05", "T06", "T07", "T08",
  "M01", "M02", "M03", "M04", "M05", "M06",
  "P01", "P04", "V02", "V03", "V04",
];

describe("STEP_IDS / STEPS — structural guards on the UX-A config itself", () => {
  it("has no duplicate step id", () => {
    expect(new Set(STEP_IDS).size).toBe(STEP_IDS.length);
    expect(new Set(STEPS.map((s) => s.id)).size).toBe(STEPS.length);
  });

  it("declares exactly one StepDefinition per STEP_IDS entry, same set", () => {
    expect(STEPS.map((s) => s.id).sort()).toEqual([...STEP_IDS].sort());
  });

  it("matches the exact UX-A order: common trunk, Announcement, Remembrance, final trunk", () => {
    expect(STEP_IDS).toEqual([
      "T03", "T04", "T05", "T06", "T07", "T08",
      "A01", "A02", "A03", "A04", "A05", "A06", "A07", "A08", "A09", "A10", "A11", "A12", "A13",
      "M01", "M02", "M03", "M04", "M05", "M06",
      "P01", "P04", "V02", "V03", "V04",
    ]);
  });

  it("never reintroduces an officially removed step (T09, T10, P02, P03, V01)", () => {
    for (const removed of REMOVED_STEP_IDS) {
      expect(STEP_IDS as readonly string[]).not.toContain(removed);
    }
  });

  it("marks T06 (main photo) as required and non-skippable", () => {
    const t06 = STEPS.find((s) => s.id === "T06");
    expect(t06).toMatchObject({ required: true, skippable: false });
  });

  it("marks T07 (photo crop) as required and non-skippable", () => {
    const t07 = STEPS.find((s) => s.id === "T07");
    expect(t07).toMatchObject({ required: true, skippable: false });
  });

  it("marks T08 (Hero reveal) as required, non-skippable, and structurally common", () => {
    const t08 = STEPS.find((s) => s.id === "T08");
    expect(t08).toMatchObject({ group: "common", required: true, skippable: false });
  });

  it("keeps required and skippable as exact opposites across the whole UX-A config today", () => {
    // Not an engine invariant (the two fields are independent on
    // purpose — see engine.ts) but a fact about THIS config, worth
    // guarding so a future edit doesn't silently create a required-yet-
    // skippable or optional-yet-non-skippable UX-A step by accident.
    for (const step of STEPS) {
      expect(step.skippable).toBe(!step.required);
    }
  });
});

describe("Announcement route — exact, before A04 is answered", () => {
  const flow = humanFlowDefinition("announcement");

  it("resolves the exact Announcement route with A05-A08 excluded", () => {
    expect(applicableSteps(flow, {}).map((s) => s.id)).toEqual(ANNOUNCEMENT_ORDER_NO_A04);
  });

  it("contains no Remembrance-only step", () => {
    const ids = applicableSteps(flow, {}).map((s) => s.id);
    for (const remembranceOnly of ["M01", "M02", "M03", "M04", "M05", "M06"]) {
      expect(ids).not.toContain(remembranceOnly);
    }
  });
});

describe("Announcement route — A04 conditional branch (A05-A08)", () => {
  const flow = humanFlowDefinition("announcement");

  it("excludes A05-A08 when A04 is not yet answered", () => {
    const ids = applicableSteps(flow, {}).map((s) => s.id);
    for (const conditional of ["A05", "A06", "A07", "A08"]) expect(ids).not.toContain(conditional);
  });

  it("excludes A05-A08 when A04 = no", () => {
    const state: HumanFlowState = { A04: { status: "completed", answer: "no" } };
    const ids = applicableSteps(flow, state).map((s) => s.id);
    for (const conditional of ["A05", "A06", "A07", "A08"]) expect(ids).not.toContain(conditional);
  });

  it("excludes A05-A08 when A04 = undecided", () => {
    const state: HumanFlowState = { A04: { status: "completed", answer: "undecided" } };
    const ids = applicableSteps(flow, state).map((s) => s.id);
    for (const conditional of ["A05", "A06", "A07", "A08"]) expect(ids).not.toContain(conditional);
  });

  it("includes A05-A08, in order, exactly when A04 = yes", () => {
    const state: HumanFlowState = { A04: { status: "completed", answer: "yes" } };
    expect(applicableSteps(flow, state).map((s) => s.id)).toEqual(ANNOUNCEMENT_ORDER_A04_YES);
  });

  it("treats undecided/no as complete, valid answers — A04 itself is not incomplete either way", () => {
    for (const answer of ["undecided", "no"] as const) {
      const state: HumanFlowState = { A04: { status: "completed", answer } };
      const a04Status = applicableSteps(flow, state).find((s) => s.id === "A04");
      expect(a04Status).toBeDefined();
      // firstIncompleteStep must move past A04 onto A09 (A05-A08 are
      // not applicable, so they're skipped over entirely).
      const state2: HumanFlowState = {
        ...state,
        T03: { status: "completed" },
        T04: { status: "skipped" },
        T05: { status: "skipped" },
        T06: { status: "completed" },
        T07: { status: "completed" },
        T08: { status: "completed" },
        A01: { status: "completed" },
        A02: { status: "skipped" },
        A03: { status: "completed" },
      };
      expect(firstIncompleteStep(flow, state2)?.id).toBe("A09");
    }
  });

  it("recalculates the route correctly when A04 changes from no to yes", () => {
    const answeredNo: HumanFlowState = { A04: { status: "completed", answer: "no" } };
    expect(applicableSteps(flow, answeredNo).map((s) => s.id)).not.toContain("A05");

    const changedToYes: HumanFlowState = { A04: { status: "completed", answer: "yes" } };
    const ids = applicableSteps(flow, changedToYes).map((s) => s.id);
    expect(ids).toContain("A05");
    expect(ids).toContain("A08");
  });

  it("A04 = no leaves A05-A08 non-applicable, never incomplete", () => {
    const state: HumanFlowState = { A04: { status: "completed", answer: "no" } };
    for (const id of ["A05", "A06", "A07", "A08"] as const) {
      const step = STEPS.find((s) => s.id === id)!;
      expect(stepRuntimeStatus(step, flow, state)).toBe("notApplicable");
    }
  });
});

describe("Remembrance route — exact", () => {
  const flow = humanFlowDefinition("remembrance");

  it("resolves the exact Remembrance route", () => {
    expect(applicableSteps(flow, {}).map((s) => s.id)).toEqual(REMEMBRANCE_ORDER);
  });

  it("contains no Announcement-only step", () => {
    const ids = applicableSteps(flow, {}).map((s) => s.id);
    for (const announcementOnly of [
      "A01", "A02", "A03", "A04", "A05", "A06", "A07", "A08", "A09", "A10", "A11", "A12", "A13",
    ]) {
      expect(ids).not.toContain(announcementOnly);
    }
  });
});

describe("T03 is the first (future) step once T01/T02 are done — for both routes", () => {
  it("resolves T03 as the first incomplete step for a fresh Announcement flow", () => {
    expect(firstIncompleteStep(humanFlowDefinition("announcement"), {})?.id).toBe("T03");
  });

  it("resolves T03 as the first incomplete step for a fresh Remembrance flow", () => {
    expect(firstIncompleteStep(humanFlowDefinition("remembrance"), {})?.id).toBe("T03");
  });
});

describe("Reprise — first incomplete step, explicit skip, non-applicable", () => {
  const flow = humanFlowDefinition("announcement");

  it("resumes at the first genuinely incomplete required step", () => {
    const state: HumanFlowState = {
      T03: { status: "completed" },
      T04: { status: "completed" },
    };
    expect(firstIncompleteStep(flow, state)?.id).toBe("T05");
  });

  it("does not re-propose an optional step explicitly skipped", () => {
    const state: HumanFlowState = {
      T03: { status: "completed" },
      T04: { status: "skipped" },
    };
    expect(firstIncompleteStep(flow, state)?.id).toBe("T05");
  });

  it("never treats a non-applicable conditional step as incomplete", () => {
    const state: HumanFlowState = {
      T03: { status: "completed" },
      T04: { status: "skipped" },
      T05: { status: "skipped" },
      T06: { status: "completed" },
      T07: { status: "completed" },
      T08: { status: "completed" },
      A01: { status: "completed" },
      A02: { status: "skipped" },
      A03: { status: "completed" },
      A04: { status: "completed", answer: "no" },
    };
    // A05-A08 are not applicable (A04 = no); resume must land on A09.
    expect(firstIncompleteStep(flow, state)?.id).toBe("A09");
  });
});

describe("Previous/Next — skip non-applicable steps correctly", () => {
  it("next() from A04 skips straight to A09 when A05-A08 are not applicable", () => {
    const flow = humanFlowDefinition("announcement");
    const state: HumanFlowState = { A04: { status: "completed", answer: "no" } };
    expect(nextApplicableStep("A04", flow, state)?.id).toBe("A09");
  });

  it("next() from A04 lands on A05 once A04 = yes", () => {
    const flow = humanFlowDefinition("announcement");
    const state: HumanFlowState = { A04: { status: "completed", answer: "yes" } };
    expect(nextApplicableStep("A04", flow, state)?.id).toBe("A05");
  });

  it("previous() can return to an already-completed earlier step", () => {
    const flow = humanFlowDefinition("announcement");
    const state: HumanFlowState = {
      T03: { status: "completed" },
      T04: { status: "completed" },
    };
    expect(previousApplicableStep("T05", flow, state)?.id).toBe("T04");
  });

  it("previous() can return to an explicitly skipped earlier step", () => {
    const flow = humanFlowDefinition("announcement");
    const state: HumanFlowState = {
      T03: { status: "completed" },
      T04: { status: "skipped" },
    };
    expect(previousApplicableStep("T05", flow, state)?.id).toBe("T04");
  });

  it("previous() from T03 (first step) is null", () => {
    const flow = humanFlowDefinition("announcement");
    expect(previousApplicableStep("T03", flow, {})).toBeNull();
  });
});
