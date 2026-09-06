import styles from "./ProgressBar.module.css";

interface ProgressBarProps {
  /**
   * Fraction complete, from 0 to 1. Deliberately NOT "current step of N
   * total steps" — the mission brief (section 10) is explicit that the
   * Guided Flow's total length is not fixed yet (it will vary by
   * editorial context, and by which optional steps a family takes), so
   * this primitive never learns a step count at all. Each screen that
   * uses it decides its own fraction; Mission 025's Guided Flow is free
   * to compute that however it ends up needing to, without this
   * component changing.
   */
  value: number;
}

/**
 * Mission 023 — the discreet "you're moving forward" indicator from the
 * Studio's T01 mockups. Deliberately carries no visible number, step
 * count, or percentage (QG UX decision, section 10) — it signals
 * progress, not a count to complete.
 *
 * `aria-hidden`: this is ambient, decorative reassurance, not
 * information a screen-reader user needs to complete the task (nothing
 * on T01 depends on knowing the exact fraction), and exposing a numeric
 * `aria-valuenow` would announce precisely the number/percentage the
 * design deliberately omits visually. The actual task-relevant state
 * (which language is selected, whether Continue is enabled) is
 * announced through the real controls themselves, not through this bar.
 */
export function ProgressBar({ value }: ProgressBarProps) {
  const clamped = Math.min(1, Math.max(0, value));

  return (
    <div className={styles.track} aria-hidden="true">
      <div className={styles.fill} style={{ width: `${clamped * 100}%` }} />
    </div>
  );
}
