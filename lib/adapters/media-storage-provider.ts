/**
 * Media (photo) storage contract — Mission 001, RESHAPED by Mission 030.
 *
 * ## What changed, and why it had to
 *
 * This port used to read:
 *
 *     getPublicUrl(mediaId: string): Promise<string>
 *
 * and its only implementation called Supabase Storage's
 * `getPublicUrl()`, which returns an unsigned, permanent URL that works
 * only if the bucket is PUBLIC. Nothing had ever called it — Mission
 * 002 shipped it against a bucket that did not exist yet — so the
 * assumption was never exercised, but it was an assumption that a
 * family's original photographs would be world-readable.
 *
 * Mission 030 settled the opposite: the bucket is private, and there is
 * no permanent URL for an original at all (mission brief, section 5).
 * A usable URL is a short-lived signed one, minted per read, never
 * stored. Renaming the method is the point — a port called
 * `getPublicUrl` invites exactly the implementation that must not
 * exist.
 *
 * ## Why this port still exists alongside MediaObjectStore
 *
 * Two different jobs. `MediaObjectStore`
 * (lib/adapters/media-object-store.ts) is the low-level object
 * contract the lifecycle primitives are built from — paths, tokens,
 * bytes, prefixes. This is the one-line convenience a RENDERING caller
 * wants: "give me something I can put in a src attribute for this
 * media id".
 *
 * Note what it does NOT do: it performs no ownership check, because it
 * takes a media id and no actor. It is therefore not an authorization
 * boundary and must never be used as one — a caller reaches it only
 * after lib/media/read-media.ts has proven access. For anything
 * user-facing, use `createMediaReadUrl` instead, which takes an actor
 * and proves ownership.
 */
export interface MediaStorageProvider {
  /**
   * A short-lived, signed URL for reading one media's original.
   *
   * Expires. Never persisted anywhere — resolving an internal media id
   * to a URL happens at render time, from the `storage_path` recorded
   * in the `media` table, and the result is allowed to die (see the
   * portability rule in supabase/README.md).
   */
  createReadUrl(mediaId: string): Promise<string>;
}
