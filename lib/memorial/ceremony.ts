import type { MemorialContent } from "@/types/memorial";
import { EMPTY_CEREMONY_CONTENT, type CeremonyContent, type CeremonyMoment } from "@/types/ceremony";

/**
 * Mission 040 — parsing, normalization, validation, and draft integration
 * for the Ceremony (types/ceremony.ts), plus its integration with the
 * existing draft model (`memorial_drafts.content` — see
 * lib/adapters/draft-repository.ts). Pure, framework-free, no I/O: the
 * exact same discipline as lib/memorial/death-notice.ts, which this file
 * mirrors field-for-field wherever the two models share a rule.
 *
 * ## Why `draft.content.ceremony`, not a dedicated table
 *
 * `config/sections.ts` already reserves `"ceremony"` as a `SectionId`
 * (optional in `announcement`, absent from `remembrance`), and
 * `lib/memorial/section-selection.ts` already ties its relevance to A04's
 * own answer (Mission 027). The ceremony's own fields (date, time, venue,
 * address, access, note) are editorial content the family edits and
 * autosaves progressively, exactly like the Death Notice — no migration,
 * no new table, no new columns.
 *
 * ## Context safety
 *
 * Nothing in this module takes an `EditorialContext` parameter or
 * branches on one — `inspectCeremony`/`readCeremony`/`writeCeremony`
 * operate purely on `content.ceremony`, regardless of whatever context
 * the memorial happens to be in right now. A family that temporarily
 * switches `editorialContext` away from `"announcement"` and back never
 * loses `content.ceremony`; `remembrance` never has it injected (nothing
 * in that context's own section list includes `"ceremony"`, and
 * `section-selection.ts` already resolves it to `"notRelevant"` there
 * unconditionally, independently of this module).
 *
 * ## No Auth/Owner dependency
 *
 * No function below takes a session, an owner id, or performs any I/O.
 */

const INVALID = Symbol("ceremony:invalid");
type Parsed<T> = T | typeof INVALID;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Peripheral whitespace only, exactly like
 * lib/memorial/death-notice.ts's own `normalizeOptionalText` — casing,
 * accents and punctuation are the family's own choice. A blanks-only
 * string normalizes to `null` (absent), never invalid. */
function normalizeOptionalText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function parseOptionalText(raw: unknown): Parsed<string | null> {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "string") return INVALID;
  return normalizeOptionalText(raw);
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Rejects a syntactically-shaped but impossible calendar date (e.g.
 * `"2026-02-30"`) — a native `<input type="date">` never emits one, but
 * a corrupted or hand-edited value could. Mirrors, in spirit,
 * lib/memorial/hero.ts's own chronology guard: fail closed on data that
 * cannot possibly be real, rather than silently accepting it. */
function isRealCalendarDate(value: string): boolean {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function parseDate(raw: unknown): Parsed<string | null> {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "string") return INVALID;
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  if (!DATE_PATTERN.test(trimmed) || !isRealCalendarDate(trimmed)) return INVALID;
  return trimmed;
}

function parseTime(raw: unknown): Parsed<string | null> {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "string") return INVALID;
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  if (!TIME_PATTERN.test(trimmed)) return INVALID;
  return trimmed;
}

/** QG closure — the canonical model is CLOSED to the keys named below
 * (the six A05-A08 fields, plus Cérémonie V2's facultative `programme`).
 * Mirrors lib/memorial/death-notice.ts's own
 * `hasOnlyKnownKeys`/`DEATH_NOTICE_KEYS` discipline exactly. */
function hasOnlyKnownKeys(raw: Record<string, unknown>, knownKeys: ReadonlySet<string>): boolean {
  return Object.keys(raw).every((key) => knownKeys.has(key));
}

const CEREMONY_KEYS: ReadonlySet<string> = new Set([
  "date",
  "time",
  "venueName",
  "address",
  "access",
  "note",
  "programme",
]);

