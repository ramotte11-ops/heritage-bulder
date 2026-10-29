import { MEDIA_BUCKET } from "@/config/media";
import { MediaActionError } from "@/lib/media/media-error-copy";
import type { MediaResult } from "@/lib/media/media-errors";
import type { ReservedUpload } from "@/lib/media/upload-lifecycle";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser-client";
import type { Media } from "@/types/media";

/** Authenticated-only upload path. Guest modules load neither this module nor Supabase. */
export async function uploadAuthenticatedGalleryPhoto(
  file: File,
  reserveUpload: (declaredMimeType: string) => Promise<MediaResult<ReservedUpload>>,
  finalizeUpload: (mediaId: string) => Promise<MediaResult<Media>>,
): Promise<Media> {
  const reserved = await reserveUpload(file.type);
  if (!reserved.ok) throw new MediaActionError(reserved.code);
  const { error } = await getBrowserSupabaseClient()
    .storage.from(MEDIA_BUCKET)
    .uploadToSignedUrl(reserved.value.storagePath, reserved.value.uploadToken, file, { contentType: file.type });
  if (error) throw new MediaActionError("storage_unavailable");
  const finalized = await finalizeUpload(reserved.value.mediaId);
  if (!finalized.ok) throw new MediaActionError(finalized.code);
  return finalized.value;
}
