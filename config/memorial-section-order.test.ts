import { describe, expect, it } from "vitest";
import { MEMORIAL_SECTIONS, SECTION_IDS } from "./sections";
import { MEMORIAL_EDITORIAL_ORDER, MEMORIAL_SECTION_ORDER, RESERVED_MEMORIAL_SLOTS } from "./memorial-section-order";

/**
 * Fondation Memorial assemblé — the canonical order, validated by the QG
 * (rectificatif final). Locked: reordering is a QG decision, never a
 * side effect.
 */
describe("MEMORIAL_SECTION_ORDER", () => {
  it("is an exact permutation of the catalog's sections (same members, no duplicate, nothing extra)", () => {
    const catalog = MEMORIAL_SECTIONS.map((section) => section.id);
    expect(new Set(MEMORIAL_SECTION_ORDER).size).toBe(MEMORIAL_SECTION_ORDER.length);
    expect([...MEMORIAL_SECTION_ORDER].sort()).toEqual([...catalog].sort());
  });

  it("is the QG's canonical order", () => {
    expect(MEMORIAL_SECTION_ORDER).toEqual([
      "hero",
      "deathNotice",
      "ceremony",
      "story",
      "traditions",
      "gallery",
      "symbolicOfferings",
      "testimonials",
      "video",
      "condolences",
    ]);
  });

  it("keeps story immediately followed by traditions (artistic authority of the two Masters)", () => {
    const story = MEMORIAL_SECTION_ORDER.indexOf("story");
    expect(MEMORIAL_SECTION_ORDER[story + 1]).toBe("traditions");
  });

  it("VID-08 — keeps the historical `condolences` id, last, never between the Contributions and the Vidéo", () => {
    const testimonials = MEMORIAL_SECTION_ORDER.indexOf("testimonials");
    const condolences = MEMORIAL_SECTION_ORDER.indexOf("condolences");
    expect(testimonials).toBeGreaterThanOrEqual(0);
    expect(condolences).toBe(MEMORIAL_SECTION_ORDER.length - 1);
    expect(MEMORIAL_SECTION_ORDER[testimonials + 1]).toBe("video");
  });
});

describe("Offrandes symboliques (M3)", () => {
  it("sits between the Galerie and the Contributions des proches (PO decision of 20 October)", () => {
    const offerings = MEMORIAL_SECTION_ORDER.indexOf("symbolicOfferings");
    expect(offerings).toBeGreaterThan(MEMORIAL_SECTION_ORDER.indexOf("gallery"));
    expect(MEMORIAL_SECTION_ORDER[offerings + 1]).toBe("testimonials");
  });

  it("VID-08 — PO order: Offrandes → Contributions des proches → Vidéo hommage", () => {
    const offerings = MEMORIAL_SECTION_ORDER.indexOf("symbolicOfferings");
    expect(MEMORIAL_SECTION_ORDER.slice(offerings, offerings + 3)).toEqual(["symbolicOfferings", "testimonials", "video"]);
    expect(MEMORIAL_SECTION_ORDER[MEMORIAL_SECTION_ORDER.indexOf("gallery") + 1]).toBe("symbolicOfferings");
  });
});

describe("RESERVED_MEMORIAL_SLOTS", () => {
  it("holds no reservation any more: Offrandes symboliques became a real section", () => {
    expect(RESERVED_MEMORIAL_SLOTS).toEqual([]);
    expect(MEMORIAL_EDITORIAL_ORDER).toEqual(MEMORIAL_SECTION_ORDER);
    expect(SECTION_IDS).toContain("symbolicOfferings");
  });
});
