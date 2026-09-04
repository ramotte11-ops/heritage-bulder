import { describe, expect, it, vi } from "vitest";
import type { EntitlementRepository } from "@/lib/adapters/entitlement-repository";
import { hashActivationKey, parseActivationKey } from "@/lib/entitlement/activation-key";
import type { Entitlement } from "@/types/entitlement";
import { provisionEtsyPurchase } from "./provision-purchase";
import { validateEtsyPurchase, type ValidatedEtsyPurchase } from "./validate-purchase";
import type { EtsyListingMapping } from "./listing-mapping";

/**
 * Mission 018 — one validated Etsy purchase becomes exactly one right
 * carrying exactly one activation key, and a replay of that same
 * purchase becomes nothing at all.
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
 * A stand-in for the real repository that behaves like the PostgreSQL
 * unique index does: it never reads before writing, and a second INSERT
 * for the same (source, external_order_id) loses. Modelled on
 * SupabaseEntitlementRepository.issueWithActivationKey, whose collision
 * handling is the thing under test here — not re-implemented logic.
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
      // The "read" here is the index itself deciding, not the caller
      // looking first: it happens as part of the write attempt.
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
    issueWithActivationKey: vi
      .fn()
      .mockResolvedValue({ status: "issued", entitlement: entitlement() }),
    swapActivationKey: vi.fn(),
    redeem: vi.fn(),
    redeemWithActivationKey: vi.fn(),
    ...overrides,
  };
}

/** A purchase as Mission 017 really produces one — validated, not
 * hand-built — so these tests break if that contract ever drifts. */
function validatedPurchase(overrides: Record<string, unknown> = {}): ValidatedEtsyPurchase {
  const result = validateEtsyPurchase(
    {
      externalPurchaseId: "receipt-9001",
      listingId: "1234567890",
      quantity: 1,
      paymentState: "paid",
      ...overrides,
    },
    MAPPINGS,
  );
  if (result.status !== "validated") throw new Error(`fixture did not validate: ${result.reason}`);
  return result.purchase;
}

describe("provisionEtsyPurchase — first provisioning", () => {
  it("issues exactly one right, with the resolved offer, the etsy source and Etsy's own order id", async () => {
    const { repository: entitlementRepository, issueWithActivationKey } = uniqueIndexRepository();

    const result = await provisionEtsyPurchase(
      { entitlementRepository },
      validatedPurchase({ listingId: "1234567891" }),
    );

    expect(result.status).toBe("provisioned");
    if (result.status !== "provisioned") throw new Error("unreachable");
    expect(issueWithActivationKey).toHaveBeenCalledTimes(1);
    expect(result.entitlement.offerId).toBe("juif");
    expect(result.entitlement.source).toBe("etsy");
    expect(result.entitlement.externalOrderId).toBe("receipt-9001");
  });

  it("returns a well-formed raw activation key, and only ever hands persistence its hash", async () => {
    const { repository: entitlementRepository, issueWithActivationKey } = uniqueIndexRepository();

    const result = await provisionEtsyPurchase({ entitlementRepository }, validatedPurchase());
    if (result.status !== "provisioned") throw new Error("unreachable");

    const parsed = parseActivationKey(result.rawActivationKey);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error("unreachable");

    // Mission 013's format and hashing, unchanged: HH1 + SHA-256, and
    // nothing but the hash crosses into persistence.
    const [persisted] = issueWithActivationKey.mock.calls[0];
    expect(result.rawActivationKey.startsWith("HH1-")).toBe(true);
    expect(persisted.activationKeyHash).toBe(hashActivationKey(parsed.key));
    expect(persisted.activationKeyHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(persisted)).not.toContain(result.rawActivationKey);
    expect(JSON.stringify(persisted)).not.toContain(parsed.key.payload);
  });

  it("leaves the right unowned — Mission 018 creates no Owner and no Memorial", async () => {
    const { repository: entitlementRepository } = uniqueIndexRepository();

    const result = await provisionEtsyPurchase({ entitlementRepository }, validatedPurchase());
    if (result.status !== "provisioned") throw new Error("unreachable");

    expect(result.entitlement.ownerId).toBeNull();
    expect(result.entitlement.status).toBe("available");
    expect(result.entitlement.redeemedAt).toBeNull();
    // No memorial-creating call exists on this path at all.
    expect(entitlementRepository.redeem).not.toHaveBeenCalled();
    expect(entitlementRepository.redeemWithActivationKey).not.toHaveBeenCalled();
  });

  it("never reads before writing — the unique index decides, not a check-then-act", async () => {
    const { repository: entitlementRepository } = uniqueIndexRepository();

    await provisionEtsyPurchase({ entitlementRepository }, validatedPurchase());

    expect(entitlementRepository.findByExternalOrder).not.toHaveBeenCalled();
    expect(entitlementRepository.findById).not.toHaveBeenCalled();
    expect(entitlementRepository.findByActivationKeyHash).not.toHaveBeenCalled();
  });
});

