"use client";

import { useActionState } from "react";
import { startEtsyClaimAction } from "@/app/activate/actions";
import { INITIAL_ACTIVATE_STATE } from "@/lib/entitlement/activate-form-state";
import styles from "./EtsyClaimButton.module.css";

/**
 * Mission 019B — the nominal action on `/activate`.
 *
 * One button and nothing else. The family types nothing, copies nothing,
 * and is asked for no order number, no key and no technical value: the
 * entire proof of purchase is a round-trip through Etsy that the server
 * arranges on its own.
 *
 * The form carries no field at all, deliberately — see
 * `startEtsyClaimAction`. There is no input here whose value could
 * influence which shop, which account or which redirect is used.
 *
 * Same loading/error grammar as components/auth/LoginForm.tsx and
 * components/activate/ActivateForm.tsx (`useActionState`, a `role=alert`
 * paragraph): Mission 019C's visual language is reused, not redesigned.
 * On success this never renders anything — the action redirects to Etsy.
 */
export function EtsyClaimButton() {
  const [state, formAction, isPending] = useActionState(
    startEtsyClaimAction,
    INITIAL_ACTIVATE_STATE,
  );

  return (
    <form action={formAction} className={styles.form}>
      <button type="submit" disabled={isPending} className={styles.submit}>
        {isPending ? "Redirection vers Etsy…" : "Confirmer mon achat Etsy"}
      </button>

      {state.status === "error" && (
        <p role="alert" className={styles.error}>
          {state.message}
        </p>
      )}
    </form>
  );
}
