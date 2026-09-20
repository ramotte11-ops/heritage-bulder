import type { MemorialContent } from "@/types/memorial";
import { EMPTY_PERSON_WORDS_CONTENT, type PersonWordsContent } from "@/types/person-words";

/**
 * Mission 043 — parsing, normalization, validation, and draft integration
 * for "Quelques mots sur la personne" (types/person-words.ts), plus its
 * integration with the existing draft model (`memorial_drafts.content` —
 * see lib/adapters/draft-repository.ts). Pure, framework-free, no I/O:
 * the exact same discipline as lib/memorial/traditions.ts and
 * lib/memorial/ceremony.ts, which this file mirrors wherever the models
 * share a rule.
 *
 * ## Why `content.personWords`, not `content.story`, and not a dedicated
 * table
 *
 * See types/person-words.ts's own docstring for the full reasoning: this
 * mission stores A10 at a NEW content key that is deliberately NOT a
 * `SectionId` — the same device `content.guidedFlow`
 * (lib/builder/guided-flow/flow-state.ts) already uses for real,
 * persisted content that is not yet tied to any Memorial section/
 * rendering decision. `MemorialContent` (types/memorial.ts) is typed as
 * `Partial<Record<SectionId, MemorialSectionContent>>`, so reading/
 * writing a non-`SectionId` key needs the exact same narrow, local
 * widening `flow-state.ts` already uses — never a change to
 * `MemorialContent`'s own type, never a new `SectionId`.
 *
 * ## Context safety
 *
 * Nothing in this module takes an `EditorialContext` parameter or
 * branches on one — `inspectPersonWords`/`readPersonWords`/
 * `writePersonWords` operate purely on `content.personWords`, regardless
 * of whatever context the memorial happens to be in right now. A10 only
 * ever being SHOWN in `announcement` is entirely
 * `lib/builder/guided-flow/person-sheet-step.ts` (Mission 044's combined
 * A10+A11+A12 sheet, replacing Mission 043's own A10-only
 * `person-words-step.ts`) / `human-steps.ts`'s concern (mirrors
 * `traditions.ts`'s own "context safety" doctrine).
 *
 * ## No Auth/Owner dependency, no I/O
 *
 * No function below takes a session, an owner id, or performs any I/O —
 * pure content transforms only, same discipline as every other content
 * model in this codebase.
 */

/** The one extra key this module reads/writes on top of the ordinary
 * `MemorialContent` shape — never exposed outside this module; callers
 * only ever see plain `MemorialContent` in and out. Mirrors
 * `flow-state.ts`'s own `GuidedFlowContent` device exactly. */
