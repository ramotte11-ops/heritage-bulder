import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Mission 015A — the Admin gate.
 *
 * Two properties, both load-bearing: only HERITAGE staff get through,
 * and a refused request performs no support read at all. The second
 * matters as much as the first — a gate that refuses the RESULT but
 * still runs the query has already read a family's record.
 */

const {
  getAuthenticatedUser,
  createServiceRoleSupabaseClient,
  findByAuthUserId,
  supportRepositoryConstructed,
  findOwnerByEmail,
  entitlementRepositoryConstructed,
  mutateActivationKey,
  revokeEntitlement,
} = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
  createServiceRoleSupabaseClient: vi.fn(() => ({})),
  findByAuthUserId: vi.fn(),
  supportRepositoryConstructed: vi.fn(),
  findOwnerByEmail: vi.fn(),
  entitlementRepositoryConstructed: vi.fn(),
  mutateActivationKey: vi.fn(),
  revokeEntitlement: vi.fn(),
}));

vi.mock("@/lib/supabase/session", () => ({ getAuthenticatedUser }));
vi.mock("@/lib/supabase/service-role-client", () => ({ createServiceRoleSupabaseClient }));
vi.mock("@/lib/adapters/supabase/owner-repository", () => ({
  SupabaseOwnerRepository: class {
    findByAuthUserId = findByAuthUserId;
  },
}));
vi.mock("@/lib/adapters/supabase/admin-support-repository", () => ({
  SupabaseAdminSupportRepository: class {
    constructor() {
      supportRepositoryConstructed();
    }
    findOwnerByEmail = findOwnerByEmail;
    findOwnerById = vi.fn();
    findEntitlementById = vi.fn();
    findEntitlementsByOwnerId = vi.fn(async () => []);
    findMemorialSummaryById = vi.fn();
    findMemorialSummaryByEntitlementId = vi.fn();
  },
}));
vi.mock("@/lib/adapters/supabase/admin-entitlement-repository", () => ({
  SupabaseAdminEntitlementRepository: class {
    constructor() {
      entitlementRepositoryConstructed();
    }
    mutateActivationKey = mutateActivationKey;
    revokeEntitlement = revokeEntitlement;
  },
}));

const {
  requireAdminForRequest,
  runAdminSupportSearch,
  runAdminActivationKeyReplace,
  runAdminActivationKeyInvalidate,
  runAdminEntitlementRevoke,
} = await import("./admin-session");

