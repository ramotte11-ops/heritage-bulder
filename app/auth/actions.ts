"use server";

import { redirect, unstable_rethrow } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { getSiteUrl } from "@/lib/supabase/site-url";
import { isValidEmail } from "@/lib/auth/validate-email";
import { sanitizeReturnPath } from "@/lib/auth/return-path";
import { checkPassword, type PasswordProblem } from "@/lib/auth/password-policy";
import {
  ACCOUNT_CODE_PATTERN,
  type AccountFailure,
  type AccountFormState,
  type AccountIntent,
  type AccountStep,
} from "@/lib/auth/account-state";

/**
 * QG 003 — the family's account: e-mail + password.
 *
 *   signup        signUp(email, password) → Supabase e-mails a 6-digit code
 *   confirm       verifyOtp(type "email") IN THIS TAB → session → `next`
 *   signin        signInWithPassword → session → `next`
 *   forgot        resetPasswordForEmail → 6-digit code
 *   verify_reset  verifyOtp(type "recovery") IN THIS TAB → session
 *   new_password  updateUser({ password }) → `next`
 *
 * Codes are typed back into the tab that asked for them: the e-mailed links
 * use PKCE, whose verifier lives in the requesting browser's cookies, and
 * failed in production when Gmail opened them elsewhere (logs, 13/11/2026).
 * Every call runs on the cookie-aware server client, so the session cookie
 * is written on this response (`@supabase/ssr`), then kept fresh by
 * proxy.ts. The transfer of the guest draft (/brouillon/reprise) still
 * requires a confirmed address (`email_confirmed_at`) — untouched here.
 *
 * Security rules applied throughout:
 * - neutral messages: a sign-in failure never says whether the address
 *   exists; sign-up and « mot de passe oublié » always answer the same way;
 * - passwords and codes are never logged (only Supabase's error code and
 *   HTTP status are), nor returned to the page;
 * - `next` is re-sanitized on every call (lib/auth/return-path.ts);
 * - expiry, single use and attempt/e-mail limits are Supabase Auth's own,
 *   surfaced as `rate_limited` / `invalid_or_expired_code`.
 */

interface AuthErrorLike {
  code?: string;
  status?: number;
  reasons?: string[];
  message?: string;
}

function isRateLimited(error: AuthErrorLike): boolean {
  return error.status === 429 || (typeof error.code === "string" && error.code.startsWith("over_"));
}

function logAuthFailure(stage: string, error: AuthErrorLike): void {
  console.error(`Account ${stage} failed:`, error.code ?? "no_code", "status:", error.status ?? "none");
}

const PASSWORD_PROBLEM: Record<PasswordProblem, AccountFailure> = {
  too_short: "password_too_short",
  too_long: "password_too_long",
  too_common: "password_too_common",
};

function passwordFailure(error: AuthErrorLike): AccountFailure | null {
  if (error.code !== "weak_password") return null;
  if (error.reasons?.includes("pwned")) return "password_compromised";
  return error.reasons?.includes("length") ? "password_too_short" : "password_too_common";
}

function codeFailure(error: AuthErrorLike): AccountFailure {
  if (error.code === "otp_expired") return "invalid_or_expired_code";
  return isRateLimited(error) ? "rate_limited" : "failed";
}

interface Fields {
  email: string;
  password: string;
  code: string;
  next: string;
}

function readFields(formData: FormData): Fields {
  return {
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
    code: String(formData.get("code") ?? "").replace(/\s+/g, ""),
    next: sanitizeReturnPath(formData.get("next") as string | null),
  };
}

async function confirmationRedirect(next: string): Promise<string> {
  return `${await getSiteUrl()}/auth/callback?next=${encodeURIComponent(next)}`;
}

/** Result of one intent: a new state, or a path to redirect to. */
type Outcome = AccountFormState | { redirectTo: string };

