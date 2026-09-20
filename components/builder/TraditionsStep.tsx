"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Language } from "@/config/languages";
import type { EditorialContext } from "@/config/memorial";
import type { Skin } from "@/config/skins";
import type { MemorialContent } from "@/types/memorial";
import { translate } from "@/lib/i18n/translate";
import { useAutosave } from "@/lib/builder/use-autosave";
import { resolveAvailableTraditionSuggestions, type TraditionSuggestion } from "@/config/tradition-suggestions";
import {
  addTraditionsEntry,
  commitA09,
  readTraditionsForEditing,
  removeTraditionsEntry,
  skipA09,
  traditionsStepProgress,
  updateTraditionsEntry,
} from "@/lib/builder/guided-flow/traditions-step";
import { BuilderScreen } from "./BuilderScreen";
import { PrimaryButton } from "./PrimaryButton";
import screenStyles from "./BuilderScreen.module.css";
import styles from "./TraditionsStep.module.css";

interface TraditionsStepProps {
  language: Language;
  editorialContext: EditorialContext;
  /** The memorial's current draft content — the Ceremony block is
   * already guaranteed resolved by the time this renders (see
   * app/builder/[memorialId]/page.tsx's `needsA09` gate). */
  content: MemorialContent;
  /** Used ONLY to narrow which catalog suggestions may be shown
   * (`resolveAvailableTraditionSuggestions`) — never to infer, imply, or
   * pre-select a practice (mission brief section 3/7). */
  skin: Skin;
  persist: (content: MemorialContent) => Promise<{ updatedAt: string }>;
}

/** A not-yet-confirmed repère the family is composing — lives only in
 * this component's own local state, NEVER in `content`/autosave, until
 * the family explicitly confirms it (mission brief section 13: no
 * incomplete draft silently published as valid content). */
interface Composer {
  origin: "custom" | "suggestion";
  suggestionId: string | null;
  title: string;
  text: string;
}

interface EntryEdit {
  id: string;
  title: string;
  text: string;
}

function newCustomComposer(): Composer {
  return { origin: "custom", suggestionId: null, title: "", text: "" };
}

function newSuggestionComposer(suggestion: TraditionSuggestion, language: Language): Composer {
  return {
    origin: "suggestion",
    suggestionId: suggestion.id,
    title: suggestion.labels[language],
    text: suggestion.texts[language],
  };
}

/**
 * Mission 042 — A09: "Traditions & repères". Entirely facultative,
 * entirely passable, independent of whether a ceremony is planned
 * (mission brief section 2) — reached after the Ceremony block
 * regardless of A04's answer (`needsA09`,
 * lib/builder/guided-flow/traditions-step.ts).
 *
 * ## Suggestion ≠ confirmation (mission brief section 9)
 *
 * Picking a suggestion card never writes anything to `content` by
 * itself — it only opens the SAME composer a custom repère uses,
 * pre-filled with that suggestion's own editorial text, which the
 * family may freely edit before confirming with "Ajouter". Nothing is
 * ever shown pre-selected, and `resolveAvailableTraditionSuggestions`
 * (config/tradition-suggestions.ts) only ever narrows which cards are
 * OFFERED — it has no concept of a default choice at all.
 *
 * ## One action at a time (mission brief section 5)
 *
 * At most one composer (a new custom entry OR one picked suggestion) or
 * one edit is open at once — never a big form. Already-confirmed
 * entries render as their own small cards with "Modifier"/"Supprimer".
 */
