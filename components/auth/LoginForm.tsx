"use client";

import { EmailCodeSignIn } from "./EmailCodeSignIn";
import styles from "./LoginForm.module.css";

/**
 * Email -> 6-digit code sign-in. No password field exists anywhere —
 * Mission 004 never asks for one. QG 003: the code is typed back into
 * this tab (`EmailCodeSignIn` → `verifyEmailCode`), so signing in no
 * longer depends on which browser opens the e-mail; the e-mail still
 * carries the link (`/auth/callback`) for the same browser.
 *
 * `next` (Mission 019C) is an optional internal path to return to once
 * signed in — e.g. "/activate". Carried as a plain hidden field, validated
 * server-side (lib/auth/return-path.ts) before it touches anything
 * Supabase-facing. Never a secret: a route path is already public.
 */
export function LoginForm({ next }: { next?: string } = {}) {
  return (
    <EmailCodeSignIn
      next={next}
      classNames={{
        form: styles.form,
        field: styles.field,
        primary: styles.submit,
        secondary: styles.submit,
        notice: styles.success,
        alert: styles.error,
      }}
      labels={{
        emailLabel: "Adresse email",
        emailPlaceholder: "vous@exemple.com",
        requestSubmit: "Recevoir mon code de connexion",
        requestSending: "Envoi en cours…",
        codeSent: "Nous avons envoyé un code à 6 chiffres à {email}. Saisissez-le ci-dessous.",
        codeLabel: "Code reçu par e-mail",
        codeSubmit: "Se connecter",
        codeVerifying: "Vérification…",
        resend: "Recevoir un nouveau code",
        resendWait: "Nouveau code possible dans {seconds} s",
        resent: "Un nouveau code vient de vous être envoyé.",
        changeEmail: "Modifier l'adresse e-mail",
        requestErrors: {
          invalid_email: "Merci de saisir une adresse email valide.",
          rate_limited: "Trop de demandes en peu de temps. Patientez une minute, puis réessayez.",
          send_failed: "Le code n'a pas pu être envoyé. Vérifiez l'adresse et réessayez.",
        },
        verifyErrors: {
          invalid_email: "Merci de saisir une adresse email valide.",
          invalid_format: "Le code comporte 6 chiffres.",
          invalid_or_expired: "Ce code est incorrect, expiré ou déjà utilisé. Vérifiez-le ou demandez un nouveau code.",
          rate_limited: "Trop de tentatives en peu de temps. Patientez une minute, puis réessayez.",
          failed: "La connexion n'a pas pu aboutir. Réessayez dans un instant.",
        },
      }}
    />
  );
}
