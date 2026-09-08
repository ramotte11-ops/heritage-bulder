import { describe, expect, it, vi } from "vitest";
import type { EntitlementRepository } from "@/lib/adapters/entitlement-repository";
import type { OwnerRepository } from "@/lib/adapters/owner-repository";
import type { Entitlement } from "@/types/entitlement";
import type { Owner } from "@/types/owner";
import { claimByEtsyIdentity, type ClaimByEtsyIdentityDeps } from "./claim-by-etsy-identity";
import type { EtsyListingMapping } from "./listing-mapping";

/**
 * Mission 019B — the couture, under every case the QG named.
 *
 * The property that matters most here is not that a claim succeeds. It
 * is that a claim NEVER succeeds for the wrong person, and that an
 * ambiguous situation writes nothing at all rather than spending a
 * family's right on a guess.
 */

const ETSY_USER = "12345678";
const OTHER_ETSY_USER = "99999999";
const LISTING = "1122334455";
const MAPPINGS: readonly EtsyListingMapping[] = [{ listingId: LISTING, offerId: "occidental" }];

const IDENTITY = {
  id: "auth-user-1",
  email: "famille@example.test",
  email_confirmed_at: "2026-01-01T00:00:00.000Z",
  is_anonymous: false,
};

const OWNER: Owner = {
  id: "owner-1",
  authUserId: "auth-user-1",
  email: "famille@example.test",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function receipt(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    receipt_id: 3216549870,
    buyer_user_id: Number(ETSY_USER),
    status: "paid",
    is_paid: true,
    transactions: [{ listing_id: Number(LISTING), quantity: 1 }],
    ...overrides,
  };
}

