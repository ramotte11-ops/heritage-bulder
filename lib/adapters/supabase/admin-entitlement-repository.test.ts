import { describe, expect, it } from "vitest";
import { SupabaseAdminEntitlementRepository } from "./admin-entitlement-repository";

/**
 * Mission 015B — the adapter over the two audited RPCs. What matters
 * here: every write is an `.rpc(...)` call (never `.from(...).update(...)`
 * — see admin-entitlement-repository-boundary.test.ts for the
 * architectural version of that same claim), `mutateActivationKey`
 * reads the entitlement's current hash for itself and hands it to the
 * RPC as the compare-and-swap's expected value, the right arguments
 * reach the right function, and every documented outcome maps
 * correctly.
 */

interface RpcCall {
  fn: string;
  args: Record<string, unknown>;
}

function client({
  rpcResponses = {},
  currentHash = null,
}: {
  rpcResponses?: Record<string, { data: unknown; error: unknown }>;
  currentHash?: string | null | { error: unknown };
}) {
  const calls: RpcCall[] = [];
  const hashReadsFor: string[] = [];

  const supabase = {
    rpc(fn: string, args: Record<string, unknown>) {
      calls.push({ fn, args });
      return Promise.resolve(rpcResponses[fn] ?? { data: [], error: null });
    },
    from() {
      return {
        select() {
          return {
            eq(_column: string, id: string) {
              return {
                maybeSingle: () => {
                  hashReadsFor.push(id);
                  if (currentHash !== null && typeof currentHash === "object") {
                    return Promise.resolve({ data: null, error: currentHash.error });
                  }
                  return Promise.resolve({
                    data: { activation_key_hash: currentHash },
                    error: null,
                  });
                },
              };
            },
          };
        },
      };
    },
  };

  return { supabase, calls, hashReadsFor };
}

function repository(
  options: {
    rpcResponses?: Record<string, { data: unknown; error: unknown }>;
    currentHash?: string | null | { error: unknown };
  } = {},
) {
  const { supabase, calls, hashReadsFor } = client(options);
  return {
    repo: new SupabaseAdminEntitlementRepository(
      supabase as unknown as ConstructorParameters<typeof SupabaseAdminEntitlementRepository>[0],
    ),
    calls,
    hashReadsFor,
  };
}

const ENTITLEMENT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ADMIN_AUTH_USER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CURRENT_HASH = "c".repeat(64);
const NEXT_HASH = "d".repeat(64);

