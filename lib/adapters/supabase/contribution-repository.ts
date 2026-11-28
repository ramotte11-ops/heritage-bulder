import type { SupabaseClient } from "@supabase/supabase-js";
import { CONTRIBUTION_TYPES, type ContributionType } from "@/config/contributions";
import type {
  CategoriesOutcome,
  ContributionRepository,
  ContributionStatus,
  DepositOutcome,
  DepositResult,
  FamilyContributionReader,
  FamilyContributionRow,
  ModerationOutcome,
  OwnerContributionSettings,
  PendingCount,
  PhotoReservationOutcome,
  PublicContributionRow,
  PublicContributionsOverview,
} from "@/lib/adapters/contribution-repository";

/**
 * SERVER ONLY. `SupabaseContributionRepository` appelle des fonctions
 * exécutables par `service_role` seul : il ne fonctionne qu'avec le client
 * service_role (lib/supabase/service-role-client.ts).
 * `SupabaseFamilyContributionReader` utilise au contraire le client de
 * SESSION de la famille (lib/supabase/server-client.ts) : la lecture passe
 * par le privilège colonne par colonne et la politique RLS
 * messages_select_own (M8-E1) ; idempotency_key n'est jamais demandée.
 */

const STATUSES: readonly ContributionStatus[] = ["pending", "published", "hidden", "rejected"];

function rowsOf<T>(data: unknown): T[] {
  return Array.isArray(data) ? (data as T[]) : data ? [data as T] : [];
}

function pick<T extends string>(known: readonly T[], value: unknown, fallback: T): T {
  return known.find((k) => k === value) ?? fallback;
}

function statusOf(value: unknown): ContributionStatus | null {
  return STATUSES.find((s) => s === value) ?? null;
}

interface DepositRow {
  outcome: string;
  contribution_id: string | null;
  contribution_status: string | null;
}

function toDeposit(data: unknown): DepositResult {
  const row = rowsOf<DepositRow>(data)[0];
  const outcome = pick<DepositOutcome>(["published", "pending", "duplicate", "rate_limited", "refused"], row?.outcome, "refused");
  return {
    outcome,
    contributionId: outcome === "refused" || outcome === "rate_limited" ? null : (row?.contribution_id ?? null),
    status: statusOf(row?.contribution_status),
  };
}

function toPublicRows(data: unknown): PublicContributionRow[] {
  const out: PublicContributionRow[] = [];
  for (const row of rowsOf<Record<string, unknown>>(data)) {
    const type = CONTRIBUTION_TYPES.find((t) => t === row.message_type);
    if (!type || typeof row.contribution_id !== "string" || typeof row.author_name !== "string" || typeof row.published_at !== "string") continue;
    const media = row.media as Record<string, unknown> | null;
    if (type === "photo" && (!media || typeof media.storage_path !== "string" || typeof media.media_id !== "string")) continue;
    out.push({
      id: row.contribution_id,
      type: type as ContributionType,
      authorName: row.author_name,
      content: typeof row.content === "string" ? row.content : null,
      caption: typeof row.caption === "string" ? row.caption : null,
      publishedAt: row.published_at,
      media:
        type === "photo" && media
          ? {
              mediaId: media.media_id as string,
              storagePath: media.storage_path as string,
              width: typeof media.width === "number" ? media.width : null,
              height: typeof media.height === "number" ? media.height : null,
              requiresTermRecheck: media.requires_term_recheck !== false,
            }
          : null,
    });
  }
  return out;
}

export class SupabaseContributionRepository implements ContributionRepository {
  constructor(private readonly client: SupabaseClient) {}

