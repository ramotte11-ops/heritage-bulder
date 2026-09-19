import type { Language } from "@/config/languages";

/**
 * Mission 040B — the Ceremony Intemporel renderer's own text formatting
 * for `ceremony.date` (`"YYYY-MM-DD"`) and `ceremony.time` (`"HH:MM"`).
 * Pure and framework-free, exactly like `lib/memorial/format-hero-date.ts`,
 * which this module mirrors for the date half (same `Intl.DateTimeFormat`
 * + `Date.UTC` discipline, so no viewer's own timezone can ever shift the
 * calendar day the family actually recorded).
 *
 * ## Why a weekday is added here but not in `formatHeroDate`
 *
 * The Studio's own QA reference (`qa/desktop-light-full.png`) renders
 * "Samedi 21 octobre 2023" — a full weekday name is part of the locked
 * visual reference, unlike a Hero birth/death date, which never carries
 * one. `Intl.DateTimeFormat` does not capitalize a French/Spanish weekday
 * on its own ("samedi", "sábado"); `capitalizeFirst` below is the one
 * place that matches the Studio's own capitalized rendering.
 *
 * ## Why the time format is hand-rolled, not `Intl.DateTimeFormat`
 *
 * The Studio's own French reference reads "à 14 h 00" — a locale-specific
 * PHRASE ("à" + hour + "h" + minute), not merely a localized clock face
 * `Intl.DateTimeFormat` alone would produce (which has no built-in way to
 * splice in "à"/"at"/"a las"). The mission brief specifies the field
 * (`ceremony.time`, `"HH:MM"`) and the French reference wording; it does
 * not dictate an exact EN/ES phrasing — the two below are this module's
 * own reasonable, self-contained choice within that latitude (24h "at
 * HH:MM" for English, which stays unambiguous; "a las HH:MM" for
 * Spanish), each still built from the same real hour/minute values, never
 * a fabricated placeholder.
 */
const INTL_LOCALE_BY_LANGUAGE: Record<Language, string> = {
  fr: "fr-FR",
  en: "en-US",
  es: "es-ES",
};

function capitalizeFirst(text: string): string {
  return text.length === 0 ? text : text[0].toUpperCase() + text.slice(1);
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** Formats `ceremony.date` (`"YYYY-MM-DD"`) as a full, locale-appropriate,
 * capitalized weekday + date string — e.g. `"Samedi 21 octobre 2023"`
 * (fr). Parsed at UTC noon-free, mirroring `formatHeroDate`. */
export function formatCeremonyDate(date: string, language: Language): string {
  const [year, month, day] = date.split("-").map(Number);
  const utcDate = new Date(Date.UTC(year, month - 1, day));

  const formatted = new Intl.DateTimeFormat(INTL_LOCALE_BY_LANGUAGE[language], {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(utcDate);

  return capitalizeFirst(formatted);
}

/** Formats `ceremony.time` (`"HH:MM"`, 24h) as a locale-appropriate
 * phrase — e.g. `"à 14 h 00"` (fr, the Studio's own QA reference),
 * `"at 2:00 PM"` (en), `"a las 14:00"` (es). */
export function formatCeremonyTime(time: string, language: Language): string {
  const [hours, minutes] = time.split(":").map(Number);

  if (language === "fr") {
    return `à ${pad2(hours)} h ${pad2(minutes)}`;
  }

  if (language === "es") {
    return `a las ${pad2(hours)}:${pad2(minutes)}`;
  }

  const period = hours >= 12 ? "PM" : "AM";
  const hours12 = hours % 12 === 0 ? 12 : hours % 12;
  return `at ${hours12}:${pad2(minutes)} ${period}`;
}
