import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  OwnedMemorialListRepository,
  OwnedMemorialSummary,
} from "@/lib/adapters/owned-memorial-list-repository";
import { isPublicSlugShape } from "@/lib/memorial/public/read-public-memorial";
import { isMemorialPubliclyVisible } from "@/lib/memorial/public/public-visibility";

interface MemorialListRow {
  id: string;
  created_at: string;
  status: unknown;
  slug: unknown;
  access_level: unknown;
  free_public_until: unknown;
  first_published_at?: unknown;
  free_publish_until?: unknown;
  free_draft_until?: unknown;
}

/** QG 016 / M4 — `memorials` columns this list reads. The last ones are
 * existing columns of the Owner's OWN rows, already readable by
 * `authenticated` (table-level SELECT, 20260905160000_builder_owner_access.sql)
 * under `memorials_select_own`: no new grant, policy or function.
 * QG 004-B adds the free deadlines (same table, same rows). */
const MEMORIAL_LIST_COLUMNS =
  "id, created_at, status, slug, access_level, free_public_until, first_published_at, free_publish_until, free_draft_until";

/** QG 004-B — the free deadlines still ahead, for a never-published « avis ». */
function freeDeadlinesOf(row: MemorialListRow, now: Date): OwnedMemorialSummary["freeDeadlines"] {
  if (row.access_level !== "avis" || row.first_published_at != null) return null;
  const ahead = (value: unknown) =>
    typeof value === "string" && !Number.isNaN(Date.parse(value)) && Date.parse(value) > now.getTime() ? value : null;
  const publishUntil = ahead(row.free_publish_until);
  const draftUntil = ahead(row.free_draft_until);
  return publishUntil === null && draftUntil === null ? null : { publishUntil, draftUntil };
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
 * QG 016 / M4 — the slug to link to, only while the public page would
 * answer: publicly visible (mirror of `memorial_publicly_visible_v1`) AND
 * a slug of the shape publication produces. Fails closed.
 */
function publicSlugOf(row: MemorialListRow, now: Date): string | null {
  const visible = isMemorialPubliclyVisible(
    { status: row.status, accessLevel: row.access_level, freePublicUntil: row.free_public_until },
    now,
  );
  return visible && isPublicSlugShape(row.slug) ? row.slug : null;
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
 *   1. `memorials` — `id, created_at`, plus (QG 016 / M4) `status, slug,
 *      access_level, free_public_until` to decide the « Voir mon hommage »
 *      link — filtered by the server-resolved `owner_id` AND by RLS
 *      (`owner_id = current_owner_id()`): two independent locks on the
 *      same fact. The four extra columns never leave this class: only
 *      `publicSlug` (or `null`) does.
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
  /** `now` is injectable for tests only; the owner space uses the real clock. */
  constructor(
    private readonly client: SupabaseClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async listOwnedMemorials(ownerId: string): Promise<OwnedMemorialSummary[]> {
    const { data, error } = await this.client
      .from("memorials")
      .select(MEMORIAL_LIST_COLUMNS)
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

    const now = this.now();
    return rows.map((row) => ({
      id: row.id,
      displayName: names.get(row.id) ?? null,
      createdAt: row.created_at,
      publicSlug: publicSlugOf(row, now),
      freeDeadlines: freeDeadlinesOf(row, now),
    }));
  }
}