function entitlement(overrides: Partial<Entitlement> = {}): Entitlement {
  return {
    id: "entitlement-1",
    source: "etsy",
    externalOrderId: "3216549870",
    offerId: "occidental",
    status: "available",
    ownerId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    redeemedAt: null,
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function ownerRepository(): OwnerRepository {
  return {
    findByAuthUserId: vi.fn(async () => OWNER),
    findByEmail: vi.fn(async () => null),
    create: vi.fn(async () => ({ status: "created" as const, owner: OWNER })),
  };
}

interface RepoOptions {
  existing?: Entitlement | null;
  issueOutcome?: "issued" | "duplicate";
}

function entitlementRepository({ existing = null, issueOutcome = "issued" }: RepoOptions = {}) {
  const repository: EntitlementRepository = {
    findById: vi.fn(async () => existing),
    findByActivationKeyHash: vi.fn(async () => null),
    findByExternalOrder: vi.fn(async () => existing),
    issueWithActivationKey: vi.fn(async () =>
      issueOutcome === "issued"
        ? { status: "issued" as const, entitlement: entitlement() }
        : { status: "duplicateExternalOrder" as const, entitlement: existing ?? entitlement() },
    ),
    swapActivationKey: vi.fn(async () => ({ status: "updated" as const })),
    redeem: vi.fn(async () => ({ status: "redeemed" as const, memorialId: "memorial-1" })),
    redeemWithActivationKey: vi.fn(async () => ({
      status: "redeemed" as const,
      memorialId: "memorial-1",
    })),
  };
  return repository;
}

function deps(
  rows: unknown[],
  repoOptions: RepoOptions = {},
): ClaimByEtsyIdentityDeps & { entitlementRepository: EntitlementRepository } {
  const repository = entitlementRepository(repoOptions);
  return {
    ownerRepository: ownerRepository(),
    entitlementRepository: repository,
    listReceiptsPage: vi.fn(async ({ offset }) => (offset === 0 ? rows : [])),
  };
}

function claim(d: ClaimByEtsyIdentityDeps, etsyUserId = ETSY_USER) {
  return claimByEtsyIdentity(d, { identity: IDENTITY, etsyUserId }, MAPPINGS);
}

describe("the ownership proof", () => {
  it("claims the purchase whose buyer_user_id matches the proven Etsy identity", async () => {
    const d = deps([receipt()]);

    expect(await claim(d)).toEqual({ status: "claimed", memorialId: "memorial-1" });
  });

  it("claims NOTHING for a receipt belonging to another Etsy member", async () => {
    const d = deps([receipt({ buyer_user_id: Number(OTHER_ETSY_USER) })]);

    expect(await claim(d)).toEqual({ status: "noMatchingPurchase" });
    expect(d.entitlementRepository.issueWithActivationKey).not.toHaveBeenCalled();
    expect(d.entitlementRepository.redeem).not.toHaveBeenCalled();
  });

  it("claims NOTHING for a guest checkout — null can never match an identity", async () => {
    const d = deps([receipt({ buyer_user_id: null })]);

    expect(await claim(d)).toEqual({ status: "noMatchingPurchase" });
    expect(d.entitlementRepository.issueWithActivationKey).not.toHaveBeenCalled();
  });

  it("never reveals the Etsy member id in its result", async () => {
    const d = deps([receipt()]);

    const serialised = JSON.stringify(await claim(d));

    expect(serialised).not.toContain(ETSY_USER);
    expect(serialised).not.toContain("3216549870");
  });
});

describe("eligibility — nothing is written for a purchase that cannot be claimed", () => {
  it.each([
    ["a cancelled order", { status: "canceled" }],
    ["a fully refunded order", { status: "fully refunded" }],
    ["a partially refunded order", { status: "partially refunded" }],
    ["an unpaid order", { status: "open" }],
    ["an order still processing payment", { status: "payment processing" }],
    ["an order Etsy does not report as paid", { is_paid: false }],
    ["a quantity greater than one", { transactions: [{ listing_id: Number(LISTING), quantity: 2 }] }],
    [
      "a multi-line receipt",
      {
        transactions: [
          { listing_id: Number(LISTING), quantity: 1 },
          { listing_id: 9988776655, quantity: 1 },
        ],
      },
    ],
    ["an unknown listing", { transactions: [{ listing_id: 42, quantity: 1 }] }],
  ])("refuses %s and writes nothing", async (_label, overrides) => {
    const d = deps([receipt(overrides)]);

    expect(await claim(d)).toEqual({ status: "noMatchingPurchase" });
    expect(d.entitlementRepository.issueWithActivationKey).not.toHaveBeenCalled();
    expect(d.entitlementRepository.redeem).not.toHaveBeenCalled();
  });

  it("ignores an unreadable receipt instead of failing the whole claim", async () => {
    const d = deps([{ nonsense: true }, receipt()]);

    expect(await claim(d)).toEqual({ status: "claimed", memorialId: "memorial-1" });
  });
});

describe("zero, one, several", () => {
  it("routes zero matching purchases to recovery", async () => {
    expect(await claim(deps([]))).toEqual({ status: "noMatchingPurchase" });
  });

  it("claims when exactly one unclaimed purchase matches", async () => {
    expect(await claim(deps([receipt()]))).toEqual({
      status: "claimed",
      memorialId: "memorial-1",
    });
  });

  it("NEVER auto-claims when several unclaimed purchases match, and writes nothing", async () => {
    const d = deps([receipt(), receipt({ receipt_id: 1111111111 })]);

    expect(await claim(d)).toEqual({ status: "multiplePurchases" });
    // The decisive assertion: reaching this answer cost zero writes.
    expect(d.entitlementRepository.issueWithActivationKey).not.toHaveBeenCalled();
    expect(d.entitlementRepository.redeem).not.toHaveBeenCalled();
  });

  it("still claims the single unclaimed purchase when another is already redeemed", async () => {
    // A returning customer: one memorial already made, one new purchase.
    // "Unclaimed" means no right yet, or one still `available`.
    const alreadyRedeemed = entitlement({ id: "entitlement-old", status: "redeemed" });
    const d = deps([receipt(), receipt({ receipt_id: 1111111111 })]);
    d.entitlementRepository.findByExternalOrder = vi.fn(async (_source, orderId) =>
      orderId === "3216549870" ? alreadyRedeemed : null,
    );

    expect(await claim(d)).toEqual({ status: "claimed", memorialId: "memorial-1" });
  });

  it("treats a revoked right as not claimable", async () => {
    const d = deps([receipt()], { existing: entitlement({ status: "revoked" }) });

    expect(await claim(d)).toEqual({ status: "purchaseNotEligible" });
    expect(d.entitlementRepository.redeem).not.toHaveBeenCalled();
  });
});

describe("idempotence and concurrency", () => {
  it("returns the SAME memorial on a replayed callback, never a second one", async () => {
    const redeemed = entitlement({ status: "redeemed", ownerId: OWNER.id });
    const d = deps([receipt()], { existing: redeemed, issueOutcome: "duplicate" });
    d.entitlementRepository.redeem = vi.fn(async () => ({
      status: "alreadyRedeemed" as const,
      memorialId: "memorial-1",
    }));

    expect(await claim(d)).toEqual({ status: "alreadyClaimed", memorialId: "memorial-1" });
  });

  it("re-provisioning an already-provisioned receipt creates no second right", async () => {
    const existing = entitlement();
    const d = deps([receipt()], { existing, issueOutcome: "duplicate" });

    await claim(d);

    // Mission 018's idempotence, reused rather than re-implemented: the
    // insert is attempted and the unique index decides.
    expect(d.entitlementRepository.issueWithActivationKey).toHaveBeenCalledTimes(1);
    expect(d.entitlementRepository.redeem).toHaveBeenCalledTimes(1);
  });

  it("refuses when the right belongs to a different HERITAGE owner", async () => {
    const d = deps([receipt()]);
    d.entitlementRepository.redeem = vi.fn(async () => ({
      status: "ownedByAnotherOwner" as const,
    }));

    // Two HERITAGE accounts racing for one purchase: the atomic
    // primitive decides under the row lock, and the loser is told
    // nothing that distinguishes this from any other refusal.
    expect(await claim(d)).toEqual({ status: "failed" });
  });

  it("never re-implements redemption — it delegates to the atomic primitive", async () => {
    const d = deps([receipt()]);

    await claim(d);

    // The keyless path, which is the correct one for a proven identity:
    // an OAuth claim is not an activation-key claim.
    expect(d.entitlementRepository.redeem).toHaveBeenCalledTimes(1);
    expect(d.entitlementRepository.redeemWithActivationKey).not.toHaveBeenCalled();
  });

  it("refuses when no HERITAGE owner can be resolved, without redeeming", async () => {
    const d = deps([receipt()]);
    d.ownerRepository.findByAuthUserId = vi.fn(async () => null);
    d.ownerRepository.findByEmail = vi.fn(async () => ({
      ...OWNER,
      authUserId: "somebody-else",
    }));

    expect(await claim(d)).toEqual({ status: "failed" });
    expect(d.entitlementRepository.redeem).not.toHaveBeenCalled();
  });
});

describe("Etsy being unavailable is never 'you have no purchase'", () => {
  it("answers etsyUnavailable when the receipts read fails", async () => {
    const d = deps([]);
    d.listReceiptsPage = vi.fn(async () => {
      throw new Error("etsy 503");
    });

    expect(await claim(d)).toEqual({ status: "etsyUnavailable" });
  });

  it("never leaks an Etsy error into the result", async () => {
    const d = deps([]);
    d.listReceiptsPage = vi.fn(async () => {
      throw new Error("etsy said: invalid token abcdef");
    });

    expect(JSON.stringify(await claim(d))).not.toContain("abcdef");
  });
});

describe("pagination", () => {
  it("stops at a short page rather than requesting forever", async () => {
    const d = deps([receipt()]);

    await claim(d);

    // One page came back short, so there is nothing after it.
    expect(d.listReceiptsPage).toHaveBeenCalledTimes(1);
  });

  it("reads further pages while they come back full, and stays bounded", async () => {
    const full = Array.from({ length: 100 }, (_, index) =>
      receipt({ receipt_id: 900000000 + index, buyer_user_id: Number(OTHER_ETSY_USER) }),
    );
    const d = deps([]);
    d.listReceiptsPage = vi.fn(async () => full);

    expect(await claim(d)).toEqual({ status: "noMatchingPurchase" });
    // Bounded: an activation must never turn into an unbounded crawl of
    // the whole shop history.
    expect(d.listReceiptsPage).toHaveBeenCalledTimes(10);
  });
});
