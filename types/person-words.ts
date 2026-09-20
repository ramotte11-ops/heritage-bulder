/**
 * Mission 043 — the canonical "Quelques mots sur la personne" (A10)
 * content model.
 *
 * This is the content behind the `announcement` editorial context's own
 * A10 step (lib/builder/guided-flow/human-steps.ts): a facultative,
 * passable, single piece of free text the family writes to briefly say
 * what they would like the people close to them to remember about the
 * person — never a biography form, never generated, never inferred from
 * the Hero, a culture, a skin, the Ceremony, or Traditions (mission brief
 * doctrine: "aucune génération automatique ; aucune inférence").
 *
 * This file only defines the SHAPE, exactly like types/ceremony.ts does
 * for the Ceremony. Parsing, normalization, validation and the draft-
 * integration helpers (inspect/read/write) live in
 * lib/memorial/person-words.ts. No UI, no A10 screen, no wording, and no
 * Memorial rendering of any kind are built or referenced here.
 *
 * ## One field only — never a biography form
 *
 * A10's own product doctrine (mission brief) is explicit: free text, not
 * a set of fields for profession/qualities/family/character/parcours.
 * `text` is the ONLY field this model carries — deliberately no `title`,
 * no per-topic slot, nothing that would turn a free "quelques mots" into
 * a structured form.
 *
 * ## Not `content.story` (QG note)
 *
 * `config/sections.ts` already reserves a `"story"` `SectionId`, but it
 * is a pre-existing, generic, Memorial-facing placeholder unrelated to
 * this Guided Flow step (no A-step has ever written to it) and shared by
 * BOTH editorial contexts, whereas A10 is `announcement`-only. Writing
 * A10's content there would silently commit this mission to a Memorial
 * rendering decision — exactly what the mission brief forbids ("aucun
 * renderer Memorial A10 dans cette mission ; ne pas figer une
 * architecture visuelle de section"). This model is therefore stored at
 * a NEW top-level content key, `content.personWords` — not a `SectionId`
 * at all, the same device `content.guidedFlow` already uses
 * (lib/builder/guided-flow/flow-state.ts) for content that is real and
 * persisted but not yet tied to any Memorial section/rendering decision.
 * A future Studio-led "Récit de vie" composition (A10+A11+A12) can read
 * this key — and A11/A12's own, equally separate keys — without this
 * mission having pre-decided anything about how they are combined or
 * rendered (mission brief: "éviter de coder A10 d'une manière qui
 * empêcherait plus tard de composer A10+A11+A12").
 *
 * ## Family content, exactly as entered
 *
 * `text` is the family's own words, verbatim — never translated, never
 * reformulated, never analyzed. A `null` value means A10 has nothing
 * confirmed yet (not yet visited, or explicitly skipped) — never an
 * empty string, never a placeholder/fabricated sentence.
 *
 * ## The index signature is a TypeScript-only necessity — NOT a runtime
 * permission
 *
 * Identical device, identical reason, as `CeremonyContent`/
 * `TraditionsContent`'s own docstrings: `[key: string]: unknown` exists
 * solely so this type is structurally assignable where a
 * `Record<string, unknown>`-shaped value is expected. The actual, strict
 * boundary is `lib/memorial/person-words.ts`'s `parsePersonWordsContent`:
 * any key beyond `text` makes the whole value `"corrupted"`.
 */
export interface PersonWordsContent {
  [key: string]: unknown;
  /** The family's own confirmed text. `null` = nothing confirmed yet
   * (A10 not yet visited, or explicitly skipped) — never invalid. Always
   * non-blank when non-null: a blanks-only value normalizes to `null`,
   * mirroring `HeroContent`'s own text fields (types/hero.ts). */
  text: string | null;
}

/** `PersonWordsContent` with nothing confirmed — a brand-new draft, A10
 * fully skipped, or not yet visited. */
export const EMPTY_PERSON_WORDS_CONTENT: PersonWordsContent = {
  text: null,
};
