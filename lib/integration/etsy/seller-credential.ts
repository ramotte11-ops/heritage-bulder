import type {
  SellerCredentialRepository,
  SellerCredentialSnapshot,
} from "@/lib/adapters/seller-credential-repository";

/**
 * Mission 019B — obtaining a usable Etsy SELLER access token, exactly
 * once at a time across every concurrent serverless instance.
 *
 * ## The problem this file exists to solve
 *
 * Etsy's refresh grant returns a NEW refresh token and revokes the one
 * that was used. So two processes refreshing with the same stored token
 * do not merely duplicate work: one of the two resulting credentials is
 * dead on arrival, and if the surviving process is the one whose result
 * gets discarded, the channel is bricked until somebody re-bootstraps it
 * by hand. On Netlify, "two processes at once" is the normal case.
 *
 * ## The algorithm
 *
 *   1. Read. If the cached access token is still valid (with a safety
 *      margin), return it. No lease, no refresh, no rotation — this is
 *      the overwhelmingly common path and it costs one SELECT.
 *   2. Otherwise try to take the refresh lease. Acquisition is ONE
 *      conditional UPDATE, so PostgreSQL picks the single winner.
 *   3. The winner — and only the winner — calls Etsy. No database
 *      transaction is open while that HTTP request is in flight.
 *      - Success: store the new credential, guarded on the
 *        `credentialVersion` read at acquisition, which the same
 *        statement increments.
 *      - Failure: release the lease and change nothing. Fail closed.
 *   4. A loser never calls Etsy. It waits briefly and re-reads, because
 *      the winner is about to publish a fresh access token.
 *
 * ## Why the version guard is the real safety property
 *
 * The lease makes a collision rare; it cannot make it impossible,
 * because a lease can expire while its holder is still alive but slow.
 * What makes that harmless is the guard on `credentialVersion`: a late
 * winner whose lease has expired, and whose credential has meanwhile
 * been superseded by another attempt, finds the version moved and writes
 * nothing. An older credential can never overwrite a newer one. That is
 * a property of the UPDATE's WHERE clause, not of this file's care.
 *
 * ## The residual case, stated honestly
 *
 * If a lease holder crashes *after* Etsy rotated the token but *before*
 * the store commits, that new refresh token is lost and the stored one
 * is already revoked. No design that keeps the credential in one place
 * can avoid this: the rotation happened inside Etsy, not here. The
 * behaviour is then a loud, fail-closed `refreshFailed` on every
 * subsequent attempt — never a silent wrong answer — and recovery is a
 * deliberate re-bootstrap by staff. The lease's short deadline exists to
 * make the window small; nothing can make it zero.
 *
 * ## Secrets
 *
 * No token, no fragment of one, and no bootstrap seed ever reaches a
 * log, an error message, or a returned value other than the access token
 * this function's own caller needs to sign an Etsy request. Every
 * failure below is an opaque reason code.
 */

/**
 * How much of an access token's life to treat as already gone. A token
 * that expires in twenty seconds is useless: the request it would sign
 * may well arrive after it lapses. Refreshing slightly early costs one
 * rotation; using a token that dies mid-flight costs a failed claim for
 * a family.
 */
const EXPIRY_SAFETY_MARGIN_MS = 60_000;

/**
 * How long a refresh attempt may hold the lease. Comfortably longer than
 * an Etsy token call, short enough that a crashed instance blocks nobody
 * for long.
 */
const LEASE_DURATION_MS = 30_000;

/**
 * How many times a loser re-reads before giving up, and how long it
 * waits between reads.
 *
 * Together these bound how long a caller will wait for somebody else's
 * refresh: 5 x 400ms = 2s. That is comfortably longer than a normal Etsy
 * token call, so an ordinary concurrent burst resolves into "everybody
 * got the winner's token" rather than "everybody was told to try again";
 * and it stays well inside the 10s request timeout, so a genuinely stuck
 * refresh still fails closed quickly instead of holding an activation
 * open.
 */
const MAX_ATTEMPTS = 5;
const LOSER_BACKOFF_MS = 400;

export interface EtsyRefreshedTokens {
  accessToken: string;
  /** Etsy returns a NEW refresh token here. It becomes the source of
   * truth; the one used to obtain it is already revoked. */
  refreshToken: string;
  expiresInSeconds: number;
}

export interface SellerCredentialDeps {
  repository: SellerCredentialRepository;
  /**
   * Calls Etsy's refresh grant. Rejects on any failure — this module
   * never interprets an Etsy error body, it only fails closed.
   */
  refreshWithEtsy(refreshToken: string): Promise<EtsyRefreshedTokens>;
  /**
   * The bootstrap seed (ETSY_SELLER_REFRESH_TOKEN), or null when it is
   * not configured. Used ONLY to create the row the very first time; it
   * can never overwrite a stored credential — see
   * `SellerCredentialRepository.bootstrap`.
   */
  bootstrapRefreshToken: string | null;
  now(): Date;
  /** Injected so the lease holder id is deterministic under test. */
  newLeaseHolderId(): string;
  /** Injected so tests never actually wait. */
  wait(milliseconds: number): Promise<void>;
}

