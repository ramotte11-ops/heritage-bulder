import type { MemorialContent } from "@/types/memorial";
import type { TraditionsContent } from "@/types/traditions";
import {
  addTraditionEntry,
  inspectTraditions,
  removeTraditionEntry,
  updateTraditionEntry,
  writeTraditions,
  type NewTraditionEntryInput,
  type TraditionsValidationReason,
} from "@/lib/memorial/traditions";
import { readHero } from "@/lib/memorial/hero";
import { inspectPersonWords } from "@/lib/memorial/person-words";
import { inspectLovedThings } from "@/lib/memorial/loved-things";
import { inspectLegacy } from "@/lib/memorial/legacy";
import { guidedFlowProgress, type StepRecord } from "./engine";
import { readGuidedFlowState, writeGuidedFlowState } from "./flow-state";
import { A09_CONFIRMATION_PREFIX, humanFlowDefinition } from "./human-steps";
import { resolveHeroFlowState } from "./hero-step";
import { needsA04, needsA05, needsA06, needsA07, needsA08, needsA14 } from "./ceremony-step";
import { fnv1aHash } from "./death-notice-step";
import { isAnnouncementChosen } from "./announcement-choice-step";

/**
 * Mission 042 — A09 ("Traditions & repères") as a real, persisted
 * Guided Flow step, composing:
 *
 *   - the canonical Traditions content model (`lib/memorial/traditions.ts`
 *     / `types/traditions.ts`) — `draft.content.traditions`, reused
 *     exclusively, no second representation;
 *   - the canonical `content.guidedFlow` bag (`flow-state.ts`) — the
 *     exact same bag every earlier step already writes through;
 *   - `human-steps.ts`'s own pre-reserved A09 entry (`{ id: "A09",
 *     group: "announcement", required: false, skippable: true }`, no
 *     `isApplicable` of its own — A09 is unconditionally part of the
 *     `announcement` route regardless of A04's answer, exactly the
 *     product rule this mission asks for): this module supplies the
 *     real gate (`needsA09`) and the real reads/writes that reservation
 *     was left waiting for, never a second engine or a second
 *     applicability mechanism.
 *
 * Pure, framework-free, no I/O — same discipline as
 * `lib/builder/guided-flow/ceremony-step.ts`, which this module mirrors
 * step for step.
 *
 * ## A09 never depends on Ceremony DATA — only on the Ceremony block
 * being genuinely behind the family
 *
 * `needsA09` reuses `needsA04`/`needsA05`/`needsA06`/`needsA07`/
 * `needsA14`/`needsA08` (`ceremony-step.ts`) verbatim, and reads only their boolean
 * OUTCOME — never a single Ceremony field (`date`, `venueName`, ...) and
 * never `readCeremony`/`inspectCeremony` directly. This is what makes
 * "A09 doit rester accessible même si A04 = no ou undecided" true by
 * construction: `needsA05`..`needsA08` already read "false, not
 * applicable" the moment A04 isn't "yes" (their own doctrine,
 * `ceremony-step.ts`), so `needsA09` falls through to A09 immediately
 * after A04 is resolved for "no"/"undecided", and only after A05-A08
 * plus A14 are ALL resolved when A04 was "yes" — precisely `A04 -> [A05-A07,
 * A14, A08 si
 * applicable] -> A09`.
 *
 * ## A09 — a real, explicit `StepRecord`, never derived
 *
 * Exactly like every other Guided Flow step: `content.traditions`
 * holding entries is NOT, by itself, proof the family left A09 — only
 * `commitA09`/`skipA09` ever write A09's own `StepRecord`, always at an
 * actual, explicit CTA click.
 *
 * ## Continue vs. Skip — the exact two outcomes mission brief section 13
 * asks for
 *
 * `commitA09` ("Continuer") requires at least one repère to genuinely
 * exist in `content.traditions.entries` at the moment of the click — an
 * empty list is never committed as "completed" (there would be nothing
 * to show as confirmed). `skipA09` ("Passer cette étape") never touches
 * `content.traditions` at all, whatever it already holds (a family that
 * added entries and still prefers to skip keeps them — nothing here
 * ever discards confirmed content on skip); it only ever writes A09's
 * own `StepRecord` as `"skipped"`.
 *
 * ## The corrupted guard
 *
 * Every write below re-reads via `inspectTraditions` first and refuses
 * outright on `"corrupted"` — the exact discipline `ceremony-step.ts`
 * already applies via `inspectCeremony`.
 */

// ---------------------------------------------------------------------
// Reading Traditions for editing — corruption stays visible, never
// silently collapsed to empty.
// ---------------------------------------------------------------------

export type TraditionsEditState =
  | { status: "ready"; traditions: TraditionsContent }
  | { status: "corrupted" };

/** The one read the A09 screen uses to seed its list. Built on
 * `inspectTraditions`, never a fail-safe default. */
export function readTraditionsForEditing(content: MemorialContent): TraditionsEditState {
  const inspected = inspectTraditions(content);
  if (inspected.status === "corrupted") return { status: "corrupted" };
  return { status: "ready", traditions: inspected.traditions };
}

