import type { MemorialContent } from "@/types/memorial";
import { EMPTY_LOVED_THINGS_CONTENT, type LovedThingsContent } from "@/types/loved-things";

/**
 * Mission 044 — parsing, normalization, validation, and draft integration
 * for "Ce qu'elle aimait" (types/loved-things.ts), the A11 matière of the
 * single "Quelques mots sur la personne" sheet. Pure, framework-free,
 * no I/O — mirrors `lib/memorial/person-words.ts` (A10) line for line,
 * because A11 shares A10's exact shape and doctrine (see that file's own
 * docstring for the full reasoning: content-key choice, context safety,
 * no Auth/Owner dependency). `content.lovedThings` is A11's own sibling
 * key, read/written through the exact same
 * `content.guidedFlow`-style local widening this module needs for a
 * non-`SectionId` key.
 */

interface LovedThingsBearingContent {
  lovedThings?: unknown;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeText(value: string): string {
  return value.trim();
}

function hasOnlyKnownKeys(raw: Record<string, unknown>, knownKeys: ReadonlySet<string>): boolean {
  return Object.keys(raw).every((key) => knownKeys.has(key));
}

const LOVED_THINGS_KEYS: ReadonlySet<string> = new Set(["text"]);

export type LovedThingsValidationReason = "not_an_object" | "unknownKey" | "text";

export type LovedThingsValidationResult =
  | { ok: true; lovedThings: LovedThingsContent }
  | { ok: false; reason: LovedThingsValidationReason };

/**
 * Mirrors `parsePersonWordsContent` exactly (same absent/valid/corrupted
 * rules, same blanks-only-normalizes-to-null exception) for
 * `content.lovedThings`.
 */
export function parseLovedThingsContent(raw: unknown): LovedThingsValidationResult {
  if (raw === null || raw === undefined) {
    return { ok: true, lovedThings: { ...EMPTY_LOVED_THINGS_CONTENT } };
  }
  if (!isPlainObject(raw)) {
    return { ok: false, reason: "not_an_object" };
  }
  if (!hasOnlyKnownKeys(raw, LOVED_THINGS_KEYS)) {
    return { ok: false, reason: "unknownKey" };
  }

  if (raw.text !== null && raw.text !== undefined && typeof raw.text !== "string") {
    return { ok: false, reason: "text" };
  }
  const text = raw.text === null || raw.text === undefined ? null : normalizeText(raw.text) || null;

  return { ok: true, lovedThings: { text } };
}

export function validateLovedThings(lovedThings: LovedThingsContent): LovedThingsValidationResult {
  return parseLovedThingsContent(lovedThings);
}

// ---------------------------------------------------------------------
// Draft integration — inspectLovedThings / readLovedThings /
// writeLovedThings (mirrors lib/memorial/person-words.ts's own
// inspect/read/write split).
// ---------------------------------------------------------------------

export type LovedThingsReadResult =
  | { status: "absent"; lovedThings: LovedThingsContent }
  | { status: "valid"; lovedThings: LovedThingsContent }
  | { status: "corrupted"; raw: unknown };

/** Every write in this module (and in the combined sheet that composes
 * it) branches on this FIRST — the same discipline every other content
 * model in this codebase applies. */
export function inspectLovedThings(content: MemorialContent): LovedThingsReadResult {
  const raw = (content as LovedThingsBearingContent).lovedThings;
  if (raw === null || raw === undefined) {
    return { status: "absent", lovedThings: { ...EMPTY_LOVED_THINGS_CONTENT } };
  }

  const result = parseLovedThingsContent(raw);
  return result.ok
    ? { status: "valid", lovedThings: result.lovedThings }
    : { status: "corrupted", raw };
}

/** Fail-safe read: a missing or malformed `lovedThings` both read as
 * empty rather than throwing. Not the function to call right before a
 * write — see `writeLovedThings`'s own docstring. */
export function readLovedThings(content: MemorialContent): LovedThingsContent {
  const result = inspectLovedThings(content);
  return result.status === "corrupted" ? { text: null } : result.lovedThings;
}

/** Unconditionally replaces `content.lovedThings`, preserving every other
 * content key. The caller is the one place that must branch on
 * `inspectLovedThings(content).status` first (see
 * lib/builder/guided-flow/person-sheet-step.ts). */
export function writeLovedThings(content: MemorialContent, lovedThings: LovedThingsContent): MemorialContent {
  return { ...content, lovedThings } as MemorialContent;
}

/** Sets `text` alone — the only field this model carries. `null`/a
 * blanks-only string both normalize to `null`. */
export function setLovedThingsText(lovedThings: LovedThingsContent, value: string | null): LovedThingsContent {
  const text = value === null ? null : normalizeText(value) || null;
  return { ...lovedThings, text };
}
