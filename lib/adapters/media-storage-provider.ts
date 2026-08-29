/**
 * Media (photo) storage contract.
 *
 * Upload, deletion and quotas are intentionally not defined yet — this
 * does not build photo storage. This only prepares the shape so future
 * code reads media through an abstraction, never a storage SDK directly.
 *
 * getPublicUrl is async (Mission 002 correction to the Mission 001
 * shape): resolving a URL for an internal media id requires first
 * looking up its storage_path (see the `media` table in
 * supabase/migrations/) before asking the storage provider for a URL —
 * a real implementation cannot be synchronous. Nothing outside
 * lib/adapters/supabase/media-storage-provider.ts implemented or called
 * this method before this correction, so it is not a breaking change.
 */
export interface MediaStorageProvider {
  getPublicUrl(mediaId: string): Promise<string>;
}
