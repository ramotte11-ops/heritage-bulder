import { describe, expect, it } from "vitest";
import type { MemorialContent } from "@/types/memorial";
import { hasStoryContent, isStorySectionActive } from "./story-section";

// Fictional test fixture only — never real family content.
const FIXTURE_TEXT = "Elle avait toujours le mot pour rire.";

describe("hasStoryContent — true iff at least one of the three matières is genuinely present", () => {
  it("false for an entirely empty content", () => {
    expect(hasStoryContent({})).toBe(false);
  });

  it("false when all three matières are explicitly null", () => {
    const content = {
      personWords: { text: null },
      lovedThings: { text: null },
      legacy: { text: null },
    } as unknown as MemorialContent;
    expect(hasStoryContent(content)).toBe(false);
  });

  it("true when only A10 has text", () => {
    const content = { personWords: { text: FIXTURE_TEXT } } as unknown as MemorialContent;
    expect(hasStoryContent(content)).toBe(true);
  });

  it("true when only A11 has text", () => {
    const content = { lovedThings: { text: FIXTURE_TEXT } } as unknown as MemorialContent;
    expect(hasStoryContent(content)).toBe(true);
  });

  it("true when only A12 has text", () => {
    const content = { legacy: { text: FIXTURE_TEXT } } as unknown as MemorialContent;
    expect(hasStoryContent(content)).toBe(true);
  });

  it("a corrupted matière is treated as absent, never throws", () => {
    const content = { personWords: { text: "x", title: "y" } } as unknown as MemorialContent;
    expect(() => hasStoryContent(content)).not.toThrow();
    expect(hasStoryContent(content)).toBe(false);
  });
});

describe("isStorySectionActive — reuses section-selection.ts's generic content signal, never a second rule", () => {
  it("false for announcement with no matière content", () => {
    expect(isStorySectionActive("announcement", {})).toBe(false);
  });

  it("true for announcement once at least one matière has text", () => {
    const content = { personWords: { text: FIXTURE_TEXT } } as unknown as MemorialContent;
    expect(isStorySectionActive("announcement", content)).toBe(true);
  });

  it("true for announcement with all three matières present", () => {
    const content = {
      personWords: { text: FIXTURE_TEXT },
      lovedThings: { text: FIXTURE_TEXT },
      legacy: { text: FIXTURE_TEXT },
    } as unknown as MemorialContent;
    expect(isStorySectionActive("announcement", content)).toBe(true);
  });

  it("false for remembrance with no matière content", () => {
    expect(isStorySectionActive("remembrance", {})).toBe(false);
  });

  it("true for remembrance once at least one matière has text — 'story' is listed for both contexts in config/sections.ts", () => {
    const content = { legacy: { text: FIXTURE_TEXT } } as unknown as MemorialContent;
    expect(isStorySectionActive("remembrance", content)).toBe(true);
  });
});
