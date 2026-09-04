import { describe, expect, it, vi } from "vitest";
import type { EntitlementRepository } from "@/lib/adapters/entitlement-repository";
import type { Entitlement } from "@/types/entitlement";
import type { EtsyListingMapping } from "./listing-mapping";
import { receiveEtsyPurchase } from "./receive-purchase";

/**
 * Mission 019 — the anomalous cases of the Etsy commercial path, at the
 * one boundary that composes them. Every test here asserts two things at
 * once: the outcome is explicitly named, and nothing extra was written.
 */

const MAPPINGS: readonly EtsyListingMapping[] = [
  { listingId: "1234567890", offerId: "occidental" },
  { listingId: "1234567891", offerId: "juif" },
];

function entitlement(overrides: Partial<Entitlement> = {}): Entitlement {
  return {
    id: "entitlement-1",
    source: "etsy",
    externalOrderId: "receipt-9001",
    offerId: "occidental",
    status: "available",
    ownerId: null,
    createdAt: "2026-09-04T10:00:00.000Z",
    redeemedAt: null,
    updatedAt: "2026-09-04T10:00:00.000Z",
    ...overrides,
  };
}

/**
 * The same stand-in Mission 018's tests use: it behaves like the
 * PostgreSQL unique index on (source, external_order_id) — it never reads
 * before writing, and the second INSERT for one receipt loses. Reused
 * rather than re-invented, so these tests exercise the real composed
 * behaviour and not a friendlier fake.
 */
function uniqueIndexRepository(): {
  repository: EntitlementRepository;
  issueWithActivationKey: ReturnType<typeof vi.fn>;
} {
  const rows = new Map<string, Entitlement>();
  let nextId = 1;

  const issueWithActivationKey = vi.fn(
    async (input: {
      offerId: Entitlement["offerId"];
      source: Entitlement["source"];
      externalOrderId?: string | null;
      activationKeyHash: string;
    }) => {
      const key = `${input.source}::${input.externalOrderId ?? ""}`;
      const existing = rows.get(key);
      if (existing) return { status: "duplicateExternalOrder" as const, entitlement: existing };

      const created = entitlement({
        id: `entitlement-${nextId++}`,
        source: input.source,
        offerId: input.offerId,
        externalOrderId: input.externalOrderId ?? null,
      });
      rows.set(key, created);
      return { status: "issued" as const, entitlement: created };
    },
  );

  return {
    issueWithActivationKey,
    repository: {
      findById: vi.fn(),
      findByActivationKeyHash: vi.fn(),
      findByExternalOrder: vi.fn(),
      issueWithActivationKey,
      swapActivationKey: vi.fn(),
      redeem: vi.fn(),
      redeemWithActivationKey: vi.fn(),
    },
  };
}

function repository(overrides: Partial<EntitlementRepository> = {}): EntitlementRepository {
  return {
    findById: vi.fn(),
    findByActivationKeyHash: vi.fn(),
    findByExternalOrder: vi.fn(),
    issueWithActivationKey: vi.fn(),
    swapActivationKey: vi.fn(),
    redeem: vi.fn(),
    redeemWithActivationKey: vi.fn(),
    ...overrides,
  };
}

/** A well-formed notification as a future adapter would hand one over.
 * Anomalies below are expressed as overrides of this one good payload, so
 * each test isolates exactly one thing being wrong. */
function purchaseInput(overrides: Record<string, unknown> = {}): unknown {
  return {
    externalPurchaseId: "receipt-9001",
    listingId: "1234567890",
    quantity: 1,
    paymentState: "paid",
    ...overrides,
  };
}

/** Every repository method that could conceivably mutate or read state.
 * "Zero provisioning" means none of them was touched — a stronger claim
 * than "no right came back". */
function assertRepositoryUntouched(entitlementRepository: EntitlementRepository): void {
  for (const method of Object.values(entitlementRepository)) {
    expect(method).not.toHaveBeenCalled();
  }
}

