import { getAuthenticatedUser } from "@/lib/supabase/session";
import { LoginForm } from "@/components/auth/LoginForm";
import { ActivateForm } from "@/components/activate/ActivateForm";
import styles from "./page.module.css";

/**
 * Mission 019C — the generic HERITAGE activation surface.
 *
 * Architecture this page sits in the middle of:
 *
 *   commercial channel -> Entitlement -> /activate -> HERITAGE Auth
 *                       -> redemption -> Owner + Memorial
 *
 * and, in a later mission: Memorial -> the real Builder.
 *
 * Deliberately generic: no marketplace name, no listing id, no order
 * number, no hosting/infra vocabulary, no channel-specific logic
 * anywhere on this page or in anything it calls. The activation-key
 * mechanism it drives (lib/entitlement/redeem-with-activation-key.ts,
 * Mission 013) already knows nothing about where a right came from —
 * this page is the human-facing entry to that same mechanism, and stays
 * just as agnostic.
 *
 * Two states, nothing more:
 *   - no session: reuse the existing Magic Link form (Mission 004),
 *     asked to return here once followed;
 *   - a session: the activation key form.
 *
 * `dynamic = "force-dynamic"` because the answer depends on who is
 * asking — a cached render of this page would be a cached render of
 * somebody's session state.
 */
export const dynamic = "force-dynamic";

export default async function ActivatePage() {
  const user = await getAuthenticatedUser();

  return (
    <main className={styles.main}>
      <p className={styles.eyebrow}>HERITAGE</p>
      <h1 className={styles.title}>Activer votre accès</h1>

      {user ? (
        <>
          <p className={styles.notice}>
            Saisissez la clé d&rsquo;activation HERITAGE reçue avec votre achat pour confirmer
            votre accès.
          </p>
          <ActivateForm />
        </>
      ) : (
        <>
          <p className={styles.notice}>
            Connectez-vous d&rsquo;abord grâce au lien magique envoyé par email, puis revenez ici
            pour saisir votre clé d&rsquo;activation.
          </p>
          <LoginForm next="/activate" />
        </>
      )}
    </main>
  );
}
