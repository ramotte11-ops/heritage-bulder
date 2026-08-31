import type { User } from "@supabase/supabase-js";
import { unstable_rethrow } from "next/navigation";
import { createServerSupabaseClient } from "./server-client";

/**
 * Resolves the raw Supabase Auth user for the current request (from the
 * session cookie), or null if there is none — or if Supabase isn't
 * configured, or any other error occurs; this never throws.
 *
 * Deliberately NOT the same thing as lib/adapters/auth-provider.ts's
 * `AuthProvider.getSession()`: that port resolves a HERITAGE *owner id*,
 * which requires an `owners` row linked via `auth_user_id` to exist.
 * Mission 004's rule is explicit — "authentification ≠ droit d'accès
 * produit" — a valid Supabase Auth session is enough to prove identity
 * here, with no owners lookup and no automatic owners row creation
 * anywhere in this file. The future mission that builds real Entitlement
 * redemption is what decides how/when an authenticated user becomes an
 * Owner; this function stays exactly as narrow as Mission 004 needs.
 */
export async function getAuthenticatedUser(): Promise<User | null> {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user;
  } catch (error) {
    // cookies() (used inside createServerSupabaseClient) throws Next's own
    // internal signal when a page is still being probed for static
    // rendering — that must propagate untouched, not be treated as an
    // auth failure. See node_modules/next/dist/docs/.../unstable_rethrow.md.
    unstable_rethrow(error);

    console.error(
      "Could not resolve the authenticated user:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}
