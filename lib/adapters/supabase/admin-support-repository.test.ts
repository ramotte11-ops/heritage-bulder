import { describe, expect, it, vi } from "vitest";
import { SupabaseAdminSupportRepository } from "./admin-support-repository";

/**
 * Mission 015A — the support adapter. The properties worth asserting are
 * about WHAT it reads, not how it maps: an authorization-adjacent read
 * that selects too much is how a secret reaches a screen.
 */

interface QueryLog {
  from: string[];
  select: string[];
  eq: [string, unknown][];
  order: [string, unknown][];
}

/**
 * `results` answers single-row reads (`maybeSingle`), `lists` answers
 * set reads (`returns`). Kept apart on purpose: one shared map would let
 * a list read receive a single row, which the real client never does and
 * which would make this double lie about the adapter.
 */
function client(
  results: Record<string, { data: unknown; error: unknown }>,
  lists: Record<string, { data: unknown; error: unknown }> = {},
) {
  const log: QueryLog = { from: [], select: [], eq: [], order: [] };
  let table = "";

  const builder = {
    select(columns: string) {
      log.select.push(columns);
      return builder;
    },
    eq(column: string, value: unknown) {
      log.eq.push([column, value]);
      return builder;
    },
    order(column: string, options: unknown) {
      log.order.push([column, options]);
      return builder;
    },
    maybeSingle: vi.fn(async () => results[table] ?? { data: null, error: null }),
    returns: vi.fn(async () => lists[table] ?? { data: [], error: null }),
  };

  const supabase = {
    from(name: string) {
      table = name;
      log.from.push(name);
      return builder;
    },
  };

  return { supabase, log };
}

function repository(
  results: Record<string, { data: unknown; error: unknown }> = {},
  lists: Record<string, { data: unknown; error: unknown }> = {},
) {
  const { supabase, log } = client(results, lists);
  return {
    repo: new SupabaseAdminSupportRepository(
      supabase as unknown as ConstructorParameters<typeof SupabaseAdminSupportRepository>[0],
    ),
    log,
  };
}

const OWNER_ROW = {
  id: "11111111-1111-4111-8111-111111111111",
  auth_user_id: "auth-a",
  email: "famille@example.test",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const ENTITLEMENT_ROW = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  source: "etsy",
  external_order_id: "ORDER-1",
  offer_id: "occidental",
  status: "redeemed",
  owner_id: OWNER_ROW.id,
  created_at: "2026-01-01T00:00:00.000Z",
  redeemed_at: "2026-01-02T00:00:00.000Z",
  updated_at: "2026-01-02T00:00:00.000Z",
};

const MEMORIAL_ROW = {
  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  owner_id: OWNER_ROW.id,
  entitlement_id: ENTITLEMENT_ROW.id,
  memorial_type: "person",
  editorial_context: "announcement",
  skin_id: "intemporel",
  language: "fr",
  status: "draft",
  slug: null,
  created_at: "2026-01-02T00:00:00.000Z",
  updated_at: "2026-01-03T00:00:00.000Z",
};

describe("SupabaseAdminSupportRepository — what it selects", () => {
  it("NEVER selects activation_key_hash, on any read", async () => {
    const { repo, log } = repository(
      {
        owners: { data: OWNER_ROW, error: null },
        entitlements: { data: ENTITLEMENT_ROW, error: null },
        memorials: { data: MEMORIAL_ROW, error: null },
      },
      { entitlements: { data: [ENTITLEMENT_ROW], error: null } },
    );

    await repo.findOwnerById(OWNER_ROW.id);
    await repo.findEntitlementById(ENTITLEMENT_ROW.id);
    await repo.findEntitlementsByOwnerId(OWNER_ROW.id);
    await repo.findMemorialSummaryById(MEMORIAL_ROW.id);
    await repo.findMemorialSummaryByEntitlementId(ENTITLEMENT_ROW.id);

    for (const columns of log.select) {
      expect(columns).not.toMatch(/activation_key_hash/);
      // `*` would drag the hash in without ever naming it.
      expect(columns).not.toBe("*");
      expect(columns).not.toMatch(/\*/);
    }
  });

  it("NEVER reads a content table", async () => {
    const { repo, log } = repository({
      owners: { data: OWNER_ROW, error: null },
      entitlements: { data: ENTITLEMENT_ROW, error: null },
      memorials: { data: MEMORIAL_ROW, error: null },
    });

    await repo.findOwnerById(OWNER_ROW.id);
    await repo.findEntitlementById(ENTITLEMENT_ROW.id);
    await repo.findMemorialSummaryById(MEMORIAL_ROW.id);
    await repo.findMemorialSummaryByEntitlementId(ENTITLEMENT_ROW.id);

    expect(new Set(log.from)).toEqual(new Set(["owners", "entitlements", "memorials"]));
    for (const columns of log.select) {
      expect(columns).not.toMatch(/content/);
    }
  });

  it("filters by exact equality — never a pattern operator", async () => {
    const { repo, log } = repository({ entitlements: { data: null, error: null } });

    // A value full of SQL-pattern metacharacters must be matched
    // literally.
    await repo.findEntitlementById("%");

    expect(log.eq).toEqual([["id", "%"]]);
  });
});

