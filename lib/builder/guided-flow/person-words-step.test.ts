import { describe, expect, it } from "vitest";
import type { MemorialContent } from "@/types/memorial";
import { commitA04, skipA05, skipA06, skipA07, skipA08 } from "./ceremony-step";
import { addTraditionsEntry, commitA09, skipA09 } from "./traditions-step";
import { humanFlowDefinition } from "./human-steps";
import { firstIncompleteStep } from "./engine";
import {
  commitA10,
  isA10Resolved,
  needsA10,
  readPersonWordsForEditing,
  skipA10,
  writePersonWordsText,
} from "./person-words-step";

/**
 * Mission 043 — contract tests for A10 ("Quelques mots sur la
 * personne"). Same discipline as traditions-step.test.ts/
 * ceremony-step.test.ts. Every `text` used below is a deliberately
 * fictional, neutral fixture — never a real family's content.
 */

const EMPTY_CONTENT: MemorialContent = {};

// `personWords` is deliberately NOT a `SectionId` (see
// types/person-words.ts's own docstring) — `MemorialContent`'s type
// does not know about it, so these fixtures need the same widening cast
// lib/memorial/person-words.test.ts already uses.
const CORRUPTED_UNKNOWN_KEY = { personWords: { text: "x", title: "y" } } as unknown as MemorialContent;

const CORRUPTED_WRONG_TYPE = { personWords: "not an object" } as unknown as MemorialContent;

function requireOk(result: { ok: true; content: MemorialContent } | { ok: false; reason: unknown }): MemorialContent {
  if (!result.ok) throw new Error("test fixture: unexpected write failure");
  return result.content;
}

/** A04 answered "no", A09 explicitly skipped with no repère — the
 * normal, minimal starting point for reaching A10. */
function a09Resolved(): MemorialContent {
  let content = requireOk(commitA04(EMPTY_CONTENT, "no"));
  content = requireOk(skipA09(content));
  return content;
}

/** A04 answered "yes", A05-A08 all explicitly skipped, A09 explicitly
 * skipped — the alternative route into A10 via the "ceremony planned"
 * branch. */
function a09ResolvedThroughCeremonyYes(): MemorialContent {
  let content = requireOk(commitA04(EMPTY_CONTENT, "yes"));
  content = requireOk(skipA05(content));
  content = requireOk(skipA06(content));
  content = requireOk(skipA07(content));
  content = requireOk(skipA08(content));
  content = requireOk(skipA09(content));
  return content;
}

// ---------------------------------------------------------------------
// readPersonWordsForEditing
// ---------------------------------------------------------------------

describe("readPersonWordsForEditing — corruption stays visible, never silently collapsed", () => {
  it("reads an absent PersonWords as the empty, editable content", () => {
    expect(readPersonWordsForEditing(EMPTY_CONTENT)).toEqual({ status: "ready", personWords: { text: null } });
  });

  it("a corrupted PersonWords (unknown key) reads as 'corrupted'", () => {
    expect(readPersonWordsForEditing(CORRUPTED_UNKNOWN_KEY)).toEqual({ status: "corrupted" });
  });

  it("a corrupted PersonWords (wrong type) reads as 'corrupted' too", () => {
    expect(readPersonWordsForEditing(CORRUPTED_WRONG_TYPE)).toEqual({ status: "corrupted" });
  });
});

// ---------------------------------------------------------------------
// needsA10 — reached only after A09 is resolved, whichever route.
// ---------------------------------------------------------------------

describe("needsA10 — A09 not yet resolved", () => {
  it("A10 is not reachable before A09 is resolved", () => {
    expect(needsA10(EMPTY_CONTENT)).toBe(false);
  });

  it("A10 is not reachable while A04 is answered but A09 still pending", () => {
    const content = requireOk(commitA04(EMPTY_CONTENT, "no"));
    expect(needsA10(content)).toBe(false);
  });
});

describe("needsA10 — A09 resolved via the 'no ceremony' route", () => {
  it("A10 becomes reachable immediately once A09 is skipped", () => {
    expect(needsA10(a09Resolved())).toBe(true);
  });
});

