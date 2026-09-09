/**
 * Mission 030 — the object storage contract.
 *
 * Kept separate from `MediaRepository` because these are two different
 * systems with two different failure modes, and the whole lifecycle
 * design turns on the fact that they cannot be committed together (see
 * lib/media/delete-media.ts). Merging them into one "media store" would
 * hide exactly the seam that has to be reasoned about.
 *
 * SERVER ONLY. Every implementation needs a credential that must never
 * reach a browser.
 */
export interface MediaObjectStore {
  /**
   * A permission to write ONE named object, and nothing else.
   *
   * This is the security property the whole upload model rests on
   * (mission brief, section 10): what the browser receives authorizes
   * `path` alone. It is not a session, not a bucket credential, and it
   * cannot be pointed at another object, another memorial or another
   * family. It also expires.
   *
   * Implementations MUST NOT enable overwrite. A permission that could
   * replace an existing object would let a second reservation for the
   * same path — or a replayed one — destroy bytes that are already
   * finalized and in use.
   *
   * ## Why there is no `expiresInSeconds` here
   *
   * There was, in an earlier draft of this port, and it was removed
   * once the real API was checked rather than assumed: Supabase
   * Storage's `createSignedUploadUrl` accepts no expiry argument. The
   * token's lifetime is decided by the Storage service, not by the
   * caller. Keeping the parameter would have meant a port that looks
   * configurable and an adapter that silently ignores it — a lie in the
   * type system about a security property, which is worse than the
   * limitation itself.
   *
   * So the expiry of this permission is NOT a HERITAGE guarantee, and
   * nothing in this foundation depends on it being short. What IS a
   * HERITAGE guarantee is everything the permission is bounded by: one
   * path, chosen by us; no overwrite; a path already recorded as a
   * `pending` row; and a reservation the sweep reclaims after
   * PENDING_MEDIA_TTL_MS whether or not the token still works. A
   * permission that outlives its reservation can only write an object
   * that is about to be deleted, into a media nothing will ever
   * finalize.
   */
  createUploadPermission(input: { path: string }): Promise<{ url: string; token: string }>;

  /**
   * A short-lived URL for READING one private object.
   *
   * Signed and expiring, because the bucket is private and there is no
   * other way to read it. Never persisted anywhere — minted per render
   * and allowed to die. See the storage_path rule in
   * supabase/README.md.
   */
  createReadUrl(input: { path: string; expiresInSeconds: number }): Promise<string>;

  /**
   * The stored object's size, or `null` if there is no object at
   * `path`.
   *
   * `null` is how finalization learns that a reservation was never
   * actually uploaded — the `upload_incomplete` case.
   */
  statObject(input: { path: string }): Promise<{ sizeBytes: number } | null>;

  /**
   * The first `byteCount` bytes of the stored object.
   *
   * A prefix rather than the whole file because the only thing
   * finalization needs from the content is its signature (16 bytes),
   * and downloading 15 MiB through a server to inspect 16 of them
   * would be a self-inflicted bandwidth and latency cost on every
   * upload.
   *
   * Returns `null` when the object does not exist.
   */
  readObjectHead(input: { path: string; byteCount: number }): Promise<Uint8Array | null>;

  /**
   * Remove every object under `prefix`. Idempotent — removing nothing
   * is a success.
   *
   * A prefix rather than a path so that a media's future derivatives
   * (Missions 033/047) are removed with it automatically, and cannot
   * survive the row that referenced them.
   */
  removeByPrefix(input: { prefix: string }): Promise<void>;
}
