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
