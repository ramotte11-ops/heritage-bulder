import { cookies } from "next/headers";

/**
 * SERVER ONLY. Mission 019B — where a started Etsy handshake lives
 * between the redirect out and the callback back.
 *
 * ## Why cookies and not a table
 *
 * The handshake holds two short-lived values and must survive one
 * round-trip through Etsy. A table would mean a migration, a row per
 * abandoned attempt, and a cleanup job — for state whose natural
 * lifetime is ten minutes and whose natural scope is one browser.
 *
 * ## Why no signing key is needed — and therefore none was added
 *
 * Mission 019B's brief says to stop and report before introducing a new
 * secret just to sign these cookies. None is needed, because the cookie
 * is not carrying a claim that has to be authenticated — it IS the
 * secret being compared:
 *
 *   * `state` is generated server-side, stored `HttpOnly`, and compared
 *     on return against the `state` Etsy echoes in the query string.
 *     Script on the page cannot read it, so an attacker who can make a
 *     victim's browser hit our callback with a `state` of their choosing
 *     still cannot make the cookie match it. A signature would prove the
 *     value came from us — which equality against our own stored copy
 *     already proves, more directly.
 *   * `code_verifier` is never transmitted to the browser's document at
 *     all and is only ever read server-side to complete PKCE.
 *
 * Tampering is not a threat these values need protection from either: a
 * forged or altered cookie simply fails the comparison, and the claim is
 * refused. There is no state here whose *integrity* buys an attacker
 * anything, so an HMAC would add a key to manage and rotate for no
 * property that is missing.
 *
 * ## SameSite=Lax, deliberately
 *
 * `Strict` would not be sent on the top-level navigation back from
 * etsy.com and the handshake could never complete. `Lax` is sent on
 * exactly that top-level GET and not on cross-site subrequests, which is
 * the behaviour this flow needs and no more.
 */

const STATE_COOKIE = "heritage_etsy_oauth_state";
const VERIFIER_COOKIE = "heritage_etsy_oauth_verifier";

/** Ten minutes — see OAUTH_HANDSHAKE_TTL_SECONDS in ./oauth.ts. Expiry
 * is the anti-replay mechanism for an abandoned attempt; deletion on use
 * is the one for a completed attempt. */
const TTL_SECONDS = 600;

function cookieOptions() {
  return {
    httpOnly: true,
    // Off in development so the flow is exercisable over plain http on
    // localhost; on everywhere a real deployment runs.
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: TTL_SECONDS,
  };
}

/** Stores one freshly created handshake. Overwrites any previous one:
 * starting a new attempt must invalidate the old, or an abandoned
 * handshake would stay usable alongside it. */
export async function storeEtsyHandshake({
  state,
  codeVerifier,
}: {
  state: string;
  codeVerifier: string;
}): Promise<void> {
  const store = await cookies();
  store.set(STATE_COOKIE, state, cookieOptions());
  store.set(VERIFIER_COOKIE, codeVerifier, cookieOptions());
}

export interface StoredEtsyHandshake {
  state: string | undefined;
  codeVerifier: string | undefined;
}

export async function readEtsyHandshake(): Promise<StoredEtsyHandshake> {
  const store = await cookies();
  return {
    state: store.get(STATE_COOKIE)?.value,
    codeVerifier: store.get(VERIFIER_COOKIE)?.value,
  };
}

/**
 * Removes the handshake. Called on EVERY exit from the callback —
 * success, refusal, or malformed request alike — which is what makes an
 * authorization code single-use here: a replayed callback finds no
 * verifier and no state to compare, and is refused before anything is
 * exchanged.
 */
export async function clearEtsyHandshake(): Promise<void> {
  const store = await cookies();
  store.delete(STATE_COOKIE);
  store.delete(VERIFIER_COOKIE);
}
