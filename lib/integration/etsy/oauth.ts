import { createHash, randomBytes } from "node:crypto";

/**
 * Mission 019B — the pure half of the buyer's Etsy OAuth handshake.
 *
 * Everything in this file is a pure function over its arguments: PKCE
 * material, the authorization URL, the strict validation of what comes
 * back. No I/O, no environment reads, no Supabase — all of which is what
 * makes the security-critical parts (state comparison, buyer identity
 * parsing) exhaustively testable without a network or a database.
 *
 * ## What the buyer's token is for, and what it is not for
 *
 * Etsy Open API v3 has NO buyer-scoped receipts endpoint — every receipt
 * and transaction route is `/shops/{shop_id}/...`. So the buyer's token
 * is never used to read the buyer's purchases; it cannot be. Its ONLY
 * job is to prove, with Etsy as the witness, which Etsy member is at the
 * keyboard. That single fact is then compared, server-side, against
 * `buyer_user_id` on receipts read with OUR OWN seller credential.
 *
 * Which is why `getMe` is not called: the identity is already inside the
 * token Etsy just issued to us over TLS, as a documented numeric prefix.
 * One fewer request, one fewer scope requirement, one fewer failure mode.
 *
 * ## Scope
 *
 * Exactly `transactions_r`, and nothing else. Etsy's authorization
 * request requires a non-empty scope and offers no identity-only scope,
 * so one must be chosen; this is the only one whose consent text
 * describes what is actually happening ("checking your purchase"). It is
 * also inert for us: with no buyer-scoped endpoint in existence, it
 * grants access to nothing we can call. `email_r`, `profile_r`,
 * `address_r`, `billing_r` and `cart_r` are never requested — asking for
 * a family's email or address to confirm a purchase they already made
 * would be data we neither need nor want to hold.
 */

/** The one scope this application ever asks a buyer for. */
export const ETSY_BUYER_SCOPE = "transactions_r";

const ETSY_AUTHORIZE_URL = "https://www.etsy.com/oauth/connect";

/** 32 bytes = 256 bits, base64url — comfortably beyond guessing, and
 * within PKCE's 43..128 character range for a verifier. */
const RANDOM_BYTES = 32;

/**
 * How long a started handshake stays valid. Long enough for somebody to
 * sign in to Etsy and read a consent screen without hurrying; short
 * enough that an abandoned attempt cannot be resumed later from a
 * borrowed browser.
 */
export const OAUTH_HANDSHAKE_TTL_SECONDS = 600;

function base64url(input: Buffer): string {
  return input.toString("base64url");
}

export interface EtsyOAuthHandshake {
  /** Anti-CSRF nonce. Echoed by Etsy, and compared on return against
   * the copy held in an HttpOnly cookie. */
  state: string;
  /** PKCE verifier. Never leaves the server. */
  codeVerifier: string;
}

/** Fresh CSPRNG material for one handshake. */
export function createEtsyOAuthHandshake(): EtsyOAuthHandshake {
  return {
    state: base64url(randomBytes(RANDOM_BYTES)),
    codeVerifier: base64url(randomBytes(RANDOM_BYTES)),
  };
}

/** PKCE S256: base64url(sha256(verifier)). Never `plain`. */
export function deriveCodeChallenge(codeVerifier: string): string {
  return base64url(createHash("sha256").update(codeVerifier, "ascii").digest());
}

/**
 * Builds the URL the family is sent to.
 *
 * `redirectUri` comes from configuration, never from the request — see
 * ./config.ts. Nothing here reads a Host header or a query parameter.
 */
export function buildEtsyAuthorizationUrl({
  keystring,
  redirectUri,
  state,
  codeVerifier,
}: {
  keystring: string;
  redirectUri: string;
  state: string;
  codeVerifier: string;
}): string {
  const url = new URL(ETSY_AUTHORIZE_URL);

  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", keystring);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", ETSY_BUYER_SCOPE);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", deriveCodeChallenge(codeVerifier));
  url.searchParams.set("code_challenge_method", "S256");

  return url.toString();
}

/**
 * Constant-time-ish comparison of the returned `state` against the one
 * this browser was issued.
 *
 * Length is compared first and short-circuits — that leaks only the
 * length of a value that is always the same length in practice. The
 * character loop deliberately does not break early, so a partial match
 * costs the same as no match at all.
 */
export function stateMatches(expected: string | undefined, received: string | null): boolean {
  if (!expected || !received) return false;
  if (expected.length !== received.length) return false;

  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= expected.charCodeAt(index) ^ received.charCodeAt(index);
  }
  return difference === 0;
}

export type EtsyBuyerIdentityResult =
  | { status: "parsed"; etsyUserId: string }
  /** The token is not shaped the way Etsy documents. Deliberately one
   * opaque refusal with no detail: the value being parsed is a
   * credential, so nothing about why it failed may travel. */
  | { status: "unparseable" };

/**
 * Extracts the Etsy member id from an Etsy OAuth token.
 *
 * Etsy issues both access and refresh tokens as `<user_id>.<payload>`,
 * where `user_id` is the internal id of the member who authorized the
 * application. Because the token reaches us from our own code exchange
 * with Etsy over TLS, that prefix is as trustworthy as the token itself
 * — it is not a value a browser supplied.
 *
 * Parsing is strict and FAILS CLOSED, with no heuristics and no
 * recovery:
 *
 *   * there must be a `.`, with a non-empty payload after it — a bare
 *     number is not a token;
 *   * the prefix must be decimal digits only. Not a sign, not a decimal
 *     point, not whitespace, not `0x`;
 *   * no leading zeros, so exactly one string can denote a given member.
 *     `0123` and `123` must never be able to name the same buyer through
 *     two different comparisons;
 *   * a bounded length, so a pathological value cannot be carried
 *     forward as though it were an id.
 *
 * If Etsy ever changes the token format, this returns `unparseable` and
 * the claim is refused. That is the intended outcome: refusing a real
 * buyer is recoverable, whereas deriving the WRONG member id would hand
 * one family's memorial to another.
 */
const MAX_ETSY_USER_ID_DIGITS = 19;

export function parseEtsyBuyerIdentity(token: string): EtsyBuyerIdentityResult {
  if (typeof token !== "string") return { status: "unparseable" };

  const separator = token.indexOf(".");
  if (separator <= 0) return { status: "unparseable" };

  const prefix = token.slice(0, separator);
  const payload = token.slice(separator + 1);

  if (payload.length === 0) return { status: "unparseable" };
  if (prefix.length > MAX_ETSY_USER_ID_DIGITS) return { status: "unparseable" };
  if (!/^[0-9]+$/.test(prefix)) return { status: "unparseable" };
  if (prefix.length > 1 && prefix.startsWith("0")) return { status: "unparseable" };

  return { status: "parsed", etsyUserId: prefix };
}

/**
 * Normalises a receipt's `buyer_user_id` for comparison with a parsed
 * token prefix.
 *
 * `null` is the guest-checkout case and is returned as `null`, never as
 * a string — a guest receipt must never be able to equal anything.
 * Anything that is not a non-negative integer is also `null`: a
 * fractional or out-of-range value is not an id, and coercing it would
 * be exactly the kind of guess this whole path refuses to make.
 */
export function normalizeReceiptBuyerUserId(value: unknown): string | null {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) return null;
    return String(value);
  }
  if (typeof value === "string" && /^[0-9]+$/.test(value)) {
    if (value.length > 1 && value.startsWith("0")) return null;
    return value;
  }
  return null;
}
