import { describe, expect, it, vi } from "vitest";
import type { AdminAuditRepository } from "@/lib/adapters/admin-audit-repository";
import type { EntitlementRepository } from "@/lib/adapters/entitlement-repository";
import type { Entitlement } from "@/types/entitlement";
import {
  provisionEtsyOrderForSupport,
  type ProvisionOrderForSupportDeps,
} from "./provision-order-for-support";
import type { EtsyListingMapping } from "./listing-mapping";

/**
 * Mission 019B — the guest-checkout recovery.
 *
 * The rule these tests exist to pin down: staff cannot create a right by
 * typing plausible data. The only input is an order reference, and every
 * decision that follows is made from what ETSY says about that order —
 * through the SAME validation the nominal OAuth path uses. No Admin
 * privilege overrides any refusal.
 */

const LISTING = "1122334455";
const RECEIPT_ID = "3216549870";
const ADMIN = "admin-auth-user-1";
const MAPPINGS: readonly EtsyListingMapping[] = [{ listingId: LISTING, offerId: "occidental" }];

function receipt(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    receipt_id: Number(RECEIPT_ID),
    // A guest checkout: no buyer account at all. This is the case the
    // nominal path structurally cannot serve.
    buyer_user_id: null,
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
    externalOrderId: RECEIPT_ID,
    offerId: "occidental",
    status: "available",
    ownerId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    redeemedAt: null,
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function deps(
  raw: unknown | null,
  {
    duplicate = false,
    fetchThrows = false,
  }: { duplicate?: boolean; fetchThrows?: boolean } = {},
): ProvisionOrderForSupportDeps & {
  entitlementRepository: EntitlementRepository;
  auditRepository: AdminAuditRepository;
} {
  const entitlementRepository = {
    findById: vi.fn(async () => null),
    findByActivationKeyHash: vi.fn(async () => null),
    findByExternalOrder: vi.fn(async () => null),
    issueWithActivationKey: vi.fn(async () =>
      duplicate
        ? { status: "duplicateExternalOrder" as const, entitlement: entitlement() }
        : { status: "issued" as const, entitlement: entitlement() },
    ),
    swapActivationKey: vi.fn(async () => ({ status: "updated" as const })),
    redeem: vi.fn(async () => ({ status: "redeemed" as const, memorialId: "m" })),
    redeemWithActivationKey: vi.fn(async () => ({
      status: "redeemed" as const,
      memorialId: "m",
    })),
  } satisfies EntitlementRepository;

  const auditRepository = { record: vi.fn(async () => {}) } satisfies AdminAuditRepository;

  return {
    entitlementRepository,
    auditRepository,
    fetchReceipt: vi.fn(async () => {
      if (fetchThrows) throw new Error("etsy 503 — invalid token abcdef");
      return raw;
    }),
  };
}

function provision(d: ProvisionOrderForSupportDeps, receiptId = RECEIPT_ID) {
  return provisionEtsyOrderForSupport(d, { receiptId, adminAuthUserId: ADMIN }, MAPPINGS);
}

describe("the order is verified against Etsy before anything is created", () => {
  it("provisions a genuine guest order and returns its key exactly once", async () => {
    const d = deps(receipt());

    const result = await provision(d);

    expect(result.status).toBe("provisioned");
    if (result.status !== "provisioned") return;
    expect(result.rawActivationKey).toMatch(/^HH1-/);
  });

  it("asks Etsy for the exact reference staff typed", async () => {
    const d = deps(receipt());

    await provision(d);

    expect(d.fetchReceipt).toHaveBeenCalledWith(RECEIPT_ID);
  });

  it("refuses an order Etsy does not know for our shop, without writing", async () => {
    const d = deps(null);

    expect(await provision(d)).toEqual({ status: "orderNotFound" });
    expect(d.entitlementRepository.issueWithActivationKey).not.toHaveBeenCalled();
    expect(d.auditRepository.record).not.toHaveBeenCalled();
  });

  it("refuses an unreadable answer rather than guessing at a partial order", async () => {
    const d = deps({ not: "a receipt" });

    expect(await provision(d)).toEqual({
      status: "notEligible",
      reason: "unreadableReceipt",
    });
    expect(d.entitlementRepository.issueWithActivationKey).not.toHaveBeenCalled();
  });

  it("answers etsyUnavailable, and leaks nothing, when Etsy cannot be reached", async () => {
    const d = deps(null, { fetchThrows: true });

    const result = await provision(d);

    expect(result).toEqual({ status: "etsyUnavailable" });
    expect(JSON.stringify(result)).not.toContain("abcdef");
    expect(d.entitlementRepository.issueWithActivationKey).not.toHaveBeenCalled();
  });
});

describe("guest only", () => {
  it("refuses an order that carries a buyer account — it belongs on the OAuth path", async () => {
    const d = deps(receipt({ buyer_user_id: 12345678 }));

    expect(await provision(d)).toEqual({ status: "notGuestPurchase" });
    // Staff must not be able to hand out a key for a purchase whose real
    // buyer can prove ownership themselves.
    expect(d.entitlementRepository.issueWithActivationKey).not.toHaveBeenCalled();
    expect(d.auditRepository.record).not.toHaveBeenCalled();
  });
});

describe("no Admin privilege overrides an eligibility rule", () => {
  it.each([
    ["a cancelled order", { status: "canceled" }, "unacceptablePaymentState"],
    ["a fully refunded order", { status: "fully refunded" }, "unacceptablePaymentState"],
    ["a partially refunded order", { status: "partially refunded" }, "unacceptablePaymentState"],
    ["an unpaid order", { is_paid: false }, "notPaid"],
    [
      "a quantity greater than one",
      { transactions: [{ listing_id: Number(LISTING), quantity: 3 }] },
      "unsupportedQuantity",
    ],
    [
      "a multi-line receipt",
      {
        transactions: [
          { listing_id: Number(LISTING), quantity: 1 },
          { listing_id: 9988776655, quantity: 1 },
        ],
      },
      "multipleTransactions",
    ],
    [
      "an unknown listing",
      { transactions: [{ listing_id: 42, quantity: 1 }] },
      "unknownListing",
    ],
  ])("refuses %s", async (_label, overrides, reason) => {
    const d = deps(receipt(overrides));

    expect(await provision(d)).toEqual({ status: "notEligible", reason });
    expect(d.entitlementRepository.issueWithActivationKey).not.toHaveBeenCalled();
    expect(d.auditRepository.record).not.toHaveBeenCalled();
  });

  it("accepts a completed order — shipped is still paid", async () => {
    const d = deps(receipt({ status: "completed" }));

    expect((await provision(d)).status).toBe("provisioned");
  });
});

describe("a second attempt on the same order", () => {
  it("never issues a second right, and never a second key", async () => {
    const d = deps(receipt(), { duplicate: true });

    const result = await provision(d);

    expect(result).toEqual({ status: "alreadyProvisioned", entitlementId: "entitlement-1" });
    // No key: the raw key is not stored and cannot be re-read, so this
    // path cannot legitimately produce one. Minting a fresh one would
    // silently break the key the family may already hold.
    expect(JSON.stringify(result)).not.toContain("HH1-");
  });

  it("is still recorded, so a repeated lookup leaves a trace", async () => {
    const d = deps(receipt(), { duplicate: true });

    await provision(d);

    expect(d.auditRepository.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "etsy_order.provision_reattempted" }),
    );
  });
});