export function TraditionsStep({ language, editorialContext, content: initialContent, skin, persist }: TraditionsStepProps) {
  const router = useRouter();
  const [content, setContent] = useState(initialContent);
  const [composer, setComposer] = useState<Composer | null>(null);
  const [editing, setEditing] = useState<EntryEdit | null>(null);
  const [submitError, setSubmitError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { flush } = useAutosave({ content, persist });

  const read = readTraditionsForEditing(content);
  const controlsDisabled = isSubmitting;
  const suggestions = resolveAvailableTraditionSuggestions({ skin });

  function confirmComposer() {
    if (!composer || controlsDisabled) return;
    const result = addTraditionsEntry(content, {
      id: crypto.randomUUID(),
      origin: composer.origin,
      suggestionId: composer.suggestionId,
      title: composer.title.trim() === "" ? null : composer.title,
      text: composer.text,
    });
    if (result.ok) {
      setContent(result.content);
      setComposer(null);
    }
  }

  function confirmEdit() {
    if (!editing || controlsDisabled) return;
    const result = updateTraditionsEntry(content, editing.id, {
      title: editing.title.trim() === "" ? null : editing.title,
      text: editing.text,
    });
    if (result.ok) {
      setContent(result.content);
      setEditing(null);
    }
  }

  function handleRemove(id: string) {
    if (controlsDisabled) return;
    const result = removeTraditionsEntry(content, id);
    if (result.ok) setContent(result.content);
  }

  async function drainAutosave(): Promise<boolean> {
    try {
      await flush();
      return true;
    } catch {
      setSubmitError(true);
      setIsSubmitting(false);
      return false;
    }
  }

  async function handleContinue(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (read.status !== "ready") return;

    setIsSubmitting(true);
    if (!(await drainAutosave())) return;

    const committed = commitA09(content);
    if (!committed.ok) {
      setSubmitError(true);
      setIsSubmitting(false);
      return;
    }

    try {
      await persist(committed.content);
    } catch {
      setSubmitError(true);
      setIsSubmitting(false);
      return;
    }

    router.refresh();
  }

  async function handleSkip() {
    if (read.status !== "ready" || controlsDisabled) return;

    setIsSubmitting(true);
    if (!(await drainAutosave())) return;

    const skipped = skipA09(content);
    if (!skipped.ok) {
      setSubmitError(true);
      setIsSubmitting(false);
      return;
    }

    try {
      await persist(skipped.content);
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

  const progress = traditionsStepProgress(editorialContext, content);
  const hasEntry = read.traditions.entries.length > 0;

  return (
    <BuilderScreen progress={progress}>
      <div className={styles.copy}>
        <h1 className={styles.title}>{translate(language, "traditions.title")}</h1>
        <p className={styles.subtitle}>{translate(language, "traditions.subtitle")}</p>
      </div>

      <form className={styles.form} onSubmit={handleContinue}>
        {read.traditions.entries.length > 0 && (
          <ul className={styles.entryList}>
            {read.traditions.entries.map((entry) =>
              editing?.id === entry.id ? (
                <li key={entry.id} className={styles.entryCard}>
                  <label htmlFor={`traditions-edit-title-${entry.id}`} className={styles.fieldLabel}>
                    {translate(language, "traditions.titleFieldLabel")}
                  </label>
                  <input
                    id={`traditions-edit-title-${entry.id}`}
                    type="text"
                    className={styles.textInput}
                    value={editing.title}
                    disabled={controlsDisabled}
                    onChange={(event) => setEditing({ ...editing, title: event.target.value })}
                  />
                  <label htmlFor={`traditions-edit-text-${entry.id}`} className={styles.fieldLabel}>
                    {translate(language, "traditions.textFieldLabel")}
                  </label>
                  <textarea
                    id={`traditions-edit-text-${entry.id}`}
                    className={styles.textarea}
                    value={editing.text}
                    disabled={controlsDisabled}
                    onChange={(event) => setEditing({ ...editing, text: event.target.value })}
                  />
                  <div className={styles.entryActions}>
                    <button
                      type="button"
                      className={styles.secondaryAction}
                      disabled={controlsDisabled || editing.text.trim() === ""}
                      onClick={confirmEdit}
                    >
                      {translate(language, "traditions.saveEdit")}
                    </button>
                    <button
                      type="button"
                      className={styles.secondaryAction}
                      disabled={controlsDisabled}
                      onClick={() => setEditing(null)}
                    >
                      {translate(language, "common.cancel")}
                    </button>
                  </div>
                </li>
              ) : (
                <li key={entry.id} className={styles.entryCard}>
                  {entry.title !== null && <p className={styles.entryTitle}>{entry.title}</p>}
                  <p className={styles.entryText}>{entry.text}</p>
                  <div className={styles.entryActions}>
                    <button
                      type="button"
                      className={styles.secondaryAction}
                      disabled={controlsDisabled}
                      onClick={() => setEditing({ id: entry.id, title: entry.title ?? "", text: entry.text })}
                    >
                      {translate(language, "traditions.editAction")}
                    </button>
                    <button
                      type="button"
                      className={styles.secondaryAction}
                      disabled={controlsDisabled}
                      onClick={() => handleRemove(entry.id)}
                    >
                      {translate(language, "traditions.removeAction")}
                    </button>
                  </div>
                </li>
              ),
            )}
          </ul>
        )}

        {suggestions.length > 0 && !composer && (
          <div className={styles.suggestions}>
            <p className={styles.sectionHeading}>{translate(language, "traditions.suggestionsHeading")}</p>
            <ul className={styles.suggestionList}>
              {suggestions.map((suggestion) => (
                <li key={suggestion.id} className={styles.suggestionCard}>
                  <p className={styles.entryTitle}>{suggestion.labels[language]}</p>
                  <button
                    type="button"
                    className={styles.addAction}
                    disabled={controlsDisabled}
                    onClick={() => setComposer(newSuggestionComposer(suggestion, language))}
                  >
                    {translate(language, "traditions.addSuggestionAction")}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {composer ? (
          <div className={styles.composer}>
            <label htmlFor="traditions-composer-title" className={styles.fieldLabel}>
              {translate(language, "traditions.titleFieldLabel")}
            </label>
            <input
              id="traditions-composer-title"
              type="text"
              className={styles.textInput}
              value={composer.title}
              disabled={controlsDisabled}
              onChange={(event) => setComposer({ ...composer, title: event.target.value })}
            />
            <label htmlFor="traditions-composer-text" className={styles.fieldLabel}>
              {translate(language, "traditions.textFieldLabel")}
            </label>
            <textarea
              id="traditions-composer-text"
              className={styles.textarea}
              value={composer.text}
              disabled={controlsDisabled}
              onChange={(event) => setComposer({ ...composer, text: event.target.value })}
            />
            <div className={styles.entryActions}>
              <button
                type="button"
                className={styles.secondaryAction}
                disabled={controlsDisabled || composer.text.trim() === ""}
                onClick={confirmComposer}
              >
                {translate(language, "traditions.confirmAdd")}
              </button>
              <button
                type="button"
                className={styles.secondaryAction}
                disabled={controlsDisabled}
                onClick={() => setComposer(null)}
              >
                {translate(language, "common.cancel")}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className={styles.addAction}
            disabled={controlsDisabled}
            onClick={() => setComposer(newCustomComposer())}
          >
            {translate(language, "traditions.addCustomAction")}
          </button>
        )}

        <div className={styles.actions}>
          <div className={screenStyles.ctaWrap}>
            <PrimaryButton type="submit" disabled={controlsDisabled || !hasEntry}>
              {translate(language, "common.continue")}
            </PrimaryButton>
          </div>

          <button
            type="button"
            className={styles.skipLink}
            disabled={controlsDisabled}
            onClick={() => void handleSkip()}
          >
            {translate(language, "traditions.skip")}
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
