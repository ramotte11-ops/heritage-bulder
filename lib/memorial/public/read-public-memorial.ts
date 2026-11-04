import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { MemorialContent } from "@/types/memorial";

/**
 * QG 016 / M2 — the server-side reader of a PUBLISHED memorial, by slug.
 *
 * It calls exactly one thing: `read_public_memorial_v1(p_slug)` (QG 016 /
 * M1, supabase/migrations/20261104090000_qg016_m1_read_public_memorial.sql),
 * a SECURITY DEFINER function executable by `service_role` only. That
 * function is the single authority on public visibility: it returns zero
 * rows for an unknown slug, a draft, a `ready`, an `editing`, an `archived`
 * memorial, an expired `avis`, or a memorial without published snapshot —
 * and, for a visible one, the PUBLISHED SNAPSHOT (never the draft) and the
 * only `ready` media that snapshot references.
 *
 * This module never re-decides visibility, never reads `memorials`,
 * `memorial_drafts` or `memorial_published_snapshots` itself, and never
 * widens what the function returned. It only validates the row's shape
 * (fail closed: a malformed row is `invalid`, never partially trusted).
 *
 * `storagePath` is returned to the SERVER caller so it can sign a short
 * read URL. It must never be handed to a renderer or a browser: the only
 * consumer is ./public-snapshot-media-resolver.ts, which emits
 * `{ mediaId, readUrl, width, height }` and nothing else.
 *
 * SERVER ONLY: the client passed in is the service-role client.
 */

export const READ_PUBLIC_MEMORIAL_RPC = "read_public_memorial_v1";

/**
 * The only slugs publication has ever produced (`memorial_public_slug_v1`,
 * QG 008 Lot 3 v4): lower-case hexadecimal, 12 to 64 characters. Anything
 * else cannot name a memorial, so it is answered without a database round
 * trip — with the very same `notFound` as an unknown slug.
 */
const PUBLIC_SLUG_PATTERN = /^[0-9a-f]{12,64}$/;

export function isPublicSlugShape(slug: unknown): slug is string {
  return typeof slug === "string" && PUBLIC_SLUG_PATTERN.test(slug);
}

export type PublicMediaPurpose = "hero" | "gallery";

export interface PublicMemorialMedia {
  mediaId: string;
  purpose: PublicMediaPurpose;
  /** SERVER ONLY — signed into a read URL, never sent to a browser. */
  storagePath: string;
  width: number | null;
  height: number | null;
}

export interface PublicMemorialRecord {
  memorialId: string;
  slug: string;
  /** Raw stored values, re-validated by the caller / the composition. */
  skin: unknown;
  skinVariant: unknown;
  language: unknown;
  accessLevel: unknown;
  firstPublishedAt: string;
  publishedAt: string;
  /** The published snapshot's content. */
  content: MemorialContent;
  media: PublicMemorialMedia[];
}

export type PublicMemorialReadResult =
  | { status: "found"; memorial: PublicMemorialRecord }
  | { status: "notFound" }
  | { status: "invalid" };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalDimension(value: unknown): number | null | undefined {
  if (value === null || value === undefined) return null;
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function parseMedia(value: unknown): PublicMemorialMedia[] | null {
  if (!Array.isArray(value)) return null;
  const media: PublicMemorialMedia[] = [];
  for (const entry of value) {
    if (!isPlainObject(entry)) return null;
    const { media_id: mediaId, purpose, storage_path: storagePath } = entry;
    const width = optionalDimension(entry.width);
    const height = optionalDimension(entry.height);
    if (typeof mediaId !== "string" || !UUID_PATTERN.test(mediaId)) return null;
    if (purpose !== "hero" && purpose !== "gallery") return null;
    if (typeof storagePath !== "string" || storagePath.trim() === "") return null;
    if (width === undefined || height === undefined) return null;
    media.push({ mediaId, purpose, storagePath, width, height });
  }
  return media;
}

function parseRow(row: unknown, slug: string): PublicMemorialRecord | null {
  if (!isPlainObject(row)) return null;
  const memorialId = row.memorial_id;
  if (typeof memorialId !== "string" || !UUID_PATTERN.test(memorialId)) return null;
  // The function matched the slug exactly; a different echo is a contract breach.
  if (row.slug !== slug) return null;
  if (typeof row.first_published_at !== "string" || typeof row.published_at !== "string") return null;
  if (!isPlainObject(row.content)) return null;
  const media = parseMedia(row.media);
  if (media === null) return null;
  return {
    memorialId,
    slug,
    skin: row.skin,
    skinVariant: row.skin_variant,
    language: row.language,
    accessLevel: row.access_level,
    firstPublishedAt: row.first_published_at,
    publishedAt: row.published_at,
    content: row.content as MemorialContent,
    media,
  };
}

/**
 * Reads one published, publicly visible memorial by its exact slug.
 * Throws only when the database call itself fails (an infrastructure
 * error is not an answer about the memorial); every other outcome is a
 * value.
 */
export async function readPublicMemorial(
  client: Pick<SupabaseClient, "rpc">,
  slug: unknown,
): Promise<PublicMemorialReadResult> {
  if (!isPublicSlugShape(slug)) return { status: "notFound" };

  const { data, error } = await client.rpc(READ_PUBLIC_MEMORIAL_RPC, { p_slug: slug });
  if (error) throw new Error("Public memorial read failed.");
  if (!Array.isArray(data)) return { status: "invalid" };
  if (data.length === 0) return { status: "notFound" };
  if (data.length !== 1) return { status: "invalid" };

  const memorial = parseRow(data[0], slug);
  return memorial === null ? { status: "invalid" } : { status: "found", memorial };
}
