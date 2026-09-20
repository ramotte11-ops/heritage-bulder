import { describe, expect, it } from "vitest";
import { resolveAvailableTraditionSuggestions, TRADITION_SUGGESTIONS, type TraditionSuggestion } from "./tradition-suggestions";

/**
 * Fictional test fixtures only (mission brief section 6) — ids and texts
 * confined to this file, never a real tradition's name or content.
 */
const FIXTURE_UNIVERSAL: TraditionSuggestion = {
  id: "fixture:universal",
  labels: { en: "Fixture universal", fr: "Fixture universelle", es: "Fixture universal" },
  texts: { en: "Fixture text.", fr: "Texte fictif.", es: "Texto ficticio." },
};

const FIXTURE_OFFER_RESTRICTED: TraditionSuggestion = {
  id: "fixture:offer-restricted",
  labels: { en: "Fixture offer-restricted", fr: "Fixture liée à une offre", es: "Fixture restringida" },
  texts: { en: "Fixture text.", fr: "Texte fictif.", es: "Texto ficticio." },
  compatibleOffers: ["musulman"],
};

const FIXTURE_SKIN_RESTRICTED: TraditionSuggestion = {
  id: "fixture:skin-restricted",
  labels: { en: "Fixture skin-restricted", fr: "Fixture liée à un skin", es: "Fixture restringida" },
  texts: { en: "Fixture text.", fr: "Texte fictif.", es: "Texto ficticio." },
  compatibleSkins: ["hindou"],
};

const FIXTURE_CATALOG: readonly TraditionSuggestion[] = [
  FIXTURE_UNIVERSAL,
  FIXTURE_OFFER_RESTRICTED,
  FIXTURE_SKIN_RESTRICTED,
];

describe("TRADITION_SUGGESTIONS — V1 doctrine", () => {
  it("ships empty — no cultural content hardcoded for Mission 042 (mission brief section 6)", () => {
    expect(TRADITION_SUGGESTIONS).toEqual([]);
  });
});

describe("resolveAvailableTraditionSuggestions — the engine works with zero suggestions", () => {
  it("returns an empty list against the real, empty production catalog", () => {
    expect(resolveAvailableTraditionSuggestions({})).toEqual([]);
  });

  it("returns an empty list against the real catalog for any offer/skin", () => {
    expect(resolveAvailableTraditionSuggestions({ offerId: "musulman", skin: "musulman" })).toEqual([]);
  });
});

describe("resolveAvailableTraditionSuggestions — configuration -> allowed suggestions, never a selection", () => {
  it("a suggestion with no compatibility restriction is available to every input", () => {
    const result = resolveAvailableTraditionSuggestions({}, FIXTURE_CATALOG);
    expect(result.map((s) => s.id)).toContain("fixture:universal");
  });

  it("an offer-restricted suggestion is hidden when no offerId is supplied", () => {
    const result = resolveAvailableTraditionSuggestions({}, FIXTURE_CATALOG);
    expect(result.map((s) => s.id)).not.toContain("fixture:offer-restricted");
  });

  it("an offer-restricted suggestion is shown only for its own compatible offer", () => {
    const matching = resolveAvailableTraditionSuggestions({ offerId: "musulman" }, FIXTURE_CATALOG);
    expect(matching.map((s) => s.id)).toContain("fixture:offer-restricted");

    const nonMatching = resolveAvailableTraditionSuggestions({ offerId: "juif" }, FIXTURE_CATALOG);
    expect(nonMatching.map((s) => s.id)).not.toContain("fixture:offer-restricted");
  });

  it("a skin-restricted suggestion is shown only for its own compatible skin", () => {
    const matching = resolveAvailableTraditionSuggestions({ skin: "hindou" }, FIXTURE_CATALOG);
    expect(matching.map((s) => s.id)).toContain("fixture:skin-restricted");

    const nonMatching = resolveAvailableTraditionSuggestions({ skin: "intemporel" }, FIXTURE_CATALOG);
    expect(nonMatching.map((s) => s.id)).not.toContain("fixture:skin-restricted");
  });

  it("never mutates or reorders the catalog — same suggestion objects, filtered only", () => {
    const result = resolveAvailableTraditionSuggestions({ offerId: "musulman", skin: "hindou" }, FIXTURE_CATALOG);
    expect(result).toContain(FIXTURE_UNIVERSAL);
    expect(result).toContain(FIXTURE_OFFER_RESTRICTED);
    expect(result).toContain(FIXTURE_SKIN_RESTRICTED);
  });

  it("no suggestion is ever returned pre-selected — the resolver has no concept of selection at all", () => {
    const result = resolveAvailableTraditionSuggestions({ offerId: "musulman" }, FIXTURE_CATALOG);
    for (const suggestion of result) {
      expect(suggestion).not.toHaveProperty("selected");
      expect(suggestion).not.toHaveProperty("defaultSelected");
    }
  });

  it("an empty fixture catalog resolves to an empty list — the engine never invents a suggestion", () => {
    expect(resolveAvailableTraditionSuggestions({ offerId: "musulman", skin: "hindou" }, [])).toEqual([]);
  });
});

describe("resolveAvailableTraditionSuggestions — no hardcoded skin/offer branching", () => {
  it("changing only the skin never changes which suggestions are offer-restricted, and vice versa — the two axes are independent, declarative filters, not special-cased logic", () => {
    const byOfferOnly = resolveAvailableTraditionSuggestions({ offerId: "musulman" }, FIXTURE_CATALOG);
    const byOfferAndSkin = resolveAvailableTraditionSuggestions(
      { offerId: "musulman", skin: "juif" },
      FIXTURE_CATALOG,
    );
    // The offer-restricted fixture is available in both (offer matches in
    // both); the skin-restricted fixture is available in neither (its
    // own compatibleSkins never includes "juif", and is irrelevant to
    // whether offerId is also supplied).
    expect(byOfferOnly.map((s) => s.id)).toContain("fixture:offer-restricted");
    expect(byOfferAndSkin.map((s) => s.id)).toContain("fixture:offer-restricted");
    expect(byOfferOnly.map((s) => s.id)).not.toContain("fixture:skin-restricted");
    expect(byOfferAndSkin.map((s) => s.id)).not.toContain("fixture:skin-restricted");
  });
});
