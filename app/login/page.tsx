import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/supabase/session";
import { LoginForm } from "@/components/auth/LoginForm";
import styles from "./page.module.css";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  // Already authenticated — no point showing the form again.
  const user = await getAuthenticatedUser();
  if (user) {
    redirect("/owner");
  }

  const { error } = await searchParams;

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

      <LoginForm />
    </main>
  );
}
