import { describe, expect, it } from "vitest";
import { OFFER_IDS, OFFERS } from "@/config/offers";
import type { EntitlementStatus } from "@/config/entitlements";
import { planEntitlementActivation } from "./activate-entitlement";

describe("planEntitlementActivation — legality of the entitlement's status", () => {
  it("accepts an available entitlement with an allowed skin", () => {
    const result = planEntitlementActivation({ status: "available", offerId: "arabe" }, "maghreb");

    expect(result).toEqual({ ok: true, memorialType: "person", skinId: "maghreb" });
  });

  const NOT_AVAILABLE: EntitlementStatus[] = ["redeemed", "revoked"];

  it.each(NOT_AVAILABLE)("rejects a %s entitlement, never throws", (status) => {
    const result = planEntitlementActivation({ status, offerId: "arabe" }, "maghreb");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain(status);
    }
  });
});

describe("planEntitlementActivation — skin must belong to the offer's allowedSkins", () => {
  it("rejects a skin from a different culture, never throws", () => {
    const result = planEntitlementActivation({ status: "available", offerId: "arabe" }, "indien");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("indien");
      expect(result.reason).toContain("arabe");
    }
  });

  it("never lets an unauthorized skin through even when the entitlement is otherwise valid", () => {
    const result = planEntitlementActivation({ status: "available", offerId: "occidental" }, "juif");

    expect(result.ok).toBe(false);
  });
});

describe("planEntitlementActivation — memorialType always comes from the offer, never the caller", () => {
  it.each(OFFER_IDS)("resolves %s to its configured memorialType and its own allowed skin", (offerId) => {
    const [firstAllowedSkin] = OFFERS[offerId].allowedSkins;

    const result = planEntitlementActivation({ status: "available", offerId }, firstAllowedSkin);

    expect(result).toEqual({
      ok: true,
      memorialType: OFFERS[offerId].memorialType,
      skinId: firstAllowedSkin,
    });
  });
});
