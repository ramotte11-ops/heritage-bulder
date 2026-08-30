import type { SupabaseClient } from "@supabase/supabase-js";
import type { MediaStorageProvider } from "@/lib/adapters/media-storage-provider";

const MEDIA_BUCKET = "memorial-media";

/**
 * Supabase-backed implementation of MediaStorageProvider — the port
 * defined in Mission 001, corrected to be async in Mission 002 (see
 * lib/adapters/media-storage-provider.ts).
 *
 * Looks up the internal storage_path for a media id, then resolves a URL
 * from it — an internal media id is never itself a provider URL, and no
 * provider URL is ever persisted (see the `media` table comments in
 * supabase/migrations/ and supabase/README.md).
 *
 * No upload is implemented in Mission 002. The bucket named above does
 * not need to exist for this code to be correct; it must exist before
 * this is actually called against a real project.
 */
export class SupabaseMediaStorageProvider implements MediaStorageProvider {
  constructor(private readonly client: SupabaseClient) {}

  async getPublicUrl(mediaId: string): Promise<string> {
    const { data: media, error } = await this.client
      .from("media")
      .select("storage_path")
      .eq("id", mediaId)
      .single<{ storage_path: string }>();

    if (error) throw error;

    const { data } = this.client.storage.from(MEDIA_BUCKET).getPublicUrl(media.storage_path);
    return data.publicUrl;
  }
}