const OWNER = {
  id: "11111111-1111-4111-8111-111111111111",
  authUserId: "auth-a",
  email: "famille@example.test",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function signedIn({ admin, owner }: { admin: boolean; owner: boolean }) {
  getAuthenticatedUser.mockResolvedValue({
    id: "auth-a",
    email: "staff@example.test",
    app_metadata: admin ? { provider: "email", heritage_role: "admin" } : { provider: "email" },
    // Always present, always ignored: user_metadata is writable by the
    // user themselves, so it must never open the Admin area.
    user_metadata: { heritage_role: "admin" },
  });
  findByAuthUserId.mockResolvedValue(owner ? OWNER : null);
}

const A_QUERY = { kind: "ownerEmail", value: OWNER.email } as const;

describe("requireAdminForRequest", () => {
  beforeEach(() => {
    getAuthenticatedUser.mockReset();
    findByAuthUserId.mockReset();
  });

  it("takes no parameters — no role or identity can be injected", () => {
    expect(requireAdminForRequest.length).toBe(0);
  });

  it("refuses a visitor", async () => {
    getAuthenticatedUser.mockResolvedValue(null);

    expect(await requireAdminForRequest()).toEqual({ status: "denied" });
  });

  it("refuses an authenticated user who is not staff", async () => {
    signedIn({ admin: false, owner: false });

    expect(await requireAdminForRequest()).toEqual({ status: "denied" });
  });

  it("refuses an ordinary owner — owning memorials is not being staff", async () => {
    signedIn({ admin: false, owner: true });

    expect(await requireAdminForRequest()).toEqual({ status: "denied" });
  });

  it("refuses a user whose own user_metadata claims the role", async () => {
    // signedIn() always sets user_metadata.heritage_role = "admin";
    // only app_metadata may grant.
    signedIn({ admin: false, owner: true });

    expect(await requireAdminForRequest()).toEqual({ status: "denied" });
  });

  it("grants staff recognised by app_metadata", async () => {
    signedIn({ admin: true, owner: false });

    expect(await requireAdminForRequest()).toEqual({ status: "granted" });
  });

  it("grants staff who also happen to be an owner", async () => {
    signedIn({ admin: true, owner: true });

    expect(await requireAdminForRequest()).toEqual({ status: "granted" });
  });
});

describe("runAdminSupportSearch", () => {
  beforeEach(() => {
    getAuthenticatedUser.mockReset();
    findByAuthUserId.mockReset();
    supportRepositoryConstructed.mockReset();
    findOwnerByEmail.mockReset();
    createServiceRoleSupabaseClient.mockClear();
  });

  it("refuses a visitor WITHOUT building a client or reading anything", async () => {
    getAuthenticatedUser.mockResolvedValue(null);

    expect(await runAdminSupportSearch(A_QUERY)).toEqual({ status: "denied" });
    expect(supportRepositoryConstructed).not.toHaveBeenCalled();
    expect(createServiceRoleSupabaseClient).not.toHaveBeenCalled();
    expect(findOwnerByEmail).not.toHaveBeenCalled();
  });

  it("refuses a non-Admin owner without reading anything", async () => {
    signedIn({ admin: false, owner: true });

    expect(await runAdminSupportSearch(A_QUERY)).toEqual({ status: "denied" });
    expect(supportRepositoryConstructed).not.toHaveBeenCalled();
    expect(findOwnerByEmail).not.toHaveBeenCalled();
  });

  it("runs the search for staff", async () => {
    signedIn({ admin: true, owner: false });
    findOwnerByEmail.mockResolvedValue(OWNER);

    const outcome = await runAdminSupportSearch(A_QUERY);

    expect(outcome.status).toBe("completed");
    if (outcome.status !== "completed") return;
    expect(outcome.result.status).toBe("found");
    expect(supportRepositoryConstructed).toHaveBeenCalledTimes(1);
  });

  it("re-resolves the session on every call — the gate is inside, not in front", async () => {
    signedIn({ admin: true, owner: false });
    findOwnerByEmail.mockResolvedValue(OWNER);

    await runAdminSupportSearch(A_QUERY);
    await runAdminSupportSearch(A_QUERY);

    expect(getAuthenticatedUser).toHaveBeenCalledTimes(2);
  });

  it("takes only the query — there is no actor or role parameter", () => {
    expect(runAdminSupportSearch.length).toBe(1);
  });

  it("still refuses when the query is well-formed and the caller is not staff", async () => {
    signedIn({ admin: false, owner: false });

    for (const query of [
      { kind: "ownerEmail", value: OWNER.email },
      { kind: "entitlementId", value: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
      { kind: "memorialId", value: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" },
    ] as const) {
      expect(await runAdminSupportSearch(query)).toEqual({ status: "denied" });
    }

    expect(supportRepositoryConstructed).not.toHaveBeenCalled();
  });
});

const ENTITLEMENT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
// The auth user id signedIn() puts on the session — this must be exactly
// what reaches the repository as adminAuthUserId, since it is what the
// audit row is attributed to.
const ADMIN_AUTH_USER_ID = "auth-a";

describe("the three Mission 015B mutation entry points", () => {
  beforeEach(() => {
    getAuthenticatedUser.mockReset();
    findByAuthUserId.mockReset();
    entitlementRepositoryConstructed.mockReset();
    mutateActivationKey.mockReset();
    revokeEntitlement.mockReset();
    createServiceRoleSupabaseClient.mockClear();
  });

  const ENTRY_POINTS = [
    {
      name: "runAdminActivationKeyReplace",
      run: runAdminActivationKeyReplace,
      resolve: () => mutateActivationKey.mockResolvedValue({ status: "replaced" }),
    },
    {
      name: "runAdminActivationKeyInvalidate",
      run: runAdminActivationKeyInvalidate,
      resolve: () => mutateActivationKey.mockResolvedValue({ status: "invalidated" }),
    },
    {
      name: "runAdminEntitlementRevoke",
      run: runAdminEntitlementRevoke,
      resolve: () => revokeEntitlement.mockResolvedValue({ status: "revoked" }),
    },
  ] as const;

  for (const { name, run, resolve } of ENTRY_POINTS) {
    it(`${name} takes only an entitlementId — there is no actor, role or admin identity parameter`, () => {
      expect(run.length).toBe(1);
    });

    it(`${name} refuses a visitor WITHOUT building a client or calling the repository`, async () => {
      getAuthenticatedUser.mockResolvedValue(null);

      expect(await run(ENTITLEMENT_ID)).toEqual({ status: "denied" });
      expect(entitlementRepositoryConstructed).not.toHaveBeenCalled();
      expect(createServiceRoleSupabaseClient).not.toHaveBeenCalled();
      expect(mutateActivationKey).not.toHaveBeenCalled();
      expect(revokeEntitlement).not.toHaveBeenCalled();
    });

    it(`${name} refuses a non-Admin owner without calling the repository`, async () => {
      signedIn({ admin: false, owner: true });

      expect(await run(ENTITLEMENT_ID)).toEqual({ status: "denied" });
      expect(entitlementRepositoryConstructed).not.toHaveBeenCalled();
    });

    it(`${name} re-resolves the session on every call — the gate is inside, not in front`, async () => {
      signedIn({ admin: true, owner: false });
      resolve();

      await run(ENTITLEMENT_ID);
      await run(ENTITLEMENT_ID);

      expect(getAuthenticatedUser).toHaveBeenCalledTimes(2);
    });
  }

  it("runAdminActivationKeyReplace passes the admin's own auth user id, never anything else", async () => {
    signedIn({ admin: true, owner: false });
    mutateActivationKey.mockResolvedValue({ status: "replaced" });

    const outcome = await runAdminActivationKeyReplace(ENTITLEMENT_ID);

    expect(outcome).toEqual({
      status: "completed",
      result: { status: "replaced", rawActivationKey: expect.stringMatching(/^HH1-/) },
    });
    expect(mutateActivationKey).toHaveBeenCalledExactlyOnceWith({
      entitlementId: ENTITLEMENT_ID,
      nextActivationKeyHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      adminAuthUserId: ADMIN_AUTH_USER_ID,
    });
    expect(entitlementRepositoryConstructed).toHaveBeenCalledTimes(1);
  });

  it("runAdminActivationKeyInvalidate sends a null hash and the admin's auth user id", async () => {
    signedIn({ admin: true, owner: false });
    mutateActivationKey.mockResolvedValue({ status: "invalidated" });

    const outcome = await runAdminActivationKeyInvalidate(ENTITLEMENT_ID);

    expect(outcome).toEqual({ status: "completed", result: { status: "invalidated" } });
    expect(mutateActivationKey).toHaveBeenCalledExactlyOnceWith({
      entitlementId: ENTITLEMENT_ID,
      nextActivationKeyHash: null,
      adminAuthUserId: ADMIN_AUTH_USER_ID,
    });
  });

  it("runAdminEntitlementRevoke passes the entitlement id and the admin's auth user id", async () => {
    signedIn({ admin: true, owner: false });
    revokeEntitlement.mockResolvedValue({ status: "revoked" });

    const outcome = await runAdminEntitlementRevoke(ENTITLEMENT_ID);

    expect(outcome).toEqual({ status: "completed", result: { status: "revoked" } });
    expect(revokeEntitlement).toHaveBeenCalledExactlyOnceWith({
      entitlementId: ENTITLEMENT_ID,
      adminAuthUserId: ADMIN_AUTH_USER_ID,
    });
  });
});
