"use server";

import { redirect, unstable_rethrow } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { getSiteUrl } from "@/lib/supabase/site-url";
import { isValidEmail } from "@/lib/auth/validate-email";
import type { MagicLinkFormState } from "@/lib/auth/magic-link-state";

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

  if (!isValidEmail(email)) {
    return { status: "error", message: "Merci de saisir une adresse email valide." };
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
      message: `Configuration Supabase indisponible : ${detail}`,
    };
  }

  try {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${getSiteUrl()}/auth/callback`,
      },
    });

    if (error) {
      console.error(
        "Magic link request failed (signInWithOtp):",
        error.message,
        "status:",
        error.status,
      );
      return {
        status: "error",
        message: `Le lien n'a pas pu être envoyé (réponse Supabase : ${error.message}).`,
      };
    }
  } catch (error) {
    unstable_rethrow(error);
    const detail = error instanceof Error ? error.message : String(error);
    console.error("Magic link request failed (unexpected):", detail);
    return {
      status: "error",
      message: `Erreur inattendue lors de l'envoi du lien : ${detail}`,
    };
  }

  return {
    status: "success",
    message: `Un lien de connexion vient d'être envoyé à ${email}. Consultez votre boîte mail.`,
  };
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
