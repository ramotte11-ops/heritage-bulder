import { describe, expect, it } from "vitest";
import type { MemorialContent } from "@/types/memorial";
import { fullAnnouncement, throughA02, throughA03 } from "@/lib/memorial/assembly/test-fixtures";
import { commitA00 } from "./announcement-choice-step";
import { commitA04 } from "./ceremony-step";
import { readGuidedFlowState } from "./flow-state";
import {
  JOURNEY_SCREEN_IDS,
  JOURNEY_SCREENS,
  JOURNEY_SECTIONS,
  JOURNEY_SECTION_MEMORIAL_SECTION,
  currentJourneyScreenAfter,
  currentJourneyScreen,
  isJourneyScreenId,
  resolveJourney,
  resolveJourneyScreens,
  resolveRevisionContext,
  resolveRevisionTarget,
  resolveReviewingSection,
  type JourneyScreenId,
  type JourneyScreenStatus,
} from "./journey";

/**
 * B03 — « Mon parcours ». The route itself (page.test.tsx) checks that
 * the screen it shows is `currentJourneyScreen`; here, the statuses and
 * the revision rule on real drafts built through the real commits.
 */

function ok(result: { ok: true; content: MemorialContent } | { ok: false; reason: string }): MemorialContent {
  if (!result.ok) throw new Error(`fixture step refused: ${result.reason}`);
  return result.content;
}

const HERO = { displayName: "Jeanne Dupont", birth: null, death: null, shortPhrase: null, photo: null };
const AFTER_WELCOME = { welcome: { status: "completed" } } as unknown as MemorialContent;
const AFTER_IDENTITY = { hero: HERO, guidedFlow: { T04: { status: "skipped" } } } as unknown as MemorialContent;

function statuses(content: MemorialContent): Record<JourneyScreenId, JourneyScreenStatus> {
  return Object.fromEntries(resolveJourneyScreens(content).map((s) => [s.id, s.status])) as Record<
    JourneyScreenId,
    JourneyScreenStatus
  >;
}

describe("catalog", () => {
  it("lists every screen exactly once, in route order", () => {
    expect(JOURNEY_SCREENS.map((s) => s.id)).toEqual([...JOURNEY_SCREEN_IDS]);
    expect(new Set(JOURNEY_SCREEN_IDS).size).toBe(JOURNEY_SCREEN_IDS.length);
  });

  it("isJourneyScreenId accepts only catalog ids", () => {
    expect(isJourneyScreenId("identity")).toBe(true);
    for (const value of ["", "IDENTITY", "T03", "javascript:alert(1)", ["identity"], 3, undefined, null]) {
      expect(isJourneyScreenId(value)).toBe(false);
    }
  });

  it("resolves from any completed screen through the same ordered catalog", () => {
    const content = throughA03();
    expect(currentJourneyScreenAfter(content, "reveal")).toBe("ceremonyMoment");
    expect(currentJourneyScreenAfter(content, "announcementText")).toBe("ceremonyMoment");
    expect(currentJourneyScreenAfter(content, "gallery")).toBeNull();
  });
});

describe("« Mon parcours » is generic over its catalog (évolutivité)", () => {
  it("every rubrique has screens, a memorial section, and is listed — an unbuilt one never shows", () => {
    for (const id of JOURNEY_SECTIONS) {
      expect(JOURNEY_SCREENS.some((s) => s.section === id), id).toBe(true);
      expect(JOURNEY_SECTION_MEMORIAL_SECTION[id]).toBeTruthy();
    }
    expect(resolveJourney(AFTER_WELCOME).sections.map((s) => s.id)).toEqual([...JOURNEY_SECTIONS]);
    expect(resolveJourney(AFTER_WELCOME).sections.every((s) => s.screens.length > 0)).toBe(true);
    expect(JOURNEY_SECTION_MEMORIAL_SECTION.person).toBe("hero");
    expect(JOURNEY_SECTION_MEMORIAL_SECTION.personSheet).toBe("story");
  });
});

