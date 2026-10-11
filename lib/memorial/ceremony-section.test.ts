import { describe, expect, it } from "vitest";
import { isCeremonySectionActive } from "./ceremony-section";
import type { HumanFlowState } from "@/lib/builder/guided-flow/human-steps";

describe("isCeremonySectionActive — reuses section-selection.ts, never a second A04 rule", () => {
  it("false when A04 was never answered", () => {
    expect(isCeremonySectionActive({})).toBe(false);
  });

  it("false when A04 = no", () => {
    const flowState: HumanFlowState = { A04: { status: "completed", answer: "no" } };
    expect(isCeremonySectionActive(flowState)).toBe(false);
  });

  it("false when A04 = undecided", () => {
    const flowState: HumanFlowState = { A04: { status: "completed", answer: "undecided" } };
    expect(isCeremonySectionActive(flowState)).toBe(false);
  });

  it("true when A04 = yes", () => {
    const flowState: HumanFlowState = { A04: { status: "completed", answer: "yes" } };
    expect(isCeremonySectionActive(flowState)).toBe(true);
  });

  it("B02-L2 — independent of the death notice: A04 = yes activates it whatever A00 answered", () => {
    for (const A00 of [
      { status: "completed", answer: "yes" },
      { status: "completed", answer: "no" },
      { status: "skipped", answer: "later" },
    ] as const) {
      const flowState: HumanFlowState = { A00: { ...A00 }, A04: { status: "completed", answer: "yes" } };
      expect(isCeremonySectionActive(flowState)).toBe(true);
    }
  });

  it("takes the flow state only — no editorial context any more", () => {
    expect(isCeremonySectionActive.length).toBe(1);
  });
});
