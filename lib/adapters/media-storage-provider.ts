/**
 * Media (photo) storage contract.
 *
 * Upload, deletion and quotas are intentionally not defined yet — Mission
 * 001 does not build photo storage. This only prepares the shape so future
 * code reads media through an abstraction, never a storage SDK directly.
 */
export interface MediaStorageProvider {
  getPublicUrl(mediaId: string): string;
}
