"use client";

import { useFormStatus } from "react-dom";
import { PendingActionLabel } from "@/components/builder/PendingActionLabel";

/** The family space's sign-out button: same pending feedback as
 * `LogoutSubmit`, with the labels of the family's own language. */
export function SignOutSubmit({
  className,
  label,
  pendingLabel,
}: {
  className?: string;
  label: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} aria-busy={pending || undefined}>
      <PendingActionLabel pending={pending} pendingLabel={pendingLabel}>
        {label}
      </PendingActionLabel>
    </button>
  );
}
