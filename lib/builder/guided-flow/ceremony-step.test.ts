import { describe, expect, it } from "vitest";
import type { MemorialContent } from "@/types/memorial";
import { EMPTY_CEREMONY_CONTENT } from "@/types/ceremony";
import { humanFlowDefinition } from "./human-steps";
import { firstIncompleteStep } from "./engine";
import {
  commitA04,
  commitA05,
  commitA06,
  commitA07,
  commitA08,
  isA04Complete,
  needsA04,
  needsA05,
  needsA06,
  needsA07,
  needsA08,
  readCeremonyForEditing,
  readCeremonyMomentAnswer,
  skipA05,
  skipA06,
  skipA07,
  skipA08,
  writeCeremonyAccess,
  writeCeremonyAddress,
  writeCeremonyDate,
  writeCeremonyNote,
  writeCeremonyTime,
  writeCeremonyVenueName,
} from "./ceremony-step";

/**
 * Mission 040 — contract tests for A04 ("Un moment est-il prévu ?") and
 * A05-A08 (date/heure, lieu, adresse/accès, note pratique). Same
 * discipline as death-notice-step.test.ts.
 */

const EMPTY_CONTENT: MemorialContent = {};

const CORRUPTED_UNKNOWN_KEY: MemorialContent = {
  ceremony: { venueName: "Église", cause: "x" } as unknown as MemorialContent["ceremony"],
};

const CORRUPTED_WRONG_TYPE: MemorialContent = {
  ceremony: "not an object" as unknown as MemorialContent["ceremony"],
};

function a04Answered(answer: "yes" | "undecided" | "no" = "yes", content: MemorialContent = EMPTY_CONTENT): MemorialContent {
  const committed = commitA04(content, answer);
  if (!committed.ok) throw new Error("test fixture: commitA04 unexpectedly failed");
  return committed.content;
}

function a05Skipped(content: MemorialContent = a04Answered()): MemorialContent {
  const skipped = skipA05(content);
  if (!skipped.ok) throw new Error("test fixture: skipA05 unexpectedly failed");
  return skipped.content;
}

function a06Skipped(content: MemorialContent = a05Skipped()): MemorialContent {
  const skipped = skipA06(content);
  if (!skipped.ok) throw new Error("test fixture: skipA06 unexpectedly failed");
  return skipped.content;
}

function a07Skipped(content: MemorialContent = a06Skipped()): MemorialContent {
  const skipped = skipA07(content);
  if (!skipped.ok) throw new Error("test fixture: skipA07 unexpectedly failed");
  return skipped.content;
}

// ---------------------------------------------------------------------
// readCeremonyForEditing
// ---------------------------------------------------------------------

describe("readCeremonyForEditing — corruption stays visible, never silently collapsed", () => {
  it("reads an absent Ceremony as the empty, editable content", () => {
    expect(readCeremonyForEditing(EMPTY_CONTENT)).toEqual({ status: "ready", ceremony: EMPTY_CEREMONY_CONTENT });
  });

  it("a corrupted Ceremony (unknown key) reads as 'corrupted', never silently as empty", () => {
    expect(readCeremonyForEditing(CORRUPTED_UNKNOWN_KEY)).toEqual({ status: "corrupted" });
  });

  it("a corrupted Ceremony (wrong type) reads as 'corrupted' too", () => {
    expect(readCeremonyForEditing(CORRUPTED_WRONG_TYPE)).toEqual({ status: "corrupted" });
  });
});

// ---------------------------------------------------------------------
// A04 — commitA04 / needsA04 / isA04Complete / readCeremonyMomentAnswer
// ---------------------------------------------------------------------

describe("A04 — vide → non completed", () => {
  it("an empty draft needs A04 and is not complete", () => {
    expect(needsA04(EMPTY_CONTENT)).toBe(true);
    expect(isA04Complete(EMPTY_CONTENT)).toBe(false);
    expect(readCeremonyMomentAnswer(EMPTY_CONTENT)).toBe(null);
  });
});

