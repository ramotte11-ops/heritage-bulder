import type { MemorialContent } from "@/types/memorial";
import { EMPTY_TRADITIONS_CONTENT, type TraditionEntry, type TraditionsContent } from "@/types/traditions";

/**
 * Mission 042 — parsing, normalization, validation, and draft integration
 * for Traditions & repères (types/traditions.ts), plus its integration
 * with the existing draft model (`memorial_drafts.content` — see
 * lib/adapters/draft-repository.ts). Pure, framework-free, no I/O: the
 * exact same discipline as lib/memorial/ceremony.ts, which this file
 * mirrors field-for-field wherever the two models share a rule.
 *
 * ## Why `draft.content.traditions`, not a dedicated table
 *
 * `config/sections.ts` already reserves `"traditions"` as a `SectionId`
 * (optional in `announcement`, absent from `remembrance`) — nothing new
 * to add there. The family's confirmed repères are editorial content
 * they add/edit/remove progressively, exactly like Ceremony or the Death
 * Notice — no migration, no new table, no new columns.
 *
 * ## Context safety
 *
 * Nothing in this module takes an `EditorialContext` parameter or
 * branches on one — `inspectTraditions`/`readTraditions`/`writeTraditions`
 * operate purely on `content.traditions`, regardless of whatever context
 * the memorial happens to be in right now. `remembrance` never has it
 * injected: nothing in that context's own section list includes
 * `"traditions"`, and `section-selection.ts` already resolves it to
 * `"notRelevant"` there unconditionally, independently of this module.
 *
 * ## No Auth/Owner dependency, no I/O, no id generation
 *
 * No function below takes a session, an owner id, performs any I/O, or
 * generates an entry's `id` — the caller (a Client Component) mints it
 * and passes it in, the same dependency-injection discipline
 * lib/media/server-media-engine.ts (`generateMediaId`) already uses for
 * the identical reason: a pure module never calls `crypto.randomUUID()`
 * (or anything else non-deterministic) itself.
 */

const INVALID = Symbol("traditions:invalid");
type Parsed<T> = T | typeof INVALID;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Peripheral whitespace only, exactly like lib/memorial/ceremony.ts's
 * own `normalizeOptionalText` — casing, accents and punctuation are the
 * family's own choice. */
function normalizeText(value: string): string {
  return value.trim();
}

function parseOptionalText(raw: unknown): Parsed<string | null> {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "string") return INVALID;
  const trimmed = normalizeText(raw);
  return trimmed === "" ? null : trimmed;
}

/** QG closure — the canonical model is CLOSED to known keys only.
 * Mirrors lib/memorial/ceremony.ts's own `hasOnlyKnownKeys` discipline
 * exactly. */
function hasOnlyKnownKeys(raw: Record<string, unknown>, knownKeys: ReadonlySet<string>): boolean {
  return Object.keys(raw).every((key) => knownKeys.has(key));
}

const TRADITIONS_KEYS: ReadonlySet<string> = new Set(["entries"]);
const TRADITION_ENTRY_KEYS: ReadonlySet<string> = new Set(["id", "origin", "suggestionId", "title", "text"]);

/** Which part of a `TraditionEntry` (or the enclosing `TraditionsContent`)
 * candidate failed. Not a user-facing message — Mission 042's own screen
 * chooses its own wording; this is only precise enough for a caller (and
 * a test) to tell failures apart. */
export type TraditionsValidationReason =
  | "not_an_object"
  | "unknownKey"
  | "entries"
  | "id"
  | "origin"
  | "suggestionId"
  | "title"
  | "text"
  | "duplicateId";

export type TraditionsValidationResult =
  | { ok: true; traditions: TraditionsContent }
  | { ok: false; reason: TraditionsValidationReason };

type ParsedEntry = Parsed<TraditionEntry>;

/**
 * Parses one entry. Every field individually checked — never a cast.
 * `origin === "custom"` REQUIRES `suggestionId: null` (a custom repère
 * is never retroactively linked to a suggestion — types/traditions.ts's
 * own docstring); `origin === "suggestion"` REQUIRES a non-blank
 * `suggestionId` string (the provenance link this origin exists to
 * carry). `text` must be a non-blank string — an entry with nothing to
 * say is not a valid, persisted repère (mission brief section 13: no
 * incomplete draft silently published as valid content).
 */
