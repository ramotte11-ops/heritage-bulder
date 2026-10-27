"use client";

import { useCallback, useMemo, useState } from "react";
import { useStepDone } from "./journey/journey-context";
import type { Language } from "@/config/languages";
import type { MemorialContent } from "@/types/memorial";
import type { Media } from "@/types/media";
import type { MediaResult } from "@/lib/media/media-errors";
import type { ReservedUpload } from "@/lib/media/upload-lifecycle";
import type { GalleryRetirement } from "@/lib/memorial/gallery-media";
import type { LocalGalleryEditorialItem, LocalGalleryPort } from "@/lib/media/local-photo";
import type { GalleryStepThumbnails } from "@/lib/builder/guided-flow/resolve-gallery-step";
import { translate } from "@/lib/i18n/translate";
import { useAutosave } from "@/lib/builder/use-autosave";
import {
  useDraftRevisionCoordinator,
  useRevisionedDraftPersist,
  type DraftSaveTransport,
} from "@/lib/builder/draft-revision";
import { commitA13, galleryStepProgress, readGalleryForEditing, skipA13 } from "@/lib/builder/guided-flow/gallery-step";
import { AutosaveIndicator } from "./AutosaveIndicator";
import { BuilderScreen } from "./BuilderScreen";
import { GalleryWorkshop } from "./GalleryWorkshop";
import { PendingActionLabel } from "./PendingActionLabel";
import { PrimaryButton } from "./PrimaryButton";
import screenStyles from "./BuilderScreen.module.css";
import styles from "./GalleryStep.module.css";

interface GalleryStepCommonProps {
  language: Language;
  /** The draft — the A10–A12 sheet is already behind the family. */
  content: MemorialContent;
}

export interface AuthenticatedGalleryStepProps extends GalleryStepCommonProps {
  mode?: "authenticated";
  /** Resolved server-side (`resolveGalleryStepData`): mediaId -> short-lived read URL, never persisted. */
  thumbnails: GalleryStepThumbnails;
  persist: DraftSaveTransport;
  /** Bound Gallery actions — memorialId and purpose `"gallery"` fixed server-side. */
  reserveUpload: (declaredMimeType: string) => Promise<MediaResult<ReservedUpload>>;
  finalizeUpload: (mediaId: string) => Promise<MediaResult<Media>>;
  retirePhoto: (mediaId: string) => Promise<MediaResult<GalleryRetirement>>;
}

interface LocalGalleryStepProps extends GalleryStepCommonProps {
  mode: "local";
  localMedia: LocalGalleryPort;
}

export type GalleryStepProps = AuthenticatedGalleryStepProps | LocalGalleryStepProps;

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
export function GalleryStep(props: GalleryStepProps) {
  const { language, content: initialContent } = props;
  const saveDraft = useRevisionedDraftPersist(props.mode === "local" ? undefined : props.persist);
  const revisionCoordinator = useDraftRevisionCoordinator();
  const stepDone = useStepDone();
  const [content, setContent] = useState(initialContent);
  const [localPhotos, setLocalPhotos] = useState(() => props.mode === "local" ? props.localMedia.initialPhotos : []);
  const [submitError, setSubmitError] = useState(false);
  const [pendingAction, setPendingAction] = useState<"continue" | "skip" | null>(null);
  const [workshopBusy, setWorkshopBusy] = useState(false);

  const localEditorial = useMemo<LocalGalleryEditorialItem[]>(
    () => localPhotos.map(({ localId, caption }) => ({ localId, caption })),
    [localPhotos],
  );
  const persistLocalEditorial = useCallback(async (items: LocalGalleryEditorialItem[]) => {
    if (props.mode !== "local" || revisionCoordinator === null) throw new Error("Local Gallery persistence is unavailable.");
    return revisionCoordinator.commit(initialContent, (expectedRevision) =>
      props.localMedia.saveEditorial(items, expectedRevision),
    );
  }, [initialContent, props, revisionCoordinator]);
  const authenticatedAutosave = useAutosave({ content, persist: saveDraft });
  const localAutosave = useAutosave({
    content: localEditorial,
    persist: props.mode === "local" ? persistLocalEditorial : undefined,
  });
  const { flush, state: autosaveState, retry: retryAutosave } = props.mode === "local"
    ? localAutosave
    : authenticatedAutosave;

  const read = readGalleryForEditing(content);
  const isSubmitting = pendingAction !== null;
  const controlsDisabled = isSubmitting || workshopBusy;

  async function resolveStep(write: typeof commitA13, action: "continue" | "skip") {
    if ((props.mode !== "local" && read.status !== "ready") || controlsDisabled) return;
    setSubmitError(false);
    setPendingAction(action);
    try {
      await flush();
    } catch {
      setSubmitError(true);
      setPendingAction(null);
      return;
    }

    try {
      if (props.mode === "local") {
        if (revisionCoordinator === null) throw new Error("Local Gallery persistence is unavailable.");
        await revisionCoordinator.commit(initialContent, (expectedRevision) =>
          props.localMedia.resolveStep(action, expectedRevision),
        );
      } else {
        const resolved = write(content);
        if (!resolved.ok) throw new Error("Gallery content is corrupted.");
        await saveDraft!(resolved.content);
      }
    } catch {
      setSubmitError(true);
      setPendingAction(null);
      return;
    }

    stepDone();
  }

  if (props.mode !== "local" && read.status !== "ready") {
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
      progress={galleryStepProgress(content)}
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
          void resolveStep(commitA13, "continue");
        }}
      >
        {props.mode === "local" ? (
          <GalleryWorkshop
            mode="local"
            language={language}
            content={content}
            flush={flush}
            frozen={isSubmitting}
            onBusyChange={setWorkshopBusy}
            localPhotos={localPhotos}
            setLocalPhotos={setLocalPhotos}
            localMedia={props.localMedia}
          />
        ) : (
          <GalleryWorkshop
            mode="authenticated"
            language={language}
            content={content}
            flush={flush}
            frozen={isSubmitting}
            onBusyChange={setWorkshopBusy}
            setContent={setContent}
            persist={saveDraft!}
            initialThumbnails={props.thumbnails}
            reserveUpload={props.reserveUpload}
            finalizeUpload={props.finalizeUpload}
            retirePhoto={props.retirePhoto}
          />
        )}

        <div className={styles.actions}>
          <div className={screenStyles.ctaWrap}>
            <PrimaryButton
              type="submit"
              disabled={controlsDisabled}
              pending={pendingAction === "continue"}
              pendingLabel={translate(language, "common.pleaseWait")}
            >
              {translate(language, "common.continue")}
            </PrimaryButton>
          </div>

          <button
            type="button"
            className={styles.skipLink}
            disabled={controlsDisabled}
            aria-busy={pendingAction === "skip" || undefined}
            onClick={() => void resolveStep(skipA13, "skip")}
          >
            <PendingActionLabel
              pending={pendingAction === "skip"}
              pendingLabel={translate(language, "common.pleaseWait")}
            >
              {translate(language, "galleryStep.skip")}
            </PendingActionLabel>
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
