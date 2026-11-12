import { describe, expect, it } from "vitest";
import type { MemorialContent } from "@/types/memorial";
import { writeDisplayName, writeShortPhrase } from "@/lib/builder/guided-flow/hero-step";
import { buildTransferredContent } from "@/lib/guest-draft/guest-transfer-plan";
import { createGuestDraftV3 } from "@/lib/guest-draft/guest-draft-v3";
import {
  CROP,
  HERO_LOCAL_ID,
  REAL_GUEST_BUILDER_CONTENT,
  TRANSFER_KEY,
  galleryLocalId,
  realGuestBuilderDraft,
  serverMediaId,
} from "@/lib/guest-draft/guest-transfer-test-fixtures";
import {
  MEMORIAL_CONTENT_EDIT_TARGETS,
  authorizeMemorialEdit,
  type MemorialEditContext,
} from "./edit-authorization";
import { changedMemorialContentMutations } from "./edit-mutations";

/**
 * QG 008 Lot 2 — `hero.photo` absent ↔ `null` (Phase A, unknown_mutation_target).
 *
 * The Builder writes `photo: null` on every Hero save until a photo is
 * chosen; the durable draft starts as `{}`. That transition used to claim
 * the undeclared target `hero.photo`, so T04 on a new memorial and the
 * guest transfer without a Hero photo were refused. It now claims the
 * existing `hero.photo.mediaId` — nothing else changes.
 */

const DRAFT: MemorialEditContext = { actor: "owner", status: "draft", firstPublicationExists: false, locks: { ceremony: "unknown" } };
const PUBLISHED: MemorialEditContext = { actor: "owner", status: "published", firstPublicationExists: true, locks: { ceremony: "unknown" } };
const ARCHIVED: MemorialEditContext = { actor: "owner", status: "archived", firstPublicationExists: true, locks: { ceremony: "unknown" } };

const c = (value: unknown) => value as MemorialContent;
const decide = (context: MemorialEditContext, stored: unknown, submitted: unknown) =>
  authorizeMemorialEdit(context, changedMemorialContentMutations(c(stored), c(submitted)));
const targets = (stored: unknown, submitted: unknown) =>
  changedMemorialContentMutations(c(stored), c(submitted)).map(({ target }) => target);

function written(result: ReturnType<typeof writeDisplayName>): MemorialContent {
  if (!result.ok) throw new Error("Builder write refused");
  return result.content;
}

const HERO_NO_PHOTO_KEY = { displayName: "Jeanne", birth: null, death: null, shortPhrase: null };
const PHOTO_A = { mediaId: "media-a", crop: { focalX: 0.5, focalY: 0.5, zoom: 1 } };

