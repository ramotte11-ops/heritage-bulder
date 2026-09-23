import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  OwnedMemorialListRepository,
  OwnedMemorialSummary,
} from "@/lib/adapters/owned-memorial-list-repository";

interface MemorialListRow {
  id: string;
  created_at: string;
}

interface DraftNameRow {
  memorial_id: string;
  display_name: unknown;
}

/** Long enough for any real name; a label, never a layout risk. */
const MAX_LABEL_LENGTH = 120;

function toLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  return trimmed.length > MAX_LABEL_LENGTH ? `${trimmed.slice(0, MAX_LABEL_LENGTH)}…` : trimmed;
}

/**
 * Builder continuity mission. Must be constructed with the SESSION-scoped
 * client (lib/supabase/server-client.ts's `createServerSupabaseClient()`),
 * never the service-role one — exactly like `SupabaseDraftRepository`.
 *
 * Two reads, both already covered by the privileges and policies the
 * Builder itself relies on (supabase/migrations/20260905160000_builder_owner_access.sql:
 * `SELECT memorials`, `SELECT memorial_drafts` for `authenticated`;
 * `memorials_select_own` / `memorial_drafts_select_own`, Mission 002).
 * No new grant, no new policy, no migration:
 *
 *   1. `memorials` — `id, created_at` only, filtered by the server-
 *      resolved `owner_id` AND by RLS (`owner_id = current_owner_id()`):
 *      two independent locks on the same fact.
 *   2. `memorial_drafts` — the Hero's `displayName` only, extracted
 *      server-side by PostgREST (`content->hero->>displayName`), never
 *      the draft content itself.
 *
 * The name is a convenience label. If that second read fails, the list
 * is still returned (names `null`) and the failure is logged: the family
 * must still be able to reach their memorial. The first read failing
 * rejects — see the port.
 */
export class SupabaseOwnedMemorialListRepository implements OwnedMemorialListRepository {
  constructor(private readonly client: SupabaseClient) {}

  async listOwnedMemorials(ownerId: string): Promise<OwnedMemorialSummary[]> {
    const { data, error } = await this.client
      .from("memorials")
      .select("id, created_at")
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: true })
      .returns<MemorialListRow[]>();

    if (error) throw error;
    const rows = data ?? [];
    if (rows.length === 0) return [];

    const names = new Map<string, string | null>();
    const { data: drafts, error: draftError } = await this.client
      .from("memorial_drafts")
      .select("memorial_id, display_name:content->hero->>displayName")
      .in(
        "memorial_id",
        rows.map((row) => row.id),
      )
      .returns<DraftNameRow[]>();

    if (draftError) {
      console.error(
        "Owned memorial names unavailable:",
        draftError instanceof Error ? draftError.message : draftError,
      );
    } else {
      for (const draft of drafts ?? []) {
        names.set(draft.memorial_id, toLabel(draft.display_name));
      }
    }

    return rows.map((row) => ({
      id: row.id,
      displayName: names.get(row.id) ?? null,
      createdAt: row.created_at,
    }));
  }
}