/** Which part of a `CeremonyContent` candidate failed. Not a
 * user-facing message — Mission 040's own screens choose their own
 * wording; this is only precise enough for a caller (and a test) to
 * tell failures apart. */
export type CeremonyValidationReason =
  | "not_an_object"
  | "unknownKey"
  | "date"
  | "time"
  | "venueName"
  | "address"
  | "access"
  | "note";

export type CeremonyValidationResult =
  | { ok: true; ceremony: CeremonyContent }
  | { ok: false; reason: CeremonyValidationReason };

/**
 * The one place that turns an untrusted value (raw JSON out of
 * `memorial_drafts.content.ceremony`, or a `CeremonyContent` a caller
 * built by hand) into either a known-good `CeremonyContent` or a
 * specific rejection. Never casts — every field is individually checked,
 * mirroring lib/memorial/death-notice.ts's `parseDeathNoticeContent`.
 *
 * `undefined`/`null` (no `ceremony` key at all — every `remembrance`
 * draft, and any `announcement` draft that hasn't reached A04 yet, or
 * whose A04 answer is "no"/"undecided") parses to
 * `EMPTY_CEREMONY_CONTENT`. Any other non-object input is rejected as
 * `"not_an_object"`. An object carrying any key besides the six known
 * ones is rejected as `"unknownKey"` — never silently dropped, never
 * silently accepted as canonical.
 */
export function parseCeremonyContent(raw: unknown): CeremonyValidationResult {
  if (raw === null || raw === undefined) {
    return { ok: true, ceremony: { ...EMPTY_CEREMONY_CONTENT } };
  }
  if (!isPlainObject(raw)) {
    return { ok: false, reason: "not_an_object" };
  }
  if (!hasOnlyKnownKeys(raw, CEREMONY_KEYS)) {
    return { ok: false, reason: "unknownKey" };
  }

  const date = parseDate(raw.date);
  if (date === INVALID) return { ok: false, reason: "date" };

  const time = parseTime(raw.time);
  if (time === INVALID) return { ok: false, reason: "time" };

  const venueName = parseOptionalText(raw.venueName);
  if (venueName === INVALID) return { ok: false, reason: "venueName" };

  const address = parseOptionalText(raw.address);
  if (address === INVALID) return { ok: false, reason: "address" };

  const access = parseOptionalText(raw.access);
  if (access === INVALID) return { ok: false, reason: "access" };

  const note = parseOptionalText(raw.note);
  if (note === INVALID) return { ok: false, reason: "note" };

  // `programme` never invalidates the ceremony: see `inspectProgramme`.
  return { ok: true, ceremony: withProgramme({ date, time, venueName, address, access, note }, inspectProgramme(raw.programme).moments) };
}

/** Validates a `CeremonyContent` a caller already built (e.g. via the
 * `set*` helpers below) before it is written back to the draft. Reuses
 * `parseCeremonyContent` rather than duplicating its rules. */
export function validateCeremony(ceremony: CeremonyContent): CeremonyValidationResult {
  return parseCeremonyContent(ceremony);
}

// ---------------------------------------------------------------------
// Draft integration — inspectCeremony / readCeremony / writeCeremony
// (mirrors lib/memorial/death-notice.ts's own inspect/read/write split).
// ---------------------------------------------------------------------

/** The three ways a draft's `content.ceremony` can actually be found,
 * kept distinct on purpose — identical shape to
 * lib/memorial/death-notice.ts's `DeathNoticeReadResult`. */
export type CeremonyReadResult =
  | { status: "absent"; ceremony: CeremonyContent }
  | { status: "valid"; ceremony: CeremonyContent }
  | { status: "corrupted"; raw: unknown };

/**
 * Inspects `content.ceremony` without collapsing "absent" and
 * "corrupted" into the same outcome. This is what stands between a real
 * data corruption and a future autosave silently overwriting it — every
 * write below branches on this FIRST, exactly the discipline
 * lib/builder/guided-flow/death-notice-step.ts's own module docstring
 * mandates for A01/A02 writes.
 */