function parseTraditionEntry(raw: unknown): ParsedEntry {
  if (!isPlainObject(raw)) return INVALID;
  if (!hasOnlyKnownKeys(raw, TRADITION_ENTRY_KEYS)) return INVALID;

  if (typeof raw.id !== "string" || raw.id.trim() === "") return INVALID;

  if (raw.origin !== "custom" && raw.origin !== "suggestion") return INVALID;

  const suggestionId = parseOptionalText(raw.suggestionId);
  if (suggestionId === INVALID) return INVALID;
  if (raw.origin === "custom" && suggestionId !== null) return INVALID;
  if (raw.origin === "suggestion" && suggestionId === null) return INVALID;

  const title = parseOptionalText(raw.title);
  if (title === INVALID) return INVALID;

  if (typeof raw.text !== "string") return INVALID;
  const text = normalizeText(raw.text);
  if (text === "") return INVALID;

  return { id: raw.id, origin: raw.origin, suggestionId, title, text };
}

/**
 * The one place that turns an untrusted value (raw JSON out of
 * `memorial_drafts.content.traditions`, or a `TraditionsContent` a
 * caller built by hand) into either a known-good `TraditionsContent` or
 * a specific rejection. Mirrors lib/memorial/ceremony.ts's
 * `parseCeremonyContent`.
 *
 * `undefined`/`null` (no `traditions` key at all — every `remembrance`
 * draft, and any `announcement` draft that hasn't reached A09 yet)
 * parses to `EMPTY_TRADITIONS_CONTENT`. Any other non-object input, any
 * unknown key, a non-array `entries`, a duplicate `id` across entries,
 * or any single malformed entry rejects the WHOLE value — never silently
 * dropped, never silently accepted as canonical.
 */
export function parseTraditionsContent(raw: unknown): TraditionsValidationResult {
  if (raw === null || raw === undefined) {
    return { ok: true, traditions: { entries: [] } };
  }
  if (!isPlainObject(raw)) {
    return { ok: false, reason: "not_an_object" };
  }
  if (!hasOnlyKnownKeys(raw, TRADITIONS_KEYS)) {
    return { ok: false, reason: "unknownKey" };
  }
  if (!Array.isArray(raw.entries)) {
    return { ok: false, reason: "entries" };
  }

  const entries: TraditionEntry[] = [];
  const seenIds = new Set<string>();
  for (const rawEntry of raw.entries) {
    const entry = parseTraditionEntry(rawEntry);
    if (entry === INVALID) return { ok: false, reason: "entries" };
    if (seenIds.has(entry.id)) return { ok: false, reason: "duplicateId" };
    seenIds.add(entry.id);
    entries.push(entry);
  }

  return { ok: true, traditions: { entries } };
}

/** Validates a `TraditionsContent` a caller already built before it is
 * written back to the draft. Reuses `parseTraditionsContent` rather than
 * duplicating its rules. */
export function validateTraditions(traditions: TraditionsContent): TraditionsValidationResult {
  return parseTraditionsContent(traditions);
}

// ---------------------------------------------------------------------
// Draft integration — inspectTraditions / readTraditions / writeTraditions
// (mirrors lib/memorial/ceremony.ts's own inspect/read/write split).
// ---------------------------------------------------------------------

export type TraditionsReadResult =
  | { status: "absent"; traditions: TraditionsContent }
  | { status: "valid"; traditions: TraditionsContent }
  | { status: "corrupted"; raw: unknown };

/**
 * Inspects `content.traditions` without collapsing "absent" and
 * "corrupted" into the same outcome. Every write below branches on this
 * FIRST — the same discipline lib/builder/guided-flow/ceremony-step.ts's
 * own module docstring mandates for A04-A08 writes.
 */
export function inspectTraditions(content: MemorialContent): TraditionsReadResult {
  const raw = content.traditions;
  if (raw === null || raw === undefined) {
    return { status: "absent", traditions: { ...EMPTY_TRADITIONS_CONTENT, entries: [] } };
  }

  const result = parseTraditionsContent(raw);
  return result.ok
    ? { status: "valid", traditions: result.traditions }
    : { status: "corrupted", raw };
}

/**
 * Reads Traditions out of a draft's content, fail-safe: a missing
 * `traditions` key reads as an empty (but valid) Traditions list, and a
 * malformed one reads the SAME way rather than throwing. A display/
 * edit-seed convenience only — the WRONG function to call right before a
 * write (see `writeTraditions`'s own docstring and
 * lib/memorial/ceremony.ts's identical warning on `readCeremony`).
 */
