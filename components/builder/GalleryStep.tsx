"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Language } from "@/config/languages";
import type { EditorialContext } from "@/config/memorial";
import type { MemorialContent } from "@/types/memorial";
import type { Media } from "@/types/media";
import type { MediaResult } from "@/lib/media/media-errors";
import type { ReservedUpload } from "@/lib/media/upload-lifecycle";
import type { GalleryRetirement } from "@/lib/memorial/gallery-media";
import type { GalleryStepThumbnails } from "@/lib/builder/guided-flow/resolve-gallery-step";
import { translate } from "@/lib/i18n/translate";
import { useAutosave } from "@/lib/builder/use-autosave";
import { commitA13, galleryStepProgress, readGalleryForEditing, skipA13 } from "@/lib/builder/guided-flow/gallery-step";
import { AutosaveIndicator } from "./AutosaveIndicator";
import { BuilderScreen } from "./BuilderScreen";
import { GalleryWorkshop } from "./GalleryWorkshop";
import { PrimaryButton } from "./PrimaryButton";
import screenStyles from "./BuilderScreen.module.css";
import styles from "./GalleryStep.module.css";

interface GalleryStepProps {
  language: Language;
  editorialContext: EditorialContext;
  /** The draft — the A10–A12 sheet is already behind the family. */
  content: MemorialContent;
  /** Resolved server-side (`resolveGalleryStepData`): mediaId -> short-lived read URL, never persisted. */
  thumbnails: GalleryStepThumbnails;
  persist: (content: MemorialContent) => Promise<{ updatedAt: string }>;
  /** Bound Gallery actions — memorialId and purpose `"gallery"` fixed server-side. */
  reserveUpload: (declaredMimeType: string) => Promise<MediaResult<ReservedUpload>>;
  finalizeUpload: (mediaId: string) => Promise<MediaResult<Media>>;
  retirePhoto: (mediaId: string) => Promise<MediaResult<GalleryRetirement>>;
}

/**
 * A13 — "Vos souvenirs en images", the Guided Flow screen hosting the
 * family's photographic register (`GalleryWorkshop`).
 *
 * This screen owns what belongs to the STEP: the draft and its one
 * `useAutosave`, the heading, and Continue / Skip — the only writes of
 * A13's `StepRecord` (`commitA13` / `skipA13`, which never touch a
 * photograph). Everything about the photographs themselves lives in the
 * workshop, which knows nothing of A13 — so a future revision surface can
 * host the same workshop with its own footer.
 *
 * Continue is never blocked to force photographs (A13 is facultative):
 * with none, it resolves the step as skipped, like Skip does. Both wait
 * for any upload, replacement or explicit write to finish, and drain the
 * autosave first (the PersonSheet / Traditions convention).
 */
export function GalleryStep({
  language,
  editorialContext,
  content: initialContent,
  thumbnails,
  persist,
  reserveUpload,
  finalizeUpload,
  retirePhoto,
}: GalleryStepProps) {
  const router = useRouter();
  const [content, setContent] = useState(initialContent);
  const [submitError, setSubmitError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [workshopBusy, setWorkshopBusy] = useState(false);

  const { flush, state: autosaveState, retry: retryAutosave } = useAutosave({ content, persist });

  const read = readGalleryForEditing(content);
  const controlsDisabled = isSubmitting || workshopBusy;

  async function resolveStep(write: typeof commitA13) {
    if (read.status !== "ready" || controlsDisabled) return;
    setSubmitError(false);
    setIsSubmitting(true);
    try {
      await flush();
    } catch {
      setSubmitError(true);
      setIsSubmitting(false);
      return;
    }

    const resolved = write(content);
    if (!resolved.ok) {
      setSubmitError(true);
      setIsSubmitting(false);
      return;
    }

    try {
      await persist(resolved.content);
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

  return (
    <BuilderScreen
      progress={galleryStepProgress(editorialContext, content)}
      status={<AutosaveIndicator language={language} state={autosaveState} onRetry={retryAutosave} />}
    >
      <div className={styles.copy}>
        <h1 className={styles.title}>{translate(language, "galleryStep.title")}</h1>
        <p className={styles.subtitle}>{translate(language, "galleryStep.subtitle")}</p>
      </div>

      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          void resolveStep(commitA13);
        }}
      >
        <GalleryWorkshop
          language={language}
          content={content}
          setContent={setContent}
          flush={flush}
          persist={persist}
          initialThumbnails={thumbnails}
          reserveUpload={reserveUpload}
          finalizeUpload={finalizeUpload}
          retirePhoto={retirePhoto}
          frozen={isSubmitting}
          onBusyChange={setWorkshopBusy}
        />

        <div className={styles.actions}>
          <div className={screenStyles.ctaWrap}>
            <PrimaryButton type="submit" disabled={controlsDisabled}>
              {translate(language, "common.continue")}
            </PrimaryButton>
          </div>

          <button type="button" className={styles.skipLink} disabled={controlsDisabled} onClick={() => void resolveStep(skipA13)}>
            {translate(language, "galleryStep.skip")}
          </button>
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
