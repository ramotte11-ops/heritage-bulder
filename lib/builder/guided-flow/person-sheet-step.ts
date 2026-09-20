import type { MemorialContent } from "@/types/memorial";
import type { EditorialContext } from "@/config/memorial";
import type { PersonWordsContent } from "@/types/person-words";
import type { LovedThingsContent } from "@/types/loved-things";
import type { LegacyContent } from "@/types/legacy";
import { inspectPersonWords, setPersonWordsText, writePersonWords } from "@/lib/memorial/person-words";
import { inspectLovedThings, setLovedThingsText, writeLovedThings } from "@/lib/memorial/loved-things";
import { inspectLegacy, setLegacyText, writeLegacy } from "@/lib/memorial/legacy";
import { readHero } from "@/lib/memorial/hero";
import { guidedFlowProgress, type StepRecord } from "./engine";
import { readGuidedFlowState, writeGuidedFlowState } from "./flow-state";
import { humanFlowDefinition } from "./human-steps";
import { resolveHeroFlowState } from "./hero-step";
import { isA09Resolved } from "./traditions-step";

/**
 * Mission 044 — QG Produit/UX decision: A10 ("Quelques mots sur la
 * personne"), A11 ("Ce qu'elle aimait") and A12 ("Ce qu'elle laisse") no
 * longer render as three successive Builder screens (Mission 043 built
 * only A10's own screen, one field). They now share ONE screen — "1
 * feuille côté famille -> 3 questions ouvertes -> 3 matières distinctes
 * côté données -> 1 futur ensemble narratif 'Récit de vie' côté
 * Memorial" — while staying three fully distinct content matières:
 * `content.personWords` (A10, Mission 043, untouched), `content.lovedThings`
 * (A11, `lib/memorial/loved-things.ts`) and `content.legacy` (A12,
 * `lib/memorial/legacy.ts`). This module is the ONE place that composes
 * all three into a single Guided Flow moment — it replaces
 * `person-words-step.ts`'s own page-gate layer (`needsA10`/`isA10Resolved`/
 * `commitA10`/`skipA10`), which represented "A10 is its own screen", a
 * premise this mission retires. The underlying A10 data model
 * (`types/person-words.ts` / `lib/memorial/person-words.ts`) is NOT
 * touched — QG mission brief section 5: "Mission 043 a déjà créé
 * content.personWords… Ne détruis pas cette fondation sans raison."
 *
 * Still no second Guided Flow engine, no second `content.guidedFlow`
 * bag, no new `StepId`s: `human-steps.ts` already reserves `A10`, `A11`
 * and `A12` as three ordinary, independent, optional/skippable steps
 * (Mission 025) — this mission does not touch that declaration at all.
 * What changes is only WHICH SCREEN resolves them: one Continue/Skip
 * click on this combined sheet now writes all three `StepRecord`s at
 * once, exactly the way `hero-step.ts`'s own PAGE A already resolves two
 * distinct steps (T03 + T04) from one screen and one Continue click —
 * the closest in-repo precedent for "several StepIds, one screen, one
 * commit", reused here rather than inventing a new mechanism.
 *
 * ## Why each matière still needs its OWN real `StepRecord`
 *
 * A text present in `content.personWords`/`lovedThings`/`legacy` is not,
 * by itself, proof the family left the sheet — the exact same
 * non-derivability every other optional Guided Flow field already has
 * (mirrors A10/A08/A09's own discipline: an autosaved value sitting in a
 * field is draft content, not a decision). Only this module's own
 * `commitPersonSheet`/`skipPersonSheet` ever write A10/A11/A12's
 * `StepRecord`s, always together, always at an actual Continue/Skip
 * click — never derived, never partially written.
 *
 * ## Continue vs. Skip — per-matière outcome, sheet-level resolution
 *
 * `commitPersonSheet` ("Continuer") looks at what the family actually
 * typed in EACH of the three fields independently: a matière with text
 * becomes `"completed"`, a matière left empty becomes `"skipped"` — so
 * "seulement A11", "A10 et A12", or "les trois" (mission brief section 4)
 * all fall out of the same rule, no per-combination special case. It
 * refuses only when ALL THREE are empty (reason `"empty"`) — exactly
 * A10's own original "Continue needs something to confirm" rule
 * (mirrors `commitA08`'s "note pratique" gate), generalized from one
 * field to three: a family with genuinely nothing to add uses
 * `skipPersonSheet` instead, the "ou aucune" case (mission brief section
 * 4). `skipPersonSheet` ("Passer cette étape") never touches
 * `content.personWords`/`lovedThings`/`legacy` at all, whatever they
 * already hold — a family that typed something in one or more fields and
 * still prefers to skip keeps their autosaved draft text; it only ever
 * writes all three `StepRecord`s as `"skipped"`. Neither outcome ever
 * fabricates, infers, or generates text on the family's behalf (mission
 * brief doctrine: "la famille raconte ; HERITAGE met en forme").
 *
 * ## The corrupted guard
 *
 * Every write below re-reads via `readPersonSheetForEditing` first —
 * corrupted if ANY of the three stored matières is corrupted — and
 * refuses outright rather than partially writing two matières and
 * dropping the third.
 */

