import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  FamilyOffering,
  FamilyOfferingCounts,
  FamilyOfferingPage,
  FamilySpaceRepository,
  FamilyTributeDetails,
} from "@/lib/adapters/family-space-repository";
import { OFFERING_KINDS, type OfferingKind } from "@/config/symbolic-offerings-v1-tokens";
import { parseHeroContent } from "@/lib/memorial/hero";
import type { MemorialStatus } from "@/types/memorial";

const MEMORIAL_STATUSES: readonly MemorialStatus[] = ["draft", "ready", "published", "editing", "archived"];

interface StatusRow {
  id: string;
  status: unknown;
}

interface DraftHeroRow {
  memorial_id: string;
  hero: unknown;
}

interface OfferingRow {
  id: string;
  kind: unknown;
  created_at: string;
  signature: unknown;
}

function statusOf(value: unknown): MemorialStatus | null {
  return typeof value === "string" && (MEMORIAL_STATUSES as readonly string[]).includes(value)
    ? (value as MemorialStatus)
    : null;
}

function isOfferingKind(value: unknown): value is OfferingKind {
  return typeof value === "string" && (OFFERING_KINDS as readonly string[]).includes(value);
}

/**
 * Espace famille (Lot 1). Must be constructed with the SESSION-scoped
 * client (`createServerSupabaseClient()`), never the service-role one —
 * exactly like `SupabaseOwnedMemorialListRepository`.
 *
 * Every read is already covered by existing privileges and policies; no
 * grant, policy, function or migration is added:
 *   - `memorials` (`id, status`) and `memorial_drafts` (the `hero` object
 *     only, extracted server-side by PostgREST): `SELECT` for
 *     `authenticated` under `memorials_select_own` /
 *     `memorial_drafts_select_own` (20260905160000_builder_owner_access.sql);
 *   - `symbolic_offerings` (`id, kind, created_at`): `SELECT` for
 *     `authenticated` under `symbolic_offerings_select_own`
 *     (20261023160000_symbolic_offerings_v1.sql).
 *
 * The Hero facts are a display convenience: if that read fails the
 * statuses are still returned (no years, no photo) and the failure is
 * logged, like the name read of the owned-memorial list.
 */
export class SupabaseFamilySpaceRepository implements FamilySpaceRepository {
  constructor(private readonly client: SupabaseClient) {}

  async listTributeDetails(ownerId: string): Promise<Map<string, FamilyTributeDetails>> {
    const { data, error } = await this.client
      .from("memorials")
      .select("id, status")
      .eq("owner_id", ownerId)
      .returns<StatusRow[]>();

    if (error) throw error;

    const details = new Map<string, FamilyTributeDetails>();
    for (const row of data ?? []) {
      details.set(row.id, { memorialId: row.id, status: statusOf(row.status), birth: null, death: null, photo: null });
    }
    if (details.size === 0) return details;

    const { data: drafts, error: draftError } = await this.client
      .from("memorial_drafts")
      .select("memorial_id, hero:content->hero")
      .in("memorial_id", [...details.keys()])
      .returns<DraftHeroRow[]>();

    if (draftError) {
      console.error(
        "Family space: Hero facts unavailable:",
        draftError instanceof Error ? draftError.message : draftError,
      );
      return details;
    }

    for (const draft of drafts ?? []) {
      const entry = details.get(draft.memorial_id);
      if (!entry) continue;
      const parsed = parseHeroContent(draft.hero);
      if (!parsed.ok) continue;
      entry.birth = parsed.hero.birth;
      entry.death = parsed.hero.death;
      entry.photo = parsed.hero.photo;
    }
    return details;
  }

  async countOfferings(memorialId: string): Promise<FamilyOfferingCounts> {
    const counts = await Promise.all(
      OFFERING_KINDS.map(async (kind) => {
        const { count, error } = await this.client
          .from("symbolic_offerings")
          .select("id", { count: "exact", head: true })
          .eq("memorial_id", memorialId)
          .eq("kind", kind);
        if (error) throw error;
        return [kind, count ?? 0] as const;
      }),
    );
    return Object.fromEntries(counts) as Record<OfferingKind, number>;
  }

  async listOfferings(memorialId: string, range: { offset: number; limit: number }): Promise<FamilyOfferingPage> {
    // One extra row tells whether older gestures exist, without a count.
    const { data, error } = await this.client
      .from("symbolic_offerings")
      .select("id, kind, created_at, signature")
      .eq("memorial_id", memorialId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(range.offset, range.offset + range.limit)
      .returns<OfferingRow[]>();

    if (error) throw error;

    const offerings: FamilyOffering[] = [];
    for (const row of data ?? []) {
      if (isOfferingKind(row.kind)) {
        // Lot 2: column-level grant, RLS `symbolic_offerings_select_own` — never the idempotency key.
        const signature = typeof row.signature === "string" && row.signature.trim() !== "" ? row.signature : null;
        offerings.push({ id: row.id, kind: row.kind, createdAt: row.created_at, signature });
      }
    }
    return {
      offerings: offerings.slice(0, range.limit),
      hasMore: (data ?? []).length > range.limit,
    };
  }
}
