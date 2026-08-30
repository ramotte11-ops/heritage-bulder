import { headers } from "next/headers";

/**
 * Base URL used to build Supabase Auth's `emailRedirectTo` for magic
 * links (see app/auth/actions.ts). It must exactly match an entry in the
 * Supabase project's Auth → URL Configuration → Redirect URLs allowlist,
 * or Supabase silently falls back to the project's configured Site URL
 * instead — which is exactly the failure this function's design fixes.
 *
 * Resolution order:
 *
 * 1. The incoming request's own Host header (`x-forwarded-host`, else
 *    `host`), read via next/headers inside the Server Action that calls
 *    this. This is the ground truth: whatever hostname the browser
 *    actually used to reach this server IS the correct redirect target,
 *    with no dependency on any platform-provided metadata env var being
 *    correctly propagated to the function runtime. This is deliberately
 *    the *first* source, not a fallback: real-world testing on a Netlify
 *    Deploy Preview showed the redirect landing on http://localhost:3000
 *    instead of the Preview's own URL, meaning `DEPLOY_PRIME_URL` (below)
 *    was not reflecting the deploy context correctly at the point the
 *    Server Action ran — the request itself never lies about which host
 *    served it, so it does not share that failure mode. Even if a header
 *    were somehow spoofed, Supabase's own Redirect URLs allowlist is the
 *    real security boundary — an unlisted target is rejected there
 *    regardless of what this function returns.
 * 2. DEPLOY_PRIME_URL — set by Netlify (build time and, per Netlify's
 *    docs, Functions runtime) to the current deploy context's URL. Kept
 *    as a fallback for the rare case this runs outside a request (no
 *    headers available), and because Netlify's own docs recommend it for
 *    OAuth/redirect callback URLs.
 * 3. NEXT_PUBLIC_SITE_URL — manual override, e.g. for local development.
 * 4. http://localhost:3000 — last-resort fallback.
 *
 * All of these are intentionally public (safe to expose): each is only
 * ever a base URL, never a credential.
 */
export async function getSiteUrl(): Promise<string> {
  const fromRequest = await siteUrlFromRequestHeaders();
  if (fromRequest) {
    return fromRequest;
  }

  const netlifyDeployUrl = process.env.DEPLOY_PRIME_URL;
  if (netlifyDeployUrl && netlifyDeployUrl.length > 0) {
    return netlifyDeployUrl.replace(/\/+$/, "");
  }

  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  const base = configured && configured.length > 0 ? configured : "http://localhost:3000";
  return base.replace(/\/+$/, "");
}

async function siteUrlFromRequestHeaders(): Promise<string | null> {
  const headersList = await headers();
  const host = headersList.get("x-forwarded-host") ?? headersList.get("host");
  if (!host || host.length === 0) {
    return null;
  }

  const isLocal = host.startsWith("localhost") || host.startsWith("127.0.0.1");
  const protocol = headersList.get("x-forwarded-proto") ?? (isLocal ? "http" : "https");

  return `${protocol}://${host}`.replace(/\/+$/, "");
}
