/**
 * QG 016 / M4 — « Voir mon hommage »: is a memorial publicly consultable
 * right now, as the public page `/hommage/[slug]` would answer?
 *
 * A strict TypeScript MIRROR of the SQL rule `memorial_publicly_visible_v1`
 * (supabase/migrations/20261031120000_qg008_free_offer_v8_alignment.sql),
 * the very rule `read_public_memorial_v1` (QG 016 / M1) applies:
 *
 *   status = 'published'
 *   AND (access_level = 'complet'
 *        OR (access_level = 'avis'
 *            AND free_public_until IS NOT NULL
 *            AND now < free_public_until))
 *
 * Why a mirror: that SQL function is revoked from `authenticated` (only the
 * service role reaches it, through M1), and the owner space must keep
 * reading through the session-scoped client under RLS. If the SQL rule ever
 * changes, this function must change with it.
 *
 * It only decides whether a LINK is shown. The public page still asks M1,
 * which stays the single authority: a link shown a few instants too long
 * around a deadline (application clock vs database clock) leads to the same
 * neutral 404, never to content.
 *
 * Pure: no I/O, no clock of its own — `now` is always a parameter. Fails
 * closed: an unknown status or access level, a missing or unreadable
 * deadline, all read as "not consultable".
 */

/** The memorial columns the rule reads, exactly as PostgREST returns them. */
export interface PublicVisibilityColumns {
  status: unknown;
  accessLevel: unknown;
  freePublicUntil: unknown;
}

/**
 * A timestamptz as PostgREST serializes it (e.g.
 * `2026-11-12T20:10:25.681174+00:00`): full date and time, an explicit
 * offset or `Z`. Anything looser is refused rather than left to the
 * lenient `Date` parser.
 */
const TIMESTAMPTZ_PATTERN = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}(:?\d{2})?)$/;

function instant(value: unknown): number | null {
  if (typeof value !== "string" || !TIMESTAMPTZ_PATTERN.test(value)) return null;
  // One ISO 8601 spelling for the `Date` parser: `T` separator, `±HH:MM` offset.
  const iso = value
    .replace(" ", "T")
    .replace(/([+-]\d{2})$/, "$1:00")
    .replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  const time = new Date(iso).getTime();
  return Number.isNaN(time) ? null : time;
}

export function isMemorialPubliclyVisible(columns: PublicVisibilityColumns, now: Date): boolean {
  if (columns.status !== "published") return false;
  if (columns.accessLevel === "complet") return true;
  if (columns.accessLevel !== "avis") return false;
  const until = instant(columns.freePublicUntil);
  const at = now.getTime();
  if (until === null || Number.isNaN(at)) return false;
  return at < until;
}
