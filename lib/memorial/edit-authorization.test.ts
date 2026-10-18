import { describe, expect, it } from "vitest";
import {
  authorizeMemorialEdit,
  type CeremonyEditLock,
  type MemorialEditActorKind,
  type MemorialMutationClaim,
} from "./edit-authorization";
import type { MemorialStatus } from "@/types/memorial";

function context({
  actor = "owner",
  status = "draft",
  published = false,
  ceremony = "unknown",
}: {
  actor?: MemorialEditActorKind;
  status?: MemorialStatus;
  published?: boolean;
  ceremony?: CeremonyEditLock;
} = {}) {
  return {
    actor,
    status,
    firstPublicationExists: published,
    locks: { ceremony },
  };
}

const content = (target: string): MemorialMutationClaim => ({ kind: "content", target });
const media = (target: string): MemorialMutationClaim => ({ kind: "media", target });
const visibility = (target: string): MemorialMutationClaim => ({ kind: "visibility", target });
const configuration = (target: string): MemorialMutationClaim => ({ kind: "configuration", target });

describe("Security V1 edit authorization — lifecycle", () => {
  it.each(["draft", "ready"] as const)("keeps known owner edits available before first publication (%s)", (status) => {
    expect(authorizeMemorialEdit(context({ status }), [content("hero.displayName")])).toEqual({
      decision: "ALLOW",
      reason: "pre_publication_edit",
    });
  });

  it.each(["published", "editing"] as const)("requires proof of the first publication for %s", (status) => {
    expect(authorizeMemorialEdit(context({ status, published: false }), [content("gallery.items")])).toEqual({
      decision: "DENY",
      reason: "inconsistent_publication_state",
    });
  });

  it.each(["draft", "ready"] as const)("fails closed on a pre-publication status with publication history (%s)", (status) => {
    expect(authorizeMemorialEdit(context({ status, published: true }), [content("gallery.items")])).toEqual({
      decision: "DENY",
      reason: "inconsistent_publication_state",
    });
  });

  it("restricts archived family writes without changing application behavior in this lot", () => {
    expect(authorizeMemorialEdit(context({ status: "archived", published: true }), [content("gallery.items")])).toEqual({
      decision: "DENY",
      reason: "archived_restricted",
    });
  });
});

describe("Security V1 edit authorization — actors", () => {
  it.each([
    ["administrator", "administrator_explicit_authorization_required"],
    ["system", "system_explicit_authorization_required"],
    ["unknown", "actor_unknown"],
  ] as const)("grants no implicit privilege to %s", (actor, reason) => {
    expect(authorizeMemorialEdit(context({ actor }), [content("hero.displayName")])).toEqual({
      decision: "DENY",
      reason,
    });
  });
});

describe("Security V1 edit authorization — post-publication domains", () => {
  const afterPublication = context({ status: "published", published: true, ceremony: "open" });

  it.each([
    content("hero.displayName"),
    content("hero.birth"),
    content("hero.death"),
    content("hero.shortPhrase"),
    content("hero.photo.mediaId"),
    content("hero.photo.crop"),
    content("guidedFlow.T08"),
    configuration("skinVariant"),
    media("hero.reserve"),
    media("hero.finalize"),
    media("hero.retire"),
  ])("locks every family Hero mutation ($target)", (mutation) => {
    expect(authorizeMemorialEdit(afterPublication, [mutation])).toMatchObject({
      decision: "DENY",
      reason: "hero_locked_after_publication",
    });
  });

  it.each([
    "deathNotice.announcementText",
    "deathNotice.precisions.generalLocation",
    "deathNotice.precisions.familyMessage",
    "deathNotice.precisions.thought",
    "deathNotice.precisions.quote",
    "deathNotice.precisions.other",
    "guidedFlow.A01",
    "guidedFlow.A02",
    "guidedFlow.A03",
  ])("allows a death-notice correction (%s)", (target) => {
    expect(authorizeMemorialEdit(afterPublication, [content(target)])).toMatchObject({ decision: "ALLOW" });
  });

  it("does not implicitly authorize changing whether a death notice exists", () => {
    expect(authorizeMemorialEdit(afterPublication, [content("guidedFlow.A00")])).toMatchObject({
      decision: "DENY",
      reason: "death_notice_presence_after_publication_unresolved",
    });
  });

  it.each(["personWords.text", "lovedThings.text", "legacy.text"])("allows life-story enrichment (%s)", (target) => {
    expect(authorizeMemorialEdit(afterPublication, [content(target)])).toMatchObject({ decision: "ALLOW" });
  });

  it.each([content("gallery.items"), content("guidedFlow.A13"), media("gallery.reserve"), media("gallery.finalize"), media("gallery.retire")])(
    "allows existing Gallery management rules to operate ($target)",
    (mutation) => {
      expect(authorizeMemorialEdit(afterPublication, [mutation])).toMatchObject({ decision: "ALLOW" });
    },
  );

  it.each(["traditions.entries", "guidedFlow.A09"])("allows traditions corrections (%s)", (target) => {
    expect(authorizeMemorialEdit(afterPublication, [content(target)])).toMatchObject({ decision: "ALLOW" });
  });
});

