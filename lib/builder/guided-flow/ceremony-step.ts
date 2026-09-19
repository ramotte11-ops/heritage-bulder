import type { MemorialContent } from "@/types/memorial";
import type { EditorialContext } from "@/config/memorial";
import type { CeremonyContent } from "@/types/ceremony";
import {
  inspectCeremony,
  setCeremonyAccess,
  setCeremonyAddress,
  setCeremonyDate,
  setCeremonyNote,
  setCeremonyTime,
  setCeremonyVenueName,
  writeCeremony,
  type CeremonyValidationReason,
} from "@/lib/memorial/ceremony";
import { readHero } from "@/lib/memorial/hero";
import { guidedFlowProgress, type StepRecord } from "./engine";
import { readGuidedFlowState, writeGuidedFlowState } from "./flow-state";
import { A04_ANSWERS, humanFlowDefinition, type A04Answer } from "./human-steps";
import { resolveHeroFlowState } from "./hero-step";

/**
 * Mission 040 — A04 ("Un moment est-il prévu ?") and A05-A08 (the
 * ceremony's own date/heure, lieu, adresse/accès, note pratique) as
 * real, persisted Guided Flow steps, composing:
 *
 *   - the canonical Ceremony content model (`lib/memorial/ceremony.ts` /
 *     `types/ceremony.ts`) — `draft.content.ceremony`, reused
 *     exclusively, no second representation;
 *   - the canonical `content.guidedFlow` bag (`flow-state.ts`) — the
 *     exact same bag every earlier step already writes through;
 *   - `human-steps.ts`'s own A04-A08 wiring (Mission 025), already in
 *     place: A05-A08 are already `isApplicable: isA04AnsweredYes` there,
 *     and `lib/memorial/section-selection.ts` already ties the
 *     `ceremony` section's relevance to the same A04 answer (Mission
 *     027) — this module does not re-decide either rule, only supplies
 *     the real reads/writes those two already-built mechanisms consume.
 *
 * Pure, framework-free, no I/O — same discipline as
 * `death-notice-step.ts`, which this module mirrors step for step.
 *
 * ## A04 — a real, explicit `StepRecord`, never derived
 *
 * A04's answer is opaque to the engine (`StepRecord.answer`) and is the
 * ONLY thing this step ever writes for itself — never a value inferred
 * from whether `content.ceremony` happens to hold anything. "données
 * présentes ≠ étape explicitement validée" — the same doctrine
 * `commitA01`/`commitA02` already enforce for the Death Notice.
 *
 * ## A05-A08 — each its own small step, two distinct outcomes
 *
 * Every one of the four is declared `required: false, skippable: true`
 * in `human-steps.ts`'s `STEPS` — HERITAGE never forces a date, a venue,
 * an address or a note on a family that does not yet know or does not
 * wish to share one (mission brief: "aucun écran ne doit culpabiliser la
 * famille"). `commitAxx` requires the group's own field(s) to genuinely
 * hold something at the moment of the click (mirrors `commitA02`'s own
 * "au moins une précision" rule); `skipAxx` never touches
 * `content.ceremony` at all, only the step's own `StepRecord`. A08
 * follows the exact same two-outcome shape as A05-A07: `commitA08`
 * requires `note` to genuinely hold something (QG review, Mission 040 —
 * A08 is only ever "note pratique facultative", never a second,
 * broader "validation" screen); `skipA08` lets the family move on
 * without one.
 *
 * ## The corrupted guard
 *
 * Every write below re-reads via `inspectCeremony` first and refuses
 * outright on `"corrupted"` — the exact discipline
 * `death-notice-step.ts` already applies via `inspectDeathNotice`.
 */

// ---------------------------------------------------------------------
// Reading the Ceremony for editing — corruption stays visible, never
// silently collapsed to empty.
// ---------------------------------------------------------------------

export type CeremonyEditState =
  | { status: "ready"; ceremony: CeremonyContent }
  | { status: "corrupted" };

/** The one read A05-A08 use to seed their form. Built on
 * `inspectCeremony`, never a fail-safe default. */