export function inspectCeremony(content: MemorialContent): CeremonyReadResult {
  const raw = content.ceremony;
  if (raw === null || raw === undefined) {
    return { status: "absent", ceremony: { ...EMPTY_CEREMONY_CONTENT } };
  }

  const result = parseCeremonyContent(raw);
  return result.ok
    ? { status: "valid", ceremony: result.ceremony }
    : { status: "corrupted", raw };
}

/**
 * Reads the Ceremony out of a draft's content, fail-safe: a missing
 * `ceremony` key reads as an incomplete-but-valid empty Ceremony, and a
 * malformed one reads the SAME way rather than throwing. A
 * display/edit-seed convenience only — the WRONG function to call right
 * before a write (see `writeCeremony`'s own docstring and
 * lib/memorial/death-notice.ts's identical warning on `readDeathNotice`).
 */
export function readCeremony(content: MemorialContent): CeremonyContent {
  const result = inspectCeremony(content);
  return result.status === "corrupted" ? { ...EMPTY_CEREMONY_CONTENT } : result.ceremony;
}

/**
 * Writes a Ceremony back into a draft's content, preserving every OTHER
 * section's content untouched (a plain shallow merge). Has NO notion of
 * "corrupted" and never consults `inspectCeremony` — it unconditionally
 * REPLACES whatever `content.ceremony` held before. The only real guard
 * lives at the CALLER: branch on `inspectCeremony(content).status` first
 * (see lib/builder/guided-flow/ceremony-step.ts, which is the one place
 * this function is ever composed with a write).
 */
export function writeCeremony(content: MemorialContent, ceremony: CeremonyContent): MemorialContent {
  const next = withProgramme(ceremony, ceremony.programme ?? []);
  // A stored déroulement that holds an invalid moment is never rewritten
  // from its readable subset: that would silently delete the invalid
  // moment. It is kept verbatim until an explicit repair
  // (`discardInvalidCeremonyMoments`). See « Le déroulement » below.
  const stored = isPlainObject(content.ceremony) ? content.ceremony.programme : undefined;
  if (!inspectProgramme(stored).intact) {
    return { ...content, ceremony: { ...withProgramme(next, []), programme: stored } };
  }
  return { ...content, ceremony: next };
}

// ---------------------------------------------------------------------
// Pure field-update helpers (for Mission 040's A05-A08 screens to call).
// ---------------------------------------------------------------------

export function setCeremonyDate(ceremony: CeremonyContent, value: string | null): CeremonyContent {
  return { ...ceremony, date: value === null ? null : value.trim() === "" ? null : value.trim() };
}

export function setCeremonyTime(ceremony: CeremonyContent, value: string | null): CeremonyContent {
  return { ...ceremony, time: value === null ? null : value.trim() === "" ? null : value.trim() };
}

export function setCeremonyVenueName(ceremony: CeremonyContent, value: string | null): CeremonyContent {
  return { ...ceremony, venueName: value === null ? null : normalizeOptionalText(value) };
}

export function setCeremonyAddress(ceremony: CeremonyContent, value: string | null): CeremonyContent {
  return { ...ceremony, address: value === null ? null : normalizeOptionalText(value) };
}

export function setCeremonyAccess(ceremony: CeremonyContent, value: string | null): CeremonyContent {
  return { ...ceremony, access: value === null ? null : normalizeOptionalText(value) };
}

export function setCeremonyNote(ceremony: CeremonyContent, value: string | null): CeremonyContent {
  return { ...ceremony, note: value === null ? null : normalizeOptionalText(value) };
}

