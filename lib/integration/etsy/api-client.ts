/**
 * SERVER ONLY. Mission 019B — every HTTP call HERITAGE makes to Etsy.
 *
 * Native `fetch`, no SDK. The surface we need is four requests, and a
 * dependency that ships its own auth handling, its own retry policy and
 * its own logging would be a larger security surface than the code it
 * replaces — particularly around a credential that must never reach a
 * log.
 *
 * ## Two different credentials, deliberately never mixed
 *
 *   * `x-api-key: <keystring>:<shared_secret>` — the APPLICATION's
 *     identity, required on every v3 call since Etsy's 9 February 2026
 *     change. Assembled once in ./config.ts.
 *   * `Authorization: Bearer <access_token>` — WHOSE data is being read.
 *     For receipts that is always OUR OWN seller token, never a buyer's:
 *     v3 has no buyer-scoped receipts endpoint.
 *
 * The token endpoint takes neither. It is PKCE — `client_id` plus a
 * `code_verifier` — and no client secret is ever sent. The shared secret
 * is not an OAuth client secret and is never used as one.
 *
 * ## What never happens in this file
 *
 * No token, no authorization code, no code verifier, and no Etsy
 * response body is ever logged or attached to a thrown error. Errors
 * carry an HTTP status and nothing else. A caller that needs to explain
 * a failure to a human does so from its own vocabulary, not from Etsy's.
 */

const ETSY_TOKEN_URL = "https://api.etsy.com/v3/public/oauth/token";
const ETSY_API_BASE = "https://openapi.etsy.com/v3/application";

/** Etsy is a dependency, not a partner in our latency budget. A hung
 * request must not hold a family's activation open indefinitely. */
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Deliberately carries only a status. Not the body, not the URL's query
 * string, not the request headers — each of which can hold a credential.
 */
export class EtsyApiError extends Error {
  readonly httpStatus: number;

  constructor(httpStatus: number, operation: string) {
    super(`Etsy ${operation} failed with HTTP ${httpStatus}`);
    this.name = "EtsyApiError";
    this.httpStatus = httpStatus;
  }
}

export interface EtsyTokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timeout);
  }
}

function readTokenResponse(payload: unknown, operation: string): EtsyTokenResponse {
  if (typeof payload !== "object" || payload === null) {
    throw new EtsyApiError(502, operation);
  }

  const { access_token: accessToken, refresh_token: refreshToken, expires_in: expiresIn } =
    payload as Record<string, unknown>;

  if (
    typeof accessToken !== "string" ||
    accessToken.length === 0 ||
    typeof refreshToken !== "string" ||
    refreshToken.length === 0 ||
    typeof expiresIn !== "number" ||
    !Number.isFinite(expiresIn) ||
    expiresIn <= 0
  ) {
    // A malformed token response is a hard failure, never a partially
    // usable credential: storing half of one is how a channel ends up
    // with a token it cannot date or cannot renew.
    throw new EtsyApiError(502, operation);
  }

  return { accessToken, refreshToken, expiresInSeconds: expiresIn };
}

async function postToken(body: Record<string, string>, operation: string): Promise<EtsyTokenResponse> {
  const response = await fetchWithTimeout(ETSY_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) throw new EtsyApiError(response.status, operation);

  return readTokenResponse(await response.json(), operation);
}

/**
 * Exchanges the buyer's one-time authorization code for a token.
 *
 * The resulting token is used for exactly one thing — reading the Etsy
 * member id out of its documented numeric prefix — and is then dropped.
 * It is never stored, never refreshed and never used to call an
 * endpoint.
 */
export function exchangeAuthorizationCode({
  keystring,
  redirectUri,
  code,
  codeVerifier,
}: {
  keystring: string;
  redirectUri: string;
  code: string;
  codeVerifier: string;
}): Promise<EtsyTokenResponse> {
  return postToken(
    {
      grant_type: "authorization_code",
      client_id: keystring,
      redirect_uri: redirectUri,
      code,
      code_verifier: codeVerifier,
    },
    "authorization code exchange",
  );
}

/**
 * Renews OUR OWN seller credential.
 *
 * Etsy returns a NEW refresh token here and revokes the one sent, which
 * is exactly why this must only ever be called by the single process
 * holding the refresh lease — see ./seller-credential.ts.
 */
export function refreshSellerToken({
  keystring,
  refreshToken,
}: {
  keystring: string;
  refreshToken: string;
}): Promise<EtsyTokenResponse> {
  return postToken(
    { grant_type: "refresh_token", client_id: keystring, refresh_token: refreshToken },
    "seller token refresh",
  );
}

async function getFromEtsy(
  path: string,
  { apiKeyHeader, accessToken }: { apiKeyHeader: string; accessToken: string },
  operation: string,
): Promise<unknown> {
  const response = await fetchWithTimeout(`${ETSY_API_BASE}${path}`, {
    method: "GET",
    headers: {
      "x-api-key": apiKeyHeader,
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) throw new EtsyApiError(response.status, operation);

  return response.json();
}

/**
 * One page of our own shop's receipts, newest-first ordering not assumed.
 *
 * `limit` and `offset` are the only parameters sent. Etsy documents no
 * filter by buyer on this endpoint, and Mission 019B's brief is explicit
 * that no undocumented parameter may be invented — so the buyer match is
 * performed server-side, in ./claim-by-etsy-identity.ts, over pages read
 * with plain documented pagination.
 *
 * Returns the raw `results` array untouched. Interpreting a receipt is
 * ./receipt.ts's job and nobody else's.
 */
export async function listShopReceipts({
  apiKeyHeader,
  shopId,
  accessToken,
  limit,
  offset,
}: {
  apiKeyHeader: string;
  shopId: string;
  accessToken: string;
  limit: number;
  offset: number;
}): Promise<unknown[]> {
  const payload = await getFromEtsy(
    `/shops/${encodeURIComponent(shopId)}/receipts?limit=${limit}&offset=${offset}`,
    { apiKeyHeader, accessToken },
    "shop receipts read",
  );

  if (typeof payload !== "object" || payload === null) return [];

  const { results } = payload as Record<string, unknown>;
  return Array.isArray(results) ? results : [];
}

/**
 * One specific receipt of our own shop, by its Etsy receipt id.
 *
 * This is what makes the support path for a guest order honest: staff
 * type an order reference, and HERITAGE asks ETSY whether that order
 * exists, belongs to our shop and is payable — rather than trusting what
 * was typed. A receipt id that is not ours comes back as a 404 from
 * Etsy, because the path is scoped to our own `shop_id`.
 */
export async function getShopReceipt({
  apiKeyHeader,
  shopId,
  accessToken,
  receiptId,
}: {
  apiKeyHeader: string;
  shopId: string;
  accessToken: string;
  receiptId: string;
}): Promise<unknown> {
  return getFromEtsy(
    `/shops/${encodeURIComponent(shopId)}/receipts/${encodeURIComponent(receiptId)}`,
    { apiKeyHeader, accessToken },
    "shop receipt read",
  );
}
