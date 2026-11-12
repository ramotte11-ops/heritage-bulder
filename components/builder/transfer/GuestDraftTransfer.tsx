"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  beginGuestDraftTransferAction,
  commitGuestDraftTransferAction,
  recordGuestTransferPhotoAction,
} from "@/app/brouillon/reprise/actions";
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
import { translate, translateWith } from "@/lib/i18n/translate";
import { uploadAuthenticatedGalleryPhoto } from "@/lib/media/authenticated-gallery-upload";
import { DURABLE_SAVE_FALLBACK_LANGUAGE } from "./durable-save-language";
import {
  runGuestDraftTransfer,
  type GuestTransferProgress,
  type GuestTransferRunResult,
} from "./run-guest-draft-transfer";
import styles from "./DurableSave.module.css";

/**
 * QG 008 Lot 2 — /brouillon/reprise, once the magic link is followed in
 * this browser: transfers the local guest draft to ONE durable draft of
 * the verified owner, then opens it in the Builder (the same Builder,
 * resumed at the step the family reached). See run-guest-draft-transfer.ts
 * for the order of operations and why nothing is ever lost.
 */
export function GuestDraftTransfer() {
  const router = useRouter();
  const started = useRef(false);
  const [progress, setProgress] = useState<GuestTransferProgress>({ phase: "starting" });
  const [result, setResult] = useState<GuestTransferRunResult | null>(null);

  const run = useCallback(async () => {
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
    if (outcome.status === "done") router.replace(`/builder/${outcome.memorialId}`);
  }, [router]);

  useEffect(() => {
    // StrictMode mounts twice in development; the transfer is idempotent
    // on the server, but one run per page is enough.
    if (started.current) return;
    started.current = true;
    void run();
  }, [run]);

  const language: Language =
    (result !== null && "language" in result && result.language) || DURABLE_SAVE_FALLBACK_LANGUAGE;

  if (result === null || result.status === "done") {
    const text =
      result?.status === "done"
        ? translate(language, "durableSave.done")
        : progress.phase === "photos" && progress.total > 0
          ? translateWith(language, "durableSave.uploadingPhotos", { done: progress.done, total: progress.total })
          : translate(language, "durableSave.transferring");
    return <p role="status" className={styles.text} data-guest-transfer="running">{text}</p>;
  }

  switch (result.status) {
    case "no_local_draft":
      return (
        <div data-guest-transfer="no-local-draft">
          <p className={styles.text}>{translate(language, "durableSave.noLocalDraft")}</p>
          <div className={styles.actions}>
            <a className={styles.secondary} href="/owner">{translate(language, "durableSave.openExisting")}</a>
            <a className={styles.secondary} href="/creer">{translate(language, "durableSave.backToBuilder")}</a>
          </div>
        </div>
      );
    case "active_draft_exists":
      return (
        <div data-guest-transfer="active-draft-exists">
          <p className={styles.text}>{translate(language, "durableSave.activeDraftExists")}</p>
          <div className={styles.actions}>
            <a className={styles.primary} href={result.memorialId ? `/builder/${result.memorialId}` : "/owner"}>
              {translate(language, "durableSave.openExisting")}
            </a>
            <a className={styles.secondary} href="/creer">{translate(language, "durableSave.backToBuilder")}</a>
          </div>
        </div>
      );
    case "unauthenticated":
      return (
        <div data-guest-transfer="unauthenticated">
          <p className={styles.text}>{translate(language, "durableSave.signInAgain")}</p>
          <a className={styles.primary} href="/brouillon/sauvegarder">{translate(language, "durableSave.submit")}</a>
        </div>
      );
    case "identity_refused":
      return (
        <p role="alert" className={styles.alert} data-guest-transfer="identity-refused">
          {translate(language, "durableSave.identityRefused")}
        </p>
      );
    case "failed":
      return (
        <div data-guest-transfer="failed">
          <p role="alert" className={styles.alert}>{translate(language, "durableSave.failed")}</p>
          <div className={styles.actions}>
            <button type="button" className={styles.primary} onClick={() => void run()}>
              {translate(language, "durableSave.retry")}
            </button>
            <a className={styles.secondary} href="/creer">{translate(language, "durableSave.backToBuilder")}</a>
          </div>
        </div>
      );
  }
}