// ---------------------------------------------------------------------
// Cérémonie V2 (B1) — « Le déroulement » (`programme`).
// ---------------------------------------------------------------------
//
// ## Arbitrage : un moment invalide n'emporte ni la Cérémonie, ni les
// autres moments
//
// Every other field of this model follows the house rule « une valeur
// malformée rend l'ensemble corrompu » (and the ceremony's corrupted
// status hides the whole section). Applied to a free-length list, that
// rule would let ONE bad moment hide the date, the venue and every other
// moment. The QG arbitration (GO B1) is therefore narrower, without
// giving up the rule that matters most — nothing is ever silently
// deleted:
//
//   - reading is tolerant PER MOMENT: a malformed moment (unknown key,
//     blank label, bad time, duplicate id…) is skipped; every valid
//     moment stays readable, in the family's order. A `programme` that
//     is not an array reads as no moment at all. Neither case makes the
//     ceremony `"corrupted"`;
//   - writing is conservative: while the STORED `programme` holds
//     anything unreadable, `writeCeremony` keeps it verbatim (the six
//     fields still save normally), so the invalid moment and its valid
//     neighbours survive any autosave; the readable subset only replaces
//     it through the explicit `discardInvalidCeremonyMoments`, a family
//     (or support) action — never a side effect;
//   - an empty déroulement is never written: the `programme` key is
//     omitted, so a ceremony without moments keeps its six-key shape.
//
// All writes go through the validated helpers below, so an invalid
// stored moment can only come from a bug or a hand edit: this keeps that
// rare case safe without a migration or a compatibility layer.

const MOMENT_KEYS: ReadonlySet<string> = new Set(["id", "time", "label", "detail"]);

/** One stored moment, or `INVALID`. Same field rules as the six fields
 * above: peripheral whitespace trimmed, blanks-only optional text →
 * `null`, time as A05's `"HH:MM"`; `label` is required and non-blank. */
function parseMoment(raw: unknown): Parsed<CeremonyMoment> {
  if (!isPlainObject(raw) || !hasOnlyKnownKeys(raw, MOMENT_KEYS)) return INVALID;
  if (typeof raw.id !== "string" || raw.id.trim() === "") return INVALID;
  const time = parseTime(raw.time);
  if (time === INVALID) return INVALID;
  if (typeof raw.label !== "string") return INVALID;
  const label = normalizeOptionalText(raw.label);
  if (label === null) return INVALID;
  const detail = parseOptionalText(raw.detail);
  if (detail === INVALID) return INVALID;
  return { id: raw.id, time, label, detail };
}

interface ProgrammeInspection {
  /** Every readable moment, in stored order. A repeated `id` keeps its
   * first occurrence only. */
  moments: CeremonyMoment[];
  /** `true` when the stored value is absent, or an array whose every
   * element is a readable moment with a unique id. */
  intact: boolean;
}

function inspectProgramme(raw: unknown): ProgrammeInspection {
  if (raw === null || raw === undefined) return { moments: [], intact: true };
  if (!Array.isArray(raw)) return { moments: [], intact: false };
  const moments: CeremonyMoment[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const moment = parseMoment(item);
    if (moment === INVALID || seen.has(moment.id)) continue;
    seen.add(moment.id);
    moments.push(moment);
  }
  return { moments, intact: moments.length === raw.length };
}

/** `ceremony` with `programme` set to `moments` — or WITHOUT the key
 * when there is none (never an empty list). */
function withProgramme(ceremony: CeremonyContent, moments: readonly CeremonyMoment[]): CeremonyContent {
  const { programme: _previous, ...rest } = ceremony;
  void _previous;
  return moments.length === 0 ? (rest as CeremonyContent) : { ...rest, programme: moments };
}

/** The déroulement, in the family's order; `[]` when there is none. */
export function readCeremonyProgramme(ceremony: CeremonyContent): readonly CeremonyMoment[] {
  return ceremony.programme ?? [];
}

/** `false` when the draft's stored `programme` holds something
 * unreadable: until an explicit `discardInvalidCeremonyMoments`, edits to
 * the déroulement must be refused (B2), since `writeCeremony` keeps the
 * stored value verbatim. */
export function isCeremonyProgrammeIntact(content: MemorialContent): boolean {
  return inspectProgramme(isPlainObject(content.ceremony) ? content.ceremony.programme : undefined).intact;
}

