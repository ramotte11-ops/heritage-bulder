"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import type { Language } from "@/config/languages";
import type { MemorialContent } from "@/types/memorial";
import { translate } from "@/lib/i18n/translate";
import { commitWelcome } from "@/lib/builder/guided-flow/welcome-step";
import { PrimaryButton } from "./PrimaryButton";
import { playfairDisplay, inter, ebGaramond } from "./fonts";
import screenStyles from "./BuilderScreen.module.css";
import styles from "./WelcomeStep.module.css";

/** The Ceremony title's own botanical sprig, reused as-is (never
 * modified): the one decorative image on this screen besides the
 * Builder's shared paper background. */
const SPRIG_SRC = "/assets/ceremony/intemporel/runtime/light/title-sprig.png";

type WelcomeStepState = { status: "idle" } | { status: "error" };

const INITIAL_STATE: WelcomeStepState = { status: "idle" };

interface WelcomeStepProps {
  language: Language;
  content: MemorialContent;
  /** The bound `saveDraftAction`, exactly like every Guided Flow
   * screen's own `persist`. */
  persist: (content: MemorialContent) => Promise<{ updatedAt: string }>;
}

/**
 * Builder Welcome — shown once, right after T01, before the Guided Flow
 * (see lib/builder/guided-flow/welcome-step.ts for when).
 *
 * Every word, the logo and the CTA are real, translated markup: the
 * only images are the shared paper background (BuilderScreen.module.css's
 * `.page`) and the decorative sprig, both `aria-hidden`/`alt=""`. No
 * progress bar and no language selector — the language was chosen at
 * T01 and this screen asks for nothing.
 *
 * Typography: the Builder's own wordmark (Playfair Display) and CTA
 * (Inter), with the Memorial's editorial EB Garamond (the Ceremony's own
 * face) for the welcome copy, title included.
 */
export function WelcomeStep({ language, content, persist }: WelcomeStepProps) {
  const router = useRouter();

  async function submit(): Promise<WelcomeStepState> {
    try {
      await persist(commitWelcome(content));
    } catch {
      return { status: "error" };
    }
    router.refresh();
    return { status: "idle" };
  }

  const [state, formAction, isPending] = useActionState(submit, INITIAL_STATE);

  return (
    <main
      lang={language}
      className={`${screenStyles.page} ${playfairDisplay.variable} ${inter.variable} ${ebGaramond.variable}`}
    >
      <p className={screenStyles.signature}>
        Stories
        <br />
        live
        <br />
        forever
      </p>

      <div className={styles.welcome}>
        <header className={styles.brand}>
          <p className={screenStyles.wordmark}>HERITAGE</p>
          <p className={screenStyles.wordmarkSub}>Hommage</p>
          <span className={styles.brandRule} aria-hidden="true" />
        </header>

        <h1 className={styles.title}>{translate(language, "welcome.title")}</h1>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={styles.sprig} src={SPRIG_SRC} alt="" width={260} height={95} />

        <p className={styles.intro}>{translate(language, "welcome.intro")}</p>

        <span className={styles.rule} aria-hidden="true" />

        <p className={styles.reassurance}>{translate(language, "welcome.reassurance")}</p>

        <form action={formAction} className={styles.form}>
          <div className={styles.ctaWrap}>
            <PrimaryButton
              type="submit"
              disabled={isPending}
              pending={isPending}
              pendingLabel={translate(language, "common.pleaseWait")}
            >
              {translate(language, "welcome.cta")}
            </PrimaryButton>
          </div>

          {state.status === "error" && (
            <p role="alert" className={styles.error}>
              {translate(language, "errors.generic")}
            </p>
          )}
        </form>
      </div>
    </main>
  );
}
