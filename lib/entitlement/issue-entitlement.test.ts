import { describe, expect, it, vi } from "vitest";
import type { EntitlementRepository } from "@/lib/adapters/entitlement-repository";
import type { Entitlement } from "@/types/entitlement";
import { issueEntitlementWithActivationKey } from "./issue-entitlement";
import { hashActivationKey, parseActivationKey } from "./activation-key";

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

function repository(overrides: Partial<EntitlementRepository> = {}): EntitlementRepository {
  return {
    findById: vi.fn(),
    findByActivationKeyHash: vi.fn(),
    findByExternalOrder: vi.fn(),
    issueWithActivationKey: vi
      .fn()
      .mockResolvedValue({ status: "issued", entitlement: entitlement() }),
    swapActivationKey: vi.fn(),
    redeem: vi.fn(),
    redeemWithActivationKey: vi.fn(),
    ...overrides,
  };
}

describe("issueEntitlementWithActivationKey", () => {
  it("issues a right and returns the raw key exactly once", async () => {
    const entitlementRepository = repository();

    const result = await issueEntitlementWithActivationKey(
      { entitlementRepository },
      { offerId: "juif", source: "direct" },
    );

    expect(result.status).toBe("issued");
    if (result.status !== "issued") throw new Error("unreachable");
    expect(parseActivationKey(result.rawActivationKey).ok).toBe(true);
  });

  it("hands the repository ONLY the hash — the raw key never crosses that line", async () => {
    const issueWithActivationKey = vi
      .fn()
      .mockResolvedValue({ status: "issued", entitlement: entitlement() });
    const entitlementRepository = repository({ issueWithActivationKey });

    const result = await issueEntitlementWithActivationKey(
      { entitlementRepository },
      { offerId: "occidental", source: "etsy", externalOrderId: "order-1" },
    );

    if (result.status !== "issued") throw new Error("unreachable");
    const [persisted] = issueWithActivationKey.mock.calls[0];

    // The hash is present, correct, and the raw key appears nowhere in
    // anything handed to persistence.
    const parsed = parseActivationKey(result.rawActivationKey);
    if (!parsed.ok) throw new Error("unreachable");
    expect(persisted.activationKeyHash).toBe(hashActivationKey(parsed.key));
    expect(persisted.activationKeyHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(persisted)).not.toContain(result.rawActivationKey);
    expect(JSON.stringify(persisted)).not.toContain(parsed.key.payload);
  });

  it("passes source and externalOrderId through untouched", async () => {
    const issueWithActivationKey = vi
      .fn()
      .mockResolvedValue({ status: "issued", entitlement: entitlement() });

    await issueEntitlementWithActivationKey(
      { entitlementRepository: repository({ issueWithActivationKey }) },
      { offerId: "arabe", source: "etsy", externalOrderId: "receipt-42" },
    );

    expect(issueWithActivationKey).toHaveBeenCalledWith(
      expect.objectContaining({ offerId: "arabe", source: "etsy", externalOrderId: "receipt-42" }),
    );
  });

  it("normalises a missing externalOrderId to null", async () => {
    const issueWithActivationKey = vi
      .fn()
      .mockResolvedValue({ status: "issued", entitlement: entitlement() });

    await issueEntitlementWithActivationKey(
      { entitlementRepository: repository({ issueWithActivationKey }) },
      { offerId: "arabe", source: "direct" },
    );

    expect(issueWithActivationKey).toHaveBeenCalledWith(
      expect.objectContaining({ externalOrderId: null }),
    );
  });

  it("refuses an unknown offer without generating or writing anything", async () => {
    const issueWithActivationKey = vi.fn();

    const result = await issueEntitlementWithActivationKey(
      { entitlementRepository: repository({ issueWithActivationKey }) },
      { offerId: "an-offer-from-the-future" as never, source: "direct" },
    );

    expect(result).toEqual({ status: "invalidOffer" });
    expect(issueWithActivationKey).not.toHaveBeenCalled();
  });

  it("reports a duplicate order and returns NO key for it", async () => {
    const existing = entitlement({ id: "already-there", externalOrderId: "order-1" });
    const entitlementRepository = repository({
      issueWithActivationKey: vi
        .fn()
        .mockResolvedValue({ status: "duplicateExternalOrder", entitlement: existing }),
    });

    const result = await issueEntitlementWithActivationKey(
      { entitlementRepository },
      { offerId: "occidental", source: "etsy", externalOrderId: "order-1" },
    );

    expect(result).toEqual({ status: "duplicateExternalOrder", entitlement: existing });
    expect(Object.keys(result)).not.toContain("rawActivationKey");
  });

  it("issues a distinct key every time", async () => {
    const entitlementRepository = repository();
    const keys = new Set<string>();

    for (let attempt = 0; attempt < 25; attempt += 1) {
      const result = await issueEntitlementWithActivationKey(
        { entitlementRepository },
        { offerId: "indien", source: "direct" },
      );
      if (result.status !== "issued") throw new Error("unreachable");
      keys.add(result.rawActivationKey);
    }

    expect(keys.size).toBe(25);
  });
});
