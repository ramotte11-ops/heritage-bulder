import { describe, expect, it } from "vitest";
import type { MemorialContent } from "@/types/memorial";
import { EMPTY_DEATH_NOTICE_CONTENT, EMPTY_DEATH_NOTICE_PRECISIONS } from "@/types/death-notice";
import { EMPTY_HERO_CONTENT } from "@/types/hero";
import { humanFlowDefinition } from "./human-steps";
import { firstIncompleteStep } from "./engine";
import {
  commitA01,
  commitA02,
  commitA03,
  deathNoticePreviewFingerprint,
  deathNoticeStepProgress,
  isA01Complete,
  isA02Resolved,
  isA03Complete,
  needsA01,
  needsA02,
  needsA03,
  readDeathNoticeForEditing,
  reopenA01,
  reopenA02,
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

// ---------------------------------------------------------------------
// A03 — Mission 039B: commitA03 / isA03Complete / needsA03 / reopenA01 /
// reopenA02 / deathNoticePreviewFingerprint
// ---------------------------------------------------------------------

/** A01 completed, A02 explicitly skipped — A03's own normal starting
 * point, mirrors the death-notice-step.ts module's own doctrine. */
function a02SkippedAfterA01(content: MemorialContent = a01Done()): MemorialContent {
  const skipped = skipA02(content);
  if (!skipped.ok) throw new Error("test fixture: skipA02 unexpectedly failed");
  return skipped.content;
}

/** A01 completed, A02 completed with a real precision, A03 not yet
 * verified — A03's other normal starting point. */
function a02CompletedAfterA01(): MemorialContent {
  const withPrecision = writePrecision(a01Done(), "generalLocation", "En Bretagne");
  if (!withPrecision.ok) throw new Error("test fixture: writePrecision unexpectedly failed");
  const committed = commitA02(withPrecision.content);
  if (!committed.ok) throw new Error("test fixture: commitA02 unexpectedly failed");
  return committed.content;
}

/** A01+A02 resolved, THEN A03 itself explicitly verified (the real
 * Continue click) — the normal "fully done" state. */
function a03Done(content: MemorialContent = a02SkippedAfterA01()): MemorialContent {
  const committed = commitA03(content);
  if (!committed.ok) throw new Error("test fixture: commitA03 unexpectedly failed");
  return committed.content;
}

describe("needsA03 — gated behind A01 AND A02, never before", () => {
  it("an empty draft does not need A03 (A01 itself is not even done)", () => {
    expect(needsA03(EMPTY_CONTENT)).toBe(false);
  });

  it("A01 done alone, A02 not yet resolved — A03 not shown yet", () => {
    expect(needsA03(a01Done())).toBe(false);
  });

  it("A01 done, A02 skipped — A03 is now needed", () => {
    expect(needsA03(a02SkippedAfterA01())).toBe(true);
    expect(isA03Complete(a02SkippedAfterA01())).toBe(false);
  });

  it("A01 done, A02 completed with a real precision — A03 is now needed", () => {
    expect(needsA03(a02CompletedAfterA01())).toBe(true);
  });

  it("A01+A02+A03 all resolved — A03 no longer needed", () => {
    const content = a03Done();
    expect(needsA03(content)).toBe(false);
    expect(isA03Complete(content)).toBe(true);
  });
});

describe("commitA03 — the ONLY place A03's StepRecord is ever written", () => {
  it("writes A03 completed with the current content's own fingerprint", () => {
    const before = a02SkippedAfterA01();
    const committed = commitA03(before);
    expect(committed.ok).toBe(true);
    if (!committed.ok) return;

    const flow = (committed.content as { guidedFlow: Record<string, { status: string; answer?: string }> })
      .guidedFlow;
    expect(flow.A03.status).toBe("completed");
    expect(flow.A03.answer).toBe(deathNoticePreviewFingerprint(before));
  });

  it("refuses when A01 is not genuinely complete (announcementText still null)", () => {
    expect(commitA03(EMPTY_CONTENT)).toEqual({ ok: false, reason: "announcementText" });
  });

  it("refuses when A02 has never been resolved, even with A01 done", () => {
    expect(commitA03(a01Done())).toEqual({ ok: false, reason: "precisions" });
  });

  it("refuses on a corrupted stored Death Notice", () => {
    expect(commitA03(CORRUPTED_UNKNOWN_KEY)).toEqual({ ok: false, reason: "corrupted" });
    expect(commitA03(CORRUPTED_WRONG_TYPE)).toEqual({ ok: false, reason: "corrupted" });
  });

  it("refuses on a corrupted stored Hero, even with a valid Death Notice", () => {
    const content: MemorialContent = {
      ...a02SkippedAfterA01(),
      hero: "not an object" as unknown as MemorialContent["hero"],
    };
    expect(commitA03(content)).toEqual({ ok: false, reason: "corrupted" });
  });
});

describe("deathNoticePreviewFingerprint — invalidation (AGENTS.md section 16-17)", () => {
  it("identical content produces an identical fingerprint — a genuine re-verification stays valid", () => {
    const content = a02SkippedAfterA01();
    expect(deathNoticePreviewFingerprint(content)).toBe(deathNoticePreviewFingerprint({ ...content }));
  });

  it("changing hero.displayName invalidates an already-verified A03", () => {
    const verified = a03Done();
    expect(isA03Complete(verified)).toBe(true);

    const changed: MemorialContent = {
      ...verified,
      hero: { ...EMPTY_HERO_CONTENT, ...(verified.hero as object), displayName: "Un autre nom" },
    };
    expect(isA03Complete(changed)).toBe(false);
    expect(needsA03(changed)).toBe(true);
  });

  it("changing hero.birth/death invalidates an already-verified A03", () => {
    const verified = a03Done();
    const changed: MemorialContent = {
      ...verified,
      hero: { ...EMPTY_HERO_CONTENT, ...(verified.hero as object), birth: { precision: "year", year: 1950 } },
    };
    expect(isA03Complete(changed)).toBe(false);
  });

  it("changing announcementText invalidates an already-verified A03", () => {
    const verified = a03Done();
    const written = writeAnnouncementText(verified, "Un texte différent, saisi après la vérification.");
    expect(written.ok).toBe(true);
    if (!written.ok) return;
    expect(isA03Complete(written.content)).toBe(false);
    expect(needsA03(written.content)).toBe(true);
  });

  it("changing any one precision invalidates an already-verified A03", () => {
    const verified = a03Done(a02CompletedAfterA01());
    const written = writePrecision(verified, "quote", "Une citation ajoutée après vérification.");
    expect(written.ok).toBe(true);
    if (!written.ok) return;
    expect(isA03Complete(written.content)).toBe(false);
  });

  it("changing hero.photo/crop does NOT invalidate an already-verified A03 — not displayed in A03", () => {
    const verified = a03Done();
    const changed: MemorialContent = {
      ...verified,
      hero: {
        ...EMPTY_HERO_CONTENT,
        ...(verified.hero as object),
        photo: { mediaId: "a-different-media-id", crop: { focalX: 0.2, focalY: 0.3, zoom: 1.4 } },
      },
    };
    expect(isA03Complete(changed)).toBe(true);
  });

  it("changing hero.shortPhrase does NOT invalidate an already-verified A03 — not displayed in A03", () => {
    const verified = a03Done();
    const changed: MemorialContent = {
      ...verified,
      hero: { ...EMPTY_HERO_CONTENT, ...(verified.hero as object), shortPhrase: "Une phrase ajoutée" },
    };
    expect(isA03Complete(changed)).toBe(true);
  });

  it("identical content re-verified stays valid — no false invalidation", () => {
    const verified = a03Done();
    expect(isA03Complete({ ...verified })).toBe(true);
  });
});

describe("reopenA01 — 'Modifier l'annonce' (AGENTS.md section 14)", () => {
  it("un-marks A01 as done, which cascades needsA02/needsA03 back to true, without deleting any data", () => {
    const verified = a03Done();
    expect(needsA01(verified)).toBe(false);

    const reopened = reopenA01(verified);
    expect(reopened.ok).toBe(true);
    if (!reopened.ok) return;

    expect(needsA01(reopened.content)).toBe(true);
    expect(needsA02(reopened.content)).toBe(false); // never reached — A01 gates it
    expect(needsA03(reopened.content)).toBe(false); // never reached either

    // Nothing was deleted — the family's own text is still exactly there.
    const read = readDeathNoticeForEditing(reopened.content);
    expect(read.status === "ready" && read.deathNotice.announcementText).toBe(
      "Elle s'en est allée paisiblement, entourée des siens.",
    );
  });

  it("re-confirming the exact same text after reopening A01 leaves A03 still valid, no extra click needed", () => {
    const verified = a03Done();
    const reopened = reopenA01(verified);
    expect(reopened.ok).toBe(true);
    if (!reopened.ok) return;

    const recommitted = commitA01(reopened.content);
    expect(recommitted.ok).toBe(true);
    if (!recommitted.ok) return;

    expect(isA03Complete(recommitted.content)).toBe(true);
  });

  it("refuses on a corrupted stored Death Notice", () => {
    expect(reopenA01(CORRUPTED_UNKNOWN_KEY)).toEqual({ ok: false, reason: "corrupted" });
  });
});

describe("reopenA02 — 'Modifier les précisions' (AGENTS.md section 14)", () => {
  it("un-marks only A02, leaving A01 untouched, without deleting any precision", () => {
    const verified = a03Done(a02CompletedAfterA01());
    const reopened = reopenA02(verified);
    expect(reopened.ok).toBe(true);
    if (!reopened.ok) return;

    expect(needsA01(reopened.content)).toBe(false); // A01 still done
    expect(needsA02(reopened.content)).toBe(true); // A02 needs re-treating
    expect(needsA03(reopened.content)).toBe(false); // never reached — A02 gates it

    const read = readDeathNoticeForEditing(reopened.content);
    expect(read.status === "ready" && read.deathNotice.precisions.generalLocation).toBe("En Bretagne");
  });

  it("refuses on a corrupted stored Death Notice", () => {
    expect(reopenA02(CORRUPTED_UNKNOWN_KEY)).toEqual({ ok: false, reason: "corrupted" });
  });
});

describe("Progression — A03 required+non-skippable (human-steps.ts)", () => {
  it("A03 completed advances the logical next step past the announcement branch", () => {
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
    };
    const next = firstIncompleteStep(flow, state);
    expect(next?.id).toBe("A04");
  });

  it("remembrance never includes A03 in its route at all", () => {
    const flow = humanFlowDefinition("remembrance");
    const route = flow.steps.filter((s) => flow.activeGroups.includes(s.group));
    expect(route.some((s) => s.id === "A03")).toBe(false);
  });
});
