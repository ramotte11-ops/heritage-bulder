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
  "context.title": "Que souhaitez-vous créer aujourd'hui ?",
  "context.subtitle":
    "Choisissez le parcours qui correspond le mieux à ce dont vous avez besoin aujourd'hui.",
  "context.announcementTitle": "Annonce & Hommage",
  "context.announcementDescription":
    "Pour un décès récent — partagez d'abord les informations essentielles, puis enrichissez l'hommage de souvenirs au fil du temps.",
  "context.remembranceTitle": "Mémoire & Hommage",
  "context.remembranceDescription":
    "Créez un espace de mémoire durable, centré sur la vie, l'histoire et les souvenirs de la personne.",
};
