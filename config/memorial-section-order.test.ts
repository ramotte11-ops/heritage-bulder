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
      "video",
      "testimonials",
      "condolences",
    ]);
  });

  it("keeps story immediately followed by traditions (artistic authority of the two Masters)", () => {
    const story = MEMORIAL_SECTION_ORDER.indexOf("story");
    expect(MEMORIAL_SECTION_ORDER[story + 1]).toBe("traditions");
  });

  it("keeps testimonials and condolences as two distinct sections, in that order", () => {
    const testimonials = MEMORIAL_SECTION_ORDER.indexOf("testimonials");
    const condolences = MEMORIAL_SECTION_ORDER.indexOf("condolences");
    expect(testimonials).toBeGreaterThanOrEqual(0);
    expect(condolences).toBe(testimonials + 1);
  });
});

describe("RESERVED_MEMORIAL_SLOTS", () => {
  it("reserves Offrandes symboliques right after condolences in the editorial order", () => {
    expect(RESERVED_MEMORIAL_SLOTS).toEqual(["symbolicOfferings"]);
    expect(MEMORIAL_EDITORIAL_ORDER).toEqual([...MEMORIAL_SECTION_ORDER, "symbolicOfferings"]);
  });

  it("is never a real section id — no catalog entry, nothing the composition could render", () => {
    for (const slot of RESERVED_MEMORIAL_SLOTS) {
      expect(SECTION_IDS as readonly string[]).not.toContain(slot);
      expect(MEMORIAL_SECTION_ORDER as readonly string[]).not.toContain(slot);
    }
  });
});