export function readCeremonyForEditing(content: MemorialContent): CeremonyEditState {
  const inspected = inspectCeremony(content);
  if (inspected.status === "corrupted") return { status: "corrupted" };
  return { status: "ready", ceremony: inspected.ceremony };
}

/** A04's own answer, as already persisted — `null` if A04 has never
 * been answered, or if a stray/malformed value is somehow stored
 * (fail-safe, never trusted at face value). */
export function readCeremonyMomentAnswer(content: MemorialContent): A04Answer | null {
  const answer = readGuidedFlowState(content).A04?.answer;
  return answer !== undefined && (A04_ANSWERS as readonly string[]).includes(answer)
    ? (answer as A04Answer)
    : null;
}

// ---------------------------------------------------------------------
// Page gates
// ---------------------------------------------------------------------

/** A04's real persisted outcome — non-skippable, so `"completed"` is
 * the only legal value its own `StepRecord` may ever hold; a stray
 * `"skipped"` (malformed data) reads as not-yet-completed. */
export function isA04Complete(content: MemorialContent): boolean {
  return readGuidedFlowState(content).A04?.status === "completed";
}

/** A04 is shown whenever the Ceremony cannot be safely edited from
 * (corrupted) OR its own `StepRecord` has never been written yet. */
export function needsA04(content: MemorialContent): boolean {
  const read = readCeremonyForEditing(content);
  if (read.status !== "ready") return true;
  return !isA04Complete(content);
}

/** Has the family said "yes, a moment is planned"? The one condition
 * A05-A08 all gate on, on top of A04 itself being resolved — mirrors
 * `human-steps.ts`'s own private `isA04AnsweredYes` and
 * `section-selection.ts`'s identical helper, each reading from its own
 * natural input type rather than sharing one across three independent
 * modules (the same duplication pattern those two files already use). */
function isCeremonyPlanned(content: MemorialContent): boolean {
  return readCeremonyMomentAnswer(content) === "yes";
}

function isStepResolved(content: MemorialContent, stepId: "A05" | "A06" | "A07" | "A08"): boolean {
  const status = readGuidedFlowState(content)[stepId]?.status;
  return status === "completed" || status === "skipped";
}

/** A05 (date + heure) is shown only once A04 is genuinely behind the
 * family AND answered "yes" (never before, and never at all for
 * "non"/"pas encore décidé" — mission brief: "si Non : aucune cérémonie
 * active, continuer le parcours ; si Pas encore décidé : ne forcer
 * aucune information, continuer le parcours"), and until A05 itself has
 * been treated once, whichever way. */
export function needsA05(content: MemorialContent): boolean {
  if (needsA04(content)) return false;
  if (!isCeremonyPlanned(content)) return false;
  return !isStepResolved(content, "A05");
}

/** A06 (nom du lieu) — mirrors `needsA05`, one step down. */
export function needsA06(content: MemorialContent): boolean {
  if (needsA05(content)) return false;
  if (!isCeremonyPlanned(content)) return false;
  return !isStepResolved(content, "A06");
}

/** A07 (adresse + accès) — mirrors `needsA06`, one step down. */
export function needsA07(content: MemorialContent): boolean {
  if (needsA06(content)) return false;
  if (!isCeremonyPlanned(content)) return false;
  return !isStepResolved(content, "A07");
}

/** A08 (note pratique facultative) — mirrors `needsA07`, one step down;
 * the last of the four. */
export function needsA08(content: MemorialContent): boolean {
  if (needsA07(content)) return false;
  if (!isCeremonyPlanned(content)) return false;
  return !isStepResolved(content, "A08");
}

// ---------------------------------------------------------------------
// Progress — reuses the real Mission 025 engine, never a hand-picked
// constant.
// ---------------------------------------------------------------------

export function ceremonyStepProgress(editorialContext: EditorialContext, content: MemorialContent): number {
  const hero = readHero(content);
  return guidedFlowProgress(humanFlowDefinition(editorialContext), resolveHeroFlowState(content, hero));
}

// ---------------------------------------------------------------------
// Writes — every one re-reads via inspectCeremony first.
// ---------------------------------------------------------------------

