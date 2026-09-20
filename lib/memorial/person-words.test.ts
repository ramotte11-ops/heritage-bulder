import { describe, expect, it } from "vitest";
import {
  inspectPersonWords,
  parsePersonWordsContent,
  readPersonWords,
  setPersonWordsText,
  validatePersonWords,
  writePersonWords,
} from "./person-words";
import { EMPTY_PERSON_WORDS_CONTENT, type PersonWordsContent } from "@/types/person-words";
import type { MemorialContent } from "@/types/memorial";

// Fictional test fixture only — never real family content (same
// discipline as traditions.test.ts/ceremony.test.ts).
const FIXTURE_TEXT = "Elle avait un rire qui remplissait toute la pièce et une générosité sans limite.";

// ---------------------------------------------------------------------
// modèle absent / valide / corrompu
// ---------------------------------------------------------------------

describe("parsePersonWordsContent — absent", () => {
  it("no personWords key at all parses to the empty content", () => {
    expect(parsePersonWordsContent(undefined)).toEqual({ ok: true, personWords: { text: null } });
  });

  it("an explicit null parses the same way", () => {
    expect(parsePersonWordsContent(null)).toEqual({ ok: true, personWords: { text: null } });
  });
});

describe("parsePersonWordsContent — valid", () => {
  it("a text-less content ({ text: null }) is valid", () => {
    expect(parsePersonWordsContent({ text: null })).toEqual({ ok: true, personWords: { text: null } });
  });

  it("a confirmed text parses successfully, verbatim", () => {
    expect(parsePersonWordsContent({ text: FIXTURE_TEXT })).toEqual({
      ok: true,
      personWords: { text: FIXTURE_TEXT },
    });
  });

  it("a blanks-only text normalizes to null, never rejected", () => {
    const result = parsePersonWordsContent({ text: "   " });
    expect(result).toEqual({ ok: true, personWords: { text: null } });
  });

  it("trims peripheral whitespace, preserving internal formatting", () => {
    const result = parsePersonWordsContent({ text: "  Un texte avec des espaces.  " });
    expect(result).toEqual({ ok: true, personWords: { text: "Un texte avec des espaces." } });
  });
});

describe("parsePersonWordsContent — corrupted", () => {
  it("a stray string in place of the whole content is rejected, not treated as absent", () => {
    expect(parsePersonWordsContent("not an object")).toEqual({ ok: false, reason: "not_an_object" });
  });

  it("an array is rejected", () => {
    expect(parsePersonWordsContent([])).toEqual({ ok: false, reason: "not_an_object" });
  });

  it("an unknown key rejects the whole value", () => {
    expect(parsePersonWordsContent({ text: FIXTURE_TEXT, title: "x" })).toEqual({
      ok: false,
      reason: "unknownKey",
    });
  });

  it("a non-string, non-null text is rejected", () => {
    expect(parsePersonWordsContent({ text: 42 })).toEqual({ ok: false, reason: "text" });
  });
});

describe("validatePersonWords — reuses parsePersonWordsContent's own rules", () => {
  it("accepts an already-well-formed value", () => {
    const content: PersonWordsContent = { text: FIXTURE_TEXT };
    expect(validatePersonWords(content)).toEqual({ ok: true, personWords: content });
  });
});

// ---------------------------------------------------------------------
// inspect / read / write — draft integration
// ---------------------------------------------------------------------

describe("inspectPersonWords — absent vs. valid vs. corrupted, never collapsed", () => {
  it("an empty draft content reads as 'absent'", () => {
    expect(inspectPersonWords({})).toEqual({ status: "absent", personWords: { text: null } });
  });

  it("a valid stored value reads as 'valid'", () => {
    const content = { personWords: { text: FIXTURE_TEXT } } as MemorialContent;
    expect(inspectPersonWords(content)).toEqual({ status: "valid", personWords: { text: FIXTURE_TEXT } });
  });

  it("a corrupted stored value (unknown key) reads as 'corrupted', raw preserved", () => {
    const raw = { text: FIXTURE_TEXT, title: "x" };
    const content = { personWords: raw } as unknown as MemorialContent;
    expect(inspectPersonWords(content)).toEqual({ status: "corrupted", raw });
  });

  it("a corrupted stored value (wrong type) reads as 'corrupted' too", () => {
    const content = { personWords: "not an object" } as unknown as MemorialContent;
    expect(inspectPersonWords(content)).toEqual({ status: "corrupted", raw: "not an object" });
  });
});

describe("readPersonWords — fail-safe display/edit-seed convenience", () => {
  it("reads an absent value as the empty content", () => {
    expect(readPersonWords({})).toEqual(EMPTY_PERSON_WORDS_CONTENT);
  });

  it("reads a corrupted value as the empty content rather than throwing", () => {
    const content = { personWords: "not an object" } as unknown as MemorialContent;
    expect(() => readPersonWords(content)).not.toThrow();
    expect(readPersonWords(content)).toEqual({ text: null });
  });

  it("reads a valid stored value verbatim", () => {
    const content = { personWords: { text: FIXTURE_TEXT } } as MemorialContent;
    expect(readPersonWords(content)).toEqual({ text: FIXTURE_TEXT });
  });
});

describe("writePersonWords — preserves every other content key", () => {
  it("writes personWords while leaving hero/deathNotice untouched", () => {
    const before: MemorialContent = {
      hero: { displayName: "Fixture" },
      deathNotice: { announcementText: "x", precisions: {} },
    };
    const after = writePersonWords(before, { text: FIXTURE_TEXT }) as MemorialContent & {
      personWords: PersonWordsContent;
    };
    expect(after.hero).toBe(before.hero);
    expect(after.deathNotice).toBe(before.deathNotice);
    expect(after.personWords).toEqual({ text: FIXTURE_TEXT });
  });

  it("unconditionally replaces whatever personWords held before, corrupted or not", () => {
    const before = { personWords: "not an object" } as unknown as MemorialContent;
    const after = writePersonWords(before, { text: FIXTURE_TEXT }) as MemorialContent & {
      personWords: PersonWordsContent;
    };
    expect(after.personWords).toEqual({ text: FIXTURE_TEXT });
  });
});

// ---------------------------------------------------------------------
// setPersonWordsText
// ---------------------------------------------------------------------

describe("setPersonWordsText", () => {
  it("sets a genuine text verbatim, trimmed", () => {
    expect(setPersonWordsText({ text: null }, "  Un texte de famille.  ")).toEqual({
      text: "Un texte de famille.",
    });
  });

  it("null clears the text", () => {
    expect(setPersonWordsText({ text: FIXTURE_TEXT }, null)).toEqual({ text: null });
  });

  it("a blanks-only value normalizes to null rather than an empty string", () => {
    expect(setPersonWordsText({ text: FIXTURE_TEXT }, "   ")).toEqual({ text: null });
  });
});
