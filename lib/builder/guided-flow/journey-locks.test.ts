import { describe, expect, it } from "vitest";
import { authorizeMemorialEdit } from "@/lib/memorial/edit-authorization";
import { JOURNEY_SCREEN_IDS } from "./journey";
import { lockedJourneyScreens } from "./journey-locks";

/**
 * Chef 03 / O04 — « Mon parcours » never offers a screen the server would
 * refuse to save. The locks are read from Security V1, never invented.
 */
describe("lockedJourneyScreens", () => {
  it("before publication (draft, ready): nothing is locked", () => {
    expect(lockedJourneyScreens({ status: "draft" })).toEqual([]);
    expect(lockedJourneyScreens({ status: "ready" })).toEqual([]);
  });

  it.each(["published", "editing"] as const)(
    "%s: the Hero, the death-notice choice and the ceremony are locked — the rest stays editable",
    (status) => {
      expect(lockedJourneyScreens({ status })).toEqual([
        "identity",
        "announcementChoice",
        "phrase",
        "photo",
        "crop",
        "reveal",
        "ceremonyMoment",
        "ceremonyDateTime",
        "ceremonyVenue",
        "ceremonyAddress",
        "ceremonyProgramme",
        "ceremonyNote",
      ]);
    },
  );

  it("archived: everything is locked (the policy's archived_restricted)", () => {
    expect(lockedJourneyScreens({ status: "archived" })).toEqual([...JOURNEY_SCREEN_IDS]);
  });

  it("mirrors the policy itself: a locked screen's own writes are refused after publication, an open one's allowed", () => {
    const context = { actor: "owner", status: "published", firstPublicationExists: true, locks: { ceremony: "unknown" } } as const;
    expect(authorizeMemorialEdit(context, [{ kind: "content", target: "guidedFlow.A00" }]).decision).toBe("DENY");
    expect(authorizeMemorialEdit(context, [{ kind: "content", target: "hero.displayName" }]).decision).toBe("DENY");
    expect(authorizeMemorialEdit(context, [{ kind: "content", target: "ceremony.date" }]).decision).toBe("DENY");
    expect(authorizeMemorialEdit(context, [{ kind: "configuration", target: "skinVariant" }]).decision).toBe("DENY");
    expect(authorizeMemorialEdit(context, [{ kind: "content", target: "traditions.entries" }]).decision).toBe("ALLOW");
    expect(authorizeMemorialEdit(context, [{ kind: "content", target: "deathNotice.announcementText" }]).decision).toBe("ALLOW");
    expect(authorizeMemorialEdit(context, [{ kind: "content", target: "gallery.items" }]).decision).toBe("ALLOW");
  });
});