export type CeremonyFieldWriteResult =
  | { ok: true; content: MemorialContent }
  | {
      ok: false;
      reason: "corrupted" | CeremonyValidationReason | "dateTime" | "venueName" | "addressAccess" | "answer";
    };

export function writeCeremonyDate(content: MemorialContent, value: string | null): CeremonyFieldWriteResult {
  const inspected = inspectCeremony(content);
  if (inspected.status === "corrupted") return { ok: false, reason: "corrupted" };
  return { ok: true, content: writeCeremony(content, setCeremonyDate(inspected.ceremony, value)) };
}

export function writeCeremonyTime(content: MemorialContent, value: string | null): CeremonyFieldWriteResult {
  const inspected = inspectCeremony(content);
  if (inspected.status === "corrupted") return { ok: false, reason: "corrupted" };
  return { ok: true, content: writeCeremony(content, setCeremonyTime(inspected.ceremony, value)) };
}

export function writeCeremonyVenueName(content: MemorialContent, value: string | null): CeremonyFieldWriteResult {
  const inspected = inspectCeremony(content);
  if (inspected.status === "corrupted") return { ok: false, reason: "corrupted" };
  return { ok: true, content: writeCeremony(content, setCeremonyVenueName(inspected.ceremony, value)) };
}

export function writeCeremonyAddress(content: MemorialContent, value: string | null): CeremonyFieldWriteResult {
  const inspected = inspectCeremony(content);
  if (inspected.status === "corrupted") return { ok: false, reason: "corrupted" };
  return { ok: true, content: writeCeremony(content, setCeremonyAddress(inspected.ceremony, value)) };
}

export function writeCeremonyAccess(content: MemorialContent, value: string | null): CeremonyFieldWriteResult {
  const inspected = inspectCeremony(content);
  if (inspected.status === "corrupted") return { ok: false, reason: "corrupted" };
  return { ok: true, content: writeCeremony(content, setCeremonyAccess(inspected.ceremony, value)) };
}

export function writeCeremonyNote(content: MemorialContent, value: string | null): CeremonyFieldWriteResult {
  const inspected = inspectCeremony(content);
  if (inspected.status === "corrupted") return { ok: false, reason: "corrupted" };
  return { ok: true, content: writeCeremony(content, setCeremonyNote(inspected.ceremony, value)) };
}

// ---------------------------------------------------------------------
// A04 — commit only (non-skippable).
// ---------------------------------------------------------------------

/**
 * A04's own "Continuer" — the ONLY place A04's real `StepRecord` ever
 * gets written. Rejects up front if `answer` is not one of
 * `A04_ANSWERS` — A04 is required and non-passable, so its Continue must
 * never be reachable without a real, explicit choice.
 */
export function commitA04(content: MemorialContent, answer: A04Answer): CeremonyFieldWriteResult {
  const inspected = inspectCeremony(content);
  if (inspected.status === "corrupted") return { ok: false, reason: "corrupted" };
  if (!(A04_ANSWERS as readonly string[]).includes(answer)) {
    return { ok: false, reason: "answer" };
  }

  const nextFlow = { ...readGuidedFlowState(content), A04: { status: "completed", answer } as StepRecord };
  return { ok: true, content: writeGuidedFlowState(content, nextFlow) };
}

// ---------------------------------------------------------------------
// A05 — date + heure.
// ---------------------------------------------------------------------

function hasDateOrTime(ceremony: CeremonyContent): boolean {
  return ceremony.date !== null || ceremony.time !== null;
}

/** A05's own "Continuer" — writes A05's `StepRecord` as `"completed"`,
 * but only once at least the date or the time is genuinely present at
 * the moment of the click (mirrors `commitA02`). */
export function commitA05(content: MemorialContent): CeremonyFieldWriteResult {
  const inspected = inspectCeremony(content);
  if (inspected.status === "corrupted") return { ok: false, reason: "corrupted" };
  if (!hasDateOrTime(inspected.ceremony)) return { ok: false, reason: "dateTime" };

  const nextFlow = { ...readGuidedFlowState(content), A05: { status: "completed" } as StepRecord };
  return { ok: true, content: writeGuidedFlowState(content, nextFlow) };
}

