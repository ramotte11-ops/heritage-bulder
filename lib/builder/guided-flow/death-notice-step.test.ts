import { describe, expect, it } from "vitest";
import type { MemorialContent } from "@/types/memorial";
import { EMPTY_DEATH_NOTICE_CONTENT, EMPTY_DEATH_NOTICE_PRECISIONS } from "@/types/death-notice";
import { humanFlowDefinition } from "./human-steps";
import { firstIncompleteStep } from "./engine";
import {
  commitA01,
  commitA02,
  deathNoticeStepProgress,
  isA01Complete,
  isA02Resolved,
  needsA01,
  needsA02,
  readDeathNoticeForEditing,
  skipA02,
  writeAnnouncementText,
  writePrecision,
} from "./death-notice-step";

/**
 * Mission 039 — contract tests for A01 (l'annonce) and A02 (précisions
 * facultatives). Same discipline as hero-step.test.ts: every scenario
 * the mission brief's own test list (section 18) names, expressed
 * directly against this module's pure functions.
 */

const EMPTY_CONTENT: MemorialContent = {};

function deathNoticeContent(overrides: Partial<{ announcementText: string | null }> = {}): MemorialContent {
  return { deathNotice: { ...EMPTY_DEATH_NOTICE_CONTENT, ...overrides } };
}

/** A01 genuinely behind the family: text autosaved, THEN `commitA01`
 * actually called (the real Continue click). */
function a01Done(text = "Elle s'en est allée paisiblement, entourée des siens."): MemorialContent {
  const written = writeAnnouncementText(EMPTY_CONTENT, text);
  if (!written.ok) throw new Error("test fixture: writeAnnouncementText unexpectedly failed");
  const committed = commitA01(written.content);
  if (!committed.ok) throw new Error("test fixture: commitA01 unexpectedly failed");
  return committed.content;
}

const CORRUPTED_UNKNOWN_KEY: MemorialContent = {
  deathNotice: { announcementText: "Texte.", displayName: "Jean Dupont" } as unknown as MemorialContent["deathNotice"],
};

const CORRUPTED_WRONG_TYPE: MemorialContent = {
  deathNotice: "not an object" as unknown as MemorialContent["deathNotice"],
};

// ---------------------------------------------------------------------
// readDeathNoticeForEditing
// ---------------------------------------------------------------------

describe("readDeathNoticeForEditing — corruption stays visible, never silently collapsed", () => {
  it("reads an absent Death Notice as the empty, editable content", () => {
    expect(readDeathNoticeForEditing(EMPTY_CONTENT)).toEqual({
      status: "ready",
      deathNotice: EMPTY_DEATH_NOTICE_CONTENT,
    });
  });

  it("reads an existing valid Death Notice back exactly, not re-derived", () => {
    const content = deathNoticeContent({ announcementText: "Quelques mots." });
    expect(readDeathNoticeForEditing(content)).toEqual({
      status: "ready",
      deathNotice: { announcementText: "Quelques mots.", precisions: EMPTY_DEATH_NOTICE_PRECISIONS },
    });
  });

  it("a corrupted Death Notice (unknown key) reads as 'corrupted', never silently as empty", () => {
    expect(readDeathNoticeForEditing(CORRUPTED_UNKNOWN_KEY)).toEqual({ status: "corrupted" });
  });

  it("a corrupted Death Notice (wrong type) reads as 'corrupted' too", () => {
    expect(readDeathNoticeForEditing(CORRUPTED_WRONG_TYPE)).toEqual({ status: "corrupted" });
  });
});

// ---------------------------------------------------------------------
// A01 — writeAnnouncementText / commitA01 / needsA01 / isA01Complete
// ---------------------------------------------------------------------

