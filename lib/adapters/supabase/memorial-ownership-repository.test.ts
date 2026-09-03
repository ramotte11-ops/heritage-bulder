import { describe, expect, it, vi } from "vitest";
import { SupabaseMemorialOwnershipRepository } from "./memorial-ownership-repository";

/**
 * Mission 014 — the adapter behind the ownership check. Small surface,
 * but it is the read an authorization decision is made against, so what
 * it selects, how it filters, and what it does with an error all matter.
 */

interface QueryLog {
  from: string[];
  select: string[];
  eq: [string, unknown][];
}

function client(result: { data: unknown; error: unknown }) {
  const log: QueryLog = { from: [], select: [], eq: [] };

  const builder = {
    select(columns: string) {
      log.select.push(columns);
      return builder;
    },
    eq(column: string, value: unknown) {
      log.eq.push([column, value]);
      return builder;
    },
    maybeSingle: vi.fn(async () => result),
  };

  const supabase = {
    from(table: string) {
      log.from.push(table);
      return builder;
    },
  };

  return { supabase, log, builder };
}

function repository(result: { data: unknown; error: unknown }) {
  const { supabase, log, builder } = client(result);
  return {
    repo: new SupabaseMemorialOwnershipRepository(
      supabase as unknown as ConstructorParameters<typeof SupabaseMemorialOwnershipRepository>[0],
    ),
    log,
    builder,
  };
}

describe("SupabaseMemorialOwnershipRepository", () => {
  it("returns the memorial's owner id", async () => {
    const { repo } = repository({ data: { owner_id: "owner-a" }, error: null });

    expect(await repo.findOwnerIdForMemorial("memorial-a")).toBe("owner-a");
  });

  it("reads memorials.owner_id and nothing else", async () => {
    const { repo, log } = repository({ data: { owner_id: "owner-a" }, error: null });

    await repo.findOwnerIdForMemorial("memorial-a");

    expect(log.from).toEqual(["memorials"]);
    // One column. An authorization read must not be able to return
    // content it has not established a right to.
    expect(log.select).toEqual(["owner_id"]);
  });

  it("filters by exact id equality — never a pattern operator", async () => {
    const { repo, log, builder } = repository({ data: null, error: null });

    // A value carrying SQL-pattern metacharacters must be matched
    // literally: with `.like`/`.ilike`, `%` would act as a wildcard and
    // could match a different memorial.
    await repo.findOwnerIdForMemorial("%");

    expect(log.eq).toEqual([["id", "%"]]);
    expect(builder).not.toHaveProperty("likeCalled");
  });

  it("returns null when no memorial has that id", async () => {
    const { repo } = repository({ data: null, error: null });

    expect(await repo.findOwnerIdForMemorial("memorial-that-never-existed")).toBeNull();
  });

  it("throws on a repository error instead of reporting 'no such memorial'", async () => {
    const { repo } = repository({ data: null, error: new Error("permission denied") });

    await expect(repo.findOwnerIdForMemorial("memorial-a")).rejects.toThrow("permission denied");
  });

  it("refuses to hand out an empty owner id", async () => {
    const { repo } = repository({ data: { owner_id: "" }, error: null });

    // An empty string is not an owner. Returning it would compare equal
    // to another empty string somewhere and grant access to nobody's
    // memorial.
    expect(await repo.findOwnerIdForMemorial("memorial-a")).toBeNull();
  });
});
