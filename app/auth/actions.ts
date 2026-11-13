"use server";

import { redirect, unstable_rethrow } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { getSiteUrl } from "@/lib/supabase/site-url";
import { isValidEmail } from "@/lib/auth/validate-email";
import { sanitizeReturnPath } from "@/lib/auth/return-path";
import {
  EMAIL_CODE_PATTERN,
  type EmailCodeFormState,
  type EmailCodeVerifyFailure,
  type MagicLinkFormState,
} from "@/lib/auth/magic-link-state";

/** Supabase Auth's rate-limit answers (HTTP 429 or its own `over_*` codes). */
function isRateLimited(error: { status?: number; code?: string }): boolean {
  return error.status === 429 || (typeof error.code === "string" && error.code.startsWith("over_"));
}

/**
 * Requests a Supabase Auth magic link for the submitted email.
 *
 * Deliberately does NOT create or touch any `owners` row — Mission 004's
 * rule is "authentification ≠ droit d'accès produit". Supabase itself
 * may create a new auth.users row for a first-time email (its own
 * standard passwordless sign-up behaviour); that is Supabase's identity
 * layer, unrelated to HERITAGE's own `owners` business table, which
 * stays untouched here.
 *
 * Error reporting is intentionally split into three distinguishable
 * stages (client init / Supabase's own response / unexpected exception)
 * instead of one generic message. This is a deliberate, documented
 * exception to "never expose a raw error" — not a leak of it: in each
 * case what reaches the page is already designed for end-user display —
 * `lib/supabase/env.ts`'s own "Missing environment variable ..." text,
 * or a GoTrue AuthError's `message`, which Supabase's own hosted UI
 * shows to end users the same way — never a stack trace, token, key, or
 * connection string. It exists because this app's only current channel
 * for the real failure (Netlify's Deploy Preview function logs) has
 * proven unreachable in practice; the diagnostic value of a specific
 * message on the page outweighs a generic one once the raw internals are
 * confirmed safe to show. The real error is always logged server-side
 * too.
 */
export async function requestMagicLink(
  _prevState: MagicLinkFormState,
  formData: FormData,
): Promise<MagicLinkFormState> {
  const email = String(formData.get("email") ?? "").trim();
  // Mission 019C: where to send the visitor back once the magic link is
  // followed. Sanitized here, before it ever reaches emailRedirectTo —
  // see lib/auth/return-path.ts for why an unvalidated value would be an
  // open-redirect vector.
  const next = sanitizeReturnPath(formData.get("next") as string | null);

  if (!isValidEmail(email)) {
    return { status: "error", reason: "invalid_email", message: "Merci de saisir une adresse email valide." };
  }

  let supabase;
  try {
    supabase = await createServerSupabaseClient();
  } catch (error) {
    unstable_rethrow(error);
    const detail = error instanceof Error ? error.message : String(error);
    console.error("Magic link request failed (client init):", detail);
    return {
      status: "error",
      reason: "send_failed",
      message: `Configuration Supabase indisponible : ${detail}`,
    };
  }

  let redirectTo: string;
  try {
    redirectTo = `${await getSiteUrl()}/auth/callback?next=${encodeURIComponent(next)}`;

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectTo,
      },
    });

    if (error) {
      console.error(
        "Magic link request failed (signInWithOtp):",
        error.message,
        "status:",
        error.status,
        "redirectTo:",
        redirectTo,
      );
      return {
        status: "error",
        reason: isRateLimited(error) ? "rate_limited" : "send_failed",
        message: `Le lien n'a pas pu être envoyé (réponse Supabase : ${error.message}).`,
      };
    }
  } catch (error) {
    unstable_rethrow(error);
    const detail = error instanceof Error ? error.message : String(error);
    console.error("Magic link request failed (unexpected):", detail);
    return {
      status: "error",
      reason: "send_failed",
      message: `Erreur inattendue lors de l'envoi du lien : ${detail}`,
    };
  }

  return {
    status: "success",
    email,
    // Includes the resolved redirect target on purpose: it is only ever
    // a public base URL (never a credential), and showing it is what
    // makes a wrong resolution (e.g. localhost on a Deploy Preview)
    // provable from the page itself instead of requiring Netlify log
    // access that has proven unreachable in practice. See getSiteUrl()'s
    // docstring for why this is resolved from the request's own Host
    // header rather than platform metadata.
    message: `Un lien de connexion vient d'être envoyé à ${email}. Consultez votre boîte mail. (Redirection configurée vers ${redirectTo})`,
  };
}

/**
 * QG 003 — verifies the 6-digit code from the sign-in e-mail
 * (`{{ .Token }}`) IN THE TAB THAT ASKED FOR IT, then redirects to `next`.
 *
 * Why this exists: the e-mailed link uses PKCE, whose verifier lives in a
 * cookie of the browser that requested it. A link opened from Gmail lands
 * in another browser context (Gmail's in-app tab, or normal Chrome when
 * the request came from a private tab) and fails with "PKCE code verifier
 * not found" — proven in production logs (13/11/2026). A code typed back
 * into the same tab needs no verifier, and keeps the family in the browser
 * that holds its local guest draft (IndexedDB), which the transfer needs.
 *
 * `verifyOtp` runs on the server client, so the session cookie is written
 * on this response — exactly like the link callback. Expiry, single use
 * and attempt limits are Supabase Auth's own: a wrong, expired or already
 * used code all come back as `otp_expired` and are shown as one message.
 * Never logs the e-mail address or the code.
 */
export async function verifyEmailCode(
  _prevState: EmailCodeFormState,
  formData: FormData,
): Promise<EmailCodeFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const code = String(formData.get("code") ?? "").replace(/\s+/g, "");
  const next = sanitizeReturnPath(formData.get("next") as string | null);

  if (!isValidEmail(email)) return { status: "error", reason: "invalid_email" };
  if (!EMAIL_CODE_PATTERN.test(code)) return { status: "error", reason: "invalid_format" };

  try {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
    if (error) {
      const reason: EmailCodeVerifyFailure = error.code === "otp_expired"
        ? "invalid_or_expired"
        : isRateLimited(error) ? "rate_limited" : "failed";
      console.error("Email code verification failed:", error.code ?? "no_code", "status:", error.status ?? "none");
      return { status: "error", reason };
    }
  } catch (error) {
    unstable_rethrow(error);
    console.error(
      "Email code verification failed (unexpected):",
      error instanceof Error ? error.message : String(error),
    );
    return { status: "error", reason: "failed" };
  }

  redirect(next);
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
