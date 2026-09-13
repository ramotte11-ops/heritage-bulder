import type { MemorialContent } from "@/types/memorial";
import type { EditorialContext } from "@/config/memorial";
import type { DeathNoticeContent, DeathNoticePrecisions } from "@/types/death-notice";
import {
  inspectDeathNotice,
  setDeathNoticeAnnouncementText,
  setDeathNoticePrecision,
  writeDeathNotice,
  type DeathNoticePrecisionField,
  type DeathNoticeValidationReason,
} from "@/lib/memorial/death-notice";
import { readHero } from "@/lib/memorial/hero";
import { guidedFlowProgress, type StepRecord } from "./engine";
import { readGuidedFlowState, writeGuidedFlowState } from "./flow-state";
import { humanFlowDefinition } from "./human-steps";
import { resolveHeroFlowState } from "./hero-step";

/**
 * Mission 039 — A01 (l'annonce, quelques mots) and A02 (précisions
 * facultatives) as real, persisted Guided Flow steps, composing:
 *
 *   - the canonical Death Notice content model (Mission 038,
 *     `lib/memorial/death-notice.ts` / `types/death-notice.ts`) —
 *     `draft.content.deathNotice`, reused exclusively, no second
 *     representation (mission brief section 6);
 *   - the canonical `content.guidedFlow` bag (Mission 025/032,
 *     `flow-state.ts`) — the exact same bag T03-T08 already use, reused
 *     exclusively, no second autosave/bookkeeping mechanism (mission
 *     brief section 10/16).
 *
 * Pure, framework-free, no I/O — same discipline as every other module
 * in this directory. Nothing here renders anything or decides any
 * wording (that is `DeathNoticeAnnouncementStep.tsx` /
 * `DeathNoticePrecisionsStep.tsx`); this is only the seam between the
 * two canonical models above.
 *
 * ## Why A01/A02 need a real, explicit `StepRecord` (mission brief
 * section 10)
 *
 * Exactly T04/T05/T06's own reasoning (see `hero-step.ts`'s docstring):
 * `announcementText` (or any precision) sitting in the stored Death
 * Notice is NOT, by itself, proof the family ever left A01/A02 — it
 * could be mid-typing, autosaved seconds ago, with the browser about to
 * be closed before the family ever clicks Continue. "données présentes
 * ≠ étape explicitement validée" (mission brief section 10) is the
 * literal rule this module enforces: `commitA01`/`commitA02`/`skipA02`
 * are the ONLY places A01's/A02's `StepRecord` is ever written, always
 * at an actual, explicit CTA click.
 *
 * ## The corrupted guard (mission brief section 7 — QG closure reused)
 *
 * Every write below re-reads via `inspectDeathNotice` first and refuses
 * outright on `"corrupted"` — the exact discipline `hero-step.ts`
 * already applies via `inspectHero` before every one of its Hero field
 * writes, and Mission 038's own `inspectDeathNotice` docstring mandates
 * for any future A01/A02 write path. `readDeathNotice` (the fail-safe,
 * defaults-away read) is never used here for a write — only
 * `inspectDeathNotice`, so a "corrupted" stored value is never silently
 * replaced by a fresh empty one.
 *
 * ## A02 — two distinct outcomes, two distinct functions (mission brief
 * sections 8-9)
 *
 * `commitA02` ("Continuer") requires at least one precision to actually
 * be present at the moment of the click — that is what "au moins une
 * précision a été saisie" (section 9) checks for; committing "completed"
 * with nothing entered would be indistinguishable from an accidental
 * click and is what `skipA02` exists for instead. `skipA02` ("Passer
 * cette étape") never touches `precisions` at all (section 8: "ne rien
 * inventer ; ne rien ajouter") — it only ever writes A02's own
 * `StepRecord` as `"skipped"`, whatever `precisions` already holds
 * (autosaved or not) is left exactly as it was.
 */

// ---------------------------------------------------------------------
// Reading the Death Notice for editing — corruption stays visible,
// never silently collapsed to empty (mirrors hero-step.ts's
// `readHeroForEditing` / Mission 038's own `inspectDeathNotice`
// docstring).
// ---------------------------------------------------------------------

