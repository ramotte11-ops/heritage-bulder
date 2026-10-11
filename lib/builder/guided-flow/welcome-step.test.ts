import { describe, expect, it } from "vitest";
import type { MemorialContent } from "@/types/memorial";
import { commitWelcome, needsWelcome } from "./welcome-step";
import { readGuidedFlowState } from "./flow-state";
import { commitPageA, writeDisplayName } from "./hero-step";

const EMPTY: MemorialContent = {};

describe("needsWelcome — shown once, only to a draft nobody has started", () => {
  it("is true for a brand-new draft: no editorial context, empty content", () => {
    expect(needsWelcome(null, EMPTY)).toBe(true);
  });

  it("is false once the Welcome's own CTA has been pressed", () => {
    expect(needsWelcome(null, commitWelcome(EMPTY))).toBe(false);
  });

  it("is false for any draft that already holds content (resumed draft, including pre-Welcome drafts)", () => {
    const autosaved = writeDisplayName(EMPTY, "Jeanne Dupont");
    if (!autosaved.ok) throw new Error("fixture");
    expect(needsWelcome(null, autosaved.content)).toBe(false);
    expect(needsWelcome(null, { guidedFlow: {} } as MemorialContent)).toBe(false);
  });

  it("is false whenever an editorial context is already recorded (every draft that passed T02)", () => {
    expect(needsWelcome("announcement", EMPTY)).toBe(false);
    expect(needsWelcome("remembrance", EMPTY)).toBe(false);
  });
});

describe("commitWelcome — a marker only, nothing else touched", () => {
  it("adds `welcome` and keeps every other content key, including unknown guidedFlow keys", () => {
    const content = {
      hero: { displayName: "Jeanne Dupont", birth: null, death: null, shortPhrase: null, photo: null },
      guidedFlow: { T04: { status: "skipped" }, A00: { status: "completed", answer: "yes" } },
    } as unknown as MemorialContent;

    const committed = commitWelcome(content) as Record<string, unknown>;

    expect(committed.welcome).toEqual({ status: "completed" });
    expect(committed.hero).toEqual((content as Record<string, unknown>).hero);
    expect(committed.guidedFlow).toEqual((content as Record<string, unknown>).guidedFlow);
  });

  it("never mutates its input", () => {
    const content: MemorialContent = {};
    commitWelcome(content);
    expect(content).toEqual({});
  });

  it("does not count as a Guided Flow step and survives every later step write", () => {
    const welcomed = commitWelcome(EMPTY);
    expect(readGuidedFlowState(welcomed)).toEqual({});

    const named = writeDisplayName(welcomed, "Jeanne Dupont");
    if (!named.ok) throw new Error("fixture");
    const pageA = commitPageA(named.content);
    if (!pageA.ok) throw new Error("fixture");

    expect((pageA.content as Record<string, unknown>).welcome).toEqual({ status: "completed" });
    expect(needsWelcome(null, pageA.content)).toBe(false);
  });
});
