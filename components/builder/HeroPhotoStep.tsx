"use client";

import { useEffect, useRef, useState } from "react";
import { useStepDone } from "./journey/journey-context";
import { usePendingInput } from "./journey/pending-input";
import type { Language } from "@/config/languages";
import { ALLOWED_IMAGE_MIME_TYPES, MEDIA_BUCKET, type AllowedImageMimeType } from "@/config/media";
import type { MemorialContent } from "@/types/memorial";
import type { Media } from "@/types/media";
import type { MediaResult } from "@/lib/media/media-errors";
import type { ReservedUpload } from "@/lib/media/upload-lifecycle";
import type { MediaDeletion } from "@/lib/media/delete-media";
import { translate } from "@/lib/i18n/translate";
import { useAutosave } from "@/lib/builder/use-autosave";
import {
  useDraftRevisionCoordinator,
  useRevisionedDraftPersist,
  type DraftSaveTransport,
} from "@/lib/builder/draft-revision";
import { precheckPhotoInput } from "@/lib/media/precheck-upload";
import { prepareChosenPhoto, prepareChosenPhotoWithReport } from "@/lib/media/prepare-chosen-photo";
import type { LocalHeroPhotoPort, LocalPhotoSnapshot } from "@/lib/media/local-photo";
import { MediaActionError, mediaErrorTranslationKey } from "@/lib/media/media-error-copy";
import {
  commitPageC,
  heroStepProgress,
  readHeroForEditing,
  writeHeroPhotoMedia,
} from "@/lib/builder/guided-flow/hero-step";
import { AutosaveIndicator } from "./AutosaveIndicator";
import { BuilderScreen } from "./BuilderScreen";
import { PrimaryButton } from "./PrimaryButton";
import { LocalBlobImage } from "./LocalBlobImage";
import screenStyles from "./BuilderScreen.module.css";
import styles from "./HeroPhotoStep.module.css";

interface HeroPhotoStepCommonProps {
  language: Language;
  /** The memorial's current draft content — PAGE A/PAGE B are already
   * guaranteed done, and any section-14 reconciliation already applied,
   * by the time this renders (see
   * lib/builder/guided-flow/resolve-hero-photo-step.ts, called from
   * app/builder/[memorialId]/page.tsx). */
  content: MemorialContent;
}

export interface AuthenticatedHeroPhotoStepProps extends HeroPhotoStepCommonProps {
  mode?: "authenticated";
  /** The Hero's current photo, already resolved server-side and ready
   * to display — `null` when there is none yet. Its `readUrl` is a
   * short-lived signed URL, never persisted by this component (mission
   * brief section 16). */
  initialPhoto: { media: Media; readUrl: string } | null;
  /** A bound Server Action — same seam every Guided Flow screen uses. */
  persist: DraftSaveTransport;
  /** Bound Server Actions — `memorialId` is already baked in server-side
   * (app/builder/[memorialId]/media-actions.ts), so nothing here ever
   * holds a raw memorial id to misuse. */
  reserveUpload: (declaredMimeType: string) => Promise<MediaResult<ReservedUpload>>;
  finalizeUpload: (mediaId: string) => Promise<MediaResult<Media>>;
  /** Retires a Hero media the draft no longer references — called ONLY
   * after the Hero draft has genuinely adopted the new mediaId (see this
   * component's own docstring on the ordering QG's micro-audit
   * requires). Never called, and never blocks the family, on its own
   * failure. */
  retireUpload: (mediaId: string) => Promise<MediaResult<MediaDeletion>>;
}

interface LocalHeroPhotoStepProps extends HeroPhotoStepCommonProps {
  mode: "local";
  localMedia: LocalHeroPhotoPort;
}

export type HeroPhotoStepProps = AuthenticatedHeroPhotoStepProps | LocalHeroPhotoStepProps;

type PhotoStatus = "empty" | "preparing" | "uploading" | "finalizing" | "ready" | "error";

