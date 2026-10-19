import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MemorialPublicationConflictError, SupabaseMemorialPublicationRepository } from "./memorial-publication-repository";

function readClient(memorial: unknown, draft: unknown) {
  const from = vi.fn((table: string) => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: table === "memorials" ? memorial : draft, error: null });
    return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle }) }) };
  });
  return { from } as unknown as SupabaseClient;
}

describe("SupabaseMemorialPublicationRepository", () => {
  it("loads every durable publication fact and the exact draft revision", async () => {
    const repository = new SupabaseMemorialPublicationRepository(
      readClient(
        {
          status: "ready",
          first_published_at: null,
          language: "fr",
          skin_id: "intemporel",
          skin_variant: "light",
          slug: "jeanne-martin",
        },
        { content: { hero: { displayName: "Jeanne" } }, updated_at: "t", revision: 7 },
      ),
      {} as SupabaseClient,
    );

    await expect(repository.load("memorial-a")).resolves.toMatchObject({
      status: "ready",
      firstPublishedAt: null,
      slug: "jeanne-martin",
      draft: { revision: 7, content: { hero: { displayName: "Jeanne" } } },
    });
  });

  it("passes owner, lifecycle, revision and exact content to the atomic publication RPC", async () => {
    const single = vi.fn().mockResolvedValue({
      data: { published_at: "published", first_published_at: "first", revision: 7 },
      error: null,
    });
    const rpc = vi.fn().mockReturnValue({ single });
    const repository = new SupabaseMemorialPublicationRepository(
      {} as SupabaseClient,
      { rpc } as unknown as SupabaseClient,
    );

    await expect(
      repository.commitPublication({
        memorialId: "memorial-a",
        ownerId: "owner-a",
        expectedRevision: 7,
        expectedStatus: "ready",
        expectedFirstPublishedAt: null,
        expectedContent: { hero: { displayName: "Jeanne" } },
      }),
    ).resolves.toEqual({ publishedAt: "published", firstPublishedAt: "first", revision: 7 });
    expect(rpc).toHaveBeenCalledWith("commit_memorial_publication_v1", {
      p_memorial_id: "memorial-a",
      p_owner_id: "owner-a",
      p_expected_revision: 7,
      p_expected_status: "ready",
      p_expected_first_published_at: null,
      p_expected_content: { hero: { displayName: "Jeanne" } },
    });
  });

  it("maps serialization failures to a publication conflict and never retries", async () => {
    const single = vi.fn().mockResolvedValue({ data: null, error: { code: "40001", message: "changed" } });
    const rpc = vi.fn().mockReturnValue({ single });
    const repository = new SupabaseMemorialPublicationRepository(
      {} as SupabaseClient,
      { rpc } as unknown as SupabaseClient,
    );

    await expect(
      repository.commitPublication({
        memorialId: "m",
        ownerId: "o",
        expectedRevision: 1,
        expectedStatus: "editing",
        expectedFirstPublishedAt: "first",
        expectedContent: {},
      }),
    ).rejects.toBeInstanceOf(MemorialPublicationConflictError);
    expect(rpc).toHaveBeenCalledOnce();
  });
});
