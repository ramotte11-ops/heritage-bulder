"use server";

import { runHeritageActivationAttempt } from "@/lib/entitlement/activation-session";
import type { ActivateFormState } from "@/lib/entitlement/activate-form-state";

/**
 * Mission 019C — the one Server Action behind /activate.
 *
 * Reads exactly one field, `activationKey`, and nothing else: there is no
 * `authUserId` or `ownerId` field anywhere in this form, and there could
 * not be one that meant anything —
 * lib/entitlement/activation-session.ts resolves the caller's identity
 * itself, from the validated session, every time.
 *
 * Every message below is deliberately generic. Mission 019C's brief is
 * explicit that a malformed key, an unknown key, a right that cannot be
 * claimed, and any other refusal must all read the same to the caller —
 * see lib/entitlement/activate-heritage-access.ts, which is where that
 * collapsing actually happens; this file only ever sees the single
 * `failed` status it collapses to, never the reason behind it.
 *
 * The raw key lives in `rawActivationKey` for exactly as long as this
 * function is on the stack: read once from the submitted form, handed
 * straight to `runHeritageActivationAttempt`, never logged, never put in
 * an error, never returned to the caller.
 */

const GENERIC_FAILURE_MESSAGE =
  "Nous n'avons pas pu confirmer cet accès. Vérifiez vos informations et réessayez.";

const RATE_LIMITED_MESSAGE = "Trop de tentatives. Merci de réessayer dans quelques minutes.";

const MISSING_KEY_MESSAGE = "Merci de saisir votre clé d'activation HERITAGE.";

const SUCCESS_MESSAGE =
  "Accès confirmé. Votre espace HERITAGE est prêt — l'accès à l'éditeur sera ouvert dans une prochaine étape.";

export async function activateHeritageAccessAction(
  _prevState: ActivateFormState,
  formData: FormData,
): Promise<ActivateFormState> {
  const rawActivationKey = String(formData.get("activationKey") ?? "").trim();

  if (rawActivationKey === "") {
    return { status: "error", message: MISSING_KEY_MESSAGE };
  }

  const outcome = await runHeritageActivationAttempt(rawActivationKey);

  if (outcome.status === "unauthenticated") {
    // Unreachable through the normal parcours — app/activate/page.tsx
    // only renders this action's form for an authenticated session — but
    // a Server Action can always be invoked directly, bypassing whatever
    // the page rendered. Refused the same generic way, never a hint that
    // the session is the problem.
    return { status: "error", message: GENERIC_FAILURE_MESSAGE };
  }

  switch (outcome.result.status) {
    case "redeemed":
    case "alreadyRedeemed":
      return { status: "success", message: SUCCESS_MESSAGE };
    case "rateLimited":
      return { status: "error", message: RATE_LIMITED_MESSAGE };
    case "failed":
      return { status: "error", message: GENERIC_FAILURE_MESSAGE };
  }
}
