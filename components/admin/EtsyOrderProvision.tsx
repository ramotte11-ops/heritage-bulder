"use client";

import { useActionState } from "react";
import { provisionEtsyOrderAction } from "@/app/admin/actions";
import {
  INITIAL_ADMIN_MUTATION_STATE,
  type AdminMutationFormState,
} from "@/lib/admin/admin-mutation-state";
import styles from "./EtsyOrderProvision.module.css";

/**
 * Mission 019B — the guest-checkout recovery, for HERITAGE staff.
 *
 * An Etsy guest order carries no buyer account, so the family can never
 * confirm it themselves: there is nothing for the OAuth path to match
 * against. This is the only way such a purchase becomes a HERITAGE
 * right, and it is deliberately a support tool rather than a customer
 * one.
 *
 * What the order reference typed here is NOT: an instruction to create a
 * right. The server verifies it against Etsy first — on our own shop —
 * and refuses everything Etsy refuses. Staff cannot override a
 * cancellation, a refund, an unknown item, or a quantity greater than
 * one, and cannot provision an order that belongs to another shop.
 *
 * Same grammar as components/admin/EntitlementActions.tsx: one
 * `useActionState` form, a status line, and the raw key shown exactly
 * once in this render's own client state — never stored, never fetched
 * back.
 *
 * Deliberately NO `router.refresh()` on success, unlike
 * EntitlementActions: refreshing re-runs the Server Component and this
 * is the one screen where doing so would be actively harmful — the raw
 * activation key lives only in the state below, and staff need it on
 * screen until they have copied it.
 */
export function EtsyOrderProvision() {
  const [state, formAction, isPending] = useActionState<AdminMutationFormState, FormData>(
    provisionEtsyOrderAction,
    INITIAL_ADMIN_MUTATION_STATE,
  );

  return (
    <section className={styles.panel}>
      <h2 className={styles.heading}>Achat Etsy sans compte</h2>
      <p className={styles.help}>
        Réservé aux commandes passées sans compte Etsy, que la famille ne peut pas confirmer
        elle-même. La commande est vérifiée auprès d&rsquo;Etsy avant toute création de droit.
      </p>

      <form action={formAction} className={styles.form}>
        <label className={styles.field}>
          <span>Numéro de commande Etsy</span>
          <input name="receiptId" type="text" inputMode="numeric" autoComplete="off" required />
        </label>

        <button type="submit" disabled={isPending} className={styles.button}>
          {isPending ? "Vérification auprès d’Etsy…" : "Vérifier et créer le droit"}
        </button>
      </form>

      {state.status === "success" && (
        <p role="status" className={styles.success}>
          {state.message}
        </p>
      )}

      {(state.status === "refused" || state.status === "error") && (
        <p role="alert" className={styles.error}>
          {state.message}
        </p>
      )}

      {state.rawActivationKey && (
        <p className={styles.rawKey}>
          <span className={styles.mono}>{state.rawActivationKey}</span>
        </p>
      )}
    </section>
  );
}
