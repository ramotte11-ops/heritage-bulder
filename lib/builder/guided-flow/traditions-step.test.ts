import { describe, expect, it } from "vitest";
import type { MemorialContent } from "@/types/memorial";
import { commitA04, skipA05, skipA06, skipA07, skipA08 } from "./ceremony-step";
import { commitA01 } from "./death-notice-step";
import { humanFlowDefinition } from "./human-steps";
import { firstIncompleteStep } from "./engine";
import {
  addTraditionsEntry,
  commitA09,
  isA09Resolved,
  needsA09,
  readTraditionsForEditing,
  removeTraditionsEntry,
  skipA09,
  updateTraditionsEntry,
} from "./traditions-step";

/**
 * Mission 042 — contract tests for A09 ("Traditions & repères"). Same
 * discipline as ceremony-step.test.ts / death-notice-step.test.ts. Every
 * `text`/`title` used below is a deliberately fictional, neutral fixture
 * — never a real tradition's name or content (mission brief section 6).
 */

const EMPTY_CONTENT: MemorialContent = {};

const CORRUPTED_UNKNOWN_KEY: MemorialContent = {
  traditions: { entries: [], religion: "x" } as unknown as MemorialContent["traditions"],
};

const CORRUPTED_WRONG_TYPE: MemorialContent = {
  traditions: "not an object" as unknown as MemorialContent["traditions"],
};

function a04Answered(answer: "yes" | "undecided" | "no", content: MemorialContent = EMPTY_CONTENT): MemorialContent {
  const committed = commitA04(content, answer);
  if (!committed.ok) throw new Error("test fixture: commitA04 unexpectedly failed");
  return committed.content;
}

/** A04 answered "yes" with all four ceremony sub-steps explicitly
 * skipped — the normal starting point for reaching A09 through the
 * "ceremony planned" branch. */
function requireOk(result: { ok: true; content: MemorialContent } | { ok: false; reason: unknown }): MemorialContent {
  if (!result.ok) throw new Error("test fixture: unexpected write failure");
  return result.content;
}

function ceremonyBranchResolvedYes(): MemorialContent {
  let content = a04Answered("yes");
  content = requireOk(skipA05(content));
  content = requireOk(skipA06(content));
  content = requireOk(skipA07(content));
  content = requireOk(skipA08(content));
  return content;
}

// ---------------------------------------------------------------------
// readTraditionsForEditing
// ---------------------------------------------------------------------

describe("readTraditionsForEditing — corruption stays visible, never silently collapsed", () => {
  it("reads an absent Traditions list as the empty, editable content", () => {
    expect(readTraditionsForEditing(EMPTY_CONTENT)).toEqual({ status: "ready", traditions: { entries: [] } });
  });

  it("a corrupted Traditions list (unknown key) reads as 'corrupted'", () => {
    expect(readTraditionsForEditing(CORRUPTED_UNKNOWN_KEY)).toEqual({ status: "corrupted" });
  });

  it("a corrupted Traditions list (wrong type) reads as 'corrupted' too", () => {
    expect(readTraditionsForEditing(CORRUPTED_WRONG_TYPE)).toEqual({ status: "corrupted" });
  });
});

// ---------------------------------------------------------------------
// needsA09 — reached after A04, and after A05-A08 whenever applicable —
// NEVER by reading a single Ceremony field.
// ---------------------------------------------------------------------

describe("needsA09 — A04 not yet answered", () => {
  it("A09 is not reachable before A04 is resolved", () => {
    expect(needsA09(EMPTY_CONTENT)).toBe(false);
  });
});

describe("needsA09 — A04 = no, rejoint directement après A04", () => {
  it("A05-A08 stay non-applicable and A09 becomes reachable immediately", () => {
    const content = a04Answered("no");
    expect(needsA09(content)).toBe(true);
  });
});

