import type { MemorialContent } from "@/types/memorial";
import type { EditorialContext } from "@/config/memorial";
import type { PersonWordsContent } from "@/types/person-words";
import {
  inspectPersonWords,
  setPersonWordsText,
  writePersonWords,
  type PersonWordsValidationReason,
} from "@/lib/memorial/person-words";
import { readHero } from "@/lib/memorial/hero";
import { guidedFlowProgress, type StepRecord } from "./engine";
import { readGuidedFlowState, writeGuidedFlowState } from "./flow-state";
import { humanFlowDefinition } from "./human-steps";
import { resolveHeroFlowState } from "./hero-step";
import { isA09Resolved } from "./traditions-step";

/**
 * Mission 043 — A10 ("Quelques mots sur la personne") as a real,
 * persisted Guided Flow step, composing:
 *
 *   - the canonical PersonWords content model
 *     (`lib/memorial/person-words.ts` / `types/person-words.ts`) —
 *     `draft.content.personWords`, reused exclusively, no second
 *     representation;
 *   - the canonical `content.guidedFlow` bag (`flow-state.ts`) — the
 *     exact same bag every earlier step already writes through;
 *   - `human-steps.ts`'s own pre-reserved A10 entry (`{ id: "A10",
 *     group: "announcement", required: false, skippable: true }`, no
 *     `isApplicable` of its own — A10 is unconditionally part of the
 *     `announcement` route once A09 is behind the family, exactly the
 *     product rule this mission asks for): this module supplies the
 *     real gate (`needsA10`) and the real reads/writes that reservation
 *     was left waiting for, never a second engine or a second
 *     applicability mechanism.
 *
 * Pure, framework-free, no I/O — same discipline as
 * `lib/builder/guided-flow/traditions-step.ts`, which this module
 * mirrors step for step (A10 is the exact same "one facultative block,
 * two outcomes" shape as A09, just with a single free-text field instead
 * of a list of entries — the closest in-repo precedent is actually A08's
 * "note pratique facultative", `ceremony-step.ts`'s `commitA08`/
 * `skipA08`).
 *
 * ## A10 depends only on A09 being resolved — never on its own content
 *
 * `needsA10` gates on `isA09Resolved` (`traditions-step.ts`), NOT on
 * `needsA09` — `needsA09 === false` is ambiguous for a skippable step
 * (it means EITHER "A09 not reachable yet" OR "A09 already resolved"),
 * so reusing it directly would make A10 reachable before A04/A09 are
 * ever reached at all (a corpus regression caught by this module's own
 * tests). `isA09Resolved` has no such ambiguity: it is true iff the
 * family has genuinely left A09, whichever way — A10 sits immediately
 * after A09 in the UX-A route (`human-steps.ts`'s own `STEP_IDS`),
 * reached the exact same way regardless of whether the family added any
 * repère in A09 or skipped it outright.
 *
 * ## A10 — a real, explicit `StepRecord`, never derived
 *
 * Exactly like every other Guided Flow step: `content.personWords`
 * holding text is NOT, by itself, proof the family left A10 — only
 * `commitA10`/`skipA10` ever write A10's own `StepRecord`, always at an
 * actual, explicit CTA click.
 *
 * ## Continue vs. Skip
 *
 * `commitA10` ("Continuer") requires `text` to genuinely be non-null at
 * the moment of the click — an empty field is never committed as
 * "completed" (mirrors `commitA08`'s "note pratique" rule and A09's own
 * "au moins un repère" rule: nothing here is ever confirmed as done with
 * literally nothing entered). `skipA10` ("Passer cette étape") never
 * touches `content.personWords` at all, whatever it already holds — a
 * family that typed something and still prefers to skip keeps their
 * autosaved draft text; it only ever writes A10's own `StepRecord` as
 * `"skipped"`. Neither outcome ever fabricates, infers, or generates
 * text on the family's behalf (mission brief doctrine).
 *
 * ## The corrupted guard
 *
 * Every write below re-reads via `inspectPersonWords` first and refuses
 * outright on `"corrupted"` — the exact discipline `traditions-step.ts`/
 * `ceremony-step.ts` already apply.
 */

