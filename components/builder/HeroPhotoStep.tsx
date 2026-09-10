"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Language } from "@/config/languages";
import type { EditorialContext } from "@/config/memorial";
import { ALLOWED_IMAGE_MIME_TYPES, MEDIA_BUCKET } from "@/config/media";
import type { MemorialContent } from "@/types/memorial";
import type { Media } from "@/types/media";
import type { MediaResult } from "@/lib/media/media-errors";
import type { ReservedUpload } from "@/lib/media/upload-lifecycle";
import type { MediaReplacement } from "@/lib/media/replace-media";
import { translate } from "@/lib/i18n/translate";
import { useAutosave } from "@/lib/builder/use-autosave";
import { precheckHeroPhotoFile } from "@/lib/media/precheck-upload";
import { MediaActionError, mediaErrorTranslationKey } from "@/lib/media/media-error-copy";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser-client";
import {
  commitPageC,
  heroStepProgress,
  readHeroForEditing,
  writeHeroPhotoMedia,
} from "@/lib/builder/guided-flow/hero-step";
import { BuilderScreen } from "./BuilderScreen";
import { PrimaryButton } from "./PrimaryButton";
import screenStyles from "./BuilderScreen.module.css";
import styles from "./HeroPhotoStep.module.css";

interface HeroPhotoStepProps {
  language: Language;
  editorialContext: EditorialContext;
  /** The memorial's current draft content — PAGE A/PAGE B are already
   * guaranteed done, and any section-14 reconciliation already applied,
   * by the time this renders (see
   * lib/builder/guided-flow/resolve-hero-photo-step.ts, called from
   * app/builder/[memorialId]/page.tsx). */
  content: MemorialContent;
  /** The Hero's current photo, already resolved server-side and ready
   * to display — `null` when there is none yet. Its `readUrl` is a
   * short-lived signed URL, never persisted by this component (mission
   * brief section 16). */
  initialPhoto: { media: Media; readUrl: string } | null;
  /** A bound Server Action — same seam every Guided Flow screen uses. */
  persist: (content: MemorialContent) => Promise<{ updatedAt: string }>;
  /** Bound Server Actions — `memorialId` is already baked in server-side
   * (app/builder/[memorialId]/media-actions.ts), so nothing here ever
   * holds a raw memorial id to misuse. */
  reserveUpload: (declaredMimeType: string) => Promise<MediaResult<ReservedUpload>>;
  finalizeUpload: (mediaId: string) => Promise<MediaResult<Media>>;
  replaceUpload: (mediaId: string, previousMediaId: string) => Promise<MediaResult<MediaReplacement>>;
}

type PhotoStatus = "empty" | "uploading" | "finalizing" | "ready" | "error";

interface PhotoState {
  status: PhotoStatus;
  /** The currently READY media, if any — survives an error state so a
   * failed "Changer la photo" attempt leaves the old photo visibly
   * intact (mission brief section 15). */
  media: Media | null;
  /** What the `<img>` should show right now — a local `blob:` preview
   * while uploading, or the server-provided signed URL once resolved. */
  displayUrl: string | null;
  errorMessage: string | null;
}

function initialState(initialPhoto: HeroPhotoStepProps["initialPhoto"]): PhotoState {
  if (initialPhoto === null) {
    return { status: "empty", media: null, displayUrl: null, errorMessage: null };
  }
  return {
    status: "ready",
    media: initialPhoto.media,
    displayUrl: initialPhoto.readUrl,
    errorMessage: null,
  };
}

const ACCEPT = ALLOWED_IMAGE_MIME_TYPES.join(",");

