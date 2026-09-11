/**
 * Mission 022 — the i18n foundation's canonical key set.
 *
 * Every system text this codebase can resolve through `lib/i18n/translate.ts`
 * has a key here, and only here. This list is deliberately tiny: just
 * enough generic, reusable text to prove `language + key -> text` end to
 * end (mission brief section 4), not a place to pre-translate real
 * product copy. Adding a key is a deliberate, reviewed step — never a
 * dumping ground for one component's specific wording.
 *
 * Convention (mission brief section 5): "<namespace>.<name>", flat, one
 * level deep on purpose (no deeper tree, no key-building framework).
 * `common` is generic actions reusable anywhere, `nav` is minimal
 * navigation, `errors` is generic failure text. A key never encodes the
 * English string itself (no `common.continueButton` echoing "Continue"),
 * and never names a component when the concept is generic (no
 * `builder.saveButton` — see `common.save`). The Builder's own
 * French-hardcoded interface text (`lib/builder/section-labels.ts`) is a
 * deliberate, separate, pre-existing exception this mission does not
 * touch — see that file's own docstring.
 *
 * Mission 023 adds two keys, in the same convention, for T01 (Welcome +
 * choix de langue): `onboarding` for the one concept T01 itself asks
 * ("choose your language", displayed in all three languages at once on
 * that screen — never a component name, since a later onboarding step
 * could reuse it just as well), and `builder` for the minimal stopgap
 * notice a memorial reaches right after a language is chosen but before
 * it is otherwise configured (see app/builder/[memorialId]/page.tsx).
 * T01's own CTA reuses the existing `common.continue` rather than a
 * third key for the same concept.
 *
 * Mission 024 adds a `context` namespace for T02 (choix du contexte
 * éditorial): the title, subtitle, and each of the two cards' title +
 * description, in the QG's own validated copy (mission brief section
 * 7) — six keys, one per distinct piece of text, none of them named
 * after a component. T02's CTA reuses `common.continue` again, and
 * reaching an unconfigured memorial past T02 reuses the same
 * `builder.notConfiguredYet` T01 already uses — no third stopgap text.
 *
 * Mission 026 adds a `preview` namespace for the Live Preview layout
 * mechanic's three own controls (mission brief sections 5, 6, 8) — the
 * discreet access label shown once the preview is unlocked but closed
 * ("Voir l'aperçu", reused verbatim on mobile for the same concept), the
 * desktop dismiss label ("Masquer l'aperçu"), and the mobile-only return
 * label ("Revenir à la création"), which is deliberately its own key
 * rather than reusing `common.back` — the QG-validated copy names the
 * destination ("la création"), a concept `common.back` does not carry.
 * None of the three is named after a component, same convention as
 * every namespace above.
 *
 * Mission 032 adds a `hero` namespace for PAGE A (T03 nom affiché + T04
 * dates) and PAGE B (T05 quelques mots) — one key per distinct piece of
 * text, none named after a component. `identityTitle`/`identitySubtitle`
 * are PAGE A's copy; `displayNameLabel`/`displayNameRequired`,
 * `birthLabel`/`deathLabel` and `dateModeYear`/`dateModeFull` are its
 * field-level labels. `dateInvalid`/`chronologyImpossible` are the two
 * human, local date errors section 19 of the mission brief asks for —
 * never a technical message. `dataUnavailable` is the one notice shown
 * instead of the form when the stored Hero is corrupted (never silently
 * treated as empty — mission brief section 10). PAGE B's title/subtitle
 * each have an `Announcement`/`Remembrance` variant: the mission brief
 * is explicit that only the WORDING may depend on editorial context
 * (section 7), never the Hero's stored shape — both variants persist
 * into the exact same `shortPhrase` field. PAGE B's own CTA reuses
 * `common.continue`, same as PAGE A.
 *
 * Mission 033 adds `hero.photo*` for PAGE C (T06, the Hero photo
 * upload) — one key per distinct piece of text, none named after a
 * component. `photoTitle`/`photoSubtitle` are the page's own copy;
 * `photoAddLabel`/`photoChangeLabel` label the add/replace control;
 * `photoCroppingNote` is the exact QG-validated reassurance shown once a
 * photo is selected (mission brief section 3 — deliberately NOT a
 * promise about the final crop, which Mission 034 alone decides);
 * `photoUploading` is the one in-flight status text (section 11 — no
 * invented percentage); `photoAlt` is the selected photo's alt text
 * (section 23). The four `photoError*` keys are section 12's closed,
 * human error vocabulary — `lib/media/media-error-copy.ts` is the one
 * place a `MediaErrorCode` resolves to one of them, so no technical
 * detail (a status code, "MIME", "Supabase", a stack) can ever reach
 * this dictionary. PAGE C's own CTA reuses `common.continue`, same as
 * PAGE A/PAGE B; its corrupted-Hero notice reuses the existing
 * `hero.dataUnavailable`, same as both of them too.
 *
 * Mission 034 adds `hero.crop*` for PAGE D (T07, the Hero photo crop) —
 * one key per distinct piece of text. `cropTitle`/`cropSubtitle` are the
 * page's own QG-validated copy ("Ajustez votre photo"); `cropZoomLabel`
 * is the zoom slider's accessible label; `cropMoveUp`/`Down`/`Left`/
 * `Right` label the four directional nudge buttons that give the focal
 * point a keyboard/pointer-independent path (mission brief section 23);
 * `cropReset` is the discreet secondary "Réinitialiser" action (section
 * 10); `cropChangePhoto` is PAGE D's own "Retour -> Changer la photo"
 * link (section 11) — a distinct key from `hero.photoChangeLabel`
 * because its destination context differs (it reads as a navigation
 * back to PAGE C, not PAGE C's own inline replace control), even though
 * both ultimately trigger the same underlying photo-change path. PAGE
 * D's own CTA reuses `common.continue`, same as every other Guided Flow
 * screen; its corrupted-Hero/no-photo notice reuses the existing
 * `hero.dataUnavailable`.
 */
