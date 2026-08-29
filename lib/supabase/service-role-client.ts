import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServiceRoleEnv } from "./env";

/**
 * Server-only Supabase client using the SERVICE ROLE key. This BYPASSES
 * Row Level Security entirely — reserved for trusted server-side
 * operations only (e.g. a future entitlement redemption flow, or Etsy
 * fulfillment). Nothing in the codebase calls this yet.
 *
 * Never import this file from a Client Component or any code path that
 * could ship it to the browser. Next.js keeps SUPABASE_SERVICE_ROLE_KEY
 * out of client bundles automatically because it is not prefixed
 * NEXT_PUBLIC_ (see .env.example) — but that protection only holds if
 * this client is never constructed from client-side code in the first
 * place.
 */
export function createServiceRoleSupabaseClient(): SupabaseClient {
  const { url, serviceRoleKey } = getSupabaseServiceRoleEnv();
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}
