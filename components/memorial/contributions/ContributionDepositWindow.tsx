"use client";

import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { CONTRIBUTION_TEXT_LIMITS } from "@/config/contributions";
import type { Language } from "@/config/languages";
import type { ContributionsTheme } from "@/config/contributions-master-measurements";
import { translate, translateWith } from "@/lib/i18n/translate";
import { countVisibleCharacters, normalizeContributionText } from "@/lib/memorial/contributions/contribution-text";
import type { ContributionsFeatures } from "@/lib/memorial/contributions/contributions-settings";
import type { ContributionDepositTransport } from "./deposit-transport";
import { useContributionDeposit, type ContributionDepositEngine, type DepositKind as Kind } from "./use-contribution-deposit";
import { CONTRIBUTIONS_PRIVACY_LEGAL_STATUS, PRIVACY_MENTION_KEYS, PRIVACY_NOTICE_KEYS, privacySegments, withdrawalMailto } from "@/config/contributions-privacy";
import { LetterCard } from "./letter/LetterCard";
import { BookIcon, CloseIcon, HeartIcon, ImageIcon, LeafDivider, LockIcon, PlaneIcon } from "./letter/letter-icons";
import styles from "./ContributionDepositWindow.module.css";

/**
 * M8-E6-A — « La lettre des proches » : la fenêtre « Laisser un message »,
 * dans la direction artistique validée par la PO.
 *
 * PRÉSENTATION seulement. Toute la mécanique (étapes, jeton, envoi, réponses
 * du serveur, « un autre souvenir ») reste dans `useContributionDeposit`
 * (M8-E4), inchangé. Le décor est le Master du Studio (LetterCard), jamais
 * un parchemin recréé ; les éléments interactifs sont de vrais contrôles
 * HTML, dans les zones de lecture sûres de la lettre.
 *
 * Rendue hors de la pile des cartes (portail) : le stacking ne bouge pas.
 * Focus piégé par la fenêtre native, rendu à l'élément d'origine.
 * Verrou de publication : config/contributions-deposit-readiness.ts (fermé) ;
 * la mention de confidentialité affichée reste PROVISOIRE (Q6).
 */

export interface ContributionDepositWindowProps {
  language: Language;
  theme: ContributionsTheme;
  /** Catégories EN VIGUEUR (O9), lues par l'hôte public. */
  categories: ContributionsFeatures;
  transport: ContributionDepositTransport;
  onClose: () => void;
  /** Rendu du focus à la fermeture (« Laisser un message »). */
  returnFocusRef?: RefObject<HTMLElement | null>;
  /** Classes des polices de la scène (la fenêtre est rendue hors de l'arbre, comme M5-C). */
  fontsClassName?: string;
  /** M8-E6-F — un dépôt a abouti (publié ou en attente) : l'hôte peut rafraîchir la rubrique. */
  onDeposited?: (kind: Kind, status: "published" | "pending") => void;
}

type T = (k: Parameters<typeof translate>[1]) => string;

