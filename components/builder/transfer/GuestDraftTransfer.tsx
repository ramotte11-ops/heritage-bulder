"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  beginGuestDraftTransferAction,
  commitGuestDraftTransferAction,
  previewGuestDraftSaveAction,
  recordGuestTransferPhotoAction,
} from "@/app/brouillon/reprise/actions";
import { signOutGuestDraftAccountAction } from "@/app/brouillon/reprise/change-account-action";
import {
  finalizeHeroPhotoUploadAction,
  reserveHeroPhotoUploadAction,
} from "@/app/builder/[memorialId]/media-actions";
import {
  finalizeGalleryPhotoUploadAction,
  reserveGalleryPhotoUploadAction,
} from "@/app/builder/[memorialId]/gallery-media-actions";
import type { Language } from "@/config/languages";
import { createIndexedDbGuestDraftV3Store } from "@/lib/guest-draft/guest-draft-v3-store";
import type { PreviewGuestSaveResult } from "@/lib/guest-draft/guest-draft-transfer";
import { serializableGuestDraft } from "@/lib/guest-draft/guest-transfer-plan";
import { translate, translateWith } from "@/lib/i18n/translate";
import { uploadAuthenticatedGalleryPhoto } from "@/lib/media/authenticated-gallery-upload";
import { DURABLE_SAVE_FALLBACK_LANGUAGE } from "./durable-save-language";
import {
  runGuestDraftTransfer,
  type GuestTransferProgress,
  type GuestTransferRunResult,
} from "./run-guest-draft-transfer";
import styles from "./DurableSave.module.css";

type SavePreview = Extract<PreviewGuestSaveResult, { status: "preview" }>;
type PreflightStatus =
  | "loading"
  | "preview"
  | "no_local_draft"
  | "refused"
  | "unauthenticated"
  | "identity_refused"
  | "failed"
  | "transferring";

const DATE_LOCALES: Record<Language, string> = {
  fr: "fr-FR",
  en: "en-GB",
  es: "es-ES",
};

function deadline(iso: string | null, language: Language): string | null {
  if (iso === null) return null;
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return null;
  return new Intl.DateTimeFormat(DATE_LOCALES[language], {
    dateStyle: "long",
    timeZone: "Europe/Paris",
  }).format(value);
}

/**
 * QG 017 — the connected account and the database preview are shown before
 * any new durable transfer. The sole automatic path is `resume`: the database
 * has proved that this exact local transfer already exists, so its interrupted
 * work can continue without creating or re-anchoring anything.
 */
