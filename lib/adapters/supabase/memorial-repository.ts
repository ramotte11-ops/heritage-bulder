import type { SupabaseClient } from "@supabase/supabase-js";
import type { DataRepository } from "@/lib/adapters/data-repository";
import type { EditorialContext, MemorialType } from "@/config/memorial";
import type { Skin } from "@/config/skins";
import type { Language } from "@/config/languages";
import type { SectionId } from "@/config/sections";
import type { MemorialContent, MemorialStatus, StoredMemorial } from "@/types/memorial";

/**
 * Row shapes as they come back from Postgres (snake_case) — kept private
 * to this file. Translating between this and the domain `Memorial` type
 * (camelCase) is exactly what this adapter is for; nothing outside
 * lib/adapters/supabase/ should ever see these shapes.
 */
interface MemorialRow {
  id: string;
  owner_id: string;
  entitlement_id: string;
  memorial_type: MemorialType;
  // Mission 011A: NULL between redemption and the family's own choices —
  // these three columns are nullable in the database on purpose (see
  // supabase/migrations/20260901120000_redeem_entitlement.sql). Typing
  // them as always-present here would be this layer telling the rest of
  // the app something the row does not actually prove.
  editorial_context: EditorialContext | null;
  skin_id: Skin;
  language: Language | null;
  enabled_sections: SectionId[];
  status: MemorialStatus;
  slug: string | null;
  created_at: string;
  updated_at: string;
}

interface MemorialDraftRow {
  content: MemorialContent;
  updated_at: string;
}

interface MemorialPublishedSnapshotRow {
  content: MemorialContent;
  published_at: string;
}

function toMemorial(
  row: MemorialRow,
  draft: MemorialDraftRow,
  published: MemorialPublishedSnapshotRow | null,
): StoredMemorial {
  return {
    id: row.id,
    ownerId: row.owner_id,
    entitlementId: row.entitlement_id,
    memorialType: row.memorial_type,
    editorialContext: row.editorial_context,
    skin: row.skin_id,
    language: row.language,
    enabledSections: row.enabled_sections,
    status: row.status,
    slug: row.slug,
    draft: { content: draft.content, updatedAt: draft.updated_at },
    published: published
      ? { content: published.content, updatedAt: published.published_at }
      : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Supabase-backed implementation of DataRepository<StoredMemorial> — the
 * port defined in Mission 001 (lib/adapters/data-repository.ts).
 * Application code should depend on that interface, never on this class
 * directly, so a future change of provider only means writing a new class
 * here.
 *
 * Mission 011A: the type parameter is `StoredMemorial`, not `Memorial`.
 * Persistence can legitimately return a memorial the family has not
 * configured yet (the row a redemption creates), and this layer says so
 * rather than hiding it behind a non-null type. Callers that need a
 * configured memorial narrow with `isConfiguredMemorial()`.
 *
 * A memorial's content lives across three tables (memorials,
 * memorial_drafts, memorial_published_snapshots — see
 * supabase/README.md); this repository composes them into one `Memorial`
 * so callers never need to know that.
 */
export class SupabaseMemorialRepository implements DataRepository<StoredMemorial> {
  constructor(private readonly client: SupabaseClient) {}

  async findById(id: string): Promise<StoredMemorial | null> {
    const { data: row, error } = await this.client
      .from("memorials")
      .select("*")
      .eq("id", id)
      .maybeSingle<MemorialRow>();

    if (error) throw error;
    if (!row) return null;

    // memorial_drafts is guaranteed to exist by the
    // memorials_create_draft trigger (migration
    // 20260829155000_memorial_content.sql) — every memorial has exactly
    // one draft row from the moment it is created.
    const { data: draft, error: draftError } = await this.client
      .from("memorial_drafts")
      .select("content, updated_at")
      .eq("memorial_id", id)
      .single<MemorialDraftRow>();

    if (draftError) throw draftError;

    const { data: published, error: publishedError } = await this.client
      .from("memorial_published_snapshots")
      .select("content, published_at")
      .eq("memorial_id", id)
      .maybeSingle<MemorialPublishedSnapshotRow>();

    if (publishedError) throw publishedError;

    return toMemorial(row, draft, published);
  }

  async create(entity: StoredMemorial): Promise<StoredMemorial> {
    const { data: row, error } = await this.client
      .from("memorials")
      .insert({
        id: entity.id,
        owner_id: entity.ownerId,
        entitlement_id: entity.entitlementId,
        memorial_type: entity.memorialType,
        editorial_context: entity.editorialContext,
        skin_id: entity.skin,
        language: entity.language,
        enabled_sections: entity.enabledSections,
        status: entity.status,
        slug: entity.slug,
      })
      .select("*")
      .single<MemorialRow>();

    if (error) throw error;

    const created = await this.findById(row.id);
    if (!created) throw new Error("Memorial was created but could not be re-read.");
    return created;
  }

  async update(id: string, patch: Partial<StoredMemorial>): Promise<StoredMemorial> {
    // Only memorials-table columns are patchable here. Draft/published
    // content live in their own tables and are not part of this generic
    // update — a future mission adds dedicated draft-content and
    // publish operations when the Builder actually needs them.
    const update: Record<string, unknown> = {};
    if (patch.editorialContext !== undefined) update.editorial_context = patch.editorialContext;
    if (patch.skin !== undefined) update.skin_id = patch.skin;
    if (patch.language !== undefined) update.language = patch.language;
    if (patch.enabledSections !== undefined) update.enabled_sections = patch.enabledSections;
    if (patch.status !== undefined) update.status = patch.status;

    const { error } = await this.client.from("memorials").update(update).eq("id", id);
    if (error) throw error;

    const updated = await this.findById(id);
    if (!updated) throw new Error(`Memorial ${id} not found after update.`);
    return updated;
  }
}
