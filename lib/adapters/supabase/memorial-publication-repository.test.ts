import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FreePublicationRefusedError } from "@/lib/memorial/publish-memorial";
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
          access_level: "avis",
        },
        { content: { hero: { displayName: "Jeanne" } }, updated_at: "t", revision: 7 },
      ),
      {} as SupabaseClient,
    );

    await expect(repository.load("memorial-a")).resolves.toMatchObject({
      status: "ready",
      firstPublishedAt: null,
      slug: "jeanne-martin",
      accessLevel: "avis",
      draft: { revision: 7, content: { hero: { displayName: "Jeanne" } } },
    });
  });

  it("passes owner, lifecycle, level, revision, exact draft and projection to the atomic publication RPC (v2)", async () => {
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
        expectedLanguage: "fr",
        expectedSkin: "intemporel",
        expectedSkinVariant: "light",
        expectedSlug: "jeanne-martin",
        expectedAccessLevel: "avis",
        expectedContent: { hero: { displayName: "Jeanne" }, video: { items: [] } },
        publishedContent: { hero: { displayName: "Jeanne" } },
      }),
    ).resolves.toEqual({ publishedAt: "published", firstPublishedAt: "first", revision: 7 });
    expect(rpc).toHaveBeenCalledWith("commit_memorial_publication_v2", {
      p_memorial_id: "memorial-a",
      p_owner_id: "owner-a",
      p_expected_revision: 7,
      p_expected_status: "ready",
      p_expected_first_published_at: null,
      p_expected_language: "fr",
      p_expected_skin: "intemporel",
      p_expected_skin_variant: "light",
      p_expected_slug: "jeanne-martin",
      p_expected_access_level: "avis",
      p_expected_content: { hero: { displayName: "Jeanne" }, video: { items: [] } },
      p_published_content: { hero: { displayName: "Jeanne" } },
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
        expectedLanguage: "fr",
        expectedSkin: "intemporel",
        expectedSkinVariant: "dark",
        expectedSlug: "memorial",
        expectedAccessLevel: "complet",
        expectedContent: {},
        publishedContent: {},
      }),
    ).rejects.toBeInstanceOf(MemorialPublicationConflictError);
    expect(rpc).toHaveBeenCalledOnce();
  });

  it.each([
    ["HD428", "free publication requires a confirmed e-mail", "free_requires_verified_save"],
    ["HD410", "free publication window closed", "free_window_closed"],
    ["HD403", "free publication quota reached", "free_quota_reached"],
    ["HD403", "free publication cannot include video", "free_content_refused"],
    ["HD413", "free gallery limit reached", "free_content_refused"],
  ])("maps the free-publication refusal %s (%s) to %s", async (code, message, refusal) => {
    const single = vi.fn().mockResolvedValue({ data: null, error: { code, message } });
    const repository = new SupabaseMemorialPublicationRepository(
      {} as SupabaseClient,
      { rpc: vi.fn().mockReturnValue({ single }) } as unknown as SupabaseClient,
    );

    const failure = repository.commitPublication({
      memorialId: "m",
      ownerId: "o",
      expectedRevision: 1,
      expectedStatus: "ready",
      expectedFirstPublishedAt: null,
      expectedLanguage: "fr",
      expectedSkin: "intemporel",
      expectedSkinVariant: "light",
      expectedSlug: "memorial",
      expectedAccessLevel: "avis",
      expectedContent: {},
      publishedContent: {},
    });
    await expect(failure).rejects.toBeInstanceOf(FreePublicationRefusedError);
    await expect(failure).rejects.toMatchObject({ refusal });
  });
});

