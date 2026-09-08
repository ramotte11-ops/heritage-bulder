import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Mission 016/017/018 — the boundary these missions exist to build: Etsy is
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

/**
 * Strips comments before a "does this word appear" assertion.
 *
 * This file's own doctrine, from its top comment, is that the boundary
 * is about IMPORT EDGES and functional references — not about the string
 * "etsy" appearing anywhere. Prose is the clearest case: several domain
 * modules document that they deliberately know nothing about Etsy, and
 * a check that failed on those sentences would punish exactly the
 * comments that record the rule.
 *
 * `//` inside `://` is left alone so a real URL in code is still seen.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
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
      // Mission 018
      "provisionEtsyPurchase",
      "ProvisionEtsyPurchaseResult",
      "ProvisionEtsyPurchaseDeps",
      "EtsyProvisioningRejectionReason",
      // Mission 019
      "receiveEtsyPurchase",
      "ReceiveEtsyPurchaseResult",
      "ReceiveEtsyPurchaseDeps",
      // Mission 019B — the OAuth claim, the receipt adapter, the seller
      // credential and the support recovery. The claim is the most
      // tempting of all to import from the outside: it is the one
      // function that takes somebody from "I bought this" to "here is my
      // memorial". It is also the one that must stay hardest out of the
      // domain — a Builder or Memorial module reaching for it would make
      // "an Etsy account owns this" a domain concept.
      "claimByEtsyIdentity",
      "ClaimByEtsyIdentityResult",
      "ClaimByEtsyIdentityDeps",
      "parseEtsyReceipt",
      "toEtsyPurchaseInput",
      "ParsedEtsyReceipt",
      "parseEtsyBuyerIdentity",
      "normalizeReceiptBuyerUserId",
      "buildEtsyAuthorizationUrl",
      "createEtsyOAuthHandshake",
      "getSellerAccessToken",
      "provisionEtsyOrderForSupport",
      "startEtsyClaim",
      "completeEtsyClaim",
      "runAdminEtsyOrderProvision",
      "getEtsyApiConfig",
      "isEtsyChannelConfigured",
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
      "lib/integration/etsy/provision-purchase.ts",
      "lib/integration/etsy/receive-purchase.ts",
      // Mission 019B
      "lib/integration/etsy/oauth.ts",
      "lib/integration/etsy/receipt.ts",
      "lib/integration/etsy/api-client.ts",
      "lib/integration/etsy/seller-credential.ts",
      "lib/integration/etsy/claim-by-etsy-identity.ts",
      "lib/integration/etsy/provision-order-for-support.ts",
    ]) {
      expect(existsSync(path.join(REPO_ROOT, file))).toBe(true);
    }
  });

  /**
   * Mission 019B — the edge still runs one way, now that the Etsy layer
   * has grown a claim, a credential store and a support surface.
   */
  it("Mission 019B: no domain source imports the claim, the receipt adapter or the credential store", () => {
    const violations: string[] = [];

    for (const file of protectedFiles()) {
      const source = readFileSync(path.join(REPO_ROOT, file), "utf8");
      for (const forbidden of [
        "claim-by-etsy-identity",
        "provision-order-for-support",
        "seller-credential",
        "etsy-session",
        "support-session",
        "oauth-cookies",
        "api-client",
      ]) {
        if (source.includes(forbidden)) violations.push(`${file} -> ${forbidden}`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("Mission 019B: the claim composes the existing primitives — it re-implements none of them", () => {
    const claim = readFileSync(
      path.join(REPO_ROOT, "lib/integration/etsy/claim-by-etsy-identity.ts"),
      "utf8",
    );

    // It stands on Missions 016-019 and 011B...
    expect(claim).toContain("receiveEtsyPurchase(");
    expect(claim).toContain("resolveOwnerForIdentity(");
    expect(claim).toContain("completeRedemptionForResolvedRight(");
    expect(claim).toContain("validateEtsyPurchase(");

    // ...and owns none of their logic: no key generation, no hashing, no
    // second payment-state list, no second listing lookup, no direct RPC.
    for (const duplicated of [
      "generateActivationKey",
      "hashActivationKey",
      "issueEntitlementWithActivationKey",
      "resolveEtsyListingToOffer",
      'paymentState !==',
      "redeem_entitlement",
    ]) {
      expect(claim).not.toContain(duplicated);
    }
  });

  it("Mission 019B: the guest recovery uses the SAME provisioning path, not a second one", () => {
    const support = readFileSync(
      path.join(REPO_ROOT, "lib/integration/etsy/provision-order-for-support.ts"),
      "utf8",
    );

    expect(support).toContain("receiveEtsyPurchase(");
    // No parallel issuing path that could diverge from the nominal one.
    expect(support).not.toContain("issueEntitlementWithActivationKey");
    expect(support).not.toContain("generateActivationKey");
  });

  it("Mission 019B: nothing under lib/admin names Etsy — the support edge is one-way too", () => {
    // The Etsy layer imports the Admin gate (support-session.ts), never
    // the reverse. lib/admin stays a channel-agnostic staff surface.
    for (const file of listSourceFiles("lib/admin")) {
      const source = stripComments(readFileSync(path.join(REPO_ROOT, file), "utf8"));
      // An import edge, not a mention: admin-session.ts documents in
      // prose that the Etsy layer imports ITS gate, which is the rule
      // being asserted rather than a breach of it.
      expect(source).not.toMatch(/from\s+["'](@\/)?lib\/integration\/etsy/);
    }
  });

  it("Mission 019B: the Builder carries no Etsy vocabulary at all", () => {
    // The QG's locked rule: Etsy stops at /activate. Past the redirect
    // the family is inside HERITAGE, and the Builder never learns which
    // channel sold the memorial.
    const builderFiles = [
      ...listSourceFiles("lib/builder"),
      ...listSourceFiles("components/builder"),
      ...listSourceFiles("app/builder"),
    ];
    expect(builderFiles.length).toBeGreaterThan(0);

    for (const file of builderFiles) {
      const source = stripComments(readFileSync(path.join(REPO_ROOT, file), "utf8"));
      // Not merely the imports — the word itself, in any casing, once
      // comments are set aside. A button label, an alt text or a piece
      // of copy would each break the same rule. Comments are excluded on
      // purpose: lib/builder/resume-session.ts states that it knows
      // nothing about Etsy, and that sentence is the rule, not a
      // violation of it.
      expect(source.toLowerCase()).not.toContain("etsy");
    }
  });

  it("Mission 018: the composition of purchase -> entitlement lives on the Etsy side of the boundary", () => {
    // The direction of the edge is the whole point. Mission 018 needed
    // an Etsy purchase and Mission 013's issuing primitive in the same
    // function; putting that function under lib/integration/etsy means
    // Etsy imports the domain, not the reverse. Had it been placed in
    // lib/entitlement/ instead, the domain would have had to learn what
    // a ValidatedEtsyPurchase is.
    const provision = readFileSync(
      path.join(REPO_ROOT, "lib/integration/etsy/provision-purchase.ts"),
      "utf8",
    );

    expect(provision).toContain('from "@/lib/entitlement/issue-entitlement"');
    expect(provision).toContain("./validate-purchase");

    // And the domain module it composes still knows nothing of Etsy.
    const issue = readFileSync(path.join(REPO_ROOT, "lib/entitlement/issue-entitlement.ts"), "utf8");
    expect(issue).not.toContain("provision-purchase");
    expect(issue).not.toContain("provisionEtsyPurchase");
  });

  it("Mission 018: no domain source imports the Etsy provisioning module, by any path shape", () => {
    const violations: string[] = [];

    for (const file of protectedFiles()) {
      const source = readFileSync(path.join(REPO_ROOT, file), "utf8");
      if (source.includes("provision-purchase") || source.includes("provisionEtsyPurchase")) {
        violations.push(file);
      }
    }

    expect(violations).toEqual([]);
  });

  it("Mission 019: no domain source imports the composed Etsy boundary either", () => {
    // The composition is the most tempting thing in this directory to
    // import from the outside — it is the one function that does the
    // whole commercial job. It is also the one that must stay hardest
    // out of the domain: a Builder or Memorial module reaching for it
    // would make "an order arrived" a domain concept.
    const violations: string[] = [];

    for (const file of protectedFiles()) {
      const source = readFileSync(path.join(REPO_ROOT, file), "utf8");
      if (source.includes("receive-purchase") || source.includes("receiveEtsyPurchase")) {
        violations.push(file);
      }
    }

    expect(violations).toEqual([]);
  });

  it("Mission 019: the composition composes — it re-implements neither validation nor provisioning", () => {
    const receive = readFileSync(
      path.join(REPO_ROOT, "lib/integration/etsy/receive-purchase.ts"),
      "utf8",
    );

    // It calls both missions it sits on top of...
    expect(receive).toContain("./validate-purchase");
    expect(receive).toContain("./provision-purchase");
    expect(receive).toContain("validateEtsyPurchase(");
    expect(receive).toContain("provisionEtsyPurchase(");

    // ...and owns none of their logic: no re-reading of the payload's
    // fields, no second payment-state list, no second listing lookup, no
    // direct repository call of its own.
    for (const duplicated of [
      "paymentState !==",
      "externalPurchaseId.trim",
      "listingId.trim",
      "Number.isInteger",
      "resolveEtsyListingToOffer",
      "issueEntitlementWithActivationKey",
      "issueWithActivationKey",
      "generateActivationKey",
    ]) {
      expect(receive).not.toContain(duplicated);
    }
  });

  it("Mission 018: issuing a right still takes no Etsy vocabulary at all", () => {
    // The narrower Mission 017 check above names two types. This one is
    // the property those types stood for: the Entitlement domain's
    // public surface must mention no Etsy concept whatsoever — not a
    // listing, not a receipt, not a payment state.
    const issue = readFileSync(path.join(REPO_ROOT, "lib/entitlement/issue-entitlement.ts"), "utf8");
    for (const term of ["listingId", "listing_id", "externalPurchaseId", "paymentState"]) {
      expect(issue).not.toContain(term);
    }
  });
});