export function ContributionDepositWindow({ language, theme, categories, transport, onClose, returnFocusRef, fontsClassName = "", onDeposited }: ContributionDepositWindowProps) {
  const t = useCallback<T>((k) => translate(language, k), [language]);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const engine = useContributionDeposit(categories, transport);
  const { step, available, remaining } = engine;

  useEffect(() => {
    const d = dialogRef.current;
    if (d && !d.open) d.showModal?.();
    const target = returnFocusRef;
    return () => {
      target?.current?.focus({ preventScroll: true });
    };
  }, [returnFocusRef]);

  const doneKind = step.name === "done" ? step.kind : null;
  const doneStatus = step.name === "done" ? step.status : null;
  const notified = useRef<string | null>(null);
  useEffect(() => {
    if (!doneKind || !doneStatus) {
      notified.current = null;
      return;
    }
    const key = `${doneKind}-${doneStatus}-${available.length}`;
    if (notified.current === key) return;
    notified.current = key;
    onDeposited?.(doneKind, doneStatus);
  }, [doneKind, doneStatus, available.length, onDeposited]);

  // Mobile, clavier ouvert : la zone visible rétrécit ; le champ en cours de
  // saisie est ramené au centre (la fenêtre défile), jamais caché sous le clavier.
  useEffect(() => {
    const follow = () => {
      const active = document.activeElement as HTMLElement | null;
      if (active && dialogRef.current?.contains(active) && active.matches("input, textarea")) active.scrollIntoView({ block: "center", inline: "nearest" });
    };
    const vv = window.visualViewport;
    vv?.addEventListener("resize", follow);
    window.addEventListener("resize", follow);
    return () => {
      vv?.removeEventListener("resize", follow);
      window.removeEventListener("resize", follow);
    };
  }, []);

  // Focus à chaque étape : le premier choix, ou le message de résultat ; il
  // n'est jamais laissé sur un élément qui vient de disparaître.
  const stepName = step.name;
  useEffect(() => {
    if (stepName === "write") return; // le formulaire place lui-même le focus
    const d = dialogRef.current;
    const target = d?.querySelector<HTMLElement>(stepName === "choose" ? "[data-choice]" : "[data-step-focus]");
    target?.focus({ preventScroll: true });
  }, [stepName]);

  const header = (
    <>
      <h2 id={titleId} className={styles.title}>
        {t("contributionsDeposit.title")}
      </h2>
      <LeafDivider className={styles.divider} />
    </>
  );
  const close = (
    <button type="button" className={styles.close} onClick={onClose} data-deposit-close="" aria-label={t("contributionsDeposit.close")}>
      <CloseIcon />
    </button>
  );

  let content: ReactNode;
  if (step.name === "choose") {
    content = (
      <LetterCard
        stepKey="choose"
        header={header}
        close={close}
        footer={null}
        body={
          <div className={styles.stack}>
            <p className={styles.lead}>{t("contributionsDeposit.choose")}</p>
            <ChoiceList kinds={available} t={t} onChoose={engine.choose} />
          </div>
        }
      />
    );
  } else if (step.name === "write") {
    content = (
      <DepositForm
        key={`${step.kind}-${available.length}`}
        kind={step.kind}
        language={language}
        engine={engine}
        canGoBack={available.length > 1}
        header={header}
        close={close}
      />
    );
  } else if (step.name === "done") {
    content = (
      <LetterCard
        stepKey={`done-${step.kind}`}
        header={header}
        close={close}
        footer={null}
        body={
          <div className={styles.result} role="status" tabIndex={-1} data-step-focus="">
            <p className={styles.resultText}>{t(step.status === "published" ? "contributionsDeposit.published" : "contributionsDeposit.pending")}</p>
            {remaining.length > 0 ? (
              <>
                <LeafDivider className={styles.dividerSmall} />
                <p className={styles.lead}>{t("contributionsDeposit.another")}</p>
                <ChoiceList kinds={remaining} t={t} onChoose={engine.choose} compact />
              </>
            ) : null}
          </div>
        }
      />
    );
  } else if (step.name === "busy") {
    content = (
      <LetterCard
        stepKey="busy"
        header={header}
        close={close}
        footer={null}
        body={
          <div className={styles.result} role="status" data-deposit-busy="" tabIndex={-1} data-step-focus="">
            <p className={styles.busyTitle}>{t("contributionsDeposit.busyTitle")}</p>
            <p className={styles.resultText}>{t("contributionsDeposit.busyBody")}</p>
            <p className={styles.resultText}>{t("contributionsDeposit.busyRetry")}</p>
          </div>
        }
      />
    );
  } else {
    content = (
      <LetterCard
        stepKey="closed"
        header={header}
        close={close}
        footer={null}
        body={
          <p className={`${styles.result} ${styles.resultText}`} role="status" tabIndex={-1} data-step-focus="">
            {t("contributionsDeposit.closed")}
          </p>
        }
      />
    );
  }

  return createPortal(
    <dialog
      ref={dialogRef}
      className={`${styles.window} ${styles[`theme-${theme}`]} ${fontsClassName}`}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      data-contribution-deposit={step.name}
    >
      {content}
    </dialog>,
    document.body,
  );
}

function kindTitle(kind: Kind) {
  return kind === "condolence" ? "contributionsDeposit.typeCondolence" : kind === "testimonial" ? "contributionsDeposit.typeStory" : "contributionsDeposit.typePhoto";
}
function kindHint(kind: Kind) {
  return kind === "condolence" ? "contributionsDeposit.typeCondolenceHint" : kind === "testimonial" ? "contributionsDeposit.typeStoryHint" : "contributionsDeposit.typePhotoHint";
}
function KindIcon({ kind }: { kind: Kind }) {
  return kind === "condolence" ? <HeartIcon /> : kind === "testimonial" ? <BookIcon /> : <ImageIcon />;
}

