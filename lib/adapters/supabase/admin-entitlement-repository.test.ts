import { describe, expect, it } from "vitest";
import { SupabaseAdminEntitlementRepository } from "./admin-entitlement-repository";

/**
 * Mission 015B — the adapter over the two audited RPCs. What matters
 * here: every write is an `.rpc(...)` call (never `.from(...).update(...)`
 * — see admin-entitlement-repository-boundary.test.ts for the
 * architectural version of that same claim), the right arguments reach
 * the right function, and every documented outcome maps correctly.
 */

interface RpcCall {
  fn: string;
  args: Record<string, unknown>;
}

function client(responses: Record<string, { data: unknown; error: unknown }>) {
  const calls: RpcCall[] = [];

  const supabase = {
    rpc(fn: string, args: Record<string, unknown>) {
      calls.push({ fn, args });
      return Promise.resolve(responses[fn] ?? { data: [], error: null });
    },
  };

  return { supabase, calls };
}

function repository(responses: Record<string, { data: unknown; error: unknown }> = {}) {
  const { supabase, calls } = client(responses);
  return {
    repo: new SupabaseAdminEntitlementRepository(
      supabase as unknown as ConstructorParameters<typeof SupabaseAdminEntitlementRepository>[0],
    ),
    calls,
  };
}

const ENTITLEMENT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ADMIN_AUTH_USER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const HASH = "c".repeat(64);

describe("SupabaseAdminEntitlementRepository — mutateActivationKey", () => {
  it("calls admin_mutate_activation_key with exactly the expected arguments", async () => {
    const { repo, calls } = repository({
      admin_mutate_activation_key: { data: [{ outcome: "replaced" }], error: null },
    });

    await repo.mutateActivationKey({
      entitlementId: ENTITLEMENT_ID,
      nextActivationKeyHash: HASH,
      adminAuthUserId: ADMIN_AUTH_USER_ID,
    });

    expect(calls).toEqual([
      {
        fn: "admin_mutate_activation_key",
        args: {
          p_entitlement_id: ENTITLEMENT_ID,
          p_admin_auth_user_id: ADMIN_AUTH_USER_ID,
          p_next_activation_key_hash: HASH,
        },
      },
    ]);
  });

  it("sends null for an invalidation, never an empty string or the old hash", async () => {
    const { repo, calls } = repository({
      admin_mutate_activation_key: { data: [{ outcome: "invalidated" }], error: null },
    });

    await repo.mutateActivationKey({
      entitlementId: ENTITLEMENT_ID,
      nextActivationKeyHash: null,
      adminAuthUserId: ADMIN_AUTH_USER_ID,
    });

    expect(calls[0].args.p_next_activation_key_hash).toBeNull();
  });

  it.each([
    ["replaced", { status: "replaced" }],
    ["invalidated", { status: "invalidated" }],
    ["not_found", { status: "notFound" }],
    ["not_available", { status: "notAvailable" }],
  ] as const)("maps RPC outcome %s to %o", async (rpcOutcome, expected) => {
    const { repo } = repository({
      admin_mutate_activation_key: { data: [{ outcome: rpcOutcome }], error: null },
    });

    const result = await repo.mutateActivationKey({
      entitlementId: ENTITLEMENT_ID,
      nextActivationKeyHash: HASH,
      adminAuthUserId: ADMIN_AUTH_USER_ID,
    });

    expect(result).toEqual(expected);
  });

  it("rejects on a genuine RPC error rather than reporting a business outcome", async () => {
    const { repo } = repository({
      admin_mutate_activation_key: { data: null, error: new Error("connection reset") },
    });

    await expect(
      repo.mutateActivationKey({
        entitlementId: ENTITLEMENT_ID,
        nextActivationKeyHash: HASH,
        adminAuthUserId: ADMIN_AUTH_USER_ID,
      }),
    ).rejects.toThrow("connection reset");
  });

  it("rejects if the RPC returns no row at all", async () => {
    const { repo } = repository({
      admin_mutate_activation_key: { data: [], error: null },
    });

    await expect(
      repo.mutateActivationKey({
        entitlementId: ENTITLEMENT_ID,
        nextActivationKeyHash: HASH,
        adminAuthUserId: ADMIN_AUTH_USER_ID,
      }),
    ).rejects.toThrow();
  });
});

describe("SupabaseAdminEntitlementRepository — revokeEntitlement", () => {
  it("calls admin_revoke_entitlement with exactly the expected arguments", async () => {
    const { repo, calls } = repository({
      admin_revoke_entitlement: { data: [{ outcome: "revoked", blocking_status: null }], error: null },
    });

    await repo.revokeEntitlement({
      entitlementId: ENTITLEMENT_ID,
      adminAuthUserId: ADMIN_AUTH_USER_ID,
    });

    expect(calls).toEqual([
      {
        fn: "admin_revoke_entitlement",
        args: { p_entitlement_id: ENTITLEMENT_ID, p_admin_auth_user_id: ADMIN_AUTH_USER_ID },
      },
    ]);
  });

  it("maps a successful revoke", async () => {
    const { repo } = repository({
      admin_revoke_entitlement: { data: [{ outcome: "revoked", blocking_status: null }], error: null },
    });

    expect(
      await repo.revokeEntitlement({ entitlementId: ENTITLEMENT_ID, adminAuthUserId: ADMIN_AUTH_USER_ID }),
    ).toEqual({ status: "revoked" });
  });

  it("maps not_found", async () => {
    const { repo } = repository({
      admin_revoke_entitlement: { data: [{ outcome: "not_found", blocking_status: null }], error: null },
    });

    expect(
      await repo.revokeEntitlement({ entitlementId: ENTITLEMENT_ID, adminAuthUserId: ADMIN_AUTH_USER_ID }),
    ).toEqual({ status: "notFound" });
  });

  it.each(["redeemed", "revoked"] as const)(
    "maps not_available with blocking_status=%s",
    async (blockingStatus) => {
      const { repo } = repository({
        admin_revoke_entitlement: {
          data: [{ outcome: "not_available", blocking_status: blockingStatus }],
          error: null,
        },
      });

      expect(
        await repo.revokeEntitlement({ entitlementId: ENTITLEMENT_ID, adminAuthUserId: ADMIN_AUTH_USER_ID }),
      ).toEqual({ status: "notAvailable", blockingStatus });
    },
  );

  it("rejects if not_available comes back with an unrecognised blocking_status", async () => {
    const { repo } = repository({
      admin_revoke_entitlement: {
        data: [{ outcome: "not_available", blocking_status: "available" }],
        error: null,
      },
    });

    await expect(
      repo.revokeEntitlement({ entitlementId: ENTITLEMENT_ID, adminAuthUserId: ADMIN_AUTH_USER_ID }),
    ).rejects.toThrow();
  });

  it("rejects on a genuine RPC error rather than reporting a business outcome", async () => {
    const { repo } = repository({
      admin_revoke_entitlement: { data: null, error: new Error("connection reset") },
    });

    await expect(
      repo.revokeEntitlement({ entitlementId: ENTITLEMENT_ID, adminAuthUserId: ADMIN_AUTH_USER_ID }),
    ).rejects.toThrow("connection reset");
  });
});

describe("SupabaseAdminEntitlementRepository — it never mutates outside an RPC", () => {
  it("exposes no method besides the two audited RPC calls", () => {
    const methods = Object.getOwnPropertyNames(SupabaseAdminEntitlementRepository.prototype);
    expect(methods.sort()).toEqual(["constructor", "mutateActivationKey", "revokeEntitlement"]);
  });
});
