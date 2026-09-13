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
  "preview.view": "Ver vista previa",
  "preview.hide": "Ocultar vista previa",
  "preview.backToCreation": "Volver a la creación",
  "hero.identityTitle": "¿A quién desea honrar?",
  "hero.identitySubtitle":
    "Escriba el nombre exactamente como debe aparecer. Las fechas de nacimiento y fallecimiento son opcionales.",
  "hero.displayNameLabel": "Nombre a mostrar",
  "hero.displayNameRequired": "Por favor, escriba un nombre para continuar.",
  "hero.birthLabel": "Nacimiento",
  "hero.deathLabel": "Fallecimiento",
  "hero.dateModeYear": "Solo el año",
  "hero.dateModeFull": "Fecha completa",
  "hero.dateInvalid": "Esta fecha no parece válida. Por favor, revísela.",
  "hero.chronologyImpossible": "Estas fechas no parecen compatibles entre sí. Por favor, revíselas.",
  "hero.dataUnavailable":
    "No pudimos cargar esta información en este momento. Por favor, inténtelo de nuevo en unos instantes.",
  "hero.phraseTitleAnnouncement": "Unas palabras, si lo desea",
  "hero.phraseSubtitleAnnouncement":
    "Una breve frase que la familia desea compartir junto al anuncio. Opcional: puede continuar sin escribir nada.",
  "hero.phraseTitleRemembrance": "Unas palabras, si lo desea",
  "hero.phraseSubtitleRemembrance":
    "Una breve frase que refleje cómo la recuerdan. Opcional: puede continuar sin escribir nada.",
  "hero.photoTitle": "Elija la foto principal",
  "hero.photoSubtitle": "Es la primera imagen que la familia verá al descubrir este homenaje.",
  "hero.photoAddLabel": "Añadir una foto",
  "hero.photoChangeLabel": "Cambiar la foto",
  "hero.photoCroppingNote":
    "No se preocupe por el encuadre por ahora: podrá ajustarlo justo después.",
  "hero.photoUploading": "Añadiendo la foto…",
  "hero.photoAlt": "Foto elegida para el homenaje",
  "hero.photoErrorTooLarge": "Esta foto es demasiado grande. Pruebe con otra.",
  "hero.photoErrorUnsupportedFormat":
    "Este formato de foto aún no es compatible. Elija una foto JPEG, PNG o WebP.",
  "hero.photoErrorInvalidFile": "No pudimos usar esta foto. Pruebe con otra.",
  "hero.photoErrorGeneric": "No pudimos añadir la foto en este momento. Puede volver a intentarlo.",
  "hero.cropTitle": "Ajuste su foto",
  "hero.cropSubtitle": "Mueva y haga zoom para encuadrarla como desee.",
  "hero.cropZoomLabel": "Zoom",
  "hero.cropMoveUp": "Mover la foto hacia arriba",
  "hero.cropMoveDown": "Mover la foto hacia abajo",
  "hero.cropMoveLeft": "Mover la foto hacia la izquierda",
  "hero.cropMoveRight": "Mover la foto hacia la derecha",
  "hero.cropReset": "Restablecer",
  "hero.cropChangePhoto": "Cambiar la foto",
  "hero.revealTitle": "Su Hero",
  "hero.revealToggleToDark": "Ver en versión oscura",
  "hero.revealToggleToLight": "Ver en versión clara",
  "hero.revealConfirm": "Continuar con esta ambientación",
  "deathNotice.announcementTitle": "Unas palabras para anunciar su partida",
  "deathNotice.announcementSubtitle":
    "Solo lo esencial, con sus propias palabras — no hace falta añadir nada más aquí.",
  "deathNotice.announcementPlaceholder":
    "Con gran tristeza les comunicamos el fallecimiento de…",
  "deathNotice.announcementRequired": "Por favor, escriba unas palabras para continuar.",
  "deathNotice.precisionsTitle": "¿Desea añadir algunas precisiones?",
  "deathNotice.precisionsSubtitle": "Totalmente opcional — añada solo lo que le parezca oportuno.",
  "deathNotice.precisionsAddLocation": "Añadir un lugar",
  "deathNotice.precisionsAddFamilyMessage": "Añadir unas palabras de la familia",
  "deathNotice.precisionsAddThought": "Añadir un pensamiento",
  "deathNotice.precisionsAddQuote": "Añadir una cita",
  "deathNotice.precisionsAddOther": "Añadir otra precisión",
  "deathNotice.precisionsFieldLocation": "Lugar",
  "deathNotice.precisionsFieldFamilyMessage": "Unas palabras de la familia",
  "deathNotice.precisionsFieldThought": "Un pensamiento",
  "deathNotice.precisionsFieldQuote": "Una cita",
  "deathNotice.precisionsFieldOther": "Otra precisión",
  "deathNotice.precisionsSkip": "Omitir este paso",
};
