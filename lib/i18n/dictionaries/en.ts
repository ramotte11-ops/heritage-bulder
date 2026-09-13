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
  "context.title": "What would you like to create today?",
  "context.subtitle": "Choose the path that best reflects what you need right now.",
  "context.announcementTitle": "Announcement & Tribute",
  "context.announcementDescription":
    "For a recent loss — share the essential information first, then add memories over time.",
  "context.remembranceTitle": "Memory & Tribute",
  "context.remembranceDescription":
    "Create a lasting space of remembrance centered on the person's life, story, and memory.",
  "preview.view": "View preview",
  "preview.hide": "Hide preview",
  "preview.backToCreation": "Back to creation",
  "hero.identityTitle": "Who are we honoring?",
  "hero.identitySubtitle":
    "Enter the name exactly as it should appear. Birth and death dates are optional.",
  "hero.displayNameLabel": "Name to display",
  "hero.displayNameRequired": "Please enter a name to continue.",
  "hero.birthLabel": "Born",
  "hero.deathLabel": "Died",
  "hero.dateModeYear": "Year only",
  "hero.dateModeFull": "Full date",
  "hero.dateInvalid": "This date doesn't look valid. Please check it.",
  "hero.chronologyImpossible": "These dates don't seem possible together. Please check them.",
  "hero.dataUnavailable": "We couldn't load this information right now. Please try again shortly.",
  "hero.phraseTitleAnnouncement": "A few words, if you'd like",
  "hero.phraseSubtitleAnnouncement":
    "A short line the family would like to share alongside the announcement. Optional — you can continue without one.",
  "hero.phraseTitleRemembrance": "A few words, if you'd like",
  "hero.phraseSubtitleRemembrance":
    "A short line that captures how they're remembered. Optional — you can continue without one.",
  "hero.photoTitle": "Choose the main photo",
  "hero.photoSubtitle": "This is the first image the family will see when discovering this tribute.",
  "hero.photoAddLabel": "Add a photo",
  "hero.photoChangeLabel": "Change photo",
  "hero.photoCroppingNote": "Don't worry about the framing for now — you'll be able to adjust it right after.",
  "hero.photoUploading": "Adding the photo…",
  "hero.photoAlt": "Photo chosen for the tribute",
  "hero.photoErrorTooLarge": "This photo is too large. Please try another one.",
  "hero.photoErrorUnsupportedFormat":
    "This photo format isn't supported yet. Please choose a JPEG, PNG or WebP photo.",
  "hero.photoErrorInvalidFile": "We couldn't use this photo. Please try another one.",
  "hero.photoErrorGeneric": "We couldn't add the photo right now. You can try again.",
  "hero.cropTitle": "Adjust your photo",
  "hero.cropSubtitle": "Move and zoom to frame it the way you'd like.",
  "hero.cropZoomLabel": "Zoom",
  "hero.cropMoveUp": "Move photo up",
  "hero.cropMoveDown": "Move photo down",
  "hero.cropMoveLeft": "Move photo left",
  "hero.cropMoveRight": "Move photo right",
  "hero.cropReset": "Reset",
  "hero.cropChangePhoto": "Change photo",
  "hero.revealTitle": "Your Hero",
  "hero.revealToggleToDark": "View in dark ambiance",
  "hero.revealToggleToLight": "View in light ambiance",
  "hero.revealConfirm": "Continue with this ambiance",
  "deathNotice.announcementTitle": "A few words to announce their passing",
  "deathNotice.announcementSubtitle":
    "Just the heart of it, in your own words — there's no need to add anything else here.",
  "deathNotice.announcementPlaceholder": "It is with great sadness that we share the passing of…",
  "deathNotice.announcementRequired": "Please write a few words to continue.",
  "deathNotice.precisionsTitle": "Would you like to add a few details?",
  "deathNotice.precisionsSubtitle": "Entirely optional — add only what feels right to you.",
  "deathNotice.precisionsAddLocation": "Add a location",
  "deathNotice.precisionsAddFamilyMessage": "Add a word from the family",
  "deathNotice.precisionsAddThought": "Add a thought",
  "deathNotice.precisionsAddQuote": "Add a quote",
  "deathNotice.precisionsAddOther": "Add another detail",
  "deathNotice.precisionsFieldLocation": "Location",
  "deathNotice.precisionsFieldFamilyMessage": "A word from the family",
  "deathNotice.precisionsFieldThought": "A thought",
  "deathNotice.precisionsFieldQuote": "A quote",
  "deathNotice.precisionsFieldOther": "Another detail",
  "deathNotice.precisionsSkip": "Skip this step",
};
