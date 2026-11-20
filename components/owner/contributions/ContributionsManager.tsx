"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Language } from "@/config/languages";
import type { TranslationKey } from "@/lib/i18n/keys";
import { translate, translateWith } from "@/lib/i18n/translate";
import {
  deleteFamilyContribution,
  getFamilyContributions,
  getPendingContributionCounts,
  moderateFamilyContribution,
} from "@/lib/memorial/contributions/family-contribution-actions";
import familyStyles from "../FamilySpace.module.css";
import {
  allowedActions,
  CONTRIBUTIONS_PAGE_SIZE,
  STATUS_LABELS,
  TYPE_LABELS,
  VIEW_EMPTY,
  type ContributionCursor,
  type ContributionListResult,
  type ContributionView,
  type FamilyContributionItem,
  type ModerationAction,
} from "./contribution-views";
import styles from "./FamilyContributions.module.css";

/**
 * Lot 3 — the contributions of ONE tribute, in ONE view (à examiner,
 * publiées, masquées, refusées), and the family's moderation.
 *
 * Every decision is the server's (contract E5): the screen sends only the
 * contribution id and the action, never an owner id; the session decides.
 * No optimistic update: an item leaves the view only once the server has
 * answered, and the screen then shows the REAL state it reports —
 * `unchanged` is a success, `invalid_transition` replaces the displayed
 * state (or removes the item), `denied` on a deletion removes it,
 * `unavailable` changes nothing. The pending counter is re-read after every
 * moderation. Visitors' words are rendered as text, never as HTML.
 *
 * Photographs: short-lived signed URLs (5 min), never stored; an image that
 * fails to load triggers ONE fresh read of the loaded items.
 */

type Notice = { tone: "done" | "info" | "error"; key: TranslationKey };

const DONE: Record<ModerationAction, TranslationKey> = {
  approve: "owner.contribDoneApprove",
  reject: "owner.contribDoneReject",
  hide: "owner.contribDoneHide",
  unhide: "owner.contribDoneUnhide",
};

const ACTION_LABELS: Record<ModerationAction, TranslationKey> = {
  approve: "owner.contribApprove",
  reject: "owner.contribReject",
  hide: "owner.contribHide",
  unhide: "owner.contribUnhide",
};

const DATE_LOCALES: Record<Language, string> = { fr: "fr-FR", en: "en-GB", es: "es-ES" };

/** Re-reading for fresh photo URLs is throttled: never more than once a minute. */
const PHOTO_REFRESH_INTERVAL_MS = 60_000;

