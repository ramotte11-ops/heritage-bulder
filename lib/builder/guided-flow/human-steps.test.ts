import { describe, expect, it } from "vitest";
import {
  applicableSteps,
  completedSteps,
  firstIncompleteStep,
  nextApplicableStep,
  previousApplicableStep,
  skippedSteps,
  stepRuntimeStatus,
} from "./engine";
import {
  STEP_IDS,
  STEPS,
  humanFlowDefinition,
  isAnnouncementVisible,
  resolveA00Record,
  type HumanFlowState,
  type StepId,
} from "./human-steps";

/** A00 answered "yes": the death notice (A01-A03) is part of the route. */
const A00_YES: HumanFlowState = { A00: { status: "completed", answer: "yes" } };

const REMOVED_STEP_IDS = ["T09", "T10", "P02", "P03", "V01"];

const ANNOUNCEMENT_ORDER_NO_A04: StepId[] = [
  "T03", "T04", "A00", "T05", "T06", "T07", "T08",
  "A01", "A02", "A03", "A04", "A09", "A10", "A11", "A12", "A13",
  "P01", "P04", "V02", "V03", "V04",
];

const ANNOUNCEMENT_ORDER_A04_YES: StepId[] = [
  "T03", "T04", "A00", "T05", "T06", "T07", "T08",
  "A01", "A02", "A03", "A04", "A05", "A06", "A07", "A08", "A09", "A10", "A11", "A12", "A13",
  "P01", "P04", "V02", "V03", "V04",
];

/** A00 = no / later (B02-L2): no death notice, no A09 — the ceremony
 * question (A04) and every tribute section stay. */
