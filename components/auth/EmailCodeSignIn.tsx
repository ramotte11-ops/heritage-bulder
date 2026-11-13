"use client";

import { useActionState, useEffect, useState } from "react";
import { requestMagicLink, verifyEmailCode } from "@/app/auth/actions";
import {
  EMAIL_CODE_RESEND_SECONDS,
  INITIAL_EMAIL_CODE_STATE,
  INITIAL_MAGIC_LINK_STATE,
  type EmailCodeRequestFailure,
  type EmailCodeVerifyFailure,
  type MagicLinkFormState,
} from "@/lib/auth/magic-link-state";

/** Every text the two steps show — the caller translates them. */
export interface EmailCodeSignInLabels {
  emailLabel: string;
  emailPlaceholder?: string;
  requestSubmit: string;
  requestSending: string;
  /** Shown above the code field; `{email}` is replaced by the address. */
  codeSent: string;
  codeLabel: string;
  codeSubmit: string;
  codeVerifying: string;
  resend: string;
  /** `{seconds}` is replaced by the remaining wait. */
  resendWait: string;
  resent: string;
  changeEmail: string;
  requestErrors: Record<EmailCodeRequestFailure, string>;
  verifyErrors: Record<EmailCodeVerifyFailure, string>;
}

export interface EmailCodeSignInClassNames {
  form?: string;
  field?: string;
  primary?: string;
  secondary?: string;
  notice?: string;
  alert?: string;
}

/** The request step's state, plus what must survive a failed resend. */
interface RequestStepState {
  last: MagicLinkFormState;
  /** Address of the last successful send — the code step stays on it. */
  sentTo: string;
  sends: number;
  sentAt: number;
}

const INITIAL_REQUEST_STEP: RequestStepState = { last: INITIAL_MAGIC_LINK_STATE, sentTo: "", sends: 0, sentAt: 0 };

async function requestStep(previous: RequestStepState, formData: FormData): Promise<RequestStepState> {
  const last = await requestMagicLink(previous.last, formData);
  if (last.status !== "success") return { ...previous, last };
  return { last, sentTo: last.email ?? "", sends: previous.sends + 1, sentAt: Date.now() };
}

function fill(text: string, values: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : placeholder);
}

/**
 * QG 003 — e-mail, then a 6-digit code typed back IN THIS TAB.
 *
 * Step 1 asks Supabase Auth to e-mail a sign-in message (`requestMagicLink`:
 * it still carries the link, and now the code). Step 2 verifies the code on
 * the server (`verifyEmailCode`), which writes the session cookie and
 * redirects to `next` — the family never leaves the tab, so the local guest
 * draft of this browser stays reachable. « Renvoyer un code » asks for a
 * fresh one (Supabase's own per-address interval is mirrored by a visible
 * countdown); « Modifier l'adresse » returns to step 1 with the address
 * kept. A failed resend keeps the family on the code step.
 */
export function EmailCodeSignIn({
  next,
  labels,
  classNames = {},
}: {
  next?: string;
  labels: EmailCodeSignInLabels;
  classNames?: EmailCodeSignInClassNames;
}) {
  const [request, requestAction, requestPending] = useActionState(requestStep, INITIAL_REQUEST_STEP);
  const [verifyState, verifyAction, verifyPending] = useActionState(verifyEmailCode, INITIAL_EMAIL_CODE_STATE);
  // « Modifier l'adresse » is open until the next successful send.
  const [editingAtSend, setEditingAtSend] = useState<number | null>(null);
  const editingEmail = editingAtSend === request.sends;
  const [now, setNow] = useState(0);

  const remaining = request.sentAt === 0
    ? 0
    : Math.max(0, Math.ceil((request.sentAt + EMAIL_CODE_RESEND_SECONDS * 1000 - now) / 1000));

  // A one-second clock only while a countdown can be running.
  useEffect(() => {
    if (request.sentAt === 0) return;
    const tick = () => setNow(Date.now());
    const timer = setInterval(tick, 1000);
    const first = setTimeout(tick, 0);
    return () => {
      clearInterval(timer);
      clearTimeout(first);
    };
  }, [request.sentAt]);

  const onCodeStep = request.sentTo !== "" && !editingEmail;
  const requestError = request.last.status === "error"
    ? labels.requestErrors[request.last.reason ?? "send_failed"]
    : null;

  if (!onCodeStep) {
    return (
      <form action={requestAction} className={classNames.form} data-email-code-step="email">
        {next ? <input type="hidden" name="next" value={next} /> : null}
        <label className={classNames.field}>
          <span>{labels.emailLabel}</span>
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            inputMode="email"
            defaultValue={request.sentTo}
            placeholder={labels.emailPlaceholder}
            disabled={requestPending}
          />
        </label>
        <button type="submit" disabled={requestPending} className={classNames.primary}>
          {requestPending ? labels.requestSending : labels.requestSubmit}
        </button>
        {requestError !== null ? <p role="alert" className={classNames.alert}>{requestError}</p> : null}
      </form>
    );
  }

  return (
    <div data-email-code-step="code">
      <form action={verifyAction} className={classNames.form}>
        <input type="hidden" name="email" value={request.sentTo} />
        {next ? <input type="hidden" name="next" value={next} /> : null}
        <p role="status" className={classNames.notice}>
          {request.sends > 1 ? `${labels.resent} ` : ""}
          {fill(labels.codeSent, { email: request.sentTo })}
        </p>
        <label className={classNames.field}>
          <span>{labels.codeLabel}</span>
          <input
            type="text"
            name="code"
            required
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            minLength={6}
            disabled={verifyPending}
            aria-describedby={verifyState.status === "error" ? "email-code-error" : undefined}
          />
        </label>
        <button type="submit" disabled={verifyPending} className={classNames.primary}>
          {verifyPending ? labels.codeVerifying : labels.codeSubmit}
        </button>
        {verifyState.status === "error" ? (
          <p id="email-code-error" role="alert" className={classNames.alert}>
            {labels.verifyErrors[verifyState.reason ?? "failed"]}
          </p>
        ) : null}
      </form>

      <form action={requestAction} className={classNames.form}>
        <input type="hidden" name="email" value={request.sentTo} />
        {next ? <input type="hidden" name="next" value={next} /> : null}
        <button
          type="submit"
          className={classNames.secondary}
          disabled={requestPending || remaining > 0}
          data-email-code-resend
        >
          {remaining > 0 ? fill(labels.resendWait, { seconds: remaining }) : labels.resend}
        </button>
        {requestError !== null ? <p role="alert" className={classNames.alert}>{requestError}</p> : null}
      </form>

      <button type="button" className={classNames.secondary} onClick={() => setEditingAtSend(request.sends)}>
        {labels.changeEmail}
      </button>
    </div>
  );
}
