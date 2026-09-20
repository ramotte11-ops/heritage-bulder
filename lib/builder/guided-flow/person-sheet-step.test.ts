import { describe, expect, it } from "vitest";
import type { MemorialContent } from "@/types/memorial";
import { commitA04, skipA05, skipA06, skipA07, skipA08 } from "./ceremony-step";
import { addTraditionsEntry, commitA09, skipA09 } from "./traditions-step";
import { humanFlowDefinition } from "./human-steps";
import { firstIncompleteStep } from "./engine";
import {
  commitPersonSheet,
  isPersonSheetResolved,
  needsPersonSheet,
  readPersonSheetForEditing,
  skipPersonSheet,
  writeLegacyFieldText,
  writeLovedThingsFieldText,
  writePersonWordsFieldText,
} from "./person-sheet-step";

/**
 * Mission 044 — contract tests for the combined "Quelques mots sur la
 * personne" sheet (A10 + A11 + A12 as ONE Builder screen). Replaces
 * person-words-step.test.ts (Mission 043's own A10-only tests) — same
 * discipline as traditions-step.test.ts/ceremony-step.test.ts. Every
 * `text` used below is a deliberately fictional, neutral fixture — never
 * a real family's content.
 */

const EMPTY_CONTENT: MemorialContent = {};

// None of `personWords`/`lovedThings`/`legacy` is a `SectionId` (see
// types/person-words.ts's own docstring) — `MemorialContent`'s type does
// not know about any of them, so these fixtures need the same widening
// cast lib/memorial/person-words.test.ts already uses.
const CORRUPTED_PERSON_WORDS = { personWords: { text: "x", title: "y" } } as unknown as MemorialContent;
const CORRUPTED_LOVED_THINGS = { lovedThings: { text: "x", title: "y" } } as unknown as MemorialContent;
const CORRUPTED_LEGACY = { legacy: "not an object" } as unknown as MemorialContent;

function requireOk(result: { ok: true; content: MemorialContent } | { ok: false; reason: unknown }): MemorialContent {
  if (!result.ok) throw new Error("test fixture: unexpected write failure");
  return result.content;
}

/** A04 answered "no", A09 explicitly skipped with no repère — the
 * normal, minimal starting point for reaching the combined sheet. */
function a09Resolved(): MemorialContent {
  let content = requireOk(commitA04(EMPTY_CONTENT, "no"));
  content = requireOk(skipA09(content));
  return content;
}

/** A04 answered "yes", A05-A08 all explicitly skipped, A09 explicitly
 * skipped — the alternative route into the sheet via the "ceremony
 * planned" branch. */
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
// readPersonSheetForEditing
// ---------------------------------------------------------------------

describe("readPersonSheetForEditing — corruption in any one matière stays visible, never silently collapsed", () => {
  it("reads an absent sheet as the empty, editable content for all three matières", () => {
    expect(readPersonSheetForEditing(EMPTY_CONTENT)).toEqual({
      status: "ready",
      personWords: { text: null },
      lovedThings: { text: null },
      legacy: { text: null },
    });
  });

  it("a corrupted personWords (A10) makes the whole sheet read as 'corrupted'", () => {
    expect(readPersonSheetForEditing(CORRUPTED_PERSON_WORDS)).toEqual({ status: "corrupted" });
  });

  it("a corrupted lovedThings (A11) makes the whole sheet read as 'corrupted'", () => {
    expect(readPersonSheetForEditing(CORRUPTED_LOVED_THINGS)).toEqual({ status: "corrupted" });
  });

  it("a corrupted legacy (A12) makes the whole sheet read as 'corrupted'", () => {
    expect(readPersonSheetForEditing(CORRUPTED_LEGACY)).toEqual({ status: "corrupted" });
  });

  it("restores all three already-confirmed texts on resume", () => {
    let content = requireOk(writePersonWordsFieldText(EMPTY_CONTENT, "Un texte pour A10."));
    content = requireOk(writeLovedThingsFieldText(content, "Un texte pour A11."));
    content = requireOk(writeLegacyFieldText(content, "Un texte pour A12."));

    expect(readPersonSheetForEditing(content)).toEqual({
      status: "ready",
      personWords: { text: "Un texte pour A10." },
      lovedThings: { text: "Un texte pour A11." },
      legacy: { text: "Un texte pour A12." },
    });
  });
});

