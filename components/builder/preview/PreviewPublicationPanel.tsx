"use client";

import { useEffect, useRef, useState } from "react";
import type { Language } from "@/config/languages";
import { translate, translateWith } from "@/lib/i18n/translate";
import type { PreviewPublication, PublishFromPreviewOutcome } from "@/lib/memorial/publication-preview-types";
import styles from "./PreviewPublicationPanel.module.css";

/**
 * QG 008 Lot 3 — « Publier » in the private Preview of the AUTHENTICATED
 * Builder (BuilderPreviewHost renders this only when the page hands it a
 * `publish` action; the guest Builder and the pilots never do).
 *
 * What the family sees above is exactly what would be published: the
 * server assembled the publication projection. This panel:
 * - offers the gallery choice for an `avis` with more than six photos (the
 *   six first are proposed; each change reloads the Preview, so the
 *   Preview always shows the selection that would be published);
 * - signals, discreetly, sections reserved to the complete tribute;
 * - asks for an explicit confirmation, then sends ONLY the revision, the
 *   fingerprint and the selection of the Preview currently shown — one
 *   call at a time (double clicks are ignored) — and shows the outcome.
 */

export interface PreviewPublicationPanelProps {
  language: Language;
  publication: PreviewPublication;
  publish: (revision: number, digest: string, gallerySelection?: string[]) => Promise<PublishFromPreviewOutcome>;
  /** Re-reads the Preview for this selection; `false` when it could not. */
  reload: (gallerySelection?: string[]) => Promise<boolean>;
  /** The authorized Builder route (for « Ajouter la photo principale »). */
  builderPath: string | null;
  onBackToCreation: () => void;
}

const ERROR_KEYS = {
  hero_photo_required: "publish.heroPhotoRequired",
  free_window_closed: "publish.windowClosed",
  free_quota_reached: "publish.quotaReached",
  signed_out: "publish.signedOut",
  access_refused: "publish.accessRefused",
  failed: "publish.failed",
} as const;

