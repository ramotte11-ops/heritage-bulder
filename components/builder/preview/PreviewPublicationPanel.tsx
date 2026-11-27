"use client";

import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import type { Language } from "@/config/languages";
import { translate, translateWith } from "@/lib/i18n/translate";
import type { PreviewPublication, PublishFromPreviewOutcome } from "@/lib/memorial/publication-preview-types";
import { PendingActionLabel } from "../PendingActionLabel";
import { heroPhotoPath } from "./hero-photo-path";
import styles from "./PreviewPublicationPanel.module.css";

// QG 004-B — loaded only when an authenticated publication is refused for an
// unverified address: the guest Builder (/creer), which shares this panel's
// module graph, must never statically reach a Server Action or Supabase
// (components/builder/guest/guest-import-graph.test.ts).
const EmailVerificationStep = lazy(() =>
  import("@/components/auth/EmailVerificationStep").then((module) => ({ default: module.EmailVerificationStep })),
);

/**
 * QG 008 Lot 3 — « Publier » in the private Preview of the AUTHENTICATED
 * Builder (BuilderPreviewHost renders this only when the page hands it a
 * `publish` action; the guest Builder and the pilots never do).
 *
 * VID-15 (décision PO) — this panel comes AFTER the memorial: the Preview
 * opens on the Hero, never on a form. What is published is the server's
 * publication projection (its fingerprint is what « Publier » sends); the
 * Preview above may additionally show, marked « aperçu seulement », a
 * prepared video of an `avis`. This panel:
 * - signals, discreetly, sections reserved to the complete tribute;
 * - « Publier » opens an explicit confirmation; for an `avis` with more than
 *   six photos, the gallery choice is made THERE, in the publication step
 *   (the six first are proposed; each change reloads the Preview and its
 *   fingerprint), never above the Hero;
 * - « Confirmer » sends ONLY the revision, the fingerprint and the
 *   selection currently shown — one call at a time (double clicks are
 *   ignored) — and shows the outcome.
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
  const [reloadFailed, setReloadFailed] = useState(false);
  const [outcome, setOutcome] = useState<PublishFromPreviewOutcome | null>(null);
  const [justVerified, setJustVerified] = useState(false);
  // QG 004-B — the proof is recorded: back to « Publier », the family's click.
  const verified = useCallback(() => {
    setOutcome(null);
    setJustVerified(true);
  }, []);
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
    setReloadFailed(false);
    setOutcome(null);
    try {
      setReloadFailed(!(await reload(next)));
    } catch {
      setReloadFailed(true);
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

      {outcome === "preview_outdated" && (
        <p role="status" className={styles.notice}>
          {translate(language, "publish.outdated")}
        </p>
      )}

      {/* QG 004-B — once, before the first publication: prove the address. */}
      {outcome === "email_unverified" && (
        <Suspense
          fallback={
            <p className={styles.notice} data-email-verification-loading="">
              <PendingActionLabel pending pendingLabel={translate(language, "common.pleaseWait")}>
                {null}
              </PendingActionLabel>
            </p>
          }
        >
          <EmailVerificationStep
            language={language}
            onVerified={verified}
            classNames={{
              root: styles.choices,
              form: styles.actions,
              field: styles.verifyField,
              primary: styles.primary,
              secondary: styles.secondary,
              notice: styles.notice,
              alert: styles.alert,
            }}
          />
        </Suspense>
      )}
      {justVerified && outcome === null && (
        <p role="status" className={styles.notice} data-publication-verified="">
          {translate(language, "verify.readyToPublish")}
        </p>
      )}

      {heroMissing ? (
        <div className={styles.actions}>
          <p role="alert" className={styles.alert}>
            {translate(language, "publish.heroPhotoRequired")}
          </p>
          {builderPath !== null && (
            <a className={styles.secondary} href={heroPhotoPath(builderPath) ?? undefined}>
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
            {selection !== undefined && (
              <>
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
                {reloading && (
                  <p className={styles.notice} data-publication-gallery-loading="">
                    <PendingActionLabel pending pendingLabel={translate(language, "common.pleaseWait")}>
                      {null}
                    </PendingActionLabel>
                  </p>
                )}
                {reloadFailed && (
                  <p role="alert" className={styles.alert} data-publication-gallery-error="">
                    {translate(language, "preview.unavailable")}
                  </p>
                )}
              </>
            )}
            <p id="publication-confirm-body" className={styles.text}>
              {translate(language, "publish.confirmBody")}
            </p>
            {publication.accessLevel === "avis" && publication.otherActiveFreeDrafts > 0 ? (
              <p className={styles.notice} data-free-publication-warning="">
                {translate(language, "publish.freeAccountWarning")}
              </p>
            ) : null}
            <div className={styles.actions}>
              <button
                ref={confirmButton}
                type="button"
                className={styles.primary}
                disabled={busy}
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