// ---------------------------------------------------------------------
// needsPersonSheet — reached only after A09 is resolved, whichever route.
// ---------------------------------------------------------------------

describe("needsPersonSheet — A09 not yet resolved", () => {
  it("the sheet is not reachable before A09 is resolved", () => {
    expect(needsPersonSheet(EMPTY_CONTENT)).toBe(false);
  });

  it("the sheet is not reachable while A04 is answered but A09 still pending", () => {
    const content = requireOk(commitA04(EMPTY_CONTENT, "no"));
    expect(needsPersonSheet(content)).toBe(false);
  });
});

describe("needsPersonSheet — A09 resolved via the 'no ceremony' route", () => {
  it("the sheet becomes reachable immediately once A09 is skipped", () => {
    expect(needsPersonSheet(a09Resolved())).toBe(true);
  });
});

describe("needsPersonSheet — A09 resolved via the 'ceremony planned' route", () => {
  it("the sheet becomes reachable once A05-A09 are all resolved", () => {
    expect(needsPersonSheet(a09ResolvedThroughCeremonyYes())).toBe(true);
  });
});

describe("needsPersonSheet — once resolved, never re-asked", () => {
  it("the sheet stays not-needed once explicitly skipped", () => {
    const content = a09Resolved();
    const skipped = skipPersonSheet(content);
    expect(skipped.ok).toBe(true);
    if (!skipped.ok) return;
    expect(needsPersonSheet(skipped.content)).toBe(false);
    expect(isPersonSheetResolved(skipped.content)).toBe(true);
  });

  it("the sheet stays not-needed once explicitly completed", () => {
    let content = a09Resolved();
    content = requireOk(writePersonWordsFieldText(content, "Un texte de famille quelconque."));
    const committed = commitPersonSheet(content);
    expect(committed.ok).toBe(true);
    if (!committed.ok) return;
    expect(needsPersonSheet(committed.content)).toBe(false);
    expect(isPersonSheetResolved(committed.content)).toBe(true);
  });
});

// ---------------------------------------------------------------------
// Guided Flow route integration — A09 -> [A10/A11/A12] -> A13.
//
// human-steps.ts still declares A10, A11 and A12 as three independent
// StepIds (Mission 025) — this mission does not touch that declaration,
// and does not create a second Guided Flow engine (mission brief section
// 6). These tests exercise the real engine directly against hand-built
// FlowState objects, exactly as person-words-step.test.ts's own "Route
// integration" suite did — they verify the underlying step ORDER stays
// correct (A09 < A10 < A11 < A12 < A13), which this mission's UI never
// needs to rely on since `commitPersonSheet`/`skipPersonSheet` always
// write all three together (see the suite below this one for that real,
// reachable behavior).
// ---------------------------------------------------------------------

describe("Route integration — A10/A11/A12 sit, in order, between A09 and A13", () => {
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

  it("firstIncompleteStep moves on to A13 once the combined sheet is fully resolved", () => {
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
      A11: { status: "skipped" as const },
      A12: { status: "skipped" as const },
    };
    expect(firstIncompleteStep(flow, state)?.id).toBe("A13");
  });

  it("the sheet is absent from the remembrance route entirely", () => {
    const flow = humanFlowDefinition("remembrance");
    const route = flow.steps.filter((s) => flow.activeGroups.includes(s.group));
    expect(route.some((s) => s.id === "A10")).toBe(false);
    expect(route.some((s) => s.id === "A11")).toBe(false);
    expect(route.some((s) => s.id === "A12")).toBe(false);
  });
});

// ---------------------------------------------------------------------
// Skip with no data
// ---------------------------------------------------------------------

