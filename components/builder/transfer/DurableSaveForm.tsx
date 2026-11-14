"use client";

import { AccountAccess } from "@/components/auth/AccountAccess";
import type { Language } from "@/config/languages";
import { DURABLE_SAVE_RETURN_PATH } from "./durable-save-language";
import styles from "./DurableSave.module.css";

/**
 * QG 008 Lot 2, QG 003 — the account step of the durable save:
 * « Créer mon compte » (e-mail + password, then the 6-digit code typed in
 * this tab) or « J'ai déjà un compte ». The verified session then opens
 * /brouillon/reprise, whose transfer still requires a confirmed address.
 * The family's local draft is not sent anywhere here; it stays in this
 * browser until the transfer.
 */
export function DurableSaveForm({ language }: { language: Language }) {
  return (
    <AccountAccess
      language={language}
      next={DURABLE_SAVE_RETURN_PATH}
      initialStep="signup"
      classNames={{
        tabs: styles.tabs,
        tab: styles.tab,
        form: styles.form,
        field: styles.field,
        primary: styles.primary,
        secondary: styles.secondary,
        notice: styles.notice,
        alert: styles.alert,
      }}
    />
  );
}
