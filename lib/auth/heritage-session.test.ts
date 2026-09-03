import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Mission 014 (correction) — the request boundary must derive its actor
 * from the validated Supabase session, and offer no way for a caller to
 * supply an identity.
 *
 * The bug this file guards against was not a wrong comparison; it was a
 * signature. `authorizeMemorialForRequest(memorialId, actor?)` let a
 * caller pass the very thing the boundary exists to establish. Its
 * docstring argued the parameter was safe because `HeritageActor` is
 * only produced by `resolveHeritageActor` — but TypeScript is
 * structural, so any object of that shape qualifies, and a forged one
 * carrying an attacker-chosen `owner.id` would have been accepted.
 *
 * Two independent guards below: a behavioural one (a forged actor pushed
 * in from untyped JavaScript is ignored), and a source-level one (the
 * exported boundary declares exactly one parameter). The first proves
 * today's behaviour; the second fails loudly if somebody re-adds the
 * convenience parameter, even before it is ever exploited.
 */

const {
  getAuthenticatedUser,
  createServiceRoleSupabaseClient,
  findByAuthUserId,
  findOwnerIdForMemorial,
} = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
  createServiceRoleSupabaseClient: vi.fn(() => ({})),
  findByAuthUserId: vi.fn(),
  findOwnerIdForMemorial: vi.fn(),
}));

vi.mock("@/lib/supabase/session", () => ({ getAuthenticatedUser }));
vi.mock("@/lib/supabase/service-role-client", () => ({ createServiceRoleSupabaseClient }));
vi.mock("@/lib/adapters/supabase/owner-repository", () => ({
  SupabaseOwnerRepository: class {
    findByAuthUserId = findByAuthUserId;
  },
}));
vi.mock("@/lib/adapters/supabase/memorial-ownership-repository", () => ({
  SupabaseMemorialOwnershipRepository: class {
    findOwnerIdForMemorial = findOwnerIdForMemorial;
  },
}));

// Imported after the mocks above are registered.
const { authorizeMemorialForRequest, getHeritageActor } = await import("./heritage-session");