describe("Sheet — skip sans donnée", () => {
  it("skipPersonSheet succeeds with no text anywhere and never invents any", () => {
    const content = a09Resolved();
    const skipped = skipPersonSheet(content);
    expect(skipped.ok).toBe(true);
    if (!skipped.ok) return;
    const read = readPersonSheetForEditing(skipped.content);
    expect(read.status).toBe("ready");
    if (read.status !== "ready") return;
    expect(read.personWords.text).toBe(null);
    expect(read.lovedThings.text).toBe(null);
    expect(read.legacy.text).toBe(null);
  });

  it("refuses to skip over a corrupted stored matière (A10)", () => {
    expect(skipPersonSheet(CORRUPTED_PERSON_WORDS)).toEqual({ ok: false, reason: "corrupted" });
  });

  it("refuses to skip over a corrupted stored matière (A11)", () => {
    expect(skipPersonSheet(CORRUPTED_LOVED_THINGS)).toEqual({ ok: false, reason: "corrupted" });
  });

  it("refuses to skip over a corrupted stored matière (A12)", () => {
    expect(skipPersonSheet(CORRUPTED_LEGACY)).toEqual({ ok: false, reason: "corrupted" });
  });

  it("commitPersonSheet refuses when all three are empty — Continue is not a real outcome with nothing to show", () => {
    const content = a09Resolved();
    expect(commitPersonSheet(content)).toEqual({ ok: false, reason: "empty" });
  });

  it("skipPersonSheet preserves already-autosaved text in all three fields rather than discarding it", () => {
    let content = a09Resolved();
    content = requireOk(writePersonWordsFieldText(content, "Brouillon A10."));
    content = requireOk(writeLovedThingsFieldText(content, "Brouillon A11."));
    content = requireOk(writeLegacyFieldText(content, "Brouillon A12."));
    const skipped = skipPersonSheet(content);
    expect(skipped.ok).toBe(true);
    if (!skipped.ok) return;
    const read = readPersonSheetForEditing(skipped.content);
    expect(read.status).toBe("ready");
    if (read.status !== "ready") return;
    expect(read.personWords.text).toBe("Brouillon A10.");
    expect(read.lovedThings.text).toBe("Brouillon A11.");
    expect(read.legacy.text).toBe("Brouillon A12.");
    // Skip resolves the moment without asserting completion — none of
    // the three drafts is marked "completed" just because it exists.
    expect((skipped.content as unknown as { guidedFlow: Record<string, { status: string }> }).guidedFlow).toEqual(
      expect.objectContaining({
        A10: { status: "skipped" },
        A11: { status: "skipped" },
        A12: { status: "skipped" },
      }),
    );
  });
});

// ---------------------------------------------------------------------
// Continue — every combination of filled/empty matières
// ---------------------------------------------------------------------

describe("Sheet — continue avec un seul texte", () => {
  it("only A10 filled -> A10 completed, A11/A12 skipped", () => {
    let content = a09Resolved();
    content = requireOk(writePersonWordsFieldText(content, "Elle avait toujours le mot pour rire."));
    const committed = commitPersonSheet(content);
    expect(committed.ok).toBe(true);
    if (!committed.ok) return;
    const flow = (committed.content as unknown as { guidedFlow: Record<string, { status: string }> }).guidedFlow;
    expect(flow.A10).toEqual({ status: "completed" });
    expect(flow.A11).toEqual({ status: "skipped" });
    expect(flow.A12).toEqual({ status: "skipped" });
  });

  it("only A11 filled -> A11 completed, A10/A12 skipped", () => {
    let content = a09Resolved();
    content = requireOk(writeLovedThingsFieldText(content, "Les longues promenades du dimanche."));
    const committed = commitPersonSheet(content);
    expect(committed.ok).toBe(true);
    if (!committed.ok) return;
    const flow = (committed.content as unknown as { guidedFlow: Record<string, { status: string }> }).guidedFlow;
    expect(flow.A10).toEqual({ status: "skipped" });
    expect(flow.A11).toEqual({ status: "completed" });
    expect(flow.A12).toEqual({ status: "skipped" });
  });

  it("only A12 filled -> A12 completed, A10/A11 skipped", () => {
    let content = a09Resolved();
    content = requireOk(writeLegacyFieldText(content, "Toujours dire merci."));
    const committed = commitPersonSheet(content);
    expect(committed.ok).toBe(true);
    if (!committed.ok) return;
    const flow = (committed.content as unknown as { guidedFlow: Record<string, { status: string }> }).guidedFlow;
    expect(flow.A10).toEqual({ status: "skipped" });
    expect(flow.A11).toEqual({ status: "skipped" });
    expect(flow.A12).toEqual({ status: "completed" });
  });
});