export const TRANSLATION_KEYS = [
  "common.continue",
  "common.back",
  "common.cancel",
  "common.save",
  "nav.home",
  "errors.generic",
  "errors.notFound",
  // Mission 023 — T01 (Welcome + choix de langue).
  "onboarding.chooseLanguage",
  "builder.notConfiguredYet",
  // Mission 024 — T02 (choix du contexte éditorial).
  "context.title",
  "context.subtitle",
  "context.announcementTitle",
  "context.announcementDescription",
  "context.remembranceTitle",
  "context.remembranceDescription",
  // Mission 026 — Live Preview layout mechanic.
  "preview.view",
  "preview.hide",
  "preview.backToCreation",
  // Mission 032 — PAGE A (T03 + T04) and PAGE B (T05).
  "hero.identityTitle",
  "hero.identitySubtitle",
  "hero.displayNameLabel",
  "hero.displayNameRequired",
  "hero.birthLabel",
  "hero.deathLabel",
  "hero.dateModeYear",
  "hero.dateModeFull",
  "hero.dateInvalid",
  "hero.chronologyImpossible",
  "hero.dataUnavailable",
  "hero.phraseTitleAnnouncement",
  "hero.phraseSubtitleAnnouncement",
  "hero.phraseTitleRemembrance",
  "hero.phraseSubtitleRemembrance",
  // Mission 033 — PAGE C (T06 photo Hero).
  "hero.photoTitle",
  "hero.photoSubtitle",
  "hero.photoAddLabel",
  "hero.photoChangeLabel",
  "hero.photoCroppingNote",
  "hero.photoUploading",
  "hero.photoAlt",
  "hero.photoErrorTooLarge",
  "hero.photoErrorUnsupportedFormat",
  "hero.photoErrorInvalidFile",
  "hero.photoErrorGeneric",
  // Mission 034 — PAGE D (T07 photo crop).
  "hero.cropTitle",
  "hero.cropSubtitle",
  "hero.cropZoomLabel",
  "hero.cropMoveUp",
  "hero.cropMoveDown",
  "hero.cropMoveLeft",
  "hero.cropMoveRight",
  "hero.cropReset",
  "hero.cropChangePhoto",
] as const;

export type TranslationKey = (typeof TRANSLATION_KEYS)[number];

/**
 * Runtime guard for a value that TypeScript hasn't already narrowed to
 * `TranslationKey` — e.g. a caller that bypassed the type (an `as`
 * cast, or a key value arriving from outside typed application code).
 * `lib/i18n/translate.ts` is the only place this matters in practice.
 */
export function isTranslationKey(value: string): value is TranslationKey {
  return (TRANSLATION_KEYS as readonly string[]).includes(value);
}
