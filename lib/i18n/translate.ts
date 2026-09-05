import { DEFAULT_LANGUAGE, LANGUAGES, type Language } from "@/config/languages";
import { type TranslationKey, isTranslationKey } from "./keys";
import { en } from "./dictionaries/en";
import { fr } from "./dictionaries/fr";
import { es } from "./dictionaries/es";

/**
 * Mission 022 — the i18n foundation.
 *
 * `translate()` is the one primitive that turns `language + key` into
 * system text. Pure and synchronous: no I/O, no Supabase, no browser, no
 * clock, no shared mutable state — every dictionary below is frozen so
 * an attempt to mutate one throws immediately rather than silently
 * corrupting text for every other caller.
 *
 * Deliberately ignorant of the rest of the product model: this module
 * never imports `Skin`, `OfferId`, `EditorialContext`, or anything Etsy
 * — `Language ≠ Culture ≠ Skin ≠ Offer` (mission brief section 7) is
 * enforced here simply by this file having no way to read any of them.
 * A caller decides *which* `Language` to pass; this module never infers
 * one from a skin, an offer, a culture, or a browser header, and never
 * writes one back anywhere — resolving a text has no persistence effect
 * on a Memorial's `language` column (types/memorial.ts), full stop.
 */

export type Dictionary = Partial<Record<TranslationKey, string>>;

/**
 * One dictionary per supported language. This object's key set is
 * `config/languages.ts`'s `LANGUAGES` — the repo's one existing
 * canonical language list (see `types/memorial.ts`, already wired into
 * persistence) — never a second, independently maintained list.
 * `Record<Language, Dictionary>` makes that a compile-time guarantee:
 * add a language to `LANGUAGES` without a matching entry here and this
 * file stops building. `translate.test.ts` adds the same guarantee at
 * runtime, so the check also holds under `any`/unchecked call sites.
 *
 * Frozen (`Object.freeze`, one level deep — each dictionary's own
 * values are strings, already immutable) so the "no mutation" guarantee
 * this module documents is enforced, not just asserted.
 */
export const DICTIONARIES: Readonly<Record<Language, Readonly<Dictionary>>> = Object.freeze({
  en: Object.freeze({ ...en }),
  fr: Object.freeze({ ...fr }),
  es: Object.freeze({ ...es }),
});

/**
 * Is `value` one of `config/languages.ts`'s `LANGUAGES`? The one place
 * this module treats a language as untrusted input rather than an
 * already-typed `Language` — useful the moment a caller has a raw
 * string (persisted data, a future request) rather than a value it
 * already knows is valid.
 */
export function isSupportedLanguage(value: string): value is Language {
  return (LANGUAGES as readonly string[]).includes(value);
}

/**
 * Resolves one piece of system text.
 *
 * Fallback strategy (mission brief section 6), checked in order:
 *
 *  1. `language` isn't one of `LANGUAGES` (unsupported or invalid) ->
 *     resolve as `DEFAULT_LANGUAGE` ("en") for *this call only*. This
 *     never changes, infers, or persists a Memorial's actual `language`
 *     — it is purely which dictionary this one resolution reads from.
 *  2. `key` isn't in `TRANSLATION_KEYS` at all (a caller that bypassed
 *     the `TranslationKey` type — an `as` cast, or a value from outside
 *     typed application code) -> a genuine developer error, not a real
 *     runtime case at a typed call site. Fails loud in development/test
 *     (`NODE_ENV !== "production"`) by throwing, so it is caught long
 *     before it ships; in production it degrades to the key string
 *     itself so a visitor never sees a crash over one bad key.
 *  3. The resolved language's dictionary has no entry for `key` (FR/ES
 *     not yet translated for a key that does exist) -> the `en`
 *     dictionary's entry for the same key, guaranteed to exist because
 *     `en` is typed `Record<TranslationKey, string>`, not `Partial` —
 *     see `dictionaries/en.ts`.
 *  4. `en` itself missing the key is impossible under (3)'s type
 *     guarantee; kept here only so this function still has an explicit,
 *     non-throwing production floor rather than an unchecked crash.
 *
 * `dictionaries` defaults to the real `DICTIONARIES` and exists as a
 * parameter only so tests can exercise the fallback rules above against
 * a constructed fixture without needing to leave the real FR/ES
 * dictionaries deliberately incomplete.
 */
export function translate(
  language: string,
  key: TranslationKey,
  dictionaries: Record<Language, Dictionary> = DICTIONARIES,
): string {
  if (!isTranslationKey(key)) {
    return resolveMissingKey(key);
  }

  const resolvedLanguage = isSupportedLanguage(language) ? language : DEFAULT_LANGUAGE;

  const value = dictionaries[resolvedLanguage][key];
  if (value !== undefined) return value;

  const fallback = dictionaries[DEFAULT_LANGUAGE][key];
  if (fallback !== undefined) return fallback;

  return resolveMissingKey(key);
}

function resolveMissingKey(key: string): string {
  if (process.env.NODE_ENV !== "production") {
    throw new Error(
      `i18n: no canonical dictionary entry for translation key "${key}". This is a ` +
        "developer error, not something a real visitor can trigger through typed call " +
        "sites — add the key to lib/i18n/keys.ts and to the en dictionary, or fix the call site.",
    );
  }
  return key;
}
