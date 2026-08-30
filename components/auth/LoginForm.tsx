"use client";

import { useActionState } from "react";
import { requestMagicLink } from "@/app/auth/actions";
import { INITIAL_MAGIC_LINK_STATE } from "@/lib/auth/magic-link-state";
import styles from "./LoginForm.module.css";

/**
 * Email -> magic link request form. No password field exists anywhere —
 * Mission 004 never asks for one. Loading/success/error states come
 * from the requestMagicLink Server Action via React's useActionState,
 * so no browser Supabase client is needed for this page at all.
 */
export function LoginForm() {
  const [state, formAction, isPending] = useActionState(requestMagicLink, INITIAL_MAGIC_LINK_STATE);

  return (
    <form action={formAction} className={styles.form}>
      <label className={styles.field}>
        <span>Adresse email</span>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          disabled={isPending}
          placeholder="vous@exemple.com"
        />
      </label>

      <button type="submit" disabled={isPending} className={styles.submit}>
        {isPending ? "Envoi en cours…" : "Recevoir mon lien de connexion"}
      </button>

      {state.status !== "idle" && (
        <p
          role="status"
          className={state.status === "error" ? styles.error : styles.success}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