function ChoiceList({ kinds, t, onChoose, compact = false }: { kinds: readonly Kind[]; t: T; onChoose: (k: Kind) => void; compact?: boolean }) {
  return (
    <ul className={`${styles.choices} ${compact ? styles.choicesCompact : ""}`}>
      {kinds.map((kind) => (
        <li key={kind}>
          <button type="button" className={styles.choice} onClick={() => onChoose(kind)} data-choice={kind}>
            <span className={styles.choiceIcon} aria-hidden="true">
              <KindIcon kind={kind} />
            </span>
            <span className={styles.choiceText}>
              <span className={styles.choiceTitle}>{t(kindTitle(kind))}</span>
              {compact ? null : <span className={styles.choiceHint}>{t(kindHint(kind))}</span>}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function DepositForm({
  kind,
  language,
  engine,
  canGoBack,
  header,
  close,
}: {
  kind: Kind;
  language: Language;
  engine: ContributionDepositEngine;
  canGoBack: boolean;
  header: ReactNode;
  close: ReactNode;
}) {
  const t: T = (k) => translate(language, k);
  const ids = { form: useId(), name: useId(), text: useId(), caption: useId(), photo: useId(), error: useId() };
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [caption, setCaption] = useState("");
  const [website, setWebsite] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const { error, sending, ready } = engine;
  const firstField = useRef<HTMLTextAreaElement>(null);
  const photoPick = useRef<HTMLInputElement>(null);
  useEffect(() => (firstField.current ?? photoPick.current)?.focus({ preventScroll: true }), []);
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  // Après un refus, le focus va au champ en cause (ou au message) : il n'est
  // jamais perdu, même si le bouton a été désactivé pendant l'envoi.
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!error) return;
    const form = formRef.current;
    const target = form?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? (error === "photoMissing" || error === "photo" ? photoPick.current : null) ?? form?.querySelector<HTMLElement>("[role=alert]");
    target?.focus({ preventScroll: false });
  }, [error]);

  const textLimit = kind === "condolence" ? CONTRIBUTION_TEXT_LIMITS.condolence : CONTRIBUTION_TEXT_LIMITS.story;
  const count = (v: string) => countVisibleCharacters(normalizeContributionText(v));

  function submit(e: FormEvent) {
    e.preventDefault();
    void engine.submit(kind, { authorName: name, text, caption, file, website });
  }

  const errorKey =
    error === "authorName" ? "contributionsDeposit.errorName"
    : error === "text" ? "contributionsDeposit.errorText"
    : error === "caption" ? "contributionsDeposit.errorCaption"
    : error === "photo" ? "contributionsDeposit.errorPhoto"
    : error === "photoMissing" ? "contributionsDeposit.errorPhotoMissing"
    : error === "generic" ? "contributionsDeposit.errorGeneric"
    : null;

  const body = (
    <form ref={formRef} id={ids.form} className={styles.form} onSubmit={submit} noValidate data-deposit-form={kind}>
      <p className={styles.chip}>
        <span className={styles.chipIcon} aria-hidden="true">
          <KindIcon kind={kind} />
        </span>
        {t(kindTitle(kind))}
      </p>

      {kind === "photo" ? (
        <div className={styles.photoField}>
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- aperçu local de la photo choisie, jamais envoyé tel quel
            <img className={styles.photoPreview} src={preview} alt="" data-deposit-preview="" />
          ) : null}
          <label className={styles.photoPick} htmlFor={ids.photo}>
            <ImageIcon />
            <span>{t(file ? "contributionsDeposit.photoChange" : "contributionsDeposit.photoPick")}</span>
          </label>
          <input
            ref={photoPick}
            id={ids.photo}
            className={styles.visuallyHidden}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => {
              const f = e.currentTarget.files?.[0] ?? null;
              setFile(f);
              setPreview(f ? URL.createObjectURL(f) : null);
              engine.clearError();
            }}
            aria-describedby={error === "photo" || error === "photoMissing" ? ids.error : undefined}
          />
        </div>
      ) : (
        <Field label={kind === "condolence" ? t("contributionsDeposit.message") : t("contributionsDeposit.story")} required id={ids.text} count={count(text)} max={textLimit} language={language}>
          <textarea
            ref={firstField}
            id={ids.text}
            className={`${styles.input} ${styles.textarea}`}
            rows={kind === "condolence" ? 4 : 7}
            value={text}
            placeholder={t(kind === "condolence" ? "contributionsDeposit.placeholderCondolence" : "contributionsDeposit.placeholderStory")}
            onChange={(e) => setText(e.currentTarget.value)}
            aria-required="true"
            aria-invalid={error === "text" || undefined}
            aria-describedby={error === "text" ? ids.error : undefined}
          />
        </Field>
      )}

      {kind === "photo" ? (
        <Field label={t("contributionsDeposit.caption")} id={ids.caption} count={count(caption)} max={CONTRIBUTION_TEXT_LIMITS.caption} language={language}>
          <input
            id={ids.caption}
            className={styles.input}
            value={caption}
            placeholder={t("contributionsDeposit.placeholderCaption")}
            onChange={(e) => setCaption(e.currentTarget.value)}
            aria-invalid={error === "caption" || undefined}
            aria-describedby={error === "caption" ? ids.error : undefined}
          />
        </Field>
      ) : null}

      <Field label={t("contributionsDeposit.name")} required id={ids.name} count={count(name)} max={CONTRIBUTION_TEXT_LIMITS.authorName} language={language}>
        <input
          id={ids.name}
          className={styles.input}
          value={name}
          autoComplete="name"
          placeholder={t("contributionsDeposit.placeholderName")}
          onChange={(e) => setName(e.currentTarget.value)}
          aria-required="true"
          aria-invalid={error === "authorName" || undefined}
          aria-describedby={error === "authorName" ? ids.error : undefined}
        />
      </Field>

      {/* R4 — champ piège : invisible et hors du parcours ; un robot qui le remplit est refusé. */}
      <div className={styles.trap} aria-hidden="true">
        <label>
          Site web
          <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.currentTarget.value)} name="website" />
        </label>
      </div>

      {/* M8-Q6 — mention propre au type de contribution, puis la notice détaillée.
          Textes et contact : config/contributions-privacy.ts (PROPOSITION non validée). */}
      <div className={styles.privacy} data-privacy-kind={kind}>
        <LockIcon className={styles.privacyIcon} />
        <div className={styles.privacyText}>
          <p className={styles.privacyMention}>
            <PrivacyText language={language} textKey={PRIVACY_MENTION_KEYS[kind]} />
          </p>
          {CONTRIBUTIONS_PRIVACY_LEGAL_STATUS !== "validated" ? (
            <p className={styles.privacyStatus} data-privacy-status="proposal">
              {t("contributionsPrivacy.status")}
            </p>
          ) : null}
          <details className={styles.notice} data-privacy-notice="">
            <summary className={styles.noticeSummary}>{t("contributionsPrivacy.learnMore")}</summary>
            <h3 className={styles.noticeTitle}>{t("contributionsPrivacy.noticeTitle")}</h3>
            <ul className={styles.noticeList}>
              {PRIVACY_NOTICE_KEYS.map((key) => (
                <li key={key}>
                  <PrivacyText language={language} textKey={key} />
                </li>
              ))}
            </ul>
          </details>
        </div>
      </div>

      {errorKey ? (
        <p id={ids.error} className={styles.error} role="alert" tabIndex={-1}>
          {t(errorKey)}
        </p>
      ) : null}
    </form>
  );

  const footer = (
    <>
      <button type="submit" form={ids.form} className={styles.primary} disabled={sending || !ready} aria-busy={sending || undefined}>
        <PlaneIcon className={styles.primaryIcon} />
        <span>{sending ? t("contributionsDeposit.sending") : t("contributionsDeposit.send")}</span>
      </button>
      {canGoBack ? (
        <button type="button" className={styles.back} onClick={engine.back} disabled={sending}>
          {t("contributionsDeposit.back")}
        </button>
      ) : null}
    </>
  );

  return <LetterCard stepKey={`write-${kind}-${preview ? "p" : ""}-${errorKey ?? ""}`} header={header} close={close} body={body} footer={footer} />;
}

/** M8-E6-T — un texte Q6, le contact de retrait rendu en lien `mailto:` (contact vérifié). */
function PrivacyText({ language, textKey }: { language: Language; textKey: Parameters<typeof privacySegments>[1] }) {
  const mailto = withdrawalMailto(language);
  return (
    <>
      {privacySegments(language, textKey).map((part, i) =>
        part.contact && mailto ? (
          <a key={i} href={mailto} className={styles.contactLink} data-withdrawal-contact="">
            {part.text}
          </a>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}

function Field({ label, id, count, max, language, required = false, children }: { label: string; id: string; count: number; max: number; language: Language; required?: boolean; children: React.ReactNode }) {
  const over = count > max;
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={`${styles.label} ${required ? styles.required : ""}`}>
        {label}
      </label>
      {children}
      <span className={`${styles.counter} ${over ? styles.counterOver : ""}`} aria-live="polite">
        {translateWith(language, "contributionsDeposit.counter", { count, max })}
      </span>
    </div>
  );
}
