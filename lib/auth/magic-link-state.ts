/**
 * Kept out of app/auth/actions.ts on purpose: a "use server" file may
 * only export async functions (Next.js enforces this at build time) —
 * these types and their initial values are plain data, not Server Actions.
 */

/** Why a code could not be sent — a stable reason a screen can translate. */
export type EmailCodeRequestFailure = "invalid_email" | "rate_limited" | "send_failed";

export interface MagicLinkFormState {
  status: "idle" | "success" | "error";
  message: string;
  /** QG 003 — on success, the address the code was sent to (shown back to
   * the family and carried into the code step). Never a credential. */
  email?: string;
  /** QG 003 — on error, a stable reason (the `message` stays French). */
  reason?: EmailCodeRequestFailure;
}

export const INITIAL_MAGIC_LINK_STATE: MagicLinkFormState = { status: "idle", message: "" };

/** Why a 6-digit code was refused. `invalid_or_expired` covers a wrong,
 * expired or already used code: Supabase Auth answers all three with the
 * same `otp_expired` error, on purpose (no oracle on which one it was). */
export type EmailCodeVerifyFailure =
  | "invalid_email"
  | "invalid_format"
  | "invalid_or_expired"
  | "rate_limited"
  | "failed";

export interface EmailCodeFormState {
  status: "idle" | "error";
  reason?: EmailCodeVerifyFailure;
}

export const INITIAL_EMAIL_CODE_STATE: EmailCodeFormState = { status: "idle" };

/** The code Supabase Auth e-mails (`{{ .Token }}`): six digits by default. */
export const EMAIL_CODE_PATTERN = /^\d{6}$/;

/** Supabase's default minimum interval between two e-mails to one address. */
export const EMAIL_CODE_RESEND_SECONDS = 60;