interface PersonWordsBearingContent {
  personWords?: unknown;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Peripheral whitespace only, exactly like lib/memorial/ceremony.ts's
 * own `normalizeOptionalText` — casing, accents and punctuation are the
 * family's own choice. */
function normalizeText(value: string): string {
  return value.trim();
}

/** QG closure — the canonical model is CLOSED to known keys only.
 * Mirrors lib/memorial/traditions.ts's own `hasOnlyKnownKeys`
 * discipline exactly. */
function hasOnlyKnownKeys(raw: Record<string, unknown>, knownKeys: ReadonlySet<string>): boolean {
  return Object.keys(raw).every((key) => knownKeys.has(key));
}

const PERSON_WORDS_KEYS: ReadonlySet<string> = new Set(["text"]);

/** Which part of a `PersonWordsContent` candidate failed. Not a
 * user-facing message — Mission 043's own screen chooses its own
 * wording; this is only precise enough for a caller (and a test) to
 * tell failures apart. */
export type PersonWordsValidationReason = "not_an_object" | "unknownKey" | "text";

export type PersonWordsValidationResult =
  | { ok: true; personWords: PersonWordsContent }
  | { ok: false; reason: PersonWordsValidationReason };

/**
 * The one place that turns an untrusted value (raw JSON out of
 * `memorial_drafts.content.personWords`, or a `PersonWordsContent` a
 * caller built by hand) into either a known-good `PersonWordsContent` or
 * a specific rejection. Mirrors lib/memorial/traditions.ts's
 * `parseTraditionsContent`.
 *
 * `undefined`/`null` (no `personWords` key at all — every `remembrance`
 * draft, and any `announcement` draft that hasn't reached A10 yet) parses
 * to `EMPTY_PERSON_WORDS_CONTENT`. Any other non-object input, any
 * unknown key, or a `text` that is neither `null` nor a string rejects
 * the WHOLE value — never silently dropped, never silently accepted as
 * canonical. A blanks-only `text` string normalizes to `null` (mirrors
 * `HeroContent`'s own text fields) rather than being rejected — the
 * family typing then deleting everything is not corruption.
 */
export function parsePersonWordsContent(raw: unknown): PersonWordsValidationResult {
  if (raw === null || raw === undefined) {
    return { ok: true, personWords: { ...EMPTY_PERSON_WORDS_CONTENT } };
  }
  if (!isPlainObject(raw)) {
    return { ok: false, reason: "not_an_object" };
  }
  if (!hasOnlyKnownKeys(raw, PERSON_WORDS_KEYS)) {
    return { ok: false, reason: "unknownKey" };
  }

  if (raw.text !== null && raw.text !== undefined && typeof raw.text !== "string") {
    return { ok: false, reason: "text" };
  }
  const text = raw.text === null || raw.text === undefined ? null : normalizeText(raw.text) || null;

  return { ok: true, personWords: { text } };
}

/** Validates a `PersonWordsContent` a caller already built before it is
 * written back to the draft. Reuses `parsePersonWordsContent` rather
 * than duplicating its rules. */
export function validatePersonWords(personWords: PersonWordsContent): PersonWordsValidationResult {
  return parsePersonWordsContent(personWords);
}

// ---------------------------------------------------------------------
// Draft integration — inspectPersonWords / readPersonWords /
// writePersonWords (mirrors lib/memorial/traditions.ts's own
// inspect/read/write split).
// ---------------------------------------------------------------------

export type PersonWordsReadResult =
  | { status: "absent"; personWords: PersonWordsContent }
  | { status: "valid"; personWords: PersonWordsContent }
  | { status: "corrupted"; raw: unknown };

/**
 * Inspects `content.personWords` without collapsing "absent" and
 * "corrupted" into the same outcome. Every write below branches on this
 * FIRST — the same discipline
 * lib/builder/guided-flow/traditions-step.ts's own module docstring
 * mandates for A09 writes.
 */
export function inspectPersonWords(content: MemorialContent): PersonWordsReadResult {
  const raw = (content as PersonWordsBearingContent).personWords;
  if (raw === null || raw === undefined) {
    return { status: "absent", personWords: { ...EMPTY_PERSON_WORDS_CONTENT } };
  }

  const result = parsePersonWordsContent(raw);
  return result.ok
    ? { status: "valid", personWords: result.personWords }
    : { status: "corrupted", raw };
}

/**
 * Reads "Quelques mots sur la personne" out of a draft's content,
 * fail-safe: a missing `personWords` key reads as empty (but valid), and
 * a malformed one reads the SAME way rather than throwing. A display/
 * edit-seed convenience only — the WRONG function to call right before a
 * write (see `writePersonWords`'s own docstring and
 * lib/memorial/traditions.ts's identical warning on `readTraditions`).
 */
export function readPersonWords(content: MemorialContent): PersonWordsContent {
  const result = inspectPersonWords(content);
  return result.status === "corrupted" ? { text: null } : result.personWords;
}

/**
 * Writes "Quelques mots sur la personne" back into a draft's content,
 * preserving every OTHER content key untouched (a plain shallow merge).
 * Has NO notion of "corrupted" and never consults `inspectPersonWords` —
 * it unconditionally REPLACES whatever `content.personWords` held
 * before. The only real guard lives at the CALLER: branch on
 * `inspectPersonWords(content).status` first (see
 * lib/builder/guided-flow/person-sheet-step.ts, which is the one place
 * this function is ever composed with a write).
 */
export function writePersonWords(content: MemorialContent, personWords: PersonWordsContent): MemorialContent {
  return { ...content, personWords } as MemorialContent;
}

/** Sets `text` alone — the only field this model carries. `null`/a
 * blanks-only string both normalize to `null` (never rejected: A10 is
 * facultative, and a family clearing their own text is not an error). */
export function setPersonWordsText(personWords: PersonWordsContent, value: string | null): PersonWordsContent {
  const text = value === null ? null : normalizeText(value) || null;
  return { ...personWords, text };
}
