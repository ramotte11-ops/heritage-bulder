"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  invalidateActivationKeyAction,
  replaceActivationKeyAction,
  revokeEntitlementAction,
} from "@/app/admin/actions";
import {
  INITIAL_ADMIN_MUTATION_STATE,
  type AdminMutationFormState,
} from "@/lib/admin/admin-mutation-state";
import type { EntitlementStatus } from "@/config/entitlements";
import styles from "./EntitlementActions.module.css";

/**
 * Mission 015B — the Admin mutation buttons for one Entitlement.
 *
 * Shows only the actions the entitlement's OWN status actually permits:
 * an `available` right gets all three (replace key, invalidate key,
 * revoke); anything else (`redeemed`, `revoked`) gets none. That is
 * decided here, client-side, purely for what to render — the real
 * refusal still happens server-side in the RPC itself
 * (admin_mutate_activation_key / admin_revoke_entitlement), which is
 * what actually protects a redeemed or revoked right. This component
 * never sees, and never needs, an admin identity: every action it calls
 * resolves its own caller from the session (lib/admin/admin-session.ts).
 */

function useRefreshOnSuccess(state: AdminMutationFormState) {
  const router = useRouter();
  const lastHandled = useRef<AdminMutationFormState | null>(null);

  useEffect(() => {
    if (state.status === "success" && lastHandled.current !== state) {
      lastHandled.current = state;
      // The entitlement's status/key just changed under this exact page,
      // and this page's own search results were rendered from the state
      // BEFORE that write. Refreshing re-runs the Server Component with
      // the same query string, so the card below reflects reality rather
      // than a stale read — the success message and raw key above stay,
      // because they live in this component's own client state, not in
      // anything refresh() touches.
      router.refresh();
    }
  }, [state, router]);
}

function StatusMessage({ state }: { state: AdminMutationFormState }) {
  if (state.status === "idle") return null;
  return (
    <p
      role={state.status === "error" || state.status === "refused" ? "alert" : "status"}
      className={state.status === "success" ? styles.success : styles.error}
    >
      {state.message}
    </p>
  );
}

function MutationForm({
  action,
  entitlementId,
  label,
  pendingLabel,
  confirmMessage,
  state,
  formAction,
  isPending,
}: {
  action: string;
  entitlementId: string;
  label: string;
  pendingLabel: string;
  confirmMessage: string;
  state: AdminMutationFormState;
  formAction: (formData: FormData) => void;
  isPending: boolean;
}) {
  return (
    <form
      action={formAction}
      className={styles.form}
      onSubmit={(event) => {
        // Confirmation before a sensitive action, as required. Native
        // and synchronous on purpose: it blocks the actual submission
        // rather than racing it, and needs no extra dependency.
        if (!window.confirm(confirmMessage)) {
          event.preventDefault();
        }
      }}
      aria-label={action}
    >
      <input type="hidden" name="entitlementId" value={entitlementId} />
      <button type="submit" disabled={isPending} className={styles.button}>
        {isPending ? pendingLabel : label}
      </button>
      <StatusMessage state={state} />
    </form>
  );
}

export function EntitlementActions({
  entitlementId,
  status,
}: {
  entitlementId: string;
  status: EntitlementStatus;
}) {
  const [replaceState, replaceFormAction, replacePending] = useActionState(
    replaceActivationKeyAction,
    INITIAL_ADMIN_MUTATION_STATE,
  );
  const [invalidateState, invalidateFormAction, invalidatePending] = useActionState(
    invalidateActivationKeyAction,
    INITIAL_ADMIN_MUTATION_STATE,
  );
  const [revokeState, revokeFormAction, revokePending] = useActionState(
    revokeEntitlementAction,
    INITIAL_ADMIN_MUTATION_STATE,
  );

  useRefreshOnSuccess(replaceState);
  useRefreshOnSuccess(invalidateState);
  useRefreshOnSuccess(revokeState);

  // Only an `available` right has anything an Admin may do to it here —
  // see this component's own docstring. `available` is the only status
  // that changes as a result of anything below (a successful revoke),
  // so once it does, replace/invalidate would refuse anyway and stop
  // being offered too — but the message from whichever action was just
  // taken must survive that refresh, or the one confirmation support
  // needed to see would flicker away the instant the page updates.
  const interacted =
    replaceState.status !== "idle" || invalidateState.status !== "idle" || revokeState.status !== "idle";
  if (status !== "available" && !interacted) return null;

  return (
    <div className={styles.actions}>
      {status === "available" ? (
        <MutationForm
          action="Remplacer la clé d'activation"
          entitlementId={entitlementId}
          label="Remplacer la clé"
          pendingLabel="Remplacement…"
          confirmMessage="Remplacer la clé de ce droit ? L'ancienne clé cessera de fonctionner immédiatement."
          state={replaceState}
          formAction={replaceFormAction}
          isPending={replacePending}
        />
      ) : (
        <StatusMessage state={replaceState} />
      )}

      {replaceState.status === "success" && replaceState.rawActivationKey ? (
        <p className={styles.rawKey} role="status">
          Nouvelle clé (à noter maintenant, elle ne sera plus jamais affichée) :{" "}
          <span className={styles.mono}>{replaceState.rawActivationKey}</span>
        </p>
      ) : null}

      {status === "available" ? (
        <MutationForm
          action="Invalider la clé d'activation"
          entitlementId={entitlementId}
          label="Invalider la clé"
          pendingLabel="Invalidation…"
          confirmMessage="Invalider la clé de ce droit ? Plus aucune clé ne permettra de l'activer tant qu'une nouvelle n'aura pas été émise."
          state={invalidateState}
          formAction={invalidateFormAction}
          isPending={invalidatePending}
        />
      ) : (
        <StatusMessage state={invalidateState} />
      )}

      {status === "available" ? (
        <MutationForm
          action="Révoquer le droit"
          entitlementId={entitlementId}
          label="Révoquer le droit"
          pendingLabel="Révocation…"
          confirmMessage="Révoquer ce droit ? Cette action est définitive : le droit ne pourra plus jamais être activé."
          state={revokeState}
          formAction={revokeFormAction}
          isPending={revokePending}
        />
      ) : (
        <StatusMessage state={revokeState} />
      )}
    </div>
  );
}
