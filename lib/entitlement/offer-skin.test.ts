import { describe, expect, it } from "vitest";
import { OFFER_IDS, OFFERS } from "@/config/offers";
import { getAllowedSkins, getMemorialTypeForOffer, isSkinAllowedForOffer } from "./offer-skin";

describe("getMemorialTypeForOffer", () => {
  it.each(OFFER_IDS)("returns %s's configured memorialType", (offerId) => {
    expect(getMemorialTypeForOffer(offerId)).toBe(OFFERS[offerId].memorialType);
  });
});

describe("getAllowedSkins", () => {
  it.each(OFFER_IDS)("returns %s's configured allowedSkins", (offerId) => {
    expect(getAllowedSkins(offerId)).toEqual(OFFERS[offerId].allowedSkins);
  });

  it.each(OFFER_IDS)("%s's allowedSkins is never empty", (offerId) => {
    expect(getAllowedSkins(offerId).length).toBeGreaterThan(0);
  });
});

describe("isSkinAllowedForOffer", () => {
  it("accepts a skin that is in the offer's allowedSkins", () => {
    expect(isSkinAllowedForOffer("arabe", "maghreb")).toBe(true);
  });

  it("rejects a skin from a different offer's culture", () => {
    expect(isSkinAllowedForOffer("arabe", "indien")).toBe(false);
    expect(isSkinAllowedForOffer("occidental", "maghreb")).toBe(false);
  });

  it.each(OFFER_IDS)("%s never allows a skin id that doesn't exist", (offerId) => {
    // @ts-expect-error — deliberately not a real Skin, proving the
    // check doesn't accidentally pass on garbage input.
    expect(isSkinAllowedForOffer(offerId, "not-a-real-skin")).toBe(false);
  });
});