export function GuestDraftTransfer({
  accountEmail,
  fallbackLanguage = DURABLE_SAVE_FALLBACK_LANGUAGE,
}: {
  accountEmail: string;
  fallbackLanguage?: Language;
}) {
  const router = useRouter();
  const initialized = useRef(false);
  const [language, setLanguage] = useState<Language>(fallbackLanguage);
  const [status, setStatus] = useState<PreflightStatus>("loading");
  const [preview, setPreview] = useState<SavePreview | null>(null);
  const [progress, setProgress] = useState<GuestTransferProgress>({ phase: "starting" });
  const [result, setResult] = useState<GuestTransferRunResult | null>(null);
  const [changingAccount, setChangingAccount] = useState(false);
  const [changeAccountFailed, setChangeAccountFailed] = useState(false);

  const run = useCallback(async () => {
    setStatus("transferring");
    setResult(null);
    const store = createIndexedDbGuestDraftV3Store();
    const outcome = await runGuestDraftTransfer({
      readLocalDraft: () => store.read(),
      readLocalPhoto: async (localId) => {
        const read = await store.readPhoto(localId);
        return read.ok ? read.asset : null;
      },
      clearLocalDraft: async () => {
        await store.clear();
      },
      begin: (draft) => beginGuestDraftTransferAction(draft),
      upload: (memorialId, purpose, file) =>
        purpose === "hero"
          ? uploadAuthenticatedGalleryPhoto(
              file,
              (type) => reserveHeroPhotoUploadAction(memorialId, type),
              (mediaId) => finalizeHeroPhotoUploadAction(memorialId, mediaId),
            )
          : uploadAuthenticatedGalleryPhoto(
              file,
              (type) => reserveGalleryPhotoUploadAction(memorialId, type),
              (mediaId) => finalizeGalleryPhotoUploadAction(memorialId, mediaId),
            ),
      record: (transferKey, localId, mediaId, purpose) =>
        recordGuestTransferPhotoAction(transferKey, localId, mediaId, purpose),
      commit: (draft) => commitGuestDraftTransferAction(draft),
      onProgress: setProgress,
    });
    setResult(outcome);
    if (outcome.status === "done") {
      router.replace(`/builder/${outcome.memorialId}?sauvegarde=1`);
      return;
    }
    setStatus("preview");
  }, [router]);

  const loadPreview = useCallback(async () => {
    setStatus("loading");
    setResult(null);
    setPreview(null);
    const store = createIndexedDbGuestDraftV3Store();
    let read: Awaited<ReturnType<typeof store.read>>;
    try {
      read = await store.read();
    } catch {
      setStatus("failed");
      return;
    }
    if (read.status === "empty") {
      setStatus("no_local_draft");
      return;
    }
    if (read.status !== "ready") {
      setStatus("failed");
      return;
    }

    const draftLanguage = read.draft.language ?? fallbackLanguage;
    setLanguage(draftLanguage);
    let outcome: PreviewGuestSaveResult;
    try {
      outcome = await previewGuestDraftSaveAction(serializableGuestDraft(read.draft));
    } catch {
      setStatus("failed");
      return;
    }

    if (outcome.status === "preview") {
      setPreview(outcome);
      if (outcome.outcome === "resume") {
        await run();
        return;
      }
      setStatus("preview");
      return;
    }
    setStatus(
      outcome.status === "unauthenticated"
        ? "unauthenticated"
        : outcome.status === "identity_refused"
          ? "identity_refused"
          : "refused",
    );
  }, [fallbackLanguage, run]);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    void loadPreview();
  }, [loadPreview]);

  async function changeAccount() {
    if (changingAccount) return;
    setChangingAccount(true);
    setChangeAccountFailed(false);
    const signedOut = await signOutGuestDraftAccountAction();
    if (!signedOut.ok) {
      setChangeAccountFailed(true);
      setChangingAccount(false);
      return;
    }
    router.replace(`/brouillon/sauvegarder?langue=${language}`);
    router.refresh();
  }

  const changeAccountControl = status !== "transferring" ? (
    <>
      <button
        type="button"
        className={styles.secondary}
        disabled={changingAccount}
        onClick={() => void changeAccount()}
      >
        {translate(language, changingAccount ? "durableSave.changingAccount" : "durableSave.changeAccount")}
      </button>
      {changeAccountFailed ? (
        <p role="alert" className={styles.alert}>{translate(language, "durableSave.changeAccountFailed")}</p>
      ) : null}
    </>
  ) : null;

  let content;
  if (status === "loading") {
    content = <p role="status" className={styles.text}>{translate(language, "durableSave.previewing")}</p>;
  } else if (status === "transferring" || result?.status === "done") {
    const text =
      progress.phase === "photos" && progress.total > 0
        ? translateWith(language, "durableSave.uploadingPhotos", { done: progress.done, total: progress.total })
        : translate(language, "durableSave.transferring");
    content = <p role="status" className={styles.text} data-guest-transfer="running">{text}</p>;
  } else if (result !== null) {
    content = resultContent(result, language, preview, run);
  } else if (status === "no_local_draft") {
    content = (
      <div data-guest-transfer="no-local-draft">
        <p className={styles.text}>{translate(language, "durableSave.noLocalDraft")}</p>
        <div className={styles.actions}>
          <a className={styles.secondary} href="/owner">{translate(language, "durableSave.openExisting")}</a>
          <a className={styles.secondary} href="/creer">{translate(language, "durableSave.backToBuilder")}</a>
        </div>
      </div>
    );
  } else if (status === "unauthenticated") {
    content = (
      <div data-guest-transfer="unauthenticated">
        <p className={styles.text}>{translate(language, "durableSave.signInAgain")}</p>
        <a className={styles.primary} href={`/brouillon/sauvegarder?langue=${language}`}>
          {translate(language, "durableSave.submit")}
        </a>
      </div>
    );
  } else if (status === "failed") {
    content = <Failure language={language} retry={loadPreview} />;
  } else if (status === "refused" || status === "identity_refused") {
    content = (
      <div data-guest-transfer="preview-refused">
        <p role="alert" className={styles.alert}>{translate(language, "durableSave.previewRefused")}</p>
        <div className={styles.actions}>
          <button type="button" className={styles.primary} onClick={() => void loadPreview()}>
            {translate(language, "durableSave.retry")}
          </button>
        </div>
      </div>
    );
  } else if (preview?.outcome === "limit_reached") {
    content = <LimitReached language={language} max={preview.maxFreeDrafts} />;
  } else if (preview !== null) {
    const draftUntil = deadline(preview.freeDraftUntil, language);
    const publishUntil = deadline(preview.freePublishUntil, language);
    content = (
      <section className={styles.notice} data-guest-transfer="preview" data-preview-outcome={preview.outcome}>
        {preview.outcome === "resume" ? (
          <p className={styles.text}>{translate(language, "durableSave.resumeAlreadySaved")}</p>
        ) : null}
        {draftUntil !== null ? (
          <p className={styles.text}>{translateWith(language, "durableSave.createDraftUntil", { date: draftUntil })}</p>
        ) : null}
        <p className={styles.text}>
          {publishUntil !== null
            ? translateWith(language, "durableSave.freePublicationAvailable", { date: publishUntil })
            : translate(language, "durableSave.freePublicationUnavailable")}
        </p>
        <p className={styles.text}>
          {translateWith(language, "durableSave.activeDraftCount", {
            count: preview.activeFreeDrafts + (preview.outcome === "create" ? 1 : 0),
            max: preview.maxFreeDrafts,
          })}
        </p>
        {preview.outcome === "create" ? (
          <div className={styles.actions}>
            <button type="button" className={styles.primary} onClick={() => void run()}>
              {translate(language, "common.continue")}
            </button>
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <div lang={language} data-guest-transfer-account="">
      <p className={styles.text} data-account-email="">
        <strong>{translateWith(language, "durableSave.connectedAccount", { email: accountEmail })}</strong>
      </p>
      {content}
      {changeAccountControl !== null ? <div className={styles.actions}>{changeAccountControl}</div> : null}
    </div>
  );
}

function LimitReached({ language, max }: { language: Language; max: number }) {
  return (
    <div data-guest-transfer="limit-reached">
      <p role="alert" className={styles.alert}>
        {translateWith(language, "durableSave.limitReached", { max })}
      </p>
      <div className={styles.actions}>
        <a className={styles.primary} href={`/owner?langue=${language}`}>
          {translate(language, "durableSave.openExisting")}
        </a>
      </div>
    </div>
  );
}

function Failure({ language, retry, storage = false }: { language: Language; retry: () => Promise<void>; storage?: boolean }) {
  return (
    <div data-guest-transfer="failed">
      <p role="alert" className={styles.alert}>
        {translate(language, storage ? "durableSave.storageBudgetReached" : "durableSave.failed")}
      </p>
      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={() => void retry()}>
          {translate(language, "durableSave.retry")}
        </button>
        <a className={styles.secondary} href="/creer">{translate(language, "durableSave.backToBuilder")}</a>
      </div>
    </div>
  );
}

function resultContent(
  result: Exclude<GuestTransferRunResult, { status: "done" }>,
  language: Language,
  preview: SavePreview | null,
  retry: () => Promise<void>,
) {
  switch (result.status) {
    case "no_local_draft":
      return <p className={styles.text}>{translate(language, "durableSave.noLocalDraft")}</p>;
    case "active_draft_exists":
      return <LimitReached language={language} max={preview?.maxFreeDrafts ?? 3} />;
    case "unauthenticated":
      return <p className={styles.text}>{translate(language, "durableSave.signInAgain")}</p>;
    case "identity_refused":
      return <p role="alert" className={styles.alert}>{translate(language, "durableSave.previewRefused")}</p>;
    case "failed":
      return <Failure language={language} retry={retry} storage={result.reason === "storage_budget_reached"} />;
  }
}