describe("needsA10 — A09 resolved via the 'ceremony planned' route", () => {
  it("A10 becomes reachable once A05-A09 are all resolved", () => {
    expect(needsA10(a09ResolvedThroughCeremonyYes())).toBe(true);
  });
});

describe("needsA10 — once resolved, never re-asked", () => {
  it("A10 stays not-needed once explicitly skipped", () => {
    const content = a09Resolved();
    const skipped = skipA10(content);
    expect(skipped.ok).toBe(true);
    if (!skipped.ok) return;
    expect(needsA10(skipped.content)).toBe(false);
    expect(isA10Resolved(skipped.content)).toBe(true);
  });

  it("A10 stays not-needed once explicitly completed", () => {
    let content = a09Resolved();
    content = requireOk(writePersonWordsText(content, "Un texte de famille quelconque."));
    const committed = commitA10(content);
    expect(committed.ok).toBe(true);
    if (!committed.ok) return;
    expect(needsA10(committed.content)).toBe(false);
    expect(isA10Resolved(committed.content)).toBe(true);
  });
});

// ---------------------------------------------------------------------
// Guided Flow route integration — A09 -> A10 -> A11
// ---------------------------------------------------------------------

describe("Route integration — A10 sits exactly between A09 and A11", () => {
  it("firstIncompleteStep lands on A10 once A09 is resolved (A04 = no route)", () => {
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

  it("firstIncompleteStep moves on to A11 once A10 is resolved too", () => {
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
      A10: { status: "skipped" as const },
    };
    expect(firstIncompleteStep(flow, state)?.id).toBe("A11");
  });

  it("A10 is absent from the remembrance route entirely", () => {
    const flow = humanFlowDefinition("remembrance");
    const route = flow.steps.filter((s) => flow.activeGroups.includes(s.group));
    expect(route.some((s) => s.id === "A10")).toBe(false);
  });
});

// ---------------------------------------------------------------------
// Skip with no data
// ---------------------------------------------------------------------

describe("A10 — skip sans donnée", () => {
  it("skipA10 succeeds with no text and never invents one", () => {
    const content = a09Resolved();
    const skipped = skipA10(content);
    expect(skipped.ok).toBe(true);
    if (!skipped.ok) return;
    const read = readPersonWordsForEditing(skipped.content);
    expect(read.status === "ready" && read.personWords.text).toBe(null);
  });

  it("refuses to skip over a corrupted stored PersonWords", () => {
    expect(skipA10(CORRUPTED_UNKNOWN_KEY)).toEqual({ ok: false, reason: "corrupted" });
  });

  it("commitA10 refuses with no text — Continue is not a real outcome with nothing to show", () => {
    const content = a09Resolved();
    expect(commitA10(content)).toEqual({ ok: false, reason: "text" });
  });

  it("skipA10 preserves an already-autosaved text rather than discarding it", () => {
    let content = a09Resolved();
    content = requireOk(writePersonWordsText(content, "Un brouillon non confirmé."));
    const skipped = skipA10(content);
    expect(skipped.ok).toBe(true);
    if (!skipped.ok) return;
    const read = readPersonWordsForEditing(skipped.content);
    expect(read.status === "ready" && read.personWords.text).toBe("Un brouillon non confirmé.");
  });
});

// ---------------------------------------------------------------------
// Continue with a valid text
// ---------------------------------------------------------------------

describe("A10 — continue avec un texte valide", () => {
  it("commitA10 succeeds once text genuinely holds something", () => {
    let content = a09Resolved();
    content = requireOk(writePersonWordsText(content, "Elle avait toujours le mot pour rire."));
    const committed = commitA10(content);
    expect(committed.ok).toBe(true);
    if (!committed.ok) return;
    expect(isA10Resolved(committed.content)).toBe(true);
    expect(needsA10(committed.content)).toBe(false);
    const read = readPersonWordsForEditing(committed.content);
    expect(read.status === "ready" && read.personWords.text).toBe("Elle avait toujours le mot pour rire.");
  });

  it("refuses to commit over a corrupted stored PersonWords", () => {
    expect(commitA10(CORRUPTED_UNKNOWN_KEY)).toEqual({ ok: false, reason: "corrupted" });
  });
});

// ---------------------------------------------------------------------
// Verbatim text — never translated, never analyzed, never inferred
// ---------------------------------------------------------------------

describe("A10 — texte conservé verbatim", () => {
  it("stores the family's text exactly as typed, including casing and punctuation", () => {
    const familyText = "Elle riait fort, aimait les longues discussions — et détestait qu'on soit en retard.";
    const result = writePersonWordsText(EMPTY_CONTENT, familyText);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const read = readPersonWordsForEditing(result.content);
    expect(read.status === "ready" && read.personWords.text).toBe(familyText);
  });

  it("never derives, infers, or attaches any field beyond text", () => {
    const result = writePersonWordsText(EMPTY_CONTENT, "Un texte de famille quelconque.");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const read = readPersonWordsForEditing(result.content);
    const personWords = read.status === "ready" ? read.personWords : undefined;
    expect(Object.keys(personWords ?? {})).toEqual(["text"]);
  });
});

// ---------------------------------------------------------------------
// Modification
// ---------------------------------------------------------------------

describe("A10 — modification du texte", () => {
  it("writePersonWordsText replaces the text in place", () => {
    let content = requireOk(writePersonWordsText(EMPTY_CONTENT, "Texte initial."));
    content = requireOk(writePersonWordsText(content, "Texte corrigé par la famille."));
    const read = readPersonWordsForEditing(content);
    expect(read.status === "ready" && read.personWords.text).toBe("Texte corrigé par la famille.");
  });

  it("clearing the text back to blank normalizes to null, not an empty string", () => {
    let content = requireOk(writePersonWordsText(EMPTY_CONTENT, "Texte initial."));
    content = requireOk(writePersonWordsText(content, "   "));
    const read = readPersonWordsForEditing(content);
    expect(read.status === "ready" && read.personWords.text).toBe(null);
  });

  it("refuses to write over a corrupted stored PersonWords", () => {
    expect(writePersonWordsText(CORRUPTED_UNKNOWN_KEY, "x")).toEqual({ ok: false, reason: "corrupted" });
  });
});

// ---------------------------------------------------------------------
// Corruption fail-safe
// ---------------------------------------------------------------------

describe("A10 — corruption fail-safe", () => {
  it("readPersonWordsForEditing never throws on a corrupted value, surfaces 'corrupted' instead", () => {
    expect(() => readPersonWordsForEditing(CORRUPTED_WRONG_TYPE)).not.toThrow();
    expect(readPersonWordsForEditing(CORRUPTED_WRONG_TYPE)).toEqual({ status: "corrupted" });
  });

  it("needsA10 never throws on a corrupted stored PersonWords once reachable", () => {
    const reachable: MemorialContent = { ...a09Resolved(), ...CORRUPTED_UNKNOWN_KEY };
    expect(() => needsA10(reachable)).not.toThrow();
  });
});

// ---------------------------------------------------------------------
// Never writes into content.traditions, content.ceremony or
// content.deathNotice — and A09 never writes into content.personWords.
// ---------------------------------------------------------------------

describe("A10 — never touches content.traditions, content.ceremony or content.deathNotice", () => {
  it("writePersonWordsText/commitA10/skipA10 leave an existing Traditions list byte-for-byte untouched", () => {
    let content = requireOk(commitA04(EMPTY_CONTENT, "no"));
    content = requireOk(
      addTraditionsEntry(content, {
        id: "fixture-entry-1",
        origin: "custom",
        suggestionId: null,
        title: null,
        text: "Un repère quelconque.",
      }),
    );
    content = requireOk(commitA09(content));
    const before = content.traditions;

    content = requireOk(writePersonWordsText(content, "Un texte quelconque."));
    expect(content.traditions).toBe(before);

    const committed = commitA10(content);
    expect(committed.ok).toBe(true);
    if (committed.ok) expect(committed.content.traditions).toBe(before);
  });

  it("A09's own writes never create or touch content.personWords", () => {
    let content = requireOk(commitA04(EMPTY_CONTENT, "no"));
    content = requireOk(
      addTraditionsEntry(content, {
        id: "fixture-entry-1",
        origin: "custom",
        suggestionId: null,
        title: null,
        text: "Un repère quelconque.",
      }),
    );
    content = requireOk(commitA09(content));
    expect((content as unknown as { personWords?: unknown }).personWords).toBeUndefined();
  });
});
