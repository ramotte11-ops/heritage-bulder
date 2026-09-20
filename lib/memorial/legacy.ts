import type { MemorialContent } from "@/types/memorial";
import { EMPTY_LEGACY_CONTENT, type LegacyContent } from "@/types/legacy";

/**
 * Mission 044 — parsing, normalization, validation, and draft integration
 * for "Ce qu'elle laisse" (types/legacy.ts), the A12 matière of the single
 * "Quelques mots sur la personne" sheet. Mirrors
 * `lib/memorial/person-words.ts` (A10) / `lib/memorial/loved-things.ts`
 * (A11) line for line — see those files' own docstrings for the full
 * reasoning. `content.legacy` is A12's own sibling key.
 */

interface LegacyBearingContent {
  legacy?: unknown;
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

const LEGACY_KEYS: ReadonlySet<string> = new Set(["text"]);

export type LegacyValidationReason = "not_an_object" | "unknownKey" | "text";

export type LegacyValidationResult =
  | { ok: true; legacy: LegacyContent }
  | { ok: false; reason: LegacyValidationReason };

/** Mirrors `parsePersonWordsContent`/`parseLovedThingsContent` exactly
 * for `content.legacy`. */
export function parseLegacyContent(raw: unknown): LegacyValidationResult {
  if (raw === null || raw === undefined) {
    return { ok: true, legacy: { ...EMPTY_LEGACY_CONTENT } };
  }
  if (!isPlainObject(raw)) {
    return { ok: false, reason: "not_an_object" };
  }
  if (!hasOnlyKnownKeys(raw, LEGACY_KEYS)) {
    return { ok: false, reason: "unknownKey" };
  }

  if (raw.text !== null && raw.text !== undefined && typeof raw.text !== "string") {
    return { ok: false, reason: "text" };
  }
  const text = raw.text === null || raw.text === undefined ? null : normalizeText(raw.text) || null;

  return { ok: true, legacy: { text } };
}

export function validateLegacy(legacy: LegacyContent): LegacyValidationResult {
  return parseLegacyContent(legacy);
}

// ---------------------------------------------------------------------
// Draft integration — inspectLegacy / readLegacy / writeLegacy (mirrors
// lib/memorial/person-words.ts's own inspect/read/write split).
// ---------------------------------------------------------------------

export type LegacyReadResult =
  | { status: "absent"; legacy: LegacyContent }
  | { status: "valid"; legacy: LegacyContent }
  | { status: "corrupted"; raw: unknown };

export function inspectLegacy(content: MemorialContent): LegacyReadResult {
  const raw = (content as LegacyBearingContent).legacy;
  if (raw === null || raw === undefined) {
    return { status: "absent", legacy: { ...EMPTY_LEGACY_CONTENT } };
  }

  const result = parseLegacyContent(raw);
  return result.ok ? { status: "valid", legacy: result.legacy } : { status: "corrupted", raw };
}

/** Fail-safe read: a missing or malformed `legacy` both read as empty
 * rather than throwing. Not the function to call right before a write —
 * see `writeLegacy`'s own docstring. */
export function readLegacy(content: MemorialContent): LegacyContent {
  const result = inspectLegacy(content);
  return result.status === "corrupted" ? { text: null } : result.legacy;
}

/** Unconditionally replaces `content.legacy`, preserving every other
 * content key. The caller is the one place that must branch on
 * `inspectLegacy(content).status` first (see
 * lib/builder/guided-flow/person-sheet-step.ts). */
export function writeLegacy(content: MemorialContent, legacy: LegacyContent): MemorialContent {
  return { ...content, legacy } as MemorialContent;
}

/** Sets `text` alone — the only field this model carries. `null`/a
 * blanks-only string both normalize to `null`. */
export function setLegacyText(legacy: LegacyContent, value: string | null): LegacyContent {
  const text = value === null ? null : normalizeText(value) || null;
  return { ...legacy, text };
}
