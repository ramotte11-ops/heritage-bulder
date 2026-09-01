import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  EntitlementRepository,
  RedeemEntitlementOutcome,
} from "@/lib/adapters/entitlement-repository";
import type { OwnerRepository } from "@/lib/adapters/owner-repository";
import type { Entitlement } from "@/types/entitlement";
import type { Owner } from "@/types/owner";
import { OFFERS } from "@/config/offers";
import { redeemAuthenticatedEntitlement } from "./redeem-authenticated-entitlement";
import type { AuthenticatedIdentity } from "./resolve-owner";

// File-level, so a failing assertion inside a test that installed a spy
// can never leak it into the next test.
afterEach(() => {
  vi.restoreAllMocks();
});

const AUTH_USER_ID = "auth-user-1";
const OWNER_ID = "owner-1";
const ENTITLEMENT_ID = "entitlement-1";

const IDENTITY: AuthenticatedIdentity = {
  id: AUTH_USER_ID,
  email: "famille@example.test",
  email_confirmed_at: "2026-09-01T10:00:00.000Z",
  is_anonymous: false,
};

const OWNER: Owner = {
  id: OWNER_ID,
  authUserId: AUTH_USER_ID,
  email: "famille@example.test",
  createdAt: "2026-09-01T10:00:00.000Z",
  updatedAt: "2026-09-01T10:00:00.000Z",
};

