/**
 * Mission 044 — the canonical "Ce qu'elle laisse" (A12) content model.
 *
 * A12 is one of the three matières on the single "Quelques mots sur la
 * personne" sheet — see `types/loved-things.ts` (A11) and
 * `types/person-words.ts` (A10) for the full reasoning this file mirrors
 * exactly, restated here only where it actually differs (the content key
 * and the question it answers: "Qu'est-ce qu'elle laisse derrière elle ?").
 *
 * Stored at `content.legacy` — a NEW top-level content key, deliberately
 * NOT a `SectionId`, sibling to `content.personWords`/`content.lovedThings`.
 * One field only (`text`), for the identical "never a biography form"
 * reason those two carry only one.
 */
export interface LegacyContent {
  [key: string]: unknown;
  /** The family's own confirmed text. `null` = nothing confirmed yet
   * (A12 not yet visited, or explicitly skipped) — never invalid. Always
   * non-blank when non-null: a blanks-only value normalizes to `null`,
   * mirroring `PersonWordsContent`/`LovedThingsContent`'s own `text`. */
  text: string | null;
}

/** `LegacyContent` with nothing confirmed — a brand-new draft, A12 fully
 * skipped, or not yet visited. */
export const EMPTY_LEGACY_CONTENT: LegacyContent = {
  text: null,
};