/**
 * Mission 033 — PAGE C: T06, the Hero's photo. Structure per the mission
 * brief section 2: a title, a reassuring subtitle, one big "add a photo"
 * control, and — once a photo is ready — the photo itself, the
 * cropping-reassurance note, "Changer la photo" and Continue. Never a
 * file manager: no upload/MIME/storage/bucket/media-id language anywhere
 * in this file's rendered output (section 2).
 *
 * ## What this page is NOT
 *
 * Not the Hero itself (section 4) — no composition, no final frame, no
 * memorial typography, no decorative assets, no memorial preview. Just
 * the plain, unstyled photo the family picked, so they can confirm "yes,
 * that's the one." T08 stays the first real reveal.
 *
 * Not a cropper (section 20) — no crop is ever set here, and none is
 * fabricated to fake T07 complete. `hero.photo.crop` stays exactly
 * `null` through every path this component takes, by construction:
 * `writeHeroPhotoMedia`/`commitPageC` never touch it.
 *
 * ## The upload sequence
 *
 * File chosen -> browser pre-check (UX only) -> `reserveUpload` (proves
 * ownership, reserves a `pending` row + a signed, single-object Storage
 * permission) -> the browser uploads the bytes DIRECTLY to Storage
 * (`lib/supabase/browser-client.ts`'s `uploadToSignedUrl` — never through
 * this component's own Server Actions) -> `finalizeUpload` (first photo)
 * or `replaceUpload` (mission brief section 15, once a photo already
 * exists) verifies the real stored bytes and marks the media `ready` ->
 * `writeHeroPhotoMedia` links it into the Hero -> that new `content` is
 * handed to `setContent`, which `useAutosave` picks up and persists on
 * its own debounce/retry schedule (Mission 010's loss protection covers
 * exactly the "ready, autosaved, browser closed before Continue" case —
 * mission brief section 18/19).
 *
 * A double-click / concurrent second upload is prevented structurally:
 * the add/change control is disabled whenever `status` is `"uploading"`
 * or `"finalizing"` (section 11).
 *
 * ## Errors
 *
 * Every refusal — from the browser pre-check, from either Server
 * Action, or from the direct Storage upload itself — is unified into one
 * `MediaActionError` and mapped through `mediaErrorTranslationKey`
 * (section 12): never a status code, never "MIME", never "Supabase".
 * On a failed REPLACEMENT, the previous ready photo is restored to view
 * exactly as it was — the mission brief's explicit "pas de trou où la
 * famille se retrouve sans photo" (section 15).
 *
 * ## Continue
 *
 * Disabled until `status === "ready"`. On submit, `commitPageC`
 * re-verifies the referenced media is genuinely `"hero"`-purpose and
 * `"ready"` before ever writing T06's `StepRecord` — the same defensive
 * discipline `commitPageA` already applies to `displayName`.
 */
