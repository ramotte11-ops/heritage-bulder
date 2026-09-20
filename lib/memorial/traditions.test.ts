import { describe, expect, it } from "vitest";
import {
  addTraditionEntry,
  inspectTraditions,
  parseTraditionsContent,
  readTraditions,
  removeTraditionEntry,
  updateTraditionEntry,
  validateTraditions,
  writeTraditions,
} from "./traditions";
import { EMPTY_TRADITIONS_CONTENT, type TraditionEntry, type TraditionsContent } from "@/types/traditions";
import type { MemorialContent } from "@/types/memorial";

// Fictional test fixtures only — never a real tradition's name or text
// (mission brief section 6). These ids/texts are confined to this file.
const FIXTURE_CUSTOM_ENTRY: TraditionEntry = {
  id: "entry-1",
  origin: "custom",
  suggestionId: null,
  title: "Une touche de bleu",
  text: "Nous souhaitons que chacun porte une touche de bleu.",
};

const FIXTURE_SUGGESTION_ENTRY: TraditionEntry = {
  id: "entry-2",
  origin: "suggestion",
  suggestionId: "fixture:lantern",
  title: null,
  text: "Texte de suggestion fictif confirmé par la famille.",
};

// ---------------------------------------------------------------------
// modèle absent / valide / corrompu
// ---------------------------------------------------------------------

describe("parseTraditionsContent — absent", () => {
  it("no traditions key at all parses to the empty content", () => {
    expect(parseTraditionsContent(undefined)).toEqual({ ok: true, traditions: { entries: [] } });
  });

  it("an explicit null parses the same way", () => {
    expect(parseTraditionsContent(null)).toEqual({ ok: true, traditions: { entries: [] } });
  });
});

describe("parseTraditionsContent — valid", () => {
  it("an empty entries array is valid", () => {
    expect(parseTraditionsContent({ entries: [] })).toEqual({ ok: true, traditions: { entries: [] } });
  });

  it("a custom entry parses successfully", () => {
    expect(parseTraditionsContent({ entries: [FIXTURE_CUSTOM_ENTRY] })).toEqual({
      ok: true,
      traditions: { entries: [FIXTURE_CUSTOM_ENTRY] },
    });
  });

  it("a suggestion-origin entry parses successfully", () => {
    expect(parseTraditionsContent({ entries: [FIXTURE_SUGGESTION_ENTRY] })).toEqual({
      ok: true,
      traditions: { entries: [FIXTURE_SUGGESTION_ENTRY] },
    });
  });

  it("multiple entries, in order, all parse successfully", () => {
    const result = parseTraditionsContent({ entries: [FIXTURE_CUSTOM_ENTRY, FIXTURE_SUGGESTION_ENTRY] });
    expect(result).toEqual({ ok: true, traditions: { entries: [FIXTURE_CUSTOM_ENTRY, FIXTURE_SUGGESTION_ENTRY] } });
  });

  it("a blanks-only title normalizes to null, never rejected", () => {
    const raw = { entries: [{ ...FIXTURE_CUSTOM_ENTRY, title: "   " }] };
    const result = parseTraditionsContent(raw);
    expect(result.ok && result.traditions.entries[0].title).toBe(null);
  });
});