describe("receiveEtsyPurchase — refused before provisioning", () => {
  it("refuses a listing this build does not know, and never picks a default offer", async () => {
    const entitlementRepository = repository();

    const result = await receiveEtsyPurchase(
      { entitlementRepository },
      purchaseInput({ listingId: "9999999999" }),
      MAPPINGS,
    );

    expect(result).toEqual({
      status: "rejected",
      reason: "unknownListing",
      listingId: "9999999999",
    });
    assertRepositoryUntouched(entitlementRepository);
  });

  it("refuses an unknown listing even when the configured mapping is empty", async () => {
    const entitlementRepository = repository();

    // The real ETSY_LISTING_MAPPINGS is empty until the shop is live.
    // "No mapping at all" must refuse every listing, never fall back to
    // the first/only offer this build happens to define.
    const result = await receiveEtsyPurchase(
      { entitlementRepository },
      purchaseInput(),
      [],
    );

    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") throw new Error("unreachable");
    expect(result.reason).toBe("unknownListing");
    assertRepositoryUntouched(entitlementRepository);
  });

  it("preserves Mission 017's malformed-input refusals verbatim, and none of them reach provisioning", async () => {
    // Mission 019 adds no validation of its own: these are exactly
    // Mission 017's outcomes, asserted here only to prove the composition
    // neither reshapes them nor lets them through.
    const cases: { input: unknown; reason: string }[] = [
      { input: null, reason: "malformedInput" },
      { input: "a string", reason: "malformedInput" },
      { input: [purchaseInput()], reason: "malformedInput" },
      { input: purchaseInput({ quantity: "1" }), reason: "malformedInput" },
      { input: purchaseInput({ externalPurchaseId: undefined }), reason: "malformedInput" },
      { input: purchaseInput({ externalPurchaseId: "   " }), reason: "missingExternalPurchaseId" },
      { input: purchaseInput({ listingId: "" }), reason: "missingListingId" },
      { input: purchaseInput({ quantity: 0 }), reason: "invalidQuantity" },
      { input: purchaseInput({ quantity: -1 }), reason: "invalidQuantity" },
      { input: purchaseInput({ quantity: 1.5 }), reason: "invalidQuantity" },
    ];

    for (const { input, reason } of cases) {
      const entitlementRepository = repository();
      const result = await receiveEtsyPurchase({ entitlementRepository }, input, MAPPINGS);

      expect(result.status).toBe("rejected");
      if (result.status !== "rejected") throw new Error("unreachable");
      expect(result.reason).toBe(reason);
      assertRepositoryUntouched(entitlementRepository);
    }
  });

  it("refuses a purchase that is not paid, whatever the state says", async () => {
    for (const paymentState of ["pending", "cancelled", "refunded", "Paid", ""]) {
      const entitlementRepository = repository();

      const result = await receiveEtsyPurchase(
        { entitlementRepository },
        purchaseInput({ paymentState }),
        MAPPINGS,
      );

      expect(result).toEqual({
        status: "rejected",
        reason: "unacceptablePaymentState",
        paymentState,
      });
      assertRepositoryUntouched(entitlementRepository);
    }
  });
});

describe("receiveEtsyPurchase — quantity is not negotiable", () => {
  it("refuses quantity != 1 as unsupportedQuantity, with zero right and zero key", async () => {
    for (const quantity of [2, 3, 10]) {
      const { repository: entitlementRepository, issueWithActivationKey } = uniqueIndexRepository();

      const result = await receiveEtsyPurchase(
        { entitlementRepository },
        purchaseInput({ quantity }),
        MAPPINGS,
      );

      expect(result).toEqual({ status: "rejected", reason: "unsupportedQuantity", quantity });
      // Refused after validation but before any write: quantity 2 is a
      // structurally valid purchase HERITAGE simply does not sell.
      expect(issueWithActivationKey).not.toHaveBeenCalled();
      expect(result).not.toHaveProperty("rawActivationKey");
      expect(result).not.toHaveProperty("entitlement");
    }
  });

  it("never fans a multi-unit purchase out into several rights", async () => {
    const { repository: entitlementRepository } = uniqueIndexRepository();

    await receiveEtsyPurchase({ entitlementRepository }, purchaseInput({ quantity: 5 }), MAPPINGS);

    expect(entitlementRepository.issueWithActivationKey).not.toHaveBeenCalled();
  });
});

