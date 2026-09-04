import { describe, expect, it, vi } from "vitest";
import type { AdminEntitlementRepository } from "@/lib/adapters/admin-entitlement-repository";
import {
  invalidateEntitlementActivationKeyAsAdmin,
  replaceEntitlementActivationKeyAsAdmin,
  revokeEntitlementAsAdmin,
} from "./admin-mutations";

/**
 * Mission 015B — the three mutations as pure functions. What matters
 * here: the raw key is generated in TypeScript and returned ONLY on a
 * confirmed replace, the repository receives a hash and never a raw
 * key, and every refusal from the repository passes straight through.
 */

const ENTITLEMENT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ADMIN_AUTH_USER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function repository(
  overrides: Partial<AdminEntitlementRepository> = {},
): AdminEntitlementRepository {
  return {
    mutateActivationKey: vi.fn(async () => ({ status: "replaced" }) as const),
    revokeEntitlement: vi.fn(async () => ({ status: "revoked" }) as const),
    ...overrides,
  };
}

describe("replaceEntitlementActivationKeyAsAdmin", () => {
  it("generates a fresh key and sends only its hash to the repository", async () => {
    const mutateActivationKey = vi.fn(async () => ({ status: "replaced" }) as const);
    const repo = repository({ mutateActivationKey });

    const result = await replaceEntitlementActivationKeyAsAdmin(
      { adminEntitlementRepository: repo },
      { entitlementId: ENTITLEMENT_ID, adminAuthUserId: ADMIN_AUTH_USER_ID },
    );

    expect(result.status).toBe("replaced");
    if (result.status !== "replaced") return;

    expect(mutateActivationKey).toHaveBeenCalledExactlyOnceWith({
      entitlementId: ENTITLEMENT_ID,
      nextActivationKeyHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      adminAuthUserId: ADMIN_AUTH_USER_ID,
    });

    // The raw key returned to the caller must be a well-formed HERITAGE
    // key, and it must never equal — or contain — the hash sent to the
    // repository.
    expect(result.rawActivationKey).toMatch(/^HH1-[0-9A-Z-]+$/);
    const [{ nextActivationKeyHash }] = mutateActivationKey.mock.calls[0] as unknown as [
      { entitlementId: string; nextActivationKeyHash: string | null; adminAuthUserId: string },
    ];
    expect(result.rawActivationKey).not.toContain(nextActivationKeyHash as string);
  });

  it("discards the freshly generated key on notFound — it must never leave this function unpersisted", async () => {
    const repo = repository({ mutateActivationKey: vi.fn(async () => ({ status: "notFound" }) as const) });

    const result = await replaceEntitlementActivationKeyAsAdmin(
      { adminEntitlementRepository: repo },
      { entitlementId: ENTITLEMENT_ID, adminAuthUserId: ADMIN_AUTH_USER_ID },
    );

    expect(result).toEqual({ status: "notFound" });
    expect(result).not.toHaveProperty("rawActivationKey");
  });

  it("discards the freshly generated key on notAvailable", async () => {
    const repo = repository({
      mutateActivationKey: vi.fn(async () => ({ status: "notAvailable" }) as const),
    });

    const result = await replaceEntitlementActivationKeyAsAdmin(
      { adminEntitlementRepository: repo },
      { entitlementId: ENTITLEMENT_ID, adminAuthUserId: ADMIN_AUTH_USER_ID },
    );

    expect(result).toEqual({ status: "notAvailable" });
  });

  it("discards the freshly generated key on a concurrent modification — a raced key must never be handed out", async () => {
    const repo = repository({
      mutateActivationKey: vi.fn(async () => ({ status: "concurrentModification" }) as const),
    });

    const result = await replaceEntitlementActivationKeyAsAdmin(
      { adminEntitlementRepository: repo },
      { entitlementId: ENTITLEMENT_ID, adminAuthUserId: ADMIN_AUTH_USER_ID },
    );

    expect(result).toEqual({ status: "concurrentModification" });
    expect(result).not.toHaveProperty("rawActivationKey");
  });

  it("each call generates an independent key — never reused across entitlements", async () => {
    const seen = new Set<string>();
    const mutateActivationKey = vi.fn(async () => ({ status: "replaced" }) as const);
    const repo = repository({ mutateActivationKey });

    for (let i = 0; i < 5; i++) {
      const result = await replaceEntitlementActivationKeyAsAdmin(
        { adminEntitlementRepository: repo },
        { entitlementId: ENTITLEMENT_ID, adminAuthUserId: ADMIN_AUTH_USER_ID },
      );
      if (result.status === "replaced") seen.add(result.rawActivationKey);
    }

    expect(seen.size).toBe(5);
  });
});

