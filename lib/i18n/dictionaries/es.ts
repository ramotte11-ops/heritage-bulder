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
  "preview.unavailable": "La vista previa no está disponible en este momento. Vuelva a intentarlo en un instante.",
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
  "deathNotice.previewTitle": "Aviso de defunción",
  "deathNotice.blockLocation": "Lugar general",
  "deathNotice.blockFamilyMessage": "Unas palabras de la familia",
  "deathNotice.blockThought": "Pensamiento",
  "deathNotice.blockQuote": "Cita",
  "deathNotice.blockOther": "Otra precisión",
  "deathNotice.editAnnouncement": "Editar el anuncio",
  "deathNotice.editPrecisions": "Editar las precisiones",
  "deathNotice.previewSkinUnavailable":
    "La vista previa del aviso de defunción para este estilo aún no está disponible. Su información se conserva; el equipo de HERITAGE le avisará en cuanto esté lista.",
  "ceremony.momentTitle": "¿Hay un momento previsto?",
  "ceremony.momentSubtitle": "Podrá añadir los detalles después, o volver a esto más tarde.",
  "ceremony.momentYes": "Sí",
  "ceremony.momentUndecided": "Aún no decidido",
  "ceremony.momentNo": "No",
  "ceremony.dateTimeTitle": "¿Cuándo tendrá lugar este momento?",
  "ceremony.dateTimeSubtitle": "La fecha, la hora, o ambas si ya las conoce.",
  "ceremony.dateLabel": "Fecha",
  "ceremony.timeLabel": "Hora",
  "ceremony.venueTitle": "¿Dónde tendrá lugar este momento?",
  "ceremony.venueSubtitle": "Por ahora basta con el nombre del lugar.",
  "ceremony.venueLabel": "Nombre del lugar",
  "ceremony.addressTitle": "Dirección y acceso",
  "ceremony.addressSubtitle": "Lo necesario para que todos puedan llegar con tranquilidad.",
  "ceremony.addressLabel": "Dirección",
  "ceremony.accessLabel": "Acceso / indicaciones prácticas",
  "ceremony.noteTitle": "¿Alguna nota práctica?",
  "ceremony.noteSubtitle": "Totalmente opcional — añada solo lo que le parezca útil.",
  "ceremony.noteLabel": "Nota práctica",
  "ceremony.skip": "Omitir este paso",
  "ceremony.sectionTitle": "Ceremonia",
  "ceremony.zoneDateTime": "Fecha y hora",
  "ceremony.zonePlace": "Lugar de la ceremonia",
  "ceremony.zonePractical": "Información práctica",
  "traditions.title": "Tradiciones y detalles",
  "traditions.subtitle":
    "¿Desea compartir una tradición, una práctica o una indicación particular con sus seres queridos?",
  "traditions.suggestionsHeading": "Algunas sugerencias",
  "traditions.addSuggestionAction": "Añadir esta sugerencia",
  "traditions.addCustomAction": "+ Añadir un detalle personal",
  "traditions.titleFieldLabel": "Título (opcional)",
  "traditions.textFieldLabel": "Su texto",
  "traditions.confirmAdd": "Añadir",
  "traditions.editAction": "Editar",
  "traditions.removeAction": "Eliminar",
  "traditions.saveEdit": "Guardar",
  "traditions.skip": "Omitir este paso",

  "personSheet.title": "Unas palabras sobre la persona",
  "personSheet.a10Question": "¿Cómo le gustaría presentar a la persona que era?",
  "personSheet.a10Helper":
    "Unas pocas frases son suficientes. Puede hablar de su personalidad, de lo que la caracterizaba o simplemente escribir lo que desea que sus seres queridos recuerden de ella.",
  "personSheet.a11Question": "¿Qué le gustaba especialmente?",
  "personSheet.a11Helper":
    "Una pasión, un lugar, una canción, una costumbre, un plato, momentos compartidos o simplemente esas pequeñas cosas del día a día que le hacían feliz…",
  "personSheet.a12Question": "¿Qué deja detrás de sí?",
  "personSheet.a12Helper":
    "Un valor, una expresión, un gesto, algo que les enseñó o transmitió, o simplemente lo que siempre recordarán de ella…",
  "personSheet.skip": "Omitir este paso",
  "recit.title": "EL RELATO DE UNA VIDA",
  "recit.person": "LA PERSONA QUE ERA",
  "recit.loved": "LO QUE AMABA",
  "recit.legacy": "LO QUE DEJA",
  "recit.decorativeMemories": "Recuerdos que permanecen.",
  // "recit.a10Fallback"/"a11Fallback"/"a12Fallback" deliberately absent:
  // ES fallback copy is not yet QG-validated and this Handoff forbids
  // inventing/auto-translating it (see dictionaries/en.ts's own note on
  // these same three keys). Omitting them here is this module's
  // existing, already-documented mechanism for "controlled absence" —
  // translate() falls back to the en entry (itself now the empty
  // string — controlled absence, never invented Spanish prose, never a
  // visible technical marker) rather than a second, parallel fallback
  // path invented for this mission.

  // Builder continuity mission — save-status line + Guided Flow pause screen.
  "autosave.saving": "Guardando…",
  "autosave.saved": "Guardado",
  "autosave.error": "No se han podido guardar tus últimos cambios.",
  "autosave.offline": "Estás sin conexión. Tus últimos cambios se guardarán en cuanto vuelva la conexión.",
  "autosave.retry": "Reintentar",
  "flowPause.title": "Tus respuestas están guardadas",
  "flowPause.body":
    "Has completado todos los pasos disponibles por ahora. Puedes volver en cualquier momento desde tu espacio y continuar exactamente donde lo dejaste.",
  "flowPause.backToSpace": "Volver a mi espacio",
};
