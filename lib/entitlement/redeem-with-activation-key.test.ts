import { describe, expect, it, vi } from "vitest";
import type { EntitlementRepository } from "@/lib/adapters/entitlement-repository";
import type { OwnerRepository } from "@/lib/adapters/owner-repository";
import type { Entitlement } from "@/types/entitlement";
import type { Owner } from "@/types/owner";
import { generateActivationKey, hashActivationKey, parseActivationKey } from "./activation-key";
import { redeemActivationKey } from "./redeem-with-activation-key";
import type { AuthenticatedIdentity } from "./resolve-owner";

const IDENTITY: AuthenticatedIdentity = {
  id: "auth-user-1",
  email: "famille@example.test",
  email_confirmed_at: "2026-09-01T10:00:00.000Z",
  is_anonymous: false,
};

const OWNER: Owner = {
  id: "owner-1",
  authUserId: "auth-user-1",
  email: "famille@example.test",
  createdAt: "2026-09-01T10:00:00.000Z",
  updatedAt: "2026-09-01T10:00:00.000Z",
};

function entitlement(overrides: Partial<Entitlement> = {}): Entitlement {
  return {
    id: "entitlement-1",
    source: "direct",
    externalOrderId: null,
    offerId: "occidental",
    status: "available",
    ownerId: null,
    createdAt: "2026-09-01T10:00:00.000Z",
    redeemedAt: null,
    updatedAt: "2026-09-01T10:00:00.000Z",
    ...overrides,
  };
}

function hashOf(rawKey: string): string {
  const parsed = parseActivationKey(rawKey);
  if (!parsed.ok) throw new Error("fixture key is invalid");
  return hashActivationKey(parsed.key);
}

function deps({
  owner = OWNER as Owner | null,
  found = entitlement() as Entitlement | null,
  outcome = { status: "redeemed", memorialId: "memorial-1" } as Awaited<
    ReturnType<EntitlementRepository["redeemWithActivationKey"]>
  >,
} = {}) {
  const redeemWithActivationKey = vi.fn().mockResolvedValue(outcome);
  const findByActivationKeyHash = vi.fn().mockResolvedValue(found);
  const redeem = vi.fn();

  const ownerRepository: OwnerRepository = {
    findByAuthUserId: vi.fn().mockResolvedValue(owner),
    findByEmail: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
  };
  const entitlementRepository: EntitlementRepository = {
    findById: vi.fn(),
    findByActivationKeyHash,
    findByExternalOrder: vi.fn(),
    issueWithActivationKey: vi.fn(),
    swapActivationKey: vi.fn(),
    redeem,
    redeemWithActivationKey,
  };

  return { ownerRepository, entitlementRepository, findByActivationKeyHash, redeemWithActivationKey, redeem };
}

describe("redeemActivationKey — resolution", () => {
  it("resolves a valid key and redeems, returning the memorial id", async () => {
    const rawKey = generateActivationKey().rawKey;
    const d = deps();

    const result = await redeemActivationKey(d, { identity: IDENTITY, rawActivationKey: rawKey });

    expect(result).toEqual({ status: "redeemed", memorialId: "memorial-1" });
    expect(d.findByActivationKeyHash).toHaveBeenCalledWith(hashOf(rawKey));
  });

  it("passes the SAME hash to the lock-protected redemption, for re-verification", async () => {
    const rawKey = generateActivationKey().rawKey;
    const d = deps();

    await redeemActivationKey(d, { identity: IDENTITY, rawActivationKey: rawKey });

    expect(d.redeemWithActivationKey).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedActivationKeyHash: hashOf(rawKey),
        entitlementId: "entitlement-1",
        ownerId: "owner-1",
      }),
    );
    // The keyless path is never used here.
    expect(d.redeem).not.toHaveBeenCalled();
  });

  it("never sends the raw key to the database layer", async () => {
    const rawKey = generateActivationKey().rawKey;
    const d = deps();

    await redeemActivationKey(d, { identity: IDENTITY, rawActivationKey: rawKey });

    const everything = JSON.stringify([
      d.findByActivationKeyHash.mock.calls,
      d.redeemWithActivationKey.mock.calls,
    ]);
    expect(everything).not.toContain(rawKey);
    const parsed = parseActivationKey(rawKey);
    if (!parsed.ok) throw new Error("unreachable");
    expect(everything).not.toContain(parsed.key.payload);
  });

  it.each([
    ["malformed", "not-a-key"],
    ["a future version", "HH2-ABCDEFGH-JKMNPQRS-TVWXYZ01-23456789"],
    ["the excluded letter U", "HH1-UBCDEFGH-JKMNPQRS-TVWXYZ01-23456789"],
    ["the wrong length", "HH1-ABCDEFGH"],
    ["empty", "   "],
  ])("refuses %s WITHOUT any database query", async (_label, rawKey) => {
    const d = deps();

    const result = await redeemActivationKey(d, { identity: IDENTITY, rawActivationKey: rawKey });

    expect(result).toEqual({ status: "invalidActivationKey" });
    expect(d.findByActivationKeyHash).not.toHaveBeenCalled();
    expect(d.ownerRepository.findByAuthUserId).not.toHaveBeenCalled();
    expect(d.redeemWithActivationKey).not.toHaveBeenCalled();
  });

  it("answers a well-formed but unknown key opaquely", async () => {
    const d = deps({ found: null });

    const result = await redeemActivationKey(d, {
      identity: IDENTITY,
      rawActivationKey: generateActivationKey().rawKey,
    });

    // One single answer for "never issued", "replaced" and "invalidated".
    expect(result).toEqual({ status: "activationKeyNotFound" });
    expect(Object.keys(result)).toEqual(["status"]);
  });
});