describe("hero.photo absent ↔ null — mutation claim", () => {
  it("claims the EXISTING target hero.photo.mediaId, never the undeclared hero.photo", () => {
    expect(targets({}, { hero: { ...HERO_NO_PHOTO_KEY, photo: null } })).toContain("hero.photo.mediaId");
    expect(targets({ hero: HERO_NO_PHOTO_KEY }, { hero: { ...HERO_NO_PHOTO_KEY, photo: null } })).toEqual(["hero.photo.mediaId"]);
    expect(targets({ hero: { ...HERO_NO_PHOTO_KEY, photo: null } }, { hero: HERO_NO_PHOTO_KEY })).toEqual(["hero.photo.mediaId"]);
    for (const [stored, submitted] of [[{}, { hero: { photo: null } }], [{ hero: HERO_NO_PHOTO_KEY }, { hero: { ...HERO_NO_PHOTO_KEY, photo: null } }]]) {
      expect(targets(stored, submitted)).not.toContain("hero.photo");
    }
  });

  it("does not enlarge the target list", () => {
    expect(MEMORIAL_CONTENT_EDIT_TARGETS).toHaveLength(44);
    expect(MEMORIAL_CONTENT_EDIT_TARGETS).not.toContain("hero.photo");
    expect(MEMORIAL_CONTENT_EDIT_TARGETS).toContain("hero.photo.mediaId");
  });

  it("keeps failing closed on any other whole-photo value", () => {
    for (const odd of ["media-a", ["media-a"], {}, 42, true]) {
      expect(targets({ hero: { ...HERO_NO_PHOTO_KEY, photo: null } }, { hero: { ...HERO_NO_PHOTO_KEY, photo: odd } })).toContain("hero.photo");
      expect(decide(DRAFT, { hero: { ...HERO_NO_PHOTO_KEY, photo: null } }, { hero: { ...HERO_NO_PHOTO_KEY, photo: odd } }))
        .toMatchObject({ decision: "DENY", reason: "unknown_mutation_target", mutation: { target: "hero.photo" } });
    }
  });

  it("leaves every real photo change claimed exactly as before (add, substitute, re-crop, remove)", () => {
    const none = { hero: { ...HERO_NO_PHOTO_KEY, photo: null } };
    const withA = { hero: { ...HERO_NO_PHOTO_KEY, photo: PHOTO_A } };
    const withB = { hero: { ...HERO_NO_PHOTO_KEY, photo: { ...PHOTO_A, mediaId: "media-b" } } };
    const recropped = { hero: { ...HERO_NO_PHOTO_KEY, photo: { ...PHOTO_A, crop: { focalX: 0.4, focalY: 0.5, zoom: 1 } } } };
    expect(targets(none, withA)).toEqual(["hero.photo.crop", "hero.photo.mediaId"]);
    expect(targets({ hero: HERO_NO_PHOTO_KEY }, withA)).toEqual(["hero.photo.crop", "hero.photo.mediaId"]);
    expect(targets(withA, withB)).toEqual(["hero.photo.mediaId"]);
    expect(targets(withA, recropped)).toEqual(["hero.photo.crop"]);
    expect(targets(withA, none)).toEqual(["hero.photo.crop", "hero.photo.mediaId"]);
    expect(targets(withA, { hero: HERO_NO_PHOTO_KEY })).toEqual(["hero.photo.crop", "hero.photo.mediaId"]);
  });
});

describe("hero.photo — rights before and after publication", () => {
  it("before publication: the authenticated Builder saves a name, then a phrase, without any photo", () => {
    const afterName = written(writeDisplayName(c({}), "Jeanne Martin"));
    expect((afterName.hero as Record<string, unknown>).photo).toBeNull();
    expect(decide(DRAFT, {}, afterName)).toMatchObject({ decision: "ALLOW" });

    const afterPhrase = written(writeShortPhrase(afterName, "Toujours souriante"));
    expect(targets(afterName, afterPhrase)).toEqual(["hero.shortPhrase"]);
    expect(decide(DRAFT, afterName, afterPhrase)).toMatchObject({ decision: "ALLOW" });
  });

  it("before publication: a stored Hero WITHOUT a photo key can still be edited by the Builder", () => {
    const stored = c({ hero: HERO_NO_PHOTO_KEY });
    const next = written(writeShortPhrase(stored, "Une phrase"));
    expect(targets(stored, next)).toEqual(["hero.photo.mediaId", "hero.shortPhrase"]);
    expect(decide(DRAFT, stored, next)).toMatchObject({ decision: "ALLOW" });
  });

  it("after publication: the absent ↔ null transition stays locked like any Hero photo change", () => {
    expect(decide(PUBLISHED, { hero: HERO_NO_PHOTO_KEY }, { hero: { ...HERO_NO_PHOTO_KEY, photo: null } }))
      .toMatchObject({ decision: "DENY", reason: "hero_locked_after_publication", mutation: { target: "hero.photo.mediaId" } });
    expect(decide(PUBLISHED, {}, written(writeDisplayName(c({}), "Jeanne"))))
      .toMatchObject({ decision: "DENY", reason: "hero_locked_after_publication" });
  });

  it("after publication: no photo can be added, substituted, removed or re-cropped", () => {
    const none = { hero: { ...HERO_NO_PHOTO_KEY, photo: null } };
    const withA = { hero: { ...HERO_NO_PHOTO_KEY, photo: PHOTO_A } };
    const withB = { hero: { ...HERO_NO_PHOTO_KEY, photo: { ...PHOTO_A, mediaId: "media-b" } } };
    const recropped = { hero: { ...HERO_NO_PHOTO_KEY, photo: { ...PHOTO_A, crop: { focalX: 0.4, focalY: 0.5, zoom: 1 } } } };
    for (const [stored, submitted] of [[none, withA], [withA, withB], [withA, none], [withA, { hero: HERO_NO_PHOTO_KEY }], [withA, recropped]]) {
      expect(decide(PUBLISHED, stored, submitted)).toMatchObject({ decision: "DENY", reason: "hero_locked_after_publication" });
    }
  });

  it("after publication: an unchanged Hero does not block a permitted edit elsewhere", () => {
    const stored = { hero: { ...HERO_NO_PHOTO_KEY, photo: null }, personWords: { text: "Avant" } };
    expect(decide(PUBLISHED, stored, { ...stored, personWords: { text: "Après" } })).toMatchObject({ decision: "ALLOW" });
  });

  it("an archived memorial stays closed", () => {
    expect(decide(ARCHIVED, {}, { hero: { ...HERO_NO_PHOTO_KEY, photo: null } }))
      .toMatchObject({ decision: "DENY", reason: "archived_restricted" });
  });
});