export type DeathNoticeEditState =
  | { status: "ready"; deathNotice: DeathNoticeContent }
  | { status: "corrupted" };

/**
 * The one read A01/A02 use to seed their form. Built on
 * `inspectDeathNotice`, never a fail-safe default: a `"corrupted"`
 * stored Death Notice must surface as a distinct, honest state a screen
 * can react to (refuse to edit, show a calm notice) rather than
 * silently starting the family from an empty form that would overwrite
 * the real, if malformed, data the moment they typed anything.
 */
export function readDeathNoticeForEditing(content: MemorialContent): DeathNoticeEditState {
  const inspected = inspectDeathNotice(content);
  if (inspected.status === "corrupted") return { status: "corrupted" };
  return { status: "ready", deathNotice: inspected.deathNotice };
}

// ---------------------------------------------------------------------
// Page gates — the single condition app/builder/[memorialId]/page.tsx
// checks, same discipline as every earlier PAGE's own gate.
// ---------------------------------------------------------------------

/** A01's real persisted outcome — non-skippable, so `"completed"` is
 * the only legal value its own `StepRecord` may ever hold; a stray
 * `"skipped"` (malformed data) reads as not-yet-completed, never
 * trusted at face value (mirrors `engine.ts`'s own `stepRuntimeStatus`
 * invariant for non-skippable steps). */
export function isA01Complete(content: MemorialContent): boolean {
  return readGuidedFlowState(content).A01?.status === "completed";
}

/**
 * A01 is shown whenever the Death Notice cannot be safely edited from
 * (corrupted) OR its own `StepRecord` has never been written yet — a
 * real Continue click, per `commitA01`, the same "existence of the
 * record IS the decision" doctrine T04-T08 already use.
 */
export function needsA01(content: MemorialContent): boolean {
  const read = readDeathNoticeForEditing(content);
  if (read.status !== "ready") return true;
  return !isA01Complete(content);
}

/** A02's real persisted outcome: has the family ever left A02,
 * whichever way (with or without any precision)? */
export function isA02Resolved(content: MemorialContent): boolean {
  const status = readGuidedFlowState(content).A02?.status;
  return status === "completed" || status === "skipped";
}

/** A02 is shown once A01 is genuinely behind the family (never before —
 * a corrupted or unfinished A01 always routes back to A01 first) and
 * until A02 itself has been treated once, whichever way. */
export function needsA02(content: MemorialContent): boolean {
  if (needsA01(content)) return false;
  return !isA02Resolved(content);
}

// ---------------------------------------------------------------------
// Progress — reuses the real Mission 025 engine, never a hand-picked
// constant (mirrors hero-step.ts's own `heroStepProgress`).
// ---------------------------------------------------------------------

/**
 * A normalized 0..1 progress fraction for A01/A02, computed by feeding
 * the real engine the real, resolved flow state for this memorial —
 * `resolveHeroFlowState` already folds T03/T04/T07/T08's own live
 * derivation on top of whatever `content.guidedFlow` holds (A01/A02
 * included, verbatim — neither needs live derivation of its own, see
 * this module's own docstring), so this is the SAME resolved state
 * every other Guided Flow screen's progress bar reads, never a second,
 * A01/A02-only calculation.
 */
export function deathNoticeStepProgress(editorialContext: EditorialContext, content: MemorialContent): number {
  const hero = readHero(content);
  return guidedFlowProgress(humanFlowDefinition(editorialContext), resolveHeroFlowState(content, hero));
}

// ---------------------------------------------------------------------
// Writes — every one re-reads via inspectDeathNotice first (mission
// brief section 7: "inspectDeathNotice(content) -> si corrupted:
// REFUSER l'écriture"), so a corrupted stored Death Notice is refused
// rather than silently replaced.
// ---------------------------------------------------------------------

export type DeathNoticeFieldWriteResult =
  | { ok: true; content: MemorialContent }
  | { ok: false; reason: "corrupted" | DeathNoticeValidationReason };