describe("parseTraditionsContent — corrupted", () => {
  it("a stray string in place of the whole content is rejected, not treated as absent", () => {
    expect(parseTraditionsContent("not an object")).toEqual({ ok: false, reason: "not_an_object" });
  });

  it("an array in place of the whole content is rejected", () => {
    expect(parseTraditionsContent([])).toEqual({ ok: false, reason: "not_an_object" });
  });

  it("an unknown top-level key rejects the whole value", () => {
    expect(parseTraditionsContent({ entries: [], religion: "x" })).toEqual({ ok: false, reason: "unknownKey" });
  });

  it("a non-array entries is rejected", () => {
    expect(parseTraditionsContent({ entries: "x" })).toEqual({ ok: false, reason: "entries" });
  });

  it("an entry with an unknown key is rejected", () => {
    const raw = { entries: [{ ...FIXTURE_CUSTOM_ENTRY, extra: "x" }] };
    expect(parseTraditionsContent(raw)).toEqual({ ok: false, reason: "entries" });
  });

  it("an entry missing its id is rejected", () => {
    const withoutId: Record<string, unknown> = { ...FIXTURE_CUSTOM_ENTRY };
    delete withoutId.id;
    expect(parseTraditionsContent({ entries: [withoutId] })).toEqual({ ok: false, reason: "entries" });
  });

  it("an entry with a blank id is rejected", () => {
    expect(parseTraditionsContent({ entries: [{ ...FIXTURE_CUSTOM_ENTRY, id: "  " }] })).toEqual({
      ok: false,
      reason: "entries",
    });
  });

  it("an entry with an invalid origin is rejected", () => {
    expect(parseTraditionsContent({ entries: [{ ...FIXTURE_CUSTOM_ENTRY, origin: "invented" }] })).toEqual({
      ok: false,
      reason: "entries",
    });
  });

  it("a custom-origin entry carrying a suggestionId is rejected", () => {
    const raw = { entries: [{ ...FIXTURE_CUSTOM_ENTRY, suggestionId: "fixture:lantern" }] };
    expect(parseTraditionsContent(raw)).toEqual({ ok: false, reason: "entries" });
  });

  it("a suggestion-origin entry with a null suggestionId is rejected", () => {
    const raw = { entries: [{ ...FIXTURE_SUGGESTION_ENTRY, suggestionId: null }] };
    expect(parseTraditionsContent(raw)).toEqual({ ok: false, reason: "entries" });
  });

  it("an entry with a blank text is rejected — a repère must carry real text", () => {
    expect(parseTraditionsContent({ entries: [{ ...FIXTURE_CUSTOM_ENTRY, text: "   " }] })).toEqual({
      ok: false,
      reason: "entries",
    });
  });

  it("an entry with a non-string text is rejected", () => {
    expect(parseTraditionsContent({ entries: [{ ...FIXTURE_CUSTOM_ENTRY, text: 42 }] })).toEqual({
      ok: false,
      reason: "entries",
    });
  });

  it("two entries sharing the same id are rejected as a whole", () => {
    const raw = { entries: [FIXTURE_CUSTOM_ENTRY, { ...FIXTURE_SUGGESTION_ENTRY, id: FIXTURE_CUSTOM_ENTRY.id }] };
    expect(parseTraditionsContent(raw)).toEqual({ ok: false, reason: "duplicateId" });
  });
});

describe("validateTraditions", () => {
  it("reuses parseTraditionsContent's own rules", () => {
    const valid: TraditionsContent = { entries: [FIXTURE_CUSTOM_ENTRY] };
    expect(validateTraditions(valid)).toEqual({ ok: true, traditions: valid });
  });
});

// ---------------------------------------------------------------------
// inspect / read / write — context safety
// ---------------------------------------------------------------------

describe("inspectTraditions", () => {
  it("absent stays distinguishable from corrupted", () => {
    expect(inspectTraditions({})).toEqual({ status: "absent", traditions: { entries: [] } });
  });

  it("a valid stored traditions list reads as valid", () => {
    const content: MemorialContent = { traditions: { entries: [FIXTURE_CUSTOM_ENTRY] } };
    expect(inspectTraditions(content)).toEqual({ status: "valid", traditions: { entries: [FIXTURE_CUSTOM_ENTRY] } });
  });

  it("a malformed stored traditions reads as corrupted, raw preserved", () => {
    const content: MemorialContent = { traditions: { entries: "not an array" } };
    expect(inspectTraditions(content)).toEqual({ status: "corrupted", raw: { entries: "not an array" } });
  });
});

describe("readTraditions — fail-safe", () => {
  it("a missing key reads as empty", () => {
    expect(readTraditions({})).toEqual(EMPTY_TRADITIONS_CONTENT);
  });

  it("a corrupted key reads as empty rather than throwing", () => {
    expect(readTraditions({ traditions: { entries: "x" } })).toEqual(EMPTY_TRADITIONS_CONTENT);
  });
});

describe("writeTraditions — context safety", () => {
  it("only touches content.traditions, leaving every other key untouched", () => {
    const content: MemorialContent = { hero: { displayName: "Jeanne" }, ceremony: { venueName: "Église" } };
    const written = writeTraditions(content, { entries: [FIXTURE_CUSTOM_ENTRY] });
    expect(written.hero).toEqual({ displayName: "Jeanne" });
    expect(written.ceremony).toEqual({ venueName: "Église" });
    expect(written.traditions).toEqual({ entries: [FIXTURE_CUSTOM_ENTRY] });
  });

  it("never reads or depends on editorialContext", () => {
    expect(writeTraditions({}, { entries: [] })).toEqual({ traditions: { entries: [] } });
  });
});

// ---------------------------------------------------------------------
// entry-level helpers
// ---------------------------------------------------------------------

