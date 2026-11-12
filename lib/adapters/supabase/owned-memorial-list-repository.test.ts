import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

// The adapter reuses `isPublicSlugShape` from the M2 server-only reader.
vi.mock("server-only", () => ({}));
const { SupabaseOwnedMemorialListRepository } = await import("./owned-memorial-list-repository");

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

const DRAFT_COLUMNS = { status: "draft", slug: null, access_level: "avis", free_public_until: null };
const M1 = { id: "11111111-1111-4111-8111-111111111111", created_at: "2026-09-20T10:00:00.000Z", ...DRAFT_COLUMNS };
const M2 = { id: "22222222-2222-4222-8222-222222222222", created_at: "2026-09-21T10:00:00.000Z", ...DRAFT_COLUMNS };

describe("SupabaseOwnedMemorialListRepository.listOwnedMemorials", () => {
  it("filters memorials by the given owner, reads id/created_at plus the four visibility columns only, oldest first", async () => {
    const { client, memorialsQuery } = fakeClient({ data: [M1], error: null });

    await new SupabaseOwnedMemorialListRepository(client).listOwnedMemorials("owner-1");

    expect(memorialsQuery.select).toHaveBeenCalledWith("id, created_at, status, slug, access_level, free_public_until");
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
      { id: M1.id, displayName: "Jeanne Martin", createdAt: M1.created_at, publicSlug: null },
      { id: M2.id, displayName: null, createdAt: M2.created_at, publicSlug: null },
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

    expect(result).toEqual([{ id: M1.id, displayName: null, createdAt: M1.created_at, publicSlug: null }]);
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

// ---------------------------------------------------------------------
// QG 016 / M4 — publicSlug: only while the public page would answer
// ---------------------------------------------------------------------

describe("SupabaseOwnedMemorialListRepository — publicSlug (« Voir mon hommage »)", () => {
  const NOW = new Date("2026-11-05T12:00:00.000Z");
  const SLUG = "95bd2601eac8";
  const FUTURE = "2026-11-12T20:10:25.681174+00:00";
  const PAST = "2026-11-01T08:00:00+00:00";

  async function publicSlugOf(columns: Record<string, unknown>, now = NOW): Promise<string | null> {
    const { client } = fakeClient({ data: [{ ...M1, ...columns }], error: null });
    const [summary] = await new SupabaseOwnedMemorialListRepository(client, () => now).listOwnedMemorials("owner-1");
    return summary.publicSlug;
  }

  it("is the slug for a published complet memorial", async () => {
    expect(await publicSlugOf({ status: "published", slug: SLUG, access_level: "complet", free_public_until: null })).toBe(SLUG);
  });

  it("is the slug for a published avis memorial before its public deadline", async () => {
    expect(await publicSlugOf({ status: "published", slug: SLUG, access_level: "avis", free_public_until: FUTURE })).toBe(SLUG);
  });

  it("is null for an avis memorial whose public deadline has passed — no link, no mention", async () => {
    expect(await publicSlugOf({ status: "published", slug: SLUG, access_level: "avis", free_public_until: PAST })).toBeNull();
  });

  it("is null for an avis memorial with no or an unreadable deadline", async () => {
    for (const free_public_until of [null, "", "demain", 42]) {
      expect(await publicSlugOf({ status: "published", slug: SLUG, access_level: "avis", free_public_until })).toBeNull();
    }
  });

  it("is null for every status but published, whatever the offer", async () => {
    for (const status of ["draft", "ready", "editing", "archived"]) {
      for (const access_level of ["avis", "complet"]) {
        expect(
          await publicSlugOf({ status, slug: SLUG, access_level, free_public_until: FUTURE }),
          `${status}/${access_level}`,
        ).toBeNull();
      }
    }
  });

  it("is null for a never-published draft (slug NULL)", async () => {
    expect(await publicSlugOf({ status: "draft", slug: null, access_level: "avis", free_public_until: null })).toBeNull();
  });

  it("is null when the slug does not have the shape publication produces", async () => {
    for (const slug of [null, "", "jeanne-test-s1", "95BD2601EAC8", "95bd2601eac", "../builder", `${SLUG}/x`, 12, undefined]) {
      expect(
        await publicSlugOf({ status: "published", slug, access_level: "complet", free_public_until: null }),
        String(slug),
      ).toBeNull();
    }
  });

  it("is null for an unknown access level", async () => {
    expect(await publicSlugOf({ status: "published", slug: SLUG, access_level: null, free_public_until: FUTURE })).toBeNull();
    expect(await publicSlugOf({ status: "published", slug: SLUG, access_level: "premium", free_public_until: FUTURE })).toBeNull();
  });

  it("decides each memorial of a list on its OWN row — never another memorial's slug", async () => {
    const OTHER = "0123456789abcdef";
    const { client } = fakeClient({
      data: [
        { ...M1, status: "published", slug: SLUG, access_level: "avis", free_public_until: PAST },
        { ...M2, status: "published", slug: OTHER, access_level: "complet", free_public_until: null },
        { id: "33333333-3333-4333-8333-333333333333", created_at: "2026-09-22T10:00:00.000Z", ...DRAFT_COLUMNS },
      ],
      error: null,
    });

    const result = await new SupabaseOwnedMemorialListRepository(client, () => NOW).listOwnedMemorials("owner-1");

    expect(result.map((m) => [m.id, m.publicSlug])).toEqual([
      [M1.id, null],
      [M2.id, OTHER],
      ["33333333-3333-4333-8333-333333333333", null],
    ]);
  });

  it("uses the injected clock — the same row flips exactly at the deadline", async () => {
    const until = "2026-11-12T20:10:25.681+00:00";
    const at = new Date("2026-11-12T20:10:25.681Z");
    const row = { status: "published", slug: SLUG, access_level: "avis", free_public_until: until };
    expect(await publicSlugOf(row, new Date(at.getTime() - 1))).toBe(SLUG);
    expect(await publicSlugOf(row, at)).toBeNull();
  });

  it("returns only publicSlug — never the raw status, access level or deadline", async () => {
    const { client } = fakeClient({
      data: [{ ...M1, status: "published", slug: SLUG, access_level: "avis", free_public_until: FUTURE }],
      error: null,
    });
    const [summary] = await new SupabaseOwnedMemorialListRepository(client, () => NOW).listOwnedMemorials("owner-1");
    expect(Object.keys(summary).sort()).toEqual(["createdAt", "displayName", "id", "publicSlug"]);
  });
});