describe("receiveEtsyPurchase — the nominal path and its retry", () => {
  it("provisions a new valid purchase once, with a raw activation key", async () => {
    const { repository: entitlementRepository, issueWithActivationKey } = uniqueIndexRepository();

    const result = await receiveEtsyPurchase(
      { entitlementRepository },
      purchaseInput({ listingId: "1234567891" }),
      MAPPINGS,
    );

    expect(result.status).toBe("provisioned");
    if (result.status !== "provisioned") throw new Error("unreachable");
    expect(issueWithActivationKey).toHaveBeenCalledTimes(1);
    expect(result.entitlement.offerId).toBe("juif");
    expect(result.entitlement.source).toBe("etsy");
    expect(result.entitlement.externalOrderId).toBe("receipt-9001");
    expect(result.entitlement.ownerId).toBeNull();
    expect(result.rawActivationKey.startsWith("HH1-")).toBe(true);
  });

  it("a coherent retry is alreadyProvisioned: same right, no new write, no new key", async () => {
    const { repository: entitlementRepository, issueWithActivationKey } = uniqueIndexRepository();

    const first = await receiveEtsyPurchase({ entitlementRepository }, purchaseInput(), MAPPINGS);
    const retry = await receiveEtsyPurchase({ entitlementRepository }, purchaseInput(), MAPPINGS);

    if (first.status !== "provisioned") throw new Error("unreachable");
    expect(retry).toEqual({ status: "alreadyProvisioned", entitlement: first.entitlement });
    expect(retry).not.toHaveProperty("rawActivationKey");
    expect(JSON.stringify(retry)).not.toContain(first.rawActivationKey);
    // Two attempts, one row. The index decided, not a check-then-act.
    expect(issueWithActivationKey).toHaveBeenCalledTimes(2);
    expect(entitlementRepository.swapActivationKey).not.toHaveBeenCalled();
    expect(entitlementRepository.findByExternalOrder).not.toHaveBeenCalled();
  });

  it("a retry is not an error — it never surfaces as a rejection", async () => {
    const { repository: entitlementRepository } = uniqueIndexRepository();

    await receiveEtsyPurchase({ entitlementRepository }, purchaseInput(), MAPPINGS);
    const retry = await receiveEtsyPurchase({ entitlementRepository }, purchaseInput(), MAPPINGS);

    expect(retry.status).not.toBe("rejected");
    expect(retry.status).toBe("alreadyProvisioned");
  });

  it("two concurrent deliveries of one purchase yield exactly one right", async () => {
    const { repository: entitlementRepository } = uniqueIndexRepository();

    const [a, b] = await Promise.all([
      receiveEtsyPurchase({ entitlementRepository }, purchaseInput(), MAPPINGS),
      receiveEtsyPurchase({ entitlementRepository }, purchaseInput(), MAPPINGS),
    ]);

    expect([a.status, b.status].sort()).toEqual(["alreadyProvisioned", "provisioned"]);
  });
});

describe("receiveEtsyPurchase — a contradiction is never a retry", () => {
  it("refuses the same order resolving to a different offer as offerMismatch", async () => {
    const { repository: entitlementRepository } = uniqueIndexRepository();

    const first = await receiveEtsyPurchase({ entitlementRepository }, purchaseInput(), MAPPINGS);
    if (first.status !== "provisioned") throw new Error("unreachable");
    expect(first.entitlement.offerId).toBe("occidental");

    const contradiction = await receiveEtsyPurchase(
      { entitlementRepository },
      purchaseInput({ listingId: "1234567891" }),
      MAPPINGS,
    );

    expect(contradiction).toEqual({
      status: "rejected",
      reason: "offerMismatch",
      existingOfferId: "occidental",
      purchasedOfferId: "juif",
    });
    // Never masked as a successful retry, and never as a plain unknown.
    expect(contradiction.status).not.toBe("alreadyProvisioned");
    expect(contradiction.status).not.toBe("provisioned");
  });

  it("writes nothing on the mismatch and leaves the existing right exactly as it was", async () => {
    const { repository: entitlementRepository, issueWithActivationKey } = uniqueIndexRepository();

    const first = await receiveEtsyPurchase({ entitlementRepository }, purchaseInput(), MAPPINGS);
    if (first.status !== "provisioned") throw new Error("unreachable");
    const callsAfterFirst = issueWithActivationKey.mock.calls.length;

    const contradiction = await receiveEtsyPurchase(
      { entitlementRepository },
      purchaseInput({ listingId: "1234567891" }),
      MAPPINGS,
    );

    // The single INSERT attempt is what discovered the collision. No
    // second write, no key rotation, no key in the result.
    expect(issueWithActivationKey).toHaveBeenCalledTimes(callsAfterFirst + 1);
    expect(entitlementRepository.swapActivationKey).not.toHaveBeenCalled();
    expect(contradiction).not.toHaveProperty("rawActivationKey");
    expect(contradiction).not.toHaveProperty("entitlement");

    // The offer of the existing right was not changed to match the new
    // delivery: a replay still returns the original, untouched.
    const replay = await receiveEtsyPurchase({ entitlementRepository }, purchaseInput(), MAPPINGS);
    expect(replay).toEqual({ status: "alreadyProvisioned", entitlement: first.entitlement });
    if (replay.status !== "alreadyProvisioned") throw new Error("unreachable");
    expect(replay.entitlement.offerId).toBe("occidental");
  });
});

