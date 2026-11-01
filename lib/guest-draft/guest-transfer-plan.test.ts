import { describe, expect, it } from "vitest";
import type { MemorialContent } from "@/types/memorial";
import { buildTransferredContent, pendingGuestPhotos, serializableGuestDraft } from "./guest-transfer-plan";
import {
  CROP,
  HERO_LOCAL_ID,
  REAL_GUEST_BUILDER_CONTENT,
  galleryLocalId,
  realGuestBuilderDraft,
  serverMediaId,
  transferableDraft,
} from "./guest-transfer-test-fixtures";
import { validateGuestDraftV3 } from "./guest-draft-v3";
import { MEMORIAL_CONTENT_EDIT_TARGETS, authorizeMemorialEdit } from "@/lib/memorial/edit-authorization";
import { changedMemorialContentMutations } from "@/lib/memorial/edit-mutations";

const FULL_MAP = {
  [HERO_LOCAL_ID]: serverMediaId(0),
  [galleryLocalId(1)]: serverMediaId(1),
  [galleryLocalId(2)]: serverMediaId(2),
  [galleryLocalId(3)]: serverMediaId(3),
};

describe("QG 008 Lot 2 — guest transfer plan", () => {
  it("lists the photos to upload, Hero first then the Gallery in the family's order", () => {
    expect(pendingGuestPhotos(transferableDraft(), {})).toEqual([
      { localId: HERO_LOCAL_ID, purpose: "hero" },
      { localId: galleryLocalId(1), purpose: "gallery" },
      { localId: galleryLocalId(2), purpose: "gallery" },
      { localId: galleryLocalId(3), purpose: "gallery" },
    ]);
  });

  it("never re-uploads a photo the server already mapped (resumed transfer)", () => {
    expect(pendingGuestPhotos(transferableDraft(), { [HERO_LOCAL_ID]: serverMediaId(0), [galleryLocalId(1)]: serverMediaId(1) }))
      .toEqual([
        { localId: galleryLocalId(2), purpose: "gallery" },
        { localId: galleryLocalId(3), purpose: "gallery" },
      ]);
    expect(pendingGuestPhotos(transferableDraft(), FULL_MAP)).toEqual([]);
  });

  it("rebuilds the durable content with server media: Hero photo + crop, Gallery order + captions", () => {
    const draft = transferableDraft();
    const built = buildTransferredContent(draft, FULL_MAP);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const content = built.content as Record<string, unknown>;
    expect((content.hero as Record<string, unknown>).photo).toEqual({ mediaId: serverMediaId(0), crop: CROP });
    expect((content.hero as Record<string, unknown>).displayName).toBe("Madeleine Arnaud");
    expect(content.gallery).toEqual({
      items: [
        { mediaId: serverMediaId(1), caption: null },
        { mediaId: serverMediaId(2), caption: "Été 1972" },
        { mediaId: serverMediaId(3), caption: null },
      ],
    });
    // Everything else is the family's content, untouched (Guided Flow included).
    expect(content.personWords).toEqual({ text: "Institutrice pendant quarante ans." });
    expect((content.guidedFlow as Record<string, unknown>).T08).toEqual({ status: "completed" });
  });

  it("never mutates the local draft", () => {
    const draft = transferableDraft();
    const before = structuredClone(draft);
    buildTransferredContent(draft, FULL_MAP);
    expect(draft).toEqual(before);
  });

  it("refuses to build while a photo has no server media", () => {
    expect(buildTransferredContent(transferableDraft(), { [HERO_LOCAL_ID]: serverMediaId(0) }))
      .toEqual({ ok: false, reason: "missing_media", localId: galleryLocalId(1) });
  });

  it("replaces any Hero photo or Gallery smuggled into the guest content by the server map", () => {
    const draft = transferableDraft({ galleryCount: 0 });
    const smuggled = {
      ...draft,
      content: {
        ...draft.content,
        hero: { ...(draft.content.hero as object), photo: { mediaId: "foreign", crop: null } },
        gallery: { items: [{ mediaId: "foreign-gallery", caption: null }] },
      } as unknown as MemorialContent,
    };
    const built = buildTransferredContent(smuggled, { [HERO_LOCAL_ID]: serverMediaId(0) });
    expect(built.ok && (built.content as Record<string, unknown>).gallery).toBeUndefined();
    expect(built.ok && ((built.content as Record<string, unknown>).hero as Record<string, unknown>).photo)
      .toEqual({ mediaId: serverMediaId(0), crop: CROP });
  });

  describe("regression — a real guest Builder draft carries the Welcome marker (Phase A, unknown_mutation_target)", () => {
    const DRAFT_CONTEXT = { actor: "owner", status: "draft", firstPublicationExists: false, locks: { ceremony: "unknown" } } as const;
    const MAP = { [HERO_LOCAL_ID]: serverMediaId(0), [galleryLocalId(1)]: serverMediaId(1), [galleryLocalId(2)]: serverMediaId(2) };

    it("the fixture reproduces the refusal: the same content WITH the Welcome marker is denied by the server policy", () => {
      const draft = realGuestBuilderDraft();
      expect((draft.content as Record<string, unknown>).welcome).toEqual({ status: "completed" });
      const built = buildTransferredContent(draft, MAP);
      if (!built.ok) throw new Error("built");
      // Exactly what reached the server before the fix: the rebuilt content plus `welcome`.
      const beforeFix = { ...built.content, welcome: { status: "completed" } } as MemorialContent;
      expect(authorizeMemorialEdit(DRAFT_CONTEXT, changedMemorialContentMutations({} as MemorialContent, beforeFix)))
        .toMatchObject({ decision: "DENY", reason: "unknown_mutation_target", mutation: { kind: "content", target: "welcome.status" } });
    });

    it("the durable content leaves `welcome` out, and the SAME server policy authorizes every change", () => {
      const built = buildTransferredContent(realGuestBuilderDraft(), MAP);
      expect(built.ok).toBe(true);
      if (!built.ok) return;
      expect(built.content).not.toHaveProperty("welcome");
      // Over the empty draft `begin_guest_draft_transfer_v1` creates.
      const mutations = changedMemorialContentMutations({} as MemorialContent, built.content);
      expect(mutations.length).toBeGreaterThan(0);
      for (const { target } of mutations) expect(MEMORIAL_CONTENT_EDIT_TARGETS).toContain(target);
      expect(authorizeMemorialEdit(DRAFT_CONTEXT, mutations)).toMatchObject({ decision: "ALLOW" });
    });

    it("keeps every legitimate field and every photo, exactly", () => {
      const built = buildTransferredContent(realGuestBuilderDraft(), MAP);
      if (!built.ok) throw new Error("built");
      const legitimate = structuredClone(REAL_GUEST_BUILDER_CONTENT) as Record<string, unknown>;
      delete legitimate.welcome;
      expect(built.content).toEqual({
        ...legitimate,
        hero: { ...(legitimate.hero as object), photo: { mediaId: serverMediaId(0), crop: CROP } },
        gallery: {
          items: [
            { mediaId: serverMediaId(1), caption: null },
            { mediaId: serverMediaId(2), caption: "Été 1972" },
          ],
        },
      });
    });

    it("the LOCAL draft keeps its Welcome marker (only the durable copy drops it)", () => {
      const draft = realGuestBuilderDraft();
      const before = structuredClone(draft);
      buildTransferredContent(draft, MAP);
      expect(draft).toEqual(before);
      expect((draft.content as Record<string, unknown>).welcome).toEqual({ status: "completed" });
    });
  });

  it("the serialized draft still validates on the server and carries no blob", () => {
    const draft = transferableDraft();
    const sent = JSON.parse(JSON.stringify(serializableGuestDraft(draft)));
    expect(validateGuestDraftV3(sent)).toEqual({ ok: true, draft: sent });
    expect(JSON.stringify(sent)).not.toContain("blob");
  });
});