describe("a new draft (just past the Welcome)", () => {
  it("identity is current, everything after it upcoming — nothing hidden before A00 is answered", () => {
    const s = statuses(AFTER_WELCOME);
    expect(s.identity).toBe("current");
    for (const id of JOURNEY_SCREEN_IDS.filter((id) => id !== "identity")) expect(s[id]).toBe("upcoming");
    expect(resolveJourney(AFTER_WELCOME).sections.find((x) => x.id === "deathNotice")?.status).toBe("upcoming");
  });

  it("only identity is accessible", () => {
    const accessible = resolveJourneyScreens(AFTER_WELCOME).filter((s) => s.accessible).map((s) => s.id);
    expect(accessible).toEqual(["identity"]);
  });
});

describe("a partially filled draft", () => {
  it("right after identity: identity done, A00 current, the Hero upcoming", () => {
    const s = statuses(AFTER_IDENTITY);
    expect(s.identity).toBe("done");
    expect(s.announcementChoice).toBe("current");
    expect(s.phrase).toBe("upcoming");
    expect(currentJourneyScreen(AFTER_IDENTITY)).toBe("announcementChoice");
  });

  it.each([
    ["no", { status: "completed", answer: "no" }, "hidden"],
    ["later", { status: "skipped", answer: "later" }, "deferred"],
  ] as const)("A00 = %s: the death notice and traditions read %s, the ceremony stays", (_answer, record, expected) => {
    const content = { ...AFTER_IDENTITY, guidedFlow: { T04: { status: "skipped" }, A00: record } } as unknown as MemorialContent;
    const journey = resolveJourney(content);
    expect(journey.sections.find((x) => x.id === "deathNotice")?.status).toBe(expected);
    expect(journey.sections.find((x) => x.id === "traditions")?.status).toBe(expected);
    expect(journey.sections.find((x) => x.id === "ceremony")?.status).toBe("upcoming");
    expect(statuses(content).phrase).toBe("current");
  });

  it("A00 = later: « À décider » screens are never reopenable — the family changes A00 instead", () => {
    const later = ok(commitA00(throughA03(), "later"));
    for (const id of ["announcementText", "announcementDetails", "announcementPreview", "traditions"] as const) {
      const state = resolveJourneyScreens(later).find((s) => s.id === id);
      expect(state).toMatchObject({ status: "deferred", accessible: false });
      expect(resolveRevisionTarget(later, id)).toBeNull();
    }
    expect(resolveRevisionTarget(later, "announcementChoice")).toBe("announcementChoice");
    // Nothing deleted: the notice is still there, and yes brings it back.
    expect((later as { deathNotice: unknown }).deathNotice).toEqual((throughA03() as { deathNotice: unknown }).deathNotice);
    expect(statuses(ok(commitA00(later, "yes"))).announcementText).toBe("done");
  });

  it("A04 = no hides A05-A08 and A14; undecided A04 keeps them upcoming", () => {
    const base = ok(commitA00(throughA03(), "yes"));
    expect(statuses(base).ceremonyDateTime).toBe("upcoming");
    const no = ok(commitA04(base, "no"));
    for (const id of ["ceremonyDateTime", "ceremonyVenue", "ceremonyAddress", "ceremonyProgramme", "ceremonyNote"] as const) {
      expect(statuses(no)[id]).toBe("hidden");
    }
    expect(statuses(no).ceremonyMoment).toBe("done");
  });
});

describe("an old compatible draft (A01 validated before A00 existed)", () => {
  it("reads the A00 choice as made (derived yes) and lets the family reopen it", () => {
    const legacy = throughA03();
    expect(readGuidedFlowState(legacy).A00).toBeUndefined();
    const s = resolveJourneyScreens(legacy).find((x) => x.id === "announcementChoice");
    expect(s).toMatchObject({ status: "done", accessible: true });
    expect(resolveRevisionTarget(legacy, "announcementChoice")).toBe("announcementChoice");
  });

  it("resumes on the ceremony question, with the whole Hero and the notice done", () => {
    const s = statuses(throughA03());
    for (const id of ["identity", "phrase", "photo", "crop", "reveal", "announcementText", "announcementDetails", "announcementPreview"] as const) {
      expect(s[id]).toBe("done");
    }
    expect(s.ceremonyMoment).toBe("current");
  });
});