// ---------------------------------------------------------------------
// Reading all three matières for editing — corruption in any one of
// them stays visible, never silently collapsed to empty.
// ---------------------------------------------------------------------

export type PersonSheetEditState =
  | { status: "ready"; personWords: PersonWordsContent; lovedThings: LovedThingsContent; legacy: LegacyContent }
  | { status: "corrupted" };

/** The one read the combined sheet uses to seed its three fields. Built
 * on `inspectPersonWords`/`inspectLovedThings`/`inspectLegacy`, never a
 * fail-safe default for any of them. */
export function readPersonSheetForEditing(content: MemorialContent): PersonSheetEditState {
  const personWordsInspected = inspectPersonWords(content);
  const lovedThingsInspected = inspectLovedThings(content);
  const legacyInspected = inspectLegacy(content);

  if (
    personWordsInspected.status === "corrupted" ||
    lovedThingsInspected.status === "corrupted" ||
    legacyInspected.status === "corrupted"
  ) {
    return { status: "corrupted" };
  }

  return {
    status: "ready",
    personWords: personWordsInspected.personWords,
    lovedThings: lovedThingsInspected.lovedThings,
    legacy: legacyInspected.legacy,
  };
}

// ---------------------------------------------------------------------
// Page gate
// ---------------------------------------------------------------------

function stepResolved(content: MemorialContent, id: "A10" | "A11" | "A12"): boolean {
  const status = readGuidedFlowState(content)[id]?.status;
  return status === "completed" || status === "skipped";
}

/** The sheet's real persisted outcome: has the family ever left it,
 * whichever way? True only once EVERY ONE of A10/A11/A12 carries its own
 * `StepRecord` — `commitPersonSheet`/`skipPersonSheet` always write all
 * three together, so this is never true for only one or two of them
 * outside of a hand-corrupted `content.guidedFlow`. */
export function isPersonSheetResolved(content: MemorialContent): boolean {
  return stepResolved(content, "A10") && stepResolved(content, "A11") && stepResolved(content, "A12");
}

/**
 * The sheet is shown once A09 is genuinely behind the family (never
 * before — same `isA09Resolved` gate A10 always used, never `needsA09`:
 * see `person-sheet-step.ts`'s own predecessor for exactly why) and only
 * until the sheet itself has been treated once, whichever way.
 */
export function needsPersonSheet(content: MemorialContent): boolean {
  if (!isA09Resolved(content)) return false;
  return !isPersonSheetResolved(content);
}

// ---------------------------------------------------------------------
// Progress — reuses the real Mission 025 engine, never a hand-picked
// constant.
// ---------------------------------------------------------------------

export function personSheetProgress(editorialContext: EditorialContext, content: MemorialContent): number {
  const hero = readHero(content);
  return guidedFlowProgress(humanFlowDefinition(editorialContext), resolveHeroFlowState(content, hero));
}