// ---------------------------------------------------------------------
// Chef 03 / O03 — the confirmation of the repères, by fingerprint
// (the exact mechanism A03 uses for the death notice).
// ---------------------------------------------------------------------

/**
 * A deterministic fingerprint of the repères exactly as they would be
 * shown — the closed field list of each entry, in order, read through
 * the fail-safe `inspectTraditions` (the same normalisation the
 * publication projection applies, so a snapshot's repères fingerprint to
 * the same value). `null` when Traditions is unreadable: nothing
 * corrupted is ever confirmed.
 */
export function traditionsConfirmationFingerprint(content: MemorialContent): string | null {
  const inspected = inspectTraditions(content);
  if (inspected.status === "corrupted") return null;
  const payload = JSON.stringify(
    inspected.traditions.entries.map((entry) => ({
      id: entry.id,
      origin: entry.origin,
      suggestionId: entry.suggestionId,
      title: entry.title,
      text: entry.text,
    })),
  );
  return fnv1aHash(payload);
}

/** The `answer` « Continuer » records for the repères as they stand now. */
export function traditionsConfirmationAnswer(content: MemorialContent): string | null {
  const fingerprint = traditionsConfirmationFingerprint(content);
  return fingerprint === null ? null : `${A09_CONFIRMATION_PREFIX}${fingerprint}`;
}

/**
 * Has the family confirmed THESE repères — the ones present right now —
 * with A09's « Continuer »? A stored confirmation whose fingerprint no
 * longer matches (a repère added, edited or removed since, without a new
 * « Continuer ») reads `false`: an unconfirmed change never becomes
 * publishable by itself. Nothing is cleared — the record stays as it is.
 */
export function isTraditionsConfirmed(content: MemorialContent): boolean {
  const answer = readGuidedFlowState(content).A09?.answer;
  if (answer === undefined || !answer.startsWith(A09_CONFIRMATION_PREFIX)) return false;
  return answer === traditionsConfirmationAnswer(content);
}

/**
 * The family has repères that cannot enter the memorial until it
 * confirms them: without a death notice (A00 ≠ "yes" — with "yes", the
 * pre-O03 rule applies and they are shown), at least one repère, and no
 * matching confirmation. « Mon parcours » then reads « À compléter »
 * (journey.ts); the route's progression is never affected.
 */
export function isTraditionsPendingConfirmation(content: MemorialContent): boolean {
  if (isAnnouncementChosen(content)) return false;
  const inspected = inspectTraditions(content);
  if (inspected.status !== "valid" || inspected.traditions.entries.length === 0) return false;
  return !isTraditionsConfirmed(content);
}

// ---------------------------------------------------------------------
// Page gate
// ---------------------------------------------------------------------

/** A09's real persisted outcome: has the family ever left A09, whichever
 * way (with or without any repère)? */
export function isA09Resolved(content: MemorialContent): boolean {
  const status = readGuidedFlowState(content).A09?.status;
  return status === "completed" || status === "skipped";
}

/**
 * Chef 03 / O03 — has the family already moved past A09's place in the
 * route? Only a draft written before O03 can be: with A00 ≠ "yes", its
 * route went from the ceremony straight to the person sheet (A10-A12).
 * Once that sheet carries a record or an autosaved text, A09 is never
 * imposed on it by the gates (PO: no automatic return to a rubrique the
 * family has already passed) — it stays reachable from « Mon parcours »
 * (`toComplete`). A new draft never reaches the sheet before A09, so
 * this never changes its progression.
 *
 * Reads the sheet's records and matières directly (not through
 * `person-sheet-step.ts`, which itself depends on this module). An
 * unreadable matière counts as started: fail towards "do not redirect".
 */
export function hasMovedPastTraditions(content: MemorialContent): boolean {
  const flow = readGuidedFlowState(content);
  if (flow.A10 !== undefined || flow.A11 !== undefined || flow.A12 !== undefined) return true;
  const personWords = inspectPersonWords(content);
  const lovedThings = inspectLovedThings(content);
  const legacy = inspectLegacy(content);
  if (personWords.status === "corrupted" || lovedThings.status === "corrupted" || legacy.status === "corrupted") {
    return true;
  }
  return [personWords.personWords.text, lovedThings.lovedThings.text, legacy.legacy.text].some(
    (text) => text !== null && text.trim() !== "",
  );
}

/**
 * A09 is shown once the Ceremony block is genuinely behind the family
 * (never before — see this module's own docstring for exactly why this
 * never reads a single Ceremony field) and only until A09 itself has
 * been treated once, whichever way.
 *
 * Chef 03 / O03 — whatever the A00 answer (« Traditions & repères » is
 * independent of the death notice, PO decision). Entries already written
 * stay in the draft. A pre-O03 draft that has already moved past A09's
 * place (`hasMovedPastTraditions`) is not sent back to it.
 */
