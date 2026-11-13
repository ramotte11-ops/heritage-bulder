/**
 * QG 003 — state of the account forms (`accountAction`). Kept out of
 * app/auth/actions.ts: a "use server" file may only export async functions.
 *
 * `step` is where the family is; the server returns the next one.
 *   signup | signin | forgot   — the three entry forms
 *   confirm                    — first sign-up: 6-digit code, this tab
 *   reset_code                 — forgotten password: 6-digit code, this tab
 *   new_password               — after a valid reset code (session open)
 */
export type AccountStep = "signup" | "signin" | "forgot" | "confirm" | "reset_code" | "new_password";

export type AccountIntent =
  | "signup"
  | "signin"
  | "forgot"
  | "confirm"
  | "resend_confirm"
  | "verify_reset"
  | "resend_reset"
  | "new_password";

export type AccountFailure =
  | "invalid_email"
  | "missing_password"
  | "password_too_short"
  | "password_too_long"
  | "password_too_common"
  | "password_compromised"
  | "password_same"
  | "invalid_credentials"
  | "account_unavailable"
  | "invalid_code_format"
  | "invalid_or_expired_code"
  | "rate_limited"
  | "session_expired"
  | "failed";

export type AccountNotice = "code_sent" | "code_resent" | "not_confirmed";

export interface AccountFormState {
  step: AccountStep;
  /** The address the current code step is about (never a credential). */
  email?: string;
  error?: AccountFailure;
  notice?: AccountNotice;
  /** Epoch ms of the last e-mail sent — drives the resend countdown. */
  sentAt?: number;
}

export const INITIAL_ACCOUNT_STATE: AccountFormState = { step: "signup" };

/** The code Supabase Auth e-mails (`{{ .Token }}`): six digits. */
export const ACCOUNT_CODE_PATTERN = /^\d{6}$/;

/** Supabase's default minimum interval between two e-mails to one address. */
export const ACCOUNT_RESEND_SECONDS = 60;
