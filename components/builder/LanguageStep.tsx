"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { LANGUAGES, type Language } from "@/config/languages";
import { translate } from "@/lib/i18n/translate";
import { ProgressBar } from "./ProgressBar";
import { ChoiceCard } from "./ChoiceCard";
import { PrimaryButton } from "./PrimaryButton";
import { playfairDisplay, inter } from "./fonts";
import styles from "./LanguageStep.module.css";

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

type LanguageStepState = { status: "idle" } | { status: "error"; message: string };

const INITIAL_STATE: LanguageStepState = { status: "idle" };

interface LanguageStepProps {
  /**
   * A bound Server Action — `saveLanguageAction.bind(null, memorialId)`
   * from `app/builder/[memorialId]/page.tsx` — never a closure over a
   * repository or a live Supabase client (same discipline Mission 021B
   * established for the Builder's autosave `persist`).
   */
  persist: (language: Language) => Promise<void>;
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
 * (Mission 023C's real Studio assets — see LanguageStep.module.css's
 * `.page`), and nothing functional is ever drawn into it: no title, no
 * option, no CTA, no progress bar is part of that picture.
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
 * calls the bound Server Action, and on success calls `router.refresh()`
 * so the Server Component above re-resolves the Memorial (now with a
 * real `language`) and decides what comes next — this component never
 * renders that next state itself, and never invents one.
 */
export function LanguageStep({ persist }: LanguageStepProps) {
  const [selected, setSelected] = useState<Language | null>(null);
  const router = useRouter();

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
      await persist(language);
    } catch {
      return { status: "error", message: translate("en", "errors.generic") };
    }

    router.refresh();
    return { status: "idle" };
  }

  const [state, formAction, isPending] = useActionState(submit, INITIAL_STATE);

  return (
    <main className={`${styles.page} ${playfairDisplay.variable} ${inter.variable}`}>
      {/* Mission 023C: real Studio signature copy, real HTML — never
          baked into the background image. Decorative and secondary; it
          never sits in reading order ahead of the actual question. */}
      <p className={styles.signature}>
        Stories
        <br />
        live
        <br />
        forever
      </p>

      <div className={styles.frame}>
        <header className={styles.brand}>
          <p className={styles.wordmark}>HERITAGE</p>
          <p className={styles.wordmarkSub}>Hommage</p>
        </header>

        <ProgressBar value={0.15} />

        <div className={styles.copy}>
          <h1 className={styles.title}>{translate("en", "onboarding.chooseLanguage")}</h1>
          <p className={styles.subcopy}>{translate("fr", "onboarding.chooseLanguage")}</p>
          <p className={styles.subcopy}>{translate("es", "onboarding.chooseLanguage")}</p>
        </div>

        <form action={formAction} className={styles.form}>
          <fieldset className={styles.fieldset}>
            <legend className={styles.srOnly}>
              {translate("en", "onboarding.chooseLanguage")}
            </legend>

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

          {/* Mission 023C: on desktop the Studio reference shows the CTA
              narrower than the three-card row, centered under it — this
              wrapper is what narrows/centers it at that breakpoint (see
              .ctaWrap), while PrimaryButton itself stays a plain
              full-width-of-its-container primitive. */}
          <div className={styles.ctaWrap}>
            <PrimaryButton type="submit" disabled={selected === null || isPending}>
              {translate("en", "common.continue")}
            </PrimaryButton>
          </div>

          {state.status === "error" && (
            <p role="alert" className={styles.error}>
              {state.message}
            </p>
          )}
        </form>
      </div>
    </main>
  );
}