describe("A04 — un choix explicite → completed, jamais déduit", () => {
  it.each(["yes", "undecided", "no"] as const)("commitA04 with '%s' writes A04 completed with that answer", (answer) => {
    const committed = commitA04(EMPTY_CONTENT, answer);
    expect(committed).toEqual({ ok: true, content: { guidedFlow: { A04: { status: "completed", answer } } } });
    if (committed.ok) {
      expect(needsA04(committed.content)).toBe(false);
      expect(isA04Complete(committed.content)).toBe(true);
      expect(readCeremonyMomentAnswer(committed.content)).toBe(answer);
    }
  });

  it("rejects an answer outside the closed A04_ANSWERS vocabulary", () => {
    expect(commitA04(EMPTY_CONTENT, "maybe" as never)).toEqual({ ok: false, reason: "answer" });
  });

  it("refuses on a corrupted stored Ceremony", () => {
    expect(commitA04(CORRUPTED_UNKNOWN_KEY, "yes")).toEqual({ ok: false, reason: "corrupted" });
  });
});

describe("A04 = non — aucune cérémonie active, A05-A08 jamais montrées", () => {
  it("needsA05..needsA08 all stay false once A04 = no", () => {
    const content = a04Answered("no");
    expect(needsA05(content)).toBe(false);
    expect(needsA06(content)).toBe(false);
    expect(needsA07(content)).toBe(false);
    expect(needsA08(content)).toBe(false);
  });
});

describe("A04 = pas encore décidé — aucune information forcée, A05-A08 jamais montrées", () => {
  it("needsA05..needsA08 all stay false once A04 = undecided", () => {
    const content = a04Answered("undecided");
    expect(needsA05(content)).toBe(false);
    expect(needsA06(content)).toBe(false);
    expect(needsA07(content)).toBe(false);
    expect(needsA08(content)).toBe(false);
  });
});

// ---------------------------------------------------------------------
// A05 — date + heure
// ---------------------------------------------------------------------

describe("writeCeremonyDate / writeCeremonyTime — A05 field writes", () => {
  it("each writes its own field, leaving the other untouched", () => {
    const withDate = writeCeremonyDate(a04Answered(), "2026-03-14");
    expect(withDate.ok).toBe(true);
    if (!withDate.ok) return;
    const withTime = writeCeremonyTime(withDate.content, "14:30");
    expect(withTime.ok).toBe(true);
    if (!withTime.ok) return;

    const read = readCeremonyForEditing(withTime.content);
    expect(read.status === "ready" && read.ceremony.date).toBe("2026-03-14");
    expect(read.status === "ready" && read.ceremony.time).toBe("14:30");
  });

  it("refuses to write over a corrupted stored Ceremony", () => {
    expect(writeCeremonyDate(CORRUPTED_UNKNOWN_KEY, "2026-03-14")).toEqual({ ok: false, reason: "corrupted" });
  });
});

describe("A05 — rien saisi → needsA05 true, non résolu", () => {
  it("A04 = yes, nothing entered yet — A05 needed", () => {
    const content = a04Answered();
    expect(needsA05(content)).toBe(true);
  });
});

describe("A05 — passer → skipped, rien inventé", () => {
  it("skipA05 marks A05 skipped without touching date/time", () => {
    const content = a04Answered();
    const skipped = skipA05(content);
    expect(skipped.ok).toBe(true);
    if (!skipped.ok) return;
    expect(needsA05(skipped.content)).toBe(false);
    const read = readCeremonyForEditing(skipped.content);
    expect(read.status === "ready" && read.ceremony.date).toBe(null);
  });

  it("refuses to skip over a corrupted stored Ceremony", () => {
    expect(skipA05(CORRUPTED_UNKNOWN_KEY)).toEqual({ ok: false, reason: "corrupted" });
  });
});

