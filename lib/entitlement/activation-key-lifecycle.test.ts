import { describe, expect, it, vi } from "vitest";
import type { EntitlementRepository } from "@/lib/adapters/entitlement-repository";
import { generateActivationKey, hashActivationKey, parseActivationKey } from "./activation-key";
import { invalidateActivationKey, replaceActivationKey } from "./activation-key-lifecycle";

function repository(overrides: Partial<EntitlementRepository> = {}): EntitlementRepository {
  return {
    findById: vi.fn(),
    findByActivationKeyHash: vi.fn(),
    findByExternalOrder: vi.fn(),
    issueWithActivationKey: vi.fn(),
    swapActivationKey: vi.fn().mockResolvedValue({ status: "updated" }),
    redeem: vi.fn(),
    redeemWithActivationKey: vi.fn(),
    ...overrides,
  };
}

function hashOf(rawKey: string): string {
  const parsed = parseActivationKey(rawKey);
  if (!parsed.ok) throw new Error("fixture key is invalid");
  return hashActivationKey(parsed.key);
}

describe("replaceActivationKey", () => {
  it("swaps against the exact current hash and returns the new key once", async () => {
    const current = generateActivationKey().rawKey;
    const swapActivationKey = vi.fn().mockResolvedValue({ status: "updated" });

    const result = await replaceActivationKey(
      { entitlementRepository: repository({ swapActivationKey }) },
      { entitlementId: "entitlement-1", currentRawKey: current },
    );

    expect(result.status).toBe("replaced");
    if (result.status !== "replaced") throw new Error("unreachable");

    const [args] = swapActivationKey.mock.calls[0];
    expect(args.entitlementId).toBe("entitlement-1");
    expect(args.expectedActivationKeyHash).toBe(hashOf(current));
    // The new key is persisted as a hash, and is genuinely new.
    expect(args.nextActivationKeyHash).toBe(hashOf(result.rawActivationKey));
    expect(args.nextActivationKeyHash).not.toBe(args.expectedActivationKeyHash);
    // Never the raw key.
    expect(JSON.stringify(args)).not.toContain(result.rawActivationKey);
    expect(JSON.stringify(args)).not.toContain(current);
  });

  it("supports replacing when the right currently has no key", async () => {
    const swapActivationKey = vi.fn().mockResolvedValue({ status: "updated" });

    const result = await replaceActivationKey(
      { entitlementRepository: repository({ swapActivationKey }) },
      { entitlementId: "entitlement-1", currentRawKey: null },
    );

    expect(result.status).toBe("replaced");
    expect(swapActivationKey).toHaveBeenCalledWith(
      expect.objectContaining({ expectedActivationKeyHash: null }),
    );
  });

  it("refuses, and reveals no key, when the compare-and-swap matches nothing", async () => {
    // The right was redeemed, revoked, or re-keyed by somebody else
    // first. A key was generated in memory — it must not escape.
    const result = await replaceActivationKey(
      { entitlementRepository: repository({ swapActivationKey: vi.fn().mockResolvedValue({ status: "rejected" }) }) },
      { entitlementId: "entitlement-1", currentRawKey: generateActivationKey().rawKey },
    );

    expect(result).toEqual({ status: "rejected" });
    expect(Object.keys(result)).toEqual(["status"]);
  });

  it("refuses a malformed current key without touching the database", async () => {
    const swapActivationKey = vi.fn();

    const result = await replaceActivationKey(
      { entitlementRepository: repository({ swapActivationKey }) },
      { entitlementId: "entitlement-1", currentRawKey: "not-a-heritage-key" },
    );

    expect(result).toEqual({ status: "invalidCurrentKey" });
    expect(swapActivationKey).not.toHaveBeenCalled();
  });
});

describe("invalidateActivationKey", () => {
  it("sets the stored hash to null against the exact current hash", async () => {
    const current = generateActivationKey().rawKey;
    const swapActivationKey = vi.fn().mockResolvedValue({ status: "updated" });

    const result = await invalidateActivationKey(
      { entitlementRepository: repository({ swapActivationKey }) },
      { entitlementId: "entitlement-1", currentRawKey: current },
    );

    expect(result).toEqual({ status: "invalidated" });
    expect(swapActivationKey).toHaveBeenCalledWith({
      entitlementId: "entitlement-1",
      expectedActivationKeyHash: hashOf(current),
      nextActivationKeyHash: null,
    });
  });

  it("never touches the right's commercial status — invalidating a key is not revoking a right", async () => {
    const swapActivationKey = vi.fn().mockResolvedValue({ status: "updated" });

    await invalidateActivationKey(
      { entitlementRepository: repository({ swapActivationKey }) },
      { entitlementId: "entitlement-1", currentRawKey: generateActivationKey().rawKey },
    );

    const [args] = swapActivationKey.mock.calls[0];
    expect(Object.keys(args).sort()).toEqual([
      "entitlementId",
      "expectedActivationKeyHash",
      "nextActivationKeyHash",
    ]);
    expect(JSON.stringify(args)).not.toContain("revoked");
    expect(JSON.stringify(args)).not.toContain("status");
  });

  it("refuses when the compare-and-swap matches nothing", async () => {
    const result = await invalidateActivationKey(
      { entitlementRepository: repository({ swapActivationKey: vi.fn().mockResolvedValue({ status: "rejected" }) }) },
      { entitlementId: "entitlement-1", currentRawKey: generateActivationKey().rawKey },
    );

    expect(result).toEqual({ status: "rejected" });
  });

  it("refuses a malformed current key without touching the database", async () => {
    const swapActivationKey = vi.fn();

    const result = await invalidateActivationKey(
      { entitlementRepository: repository({ swapActivationKey }) },
      { entitlementId: "entitlement-1", currentRawKey: "HH2-ABCDEFGH-JKMNPQRS-TVWXYZ01-23456789" },
    );

    expect(result).toEqual({ status: "invalidCurrentKey" });
    expect(swapActivationKey).not.toHaveBeenCalled();
  });
});
