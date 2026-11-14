"use client";

import { useActionState, useEffect, useState } from "react";
import { accountAction } from "@/app/auth/actions";
import type { Language } from "@/config/languages";
import { ACCOUNT_RESEND_SECONDS, type AccountFailure, type AccountFormState } from "@/lib/auth/account-state";
import type { TranslationKey } from "@/lib/i18n/keys";
import { translate, translateWith } from "@/lib/i18n/translate";

export interface EmailVerificationClassNames {
  root?: string;
  form?: string;
  field?: string;
  primary?: string;
  secondary?: string;
  notice?: string;
  alert?: string;
}

const FAILURE_KEY: Partial<Record<AccountFailure, TranslationKey>> = {
  invalid_email: "account.errorInvalidEmail",
  missing_password: "account.errorMissingPassword",
  invalid_credentials: "account.errorCredentials",
  invalid_code_format: "account.errorCodeFormat",
  invalid_or_expired_code: "account.errorCode",
  rate_limited: "account.errorRateLimited",
  signed_out: "verify.errorSignedOut",
  session_expired: "verify.errorSignedOut",
  email_taken: "verify.errorEmailTaken",
  email_locked: "verify.errorEmailLocked",
  same_email: "verify.errorSameEmail",
};

/**
 * QG 004-B — « Confirmez votre adresse e-mail », shown once, before the
 * first publication. A 6-digit code is sent to the address of the signed-in
 * account (read on the server, never typed here) and typed back in this tab.
 * « Ce n'est pas la bonne adresse ? » lets the family correct it (current
 * password, then a code sent to the NEW address), when the address is not
 * locked by a free-offer history. `onVerified` is called once the proof is
 * recorded; publishing stays the family's own next click.
 */
export function EmailVerificationStep({
  language,
  onVerified,
  classNames = {},
}: {
  language: Language;
  onVerified: () => void;
  classNames?: EmailVerificationClassNames;
}) {
  const t = (key: TranslationKey) => translate(language, key);
  const [state, formAction, pending] = useActionState(accountAction, { step: "verify_email" } as AccountFormState);
  const [changing, setChanging] = useState<AccountFormState | null>(null);
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (state.step === "verified") onVerified();
  }, [onVerified, state]);

  const sentAt = state.sentAt ?? 0;
  useEffect(() => {
    if (sentAt === 0) return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [sentAt]);
  const remaining = sentAt === 0 ? 0 : Math.max(0, Math.ceil((sentAt + ACCOUNT_RESEND_SECONDS * 1000 - now) / 1000));

  // « Ce n'est pas la bonne adresse ? » until the server answers again.
  const showChange = changing === state && state.step !== "change_email_code";
  const step = showChange ? "change_email" : state.step;
  const errorKey = state.error ? FAILURE_KEY[state.error] ?? "account.errorFailed" : null;
  const alert = errorKey && !showChange ? (
    <p role="alert" className={classNames.alert} data-verify-error={state.error}>{t(errorKey)}</p>
  ) : null;
  const codeInput = (
    <label className={classNames.field}>
      <span>{t("account.code")}</span>
      <input type="text" name="code" required inputMode="numeric" autoComplete="one-time-code"
        pattern="[0-9]{6}" minLength={6} maxLength={6} disabled={pending} />
    </label>
  );

  if (step === "verified") {
    return (
      <div className={classNames.root} data-email-verification="verified">
        <p role="status" className={classNames.notice}>{t("verify.done")}</p>
      </div>
    );
  }

  if (step === "change_email") {
    return (
      <div className={classNames.root} data-email-verification="change_email">
        <form action={formAction} className={classNames.form}>
          <input type="hidden" name="intent" value="change_email_send" />
          <p className={classNames.notice}>{t("verify.changeIntro")}</p>
          <label className={classNames.field}>
            <span>{t("verify.newEmail")}</span>
            <input type="email" name="newEmail" required autoComplete="email" inputMode="email" disabled={pending} />
          </label>
          <label className={classNames.field}>
            <span>{t("verify.currentPassword")}</span>
            <input type="password" name="password" required autoComplete="current-password" disabled={pending} />
          </label>
          <button type="submit" className={classNames.primary} disabled={pending}>
            {pending ? t("account.pending") : t("verify.changeSubmit")}
          </button>
          {state.step === "change_email" && errorKey ? (
            <p role="alert" className={classNames.alert} data-verify-error={state.error}>{t(errorKey)}</p>
          ) : null}
        </form>
        <button type="button" className={classNames.secondary} onClick={() => setChanging(null)}>
          {t("account.back")}
        </button>
      </div>
    );
  }

  if (step === "change_email_code") {
    return (
      <div className={classNames.root} data-email-verification="change_email_code">
        <form action={formAction} className={classNames.form}>
          <input type="hidden" name="intent" value="change_email_check" />
          <input type="hidden" name="newEmail" value={state.email ?? ""} />
          <p role="status" className={classNames.notice}>
            {translateWith(language, "verify.codeSentTo", { email: state.email ?? "" })}
          </p>
          {codeInput}
          <button type="submit" className={classNames.primary} disabled={pending}>
            {pending ? t("account.pending") : t("account.codeSubmit")}
          </button>
          {alert}
        </form>
      </div>
    );
  }

  const sent = state.notice === "code_sent" || state.notice === "code_resent" || state.error === "invalid_or_expired_code" || state.error === "invalid_code_format";
  return (
    <div className={classNames.root} data-email-verification={sent ? "code" : "start"}>
      <p className={classNames.notice}><strong>{t("verify.title")}</strong> {t("verify.intro")}</p>
      {sent ? (
        <form action={formAction} className={classNames.form}>
          <input type="hidden" name="intent" value="verify_email_check" />
          <p role="status" className={classNames.notice}>
            {translateWith(language, "verify.codeSentTo", { email: state.email ?? "" })}
          </p>
          {codeInput}
          <button type="submit" className={classNames.primary} disabled={pending}>
            {pending ? t("account.pending") : t("account.codeSubmit")}
          </button>
          {alert}
        </form>
      ) : null}
      <form action={formAction} className={classNames.form}>
        <input type="hidden" name="intent" value="verify_email_send" />
        <button type="submit" className={sent ? classNames.secondary : classNames.primary}
          disabled={pending || remaining > 0} data-verify-send>
          {remaining > 0
            ? translateWith(language, "account.resendWait", { seconds: remaining })
            : t(sent ? "account.resend" : "verify.send")}
        </button>
        {!sent ? alert : null}
      </form>
      <button type="button" className={classNames.secondary} onClick={() => setChanging(state)}>
        {t("verify.notMyAddress")}
      </button>
    </div>
  );
}
