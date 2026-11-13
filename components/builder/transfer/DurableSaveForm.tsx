"use client";

import { EmailCodeSignIn } from "@/components/auth/EmailCodeSignIn";
import type { Language } from "@/config/languages";
import type { TranslationKey } from "@/lib/i18n/keys";
import { translate } from "@/lib/i18n/translate";
import { DURABLE_SAVE_RETURN_PATH } from "./durable-save-language";
import styles from "./DurableSave.module.css";

/**
 * QG 008 Lot 2, QG 003 — the e-mail step of the durable save: the family
 * enters its address, receives a 6-digit code and types it back here, in
 * this tab (`EmailCodeSignIn`). The verified session then opens
 * /brouillon/reprise (return path re-sanitized server-side,
 * lib/auth/return-path.ts). The family's local draft is not sent anywhere
 * here; it stays in this browser until the transfer.
 */
export function DurableSaveForm({ language }: { language: Language }) {
  const t = (key: TranslationKey) => translate(language, key);
  return (
    <EmailCodeSignIn
      next={DURABLE_SAVE_RETURN_PATH}
      classNames={{
        form: styles.form,
        field: styles.field,
        primary: styles.primary,
        secondary: styles.secondary,
        notice: styles.notice,
        alert: styles.alert,
      }}
      labels={{
        emailLabel: t("durableSave.emailLabel"),
        requestSubmit: t("durableSave.submit"),
        requestSending: t("durableSave.sending"),
        codeSent: t("durableSave.codeSent"),
        codeLabel: t("durableSave.codeLabel"),
        codeSubmit: t("durableSave.codeSubmit"),
        codeVerifying: t("durableSave.codeVerifying"),
        resend: t("durableSave.codeResend"),
        resendWait: t("durableSave.codeResendWait"),
        resent: t("durableSave.codeResent"),
        changeEmail: t("durableSave.changeEmail"),
        requestErrors: {
          invalid_email: t("durableSave.invalidEmail"),
          rate_limited: t("durableSave.rateLimited"),
          send_failed: t("durableSave.sendFailed"),
        },
        verifyErrors: {
          invalid_email: t("durableSave.invalidEmail"),
          invalid_format: t("durableSave.codeFormat"),
          invalid_or_expired: t("durableSave.codeInvalid"),
          rate_limited: t("durableSave.rateLimited"),
          failed: t("durableSave.codeFailed"),
        },
      }}
    />
  );
}