async function signUp(supabase: SupabaseClient, f: Fields): Promise<Outcome> {
  const fail = (error: AccountFailure): AccountFormState => ({ step: "signup", email: f.email, error });
  if (!isValidEmail(f.email)) return fail("invalid_email");
  const problem = checkPassword(f.password, f.email);
  if (problem) return fail(PASSWORD_PROBLEM[problem]);

  const { data, error } = await supabase.auth.signUp({
    email: f.email,
    password: f.password,
    options: { emailRedirectTo: await confirmationRedirect(f.next) },
  });
  if (error) {
    logAuthFailure("sign-up", error);
    const weak = passwordFailure(error);
    if (weak) return fail(weak);
    if (isRateLimited(error)) return fail("rate_limited");
    if (error.code === "user_already_exists" || error.code === "email_exists") return fail("account_unavailable");
    return fail("failed");
  }
  // "Confirm email" disabled on the project: the account is already usable.
  if (data.session) return { redirectTo: f.next };
  // Same answer whether or not the address already had an account
  // (Supabase obfuscates an existing confirmed user): no enumeration.
  return { step: "confirm", email: f.email, notice: "code_sent", sentAt: Date.now() };
}

async function confirm(supabase: SupabaseClient, f: Fields): Promise<Outcome> {
  const fail = (error: AccountFailure): AccountFormState => ({ step: "confirm", email: f.email, error });
  if (!isValidEmail(f.email)) return fail("invalid_email");
  if (!ACCOUNT_CODE_PATTERN.test(f.code)) return fail("invalid_code_format");
  const { error } = await supabase.auth.verifyOtp({ email: f.email, token: f.code, type: "email" });
  if (error) {
    logAuthFailure("confirmation", error);
    return fail(codeFailure(error));
  }
  return { redirectTo: f.next };
}

async function resendConfirm(supabase: SupabaseClient, f: Fields): Promise<Outcome> {
  if (!isValidEmail(f.email)) return { step: "confirm", email: f.email, error: "invalid_email" };
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: f.email,
    options: { emailRedirectTo: await confirmationRedirect(f.next) },
  });
  if (error) {
    logAuthFailure("confirmation resend", error);
    if (isRateLimited(error)) return { step: "confirm", email: f.email, error: "rate_limited" };
  }
  return { step: "confirm", email: f.email, notice: "code_resent", sentAt: Date.now() };
}

async function signIn(supabase: SupabaseClient, f: Fields): Promise<Outcome> {
  const fail = (error: AccountFailure): AccountFormState => ({ step: "signin", email: f.email, error });
  if (!isValidEmail(f.email)) return fail("invalid_email");
  if (f.password.length === 0) return fail("missing_password");

  const { error } = await supabase.auth.signInWithPassword({ email: f.email, password: f.password });
  if (!error) return { redirectTo: f.next };
  logAuthFailure("sign-in", error);
  if (isRateLimited(error)) return fail("rate_limited");
  if (error.code === "email_not_confirmed") {
    // Right password, address never confirmed: send a fresh code and move
    // to the code step (only reachable with the correct password).
    const resent = await supabase.auth.resend({
      type: "signup",
      email: f.email,
      options: { emailRedirectTo: await confirmationRedirect(f.next) },
    });
    if (resent.error) logAuthFailure("confirmation resend", resent.error);
    return { step: "confirm", email: f.email, notice: "not_confirmed", sentAt: Date.now() };
  }
  // invalid_credentials and anything else: one neutral message.
  return fail(error.code === "invalid_credentials" ? "invalid_credentials" : "failed");
}

async function forgot(supabase: SupabaseClient, f: Fields): Promise<Outcome> {
  if (!isValidEmail(f.email)) return { step: "forgot", email: f.email, error: "invalid_email" };
  const { error } = await supabase.auth.resetPasswordForEmail(f.email, {
    redirectTo: await confirmationRedirect(f.next),
  });
  if (error) {
    logAuthFailure("password reset request", error);
    if (isRateLimited(error)) return { step: "forgot", email: f.email, error: "rate_limited" };
  }
  // Same answer whether or not an account exists for this address.
  return { step: "reset_code", email: f.email, notice: "code_sent", sentAt: Date.now() };
}