describe("a complete draft", () => {
  it("everything built is done, nothing current", () => {
    const content = fullAnnouncement();
    const journey = resolveJourney(content);
    expect(journey.current).toBe("gallery");
    expect(journey.sections.find((x) => x.id === "person")?.status).toBe("done");
  });
});

describe("changing A00 never deletes, and recomputes the conditional screens", () => {
  it("yes → no: notice screens hidden with their records kept; no → yes: done again", () => {
    const yes = ok(commitA00(throughA03(), "yes"));
    const no = ok(commitA00(yes, "no"));
    expect(statuses(no).announcementText).toBe("hidden");
    expect(readGuidedFlowState(no).A01).toEqual(readGuidedFlowState(yes).A01);
    expect((no as { deathNotice: unknown }).deathNotice).toEqual((yes as { deathNotice: unknown }).deathNotice);

    const back = ok(commitA00(no, "yes"));
    expect(statuses(back).announcementText).toBe("done");
    expect(statuses(back).announcementPreview).toBe("done");
  });

  it("no → yes on a draft that never had a notice: the notice becomes the current screen", () => {
    const noNotice = ok(commitA00(throughA03(), "no"));
    const stripped = {
      ...noNotice,
      deathNotice: undefined,
      guidedFlow: { ...readGuidedFlowState(noNotice), A01: undefined, A02: undefined, A03: undefined },
    } as unknown as MemorialContent;
    const yes = ok(commitA00(JSON.parse(JSON.stringify(stripped)) as MemorialContent, "yes"));
    expect(currentJourneyScreen(yes)).toBe("announcementText");
  });
});

describe("resolveRevisionTarget — only reached screens, never a jump forward", () => {
  const partial = throughA02(); // A03 current

  it("accepts a done screen", () => {
    expect(resolveRevisionTarget(partial, "identity")).toBe("identity");
    expect(resolveRevisionTarget(partial, "announcementText")).toBe("announcementText");
  });

  it("refuses the current screen (shown anyway), an upcoming one, a hidden one, and anything unknown", () => {
    expect(currentJourneyScreen(partial)).toBe("announcementPreview");
    expect(resolveRevisionTarget(partial, "announcementPreview")).toBeNull();
    expect(resolveRevisionTarget(partial, "gallery")).toBeNull();
    expect(resolveRevisionTarget(partial, "ceremonyMoment")).toBeNull();
    const no = ok(commitA00(partial, "no"));
    expect(resolveRevisionTarget(no, "announcementText")).toBeNull();
    for (const raw of [undefined, "", "T03", ["identity"], "identity "]) {
      expect(resolveRevisionTarget(partial, raw)).toBeNull();
    }
  });

  it("is pure: computing the journey never writes", () => {
    const content = throughA02();
    const before = JSON.stringify(content);
    resolveJourney(content, "identity");
    resolveRevisionTarget(content, "identity");
    expect(JSON.stringify(content)).toBe(before);
  });
});

describe("section revision context — validated server-side", () => {
  const partial = throughA02();

  it("accepts an accessible rubrique and derives a revised screen's rubrique from the catalog", () => {
    expect(resolveReviewingSection(partial, "person")).toBe("person");
    expect(resolveReviewingSection(partial, "deathNotice")).toBe("deathNotice");
    expect(resolveRevisionContext(partial, "identity", "person")).toEqual({
      screen: "identity",
      section: "person",
    });
    expect(resolveRevisionContext(partial, "announcementText", undefined)).toEqual({
      screen: "announcementText",
      section: "deathNotice",
    });
  });

  it("rejects unknown, inaccessible, and mismatched rubrique claims", () => {
    expect(resolveReviewingSection(partial, "ceremony")).toBeNull();
    expect(resolveReviewingSection(partial, "__proto__")).toBeNull();
    expect(resolveReviewingSection(partial, ["person"])).toBeNull();
    expect(resolveRevisionContext(partial, "identity", "ceremony")).toBeNull();
    expect(resolveRevisionContext(partial, "gallery", "gallery")).toBeNull();
  });

  it("records the rubrique independently of the currently displayed step", () => {
    expect(resolveJourney(partial, null, "deathNotice")).toMatchObject({
      revising: null,
      reviewingSection: "deathNotice",
    });
  });
});
