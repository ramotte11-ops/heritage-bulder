import type { ReactNode } from "react";
import styles from "./PendingActionLabel.module.css";

interface PendingActionLabelProps {
  pending: boolean;
  pendingLabel: ReactNode;
  children: ReactNode;
}

/**
 * Small, shared feedback for a Builder command that is genuinely in
 * flight. The visible label changes on the activated control itself and
 * the polite status announces the same change to assistive technology.
 * The spinner is decorative and becomes static in reduced-motion mode.
 */
export function PendingActionLabel({ pending, pendingLabel, children }: PendingActionLabelProps) {
  if (!pending) return children;

  return (
    <span className={styles.content} role="status" aria-live="polite">
      <span className={styles.spinner} aria-hidden="true" />
      <span>{pendingLabel}</span>
    </span>
  );
}