describe("SupabaseAdminEntitlementRepository — mutateActivationKey", () => {
  it("reads the entitlement's current hash for itself, before calling the RPC", async () => {
    const { repo, hashReadsFor, calls } = repository({
      rpcResponses: { admin_mutate_activation_key: { data: [{ outcome: "replaced" }], error: null } },
      currentHash: CURRENT_HASH,
    });

    await repo.mutateActivationKey({
      entitlementId: ENTITLEMENT_ID,
      nextActivationKeyHash: NEXT_HASH,
      adminAuthUserId: ADMIN_AUTH_USER_ID,
    });

    expect(hashReadsFor).toEqual([ENTITLEMENT_ID]);
    expect(calls[0].args.p_expected_activation_key_hash).toBe(CURRENT_HASH);
  });

  it("calls admin_mutate_activation_key with exactly the expected arguments", async () => {
    const { repo, calls } = repository({
      rpcResponses: { admin_mutate_activation_key: { data: [{ outcome: "replaced" }], error: null } },
      currentHash: CURRENT_HASH,
    });

    await repo.mutateActivationKey({
      entitlementId: ENTITLEMENT_ID,
      nextActivationKeyHash: NEXT_HASH,
      adminAuthUserId: ADMIN_AUTH_USER_ID,
    });

    expect(calls).toEqual([
      {
        fn: "admin_mutate_activation_key",
        args: {
          p_entitlement_id: ENTITLEMENT_ID,
          p_admin_auth_user_id: ADMIN_AUTH_USER_ID,
          p_expected_activation_key_hash: CURRENT_HASH,
          p_next_activation_key_hash: NEXT_HASH,
        },
      },
    ]);
  });

  it("passes a null expected hash when the entitlement currently has none", async () => {
    const { repo, calls } = repository({
      rpcResponses: { admin_mutate_activation_key: { data: [{ outcome: "replaced" }], error: null } },
      currentHash: null,
    });

    await repo.mutateActivationKey({
      entitlementId: ENTITLEMENT_ID,
      nextActivationKeyHash: NEXT_HASH,
      adminAuthUserId: ADMIN_AUTH_USER_ID,
    });

    expect(calls[0].args.p_expected_activation_key_hash).toBeNull();
  });

  it("sends null as the next hash for an invalidation, never an empty string or the old hash", async () => {
    const { repo, calls } = repository({
      rpcResponses: { admin_mutate_activation_key: { data: [{ outcome: "invalidated" }], error: null } },
      currentHash: CURRENT_HASH,
    });

    await repo.mutateActivationKey({
      entitlementId: ENTITLEMENT_ID,
      nextActivationKeyHash: null,
      adminAuthUserId: ADMIN_AUTH_USER_ID,
    });

    expect(calls[0].args.p_next_activation_key_hash).toBeNull();
    // The expected (current) hash is untouched by what's being invalidated to.
    expect(calls[0].args.p_expected_activation_key_hash).toBe(CURRENT_HASH);
  });

  it.each([
    ["replaced", { status: "replaced" }],
    ["invalidated", { status: "invalidated" }],
    ["not_found", { status: "notFound" }],
    ["not_available", { status: "notAvailable" }],
    ["key_mismatch", { status: "concurrentModification" }],
    ["no_activation_key", { status: "noActivationKey" }],
    ["same_activation_key", { status: "sameActivationKey" }],
  ] as const)("maps RPC outcome %s to %o", async (rpcOutcome, expected) => {
    const { repo } = repository({
      rpcResponses: { admin_mutate_activation_key: { data: [{ outcome: rpcOutcome }], error: null } },
      currentHash: CURRENT_HASH,
    });

    const result = await repo.mutateActivationKey({
      entitlementId: ENTITLEMENT_ID,
      nextActivationKeyHash: NEXT_HASH,
      adminAuthUserId: ADMIN_AUTH_USER_ID,
    });

    expect(result).toEqual(expected);
  });

  it("rejects if the snapshot read itself fails", async () => {
    const { repo } = repository({
      rpcResponses: { admin_mutate_activation_key: { data: [{ outcome: "replaced" }], error: null } },
      currentHash: { error: new Error("connection reset") },
    });

    await expect(
      repo.mutateActivationKey({
        entitlementId: ENTITLEMENT_ID,
        nextActivationKeyHash: NEXT_HASH,
        adminAuthUserId: ADMIN_AUTH_USER_ID,
      }),
    ).rejects.toThrow("connection reset");
  });

  it("rejects on a genuine RPC error rather than reporting a business outcome", async () => {
    const { repo } = repository({
      rpcResponses: { admin_mutate_activation_key: { data: null, error: new Error("connection reset") } },
      currentHash: CURRENT_HASH,
    });

    await expect(
      repo.mutateActivationKey({
        entitlementId: ENTITLEMENT_ID,
        nextActivationKeyHash: NEXT_HASH,
        adminAuthUserId: ADMIN_AUTH_USER_ID,
      }),
    ).rejects.toThrow("connection reset");
  });

  it("rejects if the RPC returns no row at all", async () => {
    const { repo } = repository({
      rpcResponses: { admin_mutate_activation_key: { data: [], error: null } },
      currentHash: CURRENT_HASH,
    });

    await expect(
      repo.mutateActivationKey({
        entitlementId: ENTITLEMENT_ID,
        nextActivationKeyHash: NEXT_HASH,
        adminAuthUserId: ADMIN_AUTH_USER_ID,
      }),
    ).rejects.toThrow();
  });
});

