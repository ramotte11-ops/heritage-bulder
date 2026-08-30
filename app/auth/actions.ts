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
 * Never leaks a raw Supabase error to the client — only a generic,
 * actionable message. The real error is logged server-side (message
 * only, never a token/key/session value).
 */
export async function requestMagicLink(
  _prevState: MagicLinkFormState,
  formData: FormData,
): Promise<MagicLinkFormState> {
  const email = String(formData.get("email") ?? "").trim();

  if (!isValidEmail(email)) {
    return { status: "error", message: "Merci de saisir une adresse email valide." };
  }

  try {
    const supabase = await createServerSupabaseClient();

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${getSiteUrl()}/auth/callback`,
      },
    });

    if (error) {
      console.error("Magic link request failed:", error.message);
      return {
        status: "error",
        message: "Impossible d'envoyer le lien pour le moment. Merci de réessayer.",
      };
    }
  } catch (error) {
    unstable_rethrow(error);
    console.error(
      "Magic link request failed:",
      error instanceof Error ? error.message : error,
    );
    return {
      status: "error",
      message: "Impossible d'envoyer le lien pour le moment. Merci de réessayer.",
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
