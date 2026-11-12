import { describe, expect, it, vi } from "vitest";
import type { MemorialContent } from "@/types/memorial";
import { fullAnnouncement, recordingResolver } from "@/lib/memorial/assembly/test-fixtures";
import {
  FreePublicationRefusedError,
  publishMemorial,
  type MemorialPublicationRepository,
} from "./publish-memorial";

const MEMORIAL_ID = "11111111-1111-4111-8111-111111111111";
const OWNER_ID = "22222222-2222-4222-8222-222222222222";

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    status: "ready" as const,
    firstPublishedAt: null,
    language: "fr" as const,
    skin: "intemporel" as const,
    skinVariant: "light" as const,
    slug: "jeanne-martin",
    accessLevel: "complet",
    draft: {
      content: fullAnnouncement(),
      updatedAt: "2026-10-19T06:00:00Z",
      revision: 7,
    },
    ...overrides,
  };
}

function repository(current = snapshot()) {
  const commitPublication = vi.fn().mockResolvedValue({
    publishedAt: "2026-10-19T07:00:00Z",
    firstPublishedAt: "2026-10-19T07:00:00Z",
    revision: current.draft.revision,
  });
  return {
    value: {
      load: vi.fn().mockResolvedValue(current),
      commitPublication,
    } satisfies MemorialPublicationRepository,
    commitPublication,
  };
}

