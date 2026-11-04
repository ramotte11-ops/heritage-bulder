import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { MEDIA_BUCKET, MEDIA_READ_URL_TTL_SECONDS } from "@/config/media";
import type { MediaResolver, ResolvedMedia } from "@/lib/memorial/assembly/media-resolver";
import type { PublicMemorialMedia } from "./read-public-memorial";

/**
 * QG 016 / M2 — the public `MediaResolver` the architecture reserved for
 * publication (lib/memorial/assembly/media-resolver.ts: « Publication
 * (future, not built): a resolver over public/snapshot media »).
 *
 * The ONLY media it can ever resolve are those `read_public_memorial_v1`
 * returned for this memorial — the `ready` media its published snapshot
 * references, each with its exact purpose. Any other request (an id the
 * snapshot does not cite, the right id with the wrong purpose) is `null`
 * and nothing is signed. There is no database read here, no actor and no
 * ownership: the allow-list IS the authorization, and it was computed by
 * the database under the public-visibility rule.
 *
 * Only `{ mediaId, readUrl, width, height }` leaves this function — never
 * `storagePath`. The read URL is a short-lived signed URL
 * (MEDIA_READ_URL_TTL_SECONDS), minted per render and never persisted or
 * cached (the page is dynamic).
 *
 * SERVER ONLY.
 */

/** Signs one private storage path into a short-lived read URL. */
export type SignStoragePath = (storagePath: string) => Promise<string>;

export function createPublicSnapshotMediaResolver(
  allowed: readonly PublicMemorialMedia[],
  sign: SignStoragePath,
): MediaResolver {
  const byId = new Map(allowed.map((media) => [media.mediaId, media] as const));
  // One signature per media per render, even when several renderers ask.
  const signed = new Map<string, Promise<string>>();

  return async (request): Promise<ResolvedMedia | null> => {
    const media = byId.get(request.mediaId);
    if (media === undefined || media.purpose !== request.purpose) return null;
    try {
      let readUrl = signed.get(media.mediaId);
      if (readUrl === undefined) {
        readUrl = sign(media.storagePath);
        signed.set(media.mediaId, readUrl);
      }
      const url = await readUrl;
      if (typeof url !== "string" || url === "") return null;
      return { mediaId: media.mediaId, readUrl: url, width: media.width, height: media.height };
    } catch {
      return null;
    }
  };
}

/** The production signer: the private `memorial-media` bucket, through the service-role client. */
export function createStorageSigner(client: Pick<SupabaseClient, "storage">): SignStoragePath {
  return async (storagePath) => {
    const { data, error } = await client.storage
      .from(MEDIA_BUCKET)
      .createSignedUrl(storagePath, MEDIA_READ_URL_TTL_SECONDS);
    if (error || !data?.signedUrl) throw new Error("Public media signature failed.");
    return data.signedUrl;
  };
}
