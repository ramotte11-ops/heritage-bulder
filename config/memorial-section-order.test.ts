import { describe, expect, it } from "vitest";
import { EDITORIAL_CONTEXT_SECTIONS } from "./sections";
import { EDITORIAL_CONTEXTS } from "./memorial";
import { MEMORIAL_SECTION_ORDER } from "./memorial-section-order";

/**
 * Fondation Memorial assemblé. Deliberately asserts ONLY that each
 * context's order is an exact permutation of that context's sections —
 * never a specific order. The artistic order is PROVISOIRE and will be
 * decided by the QG: reordering must never require touching this test.
 */
describe("MEMORIAL_SECTION_ORDER", () => {
  it.each(EDITORIAL_CONTEXTS)("%s: an exact permutation of the context's sections (same members, no duplicate, nothing extra)", (context) => {
    const order = MEMORIAL_SECTION_ORDER[context];
    const catalog = EDITORIAL_CONTEXT_SECTIONS[context].map((section) => section.id);
    expect(new Set(order).size).toBe(order.length);
    expect([...order].sort()).toEqual([...catalog].sort());
  });

  it("is declared PROVISOIRE in its own source — never mistaken for a validated artistic order", async () => {
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const source = readFileSync(path.join(import.meta.dirname, "memorial-section-order.ts"), "utf8");
    expect(source).toContain("PROVISOIRE");
  });
});