describe("A05 — date ou heure + CTA → completed", () => {
  it("date alone is enough for commitA05 to succeed", () => {
    const withDate = writeCeremonyDate(a04Answered(), "2026-03-14");
    expect(withDate.ok).toBe(true);
    if (!withDate.ok) return;
    expect(commitA05(withDate.content).ok).toBe(true);
  });

  it("time alone is enough for commitA05 to succeed", () => {
    const withTime = writeCeremonyTime(a04Answered(), "14:30");
    expect(withTime.ok).toBe(true);
    if (!withTime.ok) return;
    expect(commitA05(withTime.content).ok).toBe(true);
  });

  it("rejects Continue when neither date nor time is present — that path is skipA05's job", () => {
    expect(commitA05(a04Answered())).toEqual({ ok: false, reason: "dateTime" });
  });
});

// ---------------------------------------------------------------------
// A06 — nom du lieu
// ---------------------------------------------------------------------

describe("A06 — gated behind A05, never before", () => {
  it("A05 not yet resolved — A06 not shown", () => {
    expect(needsA06(a04Answered())).toBe(false);
  });

  it("A05 skipped — A06 now needed", () => {
    expect(needsA06(a05Skipped())).toBe(true);
  });
});

describe("A06 — venueName + CTA → completed; sans venueName → refusé", () => {
  it("commitA06 rejects when venueName is still null", () => {
    expect(commitA06(a05Skipped())).toEqual({ ok: false, reason: "venueName" });
  });

  it("commitA06 succeeds once venueName is present", () => {
    const withVenue = writeCeremonyVenueName(a05Skipped(), "Église Saint-Martin");
    expect(withVenue.ok).toBe(true);
    if (!withVenue.ok) return;
    expect(commitA06(withVenue.content).ok).toBe(true);
  });

  it("skipA06 never touches venueName", () => {
    const skipped = skipA06(a05Skipped());
    expect(skipped.ok).toBe(true);
    if (!skipped.ok) return;
    const read = readCeremonyForEditing(skipped.content);
    expect(read.status === "ready" && read.ceremony.venueName).toBe(null);
  });
});

// ---------------------------------------------------------------------
// A07 — adresse + accès
// ---------------------------------------------------------------------

describe("A07 — gated behind A06, never before", () => {
  it("A06 not yet resolved — A07 not shown", () => {
    expect(needsA07(a05Skipped())).toBe(false);
  });

  it("A06 skipped — A07 now needed", () => {
    expect(needsA07(a06Skipped())).toBe(true);
  });
});

describe("A07 — adresse ou accès + CTA → completed", () => {
  it("rejects Continue when neither address nor access is present", () => {
    expect(commitA07(a06Skipped())).toEqual({ ok: false, reason: "addressAccess" });
  });

  it("address alone is enough", () => {
    const withAddress = writeCeremonyAddress(a06Skipped(), "12 rue des Lilas");
    expect(withAddress.ok).toBe(true);
    if (!withAddress.ok) return;
    expect(commitA07(withAddress.content).ok).toBe(true);
  });

  it("access alone is enough", () => {
    const withAccess = writeCeremonyAccess(a06Skipped(), "Parking à l'arrière");
    expect(withAccess.ok).toBe(true);
    if (!withAccess.ok) return;
    expect(commitA07(withAccess.content).ok).toBe(true);
  });

  it("skipA07 never touches address/access", () => {
    const skipped = skipA07(a06Skipped());
    expect(skipped.ok).toBe(true);
    if (!skipped.ok) return;
    const read = readCeremonyForEditing(skipped.content);
    expect(read.status === "ready" && read.ceremony.address).toBe(null);
    expect(read.status === "ready" && read.ceremony.access).toBe(null);
  });
});

// ---------------------------------------------------------------------
// A08 — note pratique facultative
// ---------------------------------------------------------------------

