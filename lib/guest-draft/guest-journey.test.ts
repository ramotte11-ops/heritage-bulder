import { describe, expect, it } from "vitest";
import type { MemorialContent } from "@/types/memorial";
import { resolveJourney, resolveJourneyScreens } from "@/lib/builder/guided-flow/journey";
import { createGuestDraftV3, updateGuestDraftV3, type GuestDraftV3 } from "./guest-draft-v3";
import {
  guestCurrentJourneyScreen,
  guestJourneyOverrides,
  hasGuestJourney,
  resolveGuestJourney,
  resolveGuestReviewingSection,
  resolveGuestRevisionTarget,
} from "./guest-journey";

/**
 * QG 005-B — « Mon parcours » read from the local V3 draft: the route's
 * one journey, with only T06-T08 taken from the local Hero contract.
 */

const NOW = "2026-10-30T10:00:00.000Z";

function draft(content: Record<string, unknown>, {
  language = "fr" as const,
  heroCrop = { focalX: 0.5, focalY: 0.5, zoom: 1 } as { focalX: number; focalY: number; zoom: number } | null,
  withHeroPhoto = true,
  skinVariant = "light" as "light" | "dark" | null,
} = {}): GuestDraftV3 {
  const created = createGuestDraftV3({
    draftId: "guest-journey",
    transferKey: "guest-journey-transfer",
    now: NOW,
    language,
    content: content as MemorialContent,
  });
  if (!created.ok) throw new Error(created.reason);
  const updated = updateGuestDraftV3(created.draft, {
    now: NOW,
    skinVariant,
    photos: withHeroPhoto ? [{ localId: "local-hero", placement: { purpose: "hero", crop: heroCrop } }] : [],
  });
  if (!updated.ok) throw new Error(updated.reason);
  return updated.draft;
}

const HERO = { displayName: "Jeanne", birth: null, death: null, shortPhrase: "Toujours là", photo: null };
const THROUGH_T08 = {
  hero: HERO,
  guidedFlow: {
    T04: { status: "skipped" },
    A00: { status: "completed", answer: "no" },
    T05: { status: "completed" },
    T06: { status: "completed" },
    T07: { status: "completed" },
    T08: { status: "completed" },
  },
};

function statuses(d: GuestDraftV3) {
  return Object.fromEntries(resolveJourneyScreens(d.content, guestJourneyOverrides(d)).map((s) => [s.id, s.status]));
}

describe("guest journey — Hero read from the local draft", () => {
  it("is offered from the first Hero question on, never on T01 or the Welcome", () => {
    expect(hasGuestJourney(draft({}, { language: null as never, withHeroPhoto: false, skinVariant: null }))).toBe(false);
    expect(hasGuestJourney(draft({}, { withHeroPhoto: false, skinVariant: null }))).toBe(false);
    expect(hasGuestJourney(draft({ welcome: { status: "completed" } }, { withHeroPhoto: false, skinVariant: null })))
      .toBe(true);
  });

  it("after a local T08: the whole Hero is done and the route's next screen is current", () => {
    const d = draft(THROUGH_T08);
    // The route's own reading, with no server photo, would stop at the Hero.
    expect(resolveJourney(d.content).current).not.toBe("ceremonyMoment");
    expect(guestCurrentJourneyScreen(d)).toBe("ceremonyMoment");
    expect(statuses(d)).toMatchObject({
      identity: "done",
      announcementChoice: "done",
      phrase: "done",
      photo: "done",
      crop: "done",
      reveal: "done",
      ceremonyMoment: "current",
    });
    expect(resolveGuestJourney(d).sections.find((s) => s.id === "person")?.status).toBe("done");
  });

  it("a replaced photo (crop reset) makes the crop current again, the ambiance still reached", () => {
    const d = draft(THROUGH_T08, { heroCrop: null });
    expect(guestCurrentJourneyScreen(d)).toBe("crop");
    expect(statuses(d)).toMatchObject({ photo: "done", crop: "current", reveal: "upcoming" });
  });

  it("a reopened photo (T06 unmarked) is current; its still-valid crop stays done, as on the route", () => {
    const flow: Record<string, unknown> = { ...THROUGH_T08.guidedFlow };
    delete flow.T06;
    const d = draft({ ...THROUGH_T08, guidedFlow: flow });
    expect(guestCurrentJourneyScreen(d)).toBe("photo");
    expect(statuses(d)).toMatchObject({ photo: "current", crop: "done" });
    expect(resolveGuestRevisionTarget(d, "identity")).toBe("identity");
    expect(resolveGuestRevisionTarget(d, "photo")).toBeNull();
  });

  it("before T08: the ambiance is current and the crop reopenable", () => {
    const flow: Record<string, unknown> = { ...THROUGH_T08.guidedFlow };
    delete flow.T08;
    const d = draft({ ...THROUGH_T08, guidedFlow: flow }, { skinVariant: null });
    expect(guestCurrentJourneyScreen(d)).toBe("reveal");
    expect(resolveGuestRevisionTarget(d, "crop")).toBe("crop");
  });
});

describe("guest revision rules — the route's own", () => {
  const d = draft(THROUGH_T08);

  it("accepts a reached screen, refuses the current one, an upcoming one, a hidden one and null", () => {
    expect(resolveGuestRevisionTarget(d, "phrase")).toBe("phrase");
    expect(resolveGuestRevisionTarget(d, "reveal")).toBe("reveal");
    expect(resolveGuestRevisionTarget(d, "ceremonyMoment")).toBeNull();
    expect(resolveGuestRevisionTarget(d, "gallery")).toBeNull();
    expect(resolveGuestRevisionTarget(d, "announcementText")).toBeNull();
    expect(resolveGuestRevisionTarget(d, null)).toBeNull();
  });

  it("keeps a reviewed rubrique only while it holds an accessible screen", () => {
    expect(resolveGuestReviewingSection(d, "person")).toBe("person");
    expect(resolveGuestReviewingSection(d, "gallery")).toBeNull();
    expect(resolveGuestReviewingSection(d, null)).toBeNull();
  });

  it("carries the revision and the rubrique into the snapshot, and never writes", () => {
    const before = structuredClone(d);
    const snapshot = resolveGuestJourney(d, "identity");
    expect(snapshot).toMatchObject({ current: "ceremonyMoment", revising: "identity", reviewingSection: "person" });
    expect(d).toEqual(before);
  });
});
