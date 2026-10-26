"use client";

import { useActionState, useState } from "react";
import { LANGUAGES, type Language } from "@/config/languages";
import { translate } from "@/lib/i18n/translate";
import { BuilderScreen } from "./BuilderScreen";
import { ChoiceCard } from "./ChoiceCard";
import { PrimaryButton } from "./PrimaryButton";
import screenStyles from "./BuilderScreen.module.css";
import styles from "./LanguageStep.module.css";
import type { ConfigurationSaveResponse } from "@/lib/builder/draft-revision";
import { useStepDone } from "./journey/journey-context";

/**
 * Each language's own name for itself (an autonym), not a translation
 * of any concept — "Français" is always "Français", in every one of
 * this screen's three simultaneous languages. This is why it lives here
 * as a plain, invariant map rather than as a key in
 * `lib/i18n/dictionaries/*`: `lib/i18n/translate.ts` resolves "language
 * + key -> text FOR that language"; a language's own name is not that
 * kind of fact.
 */
const LANGUAGE_LABELS: Record<Language, string> = {
  en: "English",
  fr: "Français",
  es: "Español",
};

type LanguageStepState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "conflict"; language: Language };

const INITIAL_STATE: LanguageStepState = { status: "idle" };

interface LanguageStepProps {
  /**
   * The configuration transport. The authenticated route injects its
   * bound `saveLanguageAction`; the guest host injects its local V2 CAS.
   * This screen owns neither persistence implementation.
   */
  persist: (language: Language) => Promise<ConfigurationSaveResponse | void>;
}

/**
 * Mission 023 — T01, the Builder's Welcome + language choice.
 *
 * ## Why this is a real interface, not an image
 *
 * Every piece of it — the logo/header, the progress indicator, the
 * title, the three language options, the selected state, and the CTA —
 * is real markup and real state, per the mission brief's "CODE for what
 * lives, assets for what brings texture" principle (section 2). The
 * ONE piece that IS an image is the decorative background itself
 * (Mission 023C's real Studio assets — see BuilderScreen.module.css's
 * `.page`), and nothing functional is ever drawn into it: no title, no
 * option, no CTA, no progress bar is part of that picture.
 *
 * ## Mission 024 — shared chrome
 *
 * The background/signature/logo/progress-bar chrome moved into
 * `BuilderScreen` so T02 (and later steps) share the literal same
 * markup rather than a copy that could drift — this component's own
 * rendered output is unchanged by that extraction.
 *
 * ## Why no UI language is chosen yet
 *
 * T01 exists precisely because the Memorial has no `language` yet
 * (`app/builder/[memorialId]/page.tsx` only ever renders this component
 * when `resumed.memorial.language === null`). Its own copy is therefore
 * NOT resolved against a chosen language at all: the title is shown in
 * English, with the French and Spanish renderings of the exact same
 * `onboarding.chooseLanguage` key underneath as the visible micro-copy
 * — literally proving `lib/i18n/translate.ts`'s foundation by displaying
 * one key in all three canonical languages side by side, rather than
 * hiding three separate hard-coded strings that could drift apart from
 * the dictionaries. The CTA reuses `common.continue` the same way.
 *
 * ## Selection and submission
 *
 * The three `ChoiceCard`s are one native radio group (`name="language"`)
 * — the browser enforces "exactly one selected" and gives correct
 * keyboard/screen-reader behavior for free (see ChoiceCard.tsx).
 * `selected` is local state purely so the CTA's `disabled` prop and each
 * card's `checked` prop can react to a choice before it is submitted —
 * selecting a card only PREPARES the choice (mission brief section 7);
 * nothing is persisted, and this component's own copy does not change,
 * until `Continue` is actually pressed.
 *
 * `useActionState` runs the actual persist + navigation: on submit it
 * calls the injected transport, then the shared Builder completion seam.
 * The authenticated route still resolves that seam to `router.refresh()`;
 * a local host may advance from its newly persisted V2 snapshot instead.
 * This component never decides what comes next and never invents it.
 */
export function LanguageStep({ persist }: LanguageStepProps) {
  const [selected, setSelected] = useState<Language | null>(null);
  const stepDone = useStepDone();

  async function submit(
    _previous: LanguageStepState,
    formData: FormData,
  ): Promise<LanguageStepState> {
    const value = formData.get("language");
    const language = LANGUAGES.find((candidate) => candidate === value);
    if (!language) {
      // Only reachable if a caller bypasses the disabled CTA entirely
      // (e.g. a devtools-forced submit) — the radio group otherwise
      // guarantees `value` is one of LANGUAGES the moment the CTA can
      // even be enabled.
      return { status: "error", message: translate("en", "errors.generic") };
    }

    try {
      const result = await persist(language);
      if (result?.status === "conflict") return { status: "conflict", language };
    } catch {
      return { status: "error", message: translate("en", "errors.generic") };
    }

    stepDone();
    return { status: "idle" };
  }

  const [state, formAction, isPending] = useActionState(submit, INITIAL_STATE);

  function reloadAfterConflict() {
    if (
      state.status === "conflict" &&
      window.confirm(translate(state.language, "autosave.conflictReloadConfirm"))
    ) {
      window.location.reload();
    }
  }

  function downloadLanguageChoice() {
    if (state.status !== "conflict") return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify({ language: state.language }, null, 2)], { type: "application/json" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "heritage-modifications-non-enregistrees.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <BuilderScreen progress={0.15}>
      <div className={styles.copy}>
        <h1 className={styles.title}>{translate("en", "onboarding.chooseLanguage")}</h1>
        <p className={styles.subcopy}>{translate("fr", "onboarding.chooseLanguage")}</p>
        <p className={styles.subcopy}>{translate("es", "onboarding.chooseLanguage")}</p>
      </div>

      <form action={formAction} className={styles.form}>
        <fieldset className={styles.fieldset}>
          <legend className={styles.srOnly}>{translate("en", "onboarding.chooseLanguage")}</legend>

          <div className={styles.options}>
            {LANGUAGES.map((language) => (
              <ChoiceCard
                key={language}
                id={`language-${language}`}
                name="language"
                value={language}
                checked={selected === language}
                disabled={isPending}
                onChange={(value) => setSelected(value as Language)}
              >
                {LANGUAGE_LABELS[language]}
              </ChoiceCard>
            ))}
          </div>
        </fieldset>

        {/* On desktop the Studio reference shows the CTA narrower than
            the three-card row, centered under it — BuilderScreen's
            shared `.ctaWrap` is what narrows/centers it at that
            breakpoint, while PrimaryButton itself stays a plain
            full-width-of-its-container primitive. */}
        <div className={screenStyles.ctaWrap}>
          <PrimaryButton
            type="submit"
            disabled={selected === null || isPending}
            pending={isPending}
            pendingLabel={translate(selected ?? "en", "autosave.saving")}
          >
            {translate("en", "common.continue")}
          </PrimaryButton>
        </div>

        {state.status === "error" && (
          <p role="alert" className={styles.error}>
            {state.message}
          </p>
        )}
        {state.status === "conflict" && (
          <div role="alert" className={styles.error}>
            <p>{translate(state.language, "autosave.conflictTitle")}</p>
            <p>{translate(state.language, "autosave.conflictBody")}</p>
            <button type="button" onClick={downloadLanguageChoice}>
              {translate(state.language, "autosave.conflictDownload")}
            </button>
            <button type="button" onClick={reloadAfterConflict}>
              {translate(state.language, "autosave.conflictReload")}
            </button>
          </div>
        )}
      </form>
    </BuilderScreen>
  );
}