const NO_NOTICE_ORDER_NO_A04: StepId[] = [
  "T03", "T04", "A00", "T05", "T06", "T07", "T08",
  "A04", "A10", "A11", "A12", "A13",
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

  it("matches the exact single-route order: common trunk, tribute sections, final trunk", () => {
    expect(STEP_IDS).toEqual([
      "T03", "T04", "A00", "T05", "T06", "T07", "T08",
      "A01", "A02", "A03", "A04", "A05", "A06", "A07", "A14", "A08", "A09", "A10", "A11", "A12", "A13",
      "P01", "P04", "V02", "V03", "V04",
    ]);
  });

  it("B02-L2 — no Mémoire & Hommage branch any more (M01-M06 removed)", () => {
    for (const removed of ["M01", "M02", "M03", "M04", "M05", "M06"]) {
      expect(STEP_IDS as readonly string[]).not.toContain(removed);
    }
    expect(new Set(STEPS.map((s) => s.group))).toEqual(new Set(["common", "announcement", "final"]));
  });

  it("B02-L2 — humanFlowDefinition takes no editorial context and activates every group", () => {
    expect(humanFlowDefinition.length).toBe(0);
    expect([...humanFlowDefinition().activeGroups].sort()).toEqual(["announcement", "common", "final"]);
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

describe("Single route — exact, before A04 is answered", () => {
  const flow = humanFlowDefinition();

  it("A00 = yes: the death notice (A01-A03) and A09 are part of the route, A05-A08 excluded", () => {
    expect(applicableSteps(flow, A00_YES).map((s) => s.id)).toEqual(ANNOUNCEMENT_ORDER_NO_A04);
  });

  it.each([
    ["no", { status: "completed", answer: "no" }],
    ["later", { status: "skipped", answer: "later" }],
  ] as const)("A00 = %s: no death notice and no A09, the ceremony and the tribute sections stay", (_answer, record) => {
    expect(applicableSteps(flow, { A00: { ...record } }).map((s) => s.id)).toEqual(NO_NOTICE_ORDER_NO_A04);
  });

  it("not answered yet: same as no — nothing announcement-related is assumed", () => {
    expect(applicableSteps(flow, {}).map((s) => s.id)).toEqual(NO_NOTICE_ORDER_NO_A04);
  });
});

describe("Announcement route — A04 conditional branch (A05-A08)", () => {
  const flow = humanFlowDefinition();

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
    const state: HumanFlowState = { ...A00_YES, A04: { status: "completed", answer: "yes" } };
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
        ...A00_YES,
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

describe("T03 is the first step once T01 (and the Welcome) are done", () => {
  it("resolves T03 as the first incomplete step for a fresh flow", () => {
    expect(firstIncompleteStep(humanFlowDefinition(), {})?.id).toBe("T03");
  });
});

describe("Reprise — first incomplete step, explicit skip, non-applicable", () => {
  const flow = humanFlowDefinition();

  it("resumes at the first genuinely incomplete step — A00, right after identity", () => {
    const state: HumanFlowState = {
      T03: { status: "completed" },
      T04: { status: "completed" },
    };
    expect(firstIncompleteStep(flow, state)?.id).toBe("A00");
  });

  it("does not re-propose an optional step explicitly skipped", () => {
    const state: HumanFlowState = {
      T03: { status: "completed" },
      T04: { status: "skipped" },
      A00: { status: "skipped", answer: "later" },
    };
    expect(firstIncompleteStep(flow, state)?.id).toBe("T05");
  });

  it("never treats a non-applicable conditional step as incomplete", () => {
    const state: HumanFlowState = {
      ...A00_YES,
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

  it("A00 = no: after the ceremony question, resume lands on the person sheet (A10), never A09", () => {
    const state: HumanFlowState = {
      A00: { status: "completed", answer: "no" },
      T03: { status: "completed" },
      T04: { status: "skipped" },
      T05: { status: "skipped" },
      T06: { status: "completed" },
      T07: { status: "completed" },
      T08: { status: "completed" },
      A04: { status: "completed", answer: "undecided" },
    };
    expect(firstIncompleteStep(flow, state)?.id).toBe("A10");
  });

  it("A00 = later, right after the Hero: resume lands on the ceremony question (A04)", () => {
    const state: HumanFlowState = {
      A00: { status: "skipped", answer: "later" },
      T03: { status: "completed" },
      T04: { status: "skipped" },
      T05: { status: "skipped" },
      T06: { status: "completed" },
      T07: { status: "completed" },
      T08: { status: "completed" },
    };
    expect(firstIncompleteStep(flow, state)?.id).toBe("A04");
  });
});

describe("Previous/Next — skip non-applicable steps correctly", () => {
  it("next() from A04 skips straight to A09 when A05-A08 are not applicable", () => {
    const flow = humanFlowDefinition();
    const state: HumanFlowState = { ...A00_YES, A04: { status: "completed", answer: "no" } };
    expect(nextApplicableStep("A04", flow, state)?.id).toBe("A09");
  });

  it("next() from A04 lands on A05 once A04 = yes", () => {
    const flow = humanFlowDefinition();
    const state: HumanFlowState = { A04: { status: "completed", answer: "yes" } };
    expect(nextApplicableStep("A04", flow, state)?.id).toBe("A05");
  });

  it("previous() can return to an already-completed earlier step", () => {
    const flow = humanFlowDefinition();
    const state: HumanFlowState = {
      T03: { status: "completed" },
      T04: { status: "completed" },
    };
    expect(previousApplicableStep("A00", flow, state)?.id).toBe("T04");
  });

  it("previous() can return to an explicitly skipped earlier step", () => {
    const flow = humanFlowDefinition();
    const state: HumanFlowState = {
      T03: { status: "completed" },
      T04: { status: "skipped" },
      A00: { status: "skipped", answer: "later" },
    };
    expect(previousApplicableStep("T05", flow, state)?.id).toBe("A00");
  });

  it("previous() from T03 (first step) is null", () => {
    const flow = humanFlowDefinition();
    expect(previousApplicableStep("T03", flow, {})).toBeNull();
  });
});

describe("QG micro-hardening — a skippable:false UX-A step can never resolve as skipped", () => {
  // Every currently required (skippable: false) step in the UX-A
  // config — T03/T06/T07/T08/A01/A03/A04/V02/V03/V04 (A01/A03 with A00 = yes).
  const NON_SKIPPABLE_ANNOUNCEMENT: StepId[] = [
    "T03", "T06", "T07", "T08", "A01", "A03", "A04", "V02", "V03", "V04",
  ];

  it.each(NON_SKIPPABLE_ANNOUNCEMENT)(
    "%s: a corrupt 'skipped' record resolves as incomplete, never skipped",
    (id) => {
      const flow = humanFlowDefinition();
      const corruptState: HumanFlowState = { ...A00_YES, [id]: { status: "skipped" } } as HumanFlowState;
      const step = STEPS.find((s) => s.id === id)!;
      expect(stepRuntimeStatus(step, flow, corruptState)).toBe("incomplete");
    },
  );

  it("V04 artificially marked 'skipped' can never be considered done", () => {
    const flow = humanFlowDefinition();
    const corruptState: HumanFlowState = { V04: { status: "skipped" } };
    const v04 = STEPS.find((s) => s.id === "V04")!;

    expect(stepRuntimeStatus(v04, flow, corruptState)).toBe("incomplete");
    expect(completedSteps(flow, corruptState).map((s) => s.id)).not.toContain("V04");
    expect(skippedSteps(flow, corruptState).map((s) => s.id)).not.toContain("V04");
  });

  it("V04 artificially marked 'skipped' still surfaces as the resume target once everything else is done", () => {
    const flow = humanFlowDefinition();
    const state: HumanFlowState = {
      ...A00_YES,
      T03: { status: "completed" }, T04: { status: "skipped" }, T05: { status: "skipped" },
      T06: { status: "completed" }, T07: { status: "completed" }, T08: { status: "completed" },
      A01: { status: "completed" }, A02: { status: "skipped" }, A03: { status: "completed" },
      A04: { status: "completed", answer: "no" },
      A09: { status: "skipped" }, A10: { status: "skipped" }, A11: { status: "skipped" },
      A12: { status: "skipped" }, A13: { status: "skipped" },
      P01: { status: "skipped" }, P04: { status: "skipped" },
      V02: { status: "completed" }, V03: { status: "completed" },
      V04: { status: "skipped" }, // corrupt/illegal for a skippable:false step
    };

    expect(firstIncompleteStep(flow, state)?.id).toBe("V04");
  });

  it("a genuinely skippable step (e.g. T04) still resolves as skipped normally — the fix is scoped to skippable:false only", () => {
    const flow = humanFlowDefinition();
    const state: HumanFlowState = { T04: { status: "skipped" } };
    const t04 = STEPS.find((s) => s.id === "T04")!;
    expect(stepRuntimeStatus(t04, flow, state)).toBe("skipped");
  });
});

describe("A09 (Traditions & repères) — conditioned by the death notice (PO doctrine)", () => {
  const flow = humanFlowDefinition();
  const a09 = STEPS.find((s) => s.id === "A09")!;

  it("applicable only when A00 = yes", () => {
    expect(stepRuntimeStatus(a09, flow, A00_YES)).toBe("incomplete");
    expect(stepRuntimeStatus(a09, flow, { A00: { status: "completed", answer: "no" } })).toBe("notApplicable");
    expect(stepRuntimeStatus(a09, flow, { A00: { status: "skipped", answer: "later" } })).toBe("notApplicable");
  });

  it("a record already written is kept, and counts again once A00 returns to yes", () => {
    const hidden: HumanFlowState = { A00: { status: "completed", answer: "no" }, A09: { status: "completed" } };
    expect(stepRuntimeStatus(a09, flow, hidden)).toBe("notApplicable");
    expect(hidden.A09).toEqual({ status: "completed" });
    expect(stepRuntimeStatus(a09, flow, { ...hidden, ...A00_YES })).toBe("completed");
  });
});

describe("A00 — the death-notice choice", () => {
  const flow = humanFlowDefinition();
  const step = (id: StepId) => STEPS.find((s) => s.id === id)!;

  it("sits between identity (T04) and the Hero (T05), optional and skippable", () => {
    const ids = STEPS.map((s) => s.id);
    expect(ids.indexOf("A00")).toBe(ids.indexOf("T04") + 1);
    expect(ids.indexOf("T05")).toBe(ids.indexOf("A00") + 1);
    expect(step("A00")).toMatchObject({ group: "common", required: false, skippable: true });
  });

  it("before any answer: A00 is incomplete and A01-A03 are not part of the route yet", () => {
    expect(stepRuntimeStatus(step("A00"), flow, {})).toBe("incomplete");
    const ids = applicableSteps(flow, {}).map((s) => s.id);
    for (const id of ["A01", "A02", "A03"]) expect(ids).not.toContain(id);
    expect(ids).toContain("A04");
  });

  it("yes: A01-A03 are part of the route", () => {
    const ids = applicableSteps(flow, A00_YES).map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(["A01", "A02", "A03"]));
    expect(stepRuntimeStatus(step("A00"), flow, A00_YES)).toBe("completed");
  });

  it.each([
    ["no", { status: "completed", answer: "no" }, "completed"],
    ["later", { status: "skipped", answer: "later" }, "skipped"],
  ] as const)("%s: A00 is resolved, A01-A03 non-applicable, the ceremony (A04) still asked", (_answer, record, status) => {
    const state: HumanFlowState = { A00: { ...record } };
    expect(stepRuntimeStatus(step("A00"), flow, state)).toBe(status);
    for (const id of ["A01", "A02", "A03"] as const) {
      expect(stepRuntimeStatus(step(id), flow, state)).toBe("notApplicable");
    }
    expect(stepRuntimeStatus(step("A04"), flow, state)).toBe("incomplete");
  });

  it("no: notice records already written stay stored, simply not applicable", () => {
    const state: HumanFlowState = {
      A00: { status: "completed", answer: "no" },
      A01: { status: "completed" },
      A03: { status: "completed", answer: "0f3a9c21" },
    };
    expect(isAnnouncementVisible(state)).toBe(false);
    expect(stepRuntimeStatus(step("A01"), flow, state)).toBe("notApplicable");
    expect(state.A01).toEqual({ status: "completed" });
  });

  it("a pre-A00 draft that already validated its announcement (A01 completed) reads as yes", () => {
    const legacy: HumanFlowState = { A01: { status: "completed" } };
    expect(resolveA00Record(legacy)).toEqual({ status: "completed", answer: "yes" });
    expect(isAnnouncementVisible(legacy)).toBe(true);
    expect(applicableSteps(flow, legacy).map((s) => s.id)).toContain("A01");
  });

  it("an explicit answer always wins over that derivation", () => {
    const state: HumanFlowState = { A00: { status: "completed", answer: "no" }, A01: { status: "completed" } };
    expect(isAnnouncementVisible(state)).toBe(false);
  });

  it("is asked of every family: part of the route whatever the stored state, except a pre-A00 validated notice", () => {
    expect(applicableSteps(flow, {}).map((s) => s.id)).toContain("A00");
    expect(applicableSteps(flow, { A01: { status: "completed" } }).map((s) => s.id)).not.toContain("A00");
  });

  it("an old M01-M06 record left in a draft is simply not read", () => {
    const legacy = { M01: { status: "completed" } } as unknown as HumanFlowState;
    expect(applicableSteps(flow, legacy).map((s) => s.id)).toEqual(NO_NOTICE_ORDER_NO_A04);
  });
});
