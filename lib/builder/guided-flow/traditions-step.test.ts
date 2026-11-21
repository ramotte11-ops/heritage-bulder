import { describe, expect, it } from "vitest";
import type { MemorialContent } from "@/types/memorial";
import { commitA04, skipA05, skipA06, skipA07, skipA08, skipA14 } from "./ceremony-step";
import { commitA01 } from "./death-notice-step";
import { A09_CONFIRMATION_PREFIX, humanFlowDefinition } from "./human-steps";
import { readGuidedFlowState } from "./flow-state";
import { applicableSteps, firstIncompleteStep } from "./engine";
import {
  addTraditionsEntry,
  commitA09,
  hasMovedPastTraditions,
  isA09Resolved,
  isTraditionsConfirmed,
  isTraditionsPendingConfirmation,
  traditionsConfirmationAnswer,
  traditionsConfirmationFingerprint,
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

/** B02-L2 — A09 belongs with the death notice: these fixtures start from
 * a family that answered A00 = "yes". */
const A00_YES_CONTENT = { guidedFlow: { A00: { status: "completed", answer: "yes" } } } as unknown as MemorialContent;

function a04Answered(answer: "yes" | "undecided" | "no", content: MemorialContent = A00_YES_CONTENT): MemorialContent {
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
  content = requireOk(skipA14(content));
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
    const flow = humanFlowDefinition();
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
      A14: { status: "skipped" as const },
      A08: { status: "skipped" as const },
    };
    expect(firstIncompleteStep(flow, state)?.id).toBe("A09");
  });

  it("firstIncompleteStep lands on A09 immediately after A04 = no (A05-A08 non-applicable)", () => {
    const flow = humanFlowDefinition();
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
    const flow = humanFlowDefinition();
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
    const flow = humanFlowDefinition();
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

  it("A09 is part of the route whatever A00 — independent of the death notice (Chef 03 / O03)", () => {
    const flow = humanFlowDefinition();
    for (const A00 of [
      { status: "completed", answer: "yes" },
      { status: "completed", answer: "no" },
      { status: "skipped", answer: "later" },
    ] as const) {
      expect(applicableSteps(flow, { A00: { ...A00 } }).map((s) => s.id)).toContain("A09");
    }
    expect(applicableSteps(flow, {}).map((s) => s.id)).toContain("A09");
  });
});

describe("needsA09 — Chef 03 / O03: independent of A00", () => {
  const withA00 = (record: object) => ({ guidedFlow: { A00: record } }) as unknown as MemorialContent;

  it.each([
    ["yes", { status: "completed", answer: "yes" }],
    ["no", { status: "completed", answer: "no" }],
    ["later", { status: "skipped", answer: "later" }],
  ])("A00 = %s: offered once the ceremony block is behind the family, never before", (_answer, record) => {
    expect(needsA09(withA00(record))).toBe(false);
    expect(needsA09(a04Answered("yes", withA00(record)))).toBe(false);
    expect(needsA09(a04Answered("no", withA00(record)))).toBe(true);
  });

  it("A00 never answered: same rule", () => {
    expect(needsA09(a04Answered("no", EMPTY_CONTENT))).toBe(true);
  });

  it("entries already written are kept whatever A00 becomes, and A09 stays offered", () => {
    const withEntry = requireOk(
      addTraditionsEntry(a04Answered("no"), {
        id: "fixture-entry-kept",
        origin: "custom",
        suggestionId: null,
        title: null,
        text: "Un repère fictif.",
      }),
    );
    const no = { ...withEntry, guidedFlow: { ...(withEntry as { guidedFlow: object }).guidedFlow, A00: { status: "completed", answer: "no" } } } as MemorialContent;
    expect(needsA09(no)).toBe(true);
    expect((no as { traditions: unknown }).traditions).toEqual((withEntry as { traditions: unknown }).traditions);
    expect(needsA09(withEntry)).toBe(true);
  });
});

