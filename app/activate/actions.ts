"use server";

import { redirect } from "next/navigation";
import { runHeritageActivationAttempt } from "@/lib/entitlement/activation-session";
import { startEtsyClaim } from "@/lib/integration/etsy/etsy-session";
import type { ActivateFormState } from "@/lib/entitlement/activate-form-state";

/**
 * Mission 019C — the Server Action behind /activate's activation key.
 * Mission 019B — plus the one that begins the Etsy handshake, and the
 * redirection into the Builder that both paths now share.
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

const ETSY_UNAVAILABLE_MESSAGE =
  "La confirmation par Etsy n'est pas disponible pour le moment. Merci de réessayer dans quelques instants.";

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
      // Mission 019B — the maillon that was missing. Before this, a
      // successful activation ended on a sentence saying the editor
      // "will open in a later step", and the memorial the family had
      // just earned was unreachable: `memorialId` was right there in the
      // result and nothing used it.
      //
      // Both outcomes lead to the same place, deliberately. Somebody who
      // re-submits a key they already used is not making a mistake — they
      // are looking for their memorial, and this is where it is.
      //
      // redirect() throws its own control-flow signal, so it is called
      // OUTSIDE any try/catch (there is none in this function) and
      // nothing below it ever runs.
      redirect(`/builder/${outcome.result.memorialId}`);
    // falls through — unreachable, redirect() never returns
    case "rateLimited":
      return { status: "error", message: RATE_LIMITED_MESSAGE };
    case "failed":
      return { status: "error", message: GENERIC_FAILURE_MESSAGE };
  }
}

/**
 * Mission 019B — begins the Etsy handshake.
 *
 * Declares no parameter at all, and that is the security property worth
 * naming: there is nothing in this action's input a browser could use to
 * influence which Etsy account, which shop, or which redirect URI is
 * involved — it cannot read a submitted field even by accident, because
 * it is not given one. The identity comes from the validated session,
 * the shop and redirect URI from server configuration, and the PKCE
 * material from the server's own CSPRNG.
 *
 * React still invokes it with `(prevState, formData)`; a zero-argument
 * function simply ignores both, which is exactly the intent.
 *
 * On success it redirects off-site to Etsy. A refusal comes back as an
 * ordinary form state so `/activate` can stay on screen and offer the
 * activation-key path instead.
 */
export async function startEtsyClaimAction(): Promise<ActivateFormState> {
  const outcome = await startEtsyClaim();

  if (outcome.status === "redirect") {
    // Same reasoning as above: outside any try/catch, and nothing runs
    // after it.
    redirect(outcome.authorizationUrl);
  }

  // `unauthenticated` and `unavailable` collapse into one message. A
  // visitor must not be able to tell "you are not signed in" from "this
  // deployment has no Etsy configuration" — the first is already
  // impossible to reach from the rendered page, and the second is an
  // operator's problem, not a family's.
  return { status: "error", message: ETSY_UNAVAILABLE_MESSAGE };
}
