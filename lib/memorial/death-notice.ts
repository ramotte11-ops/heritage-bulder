import type { MemorialContent } from "@/types/memorial";
import {
  EMPTY_DEATH_NOTICE_CONTENT,
  EMPTY_DEATH_NOTICE_PRECISIONS,
  type DeathNoticeContent,
  type DeathNoticePrecisions,
} from "@/types/death-notice";

/**
 * Mission 038 — parsing, normalization, validation, and draft integration
 * for the Death Notice (types/death-notice.ts), plus its integration with
 * the existing draft model (`memorial_drafts.content` — see
 * lib/adapters/draft-repository.ts). Pure, framework-free, no I/O: exactly
 * the same discipline as lib/memorial/hero.ts, lib/memorial/status-transitions.ts
 * and lib/memorial/section-selection.ts.
 *
 * ## Why `draft.content.deathNotice`, not a dedicated table
 *
 * Audited alongside `memorials`, `memorial_drafts` and
 * `memorial_published_snapshots` (mission brief, section 7), the same way
 * Mission 031 audited them for the Hero. The Death Notice's fields
 * (`announcementText`, `precisions`) are editorial content the family
 * edits and autosaves progressively, exactly like every other section's
 * content — not structural/lifecycle metadata (`memorial_type`,
 * `editorial_context`, `skin`, `status`, ...), which is what `memorials`
 * actually holds (types/memorial.ts). `memorial_drafts.content` already
 * exists as JSONB for exactly this kind of per-section content, and
 * `config/sections.ts` already reserves `"deathNotice"` as a `SectionId`
 * (core in `announcement`, absent from `remembrance`). No migration, no
 * new table, no new columns — mission brief, section 7's "ne pas créer
 * une migration simplement parce que le contenu est nouveau".
 *
 * ## Context safety (mission brief, section 10)
 *
 * Nothing in this module takes an `EditorialContext` parameter, reads
 * `memorials.editorial_context`, or branches on it. `inspectDeathNotice`/
 * `readDeathNotice`/`writeDeathNotice` operate purely on `content.deathNotice`
 * — exactly as available (or not) as any other content key — regardless
 * of whatever context the memorial happens to be in right now. This is
 * what guarantees, structurally rather than by convention:
 *
 *   - a family that temporarily switches `editorialContext` away from
 *     `"announcement"` and back never loses `content.deathNotice`: no
 *     function here ever deletes it, and nothing outside this module
 *     does either (a context switch only ever touches `memorials.editorial_context`
 *     itself — see lib/memorial/... context-selection code, which this
 *     module has no dependency on and does not need one);
 *   - `remembrance` never has this content injected into it: nothing in
 *     `remembrance`'s own section list (config/sections.ts's
 *     `EDITORIAL_CONTEXT_SECTIONS.remembrance`) includes `"deathNotice"`,
 *     and `lib/memorial/section-selection.ts` already resolves it to
 *     `"notRelevant"` there unconditionally — this module does not
 *     duplicate that rule, it simply never overrides or bypasses it: a
 *     stray `content.deathNotice` sitting in a `remembrance` draft (e.g.
 *     right after a context switch) is inert data no `remembrance`
 *     rendering path ever reads, because no `remembrance` rendering path
 *     reads this module at all.
 *
 * ## No Auth/Owner dependency (mission brief, section 11)
 *
 * No function below takes a session, an owner id, or performs any I/O —
 * every one operates purely on the `MemorialContent` it is handed. This
 * keeps the door open for a future pre-authentication guest draft
 * (mission brief's own "entrée gratuite / sans compte" orientation): a
 * draft's Death Notice content can be read/written before any owner is
 * attached to it, exactly like every other pure content-model module in
 * this codebase.
 */

// ---------------------------------------------------------------------
// Small internal helpers — identical discipline to lib/memorial/hero.ts
// ---------------------------------------------------------------------

/** A sentinel distinct from every legal parsed value (including `null`,
 * itself a legal "absent" value for every field here) — this is what
 * lets a private parser return "absent" and "malformed" as two different
 * outcomes. Mirrors lib/memorial/hero.ts's own `INVALID`. */
const INVALID = Symbol("deathNotice:invalid");
type Parsed<T> = T | typeof INVALID;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The only normalization this domain performs on family-authored text
 * (mission brief, section 6): peripheral whitespace only. Casing, accents
 * and punctuation are exactly what the family chose and are never
 * touched. A blanks-only string normalizes to `null` (absent) —
 * incomplete, never invalid. Identical rule to lib/memorial/hero.ts's
 * `normalizeOptionalText`, reused here rather than re-derived because it
 * is the same domain rule, not a coincidence.
 */