describe("redeemActivationKey — reuses Mission 011B, never re-implements it", () => {
  it("derives memorialType and skin from the Offer, exactly as the keyless path does", async () => {
    const d = deps({ found: entitlement({ offerId: "juif" }) });

    await redeemActivationKey(d, {
      identity: IDENTITY,
      rawActivationKey: generateActivationKey().rawKey,
    });

    expect(d.redeemWithActivationKey).toHaveBeenCalledWith(
      expect.objectContaining({ memorialType: "person", skinId: "juif" }),
    );
  });

  it("applies the same skin validation before any redemption", async () => {
    const d = deps({ found: entitlement({ offerId: "occidental" }) });

    const result = await redeemActivationKey(d, {
      identity: IDENTITY,
      rawActivationKey: generateActivationKey().rawKey,
      selectedSkin: "juif",
    });

    expect(result).toEqual({ status: "invalidSkin" });
    expect(d.redeemWithActivationKey).not.toHaveBeenCalled();
  });

  it("applies the same owner resolution, short-circuiting on a bad identity", async () => {
    const d = deps();

    const result = await redeemActivationKey(d, {
      identity: { ...IDENTITY, email_confirmed_at: undefined },
      rawActivationKey: generateActivationKey().rawKey,
    });

    expect(result.status).toBe("invalidAuthenticatedIdentity");
    expect(d.findByActivationKeyHash).not.toHaveBeenCalled();
    expect(d.redeemWithActivationKey).not.toHaveBeenCalled();
  });

  it("keeps Mission 011A's idempotence for a retry by the same owner", async () => {
    const d = deps({
      found: entitlement({ status: "redeemed", ownerId: "owner-1" }),
      outcome: { status: "alreadyRedeemed", memorialId: "memorial-1" },
    });

    const result = await redeemActivationKey(d, {
      identity: IDENTITY,
      rawActivationKey: generateActivationKey().rawKey,
    });

    expect(result).toEqual({ status: "alreadyRedeemed", memorialId: "memorial-1" });
  });
});

describe("redeemActivationKey — refusals leak nothing", () => {
  it.each([
    ["activationKeySuperseded", "activationKeySuperseded"],
    ["ownedByAnotherOwner", "entitlementOwnedByAnotherOwner"],
    ["notAvailable", "entitlementNotAvailable"],
    ["integrityAnomaly", "integrityError"],
    ["notFound", "entitlementNotFound"],
  ])("maps the %s outcome to %s with nothing but a status", async (outcomeStatus, expected) => {
    const d = deps({ outcome: { status: outcomeStatus } as never });

    const result = await redeemActivationKey(d, {
      identity: IDENTITY,
      rawActivationKey: generateActivationKey().rawKey,
    });

    expect(result).toEqual({ status: expected });
    expect(JSON.stringify(result)).not.toMatch(/HH\d{3}|SQLSTATE|pg_|duplicate key|[0-9a-f]{64}/);
  });

  it("never echoes the activation key or its hash into a result", async () => {
    const rawKey = generateActivationKey().rawKey;
    const d = deps({ outcome: { status: "activationKeySuperseded" } });

    const result = await redeemActivationKey(d, { identity: IDENTITY, rawActivationKey: rawKey });

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(rawKey);
    expect(serialized).not.toContain(hashOf(rawKey));
  });
});
