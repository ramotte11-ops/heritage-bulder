"use client";

import { useEffect, useReducer, useState } from "react";
import { useStepDone } from "./journey/journey-context";
import type { Language } from "@/config/languages";
import type { MemorialContent } from "@/types/memorial";
import { translate, translateWith } from "@/lib/i18n/translate";
import { useAutosave } from "@/lib/builder/use-autosave";
import { useRevisionedDraftPersist, type DraftSaveTransport } from "@/lib/builder/draft-revision";
import {
  commitA16,
  readVideoForEditing,
  skipA16,
  videoStepProgress,
  type VideoStepWriteResult,
} from "@/lib/builder/guided-flow/video-step";
import {
  admitDraftVideo,
  createVideoDraftId,
  videoDraftBudget,
  videoDraftCompliance,
  writeVideoItems,
  type VideoDraftItem,
} from "@/lib/memorial/video/video-content";
import {
  VIDEO_HOMMAGE_MAX_TITLE_LENGTH,
  VIDEO_HOMMAGE_MAX_VIDEOS,
  countCharacters,
  limitVideoTitleInput,
  moveVideo,
  normalizeVideoTitle,
  videoDisplayTitle,
  type VideoHommageItem,
} from "@/lib/memorial/video/video-hommage";
import { isVideoFile, openLocalVideo, type LocalVideoHandle } from "@/lib/memorial/video/local-video";
import { pageLocalVideoRegistry, type LocalVideoRegistry } from "@/lib/memorial/video/local-video-registry";
import type { VideoHostingActions } from "@/lib/memorial/video/hosting/hosted-video-types";
import { pageVideoTransfers, type VideoTransferManager } from "@/lib/memorial/video/hosting/video-transfers";
import { VideoHommageV1 } from "@/components/memorial/video/VideoHommageV1";
import { VIDEO_HOMMAGE_TEXTS } from "@/components/memorial/video/texts";
import { AutosaveIndicator } from "./AutosaveIndicator";
import { BuilderScreen } from "./BuilderScreen";
import { PrimaryButton } from "./PrimaryButton";
import { PendingActionLabel } from "./PendingActionLabel";
import screenStyles from "./BuilderScreen.module.css";
import styles from "./VideoStep.module.css";
import { useVideoHosting, type HostedItemStatus } from "./useVideoHosting";
import { previewVideoItem } from "@/lib/memorial/video/video-section";

export interface VideoStepProps {
  language: Language;
  content: MemorialContent;
  /** La même Server Action liée que tous les écrans du parcours, ou le brouillon local de l'invité. */
  persist: DraftSaveTransport;
  progress?: number;
  /** Injections pour les tests ; par défaut : registre de la page et lecture locale du navigateur. */
  registry?: LocalVideoRegistry;
  openVideo?: (file: File) => Promise<LocalVideoHandle>;
  createId?: () => string;
  /**
   * VID-07 — actions serveur liées à l'hommage autorisé (route du Builder).
   * Absentes (invité) ou « indisponibles » (offre gratuite, hébergement non
   * configuré) : préparation locale seule, aucun envoi.
   */
  hosting?: VideoHostingActions;
  transfers?: VideoTransferManager;
  hostingPollMs?: number;
}

const NO_ITEMS: readonly VideoDraftItem[] = [];

type Feedback =
  | { kind: "notVideo" }
  | { kind: "unreadable" }
  | { kind: "tooMany" }
  | { kind: "noTimeLeft" }
  | { kind: "tooLong"; duration: number; remaining: number }
  | { kind: "notPlayable" }
  | { kind: "removeFailed" };

/** « 4 min 28 s », « 45 s » — lu tel quel dans les trois langues. */
export function spokenVideoDuration(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  if (minutes === 0) return `${rest} s`;
  return rest === 0 ? `${minutes} min` : `${minutes} min ${String(rest).padStart(2, "0")} s`;
}

