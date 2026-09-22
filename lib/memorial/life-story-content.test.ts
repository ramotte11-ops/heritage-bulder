import { describe, expect, it } from "vitest";
import type { MemorialContent } from "@/types/memorial";
import {
  countLifeStoryCodePoints,
  normalizeLifeStoryText,
  resolveLifeStoryContent,
  resolveLifeStoryMatter,
} from "./life-story-content";

function contentWith(fields: { personWords?: string | null; lovedThings?: string | null; legacy?: string | null }): MemorialContent {
  const content: MemorialContent = {};
  if (fields.personWords !== undefined) (content as Record<string, unknown>).personWords = { text: fields.personWords };
  if (fields.lovedThings !== undefined) (content as Record<string, unknown>).lovedThings = { text: fields.lovedThings };
  if (fields.legacy !== undefined) (content as Record<string, unknown>).legacy = { text: fields.legacy };
  return content;
}

describe("normalizeLifeStoryText — execution-contract.json's own rule, verbatim", () => {
  it("collapses internal newlines and runs of whitespace to one space", () => {
    expect(normalizeLifeStoryText("Elle  aimait\n\nles livres.")).toBe("Elle aimait les livres.");
  });

  it("trims peripheral whitespace", () => {
    expect(normalizeLifeStoryText("   Bonjour   ")).toBe("Bonjour");
  });

  it("a whitespace-only string normalizes to the empty string", () => {
    expect(normalizeLifeStoryText("   \n\t  ")).toBe("");
  });

  it("NFC-normalizes (decomposed accents collapse to their precomposed form)", () => {
    const decomposed = "élégant"; // e + combining acute, twice
    expect(normalizeLifeStoryText(decomposed)).toBe("élégant");
  });
});

describe("countLifeStoryCodePoints — Unicode code points, never UTF-16 units", () => {
  it("counts plain ASCII 1:1", () => {
    expect(countLifeStoryCodePoints("Bonjour")).toBe(7);
  });

  it("counts an astral character (surrogate pair) as one code point", () => {
    expect(countLifeStoryCodePoints("🌿")).toBe(1);
    expect("🌿".length).toBe(2); // the UTF-16 unit count this deliberately does NOT use
  });
});

describe("resolveLifeStoryMatter — family text present", () => {
  it("uses the normalized family text verbatim, isFallback false", () => {
    const content = contentWith({ personWords: "Elle aimait  les livres." });
    const result = resolveLifeStoryMatter("a10", content, "fr");
    expect(result.familyText).toBe("Elle aimait les livres.");
    expect(result.displayText).toBe("Elle aimait les livres.");
    expect(result.isFallback).toBe(false);
  });

  it("never replaces present family text with the fallback", () => {
    const content = contentWith({ lovedThings: "Les fleurs." });
    const result = resolveLifeStoryMatter("a11", content, "fr");
    expect(result.displayText).toBe("Les fleurs.");
    expect(result.displayText).not.toBe("Ce sont souvent les choses les plus simples qui deviennent nos souvenirs les plus précieux.");
  });
});

describe("resolveLifeStoryMatter — family text absent -> HERITAGE fallback", () => {
  it("A10 absent: the locked FR fallback, isFallback true", () => {
    const result = resolveLifeStoryMatter("a10", {}, "fr");
    expect(result.familyText).toBeNull();
    expect(result.isFallback).toBe(true);
    expect(result.displayText).toBe("Une vie se raconte aussi dans les souvenirs qu’elle laisse derrière elle.");
  });

  it("A11 absent: the locked FR fallback", () => {
    const result = resolveLifeStoryMatter("a11", {}, "fr");
    expect(result.displayText).toBe("Ce sont souvent les choses les plus simples qui deviennent nos souvenirs les plus précieux.");
  });

  it("A12 absent: the locked FR fallback", () => {
    const result = resolveLifeStoryMatter("a12", {}, "fr");
    expect(result.displayText).toBe("Il reste parfois un geste, une phrase, un souvenir. Des choses simples que le temps n'efface pas.");
  });

  it("whitespace-only family text is treated identically to absent", () => {
    const content = contentWith({ personWords: "   \n  " });
    const result = resolveLifeStoryMatter("a10", content, "fr");
    expect(result.familyText).toBeNull();
    expect(result.isFallback).toBe(true);
  });
});