function entitlement(overrides: Partial<Entitlement> = {}): Entitlement {
  return {
    id: ENTITLEMENT_ID,
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

function deps({
  owner = OWNER,
  entitlementRow = entitlement(),
  outcome = { status: "redeemed", memorialId: "memorial-1" } as RedeemEntitlementOutcome,
  ownerRepository: ownerOverride,
}: {
  owner?: Owner | null;
  entitlementRow?: Entitlement | null;
  outcome?: RedeemEntitlementOutcome;
  ownerRepository?: Partial<OwnerRepository>;
} = {}) {
  const redeem = vi.fn().mockResolvedValue(outcome);
  const ownerRepository: OwnerRepository = {
    findByAuthUserId: vi.fn().mockResolvedValue(owner),
    findByEmail: vi.fn().mockResolvedValue(null),
    create: vi.fn(async () => {
      throw new Error("create() was not expected to be called");
    }),
    ...ownerOverride,
  };
  const entitlementRepository: EntitlementRepository = {
    findById: vi.fn().mockResolvedValue(entitlementRow),
    redeem,
  };

  return { ownerRepository, entitlementRepository, redeem };
}

describe("redeemAuthenticatedEntitlement — the happy path", () => {
  it("J: redeems and returns the memorial id", async () => {
    const d = deps();

    const result = await redeemAuthenticatedEntitlement(d, {
      identity: IDENTITY,
      entitlementId: ENTITLEMENT_ID,
    });

    expect(result).toEqual({ status: "redeemed", memorialId: "memorial-1" });
  });

  it("O: the owner id sent to the RPC comes from server-side resolution, never from the caller", async () => {
    // There is no ownerId parameter to pass at all — the only way one
    // reaches the RPC is through resolveOwnerForIdentity.
    const d = deps({ owner: { ...OWNER, id: "owner-resolved-server-side" } });

    await redeemAuthenticatedEntitlement(d, {
      identity: IDENTITY,
      entitlementId: ENTITLEMENT_ID,
    });

    expect(d.redeem).toHaveBeenCalledWith(
      expect.objectContaining({ ownerId: "owner-resolved-server-side" }),
    );
  });

  it("K: the same owner retrying gets the same memorial back, not an error", async () => {
    const d = deps({
      entitlementRow: entitlement({ status: "redeemed", ownerId: OWNER_ID }),
      outcome: { status: "alreadyRedeemed", memorialId: "memorial-1" },
    });

    const result = await redeemAuthenticatedEntitlement(d, {
      identity: IDENTITY,
      entitlementId: ENTITLEMENT_ID,
    });

    expect(result).toEqual({ status: "alreadyRedeemed", memorialId: "memorial-1" });
    // Status is the RPC's call, under its row lock — this layer must not
    // pre-reject a non-available entitlement, or idempotence breaks.
    expect(d.redeem).toHaveBeenCalledTimes(1);
  });
});

describe("redeemAuthenticatedEntitlement — Offer drives type and skin", () => {
  it("I: derives memorialType from the Offer, never from the caller", async () => {
    const d = deps({ entitlementRow: entitlement({ offerId: "juif" }) });

    await redeemAuthenticatedEntitlement(d, {
      identity: IDENTITY,
      entitlementId: ENTITLEMENT_ID,
    });

    expect(d.redeem).toHaveBeenCalledWith(
      expect.objectContaining({
        memorialType: OFFERS.juif.memorialType,
        skinId: "juif",
      }),
    );
  });

  it.each(Object.keys(OFFERS) as (keyof typeof OFFERS)[])(
    "G: resolves the single allowed skin automatically for offer %s",
    async (offerId) => {
      const d = deps({ entitlementRow: entitlement({ offerId }) });

      const result = await redeemAuthenticatedEntitlement(d, {
        identity: IDENTITY,
        entitlementId: ENTITLEMENT_ID,
      });

      expect(result.status).toBe("redeemed");
      expect(d.redeem).toHaveBeenCalledWith(
        expect.objectContaining({ skinId: OFFERS[offerId].allowedSkins[0] }),
      );
    },
  );

  it("H: asks for a choice when an offer allows several skins and none was supplied", async () => {
    // Simulates the future multi-skin offer this must not guess at.
    const multiSkin = { ...OFFERS.occidental, allowedSkins: ["intemporel", "maghreb"] as const };
    vi.spyOn(OFFERS, "occidental", "get").mockReturnValue(multiSkin);
    const d = deps();

    const result = await redeemAuthenticatedEntitlement(d, {
      identity: IDENTITY,
      entitlementId: ENTITLEMENT_ID,
    });

    expect(result).toEqual({
      status: "skinSelectionRequired",
      allowedSkins: ["intemporel", "maghreb"],
    });
    expect(d.redeem).not.toHaveBeenCalled();
  });

  it("uses the supplied skin when the offer allows it", async () => {
    const d = deps({ entitlementRow: entitlement({ offerId: "arabe" }) });

    const result = await redeemAuthenticatedEntitlement(d, {
      identity: IDENTITY,
      entitlementId: ENTITLEMENT_ID,
      selectedSkin: "maghreb",
    });

    expect(result.status).toBe("redeemed");
    expect(d.redeem).toHaveBeenCalledWith(expect.objectContaining({ skinId: "maghreb" }));
  });

  it("I: refuses a skin the offer does not allow, before any RPC call", async () => {
    const d = deps({ entitlementRow: entitlement({ offerId: "occidental" }) });

    const result = await redeemAuthenticatedEntitlement(d, {
      identity: IDENTITY,
      entitlementId: ENTITLEMENT_ID,
      selectedSkin: "juif",
    });

    expect(result).toEqual({ status: "invalidSkin" });
    expect(d.redeem).not.toHaveBeenCalled();
  });

  it("F: refuses an offer this build does not know, before any RPC call", async () => {
    const d = deps({
      entitlementRow: entitlement({ offerId: "an-offer-from-the-future" as never }),
    });

    const result = await redeemAuthenticatedEntitlement(d, {
      identity: IDENTITY,
      entitlementId: ENTITLEMENT_ID,
    });

    expect(result).toEqual({ status: "invalidOffer" });
    expect(d.redeem).not.toHaveBeenCalled();
  });
});

describe("redeemAuthenticatedEntitlement — refusals", () => {
  it("F: never calls the RPC when the entitlement does not exist", async () => {
    const d = deps({ entitlementRow: null });

    const result = await redeemAuthenticatedEntitlement(d, {
      identity: IDENTITY,
      entitlementId: ENTITLEMENT_ID,
    });

    expect(result).toEqual({ status: "entitlementNotFound" });
    expect(d.redeem).not.toHaveBeenCalled();
  });

  it("M: surfaces a revoked entitlement as a refusal", async () => {
    const d = deps({
      entitlementRow: entitlement({ status: "revoked" }),
      outcome: { status: "notAvailable" },
    });

    const result = await redeemAuthenticatedEntitlement(d, {
      identity: IDENTITY,
      entitlementId: ENTITLEMENT_ID,
    });

    expect(result).toEqual({ status: "entitlementNotAvailable" });
  });

  it("L: refuses an entitlement already consumed by another owner", async () => {
    const d = deps({
      entitlementRow: entitlement({ status: "redeemed", ownerId: "somebody-else" }),
      outcome: { status: "ownedByAnotherOwner" },
    });

    const result = await redeemAuthenticatedEntitlement(d, {
      identity: IDENTITY,
      entitlementId: ENTITLEMENT_ID,
    });

    // No memorial id, and nothing revealing whose it is.
    expect(result).toEqual({ status: "entitlementOwnedByAnotherOwner" });
  });

  it("N: reports the 011A integrity anomaly as a safe application result", async () => {
    const d = deps({ outcome: { status: "integrityAnomaly" } });

    const result = await redeemAuthenticatedEntitlement(d, {
      identity: IDENTITY,
      entitlementId: ENTITLEMENT_ID,
    });

    expect(result).toEqual({ status: "integrityError" });
  });

  it("N: never leaks a SQL message, code or stack into any result", async () => {
    const outcomes: RedeemEntitlementOutcome[] = [
      { status: "notFound" },
      { status: "notAvailable" },
      { status: "ownedByAnotherOwner" },
      { status: "integrityAnomaly" },
    ];

    for (const outcome of outcomes) {
      const result = await redeemAuthenticatedEntitlement(deps({ outcome }), {
        identity: IDENTITY,
        entitlementId: ENTITLEMENT_ID,
      });

      const serialized = JSON.stringify(result);
      expect(serialized).not.toMatch(/HH\d{3}|SQLSTATE|pg_|relation |duplicate key|at Object\./);
      expect(Object.keys(result)).toEqual(["status"]);
    }
  });
});

describe("redeemAuthenticatedEntitlement — owner resolution short-circuits", () => {
  it("stops at the identity check without reading any entitlement", async () => {
    const d = deps();

    const result = await redeemAuthenticatedEntitlement(d, {
      identity: { ...IDENTITY, email_confirmed_at: undefined },
      entitlementId: ENTITLEMENT_ID,
    });

    expect(result.status).toBe("invalidAuthenticatedIdentity");
    expect(d.entitlementRepository.findById).not.toHaveBeenCalled();
    expect(d.redeem).not.toHaveBeenCalled();
  });

  it("C: an unlinked owner at the same email blocks the redemption entirely", async () => {
    const d = deps({
      owner: null,
      ownerRepository: {
        findByAuthUserId: vi.fn().mockResolvedValue(null),
        findByEmail: vi.fn().mockResolvedValue({ ...OWNER, authUserId: null }),
      },
    });

    const result = await redeemAuthenticatedEntitlement(d, {
      identity: IDENTITY,
      entitlementId: ENTITLEMENT_ID,
    });

    expect(result).toEqual({ status: "ownerLinkConflict" });
    expect(d.redeem).not.toHaveBeenCalled();
  });

  it("D: an email owned by another auth user blocks the redemption entirely", async () => {
    const d = deps({
      owner: null,
      ownerRepository: {
        findByAuthUserId: vi.fn().mockResolvedValue(null),
        findByEmail: vi.fn().mockResolvedValue({ ...OWNER, authUserId: "another-auth-user" }),
      },
    });

    const result = await redeemAuthenticatedEntitlement(d, {
      identity: IDENTITY,
      entitlementId: ENTITLEMENT_ID,
    });

    expect(result).toEqual({ status: "ownerIdentityConflict" });
    expect(d.redeem).not.toHaveBeenCalled();
  });
});
