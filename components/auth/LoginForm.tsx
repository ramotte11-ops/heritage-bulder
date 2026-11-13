"use client";

import { AccountAccess } from "./AccountAccess";
import styles from "./LoginForm.module.css";

/**
 * QG 003 — sign-in with e-mail + password (« J'ai déjà un compte »), with
 * « Créer mon compte » and « Mot de passe oublié » in the same place
 * (`AccountAccess`). The 6-digit code only serves the first confirmation of
 * the address and the forgotten-password recovery — never daily sign-in.
 *
 * Staff accounts created before QG 003 have no password: they set one with
 * « Mot de passe oublié » (e-mail code, then new password) — the tested
 * recovery path, no bypass.
 *
 * `next` (Mission 019C) is an optional internal path to return to once
 * signed in — e.g. "/activate". Validated server-side
 * (lib/auth/return-path.ts) on every call. Never a secret.
 */
export function LoginForm({ next }: { next?: string } = {}) {
  return (
    <AccountAccess
      language="fr"
      next={next}
      initialStep="signin"
      classNames={{
        tabs: styles.tabs,
        tab: styles.tab,
        form: styles.form,
        field: styles.field,
        primary: styles.submit,
        secondary: styles.link,
        notice: styles.success,
        alert: styles.error,
      }}
    />
  );
}
