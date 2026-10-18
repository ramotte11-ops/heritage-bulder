import type { ReactNode } from "react";
import { PendingActionLabel } from "./PendingActionLabel";
import styles from "./PrimaryButton.module.css";

interface PrimaryButtonProps {
  type?: "button" | "submit";
  disabled?: boolean;
  pending?: boolean;
  pendingLabel?: ReactNode;
  children: ReactNode;
}

/**
 * Mission 023 — the primary CTA primitive (Studio spec: active/disabled
 * states, an arrow glyph, 56px height). A REAL `<button disabled>`, not
 * a visually-dimmed button that still responds to a click — section 12
 * of the mission brief is explicit that a disabled CTA must be really
 * disabled, and a real `disabled` attribute is also what keeps it out
 * of the tab order automatically, with no extra `tabIndex` bookkeeping.
 *
 * Still a presentational wrapper: no `onClick` and no form knowledge.
 * The owner supplies the real pending state; the button then exposes it
 * immediately with a compact spinner, a human label and `aria-busy`,
 * while remaining a native disabled button against duplicate submits.
 */
export function PrimaryButton({
  type = "button",
  disabled,
  pending = false,
  children,
  pendingLabel = children,
}: PrimaryButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      data-pending={pending || undefined}
      className={styles.button}
    >
      <PendingActionLabel pending={pending} pendingLabel={pendingLabel}>
        <span>{children}</span>
      </PendingActionLabel>
      {!pending && (
        <svg viewBox="0 0 20 20" width="18" height="18" fill="none" aria-hidden="true">
          <path
            d="M4 10h12M11 5l5 5-5 5"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );
}