describe("invalidateEntitlementActivationKeyAsAdmin", () => {
  it("sends null as the next hash — never a raw key, never the old hash", async () => {
    const mutateActivationKey = vi.fn(async () => ({ status: "invalidated" }) as const);
    const repo = repository({ mutateActivationKey });

    const result = await invalidateEntitlementActivationKeyAsAdmin(
      { adminEntitlementRepository: repo },
      { entitlementId: ENTITLEMENT_ID, adminAuthUserId: ADMIN_AUTH_USER_ID },
    );

    expect(result).toEqual({ status: "invalidated" });
    expect(mutateActivationKey).toHaveBeenCalledExactlyOnceWith({
      entitlementId: ENTITLEMENT_ID,
      nextActivationKeyHash: null,
      adminAuthUserId: ADMIN_AUTH_USER_ID,
    });
  });

  it("passes notFound through unchanged", async () => {
    const repo = repository({ mutateActivationKey: vi.fn(async () => ({ status: "notFound" }) as const) });

    expect(
      await invalidateEntitlementActivationKeyAsAdmin(
        { adminEntitlementRepository: repo },
        { entitlementId: ENTITLEMENT_ID, adminAuthUserId: ADMIN_AUTH_USER_ID },
      ),
    ).toEqual({ status: "notFound" });
  });

  it("passes notAvailable through unchanged", async () => {
    const repo = repository({
      mutateActivationKey: vi.fn(async () => ({ status: "notAvailable" }) as const),
    });

    expect(
      await invalidateEntitlementActivationKeyAsAdmin(
        { adminEntitlementRepository: repo },
        { entitlementId: ENTITLEMENT_ID, adminAuthUserId: ADMIN_AUTH_USER_ID },
      ),
    ).toEqual({ status: "notAvailable" });
  });

  it("passes concurrentModification through unchanged", async () => {
    const repo = repository({
      mutateActivationKey: vi.fn(async () => ({ status: "concurrentModification" }) as const),
    });

    expect(
      await invalidateEntitlementActivationKeyAsAdmin(
        { adminEntitlementRepository: repo },
        { entitlementId: ENTITLEMENT_ID, adminAuthUserId: ADMIN_AUTH_USER_ID },
      ),
    ).toEqual({ status: "concurrentModification" });
  });

  it("passes noActivationKey through unchanged — invalidating a right with no key is a refusal, not a no-op success", async () => {
    const repo = repository({
      mutateActivationKey: vi.fn(async () => ({ status: "noActivationKey" }) as const),
    });

    expect(
      await invalidateEntitlementActivationKeyAsAdmin(
        { adminEntitlementRepository: repo },
        { entitlementId: ENTITLEMENT_ID, adminAuthUserId: ADMIN_AUTH_USER_ID },
      ),
    ).toEqual({ status: "noActivationKey" });
  });
});

describe("revokeEntitlementAsAdmin", () => {
  it("passes the call straight through to the repository", async () => {
    const revokeEntitlement = vi.fn(async () => ({ status: "revoked" }) as const);
    const repo = repository({ revokeEntitlement });

    const result = await revokeEntitlementAsAdmin(
      { adminEntitlementRepository: repo },
      { entitlementId: ENTITLEMENT_ID, adminAuthUserId: ADMIN_AUTH_USER_ID },
    );

    expect(result).toEqual({ status: "revoked" });
    expect(revokeEntitlement).toHaveBeenCalledExactlyOnceWith({
      entitlementId: ENTITLEMENT_ID,
      adminAuthUserId: ADMIN_AUTH_USER_ID,
    });
  });

  it("passes a notAvailable refusal through with its blockingStatus intact", async () => {
    const repo = repository({
      revokeEntitlement: vi.fn(
        async () => ({ status: "notAvailable", blockingStatus: "redeemed" }) as const,
      ),
    });

    expect(
      await revokeEntitlementAsAdmin(
        { adminEntitlementRepository: repo },
        { entitlementId: ENTITLEMENT_ID, adminAuthUserId: ADMIN_AUTH_USER_ID },
      ),
    ).toEqual({ status: "notAvailable", blockingStatus: "redeemed" });
  });
});