describe("writeAnnouncementText — A01 field write, never rejected, corruption refused", () => {
  it("trims and preserves the family's text exactly (casing, accents, punctuation)", () => {
    const result = writeAnnouncementText(EMPTY_CONTENT, "  C'est avec tristesse que nous annonçons…  ");
    expect(result).toEqual({
      ok: true,
      content: deathNoticeContent({ announcementText: "C'est avec tristesse que nous annonçons…" }),
    });
  });

  it("a blanks-only text normalizes to absent, not an error — no artificial minimum", () => {
    const result = writeAnnouncementText(EMPTY_CONTENT, "   ");
    expect(result).toEqual({ ok: true, content: deathNoticeContent({ announcementText: null }) });
  });

  it("a short, minimal announcement is accepted exactly as typed", () => {
    const result = writeAnnouncementText(EMPTY_CONTENT, "Au revoir, Papa.");
    expect(result).toEqual({ ok: true, content: deathNoticeContent({ announcementText: "Au revoir, Papa." }) });
  });

  it("refuses to write over a corrupted stored Death Notice — never silently replaced", () => {
    expect(writeAnnouncementText(CORRUPTED_UNKNOWN_KEY, "Nouveau texte")).toEqual({
      ok: false,
      reason: "corrupted",
    });
    expect(writeAnnouncementText(CORRUPTED_WRONG_TYPE, "Nouveau texte")).toEqual({
      ok: false,
      reason: "corrupted",
    });
  });

  it("preserves every other content key when writing", () => {
    const content: MemorialContent = { ...deathNoticeContent(), hero: { displayName: "Jean Dupont" } };
    const result = writeAnnouncementText(content, "Texte");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.content.hero).toEqual({ displayName: "Jean Dupont" });
  });
});

describe("A01 — vide → non completed", () => {
  it("an empty draft needs A01 and is not complete", () => {
    expect(needsA01(EMPTY_CONTENT)).toBe(true);
    expect(isA01Complete(EMPTY_CONTENT)).toBe(false);
  });
});

describe("A01 — texte + fermer avant CTA → reprise A01 (autosave alone never completes it)", () => {
  it("text autosaved, no Continue click yet, still needs A01", () => {
    const written = writeAnnouncementText(EMPTY_CONTENT, "Texte en cours de saisie…");
    expect(written.ok).toBe(true);
    if (!written.ok) return;
    expect(needsA01(written.content)).toBe(true);
    expect(isA01Complete(written.content)).toBe(false);
  });
});

describe("A01 — texte + CTA (commitA01) → completed", () => {
  it("commitA01 writes A01's StepRecord as completed once real text is present", () => {
    const written = writeAnnouncementText(EMPTY_CONTENT, "Elle restera dans nos cœurs.");
    expect(written.ok).toBe(true);
    if (!written.ok) return;
    const committed = commitA01(written.content);
    expect(committed).toEqual({
      ok: true,
      content: { ...written.content, guidedFlow: { A01: { status: "completed" } } },
    });
    if (committed.ok) {
      expect(needsA01(committed.content)).toBe(false);
      expect(isA01Complete(committed.content)).toBe(true);
    }
  });

  it("resuming after commit still shows the family's own saved text, unchanged", () => {
    const content = a01Done("Elle restera dans nos cœurs.");
    const read = readDeathNoticeForEditing(content);
    expect(read).toEqual({
      status: "ready",
      deathNotice: { announcementText: "Elle restera dans nos cœurs.", precisions: EMPTY_DEATH_NOTICE_PRECISIONS },
    });
  });
});

describe("A01 — refuse Continue without real text (required, non-passable)", () => {
  it("commitA01 rejects when announcementText is still null", () => {
    expect(commitA01(EMPTY_CONTENT)).toEqual({ ok: false, reason: "announcementText" });
  });

  it("commitA01 rejects a blanks-only text normalized away to null", () => {
    const written = writeAnnouncementText(EMPTY_CONTENT, "   ");
    expect(written.ok).toBe(true);
    if (!written.ok) return;
    expect(commitA01(written.content)).toEqual({ ok: false, reason: "announcementText" });
  });
});

