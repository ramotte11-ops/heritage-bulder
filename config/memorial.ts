/**
 * Memorial type and editorial context configuration.
 *
 * These are HERITAGE-defined values, not choices the client makes freely.
 * The product grows by adding a value here (a new memorial type, a new
 * editorial context), not by branching or duplicating code paths.
 */

export const MEMORIAL_TYPES = ["person"] as const;

export type MemorialType = (typeof MEMORIAL_TYPES)[number];

// "pet" (Pet Memorial) is a planned future memorial type — see Mission 000.
// It is intentionally NOT listed above yet. Mission 001 only prepares the
// engine (this config + the Memorial type in types/memorial.ts) to accept a
// new memorialType without a structural rewrite. No pet-specific behaviour,
// content or UI exists.

export const EDITORIAL_CONTEXTS = ["announcement", "remembrance"] as const;

export type EditorialContext = (typeof EDITORIAL_CONTEXTS)[number];

/**
 * Mission 024 — the one runtime guard for "is this a legal
 * `EditorialContext` value?", next to the canonical array it checks
 * against, same pattern as `config/languages.ts`'s `isLanguage`
 * (Mission 023). Used where a caller has an unchecked string (a Server
 * Action's argument) rather than an already-typed `EditorialContext`.
 */
export function isEditorialContext(value: string): value is EditorialContext {
  return (EDITORIAL_CONTEXTS as readonly string[]).includes(value);
}