describe("SupabaseMemorialPublicationRepository — QG 008 Lot 3 v4 (commit_memorial_publication_v4)", () => {
  const commit = {
    memorialId: "memorial-a",
    ownerId: "owner-a",
    expectedRevision: 7,
    expectedLanguage: "fr" as const,
    expectedSkin: "intemporel" as const,
    expectedSkinVariant: "light" as const,
    expectedSlug: "jeanne-martin",
    expectedAccessLevel: "avis" as const,
    expectedContent: { hero: { displayName: "Jeanne" } },
    publishedContent: { hero: { displayName: "Jeanne" } },
  };
  function writeClient(answer: unknown) {
    const single = vi.fn().mockResolvedValue(answer);
    const rpc = vi.fn().mockReturnValue({ single });
    return { client: { rpc } as unknown as SupabaseClient, rpc };
  }

  it("calls v4 (draft → published in one transaction) with exactly the expected values — no status parameter", async () => {
    const write = writeClient({ data: { published_at: "p", first_published_at: "f", revision: 7, outcome: "published", slug: "jeanne-martin" }, error: null });
    const repository = new SupabaseMemorialPublicationRepository({} as SupabaseClient, write.client);
    await expect(repository.commitFirstPublication(commit)).resolves.toEqual({ outcome: "published", publishedAt: "p", firstPublishedAt: "f", revision: 7, slug: "jeanne-martin" });
    expect(write.rpc).toHaveBeenCalledExactlyOnceWith("commit_memorial_publication_v4", {
      p_memorial_id: "memorial-a",
      p_owner_id: "owner-a",
      p_expected_revision: 7,
      p_expected_language: "fr",
      p_expected_skin: "intemporel",
      p_expected_skin_variant: "light",
      p_expected_slug: "jeanne-martin",
      p_expected_access_level: "avis",
      p_expected_content: { hero: { displayName: "Jeanne" } },
      p_published_content: { hero: { displayName: "Jeanne" } },
    });
  });

  it("a memorial without slug: p_expected_slug is NULL and the slug generated by the database is returned", async () => {
    const write = writeClient({ data: { published_at: "p", first_published_at: "f", revision: 7, outcome: "published", slug: "10d63bbb38ba" }, error: null });
    const repository = new SupabaseMemorialPublicationRepository({} as SupabaseClient, write.client);
    await expect(repository.commitFirstPublication({ ...commit, expectedSlug: null })).resolves.toMatchObject({ outcome: "published", slug: "10d63bbb38ba" });
    expect(write.rpc).toHaveBeenCalledExactlyOnceWith("commit_memorial_publication_v4", expect.objectContaining({ p_expected_slug: null }));
  });

  it.each([[undefined], [""], ["  "], [42]])("refuses a missing or blank returned slug (%s) instead of guessing", async (slug) => {
    const write = writeClient({ data: { published_at: "p", first_published_at: "f", revision: 7, outcome: "published", slug }, error: null });
    const repository = new SupabaseMemorialPublicationRepository({} as SupabaseClient, write.client);
    await expect(repository.commitFirstPublication(commit)).rejects.toThrow("Unexpected publication slug.");
  });

  it("returns already_published only when the database says so", async () => {
    const write = writeClient({ data: { published_at: "p", first_published_at: "f", revision: 7, outcome: "already_published", slug: "jeanne-martin" }, error: null });
    const repository = new SupabaseMemorialPublicationRepository({} as SupabaseClient, write.client);
    await expect(repository.commitFirstPublication(commit)).resolves.toMatchObject({ outcome: "already_published" });
  });

  it("refuses an unknown outcome instead of guessing a success", async () => {
    const write = writeClient({ data: { published_at: "p", first_published_at: "f", revision: 7, outcome: "maybe", slug: "jeanne-martin" }, error: null });
    const repository = new SupabaseMemorialPublicationRepository({} as SupabaseClient, write.client);
    await expect(repository.commitFirstPublication(commit)).rejects.toThrow("Unexpected publication outcome.");
  });

  it.each([
    ["HD422", "hero photo required", "HERO_PHOTO_REQUIRED"],
    ["23514", "published gallery must come from the draft", "MEMORIAL_PUBLICATION_REJECTED"],
    ["40001", "memorial lifecycle changed", "MEMORIAL_PUBLICATION_CONFLICT"],
  ])("maps %s to its own error", async (code, message, expected) => {
    const write = writeClient({ data: null, error: { code, message, details: "", hint: "" } });
    const repository = new SupabaseMemorialPublicationRepository({} as SupabaseClient, write.client);
    await expect(repository.commitFirstPublication(commit)).rejects.toMatchObject({ code: expected });
  });

  it.each([
    ["HD410", "free publication window closed", "free_window_closed"],
    ["HD403", "free publication quota reached", "free_quota_reached"],
    ["HD413", "free gallery limit reached", "free_content_refused"],
    ["HD428", "free publication requires a confirmed e-mail", "free_requires_verified_save"],
  ])("keeps the V8 free refusals (%s)", async (code, message, refusal) => {
    const write = writeClient({ data: null, error: { code, message, details: "", hint: "" } });
    const repository = new SupabaseMemorialPublicationRepository({} as SupabaseClient, write.client);
    const error = await repository.commitFirstPublication(commit).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FreePublicationRefusedError);
    expect((error as FreePublicationRefusedError).refusal).toBe(refusal);
  });

  it("never retries a conflict", async () => {
    const write = writeClient({ data: null, error: { code: "40001", message: "x", details: "", hint: "" } });
    const repository = new SupabaseMemorialPublicationRepository({} as SupabaseClient, write.client);
    await expect(repository.commitFirstPublication(commit)).rejects.toBeInstanceOf(MemorialPublicationConflictError);
    expect(write.rpc).toHaveBeenCalledOnce();
  });
});
