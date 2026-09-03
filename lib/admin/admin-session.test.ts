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
} = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
  createServiceRoleSupabaseClient: vi.fn(() => ({})),
  findByAuthUserId: vi.fn(),
  supportRepositoryConstructed: vi.fn(),
  findOwnerByEmail: vi.fn(),
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

const { requireAdminForRequest, runAdminSupportSearch } = await import("./admin-session");

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
