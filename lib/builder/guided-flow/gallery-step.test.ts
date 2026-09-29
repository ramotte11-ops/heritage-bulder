import { describe, expect, it } from "vitest";
import type { MemorialContent } from "@/types/memorial";
import { commitA04 } from "./ceremony-step";
import { skipA09 } from "./traditions-step";
import { commitPersonSheet, skipPersonSheet, writePersonWordsFieldText } from "./person-sheet-step";
import { humanFlowDefinition } from "./human-steps";
import { firstIncompleteStep } from "./engine";
import { readGuidedFlowState } from "./flow-state";
import { commitA13, galleryStepProgress, isA13Resolved, needsA13, readGalleryForEditing, skipA13 } from "./gallery-step";

/** A13 — the Gallery's Guided Flow moment: gate, Continue/Skip, progress; photographs are never touched. */

const id = (n: number) => `${String(n).padStart(8, "0")}-0000-4000-8000-000000000000`;

function requireOk(result: { ok: true; content: MemorialContent } | { ok: false; reason: unknown }): MemorialContent {
  if (!result.ok) throw new Error("test fixture: unexpected write failure");
  return result.content;
}

/** A04 "no", A09 skipped — the A10–A12 sheet is next. */
function beforeSheet(): MemorialContent {
  return requireOk(skipA09(requireOk(commitA04({}, "no"))));
}

/** The sheet resolved too — A13 is next. */
function atA13(): MemorialContent {
  return requireOk(skipPersonSheet(beforeSheet()));
}

function withGallery(content: MemorialContent, n: number): MemorialContent {
  return {
    ...content,
    gallery: { items: Array.from({ length: n }, (_, i) => ({ mediaId: id(i + 1), caption: i === 0 ? "Maman" : null })) },
  } as unknown as MemorialContent;
}

const CORRUPTED = (content: MemorialContent) => ({ ...content, gallery: { items: [{ mediaId: "https://x/original.jpg", caption: null }] } }) as unknown as MemorialContent;

describe("needsA13 — the gate", () => {
  it("is false before the A10–A12 sheet is resolved (never shown too early)", () => {
    expect(needsA13({})).toBe(false);
    expect(needsA13(beforeSheet())).toBe(false);
    expect(needsA13(requireOk(writePersonWordsFieldText(beforeSheet(), "Un texte")))).toBe(false);
  });

  it("is true once the sheet is resolved, whichever way, and the engine agrees A13 is next", () => {
    expect(needsA13(atA13())).toBe(true);
    const committed = requireOk(commitPersonSheet(requireOk(writePersonWordsFieldText(beforeSheet(), "Un texte"))));
    expect(needsA13(committed)).toBe(true);
  });

  it("after A13 the engine moves past it (A13 was the last Announcement step)", () => {
    const done = { status: "completed" as const };
    const skipped = { status: "skipped" as const };
    const state = { T03: done, T04: skipped, T05: skipped, T06: done, T07: done, T08: done, A01: done, A02: skipped, A03: done, A04: { status: "completed" as const, answer: "no" }, A09: skipped, A10: skipped, A11: skipped, A12: skipped };
    const flow = humanFlowDefinition("announcement");
    expect(firstIncompleteStep(flow, state)?.id).toBe("A13");
    expect(firstIncompleteStep(flow, { ...state, ...readGuidedFlowState(requireOk(commitA13(atA13()))) })?.id).not.toBe("A13");
  });

  it("photographs alone never resolve the step — only Continue/Skip do", () => {
    expect(needsA13(withGallery(atA13(), 3))).toBe(true);
    expect(isA13Resolved(withGallery(atA13(), 3))).toBe(false);
  });
});

describe("commitA13 / skipA13", () => {
  it("Continue with photographs: completed; the Gallery is kept byte for byte", () => {
    const before = withGallery(atA13(), 3);
    const after = requireOk(commitA13(before));
    expect(readGuidedFlowState(after).A13).toEqual({ status: "completed" });
    expect((after as { gallery?: unknown }).gallery).toEqual((before as { gallery?: unknown }).gallery);
    expect(needsA13(after)).toBe(false);
  });

  it("Continue with no photograph resolves the step as skipped (Continue is never blocked)", () => {
    const after = requireOk(commitA13(atA13()));
    expect(readGuidedFlowState(after).A13).toEqual({ status: "skipped" });
    expect(needsA13(after)).toBe(false);
  });

  it("Skip keeps every photograph already added", () => {
    const before = withGallery(atA13(), 7);
    const after = requireOk(skipA13(before));
    expect(readGuidedFlowState(after).A13).toEqual({ status: "skipped" });
    expect((after as { gallery?: unknown }).gallery).toEqual((before as { gallery?: unknown }).gallery);
  });

  it("every other StepRecord and matière stays exactly as it was", () => {
    const before = withGallery(atA13(), 2);
    const after = requireOk(commitA13(before));
    const rest = { ...readGuidedFlowState(after) };
    delete rest.A13;
    expect(rest).toEqual(readGuidedFlowState(before));
    const contentBefore = { ...(before as Record<string, unknown>) };
    const contentAfter = { ...(after as Record<string, unknown>) };
    delete contentBefore.guidedFlow;
    delete contentAfter.guidedFlow;
    expect(contentAfter).toEqual(contentBefore);
  });

  it("a corrupted Gallery refuses both — no step is resolved over unreadable content", () => {
    expect(readGalleryForEditing(CORRUPTED(atA13()))).toEqual({ status: "corrupted" });
    expect(commitA13(CORRUPTED(atA13()))).toEqual({ ok: false, reason: "corrupted" });
    expect(skipA13(CORRUPTED(atA13()))).toEqual({ ok: false, reason: "corrupted" });
  });
});

describe("progress", () => {
  it("comes from the real engine and moves forward when A13 is resolved", () => {
    const before = galleryStepProgress("announcement", atA13());
    const after = galleryStepProgress("announcement", requireOk(commitA13(atA13())));
    expect(before).toBeGreaterThan(0);
    expect(before).toBeLessThan(1);
    expect(after).toBeGreaterThan(before);
  });
});
