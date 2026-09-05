import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/supabase/session";
import { sanitizeReturnPath } from "@/lib/auth/return-path";
import { LoginForm } from "@/components/auth/LoginForm";
import styles from "./page.module.css";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next: rawNext } = await searchParams;
  // Mission 019C: a caller (e.g. /activate) may ask to be returned here
  // after signing in. Sanitized before it drives anything — see
  // lib/auth/return-path.ts.
  const next = sanitizeReturnPath(rawNext);

  // Already authenticated — no point showing the form again.
  const user = await getAuthenticatedUser();
  if (user) {
    redirect(next);
  }

  return (
    <main className={styles.main}>
      <h1 className={styles.title}>Connexion</h1>
      <p className={styles.subtitle}>
        Saisissez votre adresse email pour recevoir un lien de connexion. Aucun mot de passe
        n&rsquo;est nécessaire.
      </p>

      {error === "auth" && (
        <p className={styles.callbackError} role="alert">
          Le lien de connexion n&rsquo;est plus valide ou a expiré. Merci de redemander un lien.
        </p>
      )}

      <LoginForm next={next} />
    </main>
  );
}