const OWNER_A = {
  id: "owner-a",
  authUserId: "auth-a",
  email: "a@example.test",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const MEMORIAL_OF_B = "memorial-b";

/** What an attacker-controlled caller would try to hand in. */
const FORGED_OWNER_ACTOR = {
  audience: "owner",
  identity: { id: "auth-attacker", email: "attacker@example.test", app_metadata: {} },
  owner: { ...OWNER_A, id: "owner-b" },
  isHeritageAdmin: true,
};

function signedInAs(authUserId: string, appMetadata: Record<string, unknown> = {}) {
  getAuthenticatedUser.mockResolvedValue({
    id: authUserId,
    email: "a@example.test",
    app_metadata: appMetadata,
    user_metadata: { heritage_role: "admin" },
  });
}

describe("authorizeMemorialForRequest — the actor is never a parameter", () => {
  beforeEach(() => {
    getAuthenticatedUser.mockReset();
    findByAuthUserId.mockReset();
    findOwnerIdForMemorial.mockReset();
    createServiceRoleSupabaseClient.mockClear();
  });

  it("resolves the actor from the session on every call", async () => {
    signedInAs("auth-a");
    findByAuthUserId.mockResolvedValue(OWNER_A);
    findOwnerIdForMemorial.mockResolvedValue(OWNER_A.id);

    await authorizeMemorialForRequest("memorial-a");
    await authorizeMemorialForRequest("memorial-a");

    // Not resolved once and reused: twice, once per request-boundary call.
    expect(getAuthenticatedUser).toHaveBeenCalledTimes(2);
    expect(findByAuthUserId).toHaveBeenCalledTimes(2);
  });

  it("grants the session's owner access to their own memorial", async () => {
    signedInAs("auth-a");
    findByAuthUserId.mockResolvedValue(OWNER_A);
    findOwnerIdForMemorial.mockResolvedValue(OWNER_A.id);

    expect(await authorizeMemorialForRequest("memorial-a")).toEqual({
      status: "granted",
      ownerId: OWNER_A.id,
      memorialId: "memorial-a",
    });
  });

  // --- THE regression test for the reviewed defect
  it("IGNORES a forged actor passed as an extra argument from untyped code", async () => {
    // No session at all: the only correct answer is a refusal.
    getAuthenticatedUser.mockResolvedValue(null);
    findOwnerIdForMemorial.mockResolvedValue("owner-b");

    // A JavaScript caller (or a future TypeScript one, if the parameter
    // were ever re-added) pushing in an actor that owns the target.
    const callWithForgedActor = authorizeMemorialForRequest as unknown as (
      memorialId: string,
      actor?: unknown,
    ) => Promise<unknown>;

    const result = await callWithForgedActor(MEMORIAL_OF_B, FORGED_OWNER_ACTOR);

    expect(result).toEqual({ status: "denied" });
    // The forged actor did not even cause a lookup — the visitor from
    // the real session was refused before any read.
    expect(findOwnerIdForMemorial).not.toHaveBeenCalled();
  });

  it("IGNORES a forged actor even when a real, different session exists", async () => {
    signedInAs("auth-a");
    findByAuthUserId.mockResolvedValue(OWNER_A);
    // The memorial genuinely belongs to owner-b.
    findOwnerIdForMemorial.mockResolvedValue("owner-b");

    const callWithForgedActor = authorizeMemorialForRequest as unknown as (
      memorialId: string,
      actor?: unknown,
    ) => Promise<unknown>;

    const result = await callWithForgedActor(MEMORIAL_OF_B, FORGED_OWNER_ACTOR);

    // Decided against the session's owner (owner-a), never the supplied
    // one (owner-b).
    expect(result).toEqual({ status: "denied" });
    expect(findByAuthUserId).toHaveBeenCalledExactlyOnceWith("auth-a");
  });

  it("refuses when there is no session, without any ownership lookup", async () => {
    getAuthenticatedUser.mockResolvedValue(null);

    expect(await authorizeMemorialForRequest("memorial-a")).toEqual({ status: "denied" });
    expect(findByAuthUserId).not.toHaveBeenCalled();
    expect(findOwnerIdForMemorial).not.toHaveBeenCalled();
  });

  it("refuses a valid session that has no Owner row", async () => {
    signedInAs("auth-a");
    findByAuthUserId.mockResolvedValue(null);

    expect(await authorizeMemorialForRequest("memorial-a")).toEqual({ status: "denied" });
    expect(findOwnerIdForMemorial).not.toHaveBeenCalled();
  });
});

describe("getHeritageActor", () => {
  beforeEach(() => {
    getAuthenticatedUser.mockReset();
    findByAuthUserId.mockReset();
  });

  it("takes no parameters at all — there is nothing a caller could inject", () => {
    expect(getHeritageActor.length).toBe(0);
  });

  it("drops user_metadata before the actor is built", async () => {
    // The mocked session above always carries
    // user_metadata.heritage_role = "admin". It must never promote.
    signedInAs("auth-a");
    findByAuthUserId.mockResolvedValue(OWNER_A);

    const actor = await getHeritageActor();

    expect(actor.audience).toBe("owner");
    expect(actor.isHeritageAdmin).toBe(false);
    expect(actor.identity).not.toHaveProperty("user_metadata");
  });

  it("recognises an Admin from app_metadata", async () => {
    signedInAs("auth-a", { provider: "email", heritage_role: "admin" });
    findByAuthUserId.mockResolvedValue(OWNER_A);

    expect((await getHeritageActor()).isHeritageAdmin).toBe(true);
  });

  it("yields a visitor with no session, and looks up no owner", async () => {
    getAuthenticatedUser.mockResolvedValue(null);

    expect(await getHeritageActor()).toEqual({
      audience: "visitor",
      identity: null,
      owner: null,
      isHeritageAdmin: false,
    });
    expect(findByAuthUserId).not.toHaveBeenCalled();
  });
});

/**
 * The behavioural tests above prove today's code ignores an injected
 * actor. This one fails the moment somebody re-declares the parameter,
 * which is the regression worth catching early — a convenience parameter
 * looks harmless in review, and structural typing means the compiler
 * will never object to a forged value being passed to it.
 */
describe("the request boundary's declared signature", () => {
  const SOURCE = readFileSync(
    path.resolve(import.meta.dirname, "heritage-session.ts"),
    "utf8",
  );

  it("declares exactly one parameter on authorizeMemorialForRequest", () => {
    const match = SOURCE.match(
      /export async function authorizeMemorialForRequest\(([\s\S]*?)\):/,
    );

    expect(match).not.toBeNull();

    const parameters = (match as RegExpMatchArray)[1]
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    expect(parameters).toEqual(["memorialId: string"]);
  });

  it("never mentions HeritageActor as a parameter of an exported boundary function", () => {
    for (const signature of SOURCE.matchAll(/export async function \w+\(([\s\S]*?)\):/g)) {
      expect(signature[1]).not.toMatch(/HeritageActor/);
    }
  });
});
