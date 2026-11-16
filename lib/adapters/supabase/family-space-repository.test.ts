import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseFamilySpaceRepository } from "./family-space-repository";

/** A chainable fake query that resolves to `result` when awaited. */
function query(result: unknown) {
  const calls: [string, unknown[]][] = [];
  const builder: Record<string, unknown> = {
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
  };
  for (const method of ["select", "eq", "in", "order", "range", "returns"]) {
    builder[method] = (...args: unknown[]) => {
      calls.push([method, args]);
      return builder;
    };
  }
  return { builder, calls };
}

function clientOf(tables: Record<string, ReturnType<typeof query>[]>) {
  const from = vi.fn((table: string) => {
    const next = tables[table]?.shift();
    if (!next) throw new Error(`unexpected read of ${table}`);
    return next.builder;
  });
  return { client: { from } as unknown as SupabaseClient, from };
}

const M1 = "11111111-1111-4111-8111-111111111111";
const M2 = "22222222-2222-4222-8222-222222222222";

describe("SupabaseFamilySpaceRepository.listTributeDetails", () => {
  it("reads only id/status for the given owner, then only the Hero object of those drafts", async () => {
    const memorials = query({ data: [{ id: M1, status: "published" }, { id: M2, status: "draft" }], error: null });
    const drafts = query({
      data: [
        {
          memorial_id: M1,
          hero: {
            displayName: "Jeanne", birth: { precision: "year", year: 1948 }, death: { precision: "date", date: "2023-05-01" },
            shortPhrase: null, photo: { mediaId: "media-1", crop: { focalX: 0.5, focalY: 0.3, zoom: 1.2 } },
          },
        },
      ],
      error: null,
    });
    const { client, from } = clientOf({ memorials: [memorials], memorial_drafts: [drafts] });

    const details = await new SupabaseFamilySpaceRepository(client).listTributeDetails("owner-1");

    expect(from.mock.calls.map(([table]) => table)).toEqual(["memorials", "memorial_drafts"]);
    expect(memorials.calls).toContainEqual(["select", ["id, status"]]);
    expect(memorials.calls).toContainEqual(["eq", ["owner_id", "owner-1"]]);
    expect(drafts.calls).toContainEqual(["select", ["memorial_id, hero:content->hero"]]);
    expect(drafts.calls).toContainEqual(["in", ["memorial_id", [M1, M2]]]);
    expect(details.get(M1)).toEqual({
      memorialId: M1, status: "published",
      birth: { precision: "year", year: 1948 }, death: { precision: "date", date: "2023-05-01" },
      photo: { mediaId: "media-1", crop: { focalX: 0.5, focalY: 0.3, zoom: 1.2 } },
    });
    expect(details.get(M2)).toEqual({ memorialId: M2, status: "draft", birth: null, death: null, photo: null });
  });

  it("returns an empty map without a second read when the owner has no tribute", async () => {
    const { client, from } = clientOf({ memorials: [query({ data: [], error: null })] });
    expect((await new SupabaseFamilySpaceRepository(client).listTributeDetails("owner-1")).size).toBe(0);
    expect(from).toHaveBeenCalledTimes(1);
  });

  it("rejects when the status read fails", async () => {
    const { client } = clientOf({ memorials: [query({ data: null, error: new Error("denied") })] });
    await expect(new SupabaseFamilySpaceRepository(client).listTributeDetails("owner-1")).rejects.toThrow("denied");
  });

  it("keeps the statuses when only the Hero read fails, and ignores an unknown status or a corrupted Hero", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failing = clientOf({
      memorials: [query({ data: [{ id: M1, status: "editing" }], error: null })],
      memorial_drafts: [query({ data: null, error: new Error("boom") })],
    });
    expect((await new SupabaseFamilySpaceRepository(failing.client).listTributeDetails("o")).get(M1)).toMatchObject({
      status: "editing", photo: null,
    });
    error.mockRestore();

    const corrupted = clientOf({
      memorials: [query({ data: [{ id: M1, status: "something-else" }], error: null })],
      memorial_drafts: [query({ data: [{ memorial_id: M1, hero: { photo: "not-an-object" } }, { memorial_id: "foreign", hero: {} }], error: null })],
    });
    const details = await new SupabaseFamilySpaceRepository(corrupted.client).listTributeDetails("o");
    expect(details.get(M1)).toEqual({ memorialId: M1, status: null, birth: null, death: null, photo: null });
    expect(details.has("foreign")).toBe(false);
  });
});

