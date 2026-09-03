import { describe, expect, it, vi } from "vitest";
import type { Owner } from "@/types/owner";
import type { MemorialOwnershipRepository } from "@/lib/adapters/memorial-ownership-repository";
import { authorizeMemorialAccess } from "./memorial-access";
import {
  resolveHeritageActor,
  VISITOR,
  type HeritageActor,
  type HeritageIdentity,
} from "./heritage-actor";
import { HERITAGE_ADMIN_ROLE, HERITAGE_ROLE_METADATA_KEY } from "./heritage-admin";

/**
 * Mission 014 — the ownership boundary. Owner A must never reach owner
 * B's memorial, by any route: not by guessing an id, not by being an
 * Admin, not by a memorial that does not exist.
 */

const OWNER_A: Owner = {
  id: "owner-a",
  authUserId: "auth-a",
  email: "a@example.test",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const OWNER_B: Owner = {
  ...OWNER_A,
  id: "owner-b",
  authUserId: "auth-b",
  email: "b@example.test",
};

const MEMORIAL_OF_A = "memorial-a";
const MEMORIAL_OF_B = "memorial-b";

/** The whole world of memorials, for the fake repository below. */
const MEMORIAL_OWNERS: Record<string, string> = {
  [MEMORIAL_OF_A]: OWNER_A.id,
  [MEMORIAL_OF_B]: OWNER_B.id,
};

function ownershipRepository(): MemorialOwnershipRepository & {
  findOwnerIdForMemorial: ReturnType<typeof vi.fn>;
} {
  return {
    findOwnerIdForMemorial: vi.fn(async (memorialId: string) =>
      Object.hasOwn(MEMORIAL_OWNERS, memorialId) ? MEMORIAL_OWNERS[memorialId] : null,
    ),
  };
}

function identityFor(owner: Owner, admin = false): HeritageIdentity {
  return {
    id: owner.authUserId as string,
    email: owner.email,
    app_metadata: admin
      ? { provider: "email", [HERITAGE_ROLE_METADATA_KEY]: HERITAGE_ADMIN_ROLE }
      : { provider: "email" },
  } as HeritageIdentity;
}

async function actorFor(owner: Owner | null, admin = false): Promise<HeritageActor> {
  const reference = owner ?? OWNER_A;
  return resolveHeritageActor(
    { findByAuthUserId: async () => owner },
    identityFor(reference, admin),
  );
}

describe("authorizeMemorialAccess", () => {
  it("grants an owner access to their own memorial", async () => {
    const memorialOwnershipRepository = ownershipRepository();

    const result = await authorizeMemorialAccess(
      { memorialOwnershipRepository },
      await actorFor(OWNER_A),
      MEMORIAL_OF_A,
    );

    expect(result).toEqual({
      status: "granted",
      ownerId: OWNER_A.id,
      memorialId: MEMORIAL_OF_A,
    });
  });

  // --- the central guarantee of this mission
  it("owner A can NEVER reach owner B's memorial", async () => {
    const memorialOwnershipRepository = ownershipRepository();

    const result = await authorizeMemorialAccess(
      { memorialOwnershipRepository },
      await actorFor(OWNER_A),
      MEMORIAL_OF_B,
    );

    expect(result).toEqual({ status: "denied" });
  });

  it("the refusal for someone else's memorial is indistinguishable from one that does not exist", async () => {
    const memorialOwnershipRepository = ownershipRepository();
    const actor = await actorFor(OWNER_A);

    const somebodyElses = await authorizeMemorialAccess(
      { memorialOwnershipRepository },
      actor,
      MEMORIAL_OF_B,
    );
    const nonexistent = await authorizeMemorialAccess(
      { memorialOwnershipRepository },
      actor,
      "memorial-that-never-existed",
    );

    expect(somebodyElses).toEqual(nonexistent);
  });

  it("refuses a visitor, without even performing a lookup", async () => {
    const memorialOwnershipRepository = ownershipRepository();

    const result = await authorizeMemorialAccess(
      { memorialOwnershipRepository },
      VISITOR,
      MEMORIAL_OF_A,
    );

    expect(result).toEqual({ status: "denied" });
    expect(memorialOwnershipRepository.findOwnerIdForMemorial).not.toHaveBeenCalled();
  });

  it("refuses an authenticated user with no Owner row", async () => {
    const memorialOwnershipRepository = ownershipRepository();

    const result = await authorizeMemorialAccess(
      { memorialOwnershipRepository },
      await actorFor(null),
      MEMORIAL_OF_A,
    );

    expect(result).toEqual({ status: "denied" });
    expect(memorialOwnershipRepository.findOwnerIdForMemorial).not.toHaveBeenCalled();
  });

  // --- staff are not super-owners
  it("a HERITAGE Admin gets NO bypass on somebody else's memorial", async () => {
    const memorialOwnershipRepository = ownershipRepository();
    const admin = await actorFor(OWNER_A, true);

    expect(admin.isHeritageAdmin).toBe(true);

    const result = await authorizeMemorialAccess(
      { memorialOwnershipRepository },
      admin,
      MEMORIAL_OF_B,
    );

    expect(result).toEqual({ status: "denied" });
  });

  it("a HERITAGE Admin with no Owner row reaches nothing at all", async () => {
    const memorialOwnershipRepository = ownershipRepository();
    const admin = await actorFor(null, true);

    expect(admin.isHeritageAdmin).toBe(true);

    for (const memorialId of [MEMORIAL_OF_A, MEMORIAL_OF_B]) {
      expect(
        await authorizeMemorialAccess({ memorialOwnershipRepository }, admin, memorialId),
      ).toEqual({ status: "denied" });
    }
  });

  it("still grants an Admin access to their OWN memorial — staff status changes nothing either way", async () => {
    const memorialOwnershipRepository = ownershipRepository();

    const result = await authorizeMemorialAccess(
      { memorialOwnershipRepository },
      await actorFor(OWNER_A, true),
      MEMORIAL_OF_A,
    );

    expect(result.status).toBe("granted");
  });

  // --- degenerate ids never become a wildcard
  it("refuses an empty or blank memorial id without querying", async () => {
    const memorialOwnershipRepository = ownershipRepository();
    const actor = await actorFor(OWNER_A);

    for (const memorialId of ["", "   ", "\n"]) {
      expect(await authorizeMemorialAccess({ memorialOwnershipRepository }, actor, memorialId)).toEqual(
        { status: "denied" },
      );
    }

    expect(memorialOwnershipRepository.findOwnerIdForMemorial).not.toHaveBeenCalled();
  });

  it("refuses a non-string memorial id coming from an untyped boundary", async () => {
    const memorialOwnershipRepository = ownershipRepository();
    const actor = await actorFor(OWNER_A);

    for (const memorialId of [null, undefined, 42, {}, []]) {
      expect(
        await authorizeMemorialAccess(
          { memorialOwnershipRepository },
          actor,
          memorialId as unknown as string,
        ),
      ).toEqual({ status: "denied" });
    }

    expect(memorialOwnershipRepository.findOwnerIdForMemorial).not.toHaveBeenCalled();
  });

  // --- a failed read is not a fact
  it("lets a repository failure reject rather than answering 'denied'", async () => {
    const memorialOwnershipRepository: MemorialOwnershipRepository = {
      findOwnerIdForMemorial: vi.fn().mockRejectedValue(new Error("supabase is down")),
    };

    await expect(
      authorizeMemorialAccess(
        { memorialOwnershipRepository },
        await actorFor(OWNER_A),
        MEMORIAL_OF_A,
      ),
    ).rejects.toThrow("supabase is down");
  });

  it("passes the memorial id through untouched, and no owner id, to the repository", async () => {
    const memorialOwnershipRepository = ownershipRepository();

    await authorizeMemorialAccess(
      { memorialOwnershipRepository },
      await actorFor(OWNER_A),
      MEMORIAL_OF_A,
    );

    // One argument. The repository is never told which owner is asking,
    // so it can never be the thing that decides.
    expect(memorialOwnershipRepository.findOwnerIdForMemorial).toHaveBeenCalledExactlyOnceWith(
      MEMORIAL_OF_A,
    );
  });

  it("the granted owner id is the session's, never one supplied alongside the memorial id", async () => {
    const memorialOwnershipRepository = ownershipRepository();

    const result = await authorizeMemorialAccess(
      { memorialOwnershipRepository },
      await actorFor(OWNER_A),
      MEMORIAL_OF_A,
    );

    expect(result).toEqual({
      status: "granted",
      ownerId: OWNER_A.id,
      memorialId: MEMORIAL_OF_A,
    });
  });
});