describe("receiveEtsyPurchase — a technical failure stays a technical failure", () => {
  it("propagates an infrastructure error instead of turning it into a business refusal", async () => {
    const entitlementRepository = repository({
      issueWithActivationKey: vi.fn().mockRejectedValue(new Error("connection reset")),
    });

    // If this ever resolved instead of rejecting, the assertion below
    // would fail — which is the point: a caller must never be told
    // "unknownListing" or "alreadyProvisioned" because the database was
    // unreachable, and must stay free to retry.
    await expect(
      receiveEtsyPurchase({ entitlementRepository }, purchaseInput(), MAPPINGS),
    ).rejects.toThrow("connection reset");
  });

  it("does not convert a repository failure into any typed outcome at all", async () => {
    const entitlementRepository = repository({
      issueWithActivationKey: vi.fn().mockRejectedValue(new Error("statement timeout")),
    });

    const outcome = await receiveEtsyPurchase(
      { entitlementRepository },
      purchaseInput(),
      MAPPINGS,
    ).then(
      (value) => ({ settled: "resolved" as const, value }),
      (error: unknown) => ({ settled: "rejected" as const, error }),
    );

    expect(outcome.settled).toBe("rejected");
    if (outcome.settled !== "rejected") throw new Error("unreachable");
    expect(outcome.error).toBeInstanceOf(Error);
  });

  it("still refuses a business-invalid purchase without ever calling the failing repository", async () => {
    // The counterpart of the two tests above: a refusal must come from
    // the purchase being wrong, never from infrastructure being down.
    const issueWithActivationKey = vi.fn().mockRejectedValue(new Error("connection reset"));
    const entitlementRepository = repository({ issueWithActivationKey });

    const result = await receiveEtsyPurchase(
      { entitlementRepository },
      purchaseInput({ listingId: "9999999999" }),
      MAPPINGS,
    );

    expect(result.status).toBe("rejected");
    expect(issueWithActivationKey).not.toHaveBeenCalled();
  });
});

