import type { Language } from "@/config/languages";
import type { HeroDate } from "@/types/hero";

/**
 * Mission 035 — the Hero renderer's own text formatting for a
 * `HeroDate`, the "later mission" `types/hero.ts`'s own docstring names
 * ("Rendering a localized string ... is entirely the renderer's job").
 *
 * Pure and framework-free. Never stores anything, never mutates the
 * `HeroDate` it is given — this is display-only, run fresh every
 * render, exactly why `HeroDate` itself never carries a localized
 * string (Mission 031's own doctrine).
 *
 * `"year"` precision renders as the bare year, in every language —
 * there is no "translated" way to say a single year. `"date"` precision
 * renders as a full, locale-appropriate date via `Intl.DateTimeFormat`,
 * parsed at UTC noon-free (`Date.UTC` with no time component) so no
 * viewer's own timezone can ever shift the calendar day the family
 * actually recorded.
 */
const INTL_LOCALE_BY_LANGUAGE: Record<Language, string> = {
  fr: "fr-FR",
  en: "en-US",
  es: "es-ES",
};

export function formatHeroDate(date: HeroDate, language: Language): string {
  if (date.precision === "year") {
    return String(date.year);
  }

  const [year, month, day] = date.date.split("-").map(Number);
  const utcDate = new Date(Date.UTC(year, month - 1, day));

  return new Intl.DateTimeFormat(INTL_LOCALE_BY_LANGUAGE[language], {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(utcDate);
}

/**
 * Section 11's exact rule: two dates joined by a separator, one date
 * alone, or `null` (the whole component removed, no placeholder space)
 * when there are none — never a hyphen/dash rendered next to a missing
 * value. The en dash (`–`) matches the Studio reference
 * (`HERO_INTEMPOREL_*_VALIDATED.png`: "1948 – 2023").
 */
export function formatHeroDateRange(
  birth: HeroDate | null,
  death: HeroDate | null,
  language: Language,
): string | null {
  const birthText = birth ? formatHeroDate(birth, language) : null;
  const deathText = death ? formatHeroDate(death, language) : null;

  if (birthText && deathText) return `${birthText} – ${deathText}`;
  return birthText ?? deathText;
}
