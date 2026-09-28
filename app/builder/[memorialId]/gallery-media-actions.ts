"use server";

import { getHeritageActor } from "@/lib/auth/heritage-session";
import { createServerMediaEngineDeps } from "@/lib/media/server-media-engine";
import { reserveMediaUpload, finalizeMediaUpload, type ReservedUpload } from "@/lib/media/upload-lifecycle";
import type { MediaResult } from "@/lib/media/media-errors";
import { SupabaseDraftRepository } from "@/lib/adapters/supabase/draft-repository";
import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { retireGalleryMedia, type GalleryRetirement } from "@/lib/memorial/gallery-media";
import type { Media } from "@/types/media";

/**
 * Dette D1 — the A13 Gallery's three Server Actions: the data foundation a
 * future Gallery step will call. No UI calls them yet.
 *
 * Same seam and same discipline as the Hero's `media-actions.ts`:
 *  - the bytes never cross it — the browser uploads straight to Storage
 *    with the one-object permission `reserveGalleryPhotoUploadAction`
 *    returns;
 *  - the actor is resolved from the validated session on EVERY call
 *    (`getHeritageActor()`), and each `lib/media/*` primitive proves
 *    ownership itself — nothing here adds a second authorization model;
 *  - every refusal resolves as a `MediaResult`, never a throw.
 *
 * ## `purpose` is never a parameter
 *
 * Hard-coded to `"gallery"` (QG D1 decision 7) — reserve reserves a
 * Gallery media, finalize refuses to finalize anything else
 * (`expectedPurpose`), retire only ever retires a Gallery media.
 *
 * ## The family's order and captions are not written here
 *
 * Adding, reordering, captioning and removing a photograph are edits of
 * `draft.content.gallery` (lib/memorial/gallery-content.ts), persisted
 * through the existing autosave (`saveDraftAction`) exactly like every
 * other draft edit — the Hero precedent. Removal is: persist the draft
 * without the reference FIRST, then `retireGalleryPhotoAction`, which
 * re-reads the saved draft and refuses to delete a media it still
 * references (lib/memorial/gallery-media.ts).
 */

function mediaEngine() {
  return createServerMediaEngineDeps();
}

/** Reserves a Gallery upload: ownership proven, id and path generated server-side, `pending` row written, one-object permission issued. */
export async function reserveGalleryPhotoUploadAction(
  memorialId: string,
  declaredMimeType: string,
): Promise<MediaResult<ReservedUpload>> {
  const actor = await getHeritageActor();
  return reserveMediaUpload(mediaEngine(), actor, { memorialId, purpose: "gallery", declaredMimeType });
}

/**
 * Finalizes a Gallery upload: verifies the stored bytes (size, real type)
 * and MEASURES the natural width/height from them — a Gallery media whose
 * dimensions cannot be established is refused. Refuses a media reserved
 * for another purpose.
 */
export async function finalizeGalleryPhotoUploadAction(memorialId: string, mediaId: string): Promise<MediaResult<Media>> {
  const actor = await getHeritageActor();
  return finalizeMediaUpload(mediaEngine(), actor, { memorialId, mediaId, expectedPurpose: "gallery" });
}

/**
 * Retires a Gallery photograph the family removed — called only AFTER the
 * draft without its reference has been saved. Never deletes a media the
 * saved draft still references; deletion itself is `deleteMedia`.
 */
export async function retireGalleryPhotoAction(memorialId: string, mediaId: string): Promise<MediaResult<GalleryRetirement>> {
  const actor = await getHeritageActor();
  const supabase = await createServerSupabaseClient();
  return retireGalleryMedia({ mediaEngine: mediaEngine(), draftRepository: new SupabaseDraftRepository(supabase) }, actor, { memorialId, mediaId });
}