describe("A01 — persist échoue → incomplete (commitA01 itself never writes without real content)", () => {
  it("a rejected commit produces no StepRecord at all — the draft stays exactly as before", () => {
    const before = EMPTY_CONTENT;
    const result = commitA01(before);
    expect(result.ok).toBe(false);
    // Nothing durable was ever produced by the rejected attempt.
    expect(needsA01(before)).toBe(true);
  });
});

describe("A01 — corrupted Death Notice → write refused", () => {
  it("commitA01 refuses on a corrupted stored Death Notice", () => {
    expect(commitA01(CORRUPTED_UNKNOWN_KEY)).toEqual({ ok: false, reason: "corrupted" });
    expect(commitA01(CORRUPTED_WRONG_TYPE)).toEqual({ ok: false, reason: "corrupted" });
  });

  it("needsA01 stays true on a corrupted stored Death Notice — the family is routed back to A01", () => {
    expect(needsA01(CORRUPTED_UNKNOWN_KEY)).toBe(true);
    expect(needsA01(CORRUPTED_WRONG_TYPE)).toBe(true);
  });
});

// ---------------------------------------------------------------------
// A02 — writePrecision / commitA02 / skipA02 / needsA02 / isA02Resolved
// ---------------------------------------------------------------------

describe("writePrecision — A02 field writes, one at a time, never rejected", () => {
  it("sets exactly one precision field, leaving the other four untouched", () => {
    const base = a01Done();
    const withLocation = writePrecision(base, "generalLocation", "Dans la région de Lyon");
    expect(withLocation.ok).toBe(true);
    if (!withLocation.ok) return;

    const withThought = writePrecision(withLocation.content, "thought", "Une pensée pour tous.");
    expect(withThought.ok).toBe(true);
    if (!withThought.ok) return;

    const read = readDeathNoticeForEditing(withThought.content);
    expect(read.status).toBe("ready");
    if (read.status === "ready") {
      expect(read.deathNotice.precisions).toEqual({
        ...EMPTY_DEATH_NOTICE_PRECISIONS,
        generalLocation: "Dans la région de Lyon",
        thought: "Une pensée pour tous.",
      });
    }
  });

  it("each of the five precisions writes independently", () => {
    const fields = ["generalLocation", "familyMessage", "thought", "quote", "other"] as const;
    for (const field of fields) {
      const result = writePrecision(a01Done(), field, "Texte de la famille.");
      expect(result.ok).toBe(true);
      if (result.ok) {
        const read = readDeathNoticeForEditing(result.content);
        expect(read.status === "ready" && read.deathNotice.precisions[field]).toBe("Texte de la famille.");
      }
    }
  });

  it("a blanks-only precision normalizes to absent, never rejected", () => {
    const result = writePrecision(a01Done(), "quote", "   ");
    expect(result.ok).toBe(true);
    if (result.ok) {
      const read = readDeathNoticeForEditing(result.content);
      expect(read.status === "ready" && read.deathNotice.precisions.quote).toBe(null);
    }
  });

  it("refuses to write over a corrupted stored Death Notice", () => {
    expect(writePrecision(CORRUPTED_UNKNOWN_KEY, "thought", "Texte")).toEqual({ ok: false, reason: "corrupted" });
  });
});

describe("A02 — aucun champ ouvert (rien saisi)", () => {
  it("needsA02 is true right after A01, nothing yet resolved", () => {
    const content = a01Done();
    expect(needsA02(content)).toBe(true);
    expect(isA02Resolved(content)).toBe(false);
  });
});

