"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { accountAction } from "@/app/auth/actions";
import type { Language } from "@/config/languages";
import {
  ACCOUNT_RESEND_SECONDS,
  type AccountFailure,
  type AccountFormState,
  type AccountStep,
} from "@/lib/auth/account-state";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/password-policy";
import type { TranslationKey } from "@/lib/i18n/keys";
import { translate, translateWith } from "@/lib/i18n/translate";

export interface AccountAccessClassNames {
  root?: string;
  tabs?: string;
  tab?: string;
  form?: string;
  field?: string;
  primary?: string;
  secondary?: string;
  notice?: string;
  alert?: string;
}

const FAILURE_KEY: Record<AccountFailure, TranslationKey> = {
  invalid_email: "account.errorInvalidEmail",
  missing_password: "account.errorMissingPassword",
  password_too_short: "account.errorPasswordShort",
  password_too_long: "account.errorPasswordLong",
  password_too_common: "account.errorPasswordCommon",
  password_compromised: "account.errorPasswordCompromised",
  password_same: "account.errorPasswordSame",
  invalid_credentials: "account.errorCredentials",
  account_unavailable: "account.errorAccountUnavailable",
  invalid_code_format: "account.errorCodeFormat",
  invalid_or_expired_code: "account.errorCode",
  rate_limited: "account.errorRateLimited",
  session_expired: "account.errorSessionExpired",
  failed: "account.errorFailed",
};

type EntryStep = "signup" | "signin" | "forgot";

/**
 * QG 003 — « Créer mon compte » · « J'ai déjà un compte » · « Mot de passe
 * oublié », one component, one Server Action (`accountAction`).
 *
 * The three entry forms are local choices; once the server answers with a
 * code step (`confirm`, `reset_code`) or the new-password step, that step is
 * shown until the family leaves it (« Retour »). The 6-digit code is typed
 * in THIS tab, so the session lands in the browser that holds the local
 * guest draft. Nothing here stores or logs a password or a code.
 */