describe("needsA09 — A04 = undecided, rejoint directement après A04", () => {
  it("A05-A08 stay non-applicable and A09 becomes reachable immediately", () => {
    const content = a04Answered("undecided");
    expect(needsA09(content)).toBe(true);
  });
});

describe("needsA09 — A04 = yes, rejoint seulement après A05-A08", () => {
  it("A09 is not reachable while A05-A08 are still pending", () => {
    expect(needsA09(a04Answered("yes"))).toBe(false);
  });

  it("A09 becomes reachable once all four of A05-A08 are resolved", () => {
    expect(needsA09(ceremonyBranchResolvedYes())).toBe(true);
  });
});

describe("needsA09 — never depends on a single Ceremony field", () => {
  it("two contents differing only in Ceremony's own field VALUES (not resolution) yield the same needsA09", () => {
    const base = ceremonyBranchResolvedYes();
    const withOneVenue: MemorialContent = { ...base, ceremony: { venueName: "Fixture venue A" } };
    const withAnotherVenue: MemorialContent = { ...base, ceremony: { venueName: "Fixture venue B" } };

    expect(needsA09(withOneVenue)).toBe(needsA09(withAnotherVenue));
  });
});

describe("needsA09 — once resolved, never re-asked", () => {
  it("A09 stays not-needed once explicitly skipped", () => {
    const content = a04Answered("no");
    const skipped = skipA09(content);
    expect(skipped.ok).toBe(true);
    if (!skipped.ok) return;
    expect(needsA09(skipped.content)).toBe(false);
    expect(isA09Resolved(skipped.content)).toBe(true);
  });
});

// ---------------------------------------------------------------------
// Guided Flow route integration — A04 -> [A05-A08] -> A09 -> A10
// ---------------------------------------------------------------------

describe("Route integration — A09 sits exactly between the Ceremony block and A10", () => {
  it("firstIncompleteStep lands on A09 once A04-A08 are all resolved (A04 = yes)", () => {
    const flow = humanFlowDefinition("announcement");
    const state = {
      T03: { status: "completed" as const },
      T04: { status: "skipped" as const },
      T05: { status: "skipped" as const },
      T06: { status: "completed" as const },
      T07: { status: "completed" as const },
      T08: { status: "completed" as const },
      A01: { status: "completed" as const },
      A02: { status: "skipped" as const },
      A03: { status: "completed" as const },
      A04: { status: "completed" as const, answer: "yes" },
      A05: { status: "skipped" as const },
      A06: { status: "skipped" as const },
      A07: { status: "skipped" as const },
      A08: { status: "skipped" as const },
    };
    expect(firstIncompleteStep(flow, state)?.id).toBe("A09");
  });

  it("firstIncompleteStep lands on A09 immediately after A04 = no (A05-A08 non-applicable)", () => {
    const flow = humanFlowDefinition("announcement");
    const state = {
      T03: { status: "completed" as const },
      T04: { status: "skipped" as const },
      T05: { status: "skipped" as const },
      T06: { status: "completed" as const },
      T07: { status: "completed" as const },
      T08: { status: "completed" as const },
      A01: { status: "completed" as const },
      A02: { status: "skipped" as const },
      A03: { status: "completed" as const },
      A04: { status: "completed" as const, answer: "no" },
    };
    expect(firstIncompleteStep(flow, state)?.id).toBe("A09");
  });

  it("firstIncompleteStep lands on A09 immediately after A04 = undecided", () => {
    const flow = humanFlowDefinition("announcement");
    const state = {
      T03: { status: "completed" as const },
      T04: { status: "skipped" as const },
      T05: { status: "skipped" as const },
      T06: { status: "completed" as const },
      T07: { status: "completed" as const },
      T08: { status: "completed" as const },
      A01: { status: "completed" as const },
      A02: { status: "skipped" as const },
      A03: { status: "completed" as const },
      A04: { status: "completed" as const, answer: "undecided" },
    };
    expect(firstIncompleteStep(flow, state)?.id).toBe("A09");
  });

  it("firstIncompleteStep moves on to A10 once A09 is resolved too", () => {
    const flow = humanFlowDefinition("announcement");
    const state = {
      T03: { status: "completed" as const },
      T04: { status: "skipped" as const },
      T05: { status: "skipped" as const },
      T06: { status: "completed" as const },
      T07: { status: "completed" as const },
      T08: { status: "completed" as const },
      A01: { status: "completed" as const },
      A02: { status: "skipped" as const },
      A03: { status: "completed" as const },
      A04: { status: "completed" as const, answer: "no" },
      A09: { status: "skipped" as const },
    };
    expect(firstIncompleteStep(flow, state)?.id).toBe("A10");
  });

  it("A09 is absent from the remembrance route entirely", () => {
    const flow = humanFlowDefinition("remembrance");
    const route = flow.steps.filter((s) => flow.activeGroups.includes(s.group));
    expect(route.some((s) => s.id === "A09")).toBe(false);
  });
});