describe("resolveLifeStoryMatter — each matter is independent", () => {
  it("A10 present, A11/A12 absent: only A10 uses family text", () => {
    const content = contentWith({ personWords: "Présent." });
    const a10 = resolveLifeStoryMatter("a10", content, "fr");
    const a11 = resolveLifeStoryMatter("a11", content, "fr");
    const a12 = resolveLifeStoryMatter("a12", content, "fr");
    expect(a10.isFallback).toBe(false);
    expect(a11.isFallback).toBe(true);
    expect(a12.isFallback).toBe(true);
  });
});

describe("resolveLifeStoryContent — always three matters, canonical order", () => {
  it("all three empty: three fallbacks, in A10 -> A11 -> A12 order", () => {
    const result = resolveLifeStoryContent({}, "fr");
    expect(result.map((m) => m.id)).toEqual(["a10", "a11", "a12"]);
    expect(result.every((m) => m.isFallback)).toBe(true);
    expect(result.every((m) => m.displayText.length > 0)).toBe(true);
  });

  it("all three present: three family texts, none replaced", () => {
    const content = contentWith({ personWords: "A", lovedThings: "B", legacy: "C" });
    const result = resolveLifeStoryContent(content, "fr");
    expect(result.map((m) => m.displayText)).toEqual(["A", "B", "C"]);
    expect(result.every((m) => m.isFallback)).toBe(false);
  });

  it("a stress 240/240/240 case: full text renders verbatim, never truncated", () => {
    const text240 = "x".repeat(240);
    expect(text240).toHaveLength(240);
    const content = contentWith({ personWords: text240, lovedThings: text240, legacy: text240 });
    const result = resolveLifeStoryContent(content, "fr");
    for (const matter of result) {
      expect(matter.displayText).toBe(text240);
      expect(countLifeStoryCodePoints(matter.displayText)).toBe(240);
    }
  });

  it("longer-than-240 family text is never truncated by this module (a Builder-side concern, not enforced here)", () => {
    const longText = "y".repeat(500);
    const content = contentWith({ personWords: longText });
    const result = resolveLifeStoryContent(content, "fr");
    expect(result[0].displayText).toBe(longText);
  });
});

describe("resolveLifeStoryContent — fallback never written back to family data", () => {
  it("resolving content does not mutate the input MemorialContent", () => {
    const content = contentWith({});
    const before = JSON.stringify(content);
    resolveLifeStoryContent(content, "fr");
    expect(JSON.stringify(content)).toBe(before);
  });

  it("a fallback-resolved matter's familyText stays null — the fallback is never confused for real family content", () => {
    const result = resolveLifeStoryMatter("a12", {}, "fr");
    expect(result.familyText).toBeNull();
  });
});

describe("resolveLifeStoryMatter — i18n architecture: EN/ES never carry invented editorial fallback prose", () => {
  it("EN resolves to the explicit non-editorial technical marker, not a translation of the FR fallback's meaning", () => {
    const result = resolveLifeStoryMatter("a10", {}, "en");
    expect(result.displayText).toContain("not yet validated by QG");
  });

  it("ES falls back to the same EN technical marker (no invented Spanish prose) via the existing i18n fallback chain", () => {
    const result = resolveLifeStoryMatter("a10", {}, "es");
    expect(result.displayText).toContain("not yet validated by QG");
  });
});

describe("resolveLifeStoryMatter — corrupted content never crashes", () => {
  it("a corrupted content.personWords reads as absent (fallback), never throws", () => {
    const corrupted = { personWords: { text: "x", extra: "y" } } as MemorialContent;
    expect(() => resolveLifeStoryMatter("a10", corrupted, "fr")).not.toThrow();
    expect(resolveLifeStoryMatter("a10", corrupted, "fr").isFallback).toBe(true);
  });
});
