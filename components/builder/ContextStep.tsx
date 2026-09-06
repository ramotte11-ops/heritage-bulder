"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { EDITORIAL_CONTEXTS, type EditorialContext } from "@/config/memorial";
import type { Language } from "@/config/languages";
import { translate } from "@/lib/i18n/translate";
import { BuilderScreen } from "./BuilderScreen";
import { ChoiceCard } from "./ChoiceCard";
import { PrimaryButton } from "./PrimaryButton";
import screenStyles from "./BuilderScreen.module.css";
import styles from "./ContextStep.module.css";

type ContextStepState = { status: "idle" } | { status: "error"; message: string };

const INITIAL_STATE: ContextStepState = { status: "idle" };

interface ContextStepProps {
  /** The Memorial's already-persisted language (T01 is always done
   * before T02 — see app/builder/[memorialId]/page.tsx's gate). Unlike
   * T01, which has no language to render in yet, T02's entire copy
   * resolves against this one real value — never a hard-coded language,
   * never all three at once. */
  language: Language;
  /**
   * A bound Server Action —
   * `saveEditorialContextAction.bind(null, memorialId)` — never a
   * closure over a repository or a live Supabase client (same
   * discipline Mission 023 established for `LanguageStep`'s `persist`).
   */
  persist: (editorialContext: EditorialContext) => Promise<void>;
}

/**
 * Mission 024 — T02, the Builder's editorial-context choice.
 *
 * Sits immediately after T01 in the Guided Flow: rendered only when
 * `language` is already persisted but `editorialContext` is not (see
 * app/builder/[memorialId]/page.tsx). Its own copy is therefore fully
 * resolved in the family's chosen language — the opposite situation
 * from T01, which had no language yet and showed all three at once.
 *
 * ## A real, explicit choice — never deduced
 *
 * The mission brief is absolute: this screen exists because the
 * distinction between "Announcement & Tribute" and "Memory & Tribute"
 * is a genuine family decision, never inferred from a death date, an
 * offer, a skin, or a culture. This component (and
 * `saveEditorialContextAction` beneath it) reads nothing but the
 * family's own click — there is no other signal in scope for it to
 * read even if it wanted to.
 *
 * ## Reuse, not a second visual identity
 *
 * `BuilderScreen` supplies the exact same chrome T01 uses (background,
 * logo, signature, progress bar) — T02 has its own composition (a
 * two-card choice with real titles and descriptions, laid out via
 * `ContextStep.module.css`) but not its own graphic identity. The cards
 * reuse `ChoiceCard` with `size="roomy"` (Mission 024's addition to that
 * primitive) rather than forcing T01's single-line card height onto
 * text that does not fit it.
 */
export function ContextStep({ language, persist }: ContextStepProps) {
  const [selected, setSelected] = useState<EditorialContext | null>(null);
  const router = useRouter();

  async function submit(
    _previous: ContextStepState,
    formData: FormData,
  ): Promise<ContextStepState> {
    const value = formData.get("editorialContext");
    const editorialContext = EDITORIAL_CONTEXTS.find((candidate) => candidate === value);
    if (!editorialContext) {
      // Only reachable if a caller bypasses the disabled CTA entirely —
      // the radio group otherwise guarantees `value` is one of
      // EDITORIAL_CONTEXTS the moment the CTA can even be enabled.
      return { status: "error", message: translate(language, "errors.generic") };
    }

    try {
      await persist(editorialContext);
    } catch {
      return { status: "error", message: translate(language, "errors.generic") };
    }

    router.refresh();
    return { status: "idle" };
  }

  const [state, formAction, isPending] = useActionState(submit, INITIAL_STATE);

  return (
    <BuilderScreen progress={0.25}>
      <div className={styles.copy}>
        <h1 className={styles.title}>{translate(language, "context.title")}</h1>
        <p className={styles.subtitle}>{translate(language, "context.subtitle")}</p>
      </div>

      <form action={formAction} className={styles.form}>
        <fieldset className={styles.fieldset}>
          <legend className={styles.srOnly}>{translate(language, "context.title")}</legend>

          <div className={styles.options}>
            <ChoiceCard
              id="editorial-context-announcement"
              name="editorialContext"
              value="announcement"
              size="roomy"
              checked={selected === "announcement"}
              disabled={isPending}
              onChange={(value) => setSelected(value as EditorialContext)}
            >
              <span className={styles.cardTitle}>
                {translate(language, "context.announcementTitle")}
              </span>
              <span className={styles.cardDescription}>
                {translate(language, "context.announcementDescription")}
              </span>
            </ChoiceCard>

            <ChoiceCard
              id="editorial-context-remembrance"
              name="editorialContext"
              value="remembrance"
              size="roomy"
              checked={selected === "remembrance"}
              disabled={isPending}
              onChange={(value) => setSelected(value as EditorialContext)}
            >
              <span className={styles.cardTitle}>
                {translate(language, "context.remembranceTitle")}
              </span>
              <span className={styles.cardDescription}>
                {translate(language, "context.remembranceDescription")}
              </span>
            </ChoiceCard>
          </div>
        </fieldset>

        {/* Same shared, Studio-observed "narrower, centered CTA on
            desktop" rule as T01 — see BuilderScreen.module.css's
            `.ctaWrap`. */}
        <div className={screenStyles.ctaWrap}>
          <PrimaryButton type="submit" disabled={selected === null || isPending}>
            {translate(language, "common.continue")}
          </PrimaryButton>
        </div>

        {state.status === "error" && (
          <p role="alert" className={styles.error}>
            {state.message}
          </p>
        )}
      </form>
    </BuilderScreen>
  );
}