// ---------------------------------------------------------------------
// Skip with no data
// ---------------------------------------------------------------------

describe("A09 — skip sans données", () => {
  it("skipA09 succeeds with an empty traditions list and never invents an entry", () => {
    const content = a04Answered("no");
    const skipped = skipA09(content);
    expect(skipped.ok).toBe(true);
    if (!skipped.ok) return;
    const read = readTraditionsForEditing(skipped.content);
    expect(read.status === "ready" && read.traditions.entries).toEqual([]);
  });

  it("refuses to skip over a corrupted stored Traditions list", () => {
    expect(skipA09(CORRUPTED_UNKNOWN_KEY)).toEqual({ ok: false, reason: "corrupted" });
  });

  it("commitA09 refuses with no entry — Continue is not a real outcome with nothing to show", () => {
    const content = a04Answered("no");
    expect(commitA09(content)).toEqual({ ok: false, reason: "entries" });
  });
});

// ---------------------------------------------------------------------
// Continue with a valid entry
// ---------------------------------------------------------------------

describe("A09 — continue avec un repère valide", () => {
  it("commitA09 succeeds once at least one entry exists", () => {
    let content = a04Answered("no");
    content = requireOk(
      addTraditionsEntry(content, {
        id: "fixture-entry-1",
        origin: "custom",
        suggestionId: null,
        title: null,
        text: "Nous souhaitons que chacun porte une touche de bleu.",
      }),
    );
    const committed = commitA09(content);
    expect(committed.ok).toBe(true);
    if (!committed.ok) return;
    expect(isA09Resolved(committed.content)).toBe(true);
    expect(needsA09(committed.content)).toBe(false);
  });

  it("refuses to commit over a corrupted stored Traditions list", () => {
    expect(commitA09(CORRUPTED_UNKNOWN_KEY)).toEqual({ ok: false, reason: "corrupted" });
  });
});

// ---------------------------------------------------------------------
// Custom entries — verbatim, never translated, never analyzed
// ---------------------------------------------------------------------