describe("provisionEtsyPurchase — retry and concurrency", () => {
  it("a sequential replay returns the SAME right, creates nothing, and carries no key", async () => {
    const { repository: entitlementRepository, issueWithActivationKey } = uniqueIndexRepository();
    const purchase = validatedPurchase();

    const first = await provisionEtsyPurchase({ entitlementRepository }, purchase);
    const second = await provisionEtsyPurchase({ entitlementRepository }, purchase);

    if (first.status !== "provisioned") throw new Error("unreachable");
    expect(second.status).toBe("alreadyProvisioned");
    if (second.status !== "alreadyProvisioned") throw new Error("unreachable");

    expect(second.entitlement).toEqual(first.entitlement);
    // The raw key is not stored and cannot be re-read; a retry must not
    // mint a replacement that would silently invalidate the buyer's own.
    expect(second).not.toHaveProperty("rawActivationKey");
    expect(JSON.stringify(second)).not.toContain(first.rawActivationKey);
    // Two attempts were made — that is the point. Only one row exists.
    expect(issueWithActivationKey).toHaveBeenCalledTimes(2);
    const ids = new Set(
      [first.entitlement.id, second.entitlement.id].map((id) => id),
    );
    expect(ids.size).toBe(1);
  });

  it("does not rotate the key on retry: no second key is generated for the existing right", async () => {
    const { repository: entitlementRepository, issueWithActivationKey } = uniqueIndexRepository();
    const purchase = validatedPurchase();

    await provisionEtsyPurchase({ entitlementRepository }, purchase);
    await provisionEtsyPurchase({ entitlementRepository }, purchase);

    // The second attempt never reaches a key write of any kind — key
    // rotation is Mission 015B's audited Admin action, not a webhook
    // side effect.
    expect(entitlementRepository.swapActivationKey).not.toHaveBeenCalled();
    const [, secondAttempt] = issueWithActivationKey.mock.calls;
    expect(secondAttempt[0].externalOrderId).toBe("receipt-9001");
  });

  it("two concurrent deliveries of one purchase create exactly ONE right", async () => {
    const { repository: entitlementRepository, issueWithActivationKey } = uniqueIndexRepository();
    const purchase = validatedPurchase();

    const [a, b] = await Promise.all([
      provisionEtsyPurchase({ entitlementRepository }, purchase),
      provisionEtsyPurchase({ entitlementRepository }, purchase),
    ]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual(["alreadyProvisioned", "provisioned"]);
    expect(issueWithActivationKey).toHaveBeenCalledTimes(2);

    const provisioned = a.status === "provisioned" ? a : b;
    const duplicate = a.status === "provisioned" ? b : a;
    if (provisioned.status !== "provisioned" || duplicate.status !== "alreadyProvisioned") {
      throw new Error("unreachable");
    }
    expect(duplicate.entitlement.id).toBe(provisioned.entitlement.id);
    expect(duplicate).not.toHaveProperty("rawActivationKey");
  });

  it("a different purchase of the same listing still gets its own right", async () => {
    const { repository: entitlementRepository } = uniqueIndexRepository();

    const first = await provisionEtsyPurchase({ entitlementRepository }, validatedPurchase());
    const other = await provisionEtsyPurchase(
      { entitlementRepository },
      validatedPurchase({ externalPurchaseId: "receipt-9002" }),
    );

    expect(first.status).toBe("provisioned");
    expect(other.status).toBe("provisioned");
    if (first.status !== "provisioned" || other.status !== "provisioned") {
      throw new Error("unreachable");
    }
    expect(other.entitlement.id).not.toBe(first.entitlement.id);
    expect(other.rawActivationKey).not.toBe(first.rawActivationKey);
  });
});

describe("provisionEtsyPurchase — refusals write nothing", () => {
  it("refuses quantity = 2 explicitly, without one single repository call", async () => {
    const issueWithActivationKey = vi.fn();
    const entitlementRepository = repository({ issueWithActivationKey });

    const result = await provisionEtsyPurchase(
      { entitlementRepository },
      validatedPurchase({ quantity: 2 }),
    );

    expect(result).toEqual({ status: "rejected", reason: "unsupportedQuantity", quantity: 2 });
    expect(issueWithActivationKey).not.toHaveBeenCalled();
  });

  it("never silently provisions one right for a multi-unit purchase", async () => {
    const { repository: entitlementRepository, issueWithActivationKey } = uniqueIndexRepository();

    for (const quantity of [2, 3, 10]) {
      const result = await provisionEtsyPurchase(
        { entitlementRepository },
        validatedPurchase({ quantity }),
      );
      expect(result.status).toBe("rejected");
      if (result.status !== "rejected") throw new Error("unreachable");
      expect(result.reason).toBe("unsupportedQuantity");
      if (result.reason !== "unsupportedQuantity") throw new Error("unreachable");
      expect(result.quantity).toBe(quantity);
    }

    expect(issueWithActivationKey).not.toHaveBeenCalled();
  });

  it("refuses an unknown offer id cleanly and writes nothing", async () => {
    const issueWithActivationKey = vi.fn();
    const entitlementRepository = repository({ issueWithActivationKey });

    // Structurally unreachable through Mission 017's validation — hence
    // forged here, which is exactly the case this guard exists for.
    const forged = {
      externalPurchaseId: "receipt-9001",
      listingId: "1234567890",
      offerId: "an-offer-from-the-future",
      quantity: 1,
    } as unknown as ValidatedEtsyPurchase;

    const result = await provisionEtsyPurchase({ entitlementRepository }, forged);

    expect(result).toEqual({ status: "rejected", reason: "invalidOffer" });
    expect(issueWithActivationKey).not.toHaveBeenCalled();
  });
});

describe("provisionEtsyPurchase — what crosses into the domain", () => {
  it("hands the domain the offer, the channel label and the order id — and nothing else", async () => {
    const { repository: entitlementRepository, issueWithActivationKey } = uniqueIndexRepository();

    await provisionEtsyPurchase({ entitlementRepository }, validatedPurchase());

    const [persisted] = issueWithActivationKey.mock.calls[0];
    expect(Object.keys(persisted).sort()).toEqual([
      "activationKeyHash",
      "externalOrderId",
      "offerId",
      "source",
    ]);
  });

  it("never transmits listingId, quantity, or any Etsy-shaped field", async () => {
    const { repository: entitlementRepository, issueWithActivationKey } = uniqueIndexRepository();

    await provisionEtsyPurchase({ entitlementRepository }, validatedPurchase());

    const [persisted] = issueWithActivationKey.mock.calls[0];
    const serialised = JSON.stringify(persisted);
    expect(persisted).not.toHaveProperty("listingId");
    expect(persisted).not.toHaveProperty("quantity");
    expect(persisted).not.toHaveProperty("paymentState");
    // The listing id's VALUE must not have slipped through under
    // another name either.
    expect(serialised).not.toContain("1234567890");
    expect(serialised).not.toContain("paid");
  });

  it("carries no buyer identity: extra Etsy fields never reach persistence", async () => {
    const { repository: entitlementRepository, issueWithActivationKey } = uniqueIndexRepository();

    // Mission 017 already strips these; this proves Mission 018 does not
    // reintroduce a path for them.
    const purchase = validatedPurchase();
    const withPii = {
      ...purchase,
      buyerEmail: "grieving.family@example.com",
      buyerName: "A Name",
      shippingAddress: "1 Somewhere",
    } as ValidatedEtsyPurchase;

    await provisionEtsyPurchase({ entitlementRepository }, withPii);

    const serialised = JSON.stringify(issueWithActivationKey.mock.calls[0][0]);
    expect(serialised).not.toContain("grieving.family@example.com");
    expect(serialised).not.toContain("A Name");
    expect(serialised).not.toContain("1 Somewhere");
  });

  it("passes Etsy's order reference through byte-for-byte", async () => {
    const { repository: entitlementRepository, issueWithActivationKey } = uniqueIndexRepository();

    await provisionEtsyPurchase(
      { entitlementRepository },
      validatedPurchase({ externalPurchaseId: "  Receipt-00042  " }),
    );

    // Not trimmed, not normalised, not re-cased: the unique index keys
    // on this value, so any transformation would let one order land
    // twice under two references.
    expect(issueWithActivationKey.mock.calls[0][0].externalOrderId).toBe("  Receipt-00042  ");
  });
});

describe("provisionEtsyPurchase — no secret material escapes", () => {
  it("puts no raw key and no hash in a rejection or a duplicate result", async () => {
    const { repository: entitlementRepository, issueWithActivationKey } = uniqueIndexRepository();
    const purchase = validatedPurchase();

    const first = await provisionEtsyPurchase({ entitlementRepository }, purchase);
    if (first.status !== "provisioned") throw new Error("unreachable");
    const hash = issueWithActivationKey.mock.calls[0][0].activationKeyHash;

    const replay = await provisionEtsyPurchase({ entitlementRepository }, purchase);
    const refused = await provisionEtsyPurchase(
      { entitlementRepository },
      validatedPurchase({ quantity: 4 }),
    );

    for (const result of [replay, refused]) {
      const serialised = JSON.stringify(result);
      expect(serialised).not.toContain(first.rawActivationKey);
      expect(serialised).not.toContain(hash);
    }
  });

  it("logs nothing at all — no key, no hash, no order id on any path", async () => {
    const { repository: entitlementRepository } = uniqueIndexRepository();
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation(() => {}),
    );

    try {
      const purchase = validatedPurchase();
      await provisionEtsyPurchase({ entitlementRepository }, purchase);
      await provisionEtsyPurchase({ entitlementRepository }, purchase);
      await provisionEtsyPurchase({ entitlementRepository }, validatedPurchase({ quantity: 2 }));

      for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });

  it("lets an infrastructure failure propagate rather than swallowing it into a fake success", async () => {
    const entitlementRepository = repository({
      issueWithActivationKey: vi.fn().mockRejectedValue(new Error("connection reset")),
    });

    await expect(
      provisionEtsyPurchase({ entitlementRepository }, validatedPurchase()),
    ).rejects.toThrow("connection reset");
  });
});
