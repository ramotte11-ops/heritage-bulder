import { describe, expect, it, vi } from "vitest";
import type { MemorialContent } from "@/types/memorial";
import { fullAnnouncement, recordingResolver } from "@/lib/memorial/assembly/test-fixtures";
import { publishMemorial, type MemorialPublicationRepository } from "./publish-memorial";

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
      expectedContent: expect.any(Object) as MemorialContent,
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
});
