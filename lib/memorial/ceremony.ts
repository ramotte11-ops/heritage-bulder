import type { MemorialContent } from "@/types/memorial";
import { EMPTY_CEREMONY_CONTENT, type CeremonyContent } from "@/types/ceremony";

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

/** QG closure — the canonical model is CLOSED to the six keys named
 * below. Mirrors lib/memorial/death-notice.ts's own
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

  return { ok: true, ceremony: { date, time, venueName, address, access, note } };
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
  return { ...content, ceremony };
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
