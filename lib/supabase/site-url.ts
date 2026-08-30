/**
 * Base URL used to build Supabase Auth's `emailRedirectTo` for magic
 * links (see app/auth/actions.ts). It must exactly match an entry in the
 * Supabase project's Auth → URL Configuration → Redirect URLs allowlist,
 * or Supabase rejects the redirect and the magic link fails silently
 * back to an error. See this mission's report for the human
 * configuration steps this implies.
 *
 * Resolution order:
 *
 * 1. DEPLOY_PRIME_URL — set automatically by Netlify (build time AND the
 *    Next.js runtime functions it deploys) to the correct URL for the
 *    CURRENT deploy context: the production domain in production, or a
 *    Deploy Preview's own URL for a PR preview. Netlify's own docs
 *    recommend this exact variable for OAuth/redirect callback URLs,
 *    precisely because — unlike DEPLOY_URL — it stays stable across
 *    every rebuild of the same PR/branch rather than changing per
 *    commit. This is server-only (read inside a Server Action), so it
 *    does not need a NEXT_PUBLIC_ prefix. This means a Deploy Preview
 *    gets the right redirect target automatically, with no manual
 *    per-PR configuration.
 * 2. NEXT_PUBLIC_SITE_URL — manual override, e.g. for local development.
 * 3. http://localhost:3000 — fallback if neither is set.
 *
 * NEXT_PUBLIC_SITE_URL and DEPLOY_PRIME_URL are both intentionally
 * public (safe to expose): each is only ever a base URL, never a
 * credential.
 */
export function getSiteUrl(): string {
  const netlifyDeployUrl = process.env.DEPLOY_PRIME_URL;
  if (netlifyDeployUrl && netlifyDeployUrl.length > 0) {
    return netlifyDeployUrl.replace(/\/+$/, "");
  }

  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  const base = configured && configured.length > 0 ? configured : "http://localhost:3000";
  return base.replace(/\/+$/, "");
}