export type SellerAccessTokenResult =
  | { status: "ready"; accessToken: string }
  /**
   * Every refusal, as an opaque reason. None of these carries a token,
   * an Etsy error body, or anything a caller could surface to a family:
   * `lib/integration/etsy/claim-by-etsy-identity.ts` collapses them
   * further into a single calm message.
   *
   * - `notBootstrapped`  no stored credential and no seed configured
   * - `refreshFailed`    Etsy refused the refresh; nothing was written
   * - `busy`             another attempt held the lease throughout
   */
  | { status: "unavailable"; reason: "notBootstrapped" | "refreshFailed" | "busy" };

function isAccessTokenUsable(
  credential: SellerCredentialSnapshot,
  now: Date,
): credential is SellerCredentialSnapshot & { accessToken: string } {
  if (credential.accessToken === null || credential.accessTokenExpiresAt === null) {
    return false;
  }

  const expiresAt = Date.parse(credential.accessTokenExpiresAt);
  // An unparseable timestamp is treated as expired rather than trusted.
  // A stored value we cannot read is not a reason to use a token we
  // cannot date.
  if (Number.isNaN(expiresAt)) return false;

  return expiresAt - now.getTime() > EXPIRY_SAFETY_MARGIN_MS;
}

/**
 * Ensures the singleton row exists, seeding it from the bootstrap value
 * when it does not.
 *
 * The seed is used for creation only. `bootstrap` is
 * `INSERT ... ON CONFLICT DO NOTHING`, so once the database holds a
 * credential — necessarily newer than any environment variable, since
 * only a successful refresh writes one — the seed is inert. That is the
 * property Mission 019B's brief requires: an old env value can never
 * overwrite a newer DB refresh token.
 */
async function readOrBootstrap(
  deps: SellerCredentialDeps,
): Promise<SellerCredentialSnapshot | null> {
  const existing = await deps.repository.read();
  if (existing) return existing;

  if (deps.bootstrapRefreshToken === null) return null;

  await deps.repository.bootstrap(deps.bootstrapRefreshToken);

  // Re-read rather than assume: a concurrent bootstrap may have won, and
  // the row that actually exists is the one we must use.
  return deps.repository.read();
}

/**
 * Returns an access token good enough to sign a seller-side Etsy call,
 * or an opaque reason why there is none.
 */
export async function getSellerAccessToken(
  deps: SellerCredentialDeps,
): Promise<SellerAccessTokenResult> {
  const initial = await readOrBootstrap(deps);
  if (!initial) return { status: "unavailable", reason: "notBootstrapped" };

  if (isAccessTokenUsable(initial, deps.now())) {
    return { status: "ready", accessToken: initial.accessToken };
  }

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const now = deps.now();
    const leaseHolder = deps.newLeaseHolderId();

    const lease = await deps.repository.acquireRefreshLease({
      leaseHolder,
      now: now.toISOString(),
      leaseExpiresAt: new Date(now.getTime() + LEASE_DURATION_MS).toISOString(),
    });

    if (lease.status === "missing") {
      // The row vanished between the read above and here. Never
      // re-created from the seed at this point: re-bootstrapping mid
      // flight could resurrect a revoked token over a deliberate reset.
      return { status: "unavailable", reason: "notBootstrapped" };
    }

    if (lease.status === "held") {
      // Somebody else is refreshing. We do NOT call Etsy — that is the
      // whole point of the lease. Wait, then look for their result.
      await deps.wait(LOSER_BACKOFF_MS);

      const refreshed = await deps.repository.read();
      if (refreshed && isAccessTokenUsable(refreshed, deps.now())) {
        return { status: "ready", accessToken: refreshed.accessToken };
      }
      continue;
    }

    // We hold the lease. Between acquiring it and now, another attempt
    // may have published a perfectly good token; using it is better than
    // spending a rotation.
    if (isAccessTokenUsable(lease.credential, deps.now())) {
      await deps.repository.releaseRefreshLease(leaseHolder);
      return { status: "ready", accessToken: lease.credential.accessToken };
    }

    let tokens: EtsyRefreshedTokens;
    try {
      // No database transaction is open across this call, by
      // construction: the lease is what provides exclusivity, precisely
      // so that a network round-trip to a third party never sits inside
      // a PostgreSQL transaction.
      tokens = await deps.refreshWithEtsy(lease.credential.refreshToken);
    } catch {
      // The error is deliberately not inspected, not re-thrown and not
      // logged: an Etsy error body can carry the credential back. Release
      // the lease, leave the stored credential exactly as it was, and
      // fail closed.
      await deps.repository.releaseRefreshLease(leaseHolder);
      return { status: "unavailable", reason: "refreshFailed" };
    }

    const stored = await deps.repository.storeRefreshedCredential({
      expectedCredentialVersion: lease.credential.credentialVersion,
      refreshToken: tokens.refreshToken,
      accessToken: tokens.accessToken,
      accessTokenExpiresAt: new Date(
        deps.now().getTime() + tokens.expiresInSeconds * 1000,
      ).toISOString(),
    });

    if (stored.status === "stored") {
      return { status: "ready", accessToken: tokens.accessToken };
    }

    // Superseded: our lease lapsed and another attempt published a newer
    // credential while we were talking to Etsy. Nothing was written —
    // that is the version guard doing its job. Release whatever lease we
    // may still hold and use the newer credential rather than ours.
    await deps.repository.releaseRefreshLease(leaseHolder);

    const newer = await deps.repository.read();
    if (newer && isAccessTokenUsable(newer, deps.now())) {
      return { status: "ready", accessToken: newer.accessToken };
    }
  }

  return { status: "unavailable", reason: "busy" };
}
