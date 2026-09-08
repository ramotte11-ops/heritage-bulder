import { randomUUID } from "node:crypto";
import { getAuthenticatedUser } from "@/lib/supabase/session";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role-client";
import { SupabaseOwnerRepository } from "@/lib/adapters/supabase/owner-repository";
import { SupabaseEntitlementRepository } from "@/lib/adapters/supabase/entitlement-repository";
import { SupabaseActivationRateLimiter } from "@/lib/adapters/supabase/activation-rate-limiter";
import { SupabaseSellerCredentialRepository } from "@/lib/adapters/supabase/seller-credential-repository";
import type { AuthenticatedIdentity } from "@/lib/entitlement/resolve-owner";
import {
  exchangeAuthorizationCode,
  listShopReceipts,
  refreshSellerToken,
} from "./api-client";
import {
  claimByEtsyIdentity,
  type ClaimByEtsyIdentityResult,
} from "./claim-by-etsy-identity";
import {
  getEtsyApiConfig,
  getEtsyOAuthConfig,
  getEtsySellerBootstrapRefreshToken,
} from "./config";
import {
  buildEtsyAuthorizationUrl,
  createEtsyOAuthHandshake,
  parseEtsyBuyerIdentity,
  stateMatches,
} from "./oauth";
import { clearEtsyHandshake, readEtsyHandshake, storeEtsyHandshake } from "./oauth-cookies";
import { getSellerAccessToken } from "./seller-credential";

/**
 * SERVER ONLY. Mission 019B — the wiring, in the same shape as
 * lib/entitlement/activation-session.ts and lib/admin/admin-session.ts:
 * it resolves the session itself, from the validated cookie, and never
 * accepts an identity from its caller.
 *
 * Everything decision-shaped lives elsewhere and is fully testable with
 * fakes — ./oauth.ts, ./receipt.ts, ./claim-by-etsy-identity.ts,
 * ./seller-credential.ts. This file builds real clients and passes real
 * configuration; it holds no rule worth testing separately.
 */

/**
 * Seller access token, resolved through the lease-protected store.
 *
 * Exported since Mission 019B's support path needs the same credential
 * for the same reason — reading OUR OWN shop's receipts — and must go
 * through the same single-refresher lease rather than opening a second
 * way to spend a rotation.
 */
export async function resolveSellerAccessToken(): Promise<string | null> {
  const client = createServiceRoleSupabaseClient();
  const { keystring } = getEtsyApiConfig();

  const result = await getSellerAccessToken({
    repository: new SupabaseSellerCredentialRepository(client),
    refreshWithEtsy: (refreshToken) => refreshSellerToken({ keystring, refreshToken }),
    bootstrapRefreshToken: getEtsySellerBootstrapRefreshToken(),
    now: () => new Date(),
    // A per-attempt identifier. Not a user id, not an auth id — it names
    // this refresh attempt and nothing about a person.
    newLeaseHolderId: () => randomUUID(),
    wait: (milliseconds) =>
      new Promise((resolve) => {
        setTimeout(resolve, milliseconds);
      }),
  });

  // The reason is deliberately dropped here rather than propagated: past
  // this point every seller-credential failure is the same calm "Etsy is
  // momentarily unavailable" for the family. The distinction between
  // `notBootstrapped`, `refreshFailed` and `busy` matters to whoever
  // operates the channel, never to somebody activating a memorial.
  return result.status === "ready" ? result.accessToken : null;
}

export type StartEtsyClaimOutcome =
  | { status: "redirect"; authorizationUrl: string }
  /** No HERITAGE session. The Etsy handshake is never started for an
   * anonymous visitor: the identity a claim will be attributed to has to
   * exist before the claim, not after it. */
  | { status: "unauthenticated" }
  /** The Etsy channel is not configured on this deployment. */
  | { status: "unavailable" };

/**
 * Begins the handshake: fresh CSPRNG state and PKCE verifier, stored in
 * HttpOnly cookies, and the Etsy URL to send the family to.
 */
export async function startEtsyClaim(): Promise<StartEtsyClaimOutcome> {
  const user = await getAuthenticatedUser();
  if (!user) return { status: "unauthenticated" };

  let keystring: string;
  let redirectUri: string;
  try {
    ({ keystring, redirectUri } = getEtsyOAuthConfig());
  } catch {
    // Missing configuration is an operator problem, never a family's.
    // The thrown message names an environment variable, so it is
    // swallowed here rather than surfaced.
    return { status: "unavailable" };
  }

  const handshake = createEtsyOAuthHandshake();
  await storeEtsyHandshake(handshake);

  return {
    status: "redirect",
    authorizationUrl: buildEtsyAuthorizationUrl({
      keystring,
      redirectUri,
      state: handshake.state,
      codeVerifier: handshake.codeVerifier,
    }),
  };
}

