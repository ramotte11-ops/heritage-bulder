import { describe, expect, it } from "vitest";
import { isCeremonySectionActive } from "./ceremony-section";
import type { HumanFlowState } from "@/lib/builder/guided-flow/human-steps";

describe("isCeremonySectionActive — reuses section-selection.ts, never a second A04 rule", () => {
  it("false when A04 was never answered", () => {
    expect(isCeremonySectionActive("announcement", {})).toBe(false);
  });

  it("false when A04 = no", () => {
    const flowState: HumanFlowState = { A04: { status: "completed", answer: "no" } };
    expect(isCeremonySectionActive("announcement", flowState)).toBe(false);
  });

  it("false when A04 = undecided", () => {
    const flowState: HumanFlowState = { A04: { status: "completed", answer: "undecided" } };
    expect(isCeremonySectionActive("announcement", flowState)).toBe(false);
  });

  it("true when A04 = yes, announcement context", () => {
    const flowState: HumanFlowState = { A04: { status: "completed", answer: "yes" } };
    expect(isCeremonySectionActive("announcement", flowState)).toBe(true);
  });

  it("false for remembrance regardless of A04 — ceremony is not in that context's section list at all", () => {
    const flowState: HumanFlowState = { A04: { status: "completed", answer: "yes" } };
    expect(isCeremonySectionActive("remembrance", flowState)).toBe(false);
  });
});
