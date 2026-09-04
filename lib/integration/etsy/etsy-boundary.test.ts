import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Mission 016 — the boundary this mission exists to build: Etsy is a
 * sales channel, not a HERITAGE domain concept. No module under the
 * Offer, Entitlement, Builder or Memorial domains may import anything
 * from `lib/integration/etsy/` — the only place HERITAGE is allowed to
 * know an Etsy listing ID exists.
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

  it("no Offer/Entitlement/Builder/Memorial source imports resolveEtsyListingToOffer by name", () => {
    const violations: string[] = [];

    for (const file of protectedFiles()) {
      const source = readFileSync(path.join(REPO_ROOT, file), "utf8");
      if (source.includes("resolveEtsyListingToOffer") || source.includes("ETSY_LISTING_MAPPINGS")) {
        violations.push(file);
      }
    }

    expect(violations).toEqual([]);
  });

  it("detects a violation when one is introduced (the check is not vacuous)", () => {
    const decoySource = 'import { resolveEtsyListingToOffer } from "@/lib/integration/etsy/resolve-listing";';
    expect(/from\s+["'](@\/)?lib\/integration\/etsy/.test(decoySource)).toBe(true);
    expect(decoySource.includes("resolveEtsyListingToOffer")).toBe(true);
  });

  it("lib/integration/etsy exists and is where the mapping actually lives", () => {
    for (const file of [
      "lib/integration/etsy/listing-mapping.ts",
      "lib/integration/etsy/resolve-listing.ts",
    ]) {
      expect(existsSync(path.join(REPO_ROOT, file))).toBe(true);
    }
  });
});
