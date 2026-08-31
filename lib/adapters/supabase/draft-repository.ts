import type { SupabaseClient } from "@supabase/supabase-js";
import type { DraftRepository } from "@/lib/adapters/draft-repository";
import type { MemorialContent } from "@/types/memorial";

interface MemorialDraftUpdateRow {
  updated_at: string;
}

/**
 * Supabase-backed implementation of DraftRepository — the port defined
 * in Mission 007 (lib/adapters/draft-repository.ts). Application code
 * should depend on that interface, never on this class directly.
 *
 * Relies entirely on `memorial_drafts_update_own`'s existing RLS policy
 * (supabase/migrations/20260829155000_memorial_content.sql) — this
 * class performs no ownership check of its own. That policy already
 * scopes an update to the caller's own memorial; nothing here
 * duplicates that logic, and nothing here can bypass it: the caller
 * must construct this with a session-scoped client
 * (lib/supabase/server-client.ts's createServerSupabaseClient()), never
 * the service-role client.
 *
 * `.single()` is deliberate: if the RLS policy makes the update affect
 * zero rows (wrong owner, or a memorialId that doesn't exist),
 * PostgREST returns no row and the Supabase client surfaces that as an
 * error here — this is what turns "silently updated nothing" into a
 * rejected promise instead of a false success (see the port's
 * docstring).
 */
export class SupabaseDraftRepository implements DraftRepository {
  constructor(private readonly client: SupabaseClient) {}

  async saveDraftContent(
    memorialId: string,
    content: MemorialContent,
  ): Promise<{ updatedAt: string }> {
    const { data, error } = await this.client
      .from("memorial_drafts")
      .update({ content })
      .eq("memorial_id", memorialId)
      .select("updated_at")
      .single<MemorialDraftUpdateRow>();

    if (error) throw error;

    return { updatedAt: data.updated_at };
  }
}
