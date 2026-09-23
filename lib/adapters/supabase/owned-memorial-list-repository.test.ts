import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseOwnedMemorialListRepository } from "./owned-memorial-list-repository";

/**
 * Builder continuity mission. Same fake-query-builder technique as
 * memorial-config-repository.test.ts, one fake per table this class
 * reads: `memorials` (`select → eq → order → returns`) and
 * `memorial_drafts` (`select → in → returns`).
 */
function fakeClient(
  memorials: { data: unknown; error: unknown },
  drafts: { data: unknown; error: unknown } = { data: [], error: null },
) {
  const memorialsQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    returns: vi.fn().mockResolvedValue(memorials),
  };
  memorialsQuery.select.mockReturnValue(memorialsQuery);
  memorialsQuery.eq.mockReturnValue(memorialsQuery);
  memorialsQuery.order.mockReturnValue(memorialsQuery);

  const draftsQuery = {
    select: vi.fn(),
    in: vi.fn(),
    returns: vi.fn().mockResolvedValue(drafts),
  };
  draftsQuery.select.mockReturnValue(draftsQuery);
  draftsQuery.in.mockReturnValue(draftsQuery);

  const from = vi.fn((table: string) => (table === "memorials" ? memorialsQuery : draftsQuery));
  return { client: { from } as unknown as SupabaseClient, from, memorialsQuery, draftsQuery };
}

const M1 = { id: "11111111-1111-4111-8111-111111111111", created_at: "2026-09-20T10:00:00.000Z" };
const M2 = { id: "22222222-2222-4222-8222-222222222222", created_at: "2026-09-21T10:00:00.000Z" };

describe("SupabaseOwnedMemorialListRepository.listOwnedMemorials", () => {
  it("filters memorials by the given owner, reads id/created_at only, oldest first", async () => {
    const { client, memorialsQuery } = fakeClient({ data: [M1], error: null });

    await new SupabaseOwnedMemorialListRepository(client).listOwnedMemorials("owner-1");

    expect(memorialsQuery.select).toHaveBeenCalledWith("id, created_at");
    expect(memorialsQuery.eq).toHaveBeenCalledWith("owner_id", "owner-1");
    expect(memorialsQuery.order).toHaveBeenCalledWith("created_at", { ascending: true });
  });

  it("reads only the Hero display name from the drafts, never the draft content itself", async () => {
    const { client, draftsQuery } = fakeClient(
      { data: [M1, M2], error: null },
      { data: [{ memorial_id: M1.id, display_name: "  Jeanne Martin " }], error: null },
    );

    const result = await new SupabaseOwnedMemorialListRepository(client).listOwnedMemorials("owner-1");

    expect(draftsQuery.select).toHaveBeenCalledWith("memorial_id, display_name:content->hero->>displayName");
    expect(draftsQuery.in).toHaveBeenCalledWith("memorial_id", [M1.id, M2.id]);
    expect(result).toEqual([
      { id: M1.id, displayName: "Jeanne Martin", createdAt: M1.created_at },
      { id: M2.id, displayName: null, createdAt: M2.created_at },
    ]);
  });

  it("returns [] without a second read when the Owner has no memorial", async () => {
    const { client, from } = fakeClient({ data: [], error: null });

    expect(await new SupabaseOwnedMemorialListRepository(client).listOwnedMemorials("owner-1")).toEqual([]);
    expect(from).toHaveBeenCalledTimes(1);
  });

  it("rejects on a memorials read failure — never an empty list standing in for an error", async () => {
    const failure = { message: "permission denied for table memorials" };
    const { client } = fakeClient({ data: null, error: failure });

    await expect(new SupabaseOwnedMemorialListRepository(client).listOwnedMemorials("owner-1")).rejects.toBe(failure);
  });

  it("still returns the memorials (names null) when only the name read fails — the family can still reach them", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = fakeClient({ data: [M1], error: null }, { data: null, error: { message: "boom" } });

    const result = await new SupabaseOwnedMemorialListRepository(client).listOwnedMemorials("owner-1");

    expect(result).toEqual([{ id: M1.id, displayName: null, createdAt: M1.created_at }]);
    errorSpy.mockRestore();
  });

  it("ignores a non-string or blank stored name", async () => {
    const { client } = fakeClient(
      { data: [M1, M2], error: null },
      {
        data: [
          { memorial_id: M1.id, display_name: "   " },
          { memorial_id: M2.id, display_name: 42 },
        ],
        error: null,
      },
    );

    const result = await new SupabaseOwnedMemorialListRepository(client).listOwnedMemorials("owner-1");

    expect(result.map((m) => m.displayName)).toEqual([null, null]);
  });
});
