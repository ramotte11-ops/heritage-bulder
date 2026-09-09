import type { SupabaseClient } from "@supabase/supabase-js";
import { MEDIA_BUCKET } from "@/config/media";
import type { MediaObjectStore } from "@/lib/adapters/media-object-store";

/**
 * SERVER ONLY. Supabase Storage implementation of MediaObjectStore.
 *
 * Must be constructed with the SERVICE-ROLE client
 * (lib/supabase/service-role-client.ts). Mission 030 creates no policy
 * on storage.objects (see the migration's section 2), so `anon` and
 * `authenticated` can reach nothing in this bucket — service_role's RLS
 * bypass is the only route to an object, and it is only ever taken
 * behind lib/auth/memorial-access.ts.
 *
 * Never import this file from a Client Component or anything reachable
 * from one — lib/entitlement/server-only-boundary.test.ts enforces it.
 * A browser holding this client would hold read/write/delete over every
 * family's photographs.
 */
export class SupabaseMediaObjectStore implements MediaObjectStore {
  constructor(private readonly client: SupabaseClient) {}

  private get bucket() {
    return this.client.storage.from(MEDIA_BUCKET);
  }

  async createUploadPermission(input: { path: string }): Promise<{
    url: string;
    token: string;
  }> {
    // `upsert` is NOT enabled, and its absence is the point. An
    // overwrite-capable permission would let a replayed or duplicated
    // reservation destroy bytes that are already finalized and in use —
    // exactly the "delete the old before the new is ready" failure the
    // replacement flow exists to prevent, arriving through a side door.
    //
    // Combined with a fresh media id per upload, this makes it
    // physically impossible for one upload to land on another's object.
    const { data, error } = await this.bucket.createSignedUploadUrl(input.path);

    if (error) throw error;

    return { url: data.signedUrl, token: data.token };
  }

  async createReadUrl(input: { path: string; expiresInSeconds: number }): Promise<string> {
    // The bucket is private, so this is the ONLY way to read an object,
    // and the URL it returns is a bearer credential with a deadline.
    // Nothing persists it (see supabase/README.md's portability rule and
    // lib/media/read-media.ts).
    const { data, error } = await this.bucket.createSignedUrl(
      input.path,
      input.expiresInSeconds,
    );

    if (error) throw error;

    return data.signedUrl;
  }

  async statObject(input: { path: string }): Promise<{ sizeBytes: number } | null> {
    const { data, error } = await this.bucket.info(input.path);

    // A missing object is a normal, expected answer here — it is how
    // finalization learns that a reservation was never uploaded — so it
    // becomes `null` rather than an exception. Any other failure is
    // rethrown: an outage must not be read as "the user did not upload
    // anything", which would make us delete a reservation that was
    // perfectly fine.
    if (error) {
      if (isNotFound(error)) return null;
      throw error;
    }

    // `size` is optional in the Storage response. Treated as absent
    // rather than as zero: a zero would be reported to the user as
    // `upload_incomplete`, which is a claim we have no evidence for.
    if (data?.size === undefined || data.size === null) return null;

    return { sizeBytes: data.size };
  }

  async readObjectHead(input: {
    path: string;
    byteCount: number;
  }): Promise<Uint8Array | null> {
    // A signed URL plus a Range request, rather than the SDK's
    // `download()`, because `download()` fetches the WHOLE object.
    // Pulling 15 MiB through the server to inspect 16 bytes would put a
    // photograph-sized transfer on the finalization path of every
    // single upload.
    //
    // The URL is minted for seconds and used immediately; it never
    // leaves this method.
    let signedUrl: string;
    try {
      signedUrl = await this.createReadUrl({ path: input.path, expiresInSeconds: 60 });
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }

    const response = await fetch(signedUrl, {
      headers: { Range: `bytes=0-${input.byteCount - 1}` },
    });

    if (response.status === 404) return null;

    if (!response.ok && response.status !== 206) {
      throw new Error(`Media head read failed with status ${response.status}`);
    }

    const buffer = await response.arrayBuffer();

    // An empty body means an object with no bytes — the caller reads
    // that as an incomplete upload.
    if (buffer.byteLength === 0) return null;

    // A server that ignores Range answers 200 with the whole file. The
    // slice keeps this method's contract ("at most byteCount bytes")
    // true either way, so the signature check never depends on the
    // server having honoured the header.
    return new Uint8Array(buffer.slice(0, input.byteCount));
  }

  async removeByPrefix(input: { prefix: string }): Promise<void> {
    // Storage has no "delete by prefix" primitive: `remove()` takes
    // explicit paths. So the directory is listed first, then its
    // contents are removed by name.
    const { data, error } = await this.bucket.list(input.prefix);

    if (error) {
      // Nothing there is a successful no-op — this is what makes
      // deletion idempotent, and it is relied on by both deleteMedia
      // and the sweep.
      if (isNotFound(error)) return;
      throw error;
    }

    const entries = data ?? [];
    if (entries.length === 0) return;

    // One media directory holds the original today and, later, its
    // derivatives (Missions 033/047) as flat siblings. Listing by
    // prefix rather than deleting the one known path is what stops
    // those future files from becoming orphans the day they appear.
    const paths = entries.map((entry) => `${input.prefix}/${entry.name}`);

    const { error: removeError } = await this.bucket.remove(paths);

    if (removeError) {
      if (isNotFound(removeError)) return;
      throw removeError;
    }
  }
}

/**
 * Whether a Storage error means "there is nothing at that path".
 *
 * Storage reports a missing object inconsistently depending on the
 * endpoint — a `statusCode` of 404, a `status` of 404, or a message
 * naming the condition — so all three are checked. The alternative,
 * matching only one, would make an absent object look like an outage
 * on the endpoints that report it differently, and an outage read as
 * an outage is the safe direction: this helper is deliberately narrow,
 * and anything it does not recognize is rethrown.
 */
function isNotFound(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;

  const candidate = error as { statusCode?: unknown; status?: unknown; message?: unknown };

  if (candidate.statusCode === 404 || candidate.statusCode === "404") return true;
  if (candidate.status === 404) return true;

  if (typeof candidate.message === "string") {
    const message = candidate.message.toLowerCase();
    return message.includes("not found") || message.includes("does not exist");
  }

  return false;
}
