import type { SupabaseClient } from "@supabase/supabase-js";
import type { DraftRepository } from "@/lib/adapters/draft-repository";
import type { MemorialContent, MemorialVersion } from "@/types/memorial";

interface MemorialDraftRow {
  content: MemorialContent;
  updated_at: string;
}

/**
 * Supabase-backed implementation of DraftRepository — the port defined
 * in Mission 007/008 (lib/adapters/draft-repository.ts). Application
 * code should depend on that interface, never on this class directly.
 *
 * Relies entirely on `memorial_drafts_select_own`/`memorial_drafts_update_own`'s
 * existing RLS policies (supabase/migrations/20260829155000_memorial_content.sql)
 * — this class performs no ownership check of its own, for either
 * method. Those policies already scope both read and write to the
 * caller's own memorial; nothing here duplicates that logic, and
 * nothing here can bypass it: the caller must construct this with a
 * session-scoped client (lib/supabase/server-client.ts's
 * createServerSupabaseClient()), never the service-role client.
 */
export class SupabaseDraftRepository implements DraftRepository {
  constructor(private readonly client: SupabaseClient) {}

  /**
   * `.maybeSingle()` is deliberate here, unlike `saveDraftContent`'s
   * `.single()`: zero rows (RLS-blocked or truly nonexistent
   * `memorialId` — see the port's docstring for why those stay
   * indistinguishable) resolves `{ data: null, error: null }`, which
   * this method turns into `null` — a normal outcome, never an error.
   */
  async getDraftContent(memorialId: string): Promise<MemorialVersion | null> {
    const { data, error } = await this.client
      .from("memorial_drafts")
      .select("content, updated_at")
      .eq("memorial_id", memorialId)
      .maybeSingle<MemorialDraftRow>();

    if (error) throw error;
    if (!data) return null;

    return { content: data.content, updatedAt: data.updated_at };
  }

  /**
   * `.single()` is deliberate: if the RLS policy makes the update affect
   * zero rows (wrong owner, or a memorialId that doesn't exist),
   * PostgREST returns no row and the Supabase client surfaces that as an
   * error here — this is what turns "silently updated nothing" into a
   * rejected promise instead of a false success (see the port's
   * docstring).
   */
  async saveDraftContent(
    memorialId: string,
    content: MemorialContent,
  ): Promise<{ updatedAt: string }> {
    const { data, error } = await this.client
      .from("memorial_drafts")
      .update({ content })
      .eq("memorial_id", memorialId)
      .select("updated_at")
      .single<{ updated_at: string }>();

    if (error) throw error;

    return { updatedAt: data.updated_at };
  }
}
