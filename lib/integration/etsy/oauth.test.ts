import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildEtsyAuthorizationUrl,
  createEtsyOAuthHandshake,
  deriveCodeChallenge,
  ETSY_BUYER_SCOPE,
  normalizeReceiptBuyerUserId,
  parseEtsyBuyerIdentity,
  stateMatches,
} from "./oauth";

/**
 * Mission 019B — the pure half of the buyer handshake.
 *
 * Two properties carry the whole security argument of the nominal path
 * and are tested hardest here: a `state` that cannot be forged past the
 * comparison, and a buyer identity that FAILS CLOSED rather than ever
 * producing a wrong member id. The second matters most: refusing a real
 * buyer is recoverable, whereas deriving somebody else's id would hand
 * one family's memorial to another.
 */

describe("createEtsyOAuthHandshake", () => {
  it("produces a distinct state and verifier every time", () => {
    const seen = new Set<string>();

    for (let index = 0; index < 200; index += 1) {
      const { state, codeVerifier } = createEtsyOAuthHandshake();
      expect(state).not.toBe(codeVerifier);
      seen.add(state);
      seen.add(codeVerifier);
    }

    // 400 CSPRNG draws, no collision.
    expect(seen.size).toBe(400);
  });

  it("stays inside PKCE's own 43..128 character range, base64url only", () => {
    const { state, codeVerifier } = createEtsyOAuthHandshake();

    for (const value of [state, codeVerifier]) {
      expect(value.length).toBeGreaterThanOrEqual(43);
      expect(value.length).toBeLessThanOrEqual(128);
      // base64url: no +, no /, no = padding — none of which survive a
      // query string unescaped.
      expect(value).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });
});

describe("deriveCodeChallenge", () => {
  it("is exactly base64url(sha256(verifier)) — S256, never plain", () => {
    const verifier = "a-verifier-value";

    expect(deriveCodeChallenge(verifier)).toBe(
      createHash("sha256").update(verifier, "ascii").digest("base64url"),
    );
  });

  it("never echoes the verifier itself", () => {
    const { codeVerifier } = createEtsyOAuthHandshake();

    expect(deriveCodeChallenge(codeVerifier)).not.toContain(codeVerifier);
  });
});

describe("buildEtsyAuthorizationUrl", () => {
  const url = () =>
    new URL(
      buildEtsyAuthorizationUrl({
        keystring: "keystring-1",
        redirectUri: "https://heritage.test/api/etsy/callback",
        state: "state-1",
        codeVerifier: "verifier-1",
      }),
    );

  it("asks for transactions_r and nothing else", () => {
    expect(url().searchParams.get("scope")).toBe("transactions_r");
    expect(ETSY_BUYER_SCOPE).toBe("transactions_r");
  });

  it("never asks for a scope that would expose personal data", () => {
    const scope = url().searchParams.get("scope") ?? "";

    for (const forbidden of ["email_r", "profile_r", "address_r", "billing_r", "cart_r"]) {
      expect(scope).not.toContain(forbidden);
    }
  });

  it("declares S256 and sends the challenge, never the verifier", () => {
    const params = url().searchParams;

    expect(params.get("code_challenge_method")).toBe("S256");
    expect(params.get("code_challenge")).toBe(deriveCodeChallenge("verifier-1"));
    expect(url().toString()).not.toContain("verifier-1");
  });

  it("uses the configured redirect URI verbatim", () => {
    expect(url().searchParams.get("redirect_uri")).toBe(
      "https://heritage.test/api/etsy/callback",
    );
  });

  it("points at Etsy's own authorization host", () => {
    expect(url().origin).toBe("https://www.etsy.com");
  });
});

describe("stateMatches", () => {
  it("accepts only an exact match", () => {
    expect(stateMatches("abc123", "abc123")).toBe(true);
  });

  it.each([
    ["a different value", "abc123", "abc124"],
    ["a prefix", "abc123", "abc12"],
    ["a longer value", "abc123", "abc1234"],
    ["an empty echo", "abc123", ""],
  ])("refuses %s", (_label, expected, received) => {
    expect(stateMatches(expected, received)).toBe(false);
  });

  it("refuses when no state was ever issued — an absent cookie is never a match", () => {
    // The replay case: a second callback finds the cookie already
    // cleared, so there is nothing for a resent `state` to equal.
    expect(stateMatches(undefined, "abc123")).toBe(false);
    expect(stateMatches("", "")).toBe(false);
    expect(stateMatches(undefined, null)).toBe(false);
  });
});

describe("parseEtsyBuyerIdentity", () => {
  it("reads the documented numeric prefix", () => {
    expect(parseEtsyBuyerIdentity("12345678.abcdefghijklmnop")).toEqual({
      status: "parsed",
      etsyUserId: "12345678",
    });
  });

  it("keeps the id as a string, so a large value cannot lose precision", () => {
    const huge = "9007199254740993";
    const result = parseEtsyBuyerIdentity(`${huge}.payload`);

    expect(result).toEqual({ status: "parsed", etsyUserId: huge });
  });

  it.each([
    ["no separator at all", "12345678"],
    ["an empty payload", "12345678."],
    ["an empty prefix", ".payload"],
    ["a non-numeric prefix", "user1234.payload"],
    ["a signed prefix", "-1234.payload"],
    ["whitespace in the prefix", " 1234.payload"],
    ["a hex prefix", "0x1234.payload"],
    ["a leading zero — one member must have exactly one spelling", "0123.payload"],
    ["an absurdly long prefix", `${"9".repeat(20)}.payload`],
    ["an empty string", ""],
  ])("fails closed on %s", (_label, token) => {
    expect(parseEtsyBuyerIdentity(token)).toEqual({ status: "unparseable" });
  });

  it("splits on the FIRST separator only — the payload may itself contain dots", () => {
    // Etsy documents the shape as `<user_id>.<opaque>`, and the opaque
    // half is not constrained to be dot-free. Splitting anywhere else
    // would refuse legitimate tokens.
    expect(parseEtsyBuyerIdentity("12.34.payload")).toEqual({
      status: "parsed",
      etsyUserId: "12",
    });
  });

  it("accepts a bare zero, which is a legal canonical integer", () => {
    expect(parseEtsyBuyerIdentity("0.payload")).toEqual({ status: "parsed", etsyUserId: "0" });
  });

  it("never reveals anything about the token it refused", () => {
    const token = "not-a-token-but-secret-looking";

    // The refusal carries no reason, no fragment, no length — the value
    // being parsed is a credential.
    expect(JSON.stringify(parseEtsyBuyerIdentity(token))).not.toContain("secret");
    expect(parseEtsyBuyerIdentity(token)).toEqual({ status: "unparseable" });
  });
});

describe("normalizeReceiptBuyerUserId", () => {
  it("normalises Etsy's JSON number to the same string shape the token yields", () => {
    expect(normalizeReceiptBuyerUserId(12345678)).toBe("12345678");
  });

  it("accepts a numeric string too", () => {
    expect(normalizeReceiptBuyerUserId("12345678")).toBe("12345678");
  });

  it("returns null for a guest checkout, which can therefore never match", () => {
    expect(normalizeReceiptBuyerUserId(null)).toBeNull();
    expect(normalizeReceiptBuyerUserId(undefined)).toBeNull();
  });

  it.each([
    ["a float", 12.5],
    ["a negative", -1],
    ["a value past the safe integer range", 1e300],
    ["a boolean", true],
    ["an object", {}],
    ["a non-numeric string", "guest"],
    ["a leading-zero string", "0123"],
  ])("returns null for %s rather than coercing it", (_label, value) => {
    expect(normalizeReceiptBuyerUserId(value)).toBeNull();
  });

  it("the guest case is not equal to any parsed identity, by construction", () => {
    const identity = parseEtsyBuyerIdentity("12345678.payload");
    expect(identity.status).toBe("parsed");
    if (identity.status !== "parsed") return;

    // The comparison the claim performs, on a guest receipt.
    expect(normalizeReceiptBuyerUserId(null) === identity.etsyUserId).toBe(false);
  });
});