function normalizeOptionalText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function parseOptionalText(raw: unknown): Parsed<string | null> {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "string") return INVALID;
  return normalizeOptionalText(raw);
}

/**
 * QG closure — the canonical model is CLOSED to the keys named below,
 * both top-level and inside `precisions`. This is the runtime boundary
 * that actually enforces "no unknown property" (mission brief's own
 * correction: `[key: string]: unknown` on `DeathNoticeContent`/
 * `DeathNoticePrecisions`, types/death-notice.ts, is a TypeScript
 * assignability device only — it grants no runtime permission for an
 * arbitrary key to exist, and this function is what makes that true in
 * practice, not the type). Used by both `parseDeathNoticeContent` and
 * `parsePrecisions` below so the rule is stated exactly once.
 */
function hasOnlyKnownKeys(raw: Record<string, unknown>, knownKeys: ReadonlySet<string>): boolean {
  return Object.keys(raw).every((key) => knownKeys.has(key));
}

const DEATH_NOTICE_KEYS: ReadonlySet<string> = new Set(["announcementText", "precisions"]);
const DEATH_NOTICE_PRECISION_KEYS: ReadonlySet<string> = new Set([
  "generalLocation",
  "familyMessage",
  "thought",
  "quote",
  "other",
]);

// ---------------------------------------------------------------------
// A02 — precisions
// ---------------------------------------------------------------------

/** Which precision field failed, or the whole `precisions` value itself
 * (e.g. not an object at all). Not a user-facing message — Mission 039's
 * own wording is a later step; this is only precise enough for a caller
 * (and a test) to tell failures apart. */
export type DeathNoticePrecisionReason =
  | "precisions"
  | "generalLocation"
  | "familyMessage"
  | "thought"
  | "quote"
  | "other";

type ParsedPrecisions = Parsed<DeathNoticePrecisions>;

/**
 * Parses `precisions`. `undefined`/`null` is the legal "A02 not visited /
 * fully skipped yet" state, and parses to `EMPTY_DEATH_NOTICE_PRECISIONS`
 * — the same "absent" outcome as every field individually being absent
 * (types/death-notice.ts's own docstring on why `precisions` is never
 * itself nullable). Anything else must be a plain object holding ONLY the
 * five known precision keys (`hasOnlyKnownKeys` — QG closure); each of
 * them is then parsed with the same optional-text rule. Any other shape
 * (not an object; ANY key besides the five known ones, whichever value it
 * holds; a known field holding a non-string) is rejected — never silently
 * dropped, never silently accepted as if it were canonical.
 */
function parsePrecisions(raw: unknown): ParsedPrecisions {
  if (raw === null || raw === undefined) return { ...EMPTY_DEATH_NOTICE_PRECISIONS };
  if (!isPlainObject(raw)) return INVALID;
  if (!hasOnlyKnownKeys(raw, DEATH_NOTICE_PRECISION_KEYS)) return INVALID;

  const generalLocation = parseOptionalText(raw.generalLocation);
  if (generalLocation === INVALID) return INVALID;

  const familyMessage = parseOptionalText(raw.familyMessage);
  if (familyMessage === INVALID) return INVALID;

  const thought = parseOptionalText(raw.thought);
  if (thought === INVALID) return INVALID;

  const quote = parseOptionalText(raw.quote);
  if (quote === INVALID) return INVALID;

  const other = parseOptionalText(raw.other);
  if (other === INVALID) return INVALID;

  return { generalLocation, familyMessage, thought, quote, other };
}

// ---------------------------------------------------------------------
// Whole-content parsing / validation
// ---------------------------------------------------------------------

/** Which part of a `DeathNoticeContent` candidate failed. Mirrors
 * lib/memorial/hero.ts's `HeroValidationReason`, plus `"unknownKey"` — the
 * QG closure rule this model's own reason vocabulary needed that Hero's
 * never has (Hero has no facultative-precisions-style nested bag whose
 * openness had to be explicitly closed). */
export type DeathNoticeValidationReason =
  | "not_an_object"
  | "unknownKey"
  | "announcementText"
  | DeathNoticePrecisionReason;

export type DeathNoticeValidationResult =
  | { ok: true; deathNotice: DeathNoticeContent }
  | { ok: false; reason: DeathNoticeValidationReason };

