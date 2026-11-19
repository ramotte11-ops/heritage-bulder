"use client";

import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import { CONTRIBUTION_TEXT_LIMITS } from "@/config/contributions";
import type { Language } from "@/config/languages";
import type { ContributionsTheme } from "@/config/contributions-master-measurements";
import { CONTRIBUTIONS_RENDER_ASSETS as ASSETS } from "@/config/contributions-render-v1";
import { translate, translateWith } from "@/lib/i18n/translate";
import { countVisibleCharacters, normalizeContributionText } from "@/lib/memorial/contributions/contribution-text";
import type { ContributionsFeatures } from "@/lib/memorial/contributions/contributions-settings";
import type { ContributionDepositTransport } from "./deposit-transport";
import { useContributionDeposit, type ContributionDepositEngine, type DepositKind as Kind } from "./use-contribution-deposit";
import styles from "./ContributionDepositWindow.module.css";

/**
 * M8-E4 — PROPOSITION de fenêtre de dépôt (contrat M8-P § 5), soumise à la
 * PO avant toute validation : ni branchée à l'hommage public, ni réputée
 * validée.
 *
 * Une seule fenêtre, au-dessus de l'hommage, dans la grammaire de la lecture
 * agrandie M5-C (fond assombri, feuille centrée sur Desktop, plein écran sur
 * Mobile, bouton rond et doré « × Fermer », polices de la scène, Light et
 * Dark). Rendue hors de la pile des cartes (portail) : le stacking ne bouge
 * pas. Focus piégé par la fenêtre native, rendu à l'élément d'origine.
 *
 *  1. Choisir — trois petites cartes dans leur papier (bleu pétrole, ivoire,
 *     Polaroid), limitées aux catégories en vigueur et non encore utilisées
 *     pendant cette ouverture ; sautée s'il n'en reste qu'une.
 *  2. Écrire — sur le papier du type : nom (60), message (500) ou récit
 *     (2000) ou photo et légende facultative (150) ; compteur de caractères
 *     visibles (module partagé Q2, le même que le serveur) ; mention courte ;
 *     champ piège invisible (R4).
 *  3. Confirmer — publiée ou en attente selon le serveur, puis « Souhaitez-
 *     vous partager un autre souvenir ? » avec les catégories restantes, ou
 *     le message R5 si un plafond est atteint.
 *
 * M8-E4 (consolidation) : cette fenêtre n'est que la PRÉSENTATION, un
 * prototype provisoire. Toute la mécanique (étapes, jeton, envoi, réponses du
 * serveur, « un autre souvenir ») est dans `useContributionDeposit`, testée
 * sans interface. La mention de confidentialité affichée est PROVISOIRE (Q6) :
 * voir config/contributions-deposit-readiness.ts.
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
}

export function ContributionDepositWindow({ language, theme, categories, transport, onClose, returnFocusRef, fontsClassName = "" }: ContributionDepositWindowProps) {
  const t = useCallback((k: Parameters<typeof translate>[1]) => translate(language, k), [language]);
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
      <div className={styles.sheet}>
        <h2 id={titleId} className={styles.title}>
          {step.name === "choose" ? t("contributionsDeposit.choose") : t("contributionsDeposit.title")}
        </h2>

        {step.name === "choose" ? (
          <ul className={styles.choices}>
            {available.map((kind) => (
              <li key={kind}>
                <button type="button" className={`${styles.choice} ${styles[`paper-${kind}`]}`} style={paperStyle(kind)} onClick={() => engine.choose(kind)} data-choice={kind}>
                  <span className={styles.choiceTitle}>{t(kindTitle(kind))}</span>
                  <span className={styles.choiceHint}>{t(kindHint(kind))}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {step.name === "write" ? (
          <DepositForm key={`${step.kind}-${available.length}`} kind={step.kind} language={language} engine={engine} canGoBack={available.length > 1} />
        ) : null}

        {step.name === "done" ? (
          <div className={styles.result} role="status">
            <p className={styles.resultText}>{t(step.status === "published" ? "contributionsDeposit.published" : "contributionsDeposit.pending")}</p>
            {remaining.length > 0 ? (
              <>
                <p className={styles.another}>{t("contributionsDeposit.another")}</p>
                <ul className={styles.choices}>
                  {remaining.map((kind) => (
                    <li key={kind}>
                      <button type="button" className={`${styles.choice} ${styles[`paper-${kind}`]}`} style={paperStyle(kind)} onClick={() => engine.choose(kind)} data-choice={kind}>
                        <span className={styles.choiceTitle}>{t(kindTitle(kind))}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
        ) : null}

        {step.name === "busy" ? (
          <div className={styles.result} role="status" data-deposit-busy="">
            <p className={styles.busyTitle}>{t("contributionsDeposit.busyTitle")}</p>
            <p className={styles.resultText}>{t("contributionsDeposit.busyBody")}</p>
            <p className={styles.resultText}>{t("contributionsDeposit.busyRetry")}</p>
          </div>
        ) : null}

        {step.name === "closed" ? (
          <p className={styles.resultText} role="status">
            {t("contributionsDeposit.closed")}
          </p>
        ) : null}
      </div>

      <button type="button" className={styles.close} onClick={onClose} data-deposit-close="">
        <span aria-hidden="true">×</span>
        <span>{t("contributionsDeposit.close")}</span>
      </button>
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
function paperStyle(kind: Kind) {
  const url = kind === "condolence" ? ASSETS.paper.petrol : kind === "testimonial" ? ASSETS.paper.ivory : ASSETS.paper.polaroid;
  return { backgroundImage: `url(${url})` };
}

function DepositForm({ kind, language, engine, canGoBack }: { kind: Kind; language: Language; engine: ContributionDepositEngine; canGoBack: boolean }) {
  const t = (k: Parameters<typeof translate>[1]) => translate(language, k);
  const ids = { name: useId(), text: useId(), caption: useId(), photo: useId(), error: useId() };
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [caption, setCaption] = useState("");
  const [website, setWebsite] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const { error, sending, ready } = engine;
  const firstField = useRef<HTMLInputElement>(null);
  useEffect(() => firstField.current?.focus({ preventScroll: true }), []);
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

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

  return (
    <form className={`${styles.paper} ${styles[`paper-${kind}`]}`} style={paperStyle(kind)} onSubmit={submit} noValidate data-deposit-form={kind}>
      <p className={styles.paperOverline}>{t(kindTitle(kind))}</p>

      {kind === "photo" ? (
        <div className={styles.photoField}>
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- aperçu local de la photo choisie, jamais envoyé tel quel
            <img className={styles.photoPreview} src={preview} alt="" />
          ) : null}
          <label className={styles.photoPick} htmlFor={ids.photo}>
            {t(file ? "contributionsDeposit.photoChange" : "contributionsDeposit.photoPick")}
          </label>
          <input
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
        <Field label={kind === "condolence" ? t("contributionsDeposit.message") : t("contributionsDeposit.story")} id={ids.text} count={count(text)} max={textLimit} language={language}>
          <textarea
            id={ids.text}
            className={styles.textarea}
            rows={kind === "condolence" ? 5 : 8}
            value={text}
            onChange={(e) => setText(e.currentTarget.value)}
            aria-invalid={error === "text" || undefined}
            aria-describedby={error === "text" ? ids.error : undefined}
          />
        </Field>
      )}

      {kind === "photo" ? (
        <Field label={t("contributionsDeposit.caption")} id={ids.caption} count={count(caption)} max={CONTRIBUTION_TEXT_LIMITS.caption} language={language}>
          <input id={ids.caption} className={styles.input} value={caption} onChange={(e) => setCaption(e.currentTarget.value)} aria-invalid={error === "caption" || undefined} />
        </Field>
      ) : null}

      <Field label={t("contributionsDeposit.name")} id={ids.name} count={count(name)} max={CONTRIBUTION_TEXT_LIMITS.authorName} language={language}>
        <input
          ref={kind === "photo" ? undefined : firstField}
          id={ids.name}
          className={styles.input}
          value={name}
          autoComplete="name"
          onChange={(e) => setName(e.currentTarget.value)}
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

      <p className={styles.privacy}>{t("contributionsDeposit.privacy")}</p>

      {errorKey ? (
        <p id={ids.error} className={styles.error} role="alert">
          {t(errorKey)}
        </p>
      ) : null}

      <div className={styles.actions}>
        {canGoBack ? (
          <button type="button" className={styles.secondary} onClick={engine.back} disabled={sending}>
            {t("contributionsDeposit.back")}
          </button>
        ) : null}
        <button type="submit" className={styles.primary} disabled={sending || !ready} aria-busy={sending || undefined}>
          {sending ? t("contributionsDeposit.sending") : t("contributionsDeposit.send")}
        </button>
      </div>
    </form>
  );
}

function Field({ label, id, count, max, language, children }: { label: string; id: string; count: number; max: number; language: Language; children: React.ReactNode }) {
  const over = count > max;
  return (
    <div className={styles.field}>
      <div className={styles.fieldHead}>
        <label htmlFor={id} className={styles.label}>
          {label}
        </label>
        <span className={`${styles.counter} ${over ? styles.counterOver : ""}`} aria-live="polite">
          {translateWith(language, "contributionsDeposit.counter", { count, max })}
        </span>
      </div>
      {children}
    </div>
  );
}
