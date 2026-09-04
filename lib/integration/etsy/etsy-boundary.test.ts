import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Mission 016/017 — the boundary these missions exist to build: Etsy is
 * a sales channel, not a HERITAGE domain concept. No module under the
 * Offer, Entitlement, Builder or Memorial domains may import anything
 * from `lib/integration/etsy/` — the only place HERITAGE is allowed to
 * know an Etsy listing ID, purchase payload, or order state exists.
 *
 * The dependency is one-way on purpose: `lib/integration/etsy/*` is
 * allowed — expected — to import HERITAGE's own domain/config
 * (`config/offers.ts`'s `OfferId`, chiefly), since its entire job is
 * translating Etsy's world into HERITAGE's. What must never happen is
 * the reverse.
 *
 * `config/entitlements.ts` already carries the string `"etsy"` as one
 * value of `EntitlementSource` — a pre-existing, deliberately opaque
 * channel label (Mission 006/013), not a dependency on this mission's
 * module. This test checks import edges, not the word "etsy" appearing
 * anywhere, precisely so that label stays legitimate.
 */

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..", "..");

const PROTECTED_DIRECTORIES = ["lib/entitlement", "lib/builder", "lib/memorial"];
const PROTECTED_FILES = ["config/offers.ts", "types/entitlement.ts", "types/memorial.ts"];
const SOURCE_EXTENSIONS = [".ts", ".tsx"];

function listSourceFiles(directory: string): string[] {
  const files: string[] = [];

  function walk(current: string): void {
    for (const entry of readdirSync(current)) {
      const full = path.join(current, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (SOURCE_EXTENSIONS.includes(path.extname(full)) && !full.includes(".test.")) {
        files.push(path.relative(REPO_ROOT, full));
      }
    }
  }

  const full = path.join(REPO_ROOT, directory);
  if (existsSync(full)) walk(full);

  return files;
}

function protectedFiles(): string[] {
  const files = PROTECTED_DIRECTORIES.flatMap((directory) => listSourceFiles(directory));
  for (const file of PROTECTED_FILES) {
    if (existsSync(path.join(REPO_ROOT, file))) files.push(file);
  }
  return files;
}

describe("Etsy boundary — the domain never depends on the sales channel", () => {
  it("finds the domain files it is supposed to be checking", () => {
    // Guards the test itself: if discovery ever silently returned
    // nothing, every assertion below would pass vacuously.
    expect(protectedFiles().length).toBeGreaterThan(0);
  });

  it("no Offer/Entitlement/Builder/Memorial source imports lib/integration/etsy", () => {
    const violations: string[] = [];

    for (const file of protectedFiles()) {
      const source = readFileSync(path.join(REPO_ROOT, file), "utf8");
      if (/from\s+["'](@\/)?lib\/integration\/etsy/.test(source) || source.includes("integration/etsy")) {
        violations.push(file);
      }
    }

    expect(violations).toEqual([]);
  });

  it("no Offer/Entitlement/Builder/Memorial source references any Etsy-specific export by name", () => {
    const ETSY_EXPORT_NAMES = [
      "resolveEtsyListingToOffer",
      "ETSY_LISTING_MAPPINGS",
      "validateEtsyPurchase",
      "ValidatedEtsyPurchase",
      "EtsyPurchaseInput",
      "EtsyListingMapping",
    ];
    const violations: string[] = [];

    for (const file of protectedFiles()) {
      const source = readFileSync(path.join(REPO_ROOT, file), "utf8");
      if (ETSY_EXPORT_NAMES.some((name) => source.includes(name))) violations.push(file);
    }

    expect(violations).toEqual([]);
  });

  it("Mission 017: the Entitlement business module's own input/output types receive no Etsy type", () => {
    // A dedicated, narrower check on exactly the module Mission 018 will
    // extend: issuing an Entitlement must only ever take an OfferId, a
    // channel-agnostic source, and an external order id — never a
    // ValidatedEtsyPurchase or an EtsyPurchaseInput passed straight
    // through. This file's own docstring already says "knows nothing
    // about Etsy" in prose — deliberately fine, and exactly why this
    // checks type names, not the word "etsy" itself (see this test
    // file's own top comment).
    const source = readFileSync(path.join(REPO_ROOT, "lib/entitlement/issue-entitlement.ts"), "utf8");
    expect(source).not.toContain("ValidatedEtsyPurchase");
    expect(source).not.toContain("EtsyPurchaseInput");
    expect(source).not.toContain("lib/integration/etsy");
  });

  it("Mission 017: lib/integration/etsy is allowed to depend on the domain/config it translates into — the edge is one-way", () => {
    const listingMapping = readFileSync(
      path.join(REPO_ROOT, "lib/integration/etsy/listing-mapping.ts"),
      "utf8",
    );
    const validatePurchase = readFileSync(
      path.join(REPO_ROOT, "lib/integration/etsy/validate-purchase.ts"),
      "utf8",
    );

    expect(listingMapping).toContain('from "@/config/offers"');
    expect(validatePurchase).toContain('from "@/config/offers"');
  });

  it("detects a violation when one is introduced (the check is not vacuous)", () => {
    const decoySource = 'import { resolveEtsyListingToOffer } from "@/lib/integration/etsy/resolve-listing";';
    expect(/from\s+["'](@\/)?lib\/integration\/etsy/.test(decoySource)).toBe(true);
    expect(decoySource.includes("resolveEtsyListingToOffer")).toBe(true);
  });

  it("lib/integration/etsy exists and is where the mapping and validation actually live", () => {
    for (const file of [
      "lib/integration/etsy/listing-mapping.ts",
      "lib/integration/etsy/resolve-listing.ts",
      "lib/integration/etsy/validate-purchase.ts",
    ]) {
      expect(existsSync(path.join(REPO_ROOT, file))).toBe(true);
    }
  });
});
