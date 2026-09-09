import { describe, expect, it, vi } from "vitest";
import { SupabaseMediaRepository } from "./media-repository";

/**
 * Mission 030 — the adapter behind the media engine.
 *
 * This class runs with the service-role client, which bypasses RLS. The
 * only thing standing between it and every family's photographs is what
 * it filters on, so these tests are almost entirely about the WHERE
 * clause: every method must scope to the memorial the caller named, and
 * the finalization must be a compare-and-set rather than a blind write.
 */

interface QueryLog {
  from: string[];
  select: string[];
  eq: [string, unknown][];
  lt: [string, unknown][];
  order: [string, unknown][];
  limit: number[];
  insert: Record<string, unknown>[];
  update: Record<string, unknown>[];
  deletes: number;
}

function client(result: { data: unknown; error: unknown }) {
  const log: QueryLog = {
    from: [],
    select: [],
    eq: [],
    lt: [],
    order: [],
    limit: [],
    insert: [],
    update: [],
    deletes: 0,
  };

  const builder = {
    select(columns: string) {
      log.select.push(columns);
      return builder;
    },
    insert(values: Record<string, unknown>) {
      log.insert.push(values);
      return builder;
    },
    update(values: Record<string, unknown>) {
      log.update.push(values);
      return builder;
    },
    delete() {
      log.deletes += 1;
      return builder;
    },
    eq(column: string, value: unknown) {
      log.eq.push([column, value]);
      return builder;
    },
    lt(column: string, value: unknown) {
      log.lt.push([column, value]);
      return builder;
    },
    order(column: string, options: unknown) {
      log.order.push([column, options]);
      return Object.assign(Promise.resolve(result), builder);
    },
    limit(count: number) {
      log.limit.push(count);
      return Object.assign(Promise.resolve(result), builder);
    },
    single: vi.fn(async () => result),
    maybeSingle: vi.fn(async () => result),
    then: undefined as unknown,
  };

  // The list/delete paths await the builder itself rather than a
  // terminal method, so it has to be thenable.
  builder.then = (resolve: (value: unknown) => unknown) => resolve(result);

  const supabase = {
    from(table: string) {
      log.from.push(table);
      return builder;
    },
    storage: { from: () => ({}) },
  };

  return { supabase, log };
}

function repository(result: { data: unknown; error: unknown }) {
  const { supabase, log } = client(result);
  return {
    repo: new SupabaseMediaRepository(
      supabase as unknown as ConstructorParameters<typeof SupabaseMediaRepository>[0],
    ),
    log,
  };
}

const ROW = {
  id: "media-1",
  memorial_id: "memorial-a",
  owner_id: "owner-a",
  storage_path: "memorial-a/media-1/original.jpg",
  media_type: "photo",
  purpose: "hero",
  status: "ready",
  mime_type: "image/jpeg",
  original_filename: null,
  size_bytes: 2048,
  width: null,
  height: null,
  created_at: "2026-09-09T12:00:00.000Z",
  updated_at: "2026-09-09T12:00:01.000Z",
};

