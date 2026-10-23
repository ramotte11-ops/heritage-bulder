"use client";

import { useFormStatus } from "react-dom";
import { PendingActionLabel } from "@/components/builder/PendingActionLabel";

/** The logout button: disabled and labelled as in progress while the sign-out action runs. */
export function LogoutSubmit({ className }: { className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} aria-busy={pending || undefined}>
      <PendingActionLabel pending={pending} pendingLabel="Déconnexion…">
        Se déconnecter
      </PendingActionLabel>
    </button>
  );
}
