import { describe, expect, it } from "vitest";
import type { MemorialContent } from "@/types/memorial";
import {
  commitA00,
  isAnnouncementChosen,
  needsA00,
  readAnnouncementChoice,
} from "./announcement-choice-step";
import { readGuidedFlowState } from "./flow-state";

const HERO = { displayName: "Jeanne Dupont", birth: null, death: null, shortPhrase: null, photo: null };

/** PAGE A genuinely behind the family: a name, and T04's own record. */
const AFTER_IDENTITY = { hero: HERO, guidedFlow: { T04: { status: "skipped" } } } as unknown as MemorialContent;

function requireOk(result: ReturnType<typeof commitA00>): MemorialContent {
  if (!result.ok) throw new Error(`expected a successful write, got "${result.reason}"`);
  return result.content;
}

describe("commitA00 — three distinct, persisted answers", () => {
  it.each([
    ["yes", { status: "completed", answer: "yes" }],
    ["no", { status: "completed", answer: "no" }],
    ["later", { status: "skipped", answer: "later" }],
  ] as const)("%s is stored as its own record", (answer, record) => {
    const committed = requireOk(commitA00(AFTER_IDENTITY, answer));
    expect(readGuidedFlowState(committed).A00).toEqual(record);
    expect(readAnnouncementChoice(committed)).toBe(answer);
  });

  it("refuses anything else, writing nothing", () => {
    expect(commitA00(AFTER_IDENTITY, "maybe")).toEqual({ ok: false, reason: "answer" });
    expect(commitA00(AFTER_IDENTITY, "")).toEqual({ ok: false, reason: "answer" });
  });

  it("touches no other content key and keeps the other step records", () => {
    const committed = requireOk(commitA00(AFTER_IDENTITY, "no")) as Record<string, unknown>;
    expect(committed.hero).toEqual(HERO);
    expect(readGuidedFlowState(committed as MemorialContent).T04).toEqual({ status: "skipped" });
  });

  it("survives a JSON round-trip (resume after a reload)", () => {
    const reloaded = JSON.parse(JSON.stringify(requireOk(commitA00(AFTER_IDENTITY, "later")))) as MemorialContent;
    expect(readAnnouncementChoice(reloaded)).toBe("later");
    expect(needsA00(reloaded)).toBe(false);
  });
});

describe("changing the answer — nothing is ever deleted", () => {
  const WITH_NOTICE = {
    hero: HERO,
    deathNotice: {
      announcementText: "Elle s'en est allée paisiblement.",
      precisions: { generalLocation: "Lyon", familyMessage: null, thought: null, quote: null, other: null },
    },
    ceremony: { date: "2026-03-14", time: null, venueName: null, address: null, access: null, note: null },
    guidedFlow: {
      T04: { status: "skipped" },
      A00: { status: "completed", answer: "yes" },
      A01: { status: "completed" },
      A02: { status: "completed" },
      A03: { status: "completed", answer: "0f3a9c21" },
      A04: { status: "completed", answer: "yes" },
    },
  } as unknown as MemorialContent;

  it("yes → no → yes keeps the notice, the ceremony and every record exactly as they were", () => {
    const no = requireOk(commitA00(WITH_NOTICE, "no"));
    expect(isAnnouncementChosen(no)).toBe(false);

    const backToYes = requireOk(commitA00(no, "yes")) as Record<string, unknown>;
    const original = WITH_NOTICE as Record<string, unknown>;
    expect(backToYes.deathNotice).toEqual(original.deathNotice);
    expect(backToYes.ceremony).toEqual(original.ceremony);
    expect(backToYes.guidedFlow).toEqual(original.guidedFlow);
    expect(isAnnouncementChosen(backToYes as MemorialContent)).toBe(true);
  });

  it("later keeps the notice too", () => {
    const later = requireOk(commitA00(WITH_NOTICE, "later")) as Record<string, unknown>;
    expect(later.deathNotice).toEqual((WITH_NOTICE as Record<string, unknown>).deathNotice);
    expect(readGuidedFlowState(later as MemorialContent).A01).toEqual({ status: "completed" });
  });

  it("keeps unknown guidedFlow keys (B02-L1 protection)", () => {
    const withFuture = {
      ...AFTER_IDENTITY,
      guidedFlow: { T04: { status: "skipped" }, A99: { status: "completed", answer: "x" } },
    } as unknown as MemorialContent;
    const committed = requireOk(commitA00(withFuture, "yes")) as { guidedFlow: Record<string, unknown> };
    expect(committed.guidedFlow.A99).toEqual({ status: "completed", answer: "x" });
  });
});

describe("needsA00 — when the question is shown", () => {
  it("never before identity (PAGE A) is behind the family", () => {
    expect(needsA00({})).toBe(false);
    expect(needsA00({ hero: HERO } as unknown as MemorialContent)).toBe(false);
  });

  it("right after identity, until answered", () => {
    expect(needsA00(AFTER_IDENTITY)).toBe(true);
    for (const answer of ["yes", "no", "later"] as const) {
      expect(needsA00(requireOk(commitA00(AFTER_IDENTITY, answer)))).toBe(false);
    }
  });

  it("never for a draft that validated its announcement before A00 existed (read as yes)", () => {
    const legacy = {
      hero: HERO,
      guidedFlow: { T04: { status: "skipped" }, A01: { status: "completed" } },
    } as unknown as MemorialContent;
    expect(needsA00(legacy)).toBe(false);
    expect(readAnnouncementChoice(legacy)).toBe("yes");
    expect(isAnnouncementChosen(legacy)).toBe(true);
  });

  it("only yes makes the death notice part of the memorial", () => {
    expect(isAnnouncementChosen(requireOk(commitA00(AFTER_IDENTITY, "yes")))).toBe(true);
    expect(isAnnouncementChosen(requireOk(commitA00(AFTER_IDENTITY, "no")))).toBe(false);
    expect(isAnnouncementChosen(requireOk(commitA00(AFTER_IDENTITY, "later")))).toBe(false);
    expect(isAnnouncementChosen(AFTER_IDENTITY)).toBe(false);
  });
});
