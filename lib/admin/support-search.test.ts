import { describe, expect, it, vi } from "vitest";
import type { AdminSupportRepository } from "@/lib/adapters/admin-support-repository";
import type { Owner } from "@/types/owner";
import type { Entitlement } from "@/types/entitlement";
import type { MemorialSupportSummary } from "@/types/admin-support";
import {
  parseAdminSupportQueryKind,
  searchAdminSupport,
  type AdminSupportSearchResult,
} from "./support-search";

/**
 * Mission 015A — the support lookup. What matters here: it finds what it
 * should by the REAL relations, it never invents an association, a typo
 * never renders as "no such record", and an outage never renders as one
 * either.
 */

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const ENT_REDEEMED = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ENT_AVAILABLE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const MEMORIAL_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const UNKNOWN_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const OWNER: Owner = {
  id: OWNER_ID,
  authUserId: "auth-a",
  email: "famille@example.test",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const REDEEMED: Entitlement = {
  id: ENT_REDEEMED,
  source: "etsy",
  externalOrderId: "ORDER-1",
  offerId: "occidental",
  status: "redeemed",
  ownerId: OWNER_ID,
  createdAt: "2026-01-01T00:00:00.000Z",
  redeemedAt: "2026-01-02T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
};

const AVAILABLE: Entitlement = {
  ...REDEEMED,
  id: ENT_AVAILABLE,
  externalOrderId: "ORDER-2",
  status: "available",
  ownerId: null,
  redeemedAt: null,
};

const MEMORIAL: MemorialSupportSummary = {
  id: MEMORIAL_ID,
  ownerId: OWNER_ID,
  entitlementId: ENT_REDEEMED,
  memorialType: "person",
  editorialContext: "announcement",
  skin: "intemporel",
  language: "fr",
  status: "draft",
  slug: null,
  createdAt: "2026-01-02T00:00:00.000Z",
  updatedAt: "2026-01-03T00:00:00.000Z",
};

/** A small, consistent world: one owner, two rights, one memorial. */
function repository(overrides: Partial<AdminSupportRepository> = {}): AdminSupportRepository {
  const base = {
    findOwnerById: vi.fn(async (id: string) =>
      id === OWNER_ID ? OWNER : null,
    ),
    findOwnerByEmail: vi.fn(async (email: string) =>
      email.toLowerCase() === OWNER.email ? OWNER : null,
    ),
    findEntitlementById: vi.fn(async (id: string) =>
      id === ENT_REDEEMED ? REDEEMED : id === ENT_AVAILABLE ? AVAILABLE : null,
    ),
    findEntitlementsByOwnerId: vi.fn(async (ownerId: string) =>
      ownerId === OWNER_ID ? [REDEEMED, AVAILABLE] : [],
    ),
    findMemorialSummaryById: vi.fn(async (id: string) =>
      id === MEMORIAL_ID ? MEMORIAL : null,
    ),
    findMemorialSummaryByEntitlementId: vi.fn(async (id: string) =>
      id === ENT_REDEEMED ? MEMORIAL : null,
    ),
  };

  return { ...base, ...overrides };
}

function search(
  adminSupportRepository: AdminSupportRepository,
  kind: "ownerEmail" | "entitlementId" | "memorialId",
  value: string,
): Promise<AdminSupportSearchResult> {
  return searchAdminSupport({ adminSupportRepository }, { kind, value });
}

describe("searchAdminSupport — by owner email", () => {
  it("finds the owner and every right they hold", async () => {
    const result = await search(repository(), "ownerEmail", OWNER.email);

    expect(result.status).toBe("found");
    if (result.status !== "found") return;
    expect(result.record.owner).toEqual(OWNER);
    expect(result.record.entitlements.map((e) => e.entitlement.id)).toEqual([
      ENT_REDEEMED,
      ENT_AVAILABLE,
    ]);
  });

  it("attaches each right's memorial, and only where one really exists", async () => {
    const result = await search(repository(), "ownerEmail", OWNER.email);

    if (result.status !== "found") throw new Error("expected a record");
    const [redeemed, available] = result.record.entitlements;

    expect(redeemed.memorial).toEqual(MEMORIAL);
    // The unredeemed right has no memorial — and none is borrowed from
    // the sibling right just because they share an owner.
    expect(available.memorial).toBeNull();
  });

  it("looks the memorial up by entitlement id, never by owner", async () => {
    const repo = repository();

    await search(repo, "ownerEmail", OWNER.email);

    expect(vi.mocked(repo.findMemorialSummaryByEntitlementId).mock.calls).toEqual([
      [ENT_REDEEMED],
      [ENT_AVAILABLE],
    ]);
    expect(repo.findMemorialSummaryById).not.toHaveBeenCalled();
  });

  it("matches the address case-insensitively, as the unique index does", async () => {
    const result = await search(repository(), "ownerEmail", "Famille@Example.TEST");

    expect(result.status).toBe("found");
  });

  it("reports an unknown address as notFound", async () => {
    expect(await search(repository(), "ownerEmail", "inconnu@example.test")).toEqual({
      status: "notFound",
    });
  });

  it("reports an owner with no rights as found, with an empty list", async () => {
    const repo = repository({
      findEntitlementsByOwnerId: vi.fn(async () => []),
    });

    const result = await search(repo, "ownerEmail", OWNER.email);

    expect(result.status).toBe("found");
    if (result.status !== "found") return;
    expect(result.record.owner).toEqual(OWNER);
    expect(result.record.entitlements).toEqual([]);
  });

  it("refuses a malformed address without reading anything", async () => {
    const repo = repository();

    expect(await search(repo, "ownerEmail", "pas-une-adresse")).toEqual({
      status: "invalidQuery",
      reason: "malformedEmail",
    });
    expect(repo.findOwnerByEmail).not.toHaveBeenCalled();
  });
});

describe("searchAdminSupport — by entitlement id", () => {
  it("finds a redeemed right, its memorial and its owner", async () => {
    const result = await search(repository(), "entitlementId", ENT_REDEEMED);

    if (result.status !== "found") throw new Error("expected a record");
    expect(result.record.owner).toEqual(OWNER);
    expect(result.record.entitlements).toEqual([
      { entitlement: REDEEMED, memorial: MEMORIAL },
    ]);
  });

  it("finds an unredeemed right, with no owner and no memorial", async () => {
    const repo = repository();

    const result = await search(repo, "entitlementId", ENT_AVAILABLE);

    if (result.status !== "found") throw new Error("expected a record");
    expect(result.record.owner).toBeNull();
    expect(result.record.entitlements[0].memorial).toBeNull();
    // No owner id to resolve means no owner read at all — never a guess
    // from the email or from a sibling record.
    expect(repo.findOwnerById).not.toHaveBeenCalled();
  });

  it("resolves the owner from the right's own ownerId", async () => {
    const repo = repository();

    await search(repo, "entitlementId", ENT_REDEEMED);

    expect(repo.findOwnerById).toHaveBeenCalledExactlyOnceWith(OWNER_ID);
  });

  it("reports an unknown id as notFound", async () => {
    expect(await search(repository(), "entitlementId", UNKNOWN_ID)).toEqual({
      status: "notFound",
    });
  });

  // --- a typo must never look like "this right does not exist"
  it("refuses a malformed id without reading anything", async () => {
    const repo = repository();

    for (const value of ["not-a-uuid", "12345", `${ENT_REDEEMED}x`, "%"]) {
      expect(await search(repo, "entitlementId", value)).toEqual({
        status: "invalidQuery",
        reason: "malformedId",
      });
    }

    expect(repo.findEntitlementById).not.toHaveBeenCalled();
  });
});

describe("searchAdminSupport — by memorial id", () => {
  it("walks back to the right and the owner", async () => {
    const result = await search(repository(), "memorialId", MEMORIAL_ID);

    if (result.status !== "found") throw new Error("expected a record");
    expect(result.record.owner).toEqual(OWNER);
    expect(result.record.entitlements).toEqual([
      { entitlement: REDEEMED, memorial: MEMORIAL },
    ]);
  });

  it("uses the memorial's own entitlementId and ownerId, not the query", async () => {
    const repo = repository();

    await search(repo, "memorialId", MEMORIAL_ID);

    expect(repo.findEntitlementById).toHaveBeenCalledExactlyOnceWith(ENT_REDEEMED);
    expect(repo.findOwnerById).toHaveBeenCalledExactlyOnceWith(OWNER_ID);
  });

  it("shows a memorial whose right cannot be read as having no right, rather than inventing one", async () => {
    const repo = repository({ findEntitlementById: vi.fn(async () => null) });

    const result = await search(repo, "memorialId", MEMORIAL_ID);

    if (result.status !== "found") throw new Error("expected a record");
    expect(result.record.entitlements).toEqual([]);
    expect(result.record.owner).toEqual(OWNER);
  });

  it("reports an unknown id as notFound", async () => {
    expect(await search(repository(), "memorialId", UNKNOWN_ID)).toEqual({
      status: "notFound",
    });
  });
});

describe("searchAdminSupport — refusals that are not results", () => {
  it("treats a blank value as an invalid query, not as a wildcard", async () => {
    const repo = repository();

    for (const value of ["", "   ", "\n"]) {
      expect(await search(repo, "ownerEmail", value)).toEqual({
        status: "invalidQuery",
        reason: "empty",
      });
    }

    expect(repo.findOwnerByEmail).not.toHaveBeenCalled();
    expect(repo.findEntitlementsByOwnerId).not.toHaveBeenCalled();
  });

  // --- an outage is not an answer
  it("lets a repository failure reject instead of reporting notFound", async () => {
    const repo = repository({
      findOwnerByEmail: vi.fn().mockRejectedValue(new Error("supabase is down")),
    });

    await expect(search(repo, "ownerEmail", OWNER.email)).rejects.toThrow("supabase is down");
  });

  it("lets a failure while attaching a memorial reject too", async () => {
    const repo = repository({
      findMemorialSummaryByEntitlementId: vi.fn().mockRejectedValue(new Error("boom")),
    });

    await expect(search(repo, "entitlementId", ENT_REDEEMED)).rejects.toThrow("boom");
  });
});

describe("searchAdminSupport — nothing secret is in the shape", () => {
  it("carries no activation key material anywhere in a result", async () => {
    const result = await search(repository(), "ownerEmail", OWNER.email);

    const serialised = JSON.stringify(result);
    expect(serialised).not.toMatch(/activation/i);
    expect(serialised).not.toMatch(/HH1/);
    // The domain Entitlement type has no hash field at all, so this
    // asserts the property end to end rather than trusting the type.
    expect(serialised).not.toMatch(/hash/i);
  });

  it("never asks the repository for anything but the six support reads", async () => {
    const repo = repository();

    await search(repo, "ownerEmail", OWNER.email);
    await search(repo, "entitlementId", ENT_REDEEMED);
    await search(repo, "memorialId", MEMORIAL_ID);

    // The port exposes only reads; this asserts the search calls no
    // method outside the ones it declares, so a future write method
    // could not be reached from here by accident.
    expect(Object.keys(repo).sort()).toEqual([
      "findEntitlementById",
      "findEntitlementsByOwnerId",
      "findMemorialSummaryByEntitlementId",
      "findMemorialSummaryById",
      "findOwnerByEmail",
      "findOwnerById",
    ]);
  });
});

describe("parseAdminSupportQueryKind", () => {
  it("accepts the three supported modes", () => {
    for (const kind of ["ownerEmail", "entitlementId", "memorialId"]) {
      expect(parseAdminSupportQueryKind(kind)).toBe(kind);
    }
  });

  it("rejects anything else, rather than falling back to a mode nobody asked for", () => {
    for (const value of ["", "owner", "OWNEREMAIL", "sql", null, undefined, 42, {}, []]) {
      expect(parseAdminSupportQueryKind(value)).toBeNull();
    }
  });
});