/**
 * The one place that turns an untrusted value (raw JSON out of
 * `memorial_drafts.content.deathNotice`, or a `DeathNoticeContent` a
 * caller built by hand) into either a known-good `DeathNoticeContent` or
 * a specific rejection. Never casts — every field is individually
 * checked, mirroring lib/memorial/hero.ts's `parseHeroContent`.
 *
 * This function's `ok: true` outcome is exactly the "modèle
 * structurellement valide" the mission brief (section 9) asks to be kept
 * distinct from "A01 réellement complété": a well-formed
 * `DeathNoticeContent` with `announcementText: null` (A01 not filled in
 * yet) still parses `ok: true` here — this module makes no completion
 * judgement at all, deliberately. That judgement (a real `StepRecord` for
 * A01, written only at an actual guided-flow commit) is Mission 039's own
 * job, the same way Mission 031 defined `HeroContent`'s structural shape
 * while Mission 032 owned T03's actual completion semantics.
 *
 * `undefined`/`null` (a draft with no `deathNotice` key at all — every
 * `remembrance` draft, and any `announcement` draft that hasn't reached
 * A01 yet) is the one input that is NOT an error: it parses to
 * `EMPTY_DEATH_NOTICE_CONTENT`. Any other non-object input (a stray
 * string, a number, an array) is rejected as `"not_an_object"` rather
 * than treated as absent — that only arises from real corruption.
 *
 * ## QG closure — the model is CLOSED to unknown keys (not silently
 * dropped)
 *
 * An earlier revision reconstructed `{ announcementText, precisions }` as
 * a fresh object literal and simply never copied any OTHER key `raw`
 * might carry — which kept them out of the canonical shape, but did so by
 * silently discarding them, with no trace they had ever existed. The QG
 * correctly rejected that: an unknown key might be an old field, a future
 * one, foreign data, or real corruption — a parser has no way to tell
 * which, so it must never guess by quietly dropping it. `hasOnlyKnownKeys`
 * below makes ANY key besides `announcementText`/`precisions` a rejection
 * (`reason: "unknownKey"`) — the same treatment as a wrong TYPE for a
 * known field, not a softer one. Rejection here means `parseDeathNoticeContent`
 * returns `ok: false`, which is exactly what turns `inspectDeathNotice`'s
 * status into `"corrupted"` with `raw` preserved byte-for-byte (see that
 * function below) — never a `"valid"` result quietly missing a key that
 * was actually there.
 */
export function parseDeathNoticeContent(raw: unknown): DeathNoticeValidationResult {
  if (raw === null || raw === undefined) {
    return { ok: true, deathNotice: { ...EMPTY_DEATH_NOTICE_CONTENT } };
  }
  if (!isPlainObject(raw)) {
    return { ok: false, reason: "not_an_object" };
  }
  if (!hasOnlyKnownKeys(raw, DEATH_NOTICE_KEYS)) {
    return { ok: false, reason: "unknownKey" };
  }

  const announcementText = parseOptionalText(raw.announcementText);
  if (announcementText === INVALID) return { ok: false, reason: "announcementText" };

  const precisions = parsePrecisions(raw.precisions);
  if (precisions === INVALID) {
    // A malformed `precisions` object could fail for a specific field or
    // for not being an object at all; parsePrecisions already collapses
    // those into one INVALID sentinel, and "precisions" is precise
    // enough here — a caller wanting the exact field re-parses `raw.precisions`
    // itself if it needs that level of detail (mirrors how a caller
    // wanting HeroCrop's own failure detail re-parses it directly).
    return { ok: false, reason: "precisions" };
  }

  return { ok: true, deathNotice: { announcementText, precisions } };
}

/**
 * Validates a `DeathNoticeContent` a caller already built (e.g. via the
 * `set*` helpers below) before it is written back to the draft. Reuses
 * `parseDeathNoticeContent` rather than duplicating its rules — mirrors
 * lib/memorial/hero.ts's `validateHero`.
 */
export function validateDeathNotice(deathNotice: DeathNoticeContent): DeathNoticeValidationResult {
  return parseDeathNoticeContent(deathNotice);
}

// ---------------------------------------------------------------------
// Draft integration — inspectDeathNotice / readDeathNotice / writeDeathNotice
// (mission brief, section 8: reusing Mission 031's tolerant-inspection
// doctrine).
// ---------------------------------------------------------------------

