import type { ReactNode } from "react";
import styles from "./ChoiceCard.module.css";

interface ChoiceCardProps {
  id: string;
  /** Groups this card with its siblings into one native radio group —
   * the browser's own single-selection, arrow-key-navigable behavior,
   * for free. */
  name: string;
  value: string;
  checked: boolean;
  onChange: (value: string) => void;
  disabled?: boolean;
  /**
   * Mission 024. `"compact"` (the default) is T01's exact, unchanged
   * geometry — a single-line label, vertically centered, minimal
   * padding. `"roomy"` is for a card whose content is a title PLUS a
   * description (T02's editorial-context choice): more padding, and the
   * indicator aligns to the top of the content instead of dead-center
   * against a two-line block. Never changes color, radius, or the
   * selection mechanics — only geometry.
   */
  size?: "compact" | "roomy";
  children: ReactNode;
}

/**
 * Mission 023 — a single-select "choice card": one option among a small
 * set, exactly one active at a time, its selected state visible through
 * more than color alone (a filled check replaces the idle chevron, plus
 * the border/background change the Studio's mockups specify).
 *
 * Built on a real `<input type="radio">`, not a styled `<button>` with
 * hand-rolled `role="radio"`/roving-tabindex machinery: the browser
 * already gives a native radio group correct keyboard behavior (arrow
 * keys move selection, Tab enters/exits the group once), correct
 * screen-reader announcement ("selected"/"not selected", position in
 * group), and correct semantics for free — reproducing that by hand is
 * exactly the kind of accessibility risk section 12 of the mission
 * brief warns against taking for a visual detail.
 *
 * The input itself is visually hidden (not `display:none`, which would
 * also remove it from focus/tab order and from touch hit-testing) but
 * still receives real keyboard focus; `.card:has(:focus-visible)` in
 * the CSS module is what actually shows a focus ring on the visible
 * card, keyed off that real, browser-driven focus state — never a
 * separate, hand-maintained "isFocused" flag.
 *
 * Generic enough to reuse for a future single-select Builder step
 * (culture, skin) without change — it renders exactly one option, knows
 * nothing about `Language` or any other specific domain type.
 */
export function ChoiceCard({
  id,
  name,
  value,
  checked,
  onChange,
  disabled,
  size = "compact",
  children,
}: ChoiceCardProps) {
  const base = checked ? styles.cardSelected : styles.card;
  const className = size === "roomy" ? `${base} ${styles.roomy}` : base;

  return (
    <label htmlFor={id} className={className}>
      <input
        type="radio"
        id={id}
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => onChange(value)}
        className={styles.input}
      />
      <span className={styles.label}>{children}</span>
      <span className={styles.indicator} aria-hidden="true">
        {checked ? (
          <svg viewBox="0 0 20 20" width="18" height="18" fill="none">
            <path
              d="M4 10.5 8 14.5 16 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <svg viewBox="0 0 20 20" width="18" height="18" fill="none">
            <path
              d="M7.5 4.5 13 10l-5.5 5.5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
    </label>
  );
}