export function PreviewPublicationPanel({
  language,
  publication,
  publish,
  reload,
  builderPath,
  onBackToCreation,
}: PreviewPublicationPanelProps) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [outcome, setOutcome] = useState<PublishFromPreviewOutcome | null>(null);
  const inFlight = useRef(false);
  const confirmButton = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (confirming) confirmButton.current?.focus();
  }, [confirming]);

  useEffect(() => {
    if (!confirming) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !inFlight.current) {
        event.stopPropagation();
        setConfirming(false);
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [confirming]);

  const { gallery, readiness } = publication;
  const published = outcome === "published" || outcome === "already_published" || readiness === "published";

  if (published) {
    return (
      <section className={styles.panel} aria-live="polite" data-publication="done">
        <p className={styles.text}>
          <strong>
            {translate(language, outcome === "published" ? "publish.done" : "publish.alreadyPublished")}
          </strong>
        </p>
        <div className={styles.actions}>
          <button type="button" className={styles.secondary} onClick={onBackToCreation}>
            {translate(language, "preview.backToCreation")}
          </button>
        </div>
      </section>
    );
  }

  if (readiness === "unavailable") return null;

  const heroMissing = readiness === "hero_photo_required" || outcome === "hero_photo_required";
  const selection = gallery.selection;
  const busy = pending || reloading;

  async function changeSelection(mediaId: string, checked: boolean) {
    if (selection === undefined || busy) return;
    const wanted = new Set(selection);
    if (checked) wanted.add(mediaId);
    else wanted.delete(mediaId);
    if (wanted.size === 0 || (gallery.limit !== null && wanted.size > gallery.limit)) return;
    const next = gallery.choices.map((choice) => choice.mediaId).filter((id) => wanted.has(id));
    setReloading(true);
    setOutcome(null);
    try {
      await reload(next);
    } finally {
      setReloading(false);
    }
  }

  async function confirm() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    try {
      const result = await publish(publication.revision, publication.digest, selection === undefined ? undefined : [...selection]);
      if (result === "preview_outdated") {
        await reload(selection === undefined ? undefined : [...selection]);
      }
      setOutcome(result);
    } catch {
      setOutcome("failed");
    } finally {
      inFlight.current = false;
      setPending(false);
      setConfirming(false);
    }
  }

  const errorKey = outcome !== null && outcome in ERROR_KEYS ? ERROR_KEYS[outcome as keyof typeof ERROR_KEYS] : null;

  return (
    <section className={styles.panel} data-publication={heroMissing ? "hero-photo-required" : "publishable"}>
      {publication.premiumSections.length > 0 && (
        <p className={styles.notice} data-publication-premium="">
          {translate(language, "publish.premiumNotice")}
        </p>
      )}

      {selection !== undefined && (
        <fieldset className={styles.choices} disabled={busy} data-publication-gallery="">
          <legend className={styles.text}>
            {translateWith(language, "publish.gallerySelection", { selected: selection.length, total: gallery.total })}{" "}
            {translate(language, "publish.galleryLimit")}
          </legend>
          {gallery.choices.map((choice, index) => {
            const selected = selection.includes(choice.mediaId);
            const full = gallery.limit !== null && selection.length >= gallery.limit;
            const label = translateWith(language, "publish.galleryPhoto", { index: index + 1 });
            return (
              <label key={choice.mediaId} className={styles.choice} data-selected={selected}>
                {choice.readUrl !== null ? (
                  // eslint-disable-next-line @next/next/no-img-element -- owner-only signed URL, never optimized
                  <img src={choice.readUrl} alt="" />
                ) : (
                  <span className={styles.thumbMissing} aria-hidden="true" />
                )}
                <span>
                  <input
                    type="checkbox"
                    checked={selected}
                    disabled={!selected && full}
                    onChange={(event) => void changeSelection(choice.mediaId, event.currentTarget.checked)}
                  />{" "}
                  {label}
                </span>
              </label>
            );
          })}
        </fieldset>
      )}

      {outcome === "preview_outdated" && (
        <p role="status" className={styles.notice}>
          {translate(language, "publish.outdated")}
        </p>
      )}

      {heroMissing ? (
        <div className={styles.actions}>
          <p role="alert" className={styles.alert}>
            {translate(language, "publish.heroPhotoRequired")}
          </p>
          {builderPath !== null && (
            <a className={styles.secondary} href={`${builderPath}?etape=T06`}>
              {translate(language, "publish.addHeroPhoto")}
            </a>
          )}
        </div>
      ) : (
        <>
          {errorKey !== null && errorKey !== "publish.heroPhotoRequired" && (
            <p role="alert" className={styles.alert}>
              {translate(language, errorKey)}
            </p>
          )}
          {outcome === "signed_out" && builderPath !== null && (
            <a className={styles.secondary} href={`/login?next=${encodeURIComponent(builderPath)}`}>
              {translate(language, "publish.signIn")}
            </a>
          )}
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.primary}
              disabled={busy}
              onClick={() => setConfirming(true)}
              data-publication-cta=""
            >
              {translate(language, "publish.cta")}
            </button>
          </div>
        </>
      )}

      {confirming && (
        <div className={styles.dialogBackdrop}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="publication-confirm-title"
            aria-describedby="publication-confirm-body"
            className={styles.dialog}
          >
            <h2 id="publication-confirm-title" className={styles.dialogTitle}>
              {translate(language, "publish.confirmTitle")}
            </h2>
            <p id="publication-confirm-body" className={styles.text}>
              {translate(language, "publish.confirmBody")}
            </p>
            <div className={styles.actions}>
              <button
                ref={confirmButton}
                type="button"
                className={styles.primary}
                disabled={pending}
                aria-busy={pending}
                onClick={() => void confirm()}
                data-publication-confirm=""
              >
                {translate(language, pending ? "publish.pending" : "publish.confirm")}
              </button>
              <button type="button" className={styles.secondary} disabled={pending} onClick={() => setConfirming(false)}>
                {translate(language, "publish.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
