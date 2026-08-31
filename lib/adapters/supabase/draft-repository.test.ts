import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseDraftRepository } from "./draft-repository";

/**
 * A minimal fake of Supabase's chainable query builder:
 * `.from(...).update(...).eq(...).select(...).single()`. Each step but
 * the last returns the same object (mirroring the real builder's
 * fluent API); `.single()` resolves with whatever this test configured.
 */
function fakeSupabaseClient(singleResult: { data: unknown; error: unknown }) {
  const single = vi.fn().mockResolvedValue(singleResult);
  const select = vi.fn().mockReturnValue({ single });
  const eq = vi.fn().mockReturnValue({ select });
  const update = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ update });

  return { client: { from } as unknown as SupabaseClient, from, update, eq, select, single };
}

describe("SupabaseDraftRepository.saveDraftContent", () => {
  it("writes the full content object to memorial_drafts, scoped by memorial_id", async () => {
    const { client, from, update, eq } = fakeSupabaseClient({
      data: { updated_at: "2026-01-01T00:00:00.000Z" },
      error: null,
    });
    const repository = new SupabaseDraftRepository(client);

    const content = { hero: { title: "Éléonore Vasseur" } };
    const result = await repository.saveDraftContent("memorial-123", content);

    expect(from).toHaveBeenCalledWith("memorial_drafts");
    expect(update).toHaveBeenCalledWith({ content });
    expect(eq).toHaveBeenCalledWith("memorial_id", "memorial-123");
    expect(result).toEqual({ updatedAt: "2026-01-01T00:00:00.000Z" });
  });

  it("rejects rather than silently succeeding when Postgres/PostgREST reports an error", async () => {
    const { client } = fakeSupabaseClient({
      data: null,
      error: { message: "no rows returned" },
    });
    const repository = new SupabaseDraftRepository(client);

    await expect(repository.saveDraftContent("memorial-123", {})).rejects.toEqual({
      message: "no rows returned",
    });
  });

  it("never invents a false success for a memorial that isn't the caller's own — RLS surfaces as this same error path, never a resolved promise with someone else's data", async () => {
    // Exactly what a wrong-owner update looks like once RLS blocks it:
    // zero rows match, .single() has nothing to return, PostgREST
    // reports it as an error rather than an empty success.
    const { client } = fakeSupabaseClient({
      data: null,
      error: { message: "JSON object requested, multiple (or no) rows returned" },
    });
    const repository = new SupabaseDraftRepository(client);

    await expect(repository.saveDraftContent("not-my-memorial", {})).rejects.toBeTruthy();
  });
});
