/**
 * Media (photo) configuration — Mission 030.
 *
 * This file is the single source of truth shared by three things that
 * MUST agree, and which live in three different languages:
 *
 *   1. the `media` table's CHECK constraints and the Storage bucket
 *      definition (supabase/migrations/20260909120000_media_storage.sql);
 *   2. the TypeScript validation layer (lib/media/);
 *   3. the local DB harness (scripts/db/test-local.sh).
 *
 * A value that drifts between them is a security hole, not a style
 * problem — the bucket would accept what the domain rejects, or the
 * other way round. Every constant below is asserted against the
 * migration by config/media.test.ts.
 */

/**
 * Mirrors the `media_type` CHECK constraint. Still exactly one value:
 * Mission 030 is an IMAGE foundation and deliberately admits no video
 * (see the mission brief, section 21). Widening this array is a
 * decision that has to be made with a transcoding/lifecycle story, not
 * a convenience.
 */
export const MEDIA_TYPES = ["photo"] as const;

export type MediaType = (typeof MEDIA_TYPES)[number];

/**
 * What a media is FOR. Mirrors the `purpose` CHECK constraint.
 *
 * This exists so Hero and Gallery can share one engine instead of
 * growing a `HeroStorage` and a `GalleryStorage` (mission brief,
 * section 15). It is a label on a row — it changes nothing about how
 * the file is stored, pathed, authorized or validated. If it ever
 * starts branching the security logic, that is a bug.
 *
 * Mission 030 builds NEITHER the Hero screen nor the Gallery screen
 * (sections 16-17); it only makes sure neither will need its own
 * storage foundation.
 */
export const MEDIA_PURPOSES = ["hero", "gallery"] as const;

export type MediaPurpose = (typeof MEDIA_PURPOSES)[number];

/**
 * Lifecycle state. Mirrors the `status` CHECK constraint.
 *
 *   pending  a path has been reserved and an upload permission issued,
 *            but no verified bytes exist yet. NOTHING may display a
 *            pending media.
 *   ready    the object exists, and the server has verified its size
 *            and its actual content type. Usable.
 *
 * There is no `failed` state on purpose: a failed upload leaves a
 * `pending` row that the sweep reclaims (lib/media/orphan-sweep.ts). A
 * third state would be a second thing to reconcile for no gain.
 */
export const MEDIA_STATUSES = ["pending", "ready"] as const;

export type MediaStatus = (typeof MEDIA_STATUSES)[number];

/**
 * The ONE bucket. Private, and shared by every purpose and every
 * family (mission brief, sections 5-6).
 *
 * One bucket rather than one per family or per feature because a bucket
 * is not a security boundary here: isolation comes from the path being
 * server-generated under a memorial id, from ownership being verified
 * before any path is ever handed out, and from no client role holding
 * any policy on `storage.objects` at all. A bucket per family would
 * multiply objects to manage without adding a single guarantee.
 */
export const MEDIA_BUCKET = "memorial-media";

/**
 * The image allowlist. Conservative on purpose (mission brief,
 * section 8): three formats every browser both produces and renders,
 * all three of which we can verify from their actual bytes with
 * `node:buffer` alone — no image library, no new dependency.
 *
 * Deliberately absent:
 *
 *   * image/svg+xml — an SVG is a script host. Never, in a family
 *     media foundation.
 *   * image/heic, image/heif — an iPhone's default format, so this is
 *     the tempting one. It is NOT here because nothing in this runtime
 *     can decode it: Node has no HEIC decoder, `next/image`'s optimizer
 *     does not accept it, and no browser but Safari renders it. We
 *     could sniff the `ftyp` box and call it validated, and then serve
 *     a file most of our visitors would see as a broken image. Real
 *     support means a decode/normalize step (Mission 047's territory)
 *     plus a dependency, so it is escalated to the QG rather than
 *     improvised here. Practical note: iOS Safari converts HEIC to
 *     JPEG on `<input type="file">` upload, so this allowlist does not
 *     actually lock iPhone owners out today.
 *   * image/avif, image/gif — same rule, no assumption. AVIF is an
 *     output format for Mission 047 to produce, not an input we must
 *     accept; GIF means animation, which is a different lifecycle.
 */
