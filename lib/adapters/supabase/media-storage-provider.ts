import type { SupabaseClient } from "@supabase/supabase-js";
import { MEDIA_BUCKET, MEDIA_READ_URL_TTL_SECONDS } from "@/config/media";
import type { MediaStorageProvider } from "@/lib/adapters/media-storage-provider";

/**
 * SERVER ONLY. Supabase-backed MediaStorageProvider.
 *
 * Mission 002 implemented this with `getPublicUrl()`, which only
 * produces a working URL for a PUBLIC bucket. Mission 030 made the
 * bucket private, so this now mints a short-lived SIGNED URL instead —
 * see the port for the full rationale.
 *
 * Looks up the internal storage_path for a media id, then signs it. An
 * internal media id is never itself a URL, and no provider URL is ever
 * persisted.
 *
 * This class performs NO ownership check — it takes a media id and no
 * actor. It is a rendering convenience reached only after
 * lib/media/read-media.ts has proven access, never an authorization
 * boundary of its own.
 */
export class SupabaseMediaStorageProvider implements MediaStorageProvider {
  constructor(private readonly client: SupabaseClient) {}

  async createReadUrl(mediaId: string): Promise<string> {
    const { data: media, error } = await this.client
      .from("media")
      .select("storage_path, status")
      .eq("id", mediaId)
      // A pending media has never been verified: its object may be
      // absent, truncated, or not an image at all. Signing a URL for
      // one would hand out a link to content this foundation has
      // explicitly not vouched for, so it is filtered out in the query
      // rather than checked afterwards.
      .eq("status", "ready")
      .single<{ storage_path: string; status: string }>();

    if (error) throw error;

    const { data, error: signError } = await this.client.storage
      .from(MEDIA_BUCKET)
      .createSignedUrl(media.storage_path, MEDIA_READ_URL_TTL_SECONDS);

    if (signError) throw signError;

    return data.signedUrl;
  }
}