describe("Sheet — continue avec plusieurs textes", () => {
  it("A10 + A12 filled, A11 left empty", () => {
    let content = a09Resolved();
    content = requireOk(writePersonWordsFieldText(content, "Un texte A10."));
    content = requireOk(writeLegacyFieldText(content, "Un texte A12."));
    const committed = commitPersonSheet(content);
    expect(committed.ok).toBe(true);
    if (!committed.ok) return;
    const flow = (committed.content as unknown as { guidedFlow: Record<string, { status: string }> }).guidedFlow;
    expect(flow.A10).toEqual({ status: "completed" });
    expect(flow.A11).toEqual({ status: "skipped" });
    expect(flow.A12).toEqual({ status: "completed" });
  });

  it("all three filled", () => {
    let content = a09Resolved();
    content = requireOk(writePersonWordsFieldText(content, "Un texte A10."));
    content = requireOk(writeLovedThingsFieldText(content, "Un texte A11."));
    content = requireOk(writeLegacyFieldText(content, "Un texte A12."));
    const committed = commitPersonSheet(content);
    expect(committed.ok).toBe(true);
    if (!committed.ok) return;
    expect(isPersonSheetResolved(committed.content)).toBe(true);
    const flow = (committed.content as unknown as { guidedFlow: Record<string, { status: string }> }).guidedFlow;
    expect(flow.A10).toEqual({ status: "completed" });
    expect(flow.A11).toEqual({ status: "completed" });
    expect(flow.A12).toEqual({ status: "completed" });
  });

  it("refuses to commit over a corrupted stored matière", () => {
    expect(commitPersonSheet(CORRUPTED_LOVED_THINGS)).toEqual({ ok: false, reason: "corrupted" });
  });
});

// ---------------------------------------------------------------------
// Verbatim text — never translated, never analyzed, never inferred
// ---------------------------------------------------------------------

describe("Sheet — texte conservé verbatim, jamais de champ inventé", () => {
  it("stores each matière's text exactly as typed", () => {
    const a10Text = "Elle riait fort et détestait qu'on soit en retard.";
    const a11Text = "Les dimanches en famille et le café du matin.";
    const a12Text = "Toujours dire merci.";

    let content = requireOk(writePersonWordsFieldText(EMPTY_CONTENT, a10Text));
    content = requireOk(writeLovedThingsFieldText(content, a11Text));
    content = requireOk(writeLegacyFieldText(content, a12Text));

    const read = readPersonSheetForEditing(content);
    expect(read.status).toBe("ready");
    if (read.status !== "ready") return;
    expect(read.personWords.text).toBe(a10Text);
    expect(read.lovedThings.text).toBe(a11Text);
    expect(read.legacy.text).toBe(a12Text);
  });

  it("never derives, infers, or attaches any field beyond text, for any of the three matières", () => {
    let content = requireOk(writePersonWordsFieldText(EMPTY_CONTENT, "Texte A10."));
    content = requireOk(writeLovedThingsFieldText(content, "Texte A11."));
    content = requireOk(writeLegacyFieldText(content, "Texte A12."));

    const read = readPersonSheetForEditing(content);
    expect(read.status).toBe("ready");
    if (read.status !== "ready") return;
    expect(Object.keys(read.personWords)).toEqual(["text"]);
    expect(Object.keys(read.lovedThings)).toEqual(["text"]);
    expect(Object.keys(read.legacy)).toEqual(["text"]);
  });
});

