import type { TranslationKey } from "../keys";

/**
 * The canonical English dictionary — Mission 022's fallback of last
 * resort (see `lib/i18n/translate.ts`).
 *
 * Typed `Record<TranslationKey, string>`, not `Partial` like `fr`/`es`:
 * this is deliberate. TypeScript itself rejects this file the day a key
 * is added to `TRANSLATION_KEYS` without an English string to match —
 * "the canonical dictionary is complete" is a compile-time guarantee,
 * not a convention to remember.
 */
export const en: Record<TranslationKey, string> = {
  "common.continue": "Continue",
  "common.back": "Back",
  "common.cancel": "Cancel",
  "common.save": "Save",
  "nav.home": "Home",
  "errors.generic": "Something went wrong.",
  "errors.notFound": "Page not found.",
  "onboarding.chooseLanguage": "Choose your language",
  "builder.notConfiguredYet": "Your memorial still needs to be configured before it can be edited here.",
};
