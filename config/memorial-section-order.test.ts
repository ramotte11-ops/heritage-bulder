import { describe, expect, it } from "vitest";
import { MEMORIAL_SECTIONS } from "./sections";
import { MEMORIAL_SECTION_ORDER } from "./memorial-section-order";

/**
 * Fondation Memorial assemblé. Deliberately asserts ONLY that the order
 * is an exact permutation of the catalog's sections — never a specific
 * order. The artistic order is PROVISOIRE and will be decided by the QG:
 * reordering must never require touching this test.
 */
describe("MEMORIAL_SECTION_ORDER", () => {
  it("is an exact permutation of the catalog's sections (same members, no duplicate, nothing extra)", () => {
    const catalog = MEMORIAL_SECTIONS.map((section) => section.id);
    expect(new Set(MEMORIAL_SECTION_ORDER).size).toBe(MEMORIAL_SECTION_ORDER.length);
    expect([...MEMORIAL_SECTION_ORDER].sort()).toEqual([...catalog].sort());
  });

  it("is declared PROVISOIRE in its own source — never mistaken for a validated artistic order", async () => {
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const source = readFileSync(path.join(import.meta.dirname, "memorial-section-order.ts"), "utf8");
    expect(source).toContain("PROVISOIRE");
  });
});