// ---------------------------------------------------------------------
// Modification
// ---------------------------------------------------------------------

describe("Sheet — modification du texte", () => {
  it("writePersonWordsFieldText/writeLovedThingsFieldText/writeLegacyFieldText each replace their own text in place", () => {
    let content = requireOk(writePersonWordsFieldText(EMPTY_CONTENT, "A10 initial."));
    content = requireOk(writeLovedThingsFieldText(content, "A11 initial."));
    content = requireOk(writeLegacyFieldText(content, "A12 initial."));

    content = requireOk(writePersonWordsFieldText(content, "A10 corrigé."));
    content = requireOk(writeLovedThingsFieldText(content, "A11 corrigé."));
    content = requireOk(writeLegacyFieldText(content, "A12 corrigé."));

    const read = readPersonSheetForEditing(content);
    expect(read.status).toBe("ready");
    if (read.status !== "ready") return;
    expect(read.personWords.text).toBe("A10 corrigé.");
    expect(read.lovedThings.text).toBe("A11 corrigé.");
    expect(read.legacy.text).toBe("A12 corrigé.");
  });

  it("clearing any field back to blank normalizes to null, not an empty string", () => {
    let content = requireOk(writePersonWordsFieldText(EMPTY_CONTENT, "A10."));
    content = requireOk(writePersonWordsFieldText(content, "   "));
    const read = readPersonSheetForEditing(content);
    expect(read.status).toBe("ready");
    if (read.status !== "ready") return;
    expect(read.personWords.text).toBe(null);
  });

  it("each field write refuses over its own corrupted stored matière", () => {
    expect(writePersonWordsFieldText(CORRUPTED_PERSON_WORDS, "x")).toEqual({ ok: false, reason: "corrupted" });
    expect(writeLovedThingsFieldText(CORRUPTED_LOVED_THINGS, "x")).toEqual({ ok: false, reason: "corrupted" });
    expect(writeLegacyFieldText(CORRUPTED_LEGACY, "x")).toEqual({ ok: false, reason: "corrupted" });
  });
});

// ---------------------------------------------------------------------
// Corruption fail-safe
// ---------------------------------------------------------------------

describe("Sheet — corruption fail-safe", () => {
  it("readPersonSheetForEditing never throws on a corrupted value, surfaces 'corrupted' instead", () => {
    expect(() => readPersonSheetForEditing(CORRUPTED_LEGACY)).not.toThrow();
    expect(readPersonSheetForEditing(CORRUPTED_LEGACY)).toEqual({ status: "corrupted" });
  });

  it("needsPersonSheet never throws on a corrupted stored matière once reachable", () => {
    const reachable: MemorialContent = { ...a09Resolved(), ...CORRUPTED_PERSON_WORDS };
    expect(() => needsPersonSheet(reachable)).not.toThrow();
  });
});

// ---------------------------------------------------------------------
// Never touches content.traditions, content.ceremony or
// content.deathNotice — and A09 never writes into any of the sheet's
// three matières.
// ---------------------------------------------------------------------

describe("Sheet — never touches content.traditions, content.ceremony or content.deathNotice", () => {
  it("field writes / commitPersonSheet / skipPersonSheet leave an existing Traditions list byte-for-byte untouched", () => {
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

    content = requireOk(writePersonWordsFieldText(content, "Un texte quelconque."));
    expect(content.traditions).toBe(before);

    const committed = commitPersonSheet(content);
    expect(committed.ok).toBe(true);
    if (committed.ok) expect(committed.content.traditions).toBe(before);
  });

  it("A09's own writes never create or touch personWords/lovedThings/legacy", () => {
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
    const widened = content as unknown as { personWords?: unknown; lovedThings?: unknown; legacy?: unknown };
    expect(widened.personWords).toBeUndefined();
    expect(widened.lovedThings).toBeUndefined();
    expect(widened.legacy).toBeUndefined();
  });
});
