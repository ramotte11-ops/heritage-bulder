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
