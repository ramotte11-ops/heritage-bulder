import { MEDIA_READ_URL_TTL_SECONDS, type MediaPurpose } from "@/config/media";
import { authorizeMemorialAccess } from "@/lib/auth/memorial-access";
import type { HeritageActor } from "@/lib/auth/heritage-actor";
import type { Media } from "@/types/media";
import { mediaFailure, mediaSuccess, type MediaResult } from "./media-errors";
import { isPathWithinMemorial } from "./media-path";
import type { MediaEngineDeps } from "./media-engine";

/**
 * Mission 030 — reading a family's own media.
 *
 * ## Why there is no permanent URL anywhere in this file
 *
 * The bucket is private (mission brief, section 5), so an original has
 * no URL that simply exists. Every read is a freshly minted, expiring,
 * signed URL for one object — a bearer credential with a five-minute
 * life, produced per render and never stored. The `media` table holds
 * an internal `storage_path` and never a provider URL, which is the
 * portability rule in supabase/README.md and, since this mission, also
 * the reason a leaked database row does not hand anyone a working link.
 *
 * This deliberately does not solve how a PUBLISHED memorial will serve
 * its photographs to visitors who have no session. That is publication
 * work, and the mission is explicit that it must not be pre-solved by
 * making the originals public today (section 5). Whatever publication
 * chooses — a derivative in a separate public bucket, a signing proxy,
 * a long-lived signed URL for a normalized variant — it will be built
 * against the originals kept safe here, not by opening them.
 */

/** A media plus a short-lived URL that can actually display it. */
export interface DisplayableMedia {
  media: Media;
  readUrl: string;
  /** Seconds until `readUrl` stops working. */
  expiresInSeconds: number;
}

/**
 * A signed, expiring URL for one media the actor is proven to own.
 */
export async function createMediaReadUrl(
  deps: MediaEngineDeps,
  actor: HeritageActor,
  input: { memorialId: string; mediaId: string },
): Promise<MediaResult<DisplayableMedia>> {
  const access = await authorizeMemorialAccess(deps, actor, input.memorialId);
  if (access.status !== "granted") {
    return mediaFailure("access_denied");
  }

  let media: Media | null;
  try {
    media = await deps.mediaRepository.findById({
      memorialId: access.memorialId,
      mediaId: input.mediaId,
    });
  } catch {
    return mediaFailure("storage_unavailable");
  }

  if (media === null) {
    return mediaFailure("access_denied");
  }

  // A pending media has never been verified — its bytes may be absent,
  // truncated, or not an image at all. Signing a URL for one would mean
  // handing out a link to content this foundation has explicitly not
  // vouched for.
  if (media.status !== "ready") {
    return mediaFailure("upload_incomplete");
  }

  if (!isPathWithinMemorial(media.storagePath, access.memorialId)) {
    return mediaFailure("storage_unavailable");
  }

  try {
    const readUrl = await deps.objectStore.createReadUrl({
      path: media.storagePath,
      expiresInSeconds: MEDIA_READ_URL_TTL_SECONDS,
    });

    return mediaSuccess({
      media,
      readUrl,
      expiresInSeconds: MEDIA_READ_URL_TTL_SECONDS,
    });
  } catch {
    return mediaFailure("storage_unavailable");
  }
}

/**
 * Every usable media of one memorial, optionally narrowed to a purpose.
 *
 * The `purpose` filter is the ONLY thing that differs between a Hero
 * read and a Gallery read. Same table, same bucket, same ownership
 * check, same signing — which is the point of section 15: Hero and
 * Gallery are two queries against one engine, not two engines.
 *
 * `pending` media are never returned. Nothing that has not been
 * verified is ever displayable.
 */
export async function listMemorialMedia(
  deps: MediaEngineDeps,
  actor: HeritageActor,
  input: { memorialId: string; purpose?: MediaPurpose },
): Promise<MediaResult<Media[]>> {
  const access = await authorizeMemorialAccess(deps, actor, input.memorialId);
  if (access.status !== "granted") {
    return mediaFailure("access_denied");
  }

  try {
    const media = await deps.mediaRepository.listForMemorial({
      memorialId: access.memorialId,
      purpose: input.purpose,
      status: "ready",
    });

    return mediaSuccess(media);
  } catch {
    return mediaFailure("storage_unavailable");
  }
}