async function resendReset(supabase: SupabaseClient, f: Fields): Promise<Outcome> {
  const sent = await forgot(supabase, f);
  if ("redirectTo" in sent || sent.step !== "reset_code") {
    return "redirectTo" in sent ? sent : { ...sent, step: "reset_code" };
  }
  return { ...sent, notice: "code_resent" };
}

async function verifyReset(supabase: SupabaseClient, f: Fields): Promise<Outcome> {
  const fail = (error: AccountFailure): AccountFormState => ({ step: "reset_code", email: f.email, error });
  if (!isValidEmail(f.email)) return fail("invalid_email");
  if (!ACCOUNT_CODE_PATTERN.test(f.code)) return fail("invalid_code_format");
  const { error } = await supabase.auth.verifyOtp({ email: f.email, token: f.code, type: "recovery" });
  if (error) {
    logAuthFailure("password reset code", error);
    return fail(codeFailure(error));
  }
  // The recovery session cookie is now set: the next form may change it.
  return { step: "new_password", email: f.email };
}

async function newPassword(supabase: SupabaseClient, f: Fields): Promise<Outcome> {
  const fail = (error: AccountFailure): AccountFormState => ({ step: "new_password", email: f.email, error });
  const problem = checkPassword(f.password, f.email);
  if (problem) return fail(PASSWORD_PROBLEM[problem]);

  const { data } = await supabase.auth.getUser();
  if (!data.user) return { step: "forgot", email: f.email, error: "session_expired" };

  const { error } = await supabase.auth.updateUser({ password: f.password });
  if (error) {
    logAuthFailure("password update", error);
    const weak = passwordFailure(error);
    if (weak) return fail(weak);
    if (error.code === "same_password") return fail("password_same");
    if (isRateLimited(error)) return fail("rate_limited");
    return fail("failed");
  }
  return { redirectTo: f.next };
}

const HANDLERS: Record<AccountIntent, (supabase: SupabaseClient, f: Fields) => Promise<Outcome>> = {
  signup: signUp,
  confirm,
  resend_confirm: resendConfirm,
  signin: signIn,
  forgot,
  verify_reset: verifyReset,
  resend_reset: resendReset,
  new_password: newPassword,
};

const INTENT_STEP: Record<AccountIntent, AccountStep> = {
  signup: "signup",
  confirm: "confirm",
  resend_confirm: "confirm",
  signin: "signin",
  forgot: "forgot",
  verify_reset: "reset_code",
  resend_reset: "reset_code",
  new_password: "new_password",
};

function isIntent(value: unknown): value is AccountIntent {
  return typeof value === "string" && Object.hasOwn(HANDLERS, value);
}

/** The one Server Action behind « Créer mon compte », « J'ai déjà un compte »
 * and « Mot de passe oublié » (field `intent` picks the step). */
export async function accountAction(
  previous: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const intent = formData.get("intent");
  if (!isIntent(intent)) return { ...previous, error: "failed" };
  const fields = readFields(formData);

  let outcome: Outcome;
  try {
    const supabase = await createServerSupabaseClient();
    outcome = await HANDLERS[intent](supabase, fields);
  } catch (error) {
    unstable_rethrow(error);
    console.error(
      `Account ${intent} failed (unexpected):`,
      error instanceof Error ? error.name : "unknown",
    );
    return { step: INTENT_STEP[intent], email: fields.email, error: "failed" };
  }

  if ("redirectTo" in outcome) redirect(outcome.redirectTo);
  return outcome;
}

/**
 * Destroys the current Supabase Auth session (server-side, so the
 * session cookie is actually cleared in the response) and redirects to
 * /login. Never throws to the caller — a failed sign-out still redirects
 * (the user's intent to leave the owner area is honoured either way),
 * with the real error logged server-side.
 */
export async function signOut(): Promise<void> {
  try {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("Sign-out failed:", error.message);
    }
  } catch (error) {
    unstable_rethrow(error);
    console.error("Sign-out failed:", error instanceof Error ? error.message : error);
  }

  redirect("/login");
}