describe("hasMovedPastTraditions — a pre-O03 draft already past A09's place is never sent back (PO)", () => {
  const NO = { status: "completed", answer: "no" } as const;
  const preO03 = (extra: object = {}, guidedFlow: object = {}) => {
    const base = a04Answered("no", { guidedFlow: { A00: NO } } as unknown as MemorialContent);
    return {
      ...base,
      ...extra,
      guidedFlow: { ...(base as { guidedFlow: object }).guidedFlow, ...guidedFlow },
    } as unknown as MemorialContent;
  };

  it("a fresh draft at A09's place has not moved past it: A09 is offered", () => {
    expect(hasMovedPastTraditions(preO03())).toBe(false);
    expect(needsA09(preO03())).toBe(true);
  });

  it("a draft whose person sheet is already treated is not sent back to A09", () => {
    const sheetDone = preO03({}, { A10: { status: "skipped" }, A11: { status: "skipped" }, A12: { status: "skipped" } });
    expect(hasMovedPastTraditions(sheetDone)).toBe(true);
    expect(needsA09(sheetDone)).toBe(false);
    expect(isA09Resolved(sheetDone)).toBe(false);
  });

  it("a draft that already started the sheet (autosaved text) is not sent back either", () => {
    const started = preO03({ personWords: { text: "Un texte fictif déjà commencé." } });
    expect(hasMovedPastTraditions(started)).toBe(true);
    expect(needsA09(started)).toBe(false);
  });

  it("a blank autosaved text does not count as started", () => {
    expect(hasMovedPastTraditions(preO03({ personWords: { text: "   " } }))).toBe(false);
  });

  it("an unreadable sheet matière fails towards « do not redirect »", () => {
    expect(hasMovedPastTraditions(preO03({ lovedThings: "corrompu" }))).toBe(true);
  });
});

describe("A09 — the fingerprinted confirmation: written by « Continuer » only (O03 publication guard)", () => {
  const ENTRY = { id: "fixture-marker", origin: "custom", suggestionId: null, title: null, text: "Un repère fictif." } as const;
  const SECOND = { id: "fixture-marker-2", origin: "custom", suggestionId: null, title: "Titre", text: "Un second repère." } as const;
  const A00_NO = { guidedFlow: { A00: { status: "completed", answer: "no" } } } as unknown as MemorialContent;
  const withEntry = () => requireOk(addTraditionsEntry(a04Answered("no", A00_NO), { ...ENTRY }));
  const a09 = (content: MemorialContent) => readGuidedFlowState(content).A09;

  it("commitA09 records a confirmation of the repères as they stand", () => {
    const confirmed = requireOk(commitA09(withEntry()));
    const answer = a09(confirmed)?.answer ?? "";
    expect(a09(confirmed)?.status).toBe("completed");
    expect(answer.startsWith(A09_CONFIRMATION_PREFIX)).toBe(true);
    expect(answer).toBe(traditionsConfirmationAnswer(withEntry()));
    expect(isTraditionsConfirmed(confirmed)).toBe(true);
  });

  it("the fingerprint is deterministic and follows every displayed field, in order", () => {
    const base = withEntry();
    expect(traditionsConfirmationFingerprint(base)).toBe(traditionsConfirmationFingerprint(structuredClone(base)));
    const edited = requireOk(updateTraditionsEntry(base, ENTRY.id, { text: "Un autre texte." }));
    const titled = requireOk(updateTraditionsEntry(base, ENTRY.id, { title: "Un titre" }));
    const added = requireOk(addTraditionsEntry(base, { ...SECOND }));
    const fingerprints = new Set([base, edited, titled, added].map(traditionsConfirmationFingerprint));
    expect(fingerprints.size).toBe(4);
    expect(traditionsConfirmationFingerprint(CORRUPTED_UNKNOWN_KEY)).toBeNull();
  });

  it("skipA09 never creates a confirmation — with or without repères", () => {
    expect(a09(requireOk(skipA09(a04Answered("no"))))).toEqual({ status: "skipped" });
    expect(a09(requireOk(skipA09(withEntry())))).toEqual({ status: "skipped" });
    expect(isTraditionsConfirmed(requireOk(skipA09(withEntry())))).toBe(false);
  });

  it("skipA09 over an old, unmarked record — or the pre-fingerprint value — never confirms", () => {
    for (const record of [{ status: "completed" }, { status: "completed", answer: "independent" }]) {
      const old = { ...withEntry(), guidedFlow: { ...readGuidedFlowState(withEntry()), A09: record } } as unknown as MemorialContent;
      expect(isTraditionsConfirmed(old)).toBe(false);
      expect(isTraditionsConfirmed(requireOk(skipA09(old)))).toBe(false);
    }
  });

  it("skipA09 keeps an earlier confirmation verbatim, still valid while nothing changed", () => {
    const confirmed = requireOk(commitA09(withEntry()));
    const passed = requireOk(skipA09(confirmed));
    expect(a09(passed)).toEqual({ status: "skipped", answer: a09(confirmed)?.answer });
    expect(isTraditionsConfirmed(passed)).toBe(true);
  });

  it.each([
    ["added", (c: MemorialContent) => requireOk(addTraditionsEntry(c, { ...SECOND }))],
    ["edited", (c: MemorialContent) => requireOk(updateTraditionsEntry(c, ENTRY.id, { text: "Modifié sans confirmer." }))],
    ["removed", (c: MemorialContent) => requireOk(removeTraditionsEntry(c, SECOND.id))],
  ] as const)("a repère %s after the confirmation, then « Passer »: not confirmed — nothing deleted", (_label, change) => {
    // Two repères confirmed together, then one change without « Continuer ».
    const confirmed = requireOk(commitA09(requireOk(addTraditionsEntry(withEntry(), { ...SECOND }))));
    const changed = _label === "added"
      ? requireOk(addTraditionsEntry(confirmed, { ...SECOND, id: "fixture-marker-3" }))
      : change(confirmed);
    const passed = requireOk(skipA09(changed));
    expect(isTraditionsConfirmed(passed)).toBe(false);
    expect(isTraditionsPendingConfirmation(passed)).toBe(true);
    expect((passed as { traditions: unknown }).traditions).toEqual((changed as { traditions: unknown }).traditions);
    // « Continuer » confirms the new version.
    const reconfirmed = requireOk(commitA09(passed));
    expect(isTraditionsConfirmed(reconfirmed)).toBe(true);
    expect(isTraditionsPendingConfirmation(reconfirmed)).toBe(false);
  });

  it("editing a repère writes nothing on A09's record", () => {
    const base = requireOk(skipA09(withEntry()));
    const edited = requireOk(updateTraditionsEntry(base, ENTRY.id, { text: "Un autre texte fictif." }));
    expect(a09(edited)).toEqual({ status: "skipped" });
    const removed = requireOk(removeTraditionsEntry(edited, ENTRY.id));
    expect(a09(removed)).toEqual({ status: "skipped" });
  });
});

