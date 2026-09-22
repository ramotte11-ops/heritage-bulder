import type { Language } from "@/config/languages";
import type { MemorialContent } from "@/types/memorial";
import type { TranslationKey } from "@/lib/i18n/keys";
import { translate } from "@/lib/i18n/translate";
import { readPersonWords } from "./person-words";
import { readLovedThings } from "./loved-things";
import { readLegacy } from "./legacy";

/**
 * Récit de vie — content resolution, Handoff GREEN QG
 * `HERITAGE_RDV_HANDOFF_RUNTIME_V1_0_QG_AUDIT`.
 *
 * The one place that turns raw `content.personWords`/`lovedThings`/
 * `legacy` into what the renderer actually shows for each of A10/A11/A12
 * — normalization, and the family-text-vs-HERITAGE-fallback decision.
 * Pure, framework-free (besides `translate`), no I/O — mirrors every
 * other content-resolution module in this codebase.
 *
 * ## Always three matters, never a fourth state
 *
 * `execution-contract.json`: `"always_visible": ["a10","a11","a12"]`.
 * Unlike the withdrawn V1.3.1 package's seven presence states, this
 * Handoff has exactly one behavior: every matter is always resolved and
 * always rendered — either the family's own words, or the localized
 * HERITAGE fallback for that exact matter, in the exact same box. There
 * is no "hide this matter" branch anywhere in this module.
 *
 * ## Normalization — the Handoff's own rule, verbatim
 *
 * `execution-contract.json`: `"text_normalization": "NFC; collapse all
 * whitespace to one U+0020; trim; count Unicode code points"`. Applied
 * before the family-vs-fallback decision AND before display — this
 * Handoff treats A10/A11/A12 as short single-line blurbs (240 characters
 * max), a deliberate departure from the withdrawn V1.3.1 package's
 * multi-paragraph doctrine (HANDOFF.md section 5: "Les retours et
 * suites de blancs sont remplacés par un espace simple").
 *
 * A whitespace-only family value normalizes to the empty string, which
 * this module treats identically to "nothing written at all" — the
 * fallback applies, exactly like `PersonWordsContent.text`'s own
 * "blanks-only normalizes to null" rule one layer down
 * (`lib/memorial/person-words.ts`).
 *
 * ## Never truncates
 *
 * `max_characters_each: 240` is a Builder-side/product capacity target
 * the Handoff's own Desktop Master already demonstrates headroom for
 * (273/334/280-character witness text fit within the canonical boxes)
 * — not something this module enforces by cutting text. `QA.md`'s own
 * RED-verdict list names "texte tronqué" as an immediate failure; this
 * module exposes `countLifeStoryCodePoints` as a read-only utility (for
 * a future Builder-side input guard, out of this mission's scope — "ne
 * pas reconstruire le Builder") but never clips `displayText` on it.
 *
 * ## Fallback text lives in i18n, never here, never in the data
 *
 * The FR/EN/ES fallback strings themselves are NOT constants in this
 * file (HANDOFF.md section 10: "Ne pas stocker les fallbacks dans...
 * une constante locale ad hoc dans un composant [ou module]") — they
 * live in `lib/i18n/dictionaries/*.ts` under `recit.a10Fallback`/
 * `a11Fallback`/`a12Fallback`, resolved through the existing `translate`
 * primitive like every other localized runtime string. This module only
 * ever READS `content`; it never calls a `write*` function, so a
 * resolved fallback can never leak back into
 * `content.personWords`/`lovedThings`/`legacy`.
 */

export type LifeStoryMatterId = "a10" | "a11" | "a12";

/** Canonical order — Handoff: "conservent l'ordre A10 → A11 → A12". */
export const LIFE_STORY_MATTER_ORDER: readonly LifeStoryMatterId[] = ["a10", "a11", "a12"];

const MATTER_TEXT_READERS: Record<LifeStoryMatterId, (content: MemorialContent) => string | null> = {
  a10: (content) => readPersonWords(content).text,
  a11: (content) => readLovedThings(content).text,
  a12: (content) => readLegacy(content).text,
};

export const LIFE_STORY_LABEL_KEY: Record<LifeStoryMatterId, TranslationKey> = {
  a10: "recit.person",
  a11: "recit.loved",
  a12: "recit.legacy",
};

export const LIFE_STORY_FALLBACK_KEY: Record<LifeStoryMatterId, TranslationKey> = {
  a10: "recit.a10Fallback",
  a11: "recit.a11Fallback",
  a12: "recit.a12Fallback",
};

/**
 * `execution-contract.json`'s `text_normalization`, verbatim: Unicode
 * NFC normalization, every run of whitespace (including newlines)
 * collapsed to one U+0020, then trimmed. Idempotent — normalizing an
 * already-normalized string is a no-op.
 */
export function normalizeLifeStoryText(raw: string): string {
  return raw.normalize("NFC").replace(/\s+/g, " ").trim();
}

/** Unicode code point count, never UTF-16 code units (so an astral
 * character — most emoji, some scripts — counts once, matching the
 * contract's own "count Unicode code points"). Read-only measurement;
 * see this module's own top docstring for why it is never used to
 * truncate `displayText`. */
export function countLifeStoryCodePoints(text: string): number {
  return Array.from(text).length;
}

export interface LifeStoryMatterContent {
  id: LifeStoryMatterId;
  labelKey: TranslationKey;
  /** Normalized family text, or `null` when the family wrote nothing
   * (or only whitespace) — the fallback applies whenever this is
   * `null`. Never the raw, un-normalized value. */
  familyText: string | null;
  /** What the renderer actually shows: `familyText` verbatim when
   * present, otherwise the matter's own localized HERITAGE fallback.
   * Non-empty for FR (QG-validated GREEN copy). For EN/ES, whose
   * fallback copy is not yet QG-validated, this resolves to the empty
   * string rather than invented editorial text or a visible technical
   * marker — see `lib/i18n/dictionaries/en.ts`'s own note on
   * `recit.a10Fallback`/`a11Fallback`/`a12Fallback`. */
  displayText: string;
  /** `true` exactly when `displayText` is the HERITAGE fallback rather
   * than the family's own words. */
  isFallback: boolean;
}

/**
 * Resolves ONE matter's display content. Reads through the same
 * fail-safe `readPersonWords`/`readLovedThings`/`readLegacy` functions
 * every other renderer in this codebase uses (never throws on corrupted
 * content — a corrupted matter reads as absent, so it falls back, same
 * as a genuinely empty one).
 */
export function resolveLifeStoryMatter(
  id: LifeStoryMatterId,
  content: MemorialContent,
  language: Language,
): LifeStoryMatterContent {
  const raw = MATTER_TEXT_READERS[id](content);
  const normalized = raw === null ? "" : normalizeLifeStoryText(raw);
  const familyText = normalized === "" ? null : normalized;
  const displayText = familyText ?? translate(language, LIFE_STORY_FALLBACK_KEY[id]);

  return {
    id,
    labelKey: LIFE_STORY_LABEL_KEY[id],
    familyText,
    displayText,
    isFallback: familyText === null,
  };
}

/** All three matters, in canonical A10 -> A11 -> A12 order — the one
 * function the renderer calls. */
export function resolveLifeStoryContent(
  content: MemorialContent,
  language: Language,
): LifeStoryMatterContent[] {
  return LIFE_STORY_MATTER_ORDER.map((id) => resolveLifeStoryMatter(id, content, language));
}
