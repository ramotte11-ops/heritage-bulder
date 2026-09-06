import type { TranslationKey } from "../keys";

/**
 * French dictionary.
 *
 * Typed `Partial<Record<TranslationKey, string>>` — unlike `en`, FR is
 * allowed to lag behind the canonical key set key-by-key; a missing
 * entry falls back to `en` (see `lib/i18n/translate.ts`). V1 happens to
 * translate every key that exists today; nothing here obligates a
 * French string to exist before a future key ships.
 */
export const fr: Partial<Record<TranslationKey, string>> = {
  "common.continue": "Continuer",
  "common.back": "Retour",
  "common.cancel": "Annuler",
  "common.save": "Enregistrer",
  "nav.home": "Accueil",
  "errors.generic": "Une erreur est survenue.",
  "errors.notFound": "Page introuvable.",
  "onboarding.chooseLanguage": "Choisissez votre langue",
  "builder.notConfiguredYet": "Votre mémorial doit encore être configuré avant de pouvoir être édité ici.",
};