describe("SupabaseAdminSupportRepository — mapping and relations", () => {
  it("maps an owner row", async () => {
    const { repo } = repository({ owners: { data: OWNER_ROW, error: null } });

    expect(await repo.findOwnerById(OWNER_ROW.id)).toEqual({
      id: OWNER_ROW.id,
      authUserId: "auth-a",
      email: "famille@example.test",
      createdAt: OWNER_ROW.created_at,
      updatedAt: OWNER_ROW.updated_at,
    });
  });

  it("maps an entitlement row without any hash field", async () => {
    const { repo } = repository({ entitlements: { data: ENTITLEMENT_ROW, error: null } });

    const entitlement = await repo.findEntitlementById(ENTITLEMENT_ROW.id);

    expect(entitlement).toMatchObject({ id: ENTITLEMENT_ROW.id, status: "redeemed" });
    expect(JSON.stringify(entitlement)).not.toMatch(/hash|activation/i);
  });

  it("maps a memorial summary carrying no content", async () => {
    const { repo } = repository({ memorials: { data: MEMORIAL_ROW, error: null } });

    const memorial = await repo.findMemorialSummaryById(MEMORIAL_ROW.id);

    expect(memorial).toEqual({
      id: MEMORIAL_ROW.id,
      ownerId: OWNER_ROW.id,
      entitlementId: ENTITLEMENT_ROW.id,
      memorialType: "person",
      editorialContext: "announcement",
      skin: "intemporel",
      language: "fr",
      status: "draft",
      slug: null,
      createdAt: MEMORIAL_ROW.created_at,
      updatedAt: MEMORIAL_ROW.updated_at,
    });
    expect(memorial).not.toHaveProperty("draft");
    expect(memorial).not.toHaveProperty("published");
  });

  it("finds a memorial through memorials.entitlement_id, the real relation", async () => {
    const { repo, log } = repository({ memorials: { data: MEMORIAL_ROW, error: null } });

    await repo.findMemorialSummaryByEntitlementId(ENTITLEMENT_ROW.id);

    expect(log.from).toEqual(["memorials"]);
    expect(log.eq).toEqual([["entitlement_id", ENTITLEMENT_ROW.id]]);
  });

  it("lists an owner's rights oldest first, scoped to that owner", async () => {
    const { repo, log } = repository({}, { entitlements: { data: [ENTITLEMENT_ROW], error: null } });

    const rights = await repo.findEntitlementsByOwnerId(OWNER_ROW.id);

    expect(rights).toHaveLength(1);
    expect(log.eq).toEqual([["owner_id", OWNER_ROW.id]]);
    expect(log.order).toEqual([["created_at", { ascending: true }]]);
  });

  it("returns an empty list rather than null when an owner holds nothing", async () => {
    const { repo } = repository({}, { entitlements: { data: null, error: null } });

    expect(await repo.findEntitlementsByOwnerId(OWNER_ROW.id)).toEqual([]);
  });
});

describe("SupabaseAdminSupportRepository — failures are not answers", () => {
  it("throws instead of reporting 'no such record'", async () => {
    for (const [table, call] of [
      ["owners", (r: SupabaseAdminSupportRepository) => r.findOwnerById("x")],
      ["entitlements", (r: SupabaseAdminSupportRepository) => r.findEntitlementById("x")],
      ["entitlements", (r: SupabaseAdminSupportRepository) => r.findEntitlementsByOwnerId("x")],
      ["memorials", (r: SupabaseAdminSupportRepository) => r.findMemorialSummaryById("x")],
      [
        "memorials",
        (r: SupabaseAdminSupportRepository) => r.findMemorialSummaryByEntitlementId("x"),
      ],
    ] as const) {
      const { repo } = repository(
        { [table]: { data: null, error: new Error("permission denied") } },
        { [table]: { data: null, error: new Error("permission denied") } },
      );

      await expect(call(repo)).rejects.toThrow("permission denied");
    }
  });

  it("returns null for a genuine miss", async () => {
    const { repo } = repository({ owners: { data: null, error: null } });

    expect(await repo.findOwnerById("nobody")).toBeNull();
  });
});

describe("SupabaseAdminSupportRepository — it cannot write", () => {
  it("exposes no method that mutates", () => {
    const methods = Object.getOwnPropertyNames(SupabaseAdminSupportRepository.prototype);

    for (const method of methods) {
      expect(method).toMatch(/^(constructor|find)/);
    }
  });
});
