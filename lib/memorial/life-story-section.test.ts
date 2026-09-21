import { describe, expect, it } from "vitest";
import type { MemorialContent } from "@/types/memorial";
import { hasLifeStoryMatter, isLifeStorySectionActive, presentLifeStoryMatterIds } from "./life-story-section";

function contentWith(fields: { personWords?: string | null; lovedThings?: string | null; legacy?: string | null }): MemorialContent {
  const content: MemorialContent = {};
  if (fields.personWords !== undefined) (content as Record<string, unknown>).personWords = { text: fields.personWords };
  if (fields.lovedThings !== undefined) (content as Record<string, unknown>).lovedThings = { text: fields.lovedThings };
  if (fields.legacy !== undefined) (content as Record<string, unknown>).legacy = { text: fields.legacy };
  return content;
}

describe("presentLifeStoryMatterIds — canonical order, trims blanks-only to absent", () => {
  it("empty content: []", () => {
    expect(presentLifeStoryMatterIds({})).toEqual([]);
  });

  it("only A12 present: ['A12']", () => {
    expect(presentLifeStoryMatterIds(contentWith({ legacy: "x" }))).toEqual(["A12"]);
  });

  it("entered in reverse (A12, A11, A10 all present): always returns canonical A10 -> A11 -> A12 order", () => {
    expect(
      presentLifeStoryMatterIds(contentWith({ legacy: "c", lovedThings: "b", personWords: "a" })),
    ).toEqual(["A10", "A11", "A12"]);
  });

  it("a whitespace-only text normalizes to absent, same as null", () => {
    expect(presentLifeStoryMatterIds(contentWith({ personWords: "   \n  " }))).toEqual([]);
  });
});

describe("hasLifeStoryMatter", () => {
  it("false when all three are absent", () => {
    expect(hasLifeStoryMatter({})).toBe(false);
  });

  it("true the moment at least one matter has real text", () => {
    expect(hasLifeStoryMatter(contentWith({ lovedThings: "x" }))).toBe(true);
  });
});

describe("isLifeStorySectionActive — reuses section-selection.ts, never a second content rule", () => {
  it("false when no matter has real text (announcement)", () => {
    expect(isLifeStorySectionActive("announcement", {})).toBe(false);
  });

  it("true when at least one matter is present (announcement) — 'story' is a non-core optional section there", () => {
    expect(isLifeStorySectionActive("announcement", contentWith({ personWords: "x" }))).toBe(true);
  });

  it("true when at least one matter is present (remembrance) — 'story' is also listed there", () => {
    expect(isLifeStorySectionActive("remembrance", contentWith({ legacy: "x" }))).toBe(true);
  });

  it("false for remembrance with no matter present", () => {
    expect(isLifeStorySectionActive("remembrance", {})).toBe(false);
  });
});