describe("Security V1 edit authorization — ceremony and visibility", () => {
  it("allows practical ceremony edits while the supplied lock is open", () => {
    expect(
      authorizeMemorialEdit(context({ status: "editing", published: true, ceremony: "open" }), [content("ceremony.time")]),
    ).toMatchObject({ decision: "ALLOW" });
  });

  it("refuses ceremony content after definitive closure", () => {
    expect(
      authorizeMemorialEdit(context({ status: "published", published: true, ceremony: "closed" }), [content("ceremony.venueName")]),
    ).toMatchObject({ decision: "DENY", reason: "ceremony_closed" });
  });

  it("fails closed until a durable ceremony lock can be supplied", () => {
    expect(
      authorizeMemorialEdit(context({ status: "published", published: true, ceremony: "unknown" }), [content("ceremony.note")]),
    ).toMatchObject({ decision: "DENY", reason: "ceremony_lock_unknown" });
  });

  it.each(["ceremony", "story", "gallery", "deathNotice"])("keeps content-section visibility independent (%s)", (target) => {
    expect(
      authorizeMemorialEdit(context({ status: "published", published: true, ceremony: "closed" }), [visibility(target)]),
    ).toEqual({ decision: "ALLOW", reason: "section_visibility_edit" });
  });

  it("never treats the mandatory Hero as a visibility target", () => {
    expect(authorizeMemorialEdit(context(), [visibility("hero")])).toMatchObject({
      decision: "DENY",
      reason: "unknown_mutation_target",
    });
  });
});

describe("Security V1 edit authorization — fail closed", () => {
  const afterPublication = context({ status: "published", published: true, ceremony: "open" });

  it("refuses unknown kinds and targets", () => {
    expect(authorizeMemorialEdit(afterPublication, [{ kind: "magic", target: "gallery.items" }])).toMatchObject({
      decision: "DENY",
      reason: "unknown_mutation_kind",
    });
    expect(authorizeMemorialEdit(afterPublication, [content("hero.futureField")])).toMatchObject({
      decision: "DENY",
      reason: "unknown_mutation_target",
    });
  });

  it("refuses language after publication until the PO arbitrates it", () => {
    expect(authorizeMemorialEdit(afterPublication, [configuration("language")])).toMatchObject({
      decision: "DENY",
      reason: "language_after_publication_unresolved",
    });
  });

  it("does not take over contribution permissions", () => {
    expect(authorizeMemorialEdit(afterPublication, [{ kind: "contribution", target: "message.create" }])).toMatchObject({
      decision: "DENY",
      reason: "contribution_policy_is_separate",
    });
  });

  it("refuses an empty request", () => {
    expect(authorizeMemorialEdit(afterPublication, [])).toEqual({ decision: "DENY", reason: "no_mutation" });
  });

  it("refuses a complete composite mutation when one target is protected", () => {
    expect(
      authorizeMemorialEdit(afterPublication, [content("gallery.items"), content("hero.displayName")]),
    ).toEqual({
      decision: "DENY",
      reason: "hero_locked_after_publication",
      mutationIndex: 1,
      mutation: content("hero.displayName"),
    });
  });
});
