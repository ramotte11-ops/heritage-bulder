import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MemorialEditConflictError } from "@/lib/adapters/memorial-edit-repository";
import { SupabaseMemorialEditRepository } from "./memorial-edit-repository";

function readClient(input: { memorial: unknown; draft: unknown; memorialError?: unknown; draftError?: unknown }) {
  const from = vi.fn((table: string) => {
    const isMemorial = table === "memorials";
    const maybeSingle = vi.fn().mockResolvedValue({
      data: isMemorial ? input.memorial : input.draft,
      error: isMemorial ? (input.memorialError ?? null) : (input.draftError ?? null),
    });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    return { select };
  });
  return { client: { from } as unknown as SupabaseClient, from };
}

const MEMORIAL_ROW = {
  status: "published",
  first_published_at: "2026-10-01T10:00:00Z",
  language: "fr",
  skin_id: "intemporel",
  skin_variant: "light",
};
const DRAFT_ROW = {
  content: { personWords: { text: "Une vie" } },
  updated_at: "2026-10-18T10:00:00Z",
  revision: 11,
};

describe("SupabaseMemorialEditRepository.load", () => {
  it("loads lifecycle, first publication and the draft revision through the session client", async () => {
    const read = readClient({ memorial: MEMORIAL_ROW, draft: DRAFT_ROW });
    const repository = new SupabaseMemorialEditRepository(read.client, {} as SupabaseClient);

    await expect(repository.load("memorial-a")).resolves.toEqual({
      status: "published",
      firstPublishedAt: "2026-10-01T10:00:00Z",
      language: "fr",
      skin: "intemporel",
      skinVariant: "light",
      draft: { content: DRAFT_ROW.content, updatedAt: DRAFT_ROW.updated_at, revision: 11 },
    });
    expect(read.from).toHaveBeenCalledWith("memorials");
    expect(read.from).toHaveBeenCalledWith("memorial_drafts");
  });

  it("returns null on a missing/RLS-hidden row and propagates real read failures", async () => {
    const missing = readClient({ memorial: null, draft: DRAFT_ROW });
    await expect(new SupabaseMemorialEditRepository(missing.client, {} as SupabaseClient).load("x")).resolves.toBeNull();

    const failed = readClient({ memorial: null, draft: DRAFT_ROW, memorialError: { message: "network" } });
    await expect(new SupabaseMemorialEditRepository(failed.client, {} as SupabaseClient).load("x")).rejects.toMatchObject({ message: "network" });
  });
});

describe("SupabaseMemorialEditRepository atomic commits", () => {
  it("sends every CAS and audit fact to the draft RPC and returns its durable result", async () => {
    const single = vi.fn().mockResolvedValue({
      data: { updated_at: "2026-10-18T10:01:00Z", revision: 12 },
      error: null,
    });
    const rpc = vi.fn().mockReturnValue({ single });
    const repository = new SupabaseMemorialEditRepository({} as SupabaseClient, { rpc } as unknown as SupabaseClient);

    await expect(
      repository.commitDraft({
        memorialId: "memorial-a",
        ownerId: "owner-a",
        expectedRevision: 11,
        expectedStatus: "published",
        expectedFirstPublishedAt: "2026-10-01T10:00:00Z",
        content: DRAFT_ROW.content as unknown as Parameters<typeof repository.commitDraft>[0]["content"],
        operation: "content.saved",
        mutationTargets: ["content.personWords.text"],
      }),
    ).resolves.toEqual({ updatedAt: "2026-10-18T10:01:00Z", revision: 12 });

    expect(rpc).toHaveBeenCalledWith("commit_memorial_draft_edit_v1", {
      p_memorial_id: "memorial-a",
      p_owner_id: "owner-a",
      p_expected_revision: 11,
      p_expected_status: "published",
      p_expected_first_published_at: "2026-10-01T10:00:00Z",
      p_content: DRAFT_ROW.content,
      p_operation: "content.saved",
      p_mutation_targets: ["content.personWords.text"],
    });
  });

  it("turns SQLSTATE 40001 into a detectable conflict without retrying", async () => {
    const single = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "40001", message: "memorial draft changed" },
    });
    const rpc = vi.fn().mockReturnValue({ single });
    const repository = new SupabaseMemorialEditRepository({} as SupabaseClient, { rpc } as unknown as SupabaseClient);

    await expect(
      repository.commitDraft({
        memorialId: "memorial-a",
        ownerId: "owner-a",
        expectedRevision: 1,
        expectedStatus: "draft",
        expectedFirstPublishedAt: null,
        content: {},
        operation: "content.saved",
        mutationTargets: ["content.gallery.items"],
      }),
    ).rejects.toBeInstanceOf(MemorialEditConflictError);
    expect(rpc).toHaveBeenCalledOnce();
  });

  it("propagates non-conflict database and audit failures", async () => {
    const single = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "23514", message: "audit constraint failed" },
    });
    const rpc = vi.fn().mockReturnValue({ single });
    const repository = new SupabaseMemorialEditRepository({} as SupabaseClient, { rpc } as unknown as SupabaseClient);

    await expect(
      repository.commitDraft({
        memorialId: "memorial-a",
        ownerId: "owner-a",
        expectedRevision: 1,
        expectedStatus: "draft",
        expectedFirstPublishedAt: null,
        content: {},
        operation: "content.saved",
        mutationTargets: ["content.gallery.items"],
      }),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("uses the configuration RPC with lifecycle CAS facts", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const repository = new SupabaseMemorialEditRepository({} as SupabaseClient, { rpc } as unknown as SupabaseClient);
    await repository.commitConfiguration({
      memorialId: "memorial-a",
      ownerId: "owner-a",
      expectedStatus: "draft",
      expectedFirstPublishedAt: null,
      target: "language",
      expectedValue: "fr",
      value: "en",
      mutationTargets: ["configuration.language"],
    });
    expect(rpc).toHaveBeenCalledWith("commit_memorial_configuration_edit_v1", expect.objectContaining({
      p_target: "language",
      p_expected_value: "fr",
      p_value: "en",
      p_expected_status: "draft",
      p_expected_first_published_at: null,
    }));
  });
});
