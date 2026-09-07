import { getAuthenticatedUser } from "@/lib/supabase/session";
import { LoginForm } from "@/components/auth/LoginForm";
import { ActivateForm } from "@/components/activate/ActivateForm";
import { EtsyClaimButton } from "@/components/activate/EtsyClaimButton";
import { isEtsyChannelConfigured } from "@/lib/integration/etsy/config";
import styles from "./page.module.css";

/**
 * Mission 019C — the generic HERITAGE activation surface.
 * Mission 019B — plus the nominal purchase confirmation.
 *
 * Architecture this page sits in the middle of:
 *
 *   commercial channel -> Entitlement -> /activate -> HERITAGE Auth
 *                       -> redemption -> Owner + Memorial -> Builder
 *
 * ## What Mission 019B changed, and what it deliberately did not
 *
 * The page keeps Mission 019C's structure, spacing and vocabulary. No
 * redesign: the same eyebrow, the same title, the same bordered notice,
 * the same button and input styling. What changed is the ORDER of the
 * two ways in.
 *
 * The nominal action is now confirming the purchase — one button, no
 * typing. The activation key has become what it was always meant to be:
 * a recovery path, folded into a `<details>` the family opens only if
 * they need it. It is never presented as an equal alternative, and it is
 * never first.
 *
 * A `<details>` element rather than a client-side toggle because it needs
 * no JavaScript at all to work, and because "discreet, still reachable"
 * is exactly what the element means. The server decides its initial
 * `open` state from `?claim=`, so a family sent back here after a
 * fruitless Etsy round-trip finds the key field already unfolded rather
 * than having to look for it.
 *
 * ## Etsy stops here
 *
 * This page is the last place in the entire client parcours where the
 * word Etsy appears. Past the redirect into `/builder/{memorialId}`
 * there is no Etsy button, logo, wording, state or logic anywhere — the
 * Builder is handed an authorised memorial and knows nothing about where
 * it came from.
 *
 * `dynamic = "force-dynamic"` because the answer depends on who is
 * asking — a cached render of this page would be a cached render of
 * somebody's session state.
 */
export const dynamic = "force-dynamic";

/**
 * The closed set of words `/api/etsy/callback` may send back. Nothing
 * here identifies an account, an order or a right — each one only picks
 * which sentence to show. An unrecognised value is ignored entirely.
 */
const CLAIM_NOTICES = {
  recovery:
    "Nous n'avons pas trouvé d'achat rattaché à ce compte Etsy. Si votre achat a été effectué sans compte Etsy, votre clé d'activation ci-dessous prend le relais.",
  support:
    "Nous n'avons pas pu confirmer cet achat automatiquement. Notre équipe peut le faire pour vous — contactez-nous et nous nous en occupons.",
  retry:
    "La confirmation n'a pas abouti pour le moment. Merci de réessayer dans quelques instants.",
  failed: "Nous n'avons pas pu confirmer cet accès. Merci de réessayer.",
} as const;

type ClaimNotice = keyof typeof CLAIM_NOTICES;

function parseClaimNotice(value: string | undefined): ClaimNotice | null {
  return value !== undefined && Object.hasOwn(CLAIM_NOTICES, value)
    ? (value as ClaimNotice)
    : null;
}

export default async function ActivatePage({
  searchParams,
}: {
  searchParams: Promise<{ claim?: string }>;
}) {
  const user = await getAuthenticatedUser();

  if (!user) {
    // Unchanged from Mission 019C. The session has to exist before a
    // claim, whichever way the family proves their purchase, because it
    // is the identity the right will be attributed to.
    return (
      <main className={styles.main}>
        <p className={styles.eyebrow}>HERITAGE</p>
        <h1 className={styles.title}>Activer votre accès</h1>
        <p className={styles.notice}>
          Connectez-vous d&rsquo;abord grâce au lien magique envoyé par email, puis revenez ici
          pour confirmer votre achat.
        </p>
        <LoginForm next="/activate" />
      </main>
    );
  }

  const { claim } = await searchParams;
  const notice = parseClaimNotice(claim);
  const etsyAvailable = isEtsyChannelConfigured();

  // The key path opens by itself when the Etsy round-trip found nothing,
  // and whenever Etsy is not an option on this deployment at all.
  const recoveryOpen = notice === "recovery" || !etsyAvailable;

  return (
    <main className={styles.main}>
      <p className={styles.eyebrow}>HERITAGE</p>
      <h1 className={styles.title}>Activer votre accès</h1>

      {notice && (
        <p role="status" className={styles.claimNotice}>
          {CLAIM_NOTICES[notice]}
        </p>
      )}

      {etsyAvailable ? (
        <>
          <p className={styles.notice}>
            Confirmez votre achat pour ouvrir votre espace HERITAGE. Rien à saisir : nous
            vérifions directement auprès de la boutique.
          </p>
          <EtsyClaimButton />

          <details className={styles.recovery} open={recoveryOpen}>
            <summary className={styles.recoverySummary}>
              Vous avez une clé d&rsquo;activation ?
            </summary>
            <ActivateForm />
          </details>
        </>
      ) : (
        <>
          <p className={styles.notice}>
            Saisissez la clé d&rsquo;activation HERITAGE reçue avec votre achat pour confirmer
            votre accès.
          </p>
          <ActivateForm />
        </>
      )}
    </main>
  );
}
