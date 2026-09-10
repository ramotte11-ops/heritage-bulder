"use server";

import { getHeritageActor } from "@/lib/auth/heritage-session";
import { createServerMediaEngineDeps } from "@/lib/media/server-media-engine";
import { reserveMediaUpload, finalizeMediaUpload, type ReservedUpload } from "@/lib/media/upload-lifecycle";
import { deleteMedia, type MediaDeletion } from "@/lib/media/delete-media";
import type { MediaResult } from "@/lib/media/media-errors";
import type { Media } from "@/types/media";

/**
 * Mission 033 — T06's four Server Actions, the one seam bytes never
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
 * `finalizeMediaUpload` and `deleteMedia` (lib/media/*) do their OWN
 * ownership check internally — they take a `HeritageActor`, not a
 * pre-verified id — so these four actions resolve one, from the
 * validated session, on EVERY call (`getHeritageActor()`, never a value
 * the browser could shape) and hand it straight to the already-tested
 * primitive. That primitive is what turns `memorialId` into a verified
 * fact; nothing here duplicates that check.
 *
 * ## `purpose` is never a parameter
 *
 * These actions are hard-coded to `"hero"` — the ONLY thing Mission 033
 * builds. A future Gallery mission reuses the exact same `lib/media/*`
 * primitives with its own actions, never these ones widened with a
 * caller-supplied `purpose` (mission brief section 6/25: no second
 * engine, but also no Hero action quietly becoming a general-purpose one).
 *
 * ## Why there is no `replaceHeroPhotoUploadAction` (QG micro-audit correction)
 *
 * `lib/media/replace-media.ts`'s `replaceMedia` finalizes the new media
 * AND deletes the previous one in the SAME call — a Mission 030
 * guarantee about Storage/DB alone, from before the Hero draft
 * (Mission 031) existed. It knows nothing about `draft.content.hero`,
 * so wiring it directly here would delete the old media before the Hero
 * draft had ever adopted the new `mediaId` — exactly the hole the QG
 * micro-audit found: a crash or a failed draft write between "old
 * deleted" and "draft updated" would leave the family with NO photo at
 * all, which mission brief section 15 explicitly forbids ("pas de trou
 * où la famille se retrouve sans photo").
 *
 * So "Changer la photo" is composed from TWO already-tested Mission 030
 * primitives instead, in the order the mission brief's ordering rule
 * requires: `finalizeHeroPhotoUploadAction` verifies and readies the new
 * media (identical to a first upload — replacement is not a special
 * case for Storage/DB at all), the CALLER (`HeroPhotoStep.tsx`) then
 * explicitly persists the Hero draft's adoption of the new `mediaId`
 * (`writeHeroPhotoMedia` + an awaited `persist`), and only once THAT has
 * genuinely succeeded does it call `retireHeroPhotoUploadAction` on the
 * previous id. If the draft write never succeeds, the previous media is
 * never asked to be deleted, and the old `mediaId` stays the canonical
 * one in the Hero — `lib/builder/guided-flow/resolve-hero-photo-step.ts`'s
 * own reconciliation is what cleans up the new, now-orphaned `ready`
 * media on a later read (mission brief section 14), never this action.
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
 * Finalizes a Hero upload — verifies the real stored bytes and marks the
 * media `ready`. Used identically for the FIRST photo and for a
 * replacement ("Changer la photo", mission brief section 15): Storage/DB
 * make no distinction between the two, only the Hero draft's own
 * adoption does (see `HeroPhotoStep.tsx` and this file's own docstring
 * on why there is no separate replace action).
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
 * Retires a Hero media the Hero draft no longer references — the LAST
 * step of "Changer la photo", called only after the Hero draft has
 * genuinely adopted the new `mediaId` (see this file's own docstring on
 * the ordering this exists to preserve). Delegates entirely to
 * `lib/media/delete-media.ts`: Storage first, then the row, idempotent,
 * safe to retry.
 *
 * A failure here is deliberately NOT the caller's problem to surface to
 * the family: the new photo is already the Hero's canonical one, and
 * the old media becoming a stale, unreferenced row is a recoverable
 * cleanup detail, not a lost photo.
 */
export async function retireHeroPhotoUploadAction(
  memorialId: string,
  mediaId: string,
): Promise<MediaResult<MediaDeletion>> {
  const actor = await getHeritageActor();
  const { mediaEngine } = actionDeps();

  return deleteMedia(mediaEngine, actor, { memorialId, mediaId });
}
