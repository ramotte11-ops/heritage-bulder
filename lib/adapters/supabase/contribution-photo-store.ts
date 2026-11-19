import type { SupabaseClient } from "@supabase/supabase-js";
import { MEDIA_BUCKET } from "@/config/media";
import { ContributionPhotoTooLargeError, type ContributionPhotoStore } from "@/lib/adapters/contribution-photo-store";

/**
 * SERVER ONLY — service_role sur le bucket privé `memorial-media`.
 * Voir lib/adapters/contribution-photo-store.ts.
 */
export class SupabaseContributionPhotoStore implements ContributionPhotoStore {
  constructor(private readonly client: SupabaseClient) {}

  private get bucket() {
    return this.client.storage.from(MEDIA_BUCKET);
  }

  async download(input: { path: string; maxBytes: number }): Promise<Uint8Array | null> {
    const { data, error } = await this.bucket.download(input.path);
    if (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
    if (!data) return null;
    if (data.size > input.maxBytes) throw new ContributionPhotoTooLargeError();
    return new Uint8Array(await data.arrayBuffer());
  }

  async replace(input: { path: string; bytes: Uint8Array; contentType: string }): Promise<void> {
    const { error } = await this.bucket.upload(input.path, input.bytes, {
      contentType: input.contentType,
      upsert: true,
      cacheControl: "3600",
    });
    if (error) throw error;
  }
}

function isNotFound(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { statusCode?: unknown; status?: unknown; message?: unknown };
  if (candidate.statusCode === 404 || candidate.statusCode === "404" || candidate.status === 404) return true;
  return typeof candidate.message === "string" && /not found|does not exist/i.test(candidate.message);
}
