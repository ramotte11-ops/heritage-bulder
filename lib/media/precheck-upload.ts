import { MAX_MEDIA_BYTES } from "@/config/media";
import { isAllowedImageMimeType } from "./image-signature";
import type { MediaErrorCode } from "./media-errors";

/**
 * Mission 033 — the BROWSER's own pre-check, a UX convenience only
 * (mission brief section 8): it can save the family a wasted upload
 * attempt for an obviously unacceptable file — the wrong type, or one
 * far too big — before a path is even reserved. It is NEVER the security
 * decision: `file.type` and `file.size` are exactly what a hostile
 * client controls, so neither is evidence.
 *
 * `lib/media/upload-lifecycle.ts`'s `finalizeMediaUpload` is the real
 * check — the bucket's own `file_size_limit`, the measured Storage size,
 * and the byte-signature check in `image-signature.ts` — and nothing
 * here can shortcut or replace any of that (mission brief section 8's
 * explicit rule: "ne jamais supprimer ou contourner cette deuxième
 * validation sous prétexte que le navigateur a déjà vérifié").
 *
 * Returns the same closed `MediaErrorCode` vocabulary the server uses,
 * so a caller maps EITHER outcome through the one translation table in
 * `media-error-copy.ts` — never a second, client-only error vocabulary
 * drifting from the server's.
 */
export function precheckHeroPhotoFile(file: { type: string; size: number }): MediaErrorCode | null {
  if (!isAllowedImageMimeType(file.type)) return "unsupported_format";
  if (file.size > MAX_MEDIA_BYTES) return "file_too_large";
  return null;
}