// ---------------------------------------------------------------------
// Reading PersonWords for editing — corruption stays visible, never
// silently collapsed to empty.
// ---------------------------------------------------------------------

export type PersonWordsEditState =
  | { status: "ready"; personWords: PersonWordsContent }
  | { status: "corrupted" };

/** The one read the A10 screen uses to seed its field. Built on
 * `inspectPersonWords`, never a fail-safe default. */
export function readPersonWordsForEditing(content: MemorialContent): PersonWordsEditState {
  const inspected = inspectPersonWords(content);
  if (inspected.status === "corrupted") return { status: "corrupted" };
  return { status: "ready", personWords: inspected.personWords };
}

// ---------------------------------------------------------------------
// Page gate
// ---------------------------------------------------------------------

/** A10's real persisted outcome: has the family ever left A10, whichever
 * way (with or without any text)? */
export function isA10Resolved(content: MemorialContent): boolean {
  const status = readGuidedFlowState(content).A10?.status;
  return status === "completed" || status === "skipped";
}

/**
 * A10 is shown once A09 is genuinely behind the family (never before —
 * see this module's own docstring for exactly why this checks
 * `isA09Resolved`, never `needsA09`) and only until A10 itself has been
 * treated once, whichever way.
 */
export function needsA10(content: MemorialContent): boolean {
  if (!isA09Resolved(content)) return false;
  return !isA10Resolved(content);
}

// ---------------------------------------------------------------------
// Progress — reuses the real Mission 025 engine, never a hand-picked
// constant.
// ---------------------------------------------------------------------

export function personWordsStepProgress(editorialContext: EditorialContext, content: MemorialContent): number {
  const hero = readHero(content);
  return guidedFlowProgress(humanFlowDefinition(editorialContext), resolveHeroFlowState(content, hero));
}

// ---------------------------------------------------------------------
// Field write — re-reads via inspectPersonWords first.
// ---------------------------------------------------------------------

export type PersonWordsFieldWriteResult =
  | { ok: true; content: MemorialContent }
  | { ok: false; reason: "corrupted" | PersonWordsValidationReason };

/** Sets the family's text. Never rejects on its own (a blanks-only value
 * normalizes to absent, per `setPersonWordsText`) — the only failure
 * mode here is a corrupted stored PersonWords refusing the write
 * entirely. */
export function writePersonWordsText(content: MemorialContent, value: string | null): PersonWordsFieldWriteResult {
  const inspected = inspectPersonWords(content);
  if (inspected.status === "corrupted") return { ok: false, reason: "corrupted" };
  return {
    ok: true,
    content: writePersonWords(content, setPersonWordsText(inspected.personWords, value)),
  };
}

// ---------------------------------------------------------------------
// A10 — Continue / Skip.
// ---------------------------------------------------------------------

/**
 * A10's own "Continuer" — the ONLY place A10's real `StepRecord` ever
 * gets written as `"completed"`: refuses up front if `content.personWords`
 * is corrupted, or if `text` genuinely holds nothing yet (nothing is
 * ever committed as a confirmed step with nothing to show for it; a
 * family with nothing to add uses `skipA10` instead).
 */
export function commitA10(content: MemorialContent): PersonWordsFieldWriteResult {
  const inspected = inspectPersonWords(content);
  if (inspected.status === "corrupted") return { ok: false, reason: "corrupted" };
  if (inspected.personWords.text === null) return { ok: false, reason: "text" };

  const nextFlow = { ...readGuidedFlowState(content), A10: { status: "completed" } as StepRecord };
  return { ok: true, content: writeGuidedFlowState(content, nextFlow) };
}

/**
 * A10's own "Passer cette étape" — writes A10's `StepRecord` as
 * `"skipped"` unconditionally, never touching `content.personWords`
 * (skip never discards or invents data).
 */
export function skipA10(content: MemorialContent): PersonWordsFieldWriteResult {
  const inspected = inspectPersonWords(content);
  if (inspected.status === "corrupted") return { ok: false, reason: "corrupted" };

  const nextFlow = { ...readGuidedFlowState(content), A10: { status: "skipped" } as StepRecord };
  return { ok: true, content: writeGuidedFlowState(content, nextFlow) };
}
