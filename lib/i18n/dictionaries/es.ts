import type { TranslationKey } from "../keys";

/**
 * Spanish dictionary.
 *
 * Typed `Partial<Record<TranslationKey, string>>` for the same reason as
 * `fr`: ES is allowed to lag behind the canonical key set key-by-key; a
 * missing entry falls back to `en` (see `lib/i18n/translate.ts`).
 */
export const es: Partial<Record<TranslationKey, string>> = {
  "common.continue": "Continuar",
  "common.back": "Atrás",
  "common.cancel": "Cancelar",
  "common.save": "Guardar",
  "nav.home": "Inicio",
  "errors.generic": "Algo salió mal.",
  "errors.notFound": "Página no encontrada.",
  "onboarding.chooseLanguage": "Elige tu idioma",
  "builder.notConfiguredYet": "Tu memorial todavía debe configurarse antes de poder editarlo aquí.",
  "context.title": "¿Qué desea crear hoy?",
  "context.subtitle": "Elija el recorrido que mejor se adapte a lo que necesita en este momento.",
  "context.announcementTitle": "Anuncio y homenaje",
  "context.announcementDescription":
    "Para una pérdida reciente — comparta primero la información esencial y añada recuerdos con el tiempo.",
  "context.remembranceTitle": "Memoria y homenaje",
  "context.remembranceDescription":
    "Cree un espacio duradero de recuerdo, centrado en la vida, la historia y los recuerdos de la persona.",
};