/**
 * VID-06 — A16 « Vos souvenirs en vidéo » : le formulaire familial de la
 * rubrique « Des instants pour se souvenir ».
 *
 * La famille ajoute une vidéo depuis son téléphone ou son ordinateur, la voit
 * aussitôt dans la rubrique HERITAGE (aperçu local, Master Light universel,
 * lecteur VID-05A/05B), lui donne un titre si elle le souhaite, en ajoute une
 * deuxième puis une troisième, change leur ordre, en remplace ou en retire.
 *
 * Ce qui est enregistré (autosave du brouillon, comme les autres écrans) :
 * titres, durées et ordre — jamais un fichier. Le fichier reste dans le
 * navigateur, le temps de la page (`local-video-registry.ts`) : AUCUN
 * transfert vers Mux, Supabase, Netlify ni aucun serveur pendant la
 * préparation. Après une fermeture ou un rechargement, chaque vidéo se
 * présente « à sélectionner de nouveau » ; ses informations sont intactes.
 *
 * Limites (contrat VID-02, reprises de `video-content.ts`) : 3 vidéos,
 * 600 s cumulées, aucun plafond individuel, titre facultatif de 30
 * caractères. Une durée illisible n'est jamais comptée comme zéro : la vidéo
 * est gardée, et le cumul affiché « à vérifier » tant qu'il ne peut pas être
 * confirmé. « Continuer » n'est jamais bloqué.
 */
