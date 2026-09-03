import type { SupabaseClient } from "@supabase/supabase-js";
import type { MemorialOwnershipRepository } from "@/lib/adapters/memorial-ownership-repository";

/**
 * SERVER ONLY. Reads `memorials.owner_id` with the service-role client
 * (lib/supabase/service-role-client.ts).
 *
 * Since Mission 013C, `authenticated` holds no privilege on `memorials`
 * at all, so a session-scoped client cannot perform this read — and
 * would not be the right tool anyway: the point of this read is to
 * establish the ground truth an authorization decision is made against,
 * which means it must not itself be filtered by the thing being
 * decided. `service_role` already holds `SELECT` on `memorials`
 * (supabase/migrations/20260901190000_privilege_model.sql), so nothing
 * about the privilege model changes for this mission.
 *
 * "Reads with a role that bypasses RLS" is only safe because of what
 * this class is not allowed to do: it selects ONE column, it returns an
 * owner id rather than a verdict, and it never receives the owner id it
 * would be compared to. The comparison happens in
 * lib/auth/memorial-access.ts against the session-resolved owner.
 *
 * Never import this file from a Client Component or anything reachable
 * from one — lib/entitlement/server-only-boundary.test.ts enforces that.
 */

interface MemorialOwnerRow {
  owner_id: string;
}

export class SupabaseMemorialOwnershipRepository implements MemorialOwnershipRepository {
  constructor(private readonly client: SupabaseClient) {}

  async findOwnerIdForMemorial(memorialId: string): Promise<string | null> {
    // `.eq()`, never a pattern operator: postgrest-js appends the value
    // verbatim, so an operator like `.like()`/`.ilike()` would let
    // characters inside the value act as wildcards. That was a real bug
    // at an identity boundary in Mission 011B; the same discipline
    // applies at every boundary, including this one.
    //
    // `.maybeSingle()` because "no such memorial" is a normal answer
    // here, not an error — the caller collapses it into the same opaque
    // refusal as "somebody else's memorial".
    const { data, error } = await this.client
      .from("memorials")
      .select("owner_id")
      .eq("id", memorialId)
      .maybeSingle<MemorialOwnerRow>();

    // Rethrown rather than turned into `null`: an authorization check
    // must never read a failure as a fact. See the port's docstring.
    if (error) throw error;
    if (!data) return null;

    // A row with no owner cannot exist (`memorials.owner_id` is NOT
    // NULL), but an empty string would compare equal to nothing useful
    // and is not an owner id — refuse to hand one out.
    return data.owner_id ? data.owner_id : null;
  }
}
