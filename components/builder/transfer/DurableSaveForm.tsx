"use client";

import { useActionState } from "react";
import { requestMagicLink } from "@/app/auth/actions";
import type { Language } from "@/config/languages";
import { INITIAL_MAGIC_LINK_STATE } from "@/lib/auth/magic-link-state";
import { translate } from "@/lib/i18n/translate";
import { DURABLE_SAVE_RETURN_PATH } from "./durable-save-language";
import styles from "./DurableSave.module.css";

/**
 * QG 008 Lot 2 — the e-mail step of the durable save. Reuses the existing
 * magic-link Server Action (`requestMagicLink`), whose return path is
 * re-sanitized server-side (lib/auth/return-path.ts). The family's local
 * draft is not sent anywhere here; it stays in this browser until the
 * verified session opens /brouillon/reprise.
 *
 * The action's own messages are French and technical; this screen shows
 * its own translated wording for each state instead.
 */
export function DurableSaveForm({ language }: { language: Language }) {
  const [state, formAction, isPending] = useActionState(requestMagicLink, INITIAL_MAGIC_LINK_STATE);

  return (
    <form action={formAction} className={styles.form}>
      <input type="hidden" name="next" value={DURABLE_SAVE_RETURN_PATH} />
      <label className={styles.field}>
        <span>{translate(language, "durableSave.emailLabel")}</span>
        <input type="email" name="email" required autoComplete="email" disabled={isPending} />
      </label>
      <button type="submit" disabled={isPending} className={styles.primary}>
        {isPending ? translate(language, "durableSave.sending") : translate(language, "durableSave.submit")}
      </button>
      {state.status === "success" ? (
        <p role="status" className={styles.notice}>{translate(language, "durableSave.sent")}</p>
      ) : null}
      {state.status === "error" ? (
        <p role="alert" className={styles.alert}>{translate(language, "durableSave.sendFailed")}</p>
      ) : null}
    </form>
  );
}