describe("receiveEtsyPurchase — nothing personal crosses this boundary", () => {
  const PII = {
    buyerEmail: "grieving.family@example.com",
    buyerName: "A Name",
    shippingAddress: "1 Somewhere, Somewhere",
    phone: "+33600000000",
    cardLast4: "4242",
    receiptPdfUrl: "https://etsy.example/receipt.pdf",
  };

  it("keeps buyer identity and payment data out of every result", async () => {
    const { repository: entitlementRepository } = uniqueIndexRepository();

    const provisioned = await receiveEtsyPurchase(
      { entitlementRepository },
      purchaseInput(PII),
      MAPPINGS,
    );
    const retry = await receiveEtsyPurchase(
      { entitlementRepository },
      purchaseInput(PII),
      MAPPINGS,
    );
    const refused = await receiveEtsyPurchase(
      { entitlementRepository },
      purchaseInput({ ...PII, quantity: 2 }),
      MAPPINGS,
    );

    for (const result of [provisioned, retry, refused]) {
      const serialised = JSON.stringify(result);
      for (const value of Object.values(PII)) {
        expect(serialised).not.toContain(value);
      }
    }
  });

  it("keeps buyer identity and payment data out of persistence too", async () => {
    const { repository: entitlementRepository, issueWithActivationKey } = uniqueIndexRepository();

    await receiveEtsyPurchase({ entitlementRepository }, purchaseInput(PII), MAPPINGS);

    const serialised = JSON.stringify(issueWithActivationKey.mock.calls[0][0]);
    for (const value of Object.values(PII)) {
      expect(serialised).not.toContain(value);
    }
    // No full Etsy payload is retained anywhere on the path: the domain
    // receives four fields and no more.
    expect(Object.keys(issueWithActivationKey.mock.calls[0][0]).sort()).toEqual([
      "activationKeyHash",
      "externalOrderId",
      "offerId",
      "source",
    ]);
  });

  it("the raw activation key exists on a first provisioning and nowhere else", async () => {
    const { repository: entitlementRepository, issueWithActivationKey } = uniqueIndexRepository();

    const first = await receiveEtsyPurchase({ entitlementRepository }, purchaseInput(), MAPPINGS);
    if (first.status !== "provisioned") throw new Error("unreachable");
    const hash = issueWithActivationKey.mock.calls[0][0].activationKeyHash;

    const retry = await receiveEtsyPurchase({ entitlementRepository }, purchaseInput(), MAPPINGS);
    const mismatch = await receiveEtsyPurchase(
      { entitlementRepository },
      purchaseInput({ listingId: "1234567891" }),
      MAPPINGS,
    );
    const refused = await receiveEtsyPurchase(
      { entitlementRepository },
      purchaseInput({ quantity: 2 }),
      MAPPINGS,
    );
    const unknown = await receiveEtsyPurchase(
      { entitlementRepository },
      purchaseInput({ listingId: "9999999999" }),
      MAPPINGS,
    );

    for (const result of [retry, mismatch, refused, unknown]) {
      const serialised = JSON.stringify(result);
      expect(result).not.toHaveProperty("rawActivationKey");
      expect(serialised).not.toContain(first.rawActivationKey);
      // Not the hash either: neither half of the secret leaves here.
      expect(serialised).not.toContain(hash);
    }
  });

  it("logs nothing on any path — no key, no hash, no order id, no payload", async () => {
    const { repository: entitlementRepository } = uniqueIndexRepository();
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation(() => {}),
    );

    try {
      await receiveEtsyPurchase({ entitlementRepository }, purchaseInput(PII), MAPPINGS);
      await receiveEtsyPurchase({ entitlementRepository }, purchaseInput(PII), MAPPINGS);
      await receiveEtsyPurchase({ entitlementRepository }, purchaseInput({ quantity: 2 }), MAPPINGS);
      await receiveEtsyPurchase({ entitlementRepository }, purchaseInput({ listingId: "x" }), MAPPINGS);
      await receiveEtsyPurchase({ entitlementRepository }, "not an object", MAPPINGS);

      for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });
});

describe("receiveEtsyPurchase — composition, not duplication", () => {
  it("uses the real configured mapping by default, refusing every listing until the shop is live", async () => {
    const entitlementRepository = repository();

    // No `mappings` argument: the default is ETSY_LISTING_MAPPINGS, which
    // ships empty. The boundary must be safe in that state, not
    // permissive.
    const result = await receiveEtsyPurchase({ entitlementRepository }, purchaseInput());

    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") throw new Error("unreachable");
    expect(result.reason).toBe("unknownListing");
    assertRepositoryUntouched(entitlementRepository);
  });

  it("every outcome is one of the three named commercial statuses", async () => {
    const { repository: entitlementRepository } = uniqueIndexRepository();

    const results = [
      await receiveEtsyPurchase({ entitlementRepository }, purchaseInput(), MAPPINGS),
      await receiveEtsyPurchase({ entitlementRepository }, purchaseInput(), MAPPINGS),
      await receiveEtsyPurchase({ entitlementRepository }, purchaseInput({ quantity: 2 }), MAPPINGS),
      await receiveEtsyPurchase({ entitlementRepository }, null, MAPPINGS),
    ];

    expect(results.map((result) => result.status)).toEqual([
      "provisioned",
      "alreadyProvisioned",
      "rejected",
      "rejected",
    ]);
  });
});