  async readPublicOverview(slug: string): Promise<PublicContributionsOverview | null> {
    const { data, error } = await this.client.rpc("read_public_contributions_overview_v1", { p_slug: slug });
    if (error) throw error;
    const row = rowsOf<Record<string, unknown>>(data)[0];
    if (!row) return null;
    const count = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v > 0 ? v : 0);
    const categories = { condolences: row.condolences === true, stories: row.stories === true, photos: row.photos === true };
    return {
      categories,
      published: {
        condolences: categories.condolences ? count(row.published_condolences) : 0,
        stories: categories.stories ? count(row.published_stories) : 0,
        photos: categories.photos ? count(row.published_photos) : 0,
      },
    };
  }

  async findPublicMemorialId(slug: string): Promise<string | null> {
    const { data, error } = await this.client.rpc("read_public_memorial_v1", { p_slug: slug }).select("memorial_id");
    if (error) throw error;
    const id = rowsOf<{ memorial_id: unknown }>(data)[0]?.memorial_id;
    return typeof id === "string" ? id : null;
  }

  async submit(input: { slug: string; type: string; authorName: string; content: string; idempotencyKey: string }): Promise<DepositResult> {
    const { data, error } = await this.client.rpc("submit_contribution_v1", {
      p_slug: input.slug,
      p_message_type: input.type,
      p_author_name: input.authorName,
      p_content: input.content,
      p_idempotency_key: input.idempotencyKey,
    });
    if (error) throw error;
    return toDeposit(data);
  }

  async reservePhoto(input: { slug: string; mediaId: string; storagePath: string; declaredMimeType: string }): Promise<PhotoReservationOutcome> {
    const { data, error } = await this.client.rpc("reserve_contribution_photo_v1", {
      p_slug: input.slug,
      p_media_id: input.mediaId,
      p_storage_path: input.storagePath,
      p_declared_mime_type: input.declaredMimeType,
    });
    if (error) throw error;
    return pick<PhotoReservationOutcome>(["reserved", "rate_limited", "pending_full", "refused"], rowsOf<{ outcome: string }>(data)[0]?.outcome, "refused");
  }

  async finalizePhoto(input: {
    slug: string;
    mediaId: string;
    authorName: string;
    caption: string | null;
    idempotencyKey: string;
    mimeType: string;
    sizeBytes: number;
    width: number;
    height: number;
  }): Promise<DepositResult> {
    const { data, error } = await this.client.rpc("finalize_contribution_photo_v1", {
      p_slug: input.slug,
      p_media_id: input.mediaId,
      p_author_name: input.authorName,
      p_caption: input.caption,
      p_idempotency_key: input.idempotencyKey,
      p_mime_type: input.mimeType,
      p_size_bytes: input.sizeBytes,
      p_width: input.width,
      p_height: input.height,
    });
    if (error) throw error;
    return toDeposit(data);
  }

  async readPublic(input: { slug: string; limit: number; before: { publishedAt: string; id: string } | null; types?: readonly string[] }): Promise<PublicContributionRow[]> {
    const { data, error } = await this.client.rpc("read_public_contributions_v2", {
      p_slug: input.slug,
      p_limit: input.limit,
      p_before_published_at: input.before?.publishedAt ?? null,
      p_before_id: input.before?.id ?? null,
      p_types: input.types && input.types.length > 0 ? [...input.types] : null,
    });
    if (error) throw error;
    return toPublicRows(data);
  }

  async readPublicByIds(input: { slug: string; ids: readonly string[] }): Promise<PublicContributionRow[]> {
    const { data, error } = await this.client.rpc("read_public_contributions_by_ids_v1", { p_slug: input.slug, p_ids: [...input.ids] });
    if (error) throw error;
    return toPublicRows(data);
  }

  async moderate(input: { ownerId: string; contributionId: string; action: string }): Promise<{ outcome: ModerationOutcome; status: ContributionStatus | null }> {
    const { data, error } = await this.client.rpc("moderate_contribution_v1", {
      p_owner_id: input.ownerId,
      p_contribution_id: input.contributionId,
      p_action: input.action,
    });
    if (error) throw error;
    const row = rowsOf<{ outcome: string; contribution_status: string | null }>(data)[0];
    return {
      outcome: pick<ModerationOutcome>(["updated", "unchanged", "invalid_transition", "refused"], row?.outcome, "refused"),
      status: statusOf(row?.contribution_status),
    };
  }

  async remove(input: { ownerId: string; contributionId: string }) {
    const { data, error } = await this.client.rpc("remove_contribution_v1", {
      p_owner_id: input.ownerId,
      p_contribution_id: input.contributionId,
    });
    if (error) throw error;
    const row = rowsOf<{ outcome: string; memorial_id: string | null; cleanup_claim_id: string | null; storage_path: string | null }>(data)[0];
    const outcome = row?.outcome === "removed" ? ("removed" as const) : ("refused" as const);
    return {
      outcome,
      memorialId: outcome === "removed" ? (row?.memorial_id ?? null) : null,
      cleanupClaimId: outcome === "removed" ? (row?.cleanup_claim_id ?? null) : null,
      storagePath: outcome === "removed" ? (row?.storage_path ?? null) : null,
    };
  }

  async countPending(input: { ownerId: string; memorialId: string | null }): Promise<PendingCount[]> {
    const { data, error } = await this.client.rpc("count_pending_contributions_v1", {
      p_owner_id: input.ownerId,
      p_memorial_id: input.memorialId,
    });
    if (error) throw error;
    return rowsOf<{ memorial_id: string; pending_stories: number; pending_photos: number; pending_total: number }>(data).map((r) => ({
      memorialId: r.memorial_id,
      pendingStories: Number(r.pending_stories) || 0,
      pendingPhotos: Number(r.pending_photos) || 0,
      pendingTotal: Number(r.pending_total) || 0,
    }));
  }

  async setCategories(input: { ownerId: string; memorialId: string; features: { condolences: boolean; stories: boolean; photos: boolean }; expectedRevision: number | null }) {
    const { data, error } = await this.client.rpc("set_contribution_categories_v1", {
      p_owner_id: input.ownerId,
      p_memorial_id: input.memorialId,
      p_condolences: input.features.condolences,
      p_stories: input.features.stories,
      p_photos: input.features.photos,
      p_expected_revision: input.expectedRevision,
    });
    if (error) throw error;
    const row = rowsOf<{ outcome: string; draft_revision: number | string | null }>(data)[0];
    return {
      outcome: pick<CategoriesOutcome>(["updated", "unchanged", "stale_revision", "refused"], row?.outcome, "refused"),
      draftRevision: row?.draft_revision === null || row?.draft_revision === undefined ? null : Number(row.draft_revision),
    };
  }

  async readOwnerSettings(input: { ownerId: string; memorialId: string }): Promise<OwnerContributionSettings> {
    const { data, error } = await this.client.rpc("read_owner_contribution_settings_v1", {
      p_owner_id: input.ownerId,
      p_memorial_id: input.memorialId,
    });
    if (error) throw error;
    const row = rowsOf<Record<string, unknown>>(data)[0];
    const outcome = pick<OwnerContributionSettings["outcome"]>(["ok", "corrupted", "refused"], row?.outcome, "refused");
    if (outcome === "refused" || !row) return { outcome: "refused", features: null, firstPublished: null, draftRevision: null, contributionsDigest: null };
    return {
      outcome,
      features: { condolences: row.condolences === true, stories: row.stories === true, photos: row.photos === true },
      firstPublished: row.first_published === true,
      draftRevision: row.draft_revision === null || row.draft_revision === undefined ? null : Number(row.draft_revision),
      contributionsDigest: row.contributions_digest === true,
    };
  }

  async setDigestPreference(input: { ownerId: string; enabled: boolean }): Promise<boolean> {
    const { data, error } = await this.client.rpc("set_contributions_digest_preference_v1", {
      p_owner_id: input.ownerId,
      p_enabled: input.enabled,
    });
    if (error) throw error;
    return rowsOf<{ contributions_digest: boolean }>(data)[0]?.contributions_digest === true;
  }
}

