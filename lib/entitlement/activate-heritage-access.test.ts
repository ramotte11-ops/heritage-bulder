import { describe, expect, it, vi } from "vitest";
import type { ActivationRateLimiter } from "@/lib/adapters/activation-rate-limiter";
import type { EntitlementRepository } from "@/lib/adapters/entitlement-repository";
import type { OwnerRepository } from "@/lib/adapters/owner-repository";
import type { Entitlement } from "@/types/entitlement";
import type { Owner } from "@/types/owner";
import { generateActivationKey } from "./activation-key";
import { activateHeritageAccess } from "./activate-heritage-access";
import type { AuthenticatedIdentity } from "./resolve-owner";

const IDENTITY: AuthenticatedIdentity = {
  id: "auth-user-1",
  email: "famille@example.test",
  email_confirmed_at: "2026-09-05T10:00:00.000Z",
  is_anonymous: false,
};

const OWNER: Owner = {
  id: "owner-1",
  authUserId: "auth-user-1",
  email: "famille@example.test",
  createdAt: "2026-09-05T10:00:00.000Z",
  updatedAt: "2026-09-05T10:00:00.000Z",
};

function entitlement(overrides: Partial<Entitlement> = {}): Entitlement {
  return {
    id: "entitlement-1",
    source: "direct",
    externalOrderId: null,
    offerId: "occidental",
    status: "available",
    ownerId: null,
    createdAt: "2026-09-05T10:00:00.000Z",
    redeemedAt: null,
    updatedAt: "2026-09-05T10:00:00.000Z",
    ...overrides,
  };
}

function deps({
  allowed = true,
  retryAfterSeconds = 0,
  owner = OWNER as Owner | null,
  found = entitlement() as Entitlement | null,
  outcome = { status: "redeemed", memorialId: "memorial-1" } as Awaited<
    ReturnType<EntitlementRepository["redeemWithActivationKey"]>
  >,
} = {}) {
  const recordAttempt = vi.fn().mockResolvedValue({ allowed, retryAfterSeconds });
  const rateLimiter: ActivationRateLimiter = { recordAttempt };

  const redeemWithActivationKey = vi.fn().mockResolvedValue(outcome);
  const findByActivationKeyHash = vi.fn().mockResolvedValue(found);

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
    redeem: vi.fn(),
    redeemWithActivationKey,
  };

  return { rateLimiter, recordAttempt, ownerRepository, entitlementRepository, findByActivationKeyHash };
}

describe("activateHeritageAccess — the rate-limit gate", () => {
  it("checks the rate limit BEFORE ever looking at the key", async () => {
    const d = deps({ allowed: false, retryAfterSeconds: 400 });

    const result = await activateHeritageAccess(d, {
      identity: IDENTITY,
      rawActivationKey: generateActivationKey().rawKey,
    });

    expect(result).toEqual({ status: "rateLimited", retryAfterSeconds: 400 });
    expect(d.findByActivationKeyHash).not.toHaveBeenCalled();
    expect(d.ownerRepository.findByAuthUserId).not.toHaveBeenCalled();
  });

  it("records the attempt against the caller's own identity, never anything else", async () => {
    const d = deps();

    await activateHeritageAccess(d, { identity: IDENTITY, rawActivationKey: generateActivationKey().rawKey });

    expect(d.recordAttempt).toHaveBeenCalledWith("auth-user-1");
  });

  it("also rate-limits a MALFORMED key attempt — the gate runs before parsing", async () => {
    const d = deps({ allowed: false, retryAfterSeconds: 12 });

    const result = await activateHeritageAccess(d, {
      identity: IDENTITY,
      rawActivationKey: "not-a-key-at-all",
    });

    expect(result).toEqual({ status: "rateLimited", retryAfterSeconds: 12 });
  });

  it("proceeds to redemption once the caller is within budget", async () => {
    const d = deps({ allowed: true });

    const result = await activateHeritageAccess(d, {
      identity: IDENTITY,
      rawActivationKey: generateActivationKey().rawKey,
    });

    expect(result).toEqual({ status: "redeemed", memorialId: "memorial-1" });
    expect(d.findByActivationKeyHash).toHaveBeenCalled();
  });
});

describe("activateHeritageAccess — success paths", () => {
  it("maps a fresh redemption", async () => {
    const d = deps({ outcome: { status: "redeemed", memorialId: "memorial-1" } });

    const result = await activateHeritageAccess(d, {
      identity: IDENTITY,
      rawActivationKey: generateActivationKey().rawKey,
    });

    expect(result).toEqual({ status: "redeemed", memorialId: "memorial-1" });
  });

  it("maps a replay/idempotent retry to alreadyRedeemed — never a second memorial", async () => {
    const d = deps({
      found: entitlement({ status: "redeemed", ownerId: "owner-1" }),
      outcome: { status: "alreadyRedeemed", memorialId: "memorial-1" },
    });

    const result = await activateHeritageAccess(d, {
      identity: IDENTITY,
      rawActivationKey: generateActivationKey().rawKey,
    });

    expect(result).toEqual({ status: "alreadyRedeemed", memorialId: "memorial-1" });
  });
});

describe("activateHeritageAccess — every refusal collapses to one generic answer", () => {
  it("collapses a malformed key", async () => {
    const d = deps();

    const result = await activateHeritageAccess(d, { identity: IDENTITY, rawActivationKey: "garbage" });

    expect(result).toEqual({ status: "failed" });
  });

  it("collapses a well-formed but unknown key", async () => {
    const d = deps({ found: null });

    const result = await activateHeritageAccess(d, {
      identity: IDENTITY,
      rawActivationKey: generateActivationKey().rawKey,
    });

    expect(result).toEqual({ status: "failed" });
  });

  it.each([
    "activationKeySuperseded",
    "ownedByAnotherOwner",
    "notAvailable",
    "integrityAnomaly",
    "notFound",
  ])("collapses the %s redemption outcome", async (outcomeStatus) => {
    const d = deps({ outcome: { status: outcomeStatus } as never });

    const result = await activateHeritageAccess(d, {
      identity: IDENTITY,
      rawActivationKey: generateActivationKey().rawKey,
    });

    expect(result).toEqual({ status: "failed" });
  });

  it("collapses a bad authenticated identity, without ever hitting the key lookup", async () => {
    const d = deps();

    const result = await activateHeritageAccess(d, {
      identity: { ...IDENTITY, email_confirmed_at: undefined },
      rawActivationKey: generateActivationKey().rawKey,
    });

    expect(result).toEqual({ status: "failed" });
    expect(d.findByActivationKeyHash).not.toHaveBeenCalled();
  });

  it("never lets the raw key or its hash leak into the result", async () => {
    const rawKey = generateActivationKey().rawKey;
    const d = deps({ outcome: { status: "activationKeySuperseded" } });

    const result = await activateHeritageAccess(d, { identity: IDENTITY, rawActivationKey: rawKey });

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(rawKey);
    expect(serialized).toEqual('{"status":"failed"}');
  });
});