describe("isTraditionsPendingConfirmation — what « Mon parcours » flags (O03)", () => {
  const ENTRY = { id: "fixture-pending", origin: "custom", suggestionId: null, title: null, text: "Un repère fictif." } as const;
  const withA00 = (content: MemorialContent, answer: "yes" | "no" | "later") =>
    ({
      ...content,
      guidedFlow: {
        ...readGuidedFlowState(content),
        A00: answer === "later" ? { status: "skipped", answer } : { status: "completed", answer },
      },
    }) as unknown as MemorialContent;

  it("A00 = no / later with unconfirmed repères: pending; confirmed: not pending", () => {
    for (const answer of ["no", "later"] as const) {
      const unconfirmed = withA00(requireOk(skipA09(requireOk(addTraditionsEntry(a04Answered("no"), { ...ENTRY })))), answer);
      expect(isTraditionsPendingConfirmation(unconfirmed)).toBe(true);
      expect(isTraditionsPendingConfirmation(requireOk(commitA09(unconfirmed)))).toBe(false);
    }
  });

  it("never pending without repères, nor with A00 = yes (the pre-O03 rule shows them)", () => {
    expect(isTraditionsPendingConfirmation(withA00(requireOk(skipA09(a04Answered("no"))), "no"))).toBe(false);
    const yes = withA00(requireOk(skipA09(requireOk(addTraditionsEntry(a04Answered("no"), { ...ENTRY })))), "yes");
    expect(isTraditionsPendingConfirmation(yes)).toBe(false);
  });

  it("an unreadable Traditions is never flagged (nothing to confirm safely)", () => {
    expect(isTraditionsPendingConfirmation(CORRUPTED_UNKNOWN_KEY)).toBe(false);
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
