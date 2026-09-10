"use client";

import { useState } from "react";
import type { Language } from "@/config/languages";
import type { HeroDate } from "@/types/hero";
import { translate } from "@/lib/i18n/translate";
import styles from "./HeroDateField.module.css";

type Precision = "year" | "date";

function initialPrecision(value: HeroDate | null): Precision {
  return value?.precision === "date" ? "date" : "year";
}

function initialYearText(value: HeroDate | null): string {
  return value?.precision === "year" ? String(value.year) : "";
}

function initialDateText(value: HeroDate | null): string {
  return value?.precision === "date" ? value.date : "";
}

interface HeroDateFieldProps {
  language: Language;
  label: string;
  /** The Hero date this field started from — read once, at mount, so a
   * resumed session shows the exact precision the family last chose
   * (mission brief section 11: "année/date retrouve sa bonne
   * précision"). Not updated from outside afterwards: every subsequent
   * change to this field's value flows out through `onChange`, never
   * back in from a parent re-render, so a keystroke is never
   * overwritten mid-edit. */
  value: HeroDate | null;
  /** Called with a candidate the family just entered. `null` means
   * "cleared" (a legal, absent date). A caller that rejects the
   * candidate (an impossible date, a certainly-impossible chronology)
   * simply leaves the stored Hero unchanged and reports that back via
   * `error` — this field never second-guesses that decision. */
  onChange: (date: HeroDate | null) => void;
  /** Human, local text for the last rejected candidate — never a
   * technical message (mission brief section 19). `null` when the
   * current value is accepted or the field is untouched. */
  error: string | null;
  disabled?: boolean;
  idPrefix: string;
}

/**
 * Mission 032 — T04's one reusable date control (used twice on PAGE A:
 * birth and death). Reuses `HeroDate` exactly as Mission 031 defined it
 * — a bare year is never upgraded into a fabricated `YYYY-01-01`, and a
 * full date is never downgraded to a year (mission brief section 4).
 *
 * The year field commits on blur, not on every keystroke: typing "1",
 * then "19", then "194" would otherwise flash a validation error after
 * every character before the family has finished — exactly the
 * "administrative form" heaviness section 4 of the mission brief warns
 * against. The native date input commits immediately: it only ever
 * reports a complete value or an empty one, never a partial keystroke.
 * Either way, an invalid or not-yet-complete candidate is simply never
 * committed to the stored Hero — the family's own draft keystrokes stay
 * on screen (this field's own local state), but nothing invalid is ever
 * autosaved.
 */
export function HeroDateField({
  language,
  label,
  value,
  onChange,
  error,
  disabled,
  idPrefix,
}: HeroDateFieldProps) {
  const [precision, setPrecision] = useState<Precision>(() => initialPrecision(value));
  const [yearText, setYearText] = useState(() => initialYearText(value));
  const [dateText, setDateText] = useState(() => initialDateText(value));

  function commitYear() {
    const trimmed = yearText.trim();
    if (trimmed === "") {
      onChange(null);
      return;
    }
    onChange({ precision: "year", year: Number(trimmed) });
  }

  function handleDateChange(text: string) {
    setDateText(text);
    onChange(text === "" ? null : { precision: "date", date: text });
  }

  function switchPrecision(next: Precision) {
    if (next === precision) return;
    setPrecision(next);
    // Switching mode always starts the new mode from "absent" — an
    // empty year field and an empty date field both mean the same
    // thing, so there is nothing to carry over, and nothing stale from
    // the other mode is ever left attached.
    onChange(null);
  }

  return (
    <div className={styles.field}>
      <span className={styles.label} id={`${idPrefix}-label`}>
        {label}
      </span>

      <div className={styles.modeToggle} role="radiogroup" aria-labelledby={`${idPrefix}-label`}>
        <label className={precision === "year" ? styles.modeSelected : styles.mode}>
          <input
            type="radio"
            name={`${idPrefix}-precision`}
            checked={precision === "year"}
            disabled={disabled}
            onChange={() => switchPrecision("year")}
          />
          {translate(language, "hero.dateModeYear")}
        </label>
        <label className={precision === "date" ? styles.modeSelected : styles.mode}>
          <input
            type="radio"
            name={`${idPrefix}-precision`}
            checked={precision === "date"}
            disabled={disabled}
            onChange={() => switchPrecision("date")}
          />
          {translate(language, "hero.dateModeFull")}
        </label>
      </div>

      {precision === "year" ? (
        <input
          id={`${idPrefix}-year`}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          className={styles.input}
          value={yearText}
          disabled={disabled}
          aria-labelledby={`${idPrefix}-label`}
          onChange={(event) => setYearText(event.target.value)}
          onBlur={commitYear}
        />
      ) : (
        <input
          id={`${idPrefix}-date`}
          type="date"
          className={styles.input}
          value={dateText}
          disabled={disabled}
          aria-labelledby={`${idPrefix}-label`}
          onChange={(event) => handleDateChange(event.target.value)}
        />
      )}

      {error && (
        <p role="alert" className={styles.fieldError}>
          {error}
        </p>
      )}
    </div>
  );
}