interface PhotoState {
  status: PhotoStatus;
  /** The currently READY media, if any — survives an error state so a
   * failed "Changer la photo" attempt leaves the old photo visibly
   * intact (mission brief section 15). */
  selection: { kind: "authenticated"; media: Media } | { kind: "local"; photo: LocalPhotoSnapshot } | null;
  /** What the `<img>` should show right now — a local `blob:` preview
   * while uploading, or the server-provided signed URL once resolved. */
  displayUrl: string | null;
  errorMessage: string | null;
}

function initialState(props: HeroPhotoStepProps): PhotoState {
  if (props.mode === "local") {
    const initial = props.localMedia.initialPhoto;
    if (initial === null) return { status: "empty", selection: null, displayUrl: null, errorMessage: null };
    return { status: "ready", selection: { kind: "local", photo: initial }, displayUrl: null, errorMessage: null };
  }
  if (props.initialPhoto === null) {
    return { status: "empty", selection: null, displayUrl: null, errorMessage: null };
  }
  return {
    status: "ready",
    selection: { kind: "authenticated", media: props.initialPhoto.media },
    displayUrl: props.initialPhoto.readUrl,
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
 * ## The upload sequence, and the order QG's micro-audit corrected
 *
 * File chosen -> browser pre-check (UX only) -> the photo is PREPARED in
 * the browser (Optimisation photographique V1, `prepare-chosen-photo.ts`:
 * one optimized WebP/JPEG; the original is never sent, a failure is a
 * human error) -> `reserveUpload` (proves
 * ownership, reserves a `pending` row + a signed, single-object Storage
 * permission) -> the browser uploads the bytes DIRECTLY to Storage
 * (`lib/supabase/browser-client.ts`'s `uploadToSignedUrl` — never through
 * this component's own Server Actions) -> `finalizeUpload` verifies the
 * real stored bytes and marks the media `ready` (identical whether this
 * is the first photo or a replacement) -> `writeHeroPhotoMedia` links it
 * into the Hero -> an EXPLICIT, AWAITED `persist(...)` call — the actual
 * moment the Hero draft durably adopts the new `mediaId`, never merely
 * `setContent` handed to the debounced autosave — and only once THAT has
 * genuinely resolved does `setContent` run and, if this was a
 * replacement, `retireUpload` get called on the previous media, on a
 * best-effort basis whose own failure is never surfaced to the family.
 *
 * That ordering is load-bearing (mission brief section 15's exact rule):
 * the previous photo must stay the Hero's canonical one, in Storage AND
 * in the draft, for every instant up to and including a successful
 * adoption — never deleted merely because a new upload finalized. If the
 * explicit `persist` call fails, `retireUpload` is never called at all:
 * the old media and the old `mediaId` both remain exactly as they were,
 * and the new, now-orphaned `ready` media is left for
 * `resolveHeroPhotoStepData`'s own reconciliation
 * (lib/builder/guided-flow/resolve-hero-photo-step.ts, mission brief
 * section 14) to adopt on a later read — never this component's problem
 * to solve by retrying anything itself.
 *
 * Mission 010's loss protection (the `beforeunload` guard `useAutosave`
 * already arms) still covers every OTHER edit on this page exactly as
 * it does on PAGE A/PAGE B — only this one write is deliberately taken
 * out of the debounced path, because "did the adoption really succeed"
 * is precisely the fact `retireUpload`'s timing depends on.
 *
 * A double-click / concurrent second upload is prevented structurally:
 * the add/change control is disabled whenever `status` is `"uploading"`
 * or `"finalizing"` (section 11).
 *
 * ## Errors
 *
 * Every refusal — from the browser pre-check, from a Server Action, or
 * from the direct Storage upload itself — is unified into one
 * `MediaActionError` and mapped through `mediaErrorTranslationKey`
 * (section 12): never a status code, never "MIME", never "Supabase".
 * On a failed REPLACEMENT (upload, finalize, OR the draft adoption
 * itself), the previous ready photo is restored to view exactly as it
 * was — the mission brief's explicit "pas de trou où la famille se
 * retrouve sans photo" (section 15).
 *
 * ## Continue
 *
 * Disabled until `status === "ready"`. On submit, `commitPageC`
 * re-verifies the referenced media is genuinely `"hero"`-purpose and
 * `"ready"` before ever writing T06's `StepRecord` — the same defensive
 * discipline `commitPageA` already applies to `displayName`.
 */
export function HeroPhotoStep(props: HeroPhotoStepProps) {
  const { language, content: initialContent } = props;
  const saveDraft = useRevisionedDraftPersist(props.mode === "local" ? undefined : props.persist);
  const revisionCoordinator = useDraftRevisionCoordinator();
  const stepDone = useStepDone();

  const ownedUrls = useRef(new Set<string>());
  const [content, setContent] = useState(initialContent);
  const [photo, setPhoto] = useState<PhotoState>(() => initialState(props));
  useEffect(() => {
    const urls = ownedUrls.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, []);
  // B03 — a photo still uploading is not in the draft yet.
  usePendingInput(photo.status === "preparing" || photo.status === "uploading" || photo.status === "finalizing");
  const [submitError, setSubmitError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { state: autosaveState, retry: retryAutosave, flush } = useAutosave({ content, persist: saveDraft });

  const read = readHeroForEditing(content);

  const isBusy = photo.status === "preparing" || photo.status === "uploading" || photo.status === "finalizing";

  async function handleFileSelected(file: File) {
    if (isBusy) return; // structural guard against a concurrent second upload.

    const precheckCode = precheckPhotoInput(file);
    if (precheckCode) {
      setPhoto((previous) => ({
        ...previous,
        status: previous.selection ? "ready" : "error",
        errorMessage: translate(language, mediaErrorTranslationKey(precheckCode)),
      }));
      return;
    }

    const previousSelection = photo.selection;
    const previousDisplayUrl = photo.displayUrl;

    // The previous photo (if any) stays in view while the new one is prepared.
    setPhoto({ status: "preparing", selection: previousSelection, displayUrl: previousDisplayUrl, errorMessage: null });

    let candidateUrl: string | null = null;
    try {
      if (props.mode === "local") {
        const prepared = await prepareChosenPhotoWithReport(file, "hero");
        setPhoto({ status: "uploading", selection: previousSelection, displayUrl: previousDisplayUrl, errorMessage: null });
        if (revisionCoordinator === null) throw new MediaActionError("storage_unavailable");
        let savedPhoto: LocalPhotoSnapshot | null = null;
        await revisionCoordinator.commit(content, async (expectedRevision) => {
          const result = await props.localMedia.savePreparedPhoto({
            blob: prepared.file,
            mimeType: prepared.file.type as AllowedImageMimeType,
            width: prepared.report.width,
            height: prepared.report.height,
            originalFilename: file.name || null,
            lastModified: Number.isFinite(file.lastModified) ? file.lastModified : null,
          }, expectedRevision);
          if (result.status === "saved") savedPhoto = result.photo ?? null;
          return result;
        });
        if (savedPhoto === null) throw new MediaActionError("storage_unavailable");
        setPhoto({
          status: "ready",
          selection: { kind: "local", photo: savedPhoto },
          displayUrl: null,
          errorMessage: null,
        });
        return;
      }

      // Only the optimized file goes any further — never `file` itself.
      const prepared = await prepareChosenPhoto(file, "hero");
      candidateUrl = URL.createObjectURL(prepared);
      ownedUrls.current.add(candidateUrl);
      setPhoto({ status: "uploading", selection: previousSelection, displayUrl: candidateUrl, errorMessage: null });

      const reserved = await props.reserveUpload(prepared.type);
      if (!reserved.ok) throw new MediaActionError(reserved.code);

      // Loaded only on this authenticated path (GalleryWorkshop's pattern):
      // the guest Builder's bundle never carries the Supabase client.
      const { getBrowserSupabaseClient } = await import("@/lib/supabase/browser-client");
      const supabase = getBrowserSupabaseClient();
      const { error: uploadError } = await supabase.storage
        .from(MEDIA_BUCKET)
        .uploadToSignedUrl(reserved.value.storagePath, reserved.value.uploadToken, prepared, {
          contentType: prepared.type,
        });
      if (uploadError) throw new MediaActionError("storage_unavailable");

      setPhoto((current) => ({ ...current, status: "finalizing" }));

      const finalized = await props.finalizeUpload(reserved.value.mediaId);
      if (!finalized.ok) throw new MediaActionError(finalized.code);
      const finalizedMedia = finalized.value;

      const written = writeHeroPhotoMedia(content, finalizedMedia.id);
      if (!written.ok) throw new MediaActionError("storage_unavailable");

      // THE ordering (see this component's own docstring): the Hero
      // draft must durably adopt the new mediaId BEFORE the previous
      // media is ever asked to be retired. An explicit, awaited call —
      // never merely `setContent` handed to the debounced autosave —
      // because only this gives a definite yes/no to gate the retire on.
      await flush();
      await saveDraft!(written.content);

      setContent(written.content);
      setPhoto({ status: "ready", selection: { kind: "authenticated", media: finalizedMedia }, displayUrl: candidateUrl, errorMessage: null });
      if (previousDisplayUrl !== null && ownedUrls.current.delete(previousDisplayUrl)) {
        URL.revokeObjectURL(previousDisplayUrl);
      }

      // Only now, and only best-effort: the new photo is already the
      // Hero's canonical one, so a retire failure here is a stale row to
      // clean up later, never a reason to tell the family anything went
      // wrong (mission brief section 15).
      if (previousSelection?.kind === "authenticated") {
        props.retireUpload(previousSelection.media.id).catch(() => {});
      }
    } catch (error) {
      if (candidateUrl !== null && ownedUrls.current.delete(candidateUrl)) URL.revokeObjectURL(candidateUrl);
      const code = error instanceof MediaActionError ? error.code : "storage_unavailable";
      setPhoto({
        // The previous ready photo, if any, survives a failed attempt —
        // mission brief section 15: never a hole where the family has no
        // photo because a replacement failed.
        status: previousSelection ? "ready" : "error",
        selection: previousSelection,
        displayUrl: previousSelection ? previousDisplayUrl : null,
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

    if (props.mode === "local") {
      if (revisionCoordinator === null || photo.selection?.kind !== "local") {
        setSubmitError(true);
        return;
      }
      setIsSubmitting(true);
      try {
        await revisionCoordinator.commit(content, props.localMedia.completePhoto);
      } catch {
        setSubmitError(true);
        setIsSubmitting(false);
        return;
      }
      stepDone();
      return;
    }

    const committed = commitPageC(
      content,
      photo.selection?.kind === "authenticated" ? photo.selection.media : null,
    );
    if (!committed.ok) {
      setSubmitError(true);
      return;
    }

    setIsSubmitting(true);
    try {
      await flush();
      await saveDraft!(committed.content);
    } catch {
      setSubmitError(true);
      setIsSubmitting(false);
      return;
    }

    stepDone();
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

  const progress = heroStepProgress(content, read.hero);
  const hasPhoto = photo.status === "ready" || isBusy;
  const controlDisabled = isBusy || isSubmitting;

  return (
    <BuilderScreen
      progress={progress}
      status={<AutosaveIndicator language={language} state={autosaveState} onRetry={retryAutosave} />}
    >
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
            {photo.selection?.kind === "local" && (
              <LocalBlobImage
                blob={photo.selection.photo.blob}
                alt={translate(language, "hero.photoAlt")}
                className={styles.previewImage}
              />
            )}
            {photo.selection?.kind !== "local" && photo.displayUrl && (
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
                {translate(language, photo.status === "preparing" ? "hero.photoPreparing" : "hero.photoUploading")}
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
          <PrimaryButton
            type="submit"
            disabled={photo.status !== "ready" || isSubmitting}
            pending={isSubmitting}
            pendingLabel={translate(language, "autosave.saving")}
          >
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
