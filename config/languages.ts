/**
 * Languages available in the Builder and on published memorials.
 */

export const LANGUAGES = ["en", "fr", "es"] as const;

export type Language = (typeof LANGUAGES)[number];

export const DEFAULT_LANGUAGE: Language = "en";

/**
 * Mission 023 — the one runtime guard for "is this a legal `Language`
 * value?", next to the canonical array it checks against rather than
 * re-implemented wherever a caller has an unchecked string (a Server
 * Action's argument, a value read from `memorials.language`'s `text`
 * column type). `lib/i18n/translate.ts`'s `isSupportedLanguage` reuses
 * this rather than declaring a second version of the same check.
 */
export function isLanguage(value: string): value is Language {
  return (LANGUAGES as readonly string[]).includes(value);
}