describe("the audit trail", () => {
  it("records the provisioning against the right it created", async () => {
    const d = deps(receipt());

    await provision(d);

    expect(d.auditRepository.record).toHaveBeenCalledWith({
      adminAuthUserId: ADMIN,
      action: "etsy_order.provisioned",
      targetType: "entitlement",
      targetId: "entitlement-1",
      context: {
        external_order_id: RECEIPT_ID,
        guest_checkout: true,
        first_provisioning: true,
      },
    });
  });

  it("NEVER writes the raw activation key into the ledger", async () => {
    const d = deps(receipt());

    const result = await provision(d);
    expect(result.status).toBe("provisioned");
    if (result.status !== "provisioned") return;

    const recorded = JSON.stringify(
      (d.auditRepository.record as unknown as { mock: { calls: unknown[][] } }).mock.calls,
    );
    expect(recorded).not.toContain(result.rawActivationKey);
    expect(recorded).not.toContain("HH1-");
    // And no hash either — a support ledger has no use for one.
    expect(recorded).not.toMatch(/[0-9a-f]{64}/);
  });

  it("attributes the action to the admin resolved from the session, never a typed value", async () => {
    const d = deps(receipt());

    await provision(d);

    expect(d.auditRepository.record).toHaveBeenCalledWith(
      expect.objectContaining({ adminAuthUserId: ADMIN }),
    );
  });
});

describe("provisioning is not re-implemented here", () => {
  it("goes through the same issuing primitive the nominal path uses", async () => {
    const d = deps(receipt());

    await provision(d);

    expect(d.entitlementRepository.issueWithActivationKey).toHaveBeenCalledWith(
      expect.objectContaining({
        offerId: "occidental",
        source: "etsy",
        externalOrderId: RECEIPT_ID,
      }),
    );
  });

  it("hands the repository only a hash, never the raw key", async () => {
    const d = deps(receipt());

    await provision(d);

    const [call] = (
      d.entitlementRepository.issueWithActivationKey as unknown as {
        mock: { calls: [{ activationKeyHash: string }][] };
      }
    ).mock.calls;
    expect(call[0].activationKeyHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(call[0])).not.toContain("HH1-");
  });
});