describe("createPending", () => {
  it("writes a pending row with no size and no filename", async () => {
    const { repo, log } = repository({ data: { ...ROW, status: "pending" }, error: null });

    await repo.createPending({
      memorialId: "memorial-a",
      ownerId: "owner-a",
      mediaId: "media-1",
      storagePath: "memorial-a/media-1/original.jpg",
      purpose: "hero",
      declaredMimeType: "image/jpeg",
    });

    const values = log.insert[0];
    expect(values.status).toBe("pending");
    // Absent, not zero: the file does not exist yet, and a placeholder
    // would be a lie the ready-requires-size constraint could not catch.
    expect(values.size_bytes).toBeUndefined();
    // The client's filename is never recorded.
    expect(values.original_filename).toBeUndefined();
  });

  it("records the owner id it was given, having not derived one itself", async () => {
    // The caller passes the VERIFIED owner from the access result.
    const { repo, log } = repository({ data: { ...ROW, status: "pending" }, error: null });

    await repo.createPending({
      memorialId: "memorial-a",
      ownerId: "owner-a",
      mediaId: "media-1",
      storagePath: "memorial-a/media-1/original.jpg",
      purpose: "gallery",
      declaredMimeType: "image/png",
    });

    expect(log.insert[0].owner_id).toBe("owner-a");
    expect(log.insert[0].memorial_id).toBe("memorial-a");
    expect(log.insert[0].media_type).toBe("photo");
  });

  it("throws rather than reporting a reservation that did not happen", async () => {
    // A silent failure here would hand out an upload permission for a
    // path no row records — the one way this design could make an
    // orphan.
    const { repo } = repository({ data: null, error: new Error("insert failed") });

    await expect(
      repo.createPending({
        memorialId: "memorial-a",
        ownerId: "owner-a",
        mediaId: "media-1",
        storagePath: "memorial-a/media-1/original.jpg",
        purpose: "hero",
        declaredMimeType: "image/jpeg",
      }),
    ).rejects.toThrow("insert failed");
  });
});

describe("markReady", () => {
  it("is a compare-and-set: it only matches a row that is still pending", async () => {
    // Without this filter, a second finalization could double-write, or
    // a late one could resurrect a row the sweep had reclaimed.
    const { repo, log } = repository({ data: ROW, error: null });

    await repo.markReady({
      memorialId: "memorial-a",
      mediaId: "media-1",
      mimeType: "image/jpeg",
      sizeBytes: 2048,
    });

    expect(log.eq).toContainEqual(["status", "pending"]);
  });

  it("scopes the update to the caller's memorial", async () => {
    const { repo, log } = repository({ data: ROW, error: null });

    await repo.markReady({
      memorialId: "memorial-a",
      mediaId: "media-1",
      mimeType: "image/jpeg",
      sizeBytes: 2048,
    });

    expect(log.eq).toContainEqual(["memorial_id", "memorial-a"]);
    expect(log.eq).toContainEqual(["id", "media-1"]);
  });

  it("overwrites mime_type with the VERIFIED value", async () => {
    // A ready row's type is measured, never claimed.
    const { repo, log } = repository({ data: ROW, error: null });

    await repo.markReady({
      memorialId: "memorial-a",
      mediaId: "media-1",
      mimeType: "image/png",
      sizeBytes: 999,
    });

    expect(log.update[0]).toMatchObject({
      status: "ready",
      mime_type: "image/png",
      size_bytes: 999,
    });
  });

  it("returns null when it matched nothing, rather than erroring", async () => {
    // Losing the race is an expected outcome, not a fault.
    const { repo } = repository({ data: null, error: null });

    expect(
      await repo.markReady({
        memorialId: "memorial-a",
        mediaId: "media-1",
        mimeType: "image/jpeg",
        sizeBytes: 1,
      }),
    ).toBeNull();
  });
});