describe("SupabaseFamilySpaceRepository — symbolic offerings", () => {
  it("counts each gesture of ONE tribute with an exact head count", async () => {
    const queries = [query({ count: 7, error: null }), query({ count: 9, error: null }), query({ count: null, error: null })];
    const { client } = clientOf({ symbolic_offerings: [...queries] });

    const counts = await new SupabaseFamilySpaceRepository(client).countOfferings(M1);

    expect(counts).toEqual({ bougie: 7, lys: 9, coeur: 0 });
    for (const [index, kind] of (["bougie", "lys", "coeur"] as const).entries()) {
      expect(queries[index].calls).toContainEqual(["select", ["id", { count: "exact", head: true }]]);
      expect(queries[index].calls).toContainEqual(["eq", ["memorial_id", M1]]);
      expect(queries[index].calls).toContainEqual(["eq", ["kind", kind]]);
    }
  });

  it("rejects when a count fails — never a zero standing in for an error", async () => {
    const { client } = clientOf({
      symbolic_offerings: [query({ count: 1, error: null }), query({ count: null, error: new Error("denied") }), query({ count: 1, error: null })],
    });
    await expect(new SupabaseFamilySpaceRepository(client).countOfferings(M1)).rejects.toThrow("denied");
  });

  it("lists the gestures newest first, one page at a time, reading nothing but id, kind, date and the Lot 2 signature", async () => {
    const rows = [
      { id: "o3", kind: "lys", created_at: "2026-11-15T09:00:00.000Z", signature: "Marie" },
      { id: "o2", kind: "bougie", created_at: "2026-11-12T09:00:00.000Z", signature: null },
      { id: "o1", kind: "coeur", created_at: "2026-11-10T09:00:00.000Z", signature: null },
    ];
    const list = query({ data: rows, error: null });
    const { client } = clientOf({ symbolic_offerings: [list] });

    const page = await new SupabaseFamilySpaceRepository(client).listOfferings(M1, { offset: 4, limit: 2 });

    // Never the idempotency key (Lot 2: not even readable by the family any more).
    expect(list.calls).toContainEqual(["select", ["id, kind, created_at, signature"]]);
    expect(list.calls).toContainEqual(["eq", ["memorial_id", M1]]);
    expect(list.calls).toContainEqual(["order", ["created_at", { ascending: false }]]);
    expect(list.calls).toContainEqual(["range", [4, 6]]);
    expect(page).toEqual({
      offerings: [
        { id: "o3", kind: "lys", createdAt: "2026-11-15T09:00:00.000Z", signature: "Marie" },
        { id: "o2", kind: "bougie", createdAt: "2026-11-12T09:00:00.000Z", signature: null },
      ],
      hasMore: true,
    });
  });

  it("drops an unknown kind and reports no further page at the end", async () => {
    const { client } = clientOf({
      symbolic_offerings: [query({ data: [{ id: "o1", kind: "rose", created_at: "x" }, { id: "o2", kind: "coeur", created_at: "y" }], error: null })],
    });
    expect(await new SupabaseFamilySpaceRepository(client).listOfferings(M1, { offset: 0, limit: 30 })).toEqual({
      offerings: [{ id: "o2", kind: "coeur", createdAt: "y", signature: null }],
      hasMore: false,
    });
  });

  it("Lot 2: a missing, blank or non-text signature is an anonymous gesture", async () => {
    const { client } = clientOf({
      symbolic_offerings: [
        query({
          data: [
            { id: "o1", kind: "lys", created_at: "x", signature: "   " },
            { id: "o2", kind: "coeur", created_at: "y", signature: 42 },
            { id: "o3", kind: "bougie", created_at: "z" },
          ],
          error: null,
        }),
      ],
    });
    const page = await new SupabaseFamilySpaceRepository(client).listOfferings(M1, { offset: 0, limit: 30 });
    expect(page.offerings.map((o) => o.signature)).toEqual([null, null, null]);
  });
});
