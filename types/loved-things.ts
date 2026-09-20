/**
 * Mission 044 — the canonical "Ce qu'elle aimait" (A11) content model.
 *
 * A11 is one of the three matières on the single "Quelques mots sur la
 * personne" sheet (mission brief: "1 feuille côté famille -> 3 questions
 * ouvertes -> 3 matières distinctes côté données"). This file mirrors
 * `types/person-words.ts` (A10) exactly — same shape, same doctrine, same
 * reasoning — because the QG decision that merged A10/A11/A12 into one
 * Builder screen explicitly preserved three DISTINCT data matières (mission
 * brief section 5: "Ne détourne pas content.story… inspecte d'abord
 * l'architecture réellement mergée… propose l'extension minimale et
 * cohérente permettant de conserver trois matières distinctes"). See that
 * file's own docstring for the full reasoning behind every rule below;
 * this one only restates what actually differs (the content key and the
 * question it answers).
 *
 * ## Not `content.story`, not `content.personWords` — its own key
 *
 * Stored at `content.personWords`'s own sibling, `content.lovedThings` —
 * a NEW top-level content key, deliberately NOT a `SectionId`, exactly
 * the same device `content.personWords`/`content.guidedFlow` already use
 * for real, persisted content not yet tied to any Memorial section/
 * rendering decision. A future Studio-led "Récit de vie" composition
 * (A10+A11+A12) can read this key — and `content.personWords`/
 * `content.legacy`'s own, equally separate keys — without this mission
 * having pre-decided anything about how they are combined or rendered.
 *
 * ## One field only — never a biography form
 *
 * `text` is the ONLY field this model carries, for the exact same reason
 * `PersonWordsContent` carries only one: A11 answers "Qu'est-ce qu'elle
 * aimait particulièrement ?" with free text, never a set of fields for
 * passion/lieu/musique/habitude/plat — the mission brief is explicit that
 * "les petites pistes restent de simples aides rédactionnelles", never
 * sub-fields.
 */
export interface LovedThingsContent {
  [key: string]: unknown;
  /** The family's own confirmed text. `null` = nothing confirmed yet
   * (A11 not yet visited, or explicitly skipped) — never invalid. Always
   * non-blank when non-null: a blanks-only value normalizes to `null`,
   * mirroring `PersonWordsContent`'s own `text`. */
  text: string | null;
}

/** `LovedThingsContent` with nothing confirmed — a brand-new draft, A11
 * fully skipped, or not yet visited. */
export const EMPTY_LOVED_THINGS_CONTENT: LovedThingsContent = {
  text: null,
};
