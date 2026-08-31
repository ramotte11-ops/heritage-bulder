import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseDraftRepository } from "./draft-repository";

/**
 * A minimal fake of Supabase's chainable query builder, covering both
 * shapes this repository uses:
 *   read:  .from(...).select(...).eq(...).maybeSingle()
 *   write: .from(...).update(...).eq(...).select(...).single()
 * Each step but the last returns the same object (mirroring the real
 * builder's fluent API); `.maybeSingle()`/`.single()` resolve with
 * whatever this test configured.
 */
function fakeSupabaseClient(finalResult: { data: unknown; error: unknown }) {
  const maybeSingle = vi.fn().mockResolvedValue(finalResult);
  const single = vi.fn().mockResolvedValue(finalResult);
  const eqAfterSelect = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq: eqAfterSelect, single });
  const eqAfterUpdate = vi.fn().mockReturnValue({ select });
  const update = vi.fn().mockReturnValue({ eq: eqAfterUpdate });
  const from = vi.fn().mockReturnValue({ select, update });

  return {
    client: { from } as unknown as SupabaseClient,
    from,
    select,
    update,
    eqAfterSelect,
    eqAfterUpdate,
    maybeSingle,
    single,
  };
}

describe("SupabaseDraftRepository.getDraftContent", () => {
  it("returns the draft's content and updatedAt when it exists and is reachable", async () => {
    const content = { hero: { title: "Éléonore Vasseur" } };
    const { client, from, select, eqAfterSelect } = fakeSupabaseClient({
      data: { content, updated_at: "2026-01-01T00:00:00.000Z" },
      error: null,
    });
    const repository = new SupabaseDraftRepository(client);

    const result = await repository.getDraftContent("memorial-123");

    expect(from).toHaveBeenCalledWith("memorial_drafts");
    expect(select).toHaveBeenCalledWith("content, updated_at");
    expect(eqAfterSelect).toHaveBeenCalledWith("memorial_id", "memorial-123");
    expect(result).toEqual({ content, updatedAt: "2026-01-01T00:00:00.000Z" });
  });

  it("preserves nested/multi-section JSON content exactly, with no reshaping", async () => {
    const content = {
      hero: { title: "Éléonore Vasseur", subtitle: "1938 — 2026" },
      gallery: { items: [{ url: "a.jpg" }, { url: "b.jpg" }] },
      story: { body: "Une vie pleine.", tags: ["famille", "voyages"] },
    };
    const { client } = fakeSupabaseClient({
      data: { content, updated_at: "2026-01-01T00:00:00.000Z" },
      error: null,
    });
    const repository = new SupabaseDraftRepository(client);

    const result = await repository.getDraftContent("memorial-123");

    expect(result?.content).toEqual(content);
  });

  it("returns null (never an error) when zero rows come back — not found and forbidden are indistinguishable by design", async () => {
    const { client } = fakeSupabaseClient({ data: null, error: null });
    const repository = new SupabaseDraftRepository(client);

    await expect(repository.getDraftContent("not-mine-or-nonexistent")).resolves.toBeNull();
  });

  it("rejects on a genuine Supabase error instead of returning null", async () => {
    const { client } = fakeSupabaseClient({
      data: null,
      error: { message: "connection reset" },
    });
    const repository = new SupabaseDraftRepository(client);

    await expect(repository.getDraftContent("memorial-123")).rejects.toEqual({
      message: "connection reset",
    });
  });
});

describe("SupabaseDraftRepository.saveDraftContent", () => {
  it("writes the full content object to memorial_drafts, scoped by memorial_id", async () => {
    const { client, from, update, eqAfterUpdate } = fakeSupabaseClient({
      data: { updated_at: "2026-01-01T00:00:00.000Z" },
      error: null,
    });
    const repository = new SupabaseDraftRepository(client);

    const content = { hero: { title: "Éléonore Vasseur" } };
    const result = await repository.saveDraftContent("memorial-123", content);

    expect(from).toHaveBeenCalledWith("memorial_drafts");
    expect(update).toHaveBeenCalledWith({ content });
    expect(eqAfterUpdate).toHaveBeenCalledWith("memorial_id", "memorial-123");
    expect(result).toEqual({ updatedAt: "2026-01-01T00:00:00.000Z" });
  });

  it("preserves nested/multi-section JSON content exactly when writing", async () => {
    const { client, update } = fakeSupabaseClient({
      data: { updated_at: "2026-01-01T00:00:00.000Z" },
      error: null,
    });
    const repository = new SupabaseDraftRepository(client);

    const content = {
      hero: { title: "Éléonore Vasseur" },
      gallery: { items: [{ url: "a.jpg" }, { url: "b.jpg" }] },
    };
    await repository.saveDraftContent("memorial-123", content);

    expect(update).toHaveBeenCalledWith({ content });
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
