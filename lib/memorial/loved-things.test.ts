import { describe, expect, it } from "vitest";
import {
  inspectLovedThings,
  parseLovedThingsContent,
  readLovedThings,
  setLovedThingsText,
  validateLovedThings,
  writeLovedThings,
} from "./loved-things";
import { EMPTY_LOVED_THINGS_CONTENT, type LovedThingsContent } from "@/types/loved-things";
import type { MemorialContent } from "@/types/memorial";

// Fictional test fixture only — never real family content (same
// discipline as person-words.test.ts).
const FIXTURE_TEXT = "Elle adorait les longues promenades en forêt et le café du dimanche matin.";

// ---------------------------------------------------------------------
// modèle absent / valide / corrompu
// ---------------------------------------------------------------------

describe("parseLovedThingsContent — absent", () => {
  it("no lovedThings key at all parses to the empty content", () => {
    expect(parseLovedThingsContent(undefined)).toEqual({ ok: true, lovedThings: { text: null } });
  });

  it("an explicit null parses the same way", () => {
    expect(parseLovedThingsContent(null)).toEqual({ ok: true, lovedThings: { text: null } });
  });
});

describe("parseLovedThingsContent — valid", () => {
  it("a text-less content ({ text: null }) is valid", () => {
    expect(parseLovedThingsContent({ text: null })).toEqual({ ok: true, lovedThings: { text: null } });
  });

  it("a confirmed text parses successfully, verbatim", () => {
    expect(parseLovedThingsContent({ text: FIXTURE_TEXT })).toEqual({
      ok: true,
      lovedThings: { text: FIXTURE_TEXT },
    });
  });

  it("a blanks-only text normalizes to null, never rejected", () => {
    expect(parseLovedThingsContent({ text: "   " })).toEqual({ ok: true, lovedThings: { text: null } });
  });

  it("trims peripheral whitespace, preserving internal formatting", () => {
    expect(parseLovedThingsContent({ text: "  Un texte avec des espaces.  " })).toEqual({
      ok: true,
      lovedThings: { text: "Un texte avec des espaces." },
    });
  });
});

describe("parseLovedThingsContent — corrupted", () => {
  it("a stray string in place of the whole content is rejected, not treated as absent", () => {
    expect(parseLovedThingsContent("not an object")).toEqual({ ok: false, reason: "not_an_object" });
  });

  it("an array is rejected", () => {
    expect(parseLovedThingsContent([])).toEqual({ ok: false, reason: "not_an_object" });
  });

  it("an unknown key rejects the whole value", () => {
    expect(parseLovedThingsContent({ text: FIXTURE_TEXT, title: "x" })).toEqual({
      ok: false,
      reason: "unknownKey",
    });
  });

  it("a non-string, non-null text is rejected", () => {
    expect(parseLovedThingsContent({ text: 42 })).toEqual({ ok: false, reason: "text" });
  });
});

describe("validateLovedThings — reuses parseLovedThingsContent's own rules", () => {
  it("accepts an already-well-formed value", () => {
    const content: LovedThingsContent = { text: FIXTURE_TEXT };
    expect(validateLovedThings(content)).toEqual({ ok: true, lovedThings: content });
  });
});

// ---------------------------------------------------------------------
// inspect / read / write — draft integration
// ---------------------------------------------------------------------

describe("inspectLovedThings — absent vs. valid vs. corrupted, never collapsed", () => {
  it("an empty draft content reads as 'absent'", () => {
    expect(inspectLovedThings({})).toEqual({ status: "absent", lovedThings: { text: null } });
  });

  it("a valid stored value reads as 'valid'", () => {
    const content = { lovedThings: { text: FIXTURE_TEXT } } as MemorialContent;
    expect(inspectLovedThings(content)).toEqual({ status: "valid", lovedThings: { text: FIXTURE_TEXT } });
  });

  it("a corrupted stored value (unknown key) reads as 'corrupted', raw preserved", () => {
    const raw = { text: FIXTURE_TEXT, title: "x" };
    const content = { lovedThings: raw } as unknown as MemorialContent;
    expect(inspectLovedThings(content)).toEqual({ status: "corrupted", raw });
  });

  it("a corrupted stored value (wrong type) reads as 'corrupted' too", () => {
    const content = { lovedThings: "not an object" } as unknown as MemorialContent;
    expect(inspectLovedThings(content)).toEqual({ status: "corrupted", raw: "not an object" });
  });
});

describe("readLovedThings — fail-safe display/edit-seed convenience", () => {
  it("reads an absent value as the empty content", () => {
    expect(readLovedThings({})).toEqual(EMPTY_LOVED_THINGS_CONTENT);
  });

  it("reads a corrupted value as the empty content rather than throwing", () => {
    const content = { lovedThings: "not an object" } as unknown as MemorialContent;
    expect(() => readLovedThings(content)).not.toThrow();
    expect(readLovedThings(content)).toEqual({ text: null });
  });

  it("reads a valid stored value verbatim", () => {
    const content = { lovedThings: { text: FIXTURE_TEXT } } as MemorialContent;
    expect(readLovedThings(content)).toEqual({ text: FIXTURE_TEXT });
  });
});

describe("writeLovedThings — preserves every other content key", () => {
  it("writes lovedThings while leaving hero/personWords untouched", () => {
    const before: MemorialContent = {
      hero: { displayName: "Fixture" },
    } as unknown as MemorialContent;
    (before as unknown as { personWords: unknown }).personWords = { text: "A10 text" };
    const after = writeLovedThings(before, { text: FIXTURE_TEXT }) as MemorialContent & {
      lovedThings: LovedThingsContent;
    };
    expect(after.hero).toBe(before.hero);
    expect((after as unknown as { personWords: unknown }).personWords).toBe(
      (before as unknown as { personWords: unknown }).personWords,
    );
    expect(after.lovedThings).toEqual({ text: FIXTURE_TEXT });
  });

  it("unconditionally replaces whatever lovedThings held before, corrupted or not", () => {
    const before = { lovedThings: "not an object" } as unknown as MemorialContent;
    const after = writeLovedThings(before, { text: FIXTURE_TEXT }) as MemorialContent & {
      lovedThings: LovedThingsContent;
    };
    expect(after.lovedThings).toEqual({ text: FIXTURE_TEXT });
  });
});

// ---------------------------------------------------------------------
// setLovedThingsText
// ---------------------------------------------------------------------

describe("setLovedThingsText", () => {
  it("sets a genuine text verbatim, trimmed", () => {
    expect(setLovedThingsText({ text: null }, "  Un texte de famille.  ")).toEqual({
      text: "Un texte de famille.",
    });
  });

  it("null clears the text", () => {
    expect(setLovedThingsText({ text: FIXTURE_TEXT }, null)).toEqual({ text: null });
  });

  it("a blanks-only value normalizes to null rather than an empty string", () => {
    expect(setLovedThingsText({ text: FIXTURE_TEXT }, "   ")).toEqual({ text: null });
  });
});