describe("A08 — gated behind A07, never before", () => {
  it("A07 not yet resolved — A08 not shown", () => {
    expect(needsA08(a06Skipped())).toBe(false);
  });

  it("A07 skipped — A08 now needed", () => {
    expect(needsA08(a07Skipped())).toBe(true);
  });
});

describe("A08 — note + CTA → completed; sans note → refusé (QG review, mêmes règles qu'A05-A07)", () => {
  it("commitA08 rejects when note is still null", () => {
    expect(commitA08(a07Skipped())).toEqual({ ok: false, reason: "note" });
  });

  it("commitA08 succeeds once a note is present", () => {
    const withNote = writeCeremonyNote(a07Skipped(), "Recueillement à partir de 14h.");
    expect(withNote.ok).toBe(true);
    if (!withNote.ok) return;
    expect(commitA08(withNote.content).ok).toBe(true);
  });

  it("skipA08 never touches note, and needs no note to be used", () => {
    const skipped = skipA08(a07Skipped());
    expect(skipped.ok).toBe(true);
    if (!skipped.ok) return;
    expect(needsA08(skipped.content)).toBe(false);
    const read = readCeremonyForEditing(skipped.content);
    expect(read.status === "ready" && read.ceremony.note).toBe(null);
  });

  it("refuses to commit over a corrupted stored Ceremony", () => {
    expect(commitA08(CORRUPTED_UNKNOWN_KEY)).toEqual({ ok: false, reason: "corrupted" });
  });
});

// ---------------------------------------------------------------------
// Progression — A04 required+non-skippable, A05-A08 optional+skippable
// ---------------------------------------------------------------------

describe("Progression — full ceremony branch, A04=yes through A08, human-steps.ts wiring", () => {
  it("firstIncompleteStep moves onto A09 once A04-A08 are all resolved", () => {
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
      A06: { status: "completed" as const },
      A07: { status: "skipped" as const },
      A08: { status: "completed" as const },
    };
    expect(firstIncompleteStep(flow, state)?.id).toBe("A09");
  });

  it("A04 = no skips straight past A05-A08 onto A09", () => {
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

  it("remembrance never includes A04-A08 in its route at all", () => {
    const flow = humanFlowDefinition("remembrance");
    const route = flow.steps.filter((s) => flow.activeGroups.includes(s.group));
    for (const id of ["A04", "A05", "A06", "A07", "A08"]) {
      expect(route.some((s) => s.id === id)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------
// Reprise — une étape déjà validée ne doit pas être imposée à nouveau
// ---------------------------------------------------------------------

describe("Reprise — chaque étape résolue reste résolue tant que le contenu ne change pas", () => {
  it("a fully-resolved ceremony branch (A08 completed with a note) never re-asks any of A04-A08", () => {
    const withNote = writeCeremonyNote(a07Skipped(), "Recueillement à partir de 14h.");
    expect(withNote.ok).toBe(true);
    if (!withNote.ok) return;
    const committed = commitA08(withNote.content);
    expect(committed.ok).toBe(true);
    if (!committed.ok) return;

    expect(needsA04(committed.content)).toBe(false);
    expect(needsA05(committed.content)).toBe(false);
    expect(needsA06(committed.content)).toBe(false);
    expect(needsA07(committed.content)).toBe(false);
    expect(needsA08(committed.content)).toBe(false);
  });

  it("a fully-resolved ceremony branch (A08 skipped, no note) never re-asks any of A04-A08 either", () => {
    const skipped = skipA08(a07Skipped());
    expect(skipped.ok).toBe(true);
    if (!skipped.ok) return;

    expect(needsA04(skipped.content)).toBe(false);
    expect(needsA05(skipped.content)).toBe(false);
    expect(needsA06(skipped.content)).toBe(false);
    expect(needsA07(skipped.content)).toBe(false);
    expect(needsA08(skipped.content)).toBe(false);
  });
});
