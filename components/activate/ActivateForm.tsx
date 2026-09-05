"use client";

import { useActionState } from "react";
import { activateHeritageAccessAction } from "@/app/activate/actions";
import { INITIAL_ACTIVATE_STATE } from "@/lib/entitlement/activate-form-state";
import styles from "./ActivateForm.module.css";

/**
 * Mission 019C — the activation key form for an already-authenticated
 * visitor. No password, no purchase channel, no listing/order reference
 * anywhere in this component — it knows only the one thing `/activate`
 * is generically about: a HERITAGE activation key.
 *
 * Loading/success/error states come from activateHeritageAccessAction via
 * React's useActionState, same pattern as components/auth/LoginForm.tsx.
 * On success the form is replaced by a simple confirmation — never a
 * redirect into the Builder, which still runs on demo fixtures today
 * (Mission 021 wires the real one).
 */
export function ActivateForm() {
  const [state, formAction, isPending] = useActionState(
    activateHeritageAccessAction,
    INITIAL_ACTIVATE_STATE,
  );

  if (state.status === "success") {
    return (
      <p role="status" className={styles.success}>
        {state.message}
      </p>
    );
  }

  return (
    <form action={formAction} className={styles.form}>
      <label className={styles.field}>
        <span>Clé d&rsquo;activation HERITAGE</span>
        <input
          type="text"
          name="activationKey"
          required
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          disabled={isPending}
          placeholder="HH1-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX"
        />
      </label>

      <button type="submit" disabled={isPending} className={styles.submit}>
        {isPending ? "Vérification…" : "Activer mon accès"}
      </button>

      {state.status === "error" && (
        <p role="alert" className={styles.error}>
          {state.message}
        </p>
      )}
    </form>
  );
}
