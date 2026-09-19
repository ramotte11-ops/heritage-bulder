/**
 * Mission 040 — the canonical Ceremony (Cérémonie) content model.
 *
 * This is the content behind the `announcement` editorial context's
 * A04-A08 branch of UX-A (lib/builder/guided-flow/human-steps.ts):
 *
 *   - A04 "Un moment est-il prévu ?"  — obligatoire, non passable. Its
 *     own answer ("yes"/"undecided"/"no") is NOT stored here: it is
 *     recorded exactly like every other Guided Flow answer, as A04's own
 *     `StepRecord.answer` in `content.guidedFlow` (see human-steps.ts's
 *     `A04Answer` and `lib/builder/guided-flow/ceremony-step.ts`). This
 *     model only ever holds the CEREMONY'S OWN facts.
 *   - A05 "Date et heure"            — facultatif, passable.
 *   - A06 "Nom du lieu"              — facultatif, passable.
 *   - A07 "Adresse et accès"         — facultatif, passable.
 *   - A08 "Note pratique / validation" — facultatif, passable.
 *
 * This file only defines the SHAPE, exactly like types/death-notice.ts
 * does for the Death Notice. Parsing, normalization, validation and the
 * draft-integration helpers (inspect/read/write) live in
 * lib/memorial/ceremony.ts. No UI, no A04-A08 screens are built here.
 *
 * ## Six fields, each naturally grouped (mission brief's own découpage)
 *
 * `date`/`time` (A05), `venueName` (A06), `address`/`access` (A07) and
 * `note` (A08) — the exact closed list the mission brief names, no more
 * invented without a demonstrated need. Every field independently
 * nullable — `null` means "not entered", never "invalid" — mirrors
 * `DeathNoticePrecisions`'s own convention.
 *
 * ## No moment answer, no name/dates/photo duplication
 *
 * Deliberately absent: A04's own yes/undecided/no answer (lives in
 * `content.guidedFlow.A04`, see above), and anything already owned by
 * the Hero (`displayName`, `birth`, `death`, photo) or the Death Notice
 * — this model is not a second place either could drift out of sync
 * from.
 *
 * ## No language field, no cause of death, no Auth/Owner dependency
 *
 * Same three rules as `types/death-notice.ts` — every string field is
 * the family's own text, verbatim, in whichever language they used;
 * nothing here captures a cause of death; nothing here names a user, an
 * owner, or a session.
 *
 * ## The index signature is a TypeScript-only necessity — NOT a runtime
 * permission
 *
 * Identical device, identical reason, as `DeathNoticeContent`'s own
 * docstring: `[key: string]: unknown` exists solely so this type is
 * structurally assignable into `MemorialSectionContent`
 * (`Record<string, unknown>`, types/memorial.ts). The actual, strict
 * boundary is `lib/memorial/ceremony.ts`'s `parseCeremonyContent`: any
 * key beyond the six named below makes the whole value `"corrupted"`.
 */
export interface CeremonyContent {
  [key: string]: unknown;
  /** ISO calendar date, `"YYYY-MM-DD"` — A05. */
  date: string | null;
  /** 24h clock time, `"HH:MM"` — A05. */
  time: string | null;
  /** The ceremony's venue name — A06. Never a full postal address (see
   * `address` below), the same "loose vs. precise" distinction
   * `DeathNoticePrecisions.generalLocation` already draws relative to a
   * ceremony's actual address. */
  venueName: string | null;
  /** The ceremony's full address — A07. */
  address: string | null;
  /** Practical access indications (parking, entrance, transport) — A07,
   * alongside `address` but kept as its own field: two distinct pieces
   * of family-authored text, never merged into one generic field. */
  access: string | null;
  /** One facultative practical note — A08. */
  note: string | null;
}

/** `CeremonyContent` with every field absent — A04-A08 fully skipped,
 * `A04` answered "no"/"undecided", or not yet visited. */
export const EMPTY_CEREMONY_CONTENT: CeremonyContent = {
  date: null,
  time: null,
  venueName: null,
  address: null,
  access: null,
  note: null,
};