describe("findById", () => {
  it("filters on BOTH the media id and the memorial id", async () => {
    // This is what makes "somebody else's media" indistinguishable from
    // "no such media" at the query level.
    const { repo, log } = repository({ data: ROW, error: null });

    await repo.findById({ memorialId: "memorial-a", mediaId: "media-1" });

    expect(log.eq).toContainEqual(["id", "media-1"]);
    expect(log.eq).toContainEqual(["memorial_id", "memorial-a"]);
  });

  it("uses only equality filters, never a pattern operator", async () => {
    // postgrest-js appends values verbatim, so `.like()`/`.ilike()`
    // would let characters inside an id act as wildcards. A real bug at
    // an identity boundary in Mission 011B.
    const { repo, log } = repository({ data: ROW, error: null });

    await repo.findById({ memorialId: "memorial-a", mediaId: "media-1" });

    expect(log.eq.length).toBeGreaterThan(0);
    expect(log.lt).toHaveLength(0);
  });

  it("returns null for a missing row", async () => {
    const { repo } = repository({ data: null, error: null });
    expect(await repo.findById({ memorialId: "memorial-a", mediaId: "x" })).toBeNull();
  });

  it("rethrows a genuine failure instead of reading it as 'not found'", async () => {
    const { repo } = repository({ data: null, error: new Error("connection reset") });
    await expect(
      repo.findById({ memorialId: "memorial-a", mediaId: "media-1" }),
    ).rejects.toThrow("connection reset");
  });

  it("normalizes a bigint size returned as a string", async () => {
    // A string size would make `size > MAX_MEDIA_BYTES` compare
    // lexicographically — a size check that fails open.
    const { repo } = repository({ data: { ...ROW, size_bytes: "99999999" }, error: null });

    const media = await repo.findById({ memorialId: "memorial-a", mediaId: "media-1" });

    expect(media?.sizeBytes).toBe(99999999);
    expect(typeof media?.sizeBytes).toBe("number");
  });

  it("maps a null size for a pending row", async () => {
    const { repo } = repository({
      data: { ...ROW, status: "pending", size_bytes: null },
      error: null,
    });

    const media = await repo.findById({ memorialId: "memorial-a", mediaId: "media-1" });

    expect(media?.sizeBytes).toBeNull();
    expect(media?.status).toBe("pending");
  });
});

describe("listForMemorial", () => {
  it("always scopes to the memorial", async () => {
    const { repo, log } = repository({ data: [ROW], error: null });

    await repo.listForMemorial({ memorialId: "memorial-a" });

    expect(log.eq).toContainEqual(["memorial_id", "memorial-a"]);
  });

  it("adds purpose and status filters only when asked", async () => {
    const { repo, log } = repository({ data: [ROW], error: null });

    await repo.listForMemorial({ memorialId: "memorial-a", purpose: "hero", status: "ready" });

    expect(log.eq).toContainEqual(["purpose", "hero"]);
    expect(log.eq).toContainEqual(["status", "ready"]);
  });

  it("orders newest first, which the hero selection rule depends on", async () => {
    const { repo, log } = repository({ data: [ROW], error: null });

    await repo.listForMemorial({ memorialId: "memorial-a" });

    expect(log.order[0]).toEqual(["created_at", { ascending: false }]);
  });
});

describe("deleteById", () => {
  it("scopes the delete to the caller's memorial", async () => {
    const { repo, log } = repository({ data: [{ id: "media-1" }], error: null });

    await repo.deleteById({ memorialId: "memorial-a", mediaId: "media-1" });

    expect(log.deletes).toBe(1);
    expect(log.eq).toContainEqual(["memorial_id", "memorial-a"]);
    expect(log.eq).toContainEqual(["id", "media-1"]);
  });

  it("reports false — not an error — when there was nothing to delete", async () => {
    // What makes deletion idempotent for a retrying caller.
    const { repo } = repository({ data: [], error: null });

    expect(await repo.deleteById({ memorialId: "memorial-a", mediaId: "gone" })).toBe(false);
  });
});

describe("findExpiredPending", () => {
  it("can only ever see pending rows", async () => {
    // The filter that lets the sweep run with no session across
    // memorials: it can never reach a family's finalized photograph.
    const { repo, log } = repository({ data: [{ ...ROW, status: "pending" }], error: null });

    await repo.findExpiredPending({ olderThan: new Date("2026-09-09T11:00:00.000Z"), limit: 10 });

    expect(log.eq).toContainEqual(["status", "pending"]);
  });

  it("filters by the cutoff and bounds the batch", async () => {
    const { repo, log } = repository({ data: [], error: null });

    await repo.findExpiredPending({ olderThan: new Date("2026-09-09T11:00:00.000Z"), limit: 25 });

    expect(log.lt).toContainEqual(["created_at", "2026-09-09T11:00:00.000Z"]);
    expect(log.limit).toContain(25);
  });

  it("drains oldest first", async () => {
    const { repo, log } = repository({ data: [], error: null });

    await repo.findExpiredPending({ olderThan: new Date(), limit: 10 });

    expect(log.order[0]).toEqual(["created_at", { ascending: true }]);
  });
});
