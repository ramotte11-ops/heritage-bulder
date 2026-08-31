import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/supabase/session";
import { LogoutButton } from "@/components/auth/LogoutButton";
import styles from "./page.module.css";

/**
 * Minimal protected owner shell — Mission 004 scope only.
 *
 * Protected by a raw Supabase Auth session (getAuthenticatedUser), never
 * by an `owners` row: per this mission's explicit rule, being
 * authenticated here proves identity, not any product entitlement. This
 * page creates no business data, links to no memorial, and claims no
 * purchase — it exists only to demonstrate that the session mechanism
 * works.
 */
export default async function OwnerPage() {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <main className={styles.main}>
      <p className={styles.eyebrow}>Espace propriétaire — session authentifiée</p>
      <h1 className={styles.title}>Vous êtes connecté</h1>
      {user.email ? <p className={styles.email}>{user.email}</p> : null}

      <p className={styles.notice}>
        Cette page confirme uniquement que votre session est authentifiée. Elle ne représente
        aucun mémorial réel, et le fait d&rsquo;être connecté ne signifie pas qu&rsquo;un achat
        ou un droit HERITAGE est associé à ce compte — cela sera mis en place dans une mission
        ultérieure.
      </p>

      <LogoutButton />
    </main>
  );
}