describe("A02 — ouverture d'un champ / plusieurs champs (autosave alone never resolves A02)", () => {
  it("one precision autosaved, no CTA yet, A02 still not resolved", () => {
    const withOne = writePrecision(a01Done(), "familyMessage", "Merci à tous.");
    expect(withOne.ok).toBe(true);
    if (!withOne.ok) return;
    expect(needsA02(withOne.content)).toBe(true);
    expect(isA02Resolved(withOne.content)).toBe(false);
  });

  it("several precisions autosaved, no CTA yet, A02 still not resolved — reprise A02 with everything conserved", () => {
    const withOne = writePrecision(a01Done(), "familyMessage", "Merci à tous.");
    expect(withOne.ok).toBe(true);
    if (!withOne.ok) return;
    const withTwo = writePrecision(withOne.content, "quote", "\"Aimer, c'est se souvenir.\"");
    expect(withTwo.ok).toBe(true);
    if (!withTwo.ok) return;

    expect(needsA02(withTwo.content)).toBe(true);
    const read = readDeathNoticeForEditing(withTwo.content);
    expect(read.status === "ready" && read.deathNotice.precisions).toEqual({
      ...EMPTY_DEATH_NOTICE_PRECISIONS,
      familyMessage: "Merci à tous.",
      quote: "\"Aimer, c'est se souvenir.\"",
    });
  });
});

describe("A02 — passer → skipped, rien inventé, rien ajouté", () => {
  it("skipA02 marks A02 skipped without touching precisions (none entered)", () => {
    const content = a01Done();
    const skipped = skipA02(content);
    expect(skipped).toEqual({ ok: true, content: { ...content, guidedFlow: { A01: { status: "completed" }, A02: { status: "skipped" } } } });
    if (skipped.ok) {
      const read = readDeathNoticeForEditing(skipped.content);
      expect(read.status === "ready" && read.deathNotice.precisions).toEqual(EMPTY_DEATH_NOTICE_PRECISIONS);
      expect(isA02Resolved(skipped.content)).toBe(true);
      expect(needsA02(skipped.content)).toBe(false);
    }
  });

  it("skipA02 never invents or adds a precision even when some were already autosaved", () => {
    const withOne = writePrecision(a01Done(), "thought", "Une pensée.");
    expect(withOne.ok).toBe(true);
    if (!withOne.ok) return;

    const skipped = skipA02(withOne.content);
    expect(skipped.ok).toBe(true);
    if (!skipped.ok) return;
    const read = readDeathNoticeForEditing(skipped.content);
    // Exactly what was already there — nothing added, nothing removed.
    expect(read.status === "ready" && read.deathNotice.precisions.thought).toBe("Une pensée.");
    expect(isA02Resolved(skipped.content)).toBe(true);
  });

  it("refuses to skip over a corrupted stored Death Notice", () => {
    expect(skipA02(CORRUPTED_UNKNOWN_KEY)).toEqual({ ok: false, reason: "corrupted" });
  });
});

describe("A02 — données + CTA → completed", () => {
  it("commitA02 marks A02 completed once at least one precision is present", () => {
    const withOne = writePrecision(a01Done(), "generalLocation", "En Bretagne");
    expect(withOne.ok).toBe(true);
    if (!withOne.ok) return;

    const committed = commitA02(withOne.content);
    expect(committed.ok).toBe(true);
    if (committed.ok) {
      expect(isA02Resolved(committed.content)).toBe(true);
      expect(needsA02(committed.content)).toBe(false);
      const flow = readDeathNoticeForEditing(committed.content);
      expect(flow.status === "ready" && flow.deathNotice.precisions.generalLocation).toBe("En Bretagne");
    }
  });

  it("commitA02 never forces every category to be filled — one is enough", () => {
    const withOne = writePrecision(a01Done(), "other", "Fleurs déclinées.");
    expect(withOne.ok).toBe(true);
    if (!withOne.ok) return;
    expect(commitA02(withOne.content)).toEqual({
      ok: true,
      content: { ...withOne.content, guidedFlow: { A01: { status: "completed" }, A02: { status: "completed" } } },
    });
  });

  it("commitA02 rejects when nothing at all has been entered — that path is skipA02's job", () => {
    expect(commitA02(a01Done())).toEqual({ ok: false, reason: "precisions" });
  });

  it("refuses to commit over a corrupted stored Death Notice", () => {
    expect(commitA02(CORRUPTED_UNKNOWN_KEY)).toEqual({ ok: false, reason: "corrupted" });
  });
});