/** A01 — sets `announcementText`. Never rejects on its own (a
 * blanks-only value normalizes to absent, per Mission 038) — the only
 * failure mode here is a corrupted stored Death Notice refusing the
 * write entirely. */
export function writeAnnouncementText(content: MemorialContent, value: string | null): DeathNoticeFieldWriteResult {
  const inspected = inspectDeathNotice(content);
  if (inspected.status === "corrupted") return { ok: false, reason: "corrupted" };
  return {
    ok: true,
    content: writeDeathNotice(content, setDeathNoticeAnnouncementText(inspected.deathNotice, value)),
  };
}

/** A02 — sets one precision field at a time, leaving the other four
 * (and `announcementText`) untouched. Same never-rejects rule as
 * `writeAnnouncementText`. */
export function writePrecision(
  content: MemorialContent,
  field: DeathNoticePrecisionField,
  value: string | null,
): DeathNoticeFieldWriteResult {
  const inspected = inspectDeathNotice(content);
  if (inspected.status === "corrupted") return { ok: false, reason: "corrupted" };
  return {
    ok: true,
    content: writeDeathNotice(content, setDeathNoticePrecision(inspected.deathNotice, field, value)),
  };
}

function hasAnyPrecision(precisions: DeathNoticePrecisions): boolean {
  return (
    precisions.generalLocation !== null ||
    precisions.familyMessage !== null ||
    precisions.thought !== null ||
    precisions.quote !== null ||
    precisions.other !== null
  );
}

/**
 * A01's own "Continue" — the ONLY place A01's real `StepRecord` ever
 * gets written (mission brief section 4): rejects up front (before any
 * write) if `announcementText` is still null — A01 is required and
 * non-passable, so its own Continue must never be reachable without a
 * real, non-empty family text (mission brief section 4: "A01 doit
 * contenir un vrai texte famille non vide"), and no artificial minimum
 * beyond that is imposed (mission brief section 4's own rule — a short
 * announcement is perfectly valid).
 */
export function commitA01(content: MemorialContent): DeathNoticeFieldWriteResult {
  const inspected = inspectDeathNotice(content);
  if (inspected.status === "corrupted") return { ok: false, reason: "corrupted" };
  if (inspected.deathNotice.announcementText === null) {
    return { ok: false, reason: "announcementText" };
  }

  const nextFlow = { ...readGuidedFlowState(content), A01: { status: "completed" } as StepRecord };
  return { ok: true, content: writeGuidedFlowState(content, nextFlow) };
}

/**
 * A02's own "Continuer" — writes A02's `StepRecord` as `"completed"`,
 * but only once at least one precision is genuinely present at the
 * moment of the click (mission brief section 9). Committing "completed"
 * with nothing entered is not a real outcome this function offers —
 * that is exactly `skipA02` below.
 */
export function commitA02(content: MemorialContent): DeathNoticeFieldWriteResult {
  const inspected = inspectDeathNotice(content);
  if (inspected.status === "corrupted") return { ok: false, reason: "corrupted" };
  if (!hasAnyPrecision(inspected.deathNotice.precisions)) {
    return { ok: false, reason: "precisions" };
  }

  const nextFlow = { ...readGuidedFlowState(content), A02: { status: "completed" } as StepRecord };
  return { ok: true, content: writeGuidedFlowState(content, nextFlow) };
}

/**
 * A02's own "Passer cette étape" — writes A02's `StepRecord` as
 * `"skipped"` unconditionally, never touching `precisions` (mission
 * brief section 8: "ne rien inventer ; ne rien ajouter dans
 * precisions"). Whatever `precisions` already holds — nothing, or an
 * autosaved partial entry the family is choosing to leave without
 * confirming — is preserved exactly as it was; only A01's normal
 * autosave/write path ever touches it.
 */
export function skipA02(content: MemorialContent): DeathNoticeFieldWriteResult {
  const inspected = inspectDeathNotice(content);
  if (inspected.status === "corrupted") return { ok: false, reason: "corrupted" };

  const nextFlow = { ...readGuidedFlowState(content), A02: { status: "skipped" } as StepRecord };
  return { ok: true, content: writeGuidedFlowState(content, nextFlow) };
}