/** Explicit repair: replaces a damaged stored `programme` by its readable
 * moments (or removes the key when none is readable). Never called
 * implicitly. A corrupted ceremony (one of the six fields) is returned
 * unchanged. */
export function discardInvalidCeremonyMoments(content: MemorialContent): MemorialContent {
  const inspected = inspectCeremony(content);
  if (inspected.status !== "valid") return content;
  return { ...content, ceremony: withProgramme(inspected.ceremony, inspected.ceremony.programme ?? []) };
}

export type CeremonyMomentWriteReason = "id" | "duplicateId" | "time" | "label" | "detail";

export type CeremonyMomentWriteResult =
  | { ok: true; ceremony: CeremonyContent }
  | { ok: false; reason: CeremonyMomentWriteReason };

export interface NewCeremonyMomentInput {
  /** Minted by the caller — never by this module (no clock, no random
   * source here, same discipline as lib/memorial/traditions.ts). */
  id: string;
  time: string | null;
  label: string;
  detail: string | null;
}

function normalizeMomentTime(value: string | null): Parsed<string | null> {
  return parseTime(value);
}

/** Appends a moment at the end of the déroulement. */
export function addCeremonyMoment(ceremony: CeremonyContent, input: NewCeremonyMomentInput): CeremonyMomentWriteResult {
  if (input.id.trim() === "") return { ok: false, reason: "id" };
  const moments = readCeremonyProgramme(ceremony);
  if (moments.some((moment) => moment.id === input.id)) return { ok: false, reason: "duplicateId" };
  const time = normalizeMomentTime(input.time);
  if (time === INVALID) return { ok: false, reason: "time" };
  const label = normalizeOptionalText(input.label);
  if (label === null) return { ok: false, reason: "label" };
  const detail = input.detail === null ? null : normalizeOptionalText(input.detail);
  return { ok: true, ceremony: withProgramme(ceremony, [...moments, { id: input.id, time, label, detail }]) };
}

/** Edits one moment in place (its position never changes). Only the
 * fields named in `changes` are touched. */
export function updateCeremonyMoment(
  ceremony: CeremonyContent,
  id: string,
  changes: { time?: string | null; label?: string; detail?: string | null },
): CeremonyMomentWriteResult {
  const moments = readCeremonyProgramme(ceremony);
  const index = moments.findIndex((moment) => moment.id === id);
  if (index === -1) return { ok: false, reason: "id" };
  const current = moments[index];

  let time = current.time;
  if (changes.time !== undefined) {
    const next = normalizeMomentTime(changes.time);
    if (next === INVALID) return { ok: false, reason: "time" };
    time = next;
  }
  let label = current.label;
  if (changes.label !== undefined) {
    const next = normalizeOptionalText(changes.label);
    if (next === null) return { ok: false, reason: "label" };
    label = next;
  }
  let detail = current.detail;
  if (changes.detail !== undefined) {
    detail = changes.detail === null ? null : normalizeOptionalText(changes.detail);
  }

  const next = moments.slice();
  next[index] = { id: current.id, time, label, detail };
  return { ok: true, ceremony: withProgramme(ceremony, next) };
}

/** Removes one moment. Removing an id that does not exist is a harmless
 * no-op; removing the last moment removes the `programme` key. */
export function removeCeremonyMoment(ceremony: CeremonyContent, id: string): CeremonyContent {
  return withProgramme(
    ceremony,
    readCeremonyProgramme(ceremony).filter((moment) => moment.id !== id),
  );
}

/** Moves one moment one place up (earlier) or down (later), swapping it
 * with its neighbour. Unknown id, or already first/last: unchanged. */
export function moveCeremonyMoment(ceremony: CeremonyContent, id: string, direction: "up" | "down"): CeremonyContent {
  const moments = readCeremonyProgramme(ceremony);
  const index = moments.findIndex((moment) => moment.id === id);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || target < 0 || target >= moments.length) return ceremony;
  const next = moments.slice();
  [next[index], next[target]] = [next[target], next[index]];
  return withProgramme(ceremony, next);
}
