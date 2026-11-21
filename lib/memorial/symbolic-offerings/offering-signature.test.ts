import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { normalizeOfferingSignature, OFFERING_SIGNATURE_MAX_LENGTH } from "./offering-signature";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..", "..");

describe("normalizeOfferingSignature (Lot 2)", () => {
  it.each([
    ["Marie", "Marie"],
    ["  Marie  ", "Marie"],
    ["Jean   Pierre", "Jean Pierre"],
    ["Mamie\nJeanne", "Mamie Jeanne"],
    ["Ta\tpetite-fille", "Ta petite-fille"],
    ["Élise D'Arc 🌸", "Élise D'Arc 🌸"],
    ["E\u0301lise", "Élise"], // NFC: the same name, one code point
    ["Ma\u200Brie", "Marie"],
    ["\u202EeiraM", "eiraM"],
    ["\uFEFFMarie", "Marie"],
  ])("%j → %j", (input, expected) => {
    expect(normalizeOfferingSignature(input)).toBe(expected);
  });

  it("40 characters (code points, emoji included) are accepted, 41 refused", () => {
    expect(OFFERING_SIGNATURE_MAX_LENGTH).toBe(40);
    expect(normalizeOfferingSignature("🌸".repeat(40))).toBe("🌸".repeat(40));
    expect(normalizeOfferingSignature("a".repeat(41))).toBeNull();
    expect(normalizeOfferingSignature("🌸".repeat(41))).toBeNull();
  });

  it.each([[""], ["   "], ["\u200B\u200B"], [null], [undefined], [42], [["Marie"]], [{ name: "Marie" }], ["x".repeat(10_000)]])(
    "refuses %j",
    (input) => {
      expect(normalizeOfferingSignature(input)).toBeNull();
    },
  );

  it("what it accepts, the database constraint accepts too (same invisible set, same bound)", () => {
    const migration = readFileSync(path.join(REPO_ROOT, "supabase/migrations/20261116120000_lot2_offering_signature.sql"), "utf8");
    expect(migration).toContain("char_length(signature) between 1 and 40");
    expect(migration).toContain("signature = btrim(signature)");
    expect(migration).toContain("[\\u200B\\u200E\\u200F\\u202A-\\u202E\\u2060\\u2066-\\u2069\\uFEFF]");
    const source = readFileSync(path.join(import.meta.dirname, "offering-signature.ts"), "utf8");
    expect(source).toContain("[\\u200B\\u200E\\u200F\\u202A-\\u202E\\u2060\\u2066-\\u2069\\uFEFF]");
  });
});