/**
 * The three ways a draft's `content.deathNotice` can actually be found,
 * kept distinct on purpose — identical shape to lib/memorial/hero.ts's
 * `HeroReadResult`:
 *
 *   - `"absent"`     no `deathNotice` key at all — a brand-new draft, a
 *                    `remembrance` draft, or an `announcement` draft that
 *                    hasn't reached A01 yet. Perfectly normal.
 *   - `"valid"`      parsed successfully.
 *   - `"corrupted"`  a `deathNotice` key exists but is NOT a well-formed
 *                    `DeathNoticeContent` — real, existing data that
 *                    failed validation, not an empty field. This INCLUDES
 *                    an otherwise well-formed object that carries any key
 *                    beyond `announcementText`/`precisions` (or, inside
 *                    `precisions`, beyond its own five known ones) — the
 *                    QG closure rule (`parseDeathNoticeContent`'s own
 *                    docstring): an unknown key is never silently dropped
 *                    nor silently accepted as canonical, it makes the
 *                    WHOLE value `"corrupted"`. `raw` is the untouched
 *                    original value — the unknown key included, exactly
 *                    as it was — specifically so a write path can decide
 *                    what to do with it instead of it silently vanishing.
 *
 * This is the primitive Mission 039's future write/autosave path MUST
 * branch on, imperatively, before ever calling `writeDeathNotice`:
 *
 *   1. `inspectDeathNotice(content)`
 *   2. if `status === "corrupted"` → refuse the write (surface it, log
 *      it, or offer an explicit repair — never proceed silently)
 *   3. otherwise (`"absent"` or `"valid"`) → modify `.deathNotice` and
 *      call `writeDeathNotice`
 *
 * No future A01/A02 screen may EVER be built on `readDeathNotice(content)`
 * followed by `writeDeathNotice(content, edited)` — that composition is
 * exactly what silently destroys a `"corrupted"` block (see
 * `writeDeathNotice`'s own docstring, which proves this with a test).
 * `readDeathNotice`, below, is for display/edit-seeding ONLY.
 */
export type DeathNoticeReadResult =
  | { status: "absent"; deathNotice: DeathNoticeContent }
  | { status: "valid"; deathNotice: DeathNoticeContent }
  | { status: "corrupted"; raw: unknown };

/**
 * Inspects `content.deathNotice` without collapsing "absent" and
 * "corrupted" into the same outcome (mission brief, section 8's reuse of
 * Mission 031's doctrine: a malformed value is a distinct fact, not a
 * synonym for missing). This is what stands between a real data
 * corruption and a future autosave silently overwriting it: a write path
 * that calls this before saving can refuse to persist a fresh
 * `EMPTY_DEATH_NOTICE_CONTENT`-derived value over a `"corrupted"` one,
 * instead of doing `readDeathNotice()` (which already defaulted it away)
 * followed by an unconditional `writeDeathNotice()`.
 */
export function inspectDeathNotice(content: MemorialContent): DeathNoticeReadResult {
  const raw = content.deathNotice;
  if (raw === null || raw === undefined) {
    return { status: "absent", deathNotice: { ...EMPTY_DEATH_NOTICE_CONTENT } };
  }

  const result = parseDeathNoticeContent(raw);
  return result.ok
    ? { status: "valid", deathNotice: result.deathNotice }
    : { status: "corrupted", raw };
}

/**
 * Reads the Death Notice out of a draft's content, fail-safe (mission
 * brief, section 8): a missing `deathNotice` key reads as an
 * incomplete-but-valid empty Death Notice, and a malformed one reads the
 * SAME way rather than throwing or propagating a bad cast — a corrupt
 * Death Notice must never take down the rest of the draft when the caller
 * only wants something to DISPLAY or edit from.
 *
 * This is a display/edit-seed convenience, built on `inspectDeathNotice`
 * above (which is where "absent" and "corrupted" are still told apart).
 * It is deliberately the WRONG function to call right before a write:
 * `readDeathNotice` then `writeDeathNotice` would silently replace a
 * `"corrupted"` stored value with a fresh empty one and no record that
 * anything was ever wrong. A future autosave/save path (Mission 039) must
 * use `inspectDeathNotice` instead — mirrors lib/memorial/hero.ts's
 * `readHero`/`inspectHero` split exactly.
 */
export function readDeathNotice(content: MemorialContent): DeathNoticeContent {
  const result = inspectDeathNotice(content);
  return result.status === "corrupted" ? { ...EMPTY_DEATH_NOTICE_CONTENT } : result.deathNotice;
}