describe("hero.photo — guest transfer over the empty durable draft", () => {
  const guestDraft = (content: unknown) => {
    const created = createGuestDraftV3({ draftId: "d", transferKey: TRANSFER_KEY, now: "2026-11-01T09:00:00.000Z", language: "fr", skinVariant: "dark", content: c(content) });
    if (!created.ok) throw new Error(created.reason);
    return created.draft;
  };
  const transferred = (draft: Parameters<typeof buildTransferredContent>[0], map: Record<string, string> = {}) => {
    const built = buildTransferredContent(draft, map);
    if (!built.ok) throw new Error(built.reason);
    return built.content as Record<string, unknown>;
  };

  it("a draft with only the name is accepted, photo kept as null", () => {
    const content = transferred(guestDraft({ welcome: { status: "completed" }, hero: { displayName: "Jeanne", birth: null, death: null, shortPhrase: null, photo: null } }));
    expect(content).toEqual({ hero: { displayName: "Jeanne", birth: null, death: null, shortPhrase: null, photo: null } });
    expect(decide(DRAFT, {}, content)).toMatchObject({ decision: "ALLOW" });
  });

  it("a real draft WITHOUT a Hero photo is accepted, and the Builder can edit it next", () => {
    const content = transferred(guestDraft(structuredClone(REAL_GUEST_BUILDER_CONTENT)));
    expect((content.hero as Record<string, unknown>).photo).toBeNull();
    expect(content).not.toHaveProperty("gallery");
    expect(decide(DRAFT, {}, content)).toMatchObject({ decision: "ALLOW" });
    const next = written(writeShortPhrase(c(content), "Modifiée dans le Builder"));
    expect(decide(DRAFT, content, next)).toMatchObject({ decision: "ALLOW" });
  });

  it("a real draft WITH Hero photo and Gallery is accepted, server media and crop kept", () => {
    const content = transferred(realGuestBuilderDraft(), {
      [HERO_LOCAL_ID]: serverMediaId(0),
      [galleryLocalId(1)]: serverMediaId(1),
      [galleryLocalId(2)]: serverMediaId(2),
    });
    expect((content.hero as Record<string, unknown>).photo).toEqual({ mediaId: serverMediaId(0), crop: CROP });
    expect((content.gallery as { items: Array<{ mediaId: string }> }).items.map(({ mediaId }) => mediaId)).toEqual([serverMediaId(1), serverMediaId(2)]);
    expect(decide(DRAFT, {}, content)).toMatchObject({ decision: "ALLOW" });
  });
});