export function VideoStep({
  language,
  content: initialContent,
  persist,
  progress,
  registry = pageLocalVideoRegistry(),
  openVideo = (file) => openLocalVideo(file),
  createId = () => createVideoDraftId(),
  hosting,
  transfers = pageVideoTransfers(),
  hostingPollMs,
}: VideoStepProps) {
  const saveDraft = useRevisionedDraftPersist(persist);
  const stepDone = useStepDone();
  const [content, setContent] = useState(initialContent);
  const { flush, state: autosaveState, retry: retryAutosave } = useAutosave({ content, persist: saveDraft });
  const [, filesChanged] = useReducer((n: number) => n + 1, 0);
  const [titleInputs, setTitleInputs] = useState<Record<string, string>>({});
  const [opening, setOpening] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<"continue" | "skip" | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState(false);

  const read = readVideoForEditing(content);
  const items = read.status === "ready" ? read.items : NO_ITEMS;
  const rubrique = VIDEO_HOMMAGE_TEXTS[language];
  const defaultTitle = rubrique.defaultTitle;
  const hosted = useVideoHosting({
    hosting,
    items,
    registry,
    transfers,
    pollMs: hostingPollMs,
    onVerifiedDurations: (durations) =>
      setContent((current) => {
        const latest = readVideoForEditing(current);
        if (latest.status !== "ready") return current;
        return writeVideoItems(current, latest.items.map((item) => ({ ...item, durationSeconds: durations.get(item.id) ?? item.durationSeconds })));
      }),
  });

  // Un fichier gardé pour une vidéo que le brouillon ne contient plus (retirée
  // depuis un autre écran) est libéré à l'ouverture de l'écran.
  useEffect(() => {
    const initial = readVideoForEditing(initialContent);
    registry.retainOnly(initial.status === "ready" ? initial.items.map((item) => item.id) : []);
  }, [initialContent, registry]);

  const busy = opening !== null || pendingAction !== null || removing !== null;
  const budget = videoDraftBudget(items);
  const compliance = videoDraftCompliance(items);
  const timeLeft = budget.remainingSeconds > 0;

  function writeItems(next: readonly VideoDraftItem[]) {
    setContent((current) => writeVideoItems(current, next));
  }

  async function chooseFile(file: File | undefined, replacingId?: string) {
    if (file === undefined || busy) return;
    setFeedback(null);
    setConfirmRemove(null);
    if (!isVideoFile(file)) {
      setFeedback({ kind: "notVideo" });
      return;
    }
    setOpening(replacingId ?? "new");
    let handle: LocalVideoHandle;
    try {
      handle = await openVideo(file);
    } catch {
      setOpening(null);
      setFeedback({ kind: "unreadable" });
      return;
    }
    const { durationSeconds, playable } = handle.metadata;
    // Rien de lisible (fichier abîmé, format inconnu du navigateur) : refusé,
    // avec une explication ; le reste du parcours n'est pas bloqué.
    if (!playable && durationSeconds === null) {
      handle.release();
      setOpening(null);
      setFeedback({ kind: "unreadable" });
      return;
    }
    const admission = admitDraftVideo(items, durationSeconds, replacingId);
    if (!admission.ok) {
      handle.release();
      setOpening(null);
      if (admission.reason === "too-many-videos") setFeedback({ kind: "tooMany" });
      else if (admission.reason === "no-time-left") setFeedback({ kind: "noTimeLeft" });
      else setFeedback({ kind: "tooLong", duration: admission.durationSeconds, remaining: admission.remainingSeconds });
      return;
    }
    const id = replacingId ?? createId();
    registry.set(id, handle, file);
    filesChanged();
    writeItems(
      replacingId === undefined
        ? [...items, { id, title: null, durationSeconds }]
        : items.map((item) => (item.id === replacingId ? { ...item, durationSeconds } : item)),
    );
    setOpening(null);
    if (!playable) setFeedback({ kind: "notPlayable" });
    hosted.send(id, durationSeconds);
  }

  function changeTitle(id: string, raw: string) {
    const limited = limitVideoTitleInput(raw);
    setTitleInputs((current) => ({ ...current, [id]: limited }));
    writeItems(items.map((item) => (item.id === id ? { ...item, title: normalizeVideoTitle(limited) } : item)));
  }

  function move(index: number, to: number) {
    setFeedback(null);
    writeItems(moveVideo(items, index, to));
  }

  async function remove(id: string) {
    setConfirmRemove(null);
    setFeedback(null);
    // Premium : la vidéo est d'abord retirée chez l'hébergeur ; un échec la laisse en place.
    if (hosted.mode !== "local") {
      setRemoving(id);
      const removed = await hosted.remove(id);
      setRemoving(null);
      if (!removed) {
        setFeedback({ kind: "removeFailed" });
        return;
      }
    }
    registry.release(id);
    filesChanged();
    writeItems(items.filter((item) => item.id !== id));
  }

  async function resolveStep(write: (c: MemorialContent) => VideoStepWriteResult, action: "continue" | "skip") {
    if (busy || read.status !== "ready") return;
    setSubmitError(false);
    setPendingAction(action);
    try {
      await flush();
      const result = write(content);
      if (!result.ok) throw new Error("Video content is corrupted.");
      await saveDraft(result.content);
    } catch {
      setSubmitError(true);
      setPendingAction(null);
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

  const previewItems: VideoHommageItem[] = items.map((item) => {
    const entry = registry.get(item.id);
    // VID-09 — premium : la même règle que l'aperçu complet (une vidéo refusée
    // après mesure n'est jamais montrée comme si elle allait être publiée).
    if (hosted.mode === "hosted") return previewVideoItem(item, entry, hosted.viewOf(item.id));
    const base = { id: item.id, title: item.title, durationSeconds: item.durationSeconds };
    if (entry !== null) return { ...base, status: "ready", source: { kind: "local", url: entry.url } };
    // Premium : plus de fichier sur l'appareil, mais une version prête chez l'hébergeur (lecture signée, 720p).
    const playback = hosted.playbackOf(item.id);
    if (playback !== null) {
      return {
        ...base,
        status: "ready",
        source: { kind: "stream", url: playback.hlsUrl, posterUrl: playback.posterUrl, ...(playback.mp4Url === null ? {} : { fallbackUrl: playback.mp4Url }) },
      };
    }
    return { ...base, status: "local-unavailable" };
  });

  const addInput = (label: string, big: boolean) => (
    <label className={big ? styles.dropzone : styles.addRow} aria-disabled={busy || undefined} data-video-add="">
      <input
        type="file"
        accept="video/*"
        className={styles.hiddenInput}
        disabled={busy}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          void chooseFile(file);
        }}
      />
      <span className={styles.addText}>
        <span className={styles.addLabel}>{opening === "new" ? translate(language, "videoStep.opening") : label}</span>
        {big && <span className={styles.hint}>{translate(language, "videoStep.addHint")}</span>}
      </span>
    </label>
  );

  return (
    <BuilderScreen
      progress={progress ?? videoStepProgress(content)}
      status={<AutosaveIndicator language={language} state={autosaveState} onRetry={retryAutosave} />}
    >
      <div className={styles.copy}>
        <h1 className={styles.title}>{translate(language, "videoStep.title")}</h1>
        <p className={styles.subtitle}>{translate(language, "videoStep.subtitle")}</p>
      </div>

      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          void resolveStep((c) => commitA16(c, items), "continue");
        }}
      >
        {hosted.mode === "hosted" ? (
          <div className={styles.notice} data-video-hosted-notice="">
            <p>{translate(language, "videoStep.hostedNotice")}</p>
          </div>
        ) : (
          <div className={styles.notice} data-video-local-notice="">
            <p>{translate(language, "videoStep.localNotice")}</p>
            <p>{translate(language, "videoStep.premiumNotice")}</p>
          </div>
        )}

        {items.length > 0 && (
          <ol className={styles.register} aria-label={translate(language, "videoStep.listLabel")} data-video-register="">
            {items.map((item, index) => {
              const entry = registry.get(item.id);
              const shownTitle = videoDisplayTitle(item, index, defaultTitle);
              const inputValue = titleInputs[item.id] ?? item.title ?? "";
              const inputId = `video-title-${item.id}`;
              const hostStatus = hosted.statusOf(item.id);
              const keptRemotely = hosted.playbackOf(item.id) !== null || hostStatus?.kind === "processing";
              // VID-09 — refusée après mesure : seule la raison est affichée, avec « Remplacer ».
              const refused = hostStatus?.kind === "failed";
              const fileState = entry !== null ? "present" : keptRemotely ? "hosted" : refused ? "refused" : "missing";
              const sending = hosted.isActive(item.id);
              return (
                <li key={item.id} className={styles.item} data-video-item={item.id} data-file={fileState}>
                  <span className={styles.number} aria-hidden="true">
                    {String(index + 1).padStart(2, "0")}
                  </span>

                  <div className={styles.body}>
                    <label className={styles.fieldLabel} htmlFor={inputId}>
                      {translate(language, "videoStep.titleLabel")}
                    </label>
                    <input
                      id={inputId}
                      type="text"
                      className={styles.textInput}
                      value={inputValue}
                      placeholder={defaultTitle(index + 1)}
                      maxLength={VIDEO_HOMMAGE_MAX_TITLE_LENGTH * 4}
                      disabled={busy}
                      onChange={(event) => changeTitle(item.id, event.target.value)}
                      aria-describedby={`${inputId}-counter`}
                    />
                    <span id={`${inputId}-counter`} className={styles.counter}>
                      {translateWith(language, "videoStep.titleCounter", { count: countCharacters(inputValue) })}
                    </span>

                    <p className={styles.meta} data-video-duration={item.durationSeconds === null ? "unknown" : "known"}>
                      {item.durationSeconds === null
                        ? translate(language, "videoStep.durationUnknown")
                        : translateWith(language, "videoStep.duration", { duration: spokenVideoDuration(item.durationSeconds) })}
                    </p>
                    {fileState === "missing" && <p className={styles.state}>{translate(language, "videoStep.fileMissing")}</p>}
                    {entry !== null && !entry.metadata.playable && <p className={styles.state}>{translate(language, "videoStep.notPlayable")}</p>}
                    {hostStatus !== null && (
                      <HostingState
                        language={language}
                        status={hostStatus}
                        title={shownTitle}
                        disabled={busy}
                        onCancel={() => void hosted.cancel(item.id)}
                        onResume={() => hosted.resume(item.id, item.durationSeconds)}
                      />
                    )}
                    {hosted.previousStillPublic(item.id) && (
                      <p className={styles.hint} data-video-previous-public="">
                        {translate(language, "videoStep.replacedPublished")}
                      </p>
                    )}

                    <div className={styles.actions}>
                      <label className={styles.textAction} aria-disabled={busy || sending || undefined}>
                        <input
                          type="file"
                          accept="video/*"
                          className={styles.hiddenInput}
                          disabled={busy || sending}
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            event.target.value = "";
                            void chooseFile(file, item.id);
                          }}
                        />
                        {opening === item.id
                          ? translate(language, "videoStep.opening")
                          : translate(language, fileState === "missing" ? "videoStep.reselect" : "videoStep.replace")}
                      </label>
                      <button
                        type="button"
                        className={styles.textActionQuiet}
                        disabled={busy}
                        onClick={() => setConfirmRemove(item.id)}
                      >
                        {translate(language, "videoStep.remove")}
                      </button>
                    </div>

                    {confirmRemove === item.id && (
                      <div className={styles.confirm} role="group" aria-label={translateWith(language, "videoStep.removeConfirm", { title: shownTitle })}>
                        <p className={styles.confirmQuestion}>{translateWith(language, "videoStep.removeConfirm", { title: shownTitle })}</p>
                        <div className={styles.actions}>
                          <button type="button" className={styles.confirmAction} onClick={() => void remove(item.id)}>
                            {translate(language, "videoStep.removeYes")}
                          </button>
                          <button type="button" className={styles.confirmAction} onClick={() => setConfirmRemove(null)}>
                            {translate(language, "videoStep.removeNo")}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {items.length > 1 && (
                    <div className={styles.moves}>
                      <button
                        type="button"
                        className={styles.moveButton}
                        disabled={busy || index === 0}
                        onClick={() => move(index, index - 1)}
                        aria-label={translateWith(language, "videoStep.moveUp", { title: shownTitle })}
                      >
                        <span aria-hidden="true">↑</span>
                      </button>
                      <button
                        type="button"
                        className={styles.moveButton}
                        disabled={busy || index === items.length - 1}
                        onClick={() => move(index, index + 1)}
                        aria-label={translateWith(language, "videoStep.moveDown", { title: shownTitle })}
                      >
                        <span aria-hidden="true">↓</span>
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}

        {items.length === 0 && addInput(translate(language, "videoStep.addFirst"), true)}
        {items.length > 0 && budget.canAddAnother && timeLeft && addInput(translate(language, "videoStep.add"), false)}
        {items.length >= VIDEO_HOMMAGE_MAX_VIDEOS && <p className={styles.hint}>{translate(language, "videoStep.limitCount")}</p>}
        {items.length > 0 && items.length < VIDEO_HOMMAGE_MAX_VIDEOS && !timeLeft && (
          <p className={styles.hint}>{translate(language, "videoStep.limitTime")}</p>
        )}

        {items.length > 0 && (
          <div className={styles.budget} role="status" data-video-compliance={compliance}>
            <p>
              {translateWith(language, "videoStep.budget", { count: budget.count, used: spokenVideoDuration(budget.knownSeconds) })}
            </p>
            {compliance === "unverified" && <p className={styles.unverified}>{translate(language, "videoStep.budgetUnverified")}</p>}
          </div>
        )}

        {feedback !== null && (
          <p role="alert" className={feedback.kind === "notPlayable" ? styles.hint : styles.error} data-video-feedback={feedback.kind}>
            {feedbackText(language, feedback)}
          </p>
        )}

        {items.length > 0 && (
          <section className={styles.preview} aria-label={translate(language, "videoStep.previewLabel")} data-video-preview="">
            <p className={styles.previewNote}>{translate(language, "videoStep.previewNote")}</p>
            <div className={styles.previewBleed}>
              <VideoHommageV1 items={previewItems} skinVariant="light" language={language} headingLevel="section" />
            </div>
          </section>
        )}

        <div className={styles.stepActions}>
          <div className={screenStyles.ctaWrap}>
            <PrimaryButton type="submit" disabled={busy} pending={pendingAction === "continue"} pendingLabel={translate(language, "common.pleaseWait")}>
              {translate(language, "common.continue")}
            </PrimaryButton>
          </div>
          <button
            type="button"
            className={styles.skipLink}
            disabled={busy}
            aria-busy={pendingAction === "skip" || undefined}
            onClick={() => void resolveStep(skipA16, "skip")}
          >
            <PendingActionLabel pending={pendingAction === "skip"} pendingLabel={translate(language, "common.pleaseWait")}>
              {translate(language, "videoStep.skip")}
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

function feedbackText(language: Language, feedback: Feedback): string {
  switch (feedback.kind) {
    case "notVideo":
      return translate(language, "videoStep.errorNotVideo");
    case "unreadable":
      return translate(language, "videoStep.errorUnreadable");
    case "tooMany":
      return translate(language, "videoStep.limitCount");
    case "noTimeLeft":
      return translate(language, "videoStep.limitTime");
    case "tooLong":
      return translateWith(language, "videoStep.errorTooLong", {
        duration: spokenVideoDuration(feedback.duration),
        remaining: spokenVideoDuration(feedback.remaining),
      });
    case "notPlayable":
      return translate(language, "videoStep.notPlayable");
    case "removeFailed":
      return translate(language, "videoStep.removeFailed");
  }
}

const REFUSAL_KEYS = {
  too_many: "videoStep.refusedTooMany",
  duration: "videoStep.refusedDuration",
  unknown_pending: "videoStep.refusedUnknownPending",
  in_progress: "videoStep.refusedInProgress",
  offer: "videoStep.refusedOffer",
  other: "videoStep.refusedOther",
} as const;

const FAILURE_KEYS = {
  over_total_duration: "videoStep.hostedFailedTotal",
  too_many_videos: "videoStep.hostedFailedCount",
  duration_unavailable: "videoStep.hostedFailedDuration",
  asset_errored: "videoStep.hostedFailedProcessing",
} as const;

/**
 * VID-07 — l'état d'envoi d'une vidéo, sous sa durée : transfert et
 * progression, réception et mise en forme, disponibilité, erreur, reprise.
 * « Conservée » n'est écrit que lorsque le serveur déclare la vidéo prête.
 */
function HostingState({
  language,
  status,
  title,
  disabled,
  onCancel,
  onResume,
}: {
  language: Language;
  status: HostedItemStatus;
  title: string;
  disabled: boolean;
  onCancel: () => void;
  onResume: () => void;
}) {
  const resume = (
    <button type="button" className={styles.textAction} disabled={disabled} onClick={onResume}>
      {translate(language, "videoStep.transferResume")}
    </button>
  );
  switch (status.kind) {
    case "preparing":
      return (
        <p className={styles.state} role="status" data-video-hosting="preparing">
          {translate(language, "videoStep.transferPreparing")}
        </p>
      );
    case "sending":
      return (
        <div className={styles.hosting} data-video-hosting="sending">
          <progress
            className={styles.progress}
            max={100}
            value={status.percent}
            aria-label={translateWith(language, "videoStep.transferProgressLabel", { title })}
          />
          <p className={styles.state} aria-live="polite">
            {translateWith(language, "videoStep.transferProgress", { percent: status.percent })}
          </p>
          <div className={styles.actions}>
            <button type="button" className={styles.textActionQuiet} onClick={onCancel}>
              {translate(language, "videoStep.transferCancel")}
            </button>
          </div>
        </div>
      );
    case "processing":
      return (
        <p className={styles.state} role="status" data-video-hosting="processing">
          {translate(language, "videoStep.hostedProcessing")}
        </p>
      );
    case "ready":
      return (
        <p className={styles.state} role="status" data-video-hosting="ready">
          {translate(language, "videoStep.hostedReady")}
        </p>
      );
    case "interrupted":
      return (
        <div className={styles.hosting} role="status" data-video-hosting="interrupted">
          <p className={styles.state}>{translate(language, status.unsuccessful ? "videoStep.hostedFailedUpload" : "videoStep.transferInterrupted")}</p>
          {status.canResume ? <div className={styles.actions}>{resume}</div> : <p className={styles.hint}>{translate(language, "videoStep.transferNeedsFile")}</p>}
        </div>
      );
    case "failed":
      return (
        <p className={styles.error} role="alert" data-video-hosting="failed" data-video-failure={status.failure}>
          {translate(language, FAILURE_KEYS[status.failure])}
        </p>
      );
    case "refused":
      return (
        <div className={styles.hosting} data-video-hosting="refused" data-video-refusal={status.reason}>
          <p className={styles.error} role="alert">
            {translate(language, REFUSAL_KEYS[status.reason])}
          </p>
          {status.canResume && <div className={styles.actions}>{resume}</div>}
        </div>
      );
  }
}
