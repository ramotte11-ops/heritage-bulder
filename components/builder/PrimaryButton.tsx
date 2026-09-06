import type { ReactNode } from "react";
import styles from "./PrimaryButton.module.css";

interface PrimaryButtonProps {
  type?: "button" | "submit";
  disabled?: boolean;
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
 * Deliberately just a presentational wrapper: no `onClick`, no form
 * knowledge, no `pending` state of its own. A submit button inside a
 * `<form action={formAction}>` (see LanguageStep.tsx) already gets
 * "disabled while pending" from whatever computed its `disabled` prop —
 * this component only ever renders what it's told.
 */
export function PrimaryButton({ type = "button", disabled, children }: PrimaryButtonProps) {
  return (
    <button type={type} disabled={disabled} className={styles.button}>
      <span>{children}</span>
      <svg viewBox="0 0 20 20" width="18" height="18" fill="none" aria-hidden="true">
        <path
          d="M4 10h12M11 5l5 5-5 5"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