describe("SupabaseAdminEntitlementRepository — revokeEntitlement", () => {
  it("calls admin_revoke_entitlement with exactly the expected arguments — no hash read at all", async () => {
    const { repo, calls, hashReadsFor } = repository({
      rpcResponses: {
        admin_revoke_entitlement: { data: [{ outcome: "revoked", blocking_status: null }], error: null },
      },
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
    // Revocation's own concurrency safety is the status transition
    // itself (available -> revoked), not a hash CAS — no snapshot read
    // is needed or performed.
    expect(hashReadsFor).toEqual([]);
  });

  it("maps a successful revoke", async () => {
    const { repo } = repository({
      rpcResponses: {
        admin_revoke_entitlement: { data: [{ outcome: "revoked", blocking_status: null }], error: null },
      },
    });

    expect(
      await repo.revokeEntitlement({ entitlementId: ENTITLEMENT_ID, adminAuthUserId: ADMIN_AUTH_USER_ID }),
    ).toEqual({ status: "revoked" });
  });

  it("maps not_found", async () => {
    const { repo } = repository({
      rpcResponses: {
        admin_revoke_entitlement: { data: [{ outcome: "not_found", blocking_status: null }], error: null },
      },
    });

    expect(
      await repo.revokeEntitlement({ entitlementId: ENTITLEMENT_ID, adminAuthUserId: ADMIN_AUTH_USER_ID }),
    ).toEqual({ status: "notFound" });
  });

  it.each(["redeemed", "revoked"] as const)(
    "maps not_available with blocking_status=%s",
    async (blockingStatus) => {
      const { repo } = repository({
        rpcResponses: {
          admin_revoke_entitlement: {
            data: [{ outcome: "not_available", blocking_status: blockingStatus }],
            error: null,
          },
        },
      });

      expect(
        await repo.revokeEntitlement({ entitlementId: ENTITLEMENT_ID, adminAuthUserId: ADMIN_AUTH_USER_ID }),
      ).toEqual({ status: "notAvailable", blockingStatus });
    },
  );

  it("rejects if not_available comes back with an unrecognised blocking_status", async () => {
    const { repo } = repository({
      rpcResponses: {
        admin_revoke_entitlement: {
          data: [{ outcome: "not_available", blocking_status: "available" }],
          error: null,
        },
      },
    });

    await expect(
      repo.revokeEntitlement({ entitlementId: ENTITLEMENT_ID, adminAuthUserId: ADMIN_AUTH_USER_ID }),
    ).rejects.toThrow();
  });

  it("rejects on a genuine RPC error rather than reporting a business outcome", async () => {
    const { repo } = repository({
      rpcResponses: { admin_revoke_entitlement: { data: null, error: new Error("connection reset") } },
    });

    await expect(
      repo.revokeEntitlement({ entitlementId: ENTITLEMENT_ID, adminAuthUserId: ADMIN_AUTH_USER_ID }),
    ).rejects.toThrow("connection reset");
  });
});

describe("SupabaseAdminEntitlementRepository — it never mutates outside an RPC", () => {
  it("exposes no method besides the two audited RPC calls and the CAS snapshot read", () => {
    // readCurrentActivationKeyHash is `private` in TypeScript (compile-time
    // only — it is still a normal prototype method here), and it is a
    // READ: it never writes, so it does not weaken the claim this test
    // makes. A future method that isn't one of these names would still
    // be caught.
    const methods = Object.getOwnPropertyNames(SupabaseAdminEntitlementRepository.prototype);
    expect(methods.sort()).toEqual([
      "constructor",
      "mutateActivationKey",
      "readCurrentActivationKeyHash",
      "revokeEntitlement",
    ]);
  });
});