describe("publishMemorial", () => {
  it("publishes the exact validated revision for a legitimate first publication", async () => {
    const repo = repository();
    const result = await publishMemorial(
      { repository: repo.value, resolveMedia: recordingResolver().resolve },
      { memorialId: MEMORIAL_ID, ownerId: OWNER_ID, expectedRevision: 7 },
    );

    expect(result).toEqual({
      ok: true,
      publishedAt: "2026-10-19T07:00:00Z",
      firstPublishedAt: "2026-10-19T07:00:00Z",
      revision: 7,
    });
    expect(repo.commitPublication).toHaveBeenCalledExactlyOnceWith({
      memorialId: MEMORIAL_ID,
      ownerId: OWNER_ID,
      expectedRevision: 7,
      expectedStatus: "ready",
      expectedFirstPublishedAt: null,
      expectedLanguage: "fr",
      expectedSkin: "intemporel",
      expectedSkinVariant: "light",
      expectedSlug: "jeanne-martin",
      expectedAccessLevel: "complet",
      expectedContent: expect.any(Object) as MemorialContent,
      publishedContent: expect.any(Object) as MemorialContent,
    });
  });

  it("allows editing → published without changing the durable first publication date", async () => {
    const firstPublishedAt = "2026-10-01T10:00:00Z";
    const current = snapshot({ status: "editing", firstPublishedAt });
    const repo = repository(current);
    repo.commitPublication.mockResolvedValue({
      publishedAt: "2026-10-19T07:00:00Z",
      firstPublishedAt,
      revision: 7,
    });

    const result = await publishMemorial(
      { repository: repo.value, resolveMedia: recordingResolver().resolve },
      { memorialId: MEMORIAL_ID, ownerId: OWNER_ID, expectedRevision: 7 },
    );

    expect(result.ok && result.firstPublishedAt).toBe(firstPublishedAt);
    expect(repo.commitPublication).toHaveBeenCalledWith(
      expect.objectContaining({ expectedStatus: "editing", expectedFirstPublishedAt: firstPublishedAt }),
    );
  });

  it.each([
    ["draft", null],
    ["published", "2026-10-01T10:00:00Z"],
    ["archived", "2026-10-01T10:00:00Z"],
    ["ready", "2026-10-01T10:00:00Z"],
    ["editing", null],
  ] as const)("refuses the incoherent or forbidden %s lifecycle", async (status, firstPublishedAt) => {
    const repo = repository(snapshot({ status, firstPublishedAt }));
    await expect(
      publishMemorial(
        { repository: repo.value, resolveMedia: recordingResolver().resolve },
        { memorialId: MEMORIAL_ID, ownerId: OWNER_ID, expectedRevision: 7 },
      ),
    ).resolves.toEqual({ ok: false, code: "invalid_transition" });
    expect(repo.commitPublication).not.toHaveBeenCalled();
  });

  it.each([
    ["missing language", { language: null }],
    ["missing slug", { slug: null }],
    ["unassemblable Hero", { draft: { content: {} as MemorialContent, updatedAt: "t", revision: 7 } }],
  ])("refuses %s instead of inventing publication data", async (_label, override) => {
    const repo = repository(snapshot(override));
    await expect(
      publishMemorial(
        { repository: repo.value, resolveMedia: recordingResolver().resolve },
        { memorialId: MEMORIAL_ID, ownerId: OWNER_ID, expectedRevision: 7 },
      ),
    ).resolves.toEqual({ ok: false, code: "not_publishable" });
    expect(repo.commitPublication).not.toHaveBeenCalled();
  });

  describe("QG 008 — the server projection is what gets published", () => {
    function mediaId(index: number): string {
      return `00000000-0000-4000-8000-${index.toString().padStart(12, "0")}`;
    }

    function preparedDraft(photos: number): MemorialContent {
      return {
        ...fullAnnouncement(),
        gallery: {
          items: Array.from({ length: photos }, (_, index) => ({ mediaId: mediaId(index + 1), caption: `Photo ${index + 1}` })),
        },
        video: { items: [{ url: "https://vimeo.com/1" }] },
        testimonials: { enabled: true },
      } as MemorialContent;
    }

    async function publish(accessLevel: unknown, content: MemorialContent, gallerySelection?: unknown) {
      const repo = repository(snapshot({ accessLevel, draft: { content, updatedAt: "t", revision: 7 } }));
      const result = await publishMemorial(
        { repository: repo.value, resolveMedia: recordingResolver().resolve },
        { memorialId: MEMORIAL_ID, ownerId: OWNER_ID, expectedRevision: 7, gallerySelection },
      );
      return { result, repo };
    }

    it("publishes a free notice without the premium content prepared in its draft", async () => {
      const draft = preparedDraft(4);
      const { result, repo } = await publish("avis", draft);

      expect(result.ok).toBe(true);
      const commit = repo.commitPublication.mock.calls[0][0];
      expect(commit.expectedAccessLevel).toBe("avis");
      expect(commit.expectedContent).toBe(draft);
      expect(commit.publishedContent).not.toHaveProperty("video");
      expect(commit.publishedContent).not.toHaveProperty("testimonials");
      expect((commit.publishedContent.gallery as { items: unknown[] }).items).toHaveLength(4);
    });

    it("never lets a free projection hold a key the database would refuse", async () => {
      const { repo } = await publish("avis", preparedDraft(3));
      const { AVIS_SNAPSHOT_KEYS } = await import("./publication-policy");
      const keys = Object.keys(repo.commitPublication.mock.calls[0][0].publishedContent);
      expect(keys.every((key) => (AVIS_SNAPSHOT_KEYS as readonly string[]).includes(key))).toBe(true);
    });

    it("requires the family's choice of six photos above six, without touching the draft", async () => {
      const draft = preparedDraft(8);
      const { result, repo } = await publish("avis", draft);

      expect(result).toEqual({
        ok: false,
        code: "publication_policy_refused",
        policy: { code: "gallery_selection_required" },
      });
      expect(repo.commitPublication).not.toHaveBeenCalled();
      expect((draft.gallery as { items: unknown[] }).items).toHaveLength(8);
    });

    it("publishes exactly the six chosen photos, in the chosen order", async () => {
      const chosen = [6, 1, 2, 3, 4, 5].map(mediaId);
      const { result, repo } = await publish("avis", preparedDraft(8), chosen);

      expect(result.ok).toBe(true);
      const items = (repo.commitPublication.mock.calls[0][0].publishedContent.gallery as { items: Array<{ mediaId: string }> }).items;
      expect(items.map((item) => item.mediaId)).toEqual(chosen);
    });

    it("refuses a seventh chosen photo before any write", async () => {
      const { result, repo } = await publish("avis", preparedDraft(8), [1, 2, 3, 4, 5, 6, 7].map(mediaId));
      expect(result).toMatchObject({ ok: false, code: "publication_policy_refused", policy: { code: "too_many_gallery_media" } });
      expect(repo.commitPublication).not.toHaveBeenCalled();
    });

    it("keeps the prepared photos for a complete memorial (videos stay unpublished until operational)", async () => {
      const { result, repo } = await publish("complet", preparedDraft(8));
      expect(result.ok).toBe(true);
      const commit = repo.commitPublication.mock.calls[0][0];
      expect(commit.expectedAccessLevel).toBe("complet");
      expect((commit.publishedContent.gallery as { items: unknown[] }).items).toHaveLength(8);
    });

    it.each([null, "premium", undefined])("fails closed on an unknown stored access level (%s)", async (accessLevel) => {
      const { result, repo } = await publish(accessLevel, preparedDraft(2));
      expect(result).toEqual({ ok: false, code: "publication_policy_refused", policy: { code: "unsupported_access_level" } });
      expect(repo.commitPublication).not.toHaveBeenCalled();
    });

    it.each([
      "free_requires_verified_save",
      "free_window_closed",
      "free_quota_reached",
      "free_content_refused",
    ] as const)("reports the database's %s refusal without retrying", async (refusal) => {
      const repo = repository(snapshot({ accessLevel: "avis" }));
      repo.commitPublication.mockRejectedValue(new FreePublicationRefusedError(refusal));
      await expect(
        publishMemorial(
          { repository: repo.value, resolveMedia: recordingResolver().resolve },
          { memorialId: MEMORIAL_ID, ownerId: OWNER_ID, expectedRevision: 7 },
        ),
      ).resolves.toEqual({ ok: false, code: refusal });
      expect(repo.commitPublication).toHaveBeenCalledOnce();
    });

    it("does not swallow any other failure", async () => {
      const repo = repository(snapshot({ accessLevel: "avis" }));
      repo.commitPublication.mockRejectedValue(new Error("network"));
      await expect(
        publishMemorial(
          { repository: repo.value, resolveMedia: recordingResolver().resolve },
          { memorialId: MEMORIAL_ID, ownerId: OWNER_ID, expectedRevision: 7 },
        ),
      ).rejects.toThrow("network");
    });
  });
});
