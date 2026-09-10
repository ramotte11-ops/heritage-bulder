"use server";

import { getHeritageActor } from "@/lib/auth/heritage-session";
import { createServerMediaEngineDeps } from "@/lib/media/server-media-engine";
import { reserveMediaUpload, finalizeMediaUpload, type ReservedUpload } from "@/lib/media/upload-lifecycle";
import { replaceMedia, type MediaReplacement } from "@/lib/media/replace-media";
import type { MediaResult } from "@/lib/media/media-errors";
import type { Media } from "@/types/media";

/**
 * Mission 033 — T06's three Server Actions, the one seam bytes never
 * cross (mission brief section 7): the browser talks to these only to
 * REZERVE a path and to CONFIRM what Storage already received, never to
 * hand these actions a photograph's actual bytes. The upload itself goes
 * straight from the browser to Supabase Storage with the permission
 * `reserveHeroPhotoUploadAction` returns — see
 * `components/builder/HeroPhotoStep.tsx` and
 * `lib/supabase/browser-client.ts`.
 *
 * ## Why the actor is resolved here, not `authorizeMemorialForRequest`
 *
 * `saveDraftAction` (./actions.ts) only needs to know a save is
 * authorized, so `authorizeMemorialForRequest`'s collapsed
 * granted/denied answer is enough. `reserveMediaUpload`,
 * `finalizeMediaUpload` and `replaceMedia` (lib/media/*) do their OWN
 * ownership check internally — they take a `HeritageActor`, not a
 * pre-verified id — so these three actions resolve one, from the
 * validated session, on EVERY call (`getHeritageActor()`, never a value
 * the browser could shape) and hand it straight to the already-tested
 * primitive. That primitive is what turns `memorialId` into a verified
 * fact; nothing here duplicates that check.
 *
 * ## `purpose` is never a parameter
 *
 * These three actions are hard-coded to `"hero"` — the ONLY thing
 * Mission 033 builds. A future Gallery mission reuses the exact same
 * `lib/media/*` primitives with its own actions, never these ones widened
 * with a caller-supplied `purpose` (mission brief section 6/25: no second
 * engine, but also no Hero action quietly becoming a general-purpose one).
 *
 * ## The return shape
 *
 * Every action below resolves with a `MediaResult<...>` — a plain,
 * JSON-serializable discriminated union
 * (`{ ok: true, value }` | `{ ok: false, code }`), never a thrown
 * refusal the way `saveDraftAction` uses. A media refusal is an ordinary,
 * expected outcome with a specific human message the client must show
 * (`lib/media/media-error-copy.ts`) — not the generic "something went
 * wrong, retry the whole save" `saveDraftAction`'s reject/resolve
 * contract is built for.
 */

function actionDeps() {
  return { mediaEngine: createServerMediaEngineDeps() };
}

/**
 * Reserves an upload for the memorial's Hero photo: proves ownership,
 * generates the media id and object path, writes the `pending` row, and
 * issues a short-lived, single-object Storage permission. `declaredMimeType`
 * is exactly what the browser's own pre-check already looked at
 * (`file.type`) — a cheap pre-filter here too, never the real decision
 * (`lib/media/upload-lifecycle.ts`'s own docstring).
 */
export async function reserveHeroPhotoUploadAction(
  memorialId: string,
  declaredMimeType: string,
): Promise<MediaResult<ReservedUpload>> {
  const actor = await getHeritageActor();
  const { mediaEngine } = actionDeps();

  return reserveMediaUpload(mediaEngine, actor, {
    memorialId,
    purpose: "hero",
    declaredMimeType,
  });
}

/**
 * Finalizes a fresh Hero upload — the FIRST photo for this memorial, no
 * previous ready media to retire. See `replaceHeroPhotoUploadAction` for
 * "Changer la photo" once a Hero photo already exists.
 */
export async function finalizeHeroPhotoUploadAction(
  memorialId: string,
  mediaId: string,
): Promise<MediaResult<Media>> {
  const actor = await getHeritageActor();
  const { mediaEngine } = actionDeps();

  return finalizeMediaUpload(mediaEngine, actor, { memorialId, mediaId });
}

/**
 * Finalizes a REPLACEMENT Hero upload — mission brief section 15
 * ("Changer la photo"). Delegates entirely to `lib/media/replace-media.ts`:
 * the previous media is only ever retired after the new one is verified
 * and `ready`, so a failure here leaves the family's existing Hero photo
 * exactly as it was.
 */
export async function replaceHeroPhotoUploadAction(
  memorialId: string,
  mediaId: string,
  previousMediaId: string,
): Promise<MediaResult<MediaReplacement>> {
  const actor = await getHeritageActor();
  const { mediaEngine } = actionDeps();

  return replaceMedia(mediaEngine, actor, { memorialId, mediaId, previousMediaId });
}