/** A05's own "Passer cette étape" — never touches `content.ceremony`,
 * only writes A05's own `StepRecord` as `"skipped"`. */
export function skipA05(content: MemorialContent): CeremonyFieldWriteResult {
  const inspected = inspectCeremony(content);
  if (inspected.status === "corrupted") return { ok: false, reason: "corrupted" };

  const nextFlow = { ...readGuidedFlowState(content), A05: { status: "skipped" } as StepRecord };
  return { ok: true, content: writeGuidedFlowState(content, nextFlow) };
}

// ---------------------------------------------------------------------
// A06 — nom du lieu.
// ---------------------------------------------------------------------

/** A06's own "Continuer" — requires `venueName` to genuinely hold
 * something at the moment of the click. */
export function commitA06(content: MemorialContent): CeremonyFieldWriteResult {
  const inspected = inspectCeremony(content);
  if (inspected.status === "corrupted") return { ok: false, reason: "corrupted" };
  if (inspected.ceremony.venueName === null) return { ok: false, reason: "venueName" };

  const nextFlow = { ...readGuidedFlowState(content), A06: { status: "completed" } as StepRecord };
  return { ok: true, content: writeGuidedFlowState(content, nextFlow) };
}

export function skipA06(content: MemorialContent): CeremonyFieldWriteResult {
  const inspected = inspectCeremony(content);
  if (inspected.status === "corrupted") return { ok: false, reason: "corrupted" };

  const nextFlow = { ...readGuidedFlowState(content), A06: { status: "skipped" } as StepRecord };
  return { ok: true, content: writeGuidedFlowState(content, nextFlow) };
}

// ---------------------------------------------------------------------
// A07 — adresse + accès.
// ---------------------------------------------------------------------

function hasAddressOrAccess(ceremony: CeremonyContent): boolean {
  return ceremony.address !== null || ceremony.access !== null;
}

export function commitA07(content: MemorialContent): CeremonyFieldWriteResult {
  const inspected = inspectCeremony(content);
  if (inspected.status === "corrupted") return { ok: false, reason: "corrupted" };
  if (!hasAddressOrAccess(inspected.ceremony)) return { ok: false, reason: "addressAccess" };

  const nextFlow = { ...readGuidedFlowState(content), A07: { status: "completed" } as StepRecord };
  return { ok: true, content: writeGuidedFlowState(content, nextFlow) };
}

export function skipA07(content: MemorialContent): CeremonyFieldWriteResult {
  const inspected = inspectCeremony(content);
  if (inspected.status === "corrupted") return { ok: false, reason: "corrupted" };

  const nextFlow = { ...readGuidedFlowState(content), A07: { status: "skipped" } as StepRecord };
  return { ok: true, content: writeGuidedFlowState(content, nextFlow) };
}

// ---------------------------------------------------------------------
// A08 — note pratique facultative. Same two-outcome shape as A05-A07
// (QG review, Mission 040): `commitA08` requires `note` to genuinely
// hold something at the moment of the click; a family with nothing to
// add uses `skipA08` instead — A08 is never a second, broader
// "validation" screen for the branch.
// ---------------------------------------------------------------------

export function commitA08(content: MemorialContent): CeremonyFieldWriteResult {
  const inspected = inspectCeremony(content);
  if (inspected.status === "corrupted") return { ok: false, reason: "corrupted" };
  if (inspected.ceremony.note === null) return { ok: false, reason: "note" };

  const nextFlow = { ...readGuidedFlowState(content), A08: { status: "completed" } as StepRecord };
  return { ok: true, content: writeGuidedFlowState(content, nextFlow) };
}

export function skipA08(content: MemorialContent): CeremonyFieldWriteResult {
  const inspected = inspectCeremony(content);
  if (inspected.status === "corrupted") return { ok: false, reason: "corrupted" };

  const nextFlow = { ...readGuidedFlowState(content), A08: { status: "skipped" } as StepRecord };
  return { ok: true, content: writeGuidedFlowState(content, nextFlow) };
}