export function HeroPhotoStep({
  language,
  editorialContext,
  content: initialContent,
  initialPhoto,
  persist,
  reserveUpload,
  finalizeUpload,
  replaceUpload,
}: HeroPhotoStepProps) {
  const router = useRouter();

  const [content, setContent] = useState(initialContent);
  const [photo, setPhoto] = useState<PhotoState>(() => initialState(initialPhoto));
  const [submitError, setSubmitError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useAutosave({ content, persist });

  const read = readHeroForEditing(content);

  const isBusy = photo.status === "uploading" || photo.status === "finalizing";

  async function handleFileSelected(file: File) {
    if (isBusy) return; // structural guard against a concurrent second upload.

    const precheckCode = precheckHeroPhotoFile(file);
    if (precheckCode) {
      setPhoto((previous) => ({
        ...previous,
        status: previous.media ? "ready" : "error",
        errorMessage: translate(language, mediaErrorTranslationKey(precheckCode)),
      }));
      return;
    }

    const previousMedia = photo.media;
    const previousDisplayUrl = photo.displayUrl;
    const localPreviewUrl = URL.createObjectURL(file);

    setPhoto({ status: "uploading", media: previousMedia, displayUrl: localPreviewUrl, errorMessage: null });

    try {
      const reserved = await reserveUpload(file.type);
      if (!reserved.ok) throw new MediaActionError(reserved.code);

      const supabase = getBrowserSupabaseClient();
      const { error: uploadError } = await supabase.storage
        .from(MEDIA_BUCKET)
        .uploadToSignedUrl(reserved.value.storagePath, reserved.value.uploadToken, file, {
          contentType: file.type,
        });
      if (uploadError) throw new MediaActionError("storage_unavailable");

      setPhoto((current) => ({ ...current, status: "finalizing" }));

      const finalizedMedia = previousMedia
        ? await (async () => {
            const replaced = await replaceUpload(reserved.value.mediaId, previousMedia.id);
            if (!replaced.ok) throw new MediaActionError(replaced.code);
            return replaced.value.media;
          })()
        : await (async () => {
            const finalized = await finalizeUpload(reserved.value.mediaId);
            if (!finalized.ok) throw new MediaActionError(finalized.code);
            return finalized.value;
          })();

      const written = writeHeroPhotoMedia(content, finalizedMedia.id);
      if (!written.ok) throw new MediaActionError("storage_unavailable");

      setContent(written.content);
      setPhoto({ status: "ready", media: finalizedMedia, displayUrl: localPreviewUrl, errorMessage: null });
    } catch (error) {
      const code = error instanceof MediaActionError ? error.code : "storage_unavailable";
      setPhoto({
        // The previous ready photo, if any, survives a failed attempt —
        // mission brief section 15: never a hole where the family has no
        // photo because a replacement failed.
        status: previousMedia ? "ready" : "error",
        media: previousMedia,
        displayUrl: previousMedia ? previousDisplayUrl : null,
        errorMessage: translate(language, mediaErrorTranslationKey(code)),
      });
    }
  }

  function handleInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset so choosing the SAME file again still fires a change event.
    event.target.value = "";
    if (file) void handleFileSelected(file);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (photo.status !== "ready") return;

    const committed = commitPageC(content, photo.media);
    if (!committed.ok) {
      setSubmitError(true);
      return;
    }

    setIsSubmitting(true);
    try {
      await persist(committed.content);
    } catch {
      setSubmitError(true);
      setIsSubmitting(false);
      return;
    }

    router.refresh();
  }

  if (read.status !== "ready") {
    return (
      <BuilderScreen progress={0}>
        <p role="alert" className={styles.error}>
          {translate(language, "hero.dataUnavailable")}
        </p>
      </BuilderScreen>
    );
  }

  const progress = heroStepProgress(editorialContext, content, read.hero);
  const hasPhoto = photo.status === "ready" || photo.status === "uploading" || photo.status === "finalizing";
  const controlDisabled = isBusy || isSubmitting;

  return (
    <BuilderScreen progress={progress}>
      <div className={styles.copy}>
        <h1 className={styles.title}>{translate(language, "hero.photoTitle")}</h1>
        <p className={styles.subtitle}>{translate(language, "hero.photoSubtitle")}</p>
      </div>

      <form className={styles.form} onSubmit={handleSubmit}>
        {!hasPhoto && (
          <label className={styles.dropzone} aria-disabled={controlDisabled}>
            <input
              type="file"
              accept={ACCEPT}
              className={styles.hiddenInput}
              disabled={controlDisabled}
              onChange={handleInputChange}
            />
            <span className={styles.dropzoneLabel}>{translate(language, "hero.photoAddLabel")}</span>
          </label>
        )}

        {hasPhoto && (
          <div className={styles.preview}>
            {photo.displayUrl && (
              // A signed/blob URL, never a static asset next/image can optimize, and never persisted.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photo.displayUrl}
                alt={translate(language, "hero.photoAlt")}
                className={styles.previewImage}
              />
            )}

            {isBusy && (
              <p role="status" className={styles.statusText}>
                {translate(language, "hero.photoUploading")}
              </p>
            )}

            {photo.status === "ready" && (
              <>
                <p className={styles.croppingNote}>{translate(language, "hero.photoCroppingNote")}</p>
                <label className={styles.changeLink} aria-disabled={controlDisabled}>
                  <input
                    type="file"
                    accept={ACCEPT}
                    className={styles.hiddenInput}
                    disabled={controlDisabled}
                    onChange={handleInputChange}
                  />
                  {translate(language, "hero.photoChangeLabel")}
                </label>
              </>
            )}
          </div>
        )}

        {photo.errorMessage && (
          <p role="alert" className={styles.error}>
            {photo.errorMessage}
          </p>
        )}

        <div className={screenStyles.ctaWrap}>
          <PrimaryButton type="submit" disabled={photo.status !== "ready" || isSubmitting}>
            {translate(language, "common.continue")}
          </PrimaryButton>
        </div>

        {submitError && (
          <p role="alert" className={styles.error}>
            {translate(language, "errors.generic")}
          </p>
        )}
      </form>
    </BuilderScreen>
  );
}