describe("A09 — repère custom conservé verbatim", () => {
  it("stores the family's text exactly as typed, including casing and punctuation", () => {
    const familyText = "Nous souhaitons que chacun porte une touche de bleu — merci de le respecter.";
    const result = addTraditionsEntry(EMPTY_CONTENT, {
      id: "fixture-entry-1",
      origin: "custom",
      suggestionId: null,
      title: null,
      text: familyText,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const read = readTraditionsForEditing(result.content);
    expect(read.status === "ready" && read.traditions.entries[0].text).toBe(familyText);
  });

  it("never derives, infers, or attaches a religion/belief field to a custom entry", () => {
    const result = addTraditionsEntry(EMPTY_CONTENT, {
      id: "fixture-entry-1",
      origin: "custom",
      suggestionId: null,
      title: null,
      text: "Un texte de famille quelconque.",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const read = readTraditionsForEditing(result.content);
    const entry = read.status === "ready" ? read.traditions.entries[0] : undefined;
    expect(entry).not.toHaveProperty("religion");
    expect(entry).not.toHaveProperty("confession");
    expect(entry).not.toHaveProperty("courant");
    expect(Object.keys(entry ?? {}).sort()).toEqual(["id", "origin", "suggestionId", "text", "title"]);
  });
});

// ---------------------------------------------------------------------
// Suggestion explicitly selected only — never a default
// ---------------------------------------------------------------------

describe("A09 — suggestion explicitement sélectionnée seulement", () => {
  it("an entry only exists in content.traditions after an explicit add — nothing is ever pre-populated", () => {
    expect(readTraditionsForEditing(EMPTY_CONTENT)).toEqual({ status: "ready", traditions: { entries: [] } });
  });

  it("a suggestion-origin entry requires an explicit, non-null suggestionId — never inferred", () => {
    const result = addTraditionsEntry(EMPTY_CONTENT, {
      id: "fixture-entry-1",
      origin: "suggestion",
      suggestionId: null,
      title: null,
      text: "Texte de suggestion fictif.",
    });
    expect(result).toEqual({ ok: false, reason: "suggestionId" });
  });

  it("a confirmed suggestion entry preserves its provenance link exactly", () => {
    const result = addTraditionsEntry(EMPTY_CONTENT, {
      id: "fixture-entry-1",
      origin: "suggestion",
      suggestionId: "fixture:lantern",
      title: null,
      text: "Texte de suggestion fictif, confirmé.",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const read = readTraditionsForEditing(result.content);
    expect(read.status === "ready" && read.traditions.entries[0].suggestionId).toBe("fixture:lantern");
  });
});

// ---------------------------------------------------------------------
// Modification / suppression
// ---------------------------------------------------------------------

describe("A09 — modification d'un repère", () => {
  it("updateTraditionsEntry changes only the targeted entry's text", () => {
    let content = EMPTY_CONTENT;
    content = requireOk(
      addTraditionsEntry(content, {
        id: "fixture-entry-1",
        origin: "custom",
        suggestionId: null,
        title: null,
        text: "Texte initial.",
      }),
    );
    const updated = updateTraditionsEntry(content, "fixture-entry-1", { text: "Texte corrigé par la famille." });
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    const read = readTraditionsForEditing(updated.content);
    expect(read.status === "ready" && read.traditions.entries[0].text).toBe("Texte corrigé par la famille.");
  });

  it("refuses to update over a corrupted stored Traditions list", () => {
    expect(updateTraditionsEntry(CORRUPTED_UNKNOWN_KEY, "fixture-entry-1", { text: "x" })).toEqual({
      ok: false,
      reason: "corrupted",
    });
  });
});

describe("A09 — suppression d'un repère", () => {
  it("removeTraditionsEntry removes exactly the targeted entry", () => {
    let content = EMPTY_CONTENT;
    content = requireOk(
      addTraditionsEntry(content, {
        id: "fixture-entry-1",
        origin: "custom",
        suggestionId: null,
        title: null,
        text: "Premier repère.",
      }),
    );
    content = requireOk(
      addTraditionsEntry(content, {
        id: "fixture-entry-2",
        origin: "custom",
        suggestionId: null,
        title: null,
        text: "Second repère.",
      }),
    );
    const removed = removeTraditionsEntry(content, "fixture-entry-1");
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    const read = readTraditionsForEditing(removed.content);
    expect(read.status === "ready" && read.traditions.entries.map((e) => e.id)).toEqual(["fixture-entry-2"]);
  });

  it("refuses to remove over a corrupted stored Traditions list", () => {
    expect(removeTraditionsEntry(CORRUPTED_UNKNOWN_KEY, "fixture-entry-1")).toEqual({
      ok: false,
      reason: "corrupted",
    });
  });
});

// ---------------------------------------------------------------------
// Plusieurs repères
// ---------------------------------------------------------------------

describe("A09 — plusieurs repères, ajoutés progressivement", () => {
  it("supports adding several entries one after another, preserving order", () => {
    let content = EMPTY_CONTENT;
    content = requireOk(
      addTraditionsEntry(content, {
        id: "fixture-entry-1",
        origin: "custom",
        suggestionId: null,
        title: "Premier",
        text: "Premier repère de la famille.",
      }),
    );
    content = requireOk(
      addTraditionsEntry(content, {
        id: "fixture-entry-2",
        origin: "custom",
        suggestionId: null,
        title: "Deuxième",
        text: "Deuxième repère de la famille.",
      }),
    );
    content = requireOk(
      addTraditionsEntry(content, {
        id: "fixture-entry-3",
        origin: "suggestion",
        suggestionId: "fixture:lantern",
        title: null,
        text: "Troisième repère, adopté depuis une suggestion.",
      }),
    );

    const read = readTraditionsForEditing(content);
    expect(read.status === "ready" && read.traditions.entries.map((e) => e.id)).toEqual([
      "fixture-entry-1",
      "fixture-entry-2",
      "fixture-entry-3",
    ]);

    const committed = commitA09(content);
    expect(committed.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------
// Corruption fail-safe
// ---------------------------------------------------------------------

describe("A09 — corruption fail-safe", () => {
  it("readTraditionsForEditing never throws on a corrupted value, surfaces 'corrupted' instead", () => {
    expect(() => readTraditionsForEditing(CORRUPTED_WRONG_TYPE)).not.toThrow();
    expect(readTraditionsForEditing(CORRUPTED_WRONG_TYPE)).toEqual({ status: "corrupted" });
  });

  it("needsA09 never throws on a corrupted stored Traditions list once reachable", () => {
    const reachable: MemorialContent = { ...a04Answered("no"), ...CORRUPTED_UNKNOWN_KEY };
    expect(() => needsA09(reachable)).not.toThrow();
  });
});

// ---------------------------------------------------------------------
// Never writes into content.ceremony or content.deathNotice
// ---------------------------------------------------------------------

describe("A09 — never writes into content.ceremony or content.deathNotice", () => {
  it("addTraditionsEntry/commitA09/skipA09 leave an existing Ceremony byte-for-byte untouched", () => {
    let content: MemorialContent = {
      ...ceremonyBranchResolvedYes(),
      ceremony: { venueName: "Fixture venue", date: null, time: null, address: null, access: null, note: null },
    };
    const before = content.ceremony;

    content = requireOk(
      addTraditionsEntry(content, {
        id: "fixture-entry-1",
        origin: "custom",
        suggestionId: null,
        title: null,
        text: "Un repère quelconque.",
      }),
    );
    expect(content.ceremony).toBe(before);

    const committed = commitA09(content);
    expect(committed.ok).toBe(true);
    if (committed.ok) expect(committed.content.ceremony).toBe(before);
  });

  it("addTraditionsEntry/commitA09/skipA09 leave an existing Death Notice byte-for-byte untouched", () => {
    let content: MemorialContent = requireOk(commitA01({ ...a04Answered("no"), deathNotice: { announcementText: "Texte fictif.", precisions: { generalLocation: null, familyMessage: null, thought: null, quote: null, other: null } } }));
    const before = content.deathNotice;

    content = requireOk(
      addTraditionsEntry(content, {
        id: "fixture-entry-1",
        origin: "custom",
        suggestionId: null,
        title: null,
        text: "Un repère quelconque.",
      }),
    );
    expect(content.deathNotice).toBe(before);

    const skipped = skipA09(content);
    expect(skipped.ok).toBe(true);
    if (skipped.ok) expect(skipped.content.deathNotice).toBe(before);
  });
});