/**
 * Writes a Death Notice back into a draft's content, preserving every
 * OTHER section's content untouched (a plain shallow merge —
 * `content.deathNotice` is the only key this ever touches; `content.hero`,
 * `content.story`, etc. are all passed through exactly as given). Whole-
 * content, last-write-wins, same as `DraftRepository.saveDraftContent`
 * (lib/adapters/draft-repository.ts) this is meant to feed: this function
 * does not itself validate `deathNotice` — call `validateDeathNotice`
 * first, the same way a Server Action validates form input before
 * persisting it, and the same discipline lib/memorial/hero.ts's
 * `updateHero` already follows.
 *
 * QG micro-audit correction: this function has NO notion of "corrupted"
 * and never consults `inspectDeathNotice`. It unconditionally REPLACES
 * whatever `content.deathNotice` held before — corrupted or not — with
 * whatever `deathNotice` it is given, exactly like `updateHero`. It does
 * NOT, by itself, protect a `"corrupted"` stored value from being
 * silently lost. Concretely: `writeDeathNotice(content, readDeathNotice(content))`
 * (or any edit built on top of `readDeathNotice`'s result) DOES silently
 * discard a `"corrupted"` raw value the instant it is called — this is
 * exactly the composition `readDeathNotice`'s own docstring calls "the
 * WRONG function to call right before a write". The only real guard
 * lives at the CALLER: branch on `inspectDeathNotice(content).status`
 * first, and refuse (or explicitly resolve) a `"corrupted"` result before
 * ever reaching this function — the same discipline
 * lib/builder/guided-flow/hero-step.ts applies via `inspectHero` before
 * every one of its Hero field writes. This mission does not itself build
 * that guarded, `MemorialContent`-level write helper for the Death Notice
 * (there is no A01/A02 screen yet to call it) — composing `inspectDeathNotice`
 * with this function safely is Mission 039's job, mirroring
 * `hero-step.ts`'s own `writeDisplayName`/`commitPageA` pattern exactly.
 *
 * This function does still guarantee the one thing its name promises: it
 * never reads or depends on `editorial_context`, and it never touches any
 * key other than `deathNotice` — see this module's own "context safety"
 * docstring above.
 */
export function writeDeathNotice(
  content: MemorialContent,
  deathNotice: DeathNoticeContent,
): MemorialContent {
  return { ...content, deathNotice };
}

// ---------------------------------------------------------------------
// Pure field-update helpers (for Mission 039's A01/A02 screens to call —
// this mission builds none of those screens itself, only the operations
// they will need, mirroring lib/memorial/hero.ts's own T03-T07 helpers).
// ---------------------------------------------------------------------

export type DeathNoticeUpdateResult =
  | { ok: true; deathNotice: DeathNoticeContent }
  | { ok: false; reason: DeathNoticeValidationReason };

/** A01 — sets `announcementText`. A blanks-only value normalizes to
 * `null` (incomplete), never rejected — mirrors `setHeroDisplayName`. */
export function setDeathNoticeAnnouncementText(
  deathNotice: DeathNoticeContent,
  value: string | null,
): DeathNoticeContent {
  return {
    ...deathNotice,
    announcementText: value === null ? null : normalizeOptionalText(value),
  };
}

/**
 * A02 — sets one precision field at a time, leaving the other four (and
 * `announcementText`) untouched. A blanks-only value normalizes to `null`
 * (that one precision left out), never rejected — every precision is
 * genuinely optional (types/death-notice.ts). Keeping this as ONE
 * generic setter parametrized by field name (rather than five near-
 * identical `setDeathNoticeGeneralLocation`/`setDeathNoticeFamilyMessage`/...
 * functions) avoids five copies of the exact same three lines; the
 * `DeathNoticePrecisionField` union below is what keeps callers, and this
 * function's own exhaustiveness, tied to the same five named fields
 * types/death-notice.ts declares — nothing here accepts an arbitrary
 * string key.
 *
 * Deliberately NOT `keyof DeathNoticePrecisions`: that type's own index
 * signature (`[key: string]: unknown` — the same structural-assignability
 * device `HeroContent` uses, types/hero.ts) would widen `keyof` to
 * `string | number`, silently accepting any key again. Restated as its
 * own explicit literal union instead, so only the five real precisions
 * type-check.
 */
export type DeathNoticePrecisionField =
  | "generalLocation"
  | "familyMessage"
  | "thought"
  | "quote"
  | "other";

export function setDeathNoticePrecision(
  deathNotice: DeathNoticeContent,
  field: DeathNoticePrecisionField,
  value: string | null,
): DeathNoticeContent {
  return {
    ...deathNotice,
    precisions: {
      ...deathNotice.precisions,
      [field]: value === null ? null : normalizeOptionalText(value),
    },
  };
}
