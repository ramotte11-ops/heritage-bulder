import { describe, expect, it, vi } from "vitest";
import type { OwnerRepository } from "@/lib/adapters/owner-repository";
import type { Owner } from "@/types/owner";
import { resolveOwnerForIdentity, type AuthenticatedIdentity } from "./resolve-owner";

/**
 * Mission 011B — the security half. Every case below is about one rule:
 * a matching email is never proof of identity, so the only link this
 * code creates is between an auth user and a NEW owner row.
 */

const AUTH_USER_ID = "auth-user-1";

function identity(overrides: Partial<AuthenticatedIdentity> = {}): AuthenticatedIdentity {
  return {
    id: AUTH_USER_ID,
    email: "famille@example.test",
    email_confirmed_at: "2026-09-01T10:00:00.000Z",
    is_anonymous: false,
    ...overrides,
  };
}

function owner(overrides: Partial<Owner> = {}): Owner {
  return {
    id: "owner-1",
    authUserId: AUTH_USER_ID,
    email: "famille@example.test",
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-09-01T10:00:00.000Z",
    ...overrides,
  };
}

/** Repository stub. Every method must be configured explicitly by the
 * test that needs it, so an unexpected call is a loud failure rather
 * than a silent default. */
function repository(overrides: Partial<OwnerRepository> = {}): OwnerRepository {
  return {
    findByAuthUserId: vi.fn().mockResolvedValue(null),
    findByEmail: vi.fn().mockResolvedValue(null),
    create: vi.fn(async () => {
      throw new Error("create() was not expected to be called");
    }),
    ...overrides,
  };
}

describe("resolveOwnerForIdentity — case A: already linked", () => {
  it("reuses the owner linked to this auth user and never creates one", async () => {
    const existing = owner();
    const create = vi.fn();
    const findByEmail = vi.fn();
    const repo = repository({
      findByAuthUserId: vi.fn().mockResolvedValue(existing),
      findByEmail,
      create,
    });

    const result = await resolveOwnerForIdentity(repo, identity());

    expect(result).toEqual({ status: "resolved", owner: existing });
    expect(create).not.toHaveBeenCalled();
    // Identity is settled by auth_user_id alone — email is never even
    // consulted once the link exists.
    expect(findByEmail).not.toHaveBeenCalled();
  });
});

describe("resolveOwnerForIdentity — case B: first redemption", () => {
  it("creates an owner when nothing is linked and no email collides", async () => {
    const created = owner({ id: "owner-new" });
    const create = vi.fn().mockResolvedValue({ status: "created", owner: created });
    const repo = repository({ create });

    const result = await resolveOwnerForIdentity(repo, identity());

    expect(result).toEqual({ status: "resolved", owner: created });
    expect(create).toHaveBeenCalledWith({
      authUserId: AUTH_USER_ID,
      email: "famille@example.test",
    });
  });

  it("stores the email lowercased, matching owners_email_key's lower(email)", async () => {
    const create = vi.fn().mockResolvedValue({ status: "created", owner: owner() });
    const findByEmail = vi.fn().mockResolvedValue(null);
    const repo = repository({ create, findByEmail });

    await resolveOwnerForIdentity(repo, identity({ email: "  Famille@Example.TEST  " }));

    expect(findByEmail).toHaveBeenCalledWith("famille@example.test");
    expect(create).toHaveBeenCalledWith({
      authUserId: AUTH_USER_ID,
      email: "famille@example.test",
    });
  });

  it("resolves to the winner's row when a concurrent first redemption won the race", async () => {
    // The unique index on auth_user_id rejected our insert; the row that
    // won is ours, so re-reading finds it. No second insert is attempted.
    const winner = owner({ id: "owner-created-by-the-other-request" });
    const findByAuthUserId = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(winner);
    const create = vi.fn().mockResolvedValue({ status: "conflict" });
    const repo = repository({ findByAuthUserId, create });

    const result = await resolveOwnerForIdentity(repo, identity());

    expect(result).toEqual({ status: "resolved", owner: winner });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("reports a link conflict when the insert lost to an unlinked row appearing mid-flight", async () => {
    // The email index rejected the insert, and what is there is an
    // unlinked owner — case C, discovered through the race rather than
    // by the first read.
    const findByEmail = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(owner({ authUserId: null }));
    const repo = repository({
      findByEmail,
      create: vi.fn().mockResolvedValue({ status: "conflict" }),
    });

    const result = await resolveOwnerForIdentity(repo, identity());

    expect(result).toEqual({ status: "ownerLinkConflict" });
  });

  it("refuses rather than inventing an owner when a conflict cannot be explained", async () => {
    const repo = repository({ create: vi.fn().mockResolvedValue({ status: "conflict" }) });

    const result = await resolveOwnerForIdentity(repo, identity());

    expect(result.status).toBe("invalidAuthenticatedIdentity");
  });
});

describe("resolveOwnerForIdentity — case C: unlinked owner at the same email", () => {
  it("never auto-links an owner whose auth_user_id is null", async () => {
    const create = vi.fn();
    const repo = repository({
      findByEmail: vi.fn().mockResolvedValue(owner({ id: "owner-preexisting", authUserId: null })),
      create,
    });

    const result = await resolveOwnerForIdentity(repo, identity());

    expect(result).toEqual({ status: "ownerLinkConflict" });
    expect(create).not.toHaveBeenCalled();
  });
});

describe("resolveOwnerForIdentity — case D: the email belongs to someone else", () => {
  it("refuses when the email is already linked to a different auth user", async () => {
    const create = vi.fn();
    const repo = repository({
      findByEmail: vi.fn().mockResolvedValue(owner({ authUserId: "a-different-auth-user" })),
      create,
    });

    const result = await resolveOwnerForIdentity(repo, identity());

    expect(result).toEqual({ status: "ownerIdentityConflict" });
    expect(create).not.toHaveBeenCalled();
  });
});

describe("resolveOwnerForIdentity — case E: unusable identity", () => {
  it.each([
    ["an anonymous session", identity({ is_anonymous: true })],
    ["no email at all", identity({ email: undefined })],
    ["an empty email", identity({ email: "   " })],
    ["a malformed email", identity({ email: "not-an-email" })],
    ["an unconfirmed email", identity({ email_confirmed_at: undefined })],
    ["no auth user id", identity({ id: "" })],
  ])("refuses %s without touching the database", async (_label, badIdentity) => {
    const findByAuthUserId = vi.fn();
    const findByEmail = vi.fn();
    const create = vi.fn();
    const repo = repository({ findByAuthUserId, findByEmail, create });

    const result = await resolveOwnerForIdentity(repo, badIdentity);

    expect(result.status).toBe("invalidAuthenticatedIdentity");
    expect(findByAuthUserId).not.toHaveBeenCalled();
    expect(findByEmail).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
});
