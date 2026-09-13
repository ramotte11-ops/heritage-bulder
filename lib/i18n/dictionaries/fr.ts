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
  "preview.view": "Voir l'aperçu",
  "preview.hide": "Masquer l'aperçu",
  "preview.backToCreation": "Revenir à la création",
  "hero.identityTitle": "Qui souhaitez-vous honorer ?",
  "hero.identitySubtitle":
    "Saisissez le nom exactement comme il doit apparaître. Les dates de naissance et de décès sont facultatives.",
  "hero.displayNameLabel": "Nom affiché",
  "hero.displayNameRequired": "Merci de renseigner un nom pour continuer.",
  "hero.birthLabel": "Naissance",
  "hero.deathLabel": "Décès",
  "hero.dateModeYear": "Année seulement",
  "hero.dateModeFull": "Date complète",
  "hero.dateInvalid": "Cette date ne semble pas valide. Merci de la vérifier.",
  "hero.chronologyImpossible": "Ces dates ne semblent pas compatibles entre elles. Merci de les vérifier.",
  "hero.dataUnavailable":
    "Nous n'avons pas pu charger ces informations pour le moment. Merci de réessayer dans quelques instants.",
  "hero.phraseTitleAnnouncement": "Quelques mots, si vous le souhaitez",
  "hero.phraseSubtitleAnnouncement":
    "Une courte phrase que la famille souhaite partager avec l'annonce. Facultatif — vous pouvez continuer sans en écrire.",
  "hero.phraseTitleRemembrance": "Quelques mots, si vous le souhaitez",
  "hero.phraseSubtitleRemembrance":
    "Une courte phrase qui rappelle comment on se souvient d'elle ou de lui. Facultatif — vous pouvez continuer sans en écrire.",
  "hero.photoTitle": "Choisissez la photo principale",
  "hero.photoSubtitle": "C'est la première image que la famille verra en découvrant cet hommage.",
  "hero.photoAddLabel": "Ajouter une photo",
  "hero.photoChangeLabel": "Changer la photo",
  "hero.photoCroppingNote":
    "Ne vous inquiétez pas du cadrage pour l'instant : vous pourrez l'ajuster juste après.",
  "hero.photoUploading": "Ajout de la photo…",
  "hero.photoAlt": "Photo choisie pour l'hommage",
  "hero.photoErrorTooLarge": "Cette photo est trop volumineuse. Essayez-en une autre.",
  "hero.photoErrorUnsupportedFormat":
    "Ce format de photo n'est pas encore pris en charge. Choisissez une photo JPEG, PNG ou WebP.",
  "hero.photoErrorInvalidFile": "Nous n'avons pas pu utiliser cette photo. Essayez-en une autre.",
  "hero.photoErrorGeneric": "Nous n'avons pas pu ajouter la photo pour le moment. Vous pouvez réessayer.",
  "hero.cropTitle": "Ajustez votre photo",
  "hero.cropSubtitle": "Déplacez et zoomez pour la cadrer comme vous le souhaitez.",
  "hero.cropZoomLabel": "Zoom",
  "hero.cropMoveUp": "Déplacer la photo vers le haut",
  "hero.cropMoveDown": "Déplacer la photo vers le bas",
  "hero.cropMoveLeft": "Déplacer la photo vers la gauche",
  "hero.cropMoveRight": "Déplacer la photo vers la droite",
  "hero.cropReset": "Réinitialiser",
  "hero.cropChangePhoto": "Changer la photo",
  "hero.revealTitle": "Votre Hero",
  "hero.revealToggleToDark": "Voir en version sombre",
  "hero.revealToggleToLight": "Voir en version claire",
  "hero.revealConfirm": "Continuer avec cette ambiance",
  "deathNotice.announcementTitle": "Quelques mots pour annoncer son départ",
  "deathNotice.announcementSubtitle":
    "L'essentiel, avec vos propres mots — inutile d'ajouter autre chose ici.",
  "deathNotice.announcementPlaceholder":
    "C'est avec une grande tristesse que nous vous faisons part du décès de…",
  "deathNotice.announcementRequired": "Merci d'écrire quelques mots pour continuer.",
  "deathNotice.precisionsTitle": "Souhaitez-vous ajouter quelques précisions ?",
  "deathNotice.precisionsSubtitle": "Entièrement facultatif — n'ajoutez que ce qui vous semble juste.",
  "deathNotice.precisionsAddLocation": "Ajouter un lieu",
  "deathNotice.precisionsAddFamilyMessage": "Ajouter un mot de la famille",
  "deathNotice.precisionsAddThought": "Ajouter une pensée",
  "deathNotice.precisionsAddQuote": "Ajouter une citation",
  "deathNotice.precisionsAddOther": "Ajouter une autre précision",
  "deathNotice.precisionsFieldLocation": "Lieu",
  "deathNotice.precisionsFieldFamilyMessage": "Un mot de la famille",
  "deathNotice.precisionsFieldThought": "Une pensée",
  "deathNotice.precisionsFieldQuote": "Une citation",
  "deathNotice.precisionsFieldOther": "Une autre précision",
  "deathNotice.precisionsSkip": "Passer cette étape",
};
