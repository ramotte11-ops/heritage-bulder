import { describe, expect, it, vi } from "vitest";
import type { HeritageActor } from "@/lib/auth/heritage-actor";
import { fullAnnouncement, recordingResolver } from "@/lib/memorial/assembly/test-fixtures";
import { authorizeAndPublishMemorial } from "./server-publication";

const OWNER_ID = "22222222-2222-4222-8222-222222222222";
const MEMORIAL_ID = "11111111-1111-4111-8111-111111111111";
const actor = {
  audience: "owner",
  identity: { id: "auth", email: "owner@example.test", app_metadata: {} },
  owner: { id: OWNER_ID, authUserId: "auth", email: "owner@example.test", createdAt: "t", updatedAt: "t" },
  isHeritageAdmin: false,
} as HeritageActor;

function deps(actualOwnerId: string | null) {
  const commitPublication = vi.fn().mockResolvedValue({ publishedAt: "now", firstPublishedAt: "now", revision: 3 });
  return {
    memorialOwnershipRepository: {
      findOwnerIdForMemorial: vi.fn().mockResolvedValue(actualOwnerId),
    },
    publicationRepository: {
      load: vi.fn().mockResolvedValue({
        status: "ready",
        firstPublishedAt: null,
        language: "fr",
        skin: "intemporel",
        skinVariant: "light",
        slug: "jeanne-martin",
        accessLevel: "avis",
        draft: { content: fullAnnouncement(), updatedAt: "t", revision: 3 },
      }),
      commitPublication,
    },
    resolveMedia: recordingResolver().resolve,
    commitPublication,
  };
}

describe("authorizeAndPublishMemorial", () => {
  it("allows the session-derived owner and never accepts an owner id from input", async () => {
    const d = deps(OWNER_ID);
    await expect(
      authorizeAndPublishMemorial(d, actor, { memorialId: MEMORIAL_ID, expectedRevision: 3 }),
    ).resolves.toMatchObject({ ok: true });
    expect(d.commitPublication).toHaveBeenCalledWith(expect.objectContaining({ ownerId: OWNER_ID }));
  });

  it("forwards the family's gallery choice to the policy, never an access level from input", async () => {
    const d = deps(OWNER_ID);
    const forged = { memorialId: MEMORIAL_ID, expectedRevision: 3, gallerySelection: [], accessLevel: "complet" };
    await expect(authorizeAndPublishMemorial(d, actor, forged)).resolves.toMatchObject({ ok: true });
    expect(d.commitPublication).toHaveBeenCalledWith(expect.objectContaining({ expectedAccessLevel: "avis" }));
  });

  it("collapses a foreign memorial into an opaque refusal before any publication read or write", async () => {
    const d = deps("another-owner");
    await expect(
      authorizeAndPublishMemorial(d, actor, { memorialId: MEMORIAL_ID, expectedRevision: 3 }),
    ).resolves.toEqual({ ok: false, code: "not_found_or_forbidden" });
    expect(d.publicationRepository.load).not.toHaveBeenCalled();
    expect(d.commitPublication).not.toHaveBeenCalled();
  });
});

describe("authorizeAndPublishFromPreview — QG 008 Lot 3", () => {
  async function previewDeps(actualOwnerId: string | null) {
    const { computePublicationPreview } = await import("./publication-preview");
    const snapshot = {
      status: "draft",
      firstPublishedAt: null,
      language: "fr",
      skin: "intemporel",
      skinVariant: "light",
      slug: "jeanne-martin",
      accessLevel: "avis",
      draft: { content: fullAnnouncement(), updatedAt: "t", revision: 3 },
    };
    const preview = computePublicationPreview({ draft: snapshot.draft.content, accessLevel: "avis", skin: "intemporel" });
    if (!preview.ok) throw new Error("preview refused");
    const commitFirstPublication = vi.fn().mockResolvedValue({ outcome: "published", publishedAt: "now", firstPublishedAt: "now", revision: 3 });
    return {
      digest: preview.digest,
      commitFirstPublication,
      deps: {
        memorialOwnershipRepository: { findOwnerIdForMemorial: vi.fn().mockResolvedValue(actualOwnerId) },
        publicationRepository: { load: vi.fn().mockResolvedValue(snapshot), commitFirstPublication },
        resolveMedia: recordingResolver().resolve,
      },
    };
  }

  it("publishes for the session-derived owner only", async () => {
    const { authorizeAndPublishFromPreview } = await import("./server-publication");
    const setup = await previewDeps(OWNER_ID);
    const result = await authorizeAndPublishFromPreview(setup.deps as never, actor, { memorialId: MEMORIAL_ID, expectedRevision: 3, expectedDigest: setup.digest });
    expect(result).toMatchObject({ ok: true, outcome: "published" });
    expect(setup.commitFirstPublication).toHaveBeenCalledWith(expect.objectContaining({ memorialId: MEMORIAL_ID, ownerId: OWNER_ID }));
  });

  it("refuses another owner's memorial opaquely, loading and committing nothing", async () => {
    const { authorizeAndPublishFromPreview } = await import("./server-publication");
    const setup = await previewDeps("33333333-3333-4333-8333-333333333333");
    const result = await authorizeAndPublishFromPreview(setup.deps as never, actor, { memorialId: MEMORIAL_ID, expectedRevision: 3, expectedDigest: setup.digest });
    expect(result).toEqual({ ok: false, code: "not_found_or_forbidden" });
    expect(setup.deps.publicationRepository.load).not.toHaveBeenCalled();
    expect(setup.commitFirstPublication).not.toHaveBeenCalled();
  });

  it("refuses an anonymous actor", async () => {
    const { authorizeAndPublishFromPreview } = await import("./server-publication");
    const setup = await previewDeps(OWNER_ID);
    const anonymous = { audience: "anonymous", identity: null, owner: null, isHeritageAdmin: false } as unknown as HeritageActor;
    const result = await authorizeAndPublishFromPreview(setup.deps as never, anonymous, { memorialId: MEMORIAL_ID, expectedRevision: 3, expectedDigest: setup.digest });
    expect(result).toEqual({ ok: false, code: "not_found_or_forbidden" });
    expect(setup.commitFirstPublication).not.toHaveBeenCalled();
  });
});
