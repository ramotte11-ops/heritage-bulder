import type { SupabaseClient } from "@supabase/supabase-js";
import type { MemorialConfigRepository } from "@/lib/adapters/memorial-config-repository";
import type { EditorialContext, MemorialType } from "@/config/memorial";
import type { Skin } from "@/config/skins";
import type { Language } from "@/config/languages";
import type { SectionId } from "@/config/sections";
import type { MemorialStatus, StoredMemorialConfig } from "@/types/memorial";

/**
 * The row shape as it comes back from Postgres (snake_case), kept
 * private to this file exactly as in memorial-repository.ts. Every
 * column of `memorials` and NOT ONE column of any other table — this
 * adapter's whole point is that it touches a single table.
 *
 * Mission 011A: `editorial_context`, `language` and `slug` are nullable
 * in the database between redemption and the family's own choices, and
 * are typed as such here rather than being asserted non-null.
 */
interface MemorialRow {
  id: string;
  owner_id: string;
  entitlement_id: string;
  memorial_type: MemorialType;
  editorial_context: EditorialContext | null;
  skin_id: Skin;
  language: Language | null;
  enabled_sections: SectionId[];
  status: MemorialStatus;
  slug: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Mission 021B — Supabase implementation of `MemorialConfigRepository`.
 *
 * ONE `select` on ONE table. It deliberately does not read
 * `memorial_drafts` (the draft comes from `DraftRepository`, the single
 * authoritative source — see lib/builder/resume-session.ts) and it
 * deliberately does not read `memorial_published_snapshots` at all: the
 * Builder displays nothing from it, so no client role should need a
 * privilege on it (see the port's docstring, and Mission 021B's
 * migration).
 *
 * Must be constructed with the SESSION-SCOPED client
 * (lib/supabase/server-client.ts's `createServerSupabaseClient()`),
 * never the service-role one — same rule as
 * lib/adapters/supabase/draft-repository.ts. This class performs no
 * ownership check of its own: `memorials_select_own`
 * (supabase/migrations/20260829154000_memorials.sql) already scopes the
 * read to the caller's own memorials, and the application-level check
 * that must have happened first is `authorizeMemorialAccess`
 * (lib/auth/memorial-access.ts). Nothing here duplicates either, and
 * with a session-scoped client nothing here can bypass them.
 *
 * `.maybeSingle()` is deliberate: zero rows — RLS-blocked, or a
 * `memorialId` that does not exist — resolves `{ data: null, error:
 * null }`, which becomes `null`, a normal outcome. A real error still
 * rejects.
 */
export class SupabaseMemorialConfigRepository implements MemorialConfigRepository {
  constructor(private readonly client: SupabaseClient) {}

  async findConfigById(memorialId: string): Promise<StoredMemorialConfig | null> {
    const { data, error } = await this.client
      .from("memorials")
      .select(
        "id, owner_id, entitlement_id, memorial_type, editorial_context, skin_id, language, enabled_sections, status, slug, created_at, updated_at",
      )
      .eq("id", memorialId)
      .maybeSingle<MemorialRow>();

    if (error) throw error;
    if (!data) return null;

    return {
      id: data.id,
      ownerId: data.owner_id,
      entitlementId: data.entitlement_id,
      memorialType: data.memorial_type,
      editorialContext: data.editorial_context,
      skin: data.skin_id,
      language: data.language,
      enabledSections: data.enabled_sections,
      status: data.status,
      slug: data.slug,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }
}
