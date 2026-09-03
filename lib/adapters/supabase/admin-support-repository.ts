import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminSupportRepository } from "@/lib/adapters/admin-support-repository";
import type { Owner } from "@/types/owner";
import type { Entitlement } from "@/types/entitlement";
import type { MemorialSupportSummary } from "@/types/admin-support";
import type { EntitlementSource, EntitlementStatus } from "@/config/entitlements";
import type { OfferId } from "@/config/offers";
import type { EditorialContext, MemorialType } from "@/config/memorial";
import type { Language } from "@/config/languages";
import type { Skin } from "@/config/skins";
import type { MemorialStatus } from "@/types/memorial";
import { SupabaseOwnerRepository } from "./owner-repository";
import { ENTITLEMENT_COLUMNS } from "./entitlement-repository";

/**
 * SERVER ONLY. Mission 015A — the reads behind HERITAGE staff support.
 *
 * Uses the service-role client. Since Mission 013C the client roles hold
 * no privilege on these tables, and `service_role` holds exactly
 * `SELECT` on `owners`, `entitlements` and `memorials` — which is all
 * this class needs and all it does. **No privilege model change was
 * required for Mission 015A.**
 *
 * Reading with a role that bypasses RLS is only acceptable because of
 * what this class cannot do:
 *
 *   * every query names its columns explicitly. `select("*")` is never
 *     used, so `entitlements.activation_key_hash` is not merely hidden
 *     from the UI — it never leaves PostgreSQL, and cannot end up in a
 *     log, an error, or a serialised server payload;
 *   * memorials are read as a summary. No draft content, no published
 *     snapshot, no media, no messages;
 *   * there is not one write method in the file.
 *
 * Never import this from a Client Component — lib/entitlement/server-only-boundary.test.ts
 * enforces that.
 */

interface OwnerRow {
  id: string;
  auth_user_id: string | null;
  email: string;
  created_at: string;
  updated_at: string;
}

interface EntitlementRow {
  id: string;
  source: EntitlementSource;
  external_order_id: string | null;
  offer_id: OfferId;
  status: EntitlementStatus;
  owner_id: string | null;
  created_at: string;
  redeemed_at: string | null;
  updated_at: string;
}

interface MemorialSummaryRow {
  id: string;
  owner_id: string;
  entitlement_id: string;
  memorial_type: MemorialType;
  editorial_context: EditorialContext | null;
  skin_id: Skin;
  language: Language | null;
  status: MemorialStatus;
  slug: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * The memorial columns support may see. `content` is absent from both
 * this list and the two content tables it would have to join — a family's
 * words are not support material.
 */
const MEMORIAL_SUMMARY_COLUMNS =
  "id, owner_id, entitlement_id, memorial_type, editorial_context, skin_id, language, status, slug, created_at, updated_at";

const OWNER_COLUMNS = "id, auth_user_id, email, created_at, updated_at";

function toOwner(row: OwnerRow): Owner {
  return {
    id: row.id,
    authUserId: row.auth_user_id,
    email: row.email,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toEntitlement(row: EntitlementRow): Entitlement {
  return {
    id: row.id,
    source: row.source,
    externalOrderId: row.external_order_id,
    offerId: row.offer_id,
    status: row.status,
    ownerId: row.owner_id,
    createdAt: row.created_at,
    redeemedAt: row.redeemed_at,
    updatedAt: row.updated_at,
  };
}

function toMemorialSummary(row: MemorialSummaryRow): MemorialSupportSummary {
  return {
    id: row.id,
    ownerId: row.owner_id,
    entitlementId: row.entitlement_id,
    memorialType: row.memorial_type,
    editorialContext: row.editorial_context,
    skin: row.skin_id,
    language: row.language,
    status: row.status,
    slug: row.slug,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SupabaseAdminSupportRepository implements AdminSupportRepository {
  /**
   * Email lookup is delegated rather than reimplemented. Mission 011B
   * hardened `SupabaseOwnerRepository.findByEmail` after a real defect
   * (`.ilike` letting `%` act as a wildcard at an identity boundary),
   * including a defence-in-depth exactness re-check. A second
   * implementation here would be a second place for that lesson to be
   * forgotten.
   */
  private readonly owners: SupabaseOwnerRepository;

  constructor(private readonly client: SupabaseClient) {
    this.owners = new SupabaseOwnerRepository(client);
  }

  async findOwnerById(ownerId: string): Promise<Owner | null> {
    const { data, error } = await this.client
      .from("owners")
      .select(OWNER_COLUMNS)
      .eq("id", ownerId)
      .maybeSingle<OwnerRow>();

    // Rethrown, never turned into `null`: a failed read is not a proof
    // that the record does not exist, and support acting on "no such
    // owner" when the truth was "the database was unreachable" is how a
    // real account gets treated as a phantom.
    if (error) throw error;
    return data ? toOwner(data) : null;
  }

  findOwnerByEmail(email: string): Promise<Owner | null> {
    return this.owners.findByEmail(email);
  }

  async findEntitlementById(entitlementId: string): Promise<Entitlement | null> {
    const { data, error } = await this.client
      .from("entitlements")
      .select(ENTITLEMENT_COLUMNS)
      .eq("id", entitlementId)
      .maybeSingle<EntitlementRow>();

    if (error) throw error;
    return data ? toEntitlement(data) : null;
  }

  async findEntitlementsByOwnerId(ownerId: string): Promise<Entitlement[]> {
    const { data, error } = await this.client
      .from("entitlements")
      .select(ENTITLEMENT_COLUMNS)
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: true })
      .returns<EntitlementRow[]>();

    if (error) throw error;
    return (data ?? []).map(toEntitlement);
  }

  async findMemorialSummaryById(memorialId: string): Promise<MemorialSupportSummary | null> {
    const { data, error } = await this.client
      .from("memorials")
      .select(MEMORIAL_SUMMARY_COLUMNS)
      .eq("id", memorialId)
      .maybeSingle<MemorialSummaryRow>();

    if (error) throw error;
    return data ? toMemorialSummary(data) : null;
  }

  async findMemorialSummaryByEntitlementId(
    entitlementId: string,
  ): Promise<MemorialSupportSummary | null> {
    // `memorials.entitlement_id` is UNIQUE, so `maybeSingle` is exact
    // rather than a "first match": at most one memorial can ever exist
    // for a right. The association comes from that real relation and
    // nothing else.
    const { data, error } = await this.client
      .from("memorials")
      .select(MEMORIAL_SUMMARY_COLUMNS)
      .eq("entitlement_id", entitlementId)
      .maybeSingle<MemorialSummaryRow>();

    if (error) throw error;
    return data ? toMemorialSummary(data) : null;
  }
}
