import type { MediaType } from "@/config/media";

/**
 * Media (photo) metadata. Mirrors the `media` table
 * (supabase/migrations/20260829156000_media.sql). No upload is
 * implemented in Mission 002 — this is the shape a future upload flow
 * writes to.
 */
export interface Media {
  id: string;
  memorialId: string;
  ownerId: string;
  /**
   * Internal HERITAGE identifier/path, never a full provider URL — see
   * supabase/README.md. Resolve to a usable URL via
   * lib/adapters/media-storage-provider.ts.
   */
  storagePath: string;
  mediaType: MediaType;
  mimeType: string;
  originalFilename: string | null;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  createdAt: string; // ISO 8601
}