describe("addTraditionEntry", () => {
  it("appends a new custom entry", () => {
    const result = addTraditionEntry(
      { entries: [] },
      { id: "e1", origin: "custom", suggestionId: null, title: null, text: "Un texte de famille." },
    );
    expect(result).toEqual({
      ok: true,
      traditions: { entries: [{ id: "e1", origin: "custom", suggestionId: null, title: null, text: "Un texte de famille." }] },
    });
  });

  it("appends a new suggestion-origin entry", () => {
    const result = addTraditionEntry(
      { entries: [] },
      { id: "e1", origin: "suggestion", suggestionId: "fixture:lantern", title: null, text: "Texte adopté." },
    );
    expect(result.ok).toBe(true);
    expect(result.ok && result.traditions.entries[0].suggestionId).toBe("fixture:lantern");
  });

  it("preserves existing entries, appending after them, never reordering", () => {
    const result = addTraditionEntry(
      { entries: [FIXTURE_CUSTOM_ENTRY] },
      { id: "e-new", origin: "custom", suggestionId: null, title: null, text: "Second repère." },
    );
    expect(result.ok && result.traditions.entries.map((e) => e.id)).toEqual([FIXTURE_CUSTOM_ENTRY.id, "e-new"]);
  });

  it("rejects a blank text — no incomplete draft silently published", () => {
    const result = addTraditionEntry(
      { entries: [] },
      { id: "e1", origin: "custom", suggestionId: null, title: null, text: "   " },
    );
    expect(result).toEqual({ ok: false, reason: "text" });
  });

  it("rejects a duplicate id", () => {
    const result = addTraditionEntry(
      { entries: [FIXTURE_CUSTOM_ENTRY] },
      { id: FIXTURE_CUSTOM_ENTRY.id, origin: "custom", suggestionId: null, title: null, text: "Autre texte." },
    );
    expect(result).toEqual({ ok: false, reason: "duplicateId" });
  });

  it("rejects a custom entry carrying a suggestionId", () => {
    const result = addTraditionEntry(
      { entries: [] },
      { id: "e1", origin: "custom", suggestionId: "fixture:lantern", title: null, text: "Texte." },
    );
    expect(result).toEqual({ ok: false, reason: "suggestionId" });
  });

  it("rejects a suggestion entry with no suggestionId", () => {
    const result = addTraditionEntry(
      { entries: [] },
      { id: "e1", origin: "suggestion", suggestionId: null, title: null, text: "Texte." },
    );
    expect(result).toEqual({ ok: false, reason: "suggestionId" });
  });
});

describe("updateTraditionEntry", () => {
  it("updates text, leaving id/origin/suggestionId/title untouched", () => {
    const result = updateTraditionEntry({ entries: [FIXTURE_CUSTOM_ENTRY] }, FIXTURE_CUSTOM_ENTRY.id, {
      text: "Texte corrigé par la famille.",
    });
    expect(result).toEqual({
      ok: true,
      traditions: { entries: [{ ...FIXTURE_CUSTOM_ENTRY, text: "Texte corrigé par la famille." }] },
    });
  });

  it("updates title independently of text", () => {
    const result = updateTraditionEntry({ entries: [FIXTURE_CUSTOM_ENTRY] }, FIXTURE_CUSTOM_ENTRY.id, {
      title: "Nouveau titre",
    });
    expect(result.ok && result.traditions.entries[0].title).toBe("Nouveau titre");
    expect(result.ok && result.traditions.entries[0].text).toBe(FIXTURE_CUSTOM_ENTRY.text);
  });

  it("clears title back to null explicitly", () => {
    const result = updateTraditionEntry({ entries: [FIXTURE_CUSTOM_ENTRY] }, FIXTURE_CUSTOM_ENTRY.id, {
      title: null,
    });
    expect(result.ok && result.traditions.entries[0].title).toBe(null);
  });

  it("leaves every other entry untouched", () => {
    const result = updateTraditionEntry(
      { entries: [FIXTURE_CUSTOM_ENTRY, FIXTURE_SUGGESTION_ENTRY] },
      FIXTURE_CUSTOM_ENTRY.id,
      { text: "Texte modifié." },
    );
    expect(result.ok && result.traditions.entries[1]).toEqual(FIXTURE_SUGGESTION_ENTRY);
  });

  it("rejects editing text down to blank", () => {
    const result = updateTraditionEntry({ entries: [FIXTURE_CUSTOM_ENTRY] }, FIXTURE_CUSTOM_ENTRY.id, {
      text: "   ",
    });
    expect(result).toEqual({ ok: false, reason: "text" });
  });

  it("rejects editing an id that does not exist", () => {
    const result = updateTraditionEntry({ entries: [] }, "missing", { text: "x" });
    expect(result).toEqual({ ok: false, reason: "id" });
  });
});

describe("removeTraditionEntry", () => {
  it("removes the matching entry, leaving the others in order", () => {
    const result = removeTraditionEntry(
      { entries: [FIXTURE_CUSTOM_ENTRY, FIXTURE_SUGGESTION_ENTRY] },
      FIXTURE_CUSTOM_ENTRY.id,
    );
    expect(result).toEqual({ entries: [FIXTURE_SUGGESTION_ENTRY] });
  });

  it("removing an id that does not exist is a harmless no-op", () => {
    const traditions: TraditionsContent = { entries: [FIXTURE_CUSTOM_ENTRY] };
    expect(removeTraditionEntry(traditions, "missing")).toEqual(traditions);
  });
});
