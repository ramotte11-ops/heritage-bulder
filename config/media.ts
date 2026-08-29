/**
 * Media (photo) type configuration. Mirrors the `media_type` CHECK
 * constraint in supabase/migrations/20260829156000_media.sql.
 */

export const MEDIA_TYPES = ["photo"] as const;

export type MediaType = (typeof MEDIA_TYPES)[number];