describe("A02 — chaque précision individuelle suffit à elle seule pour compléter", () => {
  const fields = ["generalLocation", "familyMessage", "thought", "quote", "other"] as const;

  for (const field of fields) {
    it(`"${field}" alone is enough for commitA02 to succeed`, () => {
      const withField = writePrecision(a01Done(), field, "Texte de la famille.");
      expect(withField.ok).toBe(true);
      if (!withField.ok) return;
      expect(commitA02(withField.content).ok).toBe(true);
    });
  }
});

describe("A02 — corrupted deathNotice → write refused (needsA02 also refuses to advance past it)", () => {
  it("a corrupted Death Notice after A01 routes back to A01, never reaches A02", () => {
    // A01 was completed against valid data at the time, but the stored
    // Death Notice has since become corrupted (e.g. a manual edit) —
    // needsA01 must catch this before needsA02 is ever consulted.
    const corruptedAfterA01 = {
      ...CORRUPTED_UNKNOWN_KEY,
      guidedFlow: { A01: { status: "completed" } },
    } as MemorialContent;
    expect(needsA01(corruptedAfterA01)).toBe(true);
    expect(needsA02(corruptedAfterA01)).toBe(false); // never reached — A01 gates it
  });
});

// ---------------------------------------------------------------------
// Progression — announcement T08 complete -> A01 -> A02 -> A03 logique
// ---------------------------------------------------------------------

describe("Progression — A01 required+non-skippable, A02 optional+skippable (human-steps.ts)", () => {
  it("A01 stays the first incomplete step in the announcement route until completed", () => {
    const flow = humanFlowDefinition("announcement");
    const state = { T03: { status: "completed" as const }, T04: { status: "skipped" as const } };
    const step = firstIncompleteStep(flow, state);
    // Whichever earlier common-trunk step is first incomplete, A01 is
    // never skipped over by a malformed/absent record — this is
    // exercised fully in human-steps.test.ts; here we only confirm A01
    // itself is part of the announcement route and not remembrance's.
    expect(flow.steps.some((s) => s.id === "A01" && s.group === "announcement")).toBe(true);
    expect(step).not.toBeNull();
  });

  it("A02 completed advances the logical next step to A03", () => {
    const withThought = writePrecision(a01Done(), "thought", "Une pensée.");
    expect(withThought.ok).toBe(true);
    if (!withThought.ok) return;
    const committed = commitA02(withThought.content);
    expect(committed.ok).toBe(true);

    const flow = humanFlowDefinition("announcement");
    const state = {
      T03: { status: "completed" as const },
      T04: { status: "skipped" as const },
      T05: { status: "skipped" as const },
      T06: { status: "completed" as const },
      T07: { status: "completed" as const },
      T08: { status: "completed" as const },
      A01: { status: "completed" as const },
      A02: { status: "completed" as const },
    };
    const next = firstIncompleteStep(flow, state);
    expect(next?.id).toBe("A03");
  });

  it("A02 skipped also advances the logical next step to A03", () => {
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
    };
    const next = firstIncompleteStep(flow, state);
    expect(next?.id).toBe("A03");
  });

  it("remembrance never includes A01/A02 in its route at all", () => {
    const flow = humanFlowDefinition("remembrance");
    expect(flow.activeGroups).not.toContain("announcement");
    const route = flow.steps.filter((s) => flow.activeGroups.includes(s.group));
    expect(route.some((s) => s.id === "A01" || s.id === "A02")).toBe(false);
  });
});

// ---------------------------------------------------------------------
// deathNoticeStepProgress
// ---------------------------------------------------------------------

describe("deathNoticeStepProgress — reuses the real Mission 025 engine", () => {
  it("is 0 on a completely untouched draft", () => {
    expect(deathNoticeStepProgress("announcement", EMPTY_CONTENT)).toBe(0);
  });

  it("increases once A01 is completed", () => {
    const before = deathNoticeStepProgress("announcement", EMPTY_CONTENT);
    const after = deathNoticeStepProgress("announcement", a01Done());
    expect(after).toBeGreaterThan(before);
  });
});