export function needsA09(content: MemorialContent): boolean {
  if (needsA04(content)) return false;
  if (needsA05(content)) return false;
  if (needsA06(content)) return false;
  if (needsA07(content)) return false;
  if (needsA14(content)) return false;
  if (needsA08(content)) return false;
  if (isA09Resolved(content)) return false;
  return !hasMovedPastTraditions(content);
}

// ---------------------------------------------------------------------
// Progress — reuses the real Mission 025 engine, never a hand-picked
// constant.
// ---------------------------------------------------------------------

export function traditionsStepProgress(content: MemorialContent): number {
  const hero = readHero(content);
  return guidedFlowProgress(humanFlowDefinition(), resolveHeroFlowState(content, hero));
}

// ---------------------------------------------------------------------
// Entry-level writes — every one re-reads via inspectTraditions first.
// ---------------------------------------------------------------------

export type TraditionsFieldWriteResult =
  | { ok: true; content: MemorialContent }
  | { ok: false; reason: "corrupted" | TraditionsValidationReason };

/** Appends one new, already-confirmed repère (custom or picked from a
 * suggestion — see `NewTraditionEntryInput`). Never called for a
 * still-in-progress draft the family hasn't confirmed yet — that draft
 * lives only in the screen's own local state until this is called. */
export function addTraditionsEntry(
  content: MemorialContent,
  input: NewTraditionEntryInput,
): TraditionsFieldWriteResult {
  const inspected = inspectTraditions(content);
  if (inspected.status === "corrupted") return { ok: false, reason: "corrupted" };

  const result = addTraditionEntry(inspected.traditions, input);
  if (!result.ok) return result;
  return { ok: true, content: writeTraditions(content, result.traditions) };
}

/** Edits an existing repère's `title`/`text` in place — never its `id`,
 * `origin` or `suggestionId`. */
export function updateTraditionsEntry(
  content: MemorialContent,
  id: string,
  changes: { title?: string | null; text?: string },
): TraditionsFieldWriteResult {
  const inspected = inspectTraditions(content);
  if (inspected.status === "corrupted") return { ok: false, reason: "corrupted" };

  const result = updateTraditionEntry(inspected.traditions, id, changes);
  if (!result.ok) return result;
  return { ok: true, content: writeTraditions(content, result.traditions) };
}

/** Removes one repère by id. Removing an id that no longer exists is a
 * harmless no-op, mirroring `removeTraditionEntry`'s own tolerance. */
export function removeTraditionsEntry(content: MemorialContent, id: string): TraditionsFieldWriteResult {
  const inspected = inspectTraditions(content);
  if (inspected.status === "corrupted") return { ok: false, reason: "corrupted" };

  return { ok: true, content: writeTraditions(content, removeTraditionEntry(inspected.traditions, id)) };
}

// ---------------------------------------------------------------------
// A09 — Continue / Skip.
// ---------------------------------------------------------------------

/**
 * A09's own "Continuer" — the ONLY place A09's real `StepRecord` ever
 * gets written as `"completed"`: refuses up front if `content.traditions`
 * is corrupted, or if it genuinely holds no entry yet (mission brief
 * section 13 — nothing is ever committed as a confirmed step with
 * nothing to show for it; a family with nothing to add uses `skipA09`
 * instead).
 */
export function commitA09(content: MemorialContent): TraditionsFieldWriteResult {
  const inspected = inspectTraditions(content);
  if (inspected.status === "corrupted") return { ok: false, reason: "corrupted" };
  if (inspected.traditions.entries.length === 0) return { ok: false, reason: "entries" };

  // Chef 03 / O03 — « Continuer » is the family's explicit confirmation
  // of THESE repères: the one write of the fingerprinted marker that lets
  // them enter the memorial whatever A00 says (`isTraditionsConfirmed`).
  const answer = traditionsConfirmationAnswer(content);
  if (answer === null) return { ok: false, reason: "corrupted" };
  const record: StepRecord = { status: "completed", answer };
  const nextFlow = { ...readGuidedFlowState(content), A09: record };
  return { ok: true, content: writeGuidedFlowState(content, nextFlow) };
}

/**
 * A09's own "Passer cette étape" — writes A09's `StepRecord` as
 * `"skipped"` unconditionally, never touching `content.traditions`
 * (mission brief section 13/9 — skip never discards or invents data).
 */
export function skipA09(content: MemorialContent): TraditionsFieldWriteResult {
  const inspected = inspectTraditions(content);
  if (inspected.status === "corrupted") return { ok: false, reason: "corrupted" };

  // Chef 03 / O03 — passing is never a confirmation: it neither creates
  // nor renews the fingerprinted marker. An earlier « Continuer »'s value
  // is copied verbatim — it still confirms exactly the repères it was
  // computed for, and stops matching as soon as they changed since.
  const previous = readGuidedFlowState(content).A09?.answer;
  const record: StepRecord =
    previous !== undefined && previous.startsWith(A09_CONFIRMATION_PREFIX)
      ? { status: "skipped", answer: previous }
      : { status: "skipped" };
  const nextFlow = { ...readGuidedFlowState(content), A09: record };
  return { ok: true, content: writeGuidedFlowState(content, nextFlow) };
}