function formatReceived(iso: string, language: Language): string | null {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? null
    : new Intl.DateTimeFormat(DATE_LOCALES[language], { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Paris" }).format(date);
}

function mergeUnique(current: readonly FamilyContributionItem[], next: readonly FamilyContributionItem[]): FamilyContributionItem[] {
  const seen = new Set(current.map((item) => item.id));
  return [...current, ...next.filter((item) => !seen.has(item.id))];
}

async function safely<T>(call: () => Promise<T>): Promise<T | { status: "unavailable" }> {
  try {
    return await call();
  } catch {
    return { status: "unavailable" };
  }
}

export function ContributionsManager({
  memorialId,
  view,
  language,
  initial,
  onPendingChange,
}: {
  memorialId: string;
  view: ContributionView;
  language: Language;
  initial: ContributionListResult;
  /** The re-read pending total (or `null` when it could not be read). */
  onPendingChange?: (pending: number | null) => void;
}) {
  const [items, setItems] = useState<FamilyContributionItem[]>(initial.status === "ok" ? initial.items : []);
  const [cursor, setCursor] = useState<ContributionCursor>(initial.status === "ok" ? initial.nextCursor : null);
  const [available, setAvailable] = useState(initial.status === "ok");
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState<"more" | "reload" | null>(null);
  /** Lot 3 (PO) : refus et suppression sont définitifs — confirmés d'abord. */
  const [confirming, setConfirming] = useState<{ id: string; kind: "reject" | "delete" } | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const noticeRef = useRef<HTMLParagraphElement | null>(null);
  const focusNotice = useRef(false);
  const lastPhotoRefresh = useRef(0);
  const restoreFocus = useRef<string | null>(null);

  useEffect(() => {
    if (focusNotice.current && notice !== null) {
      focusNotice.current = false;
      noticeRef.current?.focus();
    }
  }, [notice]);

  useEffect(() => {
    const target = restoreFocus.current;
    if (target === null) return;
    restoreFocus.current = null;
    document.querySelector<HTMLElement>(target)?.focus();
  });

  const announce = useCallback((next: Notice, moveFocus: boolean) => {
    focusNotice.current = moveFocus;
    setNotice(next);
  }, []);

  const refreshPending = useCallback(async () => {
    if (onPendingChange === undefined) return;
    const result = await safely(() => getPendingContributionCounts(memorialId));
    if (result.status !== "ok") {
      onPendingChange(null);
      return;
    }
    onPendingChange(result.counts.find((row) => row.memorialId === memorialId)?.pendingTotal ?? 0);
  }, [memorialId, onPendingChange]);

  /** Reconcile one item with the state the SERVER reports (`null`: gone). */
  const reconcile = useCallback(
    (id: string, status: FamilyContributionItem["status"] | null) => {
      setItems((current) =>
        status === null || status !== view
          ? current.filter((item) => item.id !== id)
          : current.map((item) => (item.id === id ? { ...item, status } : item)),
      );
    },
    [view],
  );

  /** A fresh read of what is loaded (new photo URLs, or the real state after a refusal). */
  const reload = useCallback(async () => {
    setLoading("reload");
    const limit = Math.min(100, Math.max(CONTRIBUTIONS_PAGE_SIZE, items.length));
    const result = await safely(() => getFamilyContributions({ memorialId, status: view, limit }));
    setLoading(null);
    if (result.status !== "ok") {
      if (items.length === 0) setAvailable(false);
      return false;
    }
    setAvailable(true);
    setItems(result.items);
    setCursor(result.nextCursor);
    return true;
  }, [items.length, memorialId, view]);

  async function loadMore() {
    if (cursor === null) return;
    setLoading("more");
    const result = await safely(() => getFamilyContributions({ memorialId, status: view, limit: CONTRIBUTIONS_PAGE_SIZE, before: cursor }));
    setLoading(null);
    if (result.status !== "ok") {
      announce({ tone: "error", key: "owner.contribFailure" }, false);
      return;
    }
    setItems((current) => mergeUnique(current, result.items));
    setCursor(result.nextCursor);
  }

  async function moderate(item: FamilyContributionItem, action: ModerationAction) {
    setBusy(item.id);
    setNotice(null);
    const result = await safely(() => moderateFamilyContribution(item.id, action));
    setBusy(null);
    setConfirming(null);
    switch (result.status) {
      case "ok":
        reconcile(item.id, result.contributionStatus);
        announce({ tone: "done", key: DONE[action] }, true);
        void refreshPending();
        return;
      case "invalid_transition":
        reconcile(item.id, result.contributionStatus);
        announce({ tone: "info", key: "owner.contribChanged" }, true);
        void refreshPending();
        return;
      case "denied":
        announce({ tone: "error", key: "owner.contribDenied" }, true);
        await reload();
        void refreshPending();
        return;
      default:
        announce({ tone: "error", key: "owner.contribFailure" }, true);
    }
  }

  async function remove(item: FamilyContributionItem) {
    setBusy(item.id);
    setNotice(null);
    const result = await safely(() => deleteFamilyContribution(item.id));
    setBusy(null);
    setConfirming(null);
    if (result.status === "ok") {
      reconcile(item.id, null);
      announce({ tone: "done", key: "owner.contribDoneDelete" }, true);
      void refreshPending();
      return;
    }
    if (result.status === "denied") {
      // Already deleted elsewhere (E5 § 3.4): the item goes.
      reconcile(item.id, null);
      announce({ tone: "info", key: "owner.contribChanged" }, true);
      void refreshPending();
      return;
    }
    announce({ tone: "error", key: "owner.contribFailure" }, true);
  }

  function onPhotoError() {
    const now = Date.now();
    if (now - lastPhotoRefresh.current < PHOTO_REFRESH_INTERVAL_MS) return;
    lastPhotoRefresh.current = now;
    void reload();
  }

  if (!available) {
    return (
      <div className={styles.unavailable} data-contributions-unavailable="">
        <p role="alert" className={familyStyles.alert}>
          {translate(language, "owner.contribUnavailable")}
        </p>
        <button type="button" className={familyStyles.pill} onClick={() => void reload()} aria-busy={loading === "reload" || undefined} disabled={loading !== null}>
          {loading === "reload" ? translate(language, "owner.contribLoading") : translate(language, "owner.contribRetry")}
        </button>
      </div>
    );
  }

  return (
    <div className={styles.manager} data-contributions-view={view}>
      <p
        ref={noticeRef}
        tabIndex={-1}
        role="status"
        aria-live="polite"
        className={styles.notice}
        data-tone={notice?.tone}
        hidden={notice === null}
      >
        {notice !== null ? translate(language, notice.key) : null}
      </p>

      {items.length === 0 ? (
        <p className={`${familyStyles.featureEmpty} ${styles.empty}`} data-contributions-empty="">
          {translate(language, VIEW_EMPTY[view])}
        </p>
      ) : (
        <ul className={styles.list}>
          {items.map((item) => (
            <li key={item.id}>
              <ContributionItem
                item={item}
                language={language}
                busy={busy === item.id}
                locked={busy !== null && busy !== item.id}
                confirming={confirming?.id === item.id ? confirming.kind : null}
                onModerate={(action) => {
                  if (action === "reject") {
                    // Définitif, sans réapprobation : confirmé d'abord (décision PO).
                    setConfirming({ id: item.id, kind: "reject" });
                    restoreFocus.current = `[data-confirm-cancel="${item.id}"]`;
                    return;
                  }
                  void moderate(item, action);
                }}
                onAskDelete={() => {
                  setConfirming({ id: item.id, kind: "delete" });
                  restoreFocus.current = `[data-confirm-cancel="${item.id}"]`;
                }}
                onCancelConfirm={() => {
                  const kind = confirming?.kind;
                  setConfirming(null);
                  restoreFocus.current =
                    kind === "reject" ? `[data-contribution-id="${item.id}"] [data-contribution-action="reject"]` : `[data-contribution-delete="${item.id}"]`;
                }}
                onConfirm={() => void (confirming?.kind === "reject" ? moderate(item, "reject") : remove(item))}
                onPhotoError={onPhotoError}
              />
            </li>
          ))}
        </ul>
      )}

      {cursor !== null ? (
        <p className={styles.more}>
          <button type="button" className={familyStyles.pill} onClick={() => void loadMore()} disabled={loading !== null} aria-busy={loading === "more" || undefined} data-contributions-more="">
            {loading === "more" ? translate(language, "owner.contribLoading") : translate(language, "owner.contribMore")}
          </button>
        </p>
      ) : null}
    </div>
  );
}

function ContributionItem({
  item,
  language,
  busy,
  locked,
  confirming,
  onModerate,
  onAskDelete,
  onCancelConfirm,
  onConfirm,
  onPhotoError,
}: {
  item: FamilyContributionItem;
  language: Language;
  busy: boolean;
  locked: boolean;
  /** Which definitive action awaits confirmation on this item, if any. */
  confirming: "reject" | "delete" | null;
  onModerate: (action: ModerationAction) => void;
  onAskDelete: () => void;
  onCancelConfirm: () => void;
  onConfirm: () => void;
  onPhotoError: () => void;
}) {
  const { moderate, canDelete } = allowedActions(item);
  const received = formatReceived(item.createdAt, language);
  const headingId = `contribution-${item.id}`;
  const disabled = busy || locked;

  return (
    <article className={styles.item} data-contribution-id={item.id} data-status={item.status} data-type={item.type} aria-labelledby={headingId} aria-busy={busy || undefined}>
      <header className={styles.itemHead}>
        <h3 id={headingId} className={styles.author}>
          {item.authorName}
        </h3>
        <p className={styles.chips}>
          <span className={styles.chip} data-chip="type">
            {translate(language, TYPE_LABELS[item.type])}
          </span>
          <span className={styles.chip} data-chip="status" data-status={item.status}>
            {translate(language, STATUS_LABELS[item.status])}
          </span>
        </p>
      </header>
      {received !== null ? (
        <p className={styles.date}>
          <time dateTime={item.createdAt}>{translateWith(language, "owner.contribReceived", { date: received })}</time>
        </p>
      ) : null}

      {item.type === "photo" ? (
        <figure className={styles.figure}>
          {item.photo !== null ? (
            // A short-lived signed URL of the private bucket, never cached: not
            // a candidate for the image optimizer (same rule as the Hero).
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className={styles.photo}
              src={item.photo.url}
              width={item.photo.width ?? undefined}
              height={item.photo.height ?? undefined}
              alt={translateWith(language, "owner.contribPhotoAlt", { name: item.authorName })}
              loading="lazy"
              decoding="async"
              onError={onPhotoError}
            />
          ) : (
            <p className={styles.preparing}>{translate(language, "owner.contribPhotoPreparing")}</p>
          )}
          {item.caption ? <figcaption className={styles.text}>{item.caption}</figcaption> : null}
        </figure>
      ) : item.content ? (
        <p className={styles.text}>{item.content}</p>
      ) : null}

      {item.type === "memory_message" ? <p className={styles.note}>{translate(language, "owner.contribMemoryReadOnly")}</p> : null}
      {item.type !== "memory_message" && item.status === "rejected" ? (
        <p className={styles.note}>{translate(language, "owner.contribRejectedNote")}</p>
      ) : null}

      {confirming !== null ? (
        <div
          className={styles.confirm}
          role="group"
          aria-label={translate(language, confirming === "reject" ? "owner.contribRejectConfirm" : "owner.contribDeleteConfirm")}
          data-confirm-delete={confirming === "delete" ? item.id : undefined}
          data-confirm-reject={confirming === "reject" ? item.id : undefined}
          onKeyDown={(event) => {
            if (event.key === "Escape" && !busy) {
              event.preventDefault();
              onCancelConfirm();
            }
          }}
        >
          <p className={styles.confirmText}>{translate(language, confirming === "reject" ? "owner.contribRejectConfirm" : "owner.contribDeleteConfirm")}</p>
          <div className={styles.actions}>
            <button type="button" className={`${familyStyles.pill} ${styles.danger}`} onClick={onConfirm} disabled={disabled} aria-busy={busy || undefined} data-confirm-yes={item.id}>
              {busy ? translate(language, "owner.contribLoading") : translate(language, confirming === "reject" ? "owner.contribRejectYes" : "owner.contribDeleteYes")}
            </button>
            <button type="button" className={familyStyles.pill} onClick={onCancelConfirm} disabled={busy} data-confirm-cancel={item.id}>
              {translate(language, "owner.contribDeleteNo")}
            </button>
          </div>
        </div>
      ) : moderate.length > 0 || canDelete ? (
        <div className={styles.actions}>
          {moderate.map((action) => (
            <button
              key={action}
              type="button"
              className={`${familyStyles.pill} ${action === "approve" || action === "unhide" ? familyStyles.pillPrimary : ""}`}
              onClick={() => onModerate(action)}
              disabled={disabled}
              data-contribution-action={action}
            >
              {translate(language, ACTION_LABELS[action])}
            </button>
          ))}
          {canDelete ? (
            <button type="button" className={`${familyStyles.textLink} ${styles.deleteLink}`} onClick={onAskDelete} disabled={disabled} data-contribution-delete={item.id}>
              {translate(language, "owner.contribDelete")}
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