export function AccountAccess({
  language,
  next,
  initialStep = "signup",
  classNames = {},
}: {
  language: Language;
  next?: string;
  initialStep?: EntryStep;
  classNames?: AccountAccessClassNames;
}) {
  const t = (key: TranslationKey) => translate(language, key);
  const [state, formAction, pending] = useActionState(accountAction, { step: initialStep });
  const [entry, setEntry] = useState<EntryStep>(initialStep);
  // « Retour » from a code step: the server state is set aside until the
  // next answer (identity comparison — a new answer is a new object).
  const [dismissed, setDismissed] = useState<AccountFormState | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const hintId = useId();
  const [now, setNow] = useState(0);

  const active = dismissed === state ? null : state;
  // The server's step wins until the family picks another form.
  const step: AccountStep = active ? active.step : entry;
  const error = active?.error;
  const email = active?.email ?? "";

  const sentAt = active?.sentAt ?? 0;
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

  const choose = (target: EntryStep) => {
    setEntry(target);
    setDismissed(state);
  };

  const hidden = (intent: string) => (
    <>
      <input type="hidden" name="intent" value={intent} />
      {next ? <input type="hidden" name="next" value={next} /> : null}
    </>
  );
  const alert = error ? (
    <p role="alert" className={classNames.alert} data-account-error={error}>{t(FAILURE_KEY[error])}</p>
  ) : null;
  const emailField = (
    <label className={classNames.field}>
      <span>{t("account.email")}</span>
      <input type="email" name="email" required autoComplete="email" inputMode="email" defaultValue={email} disabled={pending} />
    </label>
  );
  const passwordField = (autoComplete: "new-password" | "current-password", label: TranslationKey) => {
    const isNew = autoComplete === "new-password";
    return (
      <>
        <label className={classNames.field}>
          <span>{t(label)}</span>
          <input
            type={showPassword ? "text" : "password"}
            name="password"
            required
            minLength={isNew ? PASSWORD_MIN_LENGTH : undefined}
            autoComplete={autoComplete}
            aria-describedby={isNew ? hintId : undefined}
            disabled={pending}
          />
        </label>
        {isNew ? <small id={hintId}>{t("account.passwordHint")}</small> : null}
      </>
    );
  };
  const showToggle = (
    <label className={classNames.field}>
      <span>
        <input type="checkbox" checked={showPassword} onChange={(event) => setShowPassword(event.target.checked)} />{" "}
        {t("account.showPassword")}
      </span>
    </label>
  );
  const submit = (label: TranslationKey) => (
    <button type="submit" disabled={pending} className={classNames.primary}>
      {pending ? t("account.pending") : t(label)}
    </button>
  );

  if (step === "confirm" || step === "reset_code") {
    const isConfirm = step === "confirm";
    const notice = active?.notice === "code_resent"
      ? `${t("account.codeResent")} `
      : active?.notice === "not_confirmed" ? `${t("account.notConfirmed")} ` : "";
    return (
      <div className={classNames.root} data-account-step={step}>
        <form action={formAction} className={classNames.form}>
          {hidden(isConfirm ? "confirm" : "verify_reset")}
          <input type="hidden" name="email" value={email} />
          <h2>{t(isConfirm ? "account.confirmTitle" : "account.resetTitle")}</h2>
          <p role="status" className={classNames.notice}>
            {notice}
            {translateWith(language, isConfirm ? "account.confirmBody" : "account.resetBody", { email })}
          </p>
          <label className={classNames.field}>
            <span>{t("account.code")}</span>
            <input
              type="text"
              name="code"
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              minLength={6}
              maxLength={6}
              disabled={pending}
            />
          </label>
          {submit("account.codeSubmit")}
          {alert}
        </form>
        <form action={formAction} className={classNames.form}>
          {hidden(isConfirm ? "resend_confirm" : "resend_reset")}
          <input type="hidden" name="email" value={email} />
          <button type="submit" className={classNames.secondary} disabled={pending || remaining > 0} data-account-resend>
            {remaining > 0 ? translateWith(language, "account.resendWait", { seconds: remaining }) : t("account.resend")}
          </button>
        </form>
        <button type="button" className={classNames.secondary} onClick={() => choose(isConfirm ? "signin" : "forgot")}>
          {t("account.back")}
        </button>
      </div>
    );
  }

  if (step === "new_password") {
    return (
      <div className={classNames.root} data-account-step="new_password">
        <form action={formAction} className={classNames.form}>
          {hidden("new_password")}
          <input type="hidden" name="email" value={email} />
          <h2>{t("account.newPasswordTitle")}</h2>
          {passwordField("new-password", "account.newPassword")}
          {showToggle}
          {submit("account.newPasswordSubmit")}
          {alert}
        </form>
      </div>
    );
  }

  return (
    <div className={classNames.root} data-account-step={step}>
      {step !== "forgot" ? (
        <div className={classNames.tabs} role="tablist">
          {(["signup", "signin"] as const).map((target) => (
            <button
              key={target}
              type="button"
              role="tab"
              aria-selected={step === target}
              className={classNames.tab}
              onClick={() => choose(target)}
            >
              {t(target === "signup" ? "account.tabSignup" : "account.tabSignin")}
            </button>
          ))}
        </div>
      ) : null}

      <form action={formAction} className={classNames.form} key={step}>
        {hidden(step)}
        {step === "forgot" ? <h2>{t("account.forgotTitle")}</h2> : null}
        {emailField}
        {step === "signup" ? passwordField("new-password", "account.password") : null}
        {step === "signin" ? passwordField("current-password", "account.password") : null}
        {step !== "forgot" ? showToggle : null}
        {submit(step === "signup" ? "account.signupSubmit" : step === "signin" ? "account.signinSubmit" : "account.forgotSubmit")}
        {alert}
      </form>

      {step === "signin" ? (
        <button type="button" className={classNames.secondary} onClick={() => choose("forgot")}>
          {t("account.forgot")}
        </button>
      ) : null}
      {step === "forgot" ? (
        <button type="button" className={classNames.secondary} onClick={() => choose("signin")}>
          {t("account.back")}
        </button>
      ) : null}
    </div>
  );
}
