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
};
