import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabasePublicEnv } from "./env";

/**
 * Server-only Supabase client using the public (anon) key. Once real
 * authentication exists (a later mission), the caller's access token
 * gets attached per request so RLS applies as that specific user — not
 * built yet, since there is no login flow to produce one.
 *
 * Deliberately not memoized/created at module scope: constructing it
 * lazily, inside this function, keeps import-time side effects at zero
 * so this module can be imported safely even when Supabase isn't
 * configured (see lib/supabase/env.ts).
 */
export function createServerSupabaseClient(): SupabaseClient {
  const { url, anonKey } = getSupabasePublicEnv();
  return createClient(url, anonKey);
}