export const ALLOWED_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type AllowedImageMimeType = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];

/**
 * The ONE extension HERITAGE writes for each accepted type.
 *
 * This is a mapping FROM the verified type TO an extension, and never
 * the reverse: the extension in an object path is derived from what the
 * bytes turned out to be, so a browser sending `evil.php` or
 * `photo.jpg` full of something else cannot influence it. `.jpg`
 * rather than `.jpeg` because it is the canonical short form; the point
 * is only that exactly one form is ever produced.
 */
export const CANONICAL_IMAGE_EXTENSION: Record<AllowedImageMimeType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * Maximum accepted size for one source photograph, in bytes.
 *
 * 15 MiB. Reasoning, in the order it actually constrained the choice:
 *
 *   * a modern smartphone photograph is 2-8 MB (a 48 MP iPhone HEIC
 *     converted to JPEG lands around 5-9 MB); a 24 MP DSLR JPEG is
 *     8-12 MB. 15 MiB accepts the family's real photographs, including
 *     the good camera someone borrowed, without accepting a RAW file
 *     or a disguised archive.
 *   * it is NOT bounded by any serverless request limit, and that is
 *     the whole point of the upload model chosen in
 *     lib/media/upload-lifecycle.ts: the bytes go browser -> Supabase
 *     Storage directly, so they never transit a Server Action or a
 *     Netlify Function. Netlify's ~6 MB synchronous function payload
 *     ceiling would otherwise have set this number for us, at a value
 *     below a normal phone photo.
 *   * it is enforced TWICE, independently: by Storage itself via the
 *     bucket's `file_size_limit` (which is what actually stops a
 *     hostile uploader mid-transfer, before the bytes are stored), and
 *     by finalization, which refuses to mark ready an object bigger
 *     than this. The domain check alone would be too late; the bucket
 *     check alone would be invisible to our tests.
 *
 * Raising this is a product decision with a cost (storage, egress,
 * Mission 047's processing time), not a validation detail.
 */
export const MAX_MEDIA_BYTES = 15 * 1024 * 1024;

/**
 * How long a reserved-but-never-finalized upload stays untouchable
 * before the sweep may reclaim it (lib/media/orphan-sweep.ts).
 *
 * One hour. It has to be comfortably longer than the slowest plausible
 * real upload — a 15 MiB photo over a bad mobile connection, with the
 * user switching apps halfway — because reclaiming a path while its
 * upload is still in flight would turn a slow success into a
 * mysterious failure. It also has to be short enough that an abandoned
 * attempt is not "eventually" cleaned but predictably cleaned.
 */
export const PENDING_MEDIA_TTL_MS = 60 * 60 * 1000;

/**
 * How long a read URL handed to a browser stays valid.
 *
 * Five minutes. These URLs are bearer credentials for one private
 * object: anyone holding the link can read it until it expires, so the
 * window is sized for "long enough for the page that requested it to
 * actually load the image", not for bookmarking. Nothing persists one
 * (see the storage_path rule in supabase/README.md) — they are minted
 * per render.
 */
export const MEDIA_READ_URL_TTL_SECONDS = 300;

/*
 * There is deliberately no MEDIA_UPLOAD_URL_TTL_SECONDS.
 *
 * Supabase Storage's createSignedUploadUrl accepts no expiry argument —
 * the upload token's lifetime belongs to the Storage service. A
 * constant here would describe a setting HERITAGE cannot actually
 * apply. The bound that IS ours is PENDING_MEDIA_TTL_MS above: an
 * upload permission that outlives its reservation can only write into a
 * media the sweep is about to reclaim. See
 * lib/adapters/media-object-store.ts.
 */
