import type { MediaPurpose, MediaStatus } from "@/config/media";
import type { Media } from "@/types/media";

/**
 * Mission 030 — the `media` table's contract.
 *
 * SERVER ONLY, in every implementation. `authenticated` holds no
 * privilege whatsoever on `media` (Mission 013C, unchanged by Mission
 * 030), so there is no such thing as a browser-side implementation of
 * this port. See lib/adapters/supabase/media-repository.ts for why that
 * is the chosen model rather than an accident.
 *
 * ## Every method takes a memorial id, and that is the design
 *
 * Not one method here can be called without naming the memorial it
 * acts within, and each implementation must filter on it. That makes
 * the ownership check upstream (lib/auth/memorial-access.ts) load
 * bearing rather than decorative: a caller that verified access to
 * memorial A physically cannot use the result to touch memorial B's
 * rows, because there is no method that would let it.
 *
 * `findById` is the one to look at twice — it takes BOTH ids and
 * returns `null` for a media that exists but belongs to another
 * memorial. That is the difference between an authorization check and a
 * lookup that merely happens to be preceded by one.
 */
export interface MediaRepository {
  /**
   * Insert a `pending` row: a reserved path and nothing verified yet.
   *
   * The row is written BEFORE any upload permission is issued, so a
   * reserved path is never a path the database has no record of. That
   * ordering is the whole anti-orphan strategy (see
   * lib/media/orphan-sweep.ts) and it is not an implementation detail
   * of any one adapter.
   */
  createPending(input: {
    memorialId: string;
    ownerId: string;
    mediaId: string;
    storagePath: string;
    purpose: MediaPurpose;
    declaredMimeType: string;
  }): Promise<Media>;

  /**
   * Flip a `pending` row to `ready`, recording what the bytes actually
   * turned out to be.
   *
   * Implementations MUST make this conditional on the row still being
   * `pending`, and return `null` when it is not. That makes it a
   * compare-and-set rather than a blind update: two finalizations
   * racing the same reservation produce one winner, and a finalization
   * racing the sweep cannot resurrect a row the sweep already claimed.
   */
  markReady(input: {
    memorialId: string;
    mediaId: string;
    mimeType: string;
    sizeBytes: number;
  }): Promise<Media | null>;

  /**
   * The media, or `null` when it does not exist OR belongs to a
   * different memorial. One answer for both, for the same
   * anti-oracle reason as lib/auth/memorial-access.ts.
   */
  findById(input: { memorialId: string; mediaId: string }): Promise<Media | null>;

  /** Every media of one memorial, optionally narrowed to one purpose. */
  listForMemorial(input: {
    memorialId: string;
    purpose?: MediaPurpose;
    status?: MediaStatus;
  }): Promise<Media[]>;

  /**
   * Remove the row. Idempotent: deleting an already-deleted media is a
   * success, not an error, and reports `false` for "there was nothing
   * to delete".
   */
  deleteById(input: { memorialId: string; mediaId: string }): Promise<boolean>;

  /**
   * Reservations that were never finalized and are now older than the
   * cutoff — the sweep's input.
   *
   * Scoped by time, not by memorial: this is the one maintenance read
   * that legitimately spans families, and it returns only `pending`
   * rows, which by definition hold no usable family content.
   */
  findExpiredPending(input: { olderThan: Date; limit: number }): Promise<Media[]>;
}
