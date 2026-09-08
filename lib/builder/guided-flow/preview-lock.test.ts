import { describe, expect, it } from "vitest";
import type { EditorialContext } from "@/config/memorial";
import { isPreviewUnlocked } from "./preview-lock";
import type { HumanFlowState } from "./human-steps";

/**
 * Mission 026 — `isPreviewUnlocked` is the one seam the layout mechanic
 * itself reads to decide "locked" vs "unlocked" (mission brief section
 * 3), so these tests exercise the rule directly against the real,
 * unmodified Guided Flow Engine + UX-A step config (Mission 025) —
 * never a mock of either. Mission 026 does not build T08 as a real
 * screen; these fixtures construct plausible `HumanFlowState` values by
 * hand, exactly the way a future T08 screen's own persistence would.
 */

const CONTEXTS: EditorialContext[] = ["announcement", "remembrance"];

describe("isPreviewUnlocked — before T08", () => {
  it("is locked when no step has been touched at all", () => {
    for (const editorialContext of CONTEXTS) {
      expect(isPreviewUnlocked(editorialContext, {})).toBe(false);
    }
  });

  it("is locked while T08 itself is simply untouched, even if later steps have data", () => {
    // Implausible in a real, non-skippable route, but exactly the kind
    // of malformed/partial state the engine's own docstring says must
    // never be trusted at face value.
    const state: HumanFlowState = { A01: { status: "completed" } };
    expect(isPreviewUnlocked("announcement", state)).toBe(false);
  });

  it("is locked while every common-trunk step up to (but excluding) T08 is completed", () => {
    const state: HumanFlowState = {
      T03: { status: "completed" },
      T04: { status: "skipped" },
      T05: { status: "skipped" },
      T06: { status: "completed" },
      T07: { status: "completed" },
    };
    for (const editorialContext of CONTEXTS) {
      expect(isPreviewUnlocked(editorialContext, state)).toBe(false);
    }
  });

  it("is locked when T08 is corrupted into a 'skipped' record — T08 is not skippable", () => {
    // The exact fail-safe engine.ts's stepRuntimeStatus documents: a
    // non-skippable step's "skipped" record must never be trusted.
    // Reading state.T08?.status directly here would have unlocked the
    // Preview on bad data; going through the engine must not.
    const state: HumanFlowState = { T08: { status: "skipped" } };
    for (const editorialContext of CONTEXTS) {
      expect(isPreviewUnlocked(editorialContext, state)).toBe(false);
    }
  });
});

describe("isPreviewUnlocked — at and after T08", () => {
  it("is unlocked the moment T08 itself is recorded completed, regardless of anything else", () => {
    const state: HumanFlowState = { T08: { status: "completed" } };
    for (const editorialContext of CONTEXTS) {
      expect(isPreviewUnlocked(editorialContext, state)).toBe(true);
    }
  });

  it("stays unlocked once T08 is completed even while later steps are still incomplete", () => {
    const state: HumanFlowState = {
      T03: { status: "completed" },
      T06: { status: "completed" },
      T07: { status: "completed" },
      T08: { status: "completed" },
      // A01+ / M01+ deliberately untouched — the family has only just
      // crossed the unlock point.
    };
    expect(isPreviewUnlocked("announcement", state)).toBe(true);
    expect(isPreviewUnlocked("remembrance", state)).toBe(true);
  });

  it("is identical for both editorial contexts — the rule is agnostic to which branch is active", () => {
    const state: HumanFlowState = { T08: { status: "completed" } };
    expect(isPreviewUnlocked("announcement", state)).toBe(
      isPreviewUnlocked("remembrance", state),
    );
  });
});

describe("isPreviewUnlocked — never touches Skin/Offer/Etsy", () => {
  it("has exactly the (editorialContext, state) signature — nothing else to read a Skin or OfferId from", () => {
    expect(isPreviewUnlocked.length).toBe(2);
  });
});
