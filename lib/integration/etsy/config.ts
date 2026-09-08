/**
 * SERVER ONLY. Mission 019B — Etsy integration configuration.
 *
 * Same discipline as lib/supabase/env.ts: every export is a function and
 * nothing runs at import time, so importing this module can never throw
 * merely because the Etsy channel has not been configured yet. The app
 * must build, run and serve every existing page with all of these unset.
 *
 * NOT ONE of these names is prefixed `NEXT_PUBLIC_`, and none may ever
 * be. Next.js only bundles `NEXT_PUBLIC_*` into browser code, which is
 * what keeps the shared secret and the bootstrap refresh token out of
 * the client — but that protection only holds as long as this module is
 * never imported from a Client Component. That is enforced by
 * lib/entitlement/server-only-boundary.test.ts.
 */

export interface EtsyApiConfig {
  /**
   * The value of the `x-api-key` header, already assembled.
   *
   * Etsy's current contract (changed 9 February 2026) is
   * `x-api-key: <keystring>:<shared_secret>` — the keystring alone is no
   * longer accepted. The two halves are kept as separate environment
   * variables because that is how the Developer Portal presents them,
   * and joined here, once, so no call site can assemble them differently
   * or accidentally send only the keystring.
   *
   * The `shared_secret` is NOT an OAuth client secret and is not used as
   * one: the OAuth token exchange in ./oauth.ts uses PKCE with the
   * keystring as `client_id` and sends no client secret at all.
   */
  apiKeyHeader: string;
  /** The keystring on its own — this is the OAuth `client_id`. */
  keystring: string;
  shopId: string;
}

export interface EtsyOAuthConfig {
  keystring: string;
  /**
   * Must match an entry registered in the Etsy Developer Portal exactly.
   * Read from configuration and never derived from a request's Host
   * header or a query parameter — a redirect URI assembled from anything
   * the caller controls is the classic way an authorization code ends up
   * delivered to somebody else.
   */
  redirectUri: string;
}

function readRequired(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. The Etsy channel is not configured yet — see .env.example.`,
    );
  }
  return value;
}

export function getEtsyApiConfig(): EtsyApiConfig {
  const keystring = readRequired("ETSY_API_KEYSTRING");
  const sharedSecret = readRequired("ETSY_API_SHARED_SECRET");

  return {
    apiKeyHeader: `${keystring}:${sharedSecret}`,
    keystring,
    shopId: readRequired("ETSY_SHOP_ID"),
  };
}

export function getEtsyOAuthConfig(): EtsyOAuthConfig {
  return {
    keystring: readRequired("ETSY_API_KEYSTRING"),
    redirectUri: readRequired("ETSY_OAUTH_REDIRECT_URI"),
  };
}

/**
 * The bootstrap seed for the seller credential store, or `null` when it
 * is not set.
 *
 * Deliberately NOT `readRequired`: once
 * `etsy_seller_credentials` holds a row, this variable is inert and its
 * absence is the normal, healthy steady state. Treating it as required
 * would make a correctly-running deployment fail on a value it no longer
 * needs.
 */
export function getEtsySellerBootstrapRefreshToken(): string | null {
  const value = process.env.ETSY_SELLER_REFRESH_TOKEN;
  return value && value.trim().length > 0 ? value : null;
}

/**
 * Is the Etsy channel configured at all?
 *
 * Used by `/activate` to decide whether to offer the Etsy button. Reads
 * only for presence — never returns, logs or exposes a value. A
 * deployment with no Etsy configuration shows the activation-key surface
 * alone rather than a button that could only ever fail.
 */
export function isEtsyChannelConfigured(): boolean {
  return Boolean(
    process.env.ETSY_API_KEYSTRING &&
      process.env.ETSY_API_SHARED_SECRET &&
      process.env.ETSY_SHOP_ID &&
      process.env.ETSY_OAUTH_REDIRECT_URI,
  );
}
