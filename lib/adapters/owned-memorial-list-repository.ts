/**
 * Builder continuity mission — the narrowest contract for the one
 * question the owner space (/owner) asks: "which memorials does this
 * Owner have, so they can reopen their Builder without knowing a UUID?"
 *
 * A separate port on purpose. `MemorialConfigRepository` deliberately
 * has no listing method (see its own docstring): which memorial is
 * opened is decided upstream, and whether it may be opened is decided by
 * `authorizeMemorialAccess`. This port is that "upstream" — it only
 * offers links; every link still goes through the Builder route's own
 * per-request authorization, unchanged.
 *
 * Returns a list, never "the" memorial: V1 sells 1 purchase = 1
 * memorial, but an Owner may hold several over time, and nothing here
 * assumes otherwise.
 */
export interface OwnedMemorialSummary {
  id: string;
  /** The Hero's display name (T03) when one has been entered — a label
   * only, `null` until then. Never used for any decision. */
  displayName: string | null;
  createdAt: string; // ISO 8601
  /** QG 016 / M4 — the public slug, ONLY while the memorial is publicly
   * consultable (`isMemorialPubliclyVisible`, the mirror of
   * `memorial_publicly_visible_v1`) and the slug has the only shape
   * publication produces (`isPublicSlugShape`). `null` otherwise: a draft,
   * an expired free notice, an `editing` or `archived` memorial, any
   * unreadable column. Drives the « Voir mon hommage » link only. */
  publicSlug: string | null;
  /** QG 004-B — the free offer's own deadlines, for a discreet reminder:
   * only for a free (« avis ») memorial never published yet, and only the
   * deadlines still ahead. `null` otherwise. Display only — the database
   * alone decides (free_publish_until, free_draft_until). */
  freeDeadlines?: { publishUntil: string | null; draftUntil: string | null } | null;
}

export interface OwnedMemorialListRepository {
  /**
   * The memorials owned by `ownerId`, oldest first.
   *
   * `ownerId` must be the Owner the SERVER resolved from the validated
   * session (`getHeritageActor` → `requireOwner`), never a value from
   * the request. Implementations must additionally run under that same
   * session's row-level security, so a wrong `ownerId` can only ever
   * narrow the result, never widen it.
   *
   * A genuine repository failure rejects — an empty list means "no
   * memorial", never "the read failed".
   */
  listOwnedMemorials(ownerId: string): Promise<OwnedMemorialSummary[]>;
}
