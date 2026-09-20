import { describe, expect, it } from "vitest";
import {
  inspectLegacy,
  parseLegacyContent,
  readLegacy,
  setLegacyText,
  validateLegacy,
  writeLegacy,
} from "./legacy";
import { EMPTY_LEGACY_CONTENT, type LegacyContent } from "@/types/legacy";
import type { MemorialContent } from "@/types/memorial";

// Fictional test fixture only — never real family content (same
// discipline as person-words.test.ts/loved-things.test.ts).
const FIXTURE_TEXT = "Elle nous a appris à toujours dire merci et à ne jamais partir fâchés.";

// ---------------------------------------------------------------------
// modèle absent / valide / corrompu
// ---------------------------------------------------------------------

describe("parseLegacyContent — absent", () => {
  it("no legacy key at all parses to the empty content", () => {
    expect(parseLegacyContent(undefined)).toEqual({ ok: true, legacy: { text: null } });
  });

  it("an explicit null parses the same way", () => {
    expect(parseLegacyContent(null)).toEqual({ ok: true, legacy: { text: null } });
  });
});

describe("parseLegacyContent — valid", () => {
  it("a text-less content ({ text: null }) is valid", () => {
    expect(parseLegacyContent({ text: null })).toEqual({ ok: true, legacy: { text: null } });
  });

  it("a confirmed text parses successfully, verbatim", () => {
    expect(parseLegacyContent({ text: FIXTURE_TEXT })).toEqual({ ok: true, legacy: { text: FIXTURE_TEXT } });
  });

  it("a blanks-only text normalizes to null, never rejected", () => {
    expect(parseLegacyContent({ text: "   " })).toEqual({ ok: true, legacy: { text: null } });
  });

  it("trims peripheral whitespace, preserving internal formatting", () => {
    expect(parseLegacyContent({ text: "  Un texte avec des espaces.  " })).toEqual({
      ok: true,
      legacy: { text: "Un texte avec des espaces." },
    });
  });
});

describe("parseLegacyContent — corrupted", () => {
  it("a stray string in place of the whole content is rejected, not treated as absent", () => {
    expect(parseLegacyContent("not an object")).toEqual({ ok: false, reason: "not_an_object" });
  });

  it("an array is rejected", () => {
    expect(parseLegacyContent([])).toEqual({ ok: false, reason: "not_an_object" });
  });

  it("an unknown key rejects the whole value", () => {
    expect(parseLegacyContent({ text: FIXTURE_TEXT, title: "x" })).toEqual({ ok: false, reason: "unknownKey" });
  });

  it("a non-string, non-null text is rejected", () => {
    expect(parseLegacyContent({ text: 42 })).toEqual({ ok: false, reason: "text" });
  });
});

describe("validateLegacy — reuses parseLegacyContent's own rules", () => {
  it("accepts an already-well-formed value", () => {
    const content: LegacyContent = { text: FIXTURE_TEXT };
    expect(validateLegacy(content)).toEqual({ ok: true, legacy: content });
  });
});

// ---------------------------------------------------------------------
// inspect / read / write — draft integration
// ---------------------------------------------------------------------

describe("inspectLegacy — absent vs. valid vs. corrupted, never collapsed", () => {
  it("an empty draft content reads as 'absent'", () => {
    expect(inspectLegacy({})).toEqual({ status: "absent", legacy: { text: null } });
  });

  it("a valid stored value reads as 'valid'", () => {
    const content = { legacy: { text: FIXTURE_TEXT } } as MemorialContent;
    expect(inspectLegacy(content)).toEqual({ status: "valid", legacy: { text: FIXTURE_TEXT } });
  });

  it("a corrupted stored value (unknown key) reads as 'corrupted', raw preserved", () => {
    const raw = { text: FIXTURE_TEXT, title: "x" };
    const content = { legacy: raw } as unknown as MemorialContent;
    expect(inspectLegacy(content)).toEqual({ status: "corrupted", raw });
  });

  it("a corrupted stored value (wrong type) reads as 'corrupted' too", () => {
    const content = { legacy: "not an object" } as unknown as MemorialContent;
    expect(inspectLegacy(content)).toEqual({ status: "corrupted", raw: "not an object" });
  });
});

describe("readLegacy — fail-safe display/edit-seed convenience", () => {
  it("reads an absent value as the empty content", () => {
    expect(readLegacy({})).toEqual(EMPTY_LEGACY_CONTENT);
  });

  it("reads a corrupted value as the empty content rather than throwing", () => {
    const content = { legacy: "not an object" } as unknown as MemorialContent;
    expect(() => readLegacy(content)).not.toThrow();
    expect(readLegacy(content)).toEqual({ text: null });
  });

  it("reads a valid stored value verbatim", () => {
    const content = { legacy: { text: FIXTURE_TEXT } } as MemorialContent;
    expect(readLegacy(content)).toEqual({ text: FIXTURE_TEXT });
  });
});

describe("writeLegacy — preserves every other content key", () => {
  it("writes legacy while leaving hero/lovedThings untouched", () => {
    const before: MemorialContent = {
      hero: { displayName: "Fixture" },
    } as unknown as MemorialContent;
    (before as unknown as { lovedThings: unknown }).lovedThings = { text: "A11 text" };
    const after = writeLegacy(before, { text: FIXTURE_TEXT }) as MemorialContent & { legacy: LegacyContent };
    expect(after.hero).toBe(before.hero);
    expect((after as unknown as { lovedThings: unknown }).lovedThings).toBe(
      (before as unknown as { lovedThings: unknown }).lovedThings,
    );
    expect(after.legacy).toEqual({ text: FIXTURE_TEXT });
  });

  it("unconditionally replaces whatever legacy held before, corrupted or not", () => {
    const before = { legacy: "not an object" } as unknown as MemorialContent;
    const after = writeLegacy(before, { text: FIXTURE_TEXT }) as MemorialContent & { legacy: LegacyContent };
    expect(after.legacy).toEqual({ text: FIXTURE_TEXT });
  });
});

// ---------------------------------------------------------------------
// setLegacyText
// ---------------------------------------------------------------------

describe("setLegacyText", () => {
  it("sets a genuine text verbatim, trimmed", () => {
    expect(setLegacyText({ text: null }, "  Un texte de famille.  ")).toEqual({ text: "Un texte de famille." });
  });

  it("null clears the text", () => {
    expect(setLegacyText({ text: FIXTURE_TEXT }, null)).toEqual({ text: null });
  });

  it("a blanks-only value normalizes to null rather than an empty string", () => {
    expect(setLegacyText({ text: FIXTURE_TEXT }, "   ")).toEqual({ text: null });
  });
});
