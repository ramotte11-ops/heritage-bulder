import { describe, expect, it, vi } from "vitest";
import type { Owner } from "@/types/owner";
import {
  requireHeritageAdmin,
  requireOwner,
  resolveHeritageActor,
  VISITOR,
  type HeritageIdentity,
  type OwnerLookup,
} from "./heritage-actor";
import { HERITAGE_ADMIN_ROLE, HERITAGE_ROLE_METADATA_KEY } from "./heritage-admin";

const OWNER_A: Owner = {
  id: "owner-a",
  authUserId: "auth-a",
  email: "a@example.test",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function identity(overrides: Partial<HeritageIdentity> = {}): HeritageIdentity {
  return {
    id: "auth-a",
    email: "a@example.test",
    app_metadata: { provider: "email" },
    ...overrides,
  } as HeritageIdentity;
}

function adminIdentity(): HeritageIdentity {
  return identity({
    app_metadata: { provider: "email", [HERITAGE_ROLE_METADATA_KEY]: HERITAGE_ADMIN_ROLE },
  } as Partial<HeritageIdentity>);
}

function lookup(owner: Owner | null): OwnerLookup & { findByAuthUserId: ReturnType<typeof vi.fn> } {
  return { findByAuthUserId: vi.fn().mockResolvedValue(owner) };
}

describe("resolveHeritageActor", () => {
  it("a request with no session is a visitor", async () => {
    const owners = lookup(OWNER_A);

    const actor = await resolveHeritageActor(owners, null);

    expect(actor).toEqual(VISITOR);
    // Not merely "no owner": no lookup happened at all.
    expect(owners.findByAuthUserId).not.toHaveBeenCalled();
  });

  it("a visitor is never HERITAGE staff", async () => {
    const actor = await resolveHeritageActor(lookup(null), null);

    expect(actor.isHeritageAdmin).toBe(false);
  });

  it("an identity with no auth user id is treated as a visitor, not as an owner", async () => {
    const owners = lookup(OWNER_A);

    const actor = await resolveHeritageActor(owners, identity({ id: "" }));

    expect(actor.audience).toBe("visitor");
    expect(owners.findByAuthUserId).not.toHaveBeenCalled();
  });

  it("a valid session with no Owner row resolves cleanly — not an error, and nothing created", async () => {
    const owners = lookup(null);

    const actor = await resolveHeritageActor(owners, identity());

    expect(actor.audience).toBe("authenticated");
    expect(actor.owner).toBeNull();
    // The port this module accepts has no `create` at all, so there is
    // nothing to assert "was not called" against — the absence is
    // structural. What IS assertable: the one lookup performed is by
    // auth user id.
    expect(owners.findByAuthUserId).toHaveBeenCalledExactlyOnceWith("auth-a");
  });

  it("a valid session linked to an Owner resolves to that Owner", async () => {
    const actor = await resolveHeritageActor(lookup(OWNER_A), identity());

    expect(actor.audience).toBe("owner");
    expect(actor.owner).toEqual(OWNER_A);
  });

  it("resolves the owner by auth user id only — never by email", async () => {
    const owners = lookup(OWNER_A);

    await resolveHeritageActor(owners, identity({ email: "somebody-else@example.test" }));

    expect(owners.findByAuthUserId).toHaveBeenCalledExactlyOnceWith("auth-a");
    // The lookup type exposes nothing else; this asserts the value we
    // actually passed is the identity's id, not the address.
    expect(owners.findByAuthUserId).not.toHaveBeenCalledWith("somebody-else@example.test");
  });

  it("carries the Admin flag for an owner and for a session with no owner", async () => {
    const asOwner = await resolveHeritageActor(lookup(OWNER_A), adminIdentity());
    const asAuthenticated = await resolveHeritageActor(lookup(null), adminIdentity());

    expect(asOwner.isHeritageAdmin).toBe(true);
    expect(asAuthenticated.isHeritageAdmin).toBe(true);
    // Being staff does not invent an Owner.
    expect(asAuthenticated.owner).toBeNull();
  });

  it("a repository failure rejects — it never degrades into 'visitor'", async () => {
    const owners: OwnerLookup = {
      findByAuthUserId: vi.fn().mockRejectedValue(new Error("supabase is down")),
    };

    await expect(resolveHeritageActor(owners, identity())).rejects.toThrow("supabase is down");
  });
});

describe("requireOwner", () => {
  it("refuses a visitor, and says it is a session problem", async () => {
    const actor = await resolveHeritageActor(lookup(null), null);

    expect(requireOwner(actor)).toEqual({ status: "deniedNoSession" });
  });

  it("refuses an authenticated user with no Owner, distinguishably", async () => {
    const actor = await resolveHeritageActor(lookup(null), identity());

    expect(requireOwner(actor)).toEqual({ status: "deniedNoOwner" });
  });

  it("grants an owner", async () => {
    const actor = await resolveHeritageActor(lookup(OWNER_A), identity());

    expect(requireOwner(actor)).toEqual({ status: "granted", owner: OWNER_A });
  });

  it("being HERITAGE staff is NOT a way past the owner gate", async () => {
    // An admin with no Owner row is refused exactly like anybody else.
    const actor = await resolveHeritageActor(lookup(null), adminIdentity());

    expect(actor.isHeritageAdmin).toBe(true);
    expect(requireOwner(actor)).toEqual({ status: "deniedNoOwner" });
  });
});

describe("requireHeritageAdmin", () => {
  it("grants an Admin recognised by the defined mechanism", async () => {
    const actor = await resolveHeritageActor(lookup(OWNER_A), adminIdentity());

    const result = requireHeritageAdmin(actor);

    expect(result.status).toBe("granted");
  });

  it("grants an Admin who owns nothing — staff need no memorial", async () => {
    const actor = await resolveHeritageActor(lookup(null), adminIdentity());

    expect(requireHeritageAdmin(actor).status).toBe("granted");
  });

  it("refuses an ordinary authenticated user", async () => {
    const actor = await resolveHeritageActor(lookup(null), identity());

    expect(requireHeritageAdmin(actor)).toEqual({ status: "denied" });
  });

  it("refuses a legitimate owner — owning memorials is not being staff", async () => {
    const actor = await resolveHeritageActor(lookup(OWNER_A), identity());

    expect(actor.audience).toBe("owner");
    expect(requireHeritageAdmin(actor)).toEqual({ status: "denied" });
  });

  it("refuses a visitor", async () => {
    const actor = await resolveHeritageActor(lookup(null), null);

    expect(requireHeritageAdmin(actor)).toEqual({ status: "denied" });
  });

  it("refuses a user who declared the role in their own user_metadata", async () => {
    const selfDeclared = {
      id: "auth-a",
      email: "a@example.test",
      app_metadata: { provider: "email" },
      user_metadata: { [HERITAGE_ROLE_METADATA_KEY]: HERITAGE_ADMIN_ROLE },
    } as unknown as HeritageIdentity;

    const actor = await resolveHeritageActor(lookup(OWNER_A), selfDeclared);

    expect(actor.isHeritageAdmin).toBe(false);
    expect(requireHeritageAdmin(actor)).toEqual({ status: "denied" });
  });
});
