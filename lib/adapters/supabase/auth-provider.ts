import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthProvider, AuthSession } from "@/lib/adapters/auth-provider";

/**
 * Supabase-backed implementation of AuthProvider — the port defined in
 * Mission 001 (lib/adapters/auth-provider.ts). Resolves the current
 * Supabase Auth session to a HERITAGE owner id via
 * owners.auth_user_id — it never treats the Supabase Auth user id itself
 * as the session's identity (see supabase/README.md).
 *
 * There is no real login flow yet (magic link is a later mission), so in
 * practice `client` here never has a session until that exists. This
 * class only prepares the mapping so that mission doesn't have to design
 * it from scratch.
 */
export class SupabaseAuthProvider implements AuthProvider {
  constructor(private readonly client: SupabaseClient) {}

  async getSession(): Promise<AuthSession | null> {
    const {
      data: { user },
      error,
    } = await this.client.auth.getUser();

    if (error || !user) return null;

    const { data: owner, error: ownerError } = await this.client
      .from("owners")
      .select("id")
      .eq("auth_user_id", user.id)
      .maybeSingle<{ id: string }>();

    if (ownerError) throw ownerError;
    if (!owner) return null;

    return { ownerId: owner.id };
  }
}