export type CompleteEtsyClaimOutcome =
  | { status: "claimed"; memorialId: string }
  | { status: "unauthenticated" }
  /** The handshake did not check out: no cookie, a `state` that does not
   * match, a missing code, a replayed callback. One answer for all of
   * them — a caller must not learn which. */
  | { status: "handshakeRejected" }
  | { status: "rateLimited" }
  | { status: "noMatchingPurchase" }
  | { status: "multiplePurchases" }
  | { status: "purchaseNotEligible" }
  | { status: "etsyUnavailable" }
  | { status: "failed" };

function toOutcome(result: ClaimByEtsyIdentityResult): CompleteEtsyClaimOutcome {
  switch (result.status) {
    case "claimed":
    case "alreadyClaimed":
      // Both land on the same memorial. The family does not need to know
      // which of the two happened, and a retried callback must look
      // exactly like a first success.
      return { status: "claimed", memorialId: result.memorialId };
    case "noMatchingPurchase":
      return { status: "noMatchingPurchase" };
    case "multiplePurchases":
      return { status: "multiplePurchases" };
    case "purchaseNotEligible":
      return { status: "purchaseNotEligible" };
    case "etsyUnavailable":
      return { status: "etsyUnavailable" };
    case "failed":
      return { status: "failed" };
  }
}

/**
 * Completes the handshake and performs the claim.
 *
 * Order matters and is deliberate:
 *   1. the HERITAGE session, so an anonymous caller reaches nothing;
 *   2. the handshake, so a forged callback is refused before any
 *      credential is spent;
 *   3. the rate limit, before the first Etsy call;
 *   4. the code exchange, the identity parse, then the claim.
 *
 * The handshake cookies are cleared on EVERY path out of this function,
 * which is what makes an authorization code single-use here.
 */
export async function completeEtsyClaim({
  code,
  state,
}: {
  code: string | null;
  state: string | null;
}): Promise<CompleteEtsyClaimOutcome> {
  const user = await getAuthenticatedUser();
  if (!user) {
    await clearEtsyHandshake();
    return { status: "unauthenticated" };
  }

  const handshake = await readEtsyHandshake();
  // Consumed exactly once, whatever happens next.
  await clearEtsyHandshake();

  if (!code || !handshake.codeVerifier || !stateMatches(handshake.state, state)) {
    return { status: "handshakeRejected" };
  }

  const identity: AuthenticatedIdentity = {
    id: user.id,
    email: user.email,
    email_confirmed_at: user.email_confirmed_at,
    is_anonymous: user.is_anonymous,
  };

  const client = createServiceRoleSupabaseClient();

  // Mission 019C's existing per-identity counter, reused unchanged — no
  // second rate-limit table. The budget is shared with activation-key
  // attempts on purpose: it is an "attempts to claim access" budget, and
  // somebody hammering one surface should not get a fresh allowance by
  // switching to the other.
  const decision = await new SupabaseActivationRateLimiter(client).recordAttempt(identity.id);
  if (!decision.allowed) return { status: "rateLimited" };

  let apiKeyHeader: string;
  let keystring: string;
  let shopId: string;
  let redirectUri: string;
  try {
    ({ apiKeyHeader, keystring, shopId } = getEtsyApiConfig());
    ({ redirectUri } = getEtsyOAuthConfig());
  } catch {
    return { status: "etsyUnavailable" };
  }

  let buyerToken: string;
  try {
    const tokens = await exchangeAuthorizationCode({
      keystring,
      redirectUri,
      code,
      codeVerifier: handshake.codeVerifier,
    });
    buyerToken = tokens.accessToken;
  } catch {
    // A refused exchange is indistinguishable here from a network
    // failure, and both are Etsy's side of the conversation. Nothing was
    // written.
    return { status: "etsyUnavailable" };
  }

  const buyerIdentity = parseEtsyBuyerIdentity(buyerToken);
  if (buyerIdentity.status !== "parsed") {
    // Fail closed. A token we cannot read the documented prefix out of
    // yields no identity at all — never a guess, never a fallback call
    // to another endpoint.
    return { status: "failed" };
  }

  const sellerAccessToken = await resolveSellerAccessToken();
  if (sellerAccessToken === null) return { status: "etsyUnavailable" };

  const result = await claimByEtsyIdentity(
    {
      ownerRepository: new SupabaseOwnerRepository(client),
      entitlementRepository: new SupabaseEntitlementRepository(client),
      listReceiptsPage: ({ limit, offset }) =>
        listShopReceipts({ apiKeyHeader, shopId, accessToken: sellerAccessToken, limit, offset }),
    },
    { identity, etsyUserId: buyerIdentity.etsyUserId },
  );

  return toOutcome(result);
}