const FAMILY_COLUMNS = "id, message_type, status, author_name, content, caption, media_id, created_at, published_at, moderated_at";

export class SupabaseFamilyContributionReader implements FamilyContributionReader {
  constructor(private readonly sessionClient: SupabaseClient) {}

  async list(input: { memorialId: string; status: ContributionStatus | null; limit: number; beforeCreatedAt: string | null; beforeId?: string | null }): Promise<FamilyContributionRow[]> {
    let query = this.sessionClient.from("messages").select(FAMILY_COLUMNS).eq("memorial_id", input.memorialId);
    if (input.status !== null) query = query.eq("status", input.status);
    if (input.beforeCreatedAt !== null) {
      // Valeurs déjà validées par le service (date ISO, uuid) ; la date est
      // citée car elle contient « : » et « . », réservés par PostgREST.
      const ts = `"${input.beforeCreatedAt}"`;
      query = input.beforeId ? query.or(`created_at.lt.${ts},and(created_at.eq.${ts},id.lt.${input.beforeId})`) : query.lt("created_at", input.beforeCreatedAt);
    }
    const { data, error } = await query.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(input.limit);
    if (error) throw error;
    const out: FamilyContributionRow[] = [];
    for (const r of rowsOf<Record<string, unknown>>(data)) {
      const type = ([...CONTRIBUTION_TYPES, "memory_message"] as const).find((t) => t === r.message_type);
      const status = statusOf(r.status);
      if (!type || !status || typeof r.id !== "string" || typeof r.author_name !== "string" || typeof r.created_at !== "string") continue;
      out.push({
        id: r.id,
        type,
        status,
        authorName: r.author_name,
        content: typeof r.content === "string" ? r.content : null,
        caption: typeof r.caption === "string" ? r.caption : null,
        mediaId: typeof r.media_id === "string" ? r.media_id : null,
        createdAt: r.created_at,
        publishedAt: typeof r.published_at === "string" ? r.published_at : null,
        moderatedAt: typeof r.moderated_at === "string" ? r.moderated_at : null,
      });
    }
    return out;
  }
}