export function readTraditions(content: MemorialContent): TraditionsContent {
  const result = inspectTraditions(content);
  return result.status === "corrupted" ? { entries: [] } : result.traditions;
}

/**
 * Writes Traditions back into a draft's content, preserving every OTHER
 * section's content untouched (a plain shallow merge). Has NO notion of
 * "corrupted" and never consults `inspectTraditions` — it unconditionally
 * REPLACES whatever `content.traditions` held before. The only real
 * guard lives at the CALLER: branch on `inspectTraditions(content).status`
 * first (see lib/builder/guided-flow/traditions-step.ts, which is the
 * one place this function is ever composed with a write).
 */
export function writeTraditions(content: MemorialContent, traditions: TraditionsContent): MemorialContent {
  return { ...content, traditions };
}

// ---------------------------------------------------------------------
// Pure entry-level helpers (for the A09 screen to call). Every one
// re-validates its own inputs — never a cast — and never mutates the
// `TraditionsContent` it is given.
// ---------------------------------------------------------------------

export type TraditionsEntryWriteResult =
  | { ok: true; traditions: TraditionsContent }
  | { ok: false; reason: TraditionsValidationReason };

export interface NewTraditionEntryInput {
  /** Minted by the caller — see this module's own docstring on why. */
  id: string;
  origin: "custom" | "suggestion";
  suggestionId: string | null;
  title: string | null;
  text: string;
}

/**
 * Appends one new, already-confirmed repère. `text` must be genuinely
 * non-blank at the moment of the call (mission brief section 13 — a
 * blank/incomplete draft is never appended as if it were a real,
 * confirmed repère) and `id` must not already exist in this list.
 * `origin`/`suggestionId` follow the exact same closed rule
 * `parseTraditionEntry` enforces on read, so a hand-built entry can never
 * silently write something a later read would reject as corrupted.
 */
export function addTraditionEntry(
  traditions: TraditionsContent,
  input: NewTraditionEntryInput,
): TraditionsEntryWriteResult {
  if (input.id.trim() === "") return { ok: false, reason: "id" };
  if (traditions.entries.some((entry) => entry.id === input.id)) return { ok: false, reason: "duplicateId" };

  const text = normalizeText(input.text);
  if (text === "") return { ok: false, reason: "text" };

  const title = input.title === null ? null : normalizeText(input.title) || null;

  if (input.origin === "custom" && input.suggestionId !== null) return { ok: false, reason: "suggestionId" };
  if (input.origin === "suggestion" && (input.suggestionId === null || input.suggestionId.trim() === "")) {
    return { ok: false, reason: "suggestionId" };
  }

  const entry: TraditionEntry = {
    id: input.id,
    origin: input.origin,
    suggestionId: input.suggestionId,
    title,
    text,
  };

  return { ok: true, traditions: { entries: [...traditions.entries, entry] } };
}

/**
 * Updates an existing entry's `title`/`text` in place (never its `id`,
 * `origin` or `suggestionId` — provenance and identity are fixed at
 * creation). `text`, if provided, must remain genuinely non-blank —
 * editing a repère down to nothing is not a supported outcome of this
 * function (removing it is `removeTraditionEntry`'s job instead).
 */
export function updateTraditionEntry(
  traditions: TraditionsContent,
  id: string,
  changes: { title?: string | null; text?: string },
): TraditionsEntryWriteResult {
  const index = traditions.entries.findIndex((entry) => entry.id === id);
  if (index === -1) return { ok: false, reason: "id" };

  let nextText = traditions.entries[index].text;
  if (changes.text !== undefined) {
    const trimmed = normalizeText(changes.text);
    if (trimmed === "") return { ok: false, reason: "text" };
    nextText = trimmed;
  }

  let nextTitle = traditions.entries[index].title;
  if (changes.title !== undefined) {
    nextTitle = changes.title === null ? null : normalizeText(changes.title) || null;
  }

  const entries = [...traditions.entries];
  entries[index] = { ...entries[index], title: nextTitle, text: nextText };

  return { ok: true, traditions: { entries } };
}

/** Removes one entry by id. Removing an id that does not exist is a
 * harmless no-op (never an error) — the same tolerant discipline as
 * every other list-shrinking control in this codebase. */
export function removeTraditionEntry(traditions: TraditionsContent, id: string): TraditionsContent {
  return { entries: traditions.entries.filter((entry) => entry.id !== id) };
}
