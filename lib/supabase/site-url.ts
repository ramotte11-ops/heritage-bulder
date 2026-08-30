/**
 * Base URL used to build Supabase Auth's `emailRedirectTo` for magic
 * links (see app/auth/actions.ts). It must exactly match an entry in the
 * Supabase project's Auth → URL Configuration → Redirect URLs allowlist,
 * or Supabase rejects the redirect and the magic link fails silently
 * back to an error. See this mission's report for the human
 * configuration steps this implies.
 *
 * NEXT_PUBLIC_SITE_URL is intentionally public (safe to expose): it is
 * only ever a base URL, never a credential.
 */
export function getSiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  const base = configured && configured.length > 0 ? configured : "http://localhost:3000";
  return base.replace(/\/+$/, "");
}
