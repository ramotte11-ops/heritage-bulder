import { describe, expect, it } from "vitest";
import type { MemorialContent } from "@/types/memorial";
import {
  fullAnnouncement,
  fullAnnouncementWithTraditions,
  throughA02,
  throughA03,
} from "@/lib/memorial/assembly/test-fixtures";
import { commitA00 } from "./announcement-choice-step";
import { commitA04 } from "./ceremony-step";
import { skipA13 } from "./gallery-step";
import { skipA15 } from "./contributions-step";
import { addTraditionsEntry, commitA09, skipA09, updateTraditionsEntry } from "./traditions-step";
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
  REVISION_SECTION_ALIASES,
  nextReviewScreen,
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
  ] as const)("A00 = %s: the death notice reads %s; traditions (independent, O03) and the ceremony stay upcoming", (_answer, record, expected) => {
    const content = { ...AFTER_IDENTITY, guidedFlow: { T04: { status: "skipped" }, A00: record } } as unknown as MemorialContent;
    const journey = resolveJourney(content);
    expect(journey.sections.find((x) => x.id === "deathNotice")?.status).toBe(expected);
    expect(journey.sections.find((x) => x.id === "traditions")?.status).toBe("upcoming");
    expect(journey.sections.find((x) => x.id === "ceremony")?.status).toBe("upcoming");
    expect(statuses(content).phrase).toBe("current");
  });

  it("A00 = later: « À décider » screens are never reopenable — the family changes A00 instead", () => {
    const later = ok(commitA00(throughA03(), "later"));
    for (const id of ["announcementText", "announcementDetails", "announcementPreview"] as const) {
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

describe("QG 005-B — a local runtime's Hero overrides", () => {
  // Past A00 = no with T06/T07 recorded but no server photo: the route's
  // own reading stops at the photo/crop gates.
  const LOCAL_HERO = {
    hero: { ...HERO, shortPhrase: "Toujours là" },
    guidedFlow: {
      T04: { status: "skipped" },
      A00: { status: "completed", answer: "no" },
      T05: { status: "completed" },
      T06: { status: "completed" },
      T07: { status: "completed" },
      T08: { status: "completed" },
    },
  } as unknown as MemorialContent;

  it("without overrides, nothing changes: the route's own gates decide", () => {
    expect(resolveJourney(LOCAL_HERO)).toEqual(resolveJourney(LOCAL_HERO, null, null, undefined));
    expect(resolveJourney(LOCAL_HERO).current).toBe(currentJourneyScreen(LOCAL_HERO));
    expect(currentJourneyScreen(LOCAL_HERO)).not.toBe("ceremonyMoment");
  });

  it("supplies the current screen and T06-T08 completion; every other rule stays the catalog's", () => {
    const overrides = { current: "ceremonyMoment" as const, resolved: { photo: true, crop: true, reveal: true } };
    const journey = resolveJourney(LOCAL_HERO, null, null, overrides);
    expect(journey.current).toBe("ceremonyMoment");
    const screens = Object.fromEntries(resolveJourneyScreens(LOCAL_HERO, overrides).map((s) => [s.id, s.status]));
    expect(screens).toMatchObject({
      identity: "done",
      announcementChoice: "done",
      phrase: "done",
      photo: "done",
      crop: "done",
      reveal: "done",
      announcementText: "hidden",
      ceremonyMoment: "current",
      ceremonyDateTime: "upcoming",
      gallery: "upcoming",
    });
    expect(journey.sections.find((s) => s.id === "person")?.status).toBe("done");
  });

  it("an unresolved override keeps a reached screen « à compléter », never done", () => {
    const overrides = { current: "ceremonyMoment" as const, resolved: { photo: true, crop: false, reveal: true } };
    const crop = resolveJourneyScreens(LOCAL_HERO, overrides).find((s) => s.id === "crop")!;
    expect(crop).toMatchObject({ status: "toComplete", accessible: true });
  });

  it("a null current screen means every built screen is behind the family", () => {
    const overrides = { current: null, resolved: { photo: true, crop: true, reveal: true } };
    expect(resolveJourney(LOCAL_HERO, null, null, overrides).current).toBeNull();
    expect(resolveJourneyScreens(LOCAL_HERO, overrides).some((s) => s.status === "current")).toBe(false);
  });
});

describe("Chef 03 / O03 — « Traditions & repères » independent of A00", () => {
  const ENTRY = { id: "t-journey", origin: "custom", suggestionId: null, title: null, text: "Un repère fictif." } as const;
  const passed = () => ok(skipA15(ok(skipA13(fullAnnouncement())))); // A09 skipped
  const filled = () => ok(skipA15(ok(skipA13(fullAnnouncementWithTraditions())))); // A09 confirmed
  const traditions = (content: MemorialContent) => resolveJourneyScreens(content).find((s) => s.id === "traditions")!;

  it.each(["yes", "no", "later"] as const)("A00 = %s: a passed Traditions is done and reopenable", (answer) => {
    const content = ok(commitA00(passed(), answer));
    expect(traditions(content)).toMatchObject({ status: "done", accessible: true });
    expect(resolveRevisionTarget(content, "traditions")).toBe("traditions");
    expect(currentJourneyScreen(content)).toBeNull();
  });

  it.each(["yes", "no", "later"] as const)("A00 = %s: a filled Traditions is done, reopenable, its repères kept", (answer) => {
    const before = filled();
    const content = ok(commitA00(before, answer));
    expect(traditions(content)).toMatchObject({ status: "done", accessible: true });
    expect(resolveRevisionTarget(content, "traditions")).toBe("traditions");
    expect((content as { traditions: unknown }).traditions).toEqual((before as { traditions: unknown }).traditions);
  });

  it.each(["yes", "no", "later"] as const)("A00 = %s: a never-reached Traditions stays upcoming — no jump forward", (answer) => {
    const content = ok(commitA00(throughA03(), answer)); // A04 current
    expect(currentJourneyScreen(content)).toBe("ceremonyMoment");
    expect(traditions(content)).toMatchObject({ status: "upcoming", accessible: false });
    expect(resolveRevisionTarget(content, "traditions")).toBeNull();
  });

  it.each(["no", "later"] as const)("A00 = %s: after the ceremony, Traditions is the current screen (natural order)", (answer) => {
    const content = ok(commitA04(ok(commitA00(throughA03(), answer)), "no"));
    expect(currentJourneyScreen(content)).toBe("traditions");
    expect(traditions(content)).toMatchObject({ status: "current", accessible: true });
  });

  it("a pre-O03 draft (A00 = no) already past its sheet is never sent back: Traditions reads « à compléter », reopenable", () => {
    const noA09 = { ...readGuidedFlowState(passed()), A00: { status: "completed", answer: "no" }, A09: undefined };
    const preO03 = { ...passed(), guidedFlow: noA09 } as unknown as MemorialContent;
    const clean = JSON.parse(JSON.stringify(preO03)) as MemorialContent;
    expect(currentJourneyScreen(clean)).toBeNull();
    expect(traditions(clean)).toMatchObject({ status: "toComplete", accessible: true });
    expect(resolveRevisionTarget(clean, "traditions")).toBe("traditions");
  });

  it("changing A00 never touches Traditions' record or repères", () => {
    const base = ok(addTraditionsEntry(filled(), { ...ENTRY }));
    for (const answer of ["no", "later", "yes"] as const) {
      const changed = ok(commitA00(base, answer));
      expect(readGuidedFlowState(changed).A09).toEqual(readGuidedFlowState(base).A09);
      expect((changed as { traditions: unknown }).traditions).toEqual((base as { traditions: unknown }).traditions);
    }
  });
});

describe("Chef 03 / O03 — « À compléter » for repères not confirmed yet (display only)", () => {
  const ENTRY = { id: "t-pending", origin: "custom", suggestionId: null, title: null, text: "Un repère fictif." } as const;
  const filled = () => ok(skipA15(ok(skipA13(fullAnnouncementWithTraditions())))); // A09 confirmed, A00 derived yes
  const traditions = (content: MemorialContent) => resolveJourneyScreens(content).find((s) => s.id === "traditions")!;
  /** A pre-fingerprint draft: repères, A09 resolved without any confirmation. */
  const legacy = (a00: "no" | "later", a09: object = { status: "completed" }) => {
    const base = ok(commitA00(filled(), a00));
    return JSON.parse(
      JSON.stringify({ ...base, guidedFlow: { ...readGuidedFlowState(base), A09: a09 } }),
    ) as MemorialContent;
  };

  it.each(["no", "later"] as const)("A00 = %s, old draft with unconfirmed repères: « À compléter », reopenable, no route change", (a00) => {
    for (const a09 of [{ status: "completed" }, { status: "skipped" }, { status: "completed", answer: "independent" }]) {
      const content = legacy(a00, a09);
      expect(traditions(content)).toMatchObject({ status: "toComplete", accessible: true, pendingConfirmation: true });
      expect(resolveRevisionTarget(content, "traditions")).toBe("traditions");
      expect(currentJourneyScreen(content)).toBeNull();
      expect(resolveJourney(content).sections.find((x) => x.id === "traditions")?.status).toBe("inProgress");
    }
  });

  it("confirming them with « Continuer » turns it back to « Terminée »", () => {
    const confirmed = ok(commitA09(legacy("no")));
    expect(traditions(confirmed)).toMatchObject({ status: "done", accessible: true, pendingConfirmation: false });
  });

  it("A00 = yes (repères shown by the pre-O03 rule) or no repère at all: « Terminée »", () => {
    expect(traditions(ok(commitA00(legacy("no"), "yes")))).toMatchObject({ status: "done", pendingConfirmation: false });
    const empty = ok(skipA15(ok(skipA13(fullAnnouncement()))));
    expect(traditions(ok(commitA00(empty, "no")))).toMatchObject({ status: "done", pendingConfirmation: false });
  });

  it("confirmed, then a repère changed and « Passer »: « À compléter » again", () => {
    const confirmed = ok(commitA09(legacy("no")));
    const added = ok(skipA09(ok(addTraditionsEntry(confirmed, { ...ENTRY }))));
    expect(traditions(added)).toMatchObject({ status: "toComplete", pendingConfirmation: true });
    const entryId = (confirmed as { traditions: { entries: { id: string }[] } }).traditions.entries[0].id;
    const edited = ok(skipA09(ok(updateTraditionsEntry(confirmed, entryId, { text: "Modifié sans confirmer." }))));
    expect(traditions(edited)).toMatchObject({ status: "toComplete", pendingConfirmation: true });
  });

  it("stays reopenable even when the current screen sits before it in the route (never « À venir »)", () => {
    // A05 is open again (e.g. the family reopened A04 and answered « Oui »).
    const base = legacy("no");
    const content = { ...base, guidedFlow: { ...readGuidedFlowState(base), A05: undefined } } as unknown as MemorialContent;
    expect(currentJourneyScreen(content)).toBe("ceremonyDateTime");
    expect(traditions(content)).toMatchObject({ status: "toComplete", accessible: true, pendingConfirmation: true });
  });

  it("never changes what the route shows: needs and the current screen are those of the unflagged draft", () => {
    const pending = legacy("no");
    const confirmed = ok(commitA09(pending));
    expect(currentJourneyScreen(pending)).toBe(currentJourneyScreen(confirmed));
    for (const screen of JOURNEY_SCREENS) expect(screen.needs(pending)).toBe(screen.needs(confirmed));
  });
});

describe("Chef 03 / O04 — the ceremony: « Pas encore décidé » is not « Non »", () => {
  const atA04 = () => ok(commitA00(throughA03(), "yes"));
  const DETAILS = ["ceremonyDateTime", "ceremonyVenue", "ceremonyAddress", "ceremonyProgramme", "ceremonyNote"] as const;

  it("undecided: details « À décider » (never « Non concernée »), the block « À décider », A04 reopenable", () => {
    const content = ok(commitA04(atA04(), "undecided"));
    for (const id of DETAILS) expect(statuses(content)[id]).toBe("deferred");
    expect(resolveJourney(content).sections.find((x) => x.id === "ceremony")?.status).toBe("deferred");
    expect(resolveJourneyScreens(content).find((s) => s.id === "ceremonyMoment")).toMatchObject({ status: "done", accessible: true });
    expect(resolveRevisionTarget(content, "ceremonyMoment")).toBe("ceremonyMoment");
  });

  it("no: details « Non concernée », the block « Terminée » — unchanged", () => {
    const content = ok(commitA04(atA04(), "no"));
    for (const id of DETAILS) expect(statuses(content)[id]).toBe("hidden");
    expect(resolveJourney(content).sections.find((x) => x.id === "ceremony")?.status).toBe("done");
  });

  it("the route is the same for « Non » and « Pas encore décidé » — only the display differs", () => {
    expect(currentJourneyScreen(ok(commitA04(atA04(), "undecided")))).toBe(currentJourneyScreen(ok(commitA04(atA04(), "no"))));
  });

  it("changing the answer keeps what was entered: undecided → yes brings the details back as they were", () => {
    const yes = fullAnnouncement(); // A04 = yes, details resolved
    const undecided = ok(commitA04(yes, "undecided"));
    expect((undecided as { ceremony: unknown }).ceremony).toEqual((yes as { ceremony: unknown }).ceremony);
    const back = ok(commitA04(undecided, "yes"));
    for (const id of DETAILS) expect(statuses(back)[id]).toBe("done");
  });
});

describe("Chef 03 / O04 — locks: a screen the server would refuse is never offered for revision", () => {
  const LOCKS = ["identity", "announcementChoice", "phrase", "photo", "crop", "reveal", "ceremonyMoment"] as const;

  it("locked done screens: not accessible, flagged; the others untouched; the current screen unchanged", () => {
    const content = fullAnnouncement();
    const screens = resolveJourneyScreens(content, undefined, LOCKS);
    for (const id of LOCKS) {
      expect(screens.find((s) => s.id === id)).toMatchObject({ status: "done", accessible: false, locked: true });
    }
    expect(screens.find((s) => s.id === "traditions")).toMatchObject({ accessible: true, locked: false });
    expect(screens.find((s) => s.id === "announcementText")).toMatchObject({ accessible: true, locked: false });
    expect(resolveJourney(content, null, null, undefined, LOCKS).current).toBe(resolveJourney(content).current);
  });

  it("Chef 03 / O05 — a locked open gate never blocks the family: the next editable one is current", () => {
    const content = ok(commitA00(throughA03(), "no")); // A04 would be current
    expect(currentJourneyScreen(content)).toBe("ceremonyMoment");
    const ceremonyLocks = ["ceremonyMoment", "ceremonyDateTime", "ceremonyVenue", "ceremonyAddress", "ceremonyProgramme", "ceremonyNote"] as const;
    // A04 locked and never answered (published before it): its gate is
    // passed over for routing only — Traditions, the next editable screen,
    // is current. Nothing written.
    const before = JSON.stringify(content);
    expect(currentJourneyScreen(content, ceremonyLocks)).toBe("traditions");
    expect(JSON.stringify(content)).toBe(before);
    expect(readGuidedFlowState(content).A04).toBeUndefined();
    const screens = resolveJourneyScreens(content, undefined, ceremonyLocks);
    expect(screens.find((s) => s.id === "ceremonyMoment")).toMatchObject({ accessible: false, locked: true });
    expect(screens.find((s) => s.status === "current")?.id).toBe(currentJourneyScreen(content, ceremonyLocks));
    // Without locks: exactly the historical reading.
    expect(currentJourneyScreen(content, [])).toBe("ceremonyMoment");
  });

  it("?etape= and ?rubrique= naming a locked screen are ignored", () => {
    const content = fullAnnouncement();
    expect(resolveRevisionTarget(content, "identity", LOCKS)).toBeNull();
    expect(resolveRevisionContext(content, "reveal", "person", LOCKS)).toBeNull();
    expect(resolveRevisionTarget(content, "traditions", LOCKS)).toBe("traditions");
    expect(resolveReviewingSection(content, "person", LOCKS)).toBeNull();
    expect(resolveReviewingSection(content, "traditions", LOCKS)).toBe("traditions");
  });
});

describe("Chef 03 / O04 — « Modifier mon choix »: A00 reopened from the death notice's block", () => {
  it("accepts A00 with rubrique=deathNotice, and only that alias", () => {
    expect(REVISION_SECTION_ALIASES).toEqual({ announcementChoice: ["deathNotice"] });
    const no = ok(commitA00(throughA03(), "no"));
    expect(resolveRevisionContext(no, "announcementChoice", "deathNotice")).toEqual({
      screen: "announcementChoice",
      section: "deathNotice",
    });
    expect(resolveRevisionContext(no, "announcementChoice", "person")).toEqual({ screen: "announcementChoice", section: "person" });
    expect(resolveRevisionContext(no, "announcementChoice", "ceremony")).toBeNull();
    expect(resolveRevisionContext(no, "identity", "deathNotice")).toBeNull();
  });

  it("refused once A00 is locked (after publication)", () => {
    const no = ok(commitA00(throughA03(), "no"));
    expect(resolveRevisionContext(no, "announcementChoice", "deathNotice", ["announcementChoice"])).toBeNull();
  });

  it("back on the block afterwards: kept when the notice applies again (yes), ignored while it does not", () => {
    const no = ok(commitA00(throughA03(), "no"));
    expect(resolveReviewingSection(no, "deathNotice")).toBeNull();
    expect(resolveReviewingSection(ok(commitA00(no, "yes")), "deathNotice")).toBe("deathNotice");
  });

  it("is pure: opening A00 writes nothing, and every notice record and text stay", () => {
    const no = ok(commitA00(throughA03(), "no"));
    const before = JSON.stringify(no);
    resolveRevisionContext(no, "announcementChoice", "deathNotice");
    resolveJourney(no, "announcementChoice", "deathNotice");
    expect(JSON.stringify(no)).toBe(before);
    expect(readGuidedFlowState(no).A01).toEqual(readGuidedFlowState(throughA03()).A01);
  });
});

describe("Chef 03 / O05 — nextReviewScreen: the full review, in the natural order", () => {
  /** Walks the review from the start, as « Continuer » would without changes. */
  function walk(content: MemorialContent, locks: readonly JourneyScreenId[] = []): JourneyScreenId[] {
    const steps: JourneyScreenId[] = [];
    let next = nextReviewScreen(content, null, undefined, locks);
    while (next !== null) {
      steps.push(next);
      next = nextReviewScreen(content, next, undefined, locks);
    }
    return steps;
  }

  it("a finished memorial: every reached screen once, in catalog order, from the very first", () => {
    const content = ok(skipA15(ok(skipA13(fullAnnouncementWithTraditions()))));
    expect(currentJourneyScreen(content)).toBeNull();
    const steps = walk(content);
    expect(steps[0]).toBe("identity");
    expect(steps).toEqual(JOURNEY_SCREEN_IDS.filter((id) => steps.includes(id)));
    expect(steps).toEqual(resolveJourneyScreens(content).filter((s) => s.accessible).map((s) => s.id));
    expect(nextReviewScreen(content, steps.at(-1)!)).toBeNull();
  });

  it("never a hidden, deferred or future screen — their content stays", () => {
    const content = ok(commitA00(ok(skipA15(ok(skipA13(fullAnnouncementWithTraditions())))), "no"));
    const steps = walk(content);
    for (const id of ["announcementText", "announcementDetails", "announcementPreview"] as const) expect(steps).not.toContain(id);
    expect(steps).toContain("traditions");
    const partial = throughA03(); // A04 current: the review stops there
    expect(walk(partial).at(-1)).toBe("ceremonyMoment");
    expect(walk(partial)).not.toContain("traditions");
  });

  it("follows answers changed on the way: A00 → « Oui » brings the notice into the review", () => {
    const no = ok(commitA00(ok(skipA15(ok(skipA13(fullAnnouncementWithTraditions())))), "no"));
    expect(nextReviewScreen(no, "reveal")).not.toBe("announcementText");
    const yes = ok(commitA00(no, "yes")); // the family answers « Oui » at A00 during the review
    expect(nextReviewScreen(yes, "reveal")).toBe("announcementText");
  });

  it("after publication: locked screens are passed over, the editable ones kept", () => {
    const content = ok(skipA15(ok(skipA13(fullAnnouncementWithTraditions()))));
    const locks = ["identity", "announcementChoice", "phrase", "photo", "crop", "reveal", "ceremonyMoment", "ceremonyDateTime", "ceremonyVenue", "ceremonyAddress", "ceremonyProgramme", "ceremonyNote"] as const;
    const steps = walk(content, locks);
    expect(steps[0]).toBe("announcementText");
    for (const id of locks) expect(steps).not.toContain(id);
    expect(steps).toContain("traditions");
    expect(steps).toContain("gallery");
  });

  it("is pure: computing the review writes nothing", () => {
    const content = fullAnnouncement();
    const before = JSON.stringify(content);
    walk(content);
    expect(JSON.stringify(content)).toBe(before);
  });
});