// ---------------------------------------------------------------------
// Field writes — each re-reads its own matière via inspectX first, same
// discipline as every other content model in this codebase. Autosaved on
// every keystroke, exactly like A10's original single-field write.
// ---------------------------------------------------------------------

export type PersonSheetFieldWriteResult =
  | { ok: true; content: MemorialContent }
  | { ok: false; reason: "corrupted" };

export function writePersonWordsFieldText(content: MemorialContent, value: string | null): PersonSheetFieldWriteResult {
  const inspected = inspectPersonWords(content);
  if (inspected.status === "corrupted") return { ok: false, reason: "corrupted" };
  return { ok: true, content: writePersonWords(content, setPersonWordsText(inspected.personWords, value)) };
}

export function writeLovedThingsFieldText(content: MemorialContent, value: string | null): PersonSheetFieldWriteResult {
  const inspected = inspectLovedThings(content);
  if (inspected.status === "corrupted") return { ok: false, reason: "corrupted" };
  return { ok: true, content: writeLovedThings(content, setLovedThingsText(inspected.lovedThings, value)) };
}

export function writeLegacyFieldText(content: MemorialContent, value: string | null): PersonSheetFieldWriteResult {
  const inspected = inspectLegacy(content);
  if (inspected.status === "corrupted") return { ok: false, reason: "corrupted" };
  return { ok: true, content: writeLegacy(content, setLegacyText(inspected.legacy, value)) };
}

// ---------------------------------------------------------------------
// The sheet — Continue / Skip. The ONLY place A10/A11/A12's real
// StepRecords are ever written, always all three together.
// ---------------------------------------------------------------------

export type PersonSheetWriteResult =
  | { ok: true; content: MemorialContent }
  | { ok: false; reason: "corrupted" | "empty" };

/**
 * The sheet's own "Continuer": refuses if any of the three stored
 * matières is corrupted, or if all three genuinely hold nothing yet
 * (reason `"empty"` — a family with nothing to add uses `skipPersonSheet`
 * instead, never a Continue with literally nothing to confirm). Writes
 * A10/A11/A12 each independently as `"completed"` (its own text present)
 * or `"skipped"` (its own text absent) — never all-or-nothing across the
 * three.
 */
export function commitPersonSheet(content: MemorialContent): PersonSheetWriteResult {
  const read = readPersonSheetForEditing(content);
  if (read.status !== "ready") return { ok: false, reason: "corrupted" };

  const { personWords, lovedThings, legacy } = read;
  if (personWords.text === null && lovedThings.text === null && legacy.text === null) {
    return { ok: false, reason: "empty" };
  }

  const nextFlow = {
    ...readGuidedFlowState(content),
    A10: { status: personWords.text !== null ? "completed" : "skipped" } as StepRecord,
    A11: { status: lovedThings.text !== null ? "completed" : "skipped" } as StepRecord,
    A12: { status: legacy.text !== null ? "completed" : "skipped" } as StepRecord,
  };
  return { ok: true, content: writeGuidedFlowState(content, nextFlow) };
}

/**
 * The sheet's own "Passer cette étape": writes A10/A11/A12's `StepRecord`s
 * as `"skipped"` unconditionally, never touching
 * `content.personWords`/`lovedThings`/`legacy` (skip never discards or
 * invents data — mission brief section 7: "sans détruire silencieusement
 * d'éventuelles données déjà sauvegardées").
 */
export function skipPersonSheet(content: MemorialContent): PersonSheetWriteResult {
  const read = readPersonSheetForEditing(content);
  if (read.status !== "ready") return { ok: false, reason: "corrupted" };

  const nextFlow = {
    ...readGuidedFlowState(content),
    A10: { status: "skipped" } as StepRecord,
    A11: { status: "skipped" } as StepRecord,
    A12: { status: "skipped" } as StepRecord,
  };
  return { ok: true, content: writeGuidedFlowState(content, nextFlow) };
}
