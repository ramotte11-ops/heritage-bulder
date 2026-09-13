import type { MemorialContent } from "@/types/memorial";
import type { EditorialContext } from "@/config/memorial";
import type { DeathNoticeContent, DeathNoticePrecisions } from "@/types/death-notice";
import {
  inspectDeathNotice,
  readDeathNotice,
  setDeathNoticeAnnouncementText,
  setDeathNoticePrecision,
  writeDeathNotice,
  type DeathNoticePrecisionField,
  type DeathNoticeValidationReason,
} from "@/lib/memorial/death-notice";
import { inspectHero, readHero } from "@/lib/memorial/hero";
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

/**
 * A03 — the Death Notice preview (Mission 039B). Reuses the exact same
 * `content.guidedFlow` bag A01/A02 already write through, and the exact
 * same `StepRecord` shape the engine already defines (engine.ts) — no
 * second model, no migration (AGENTS.md Mission 039B section 17).
 *
 * ## Verification, not autosave (mission brief section 15)
 *
 * A03's own "Continuer" means the family has SEEN and VERIFIED this
 * exact rendered Avis — never merely that A03 was displayed once. Its
 * `StepRecord` is written, exactly like A01/A02's, only at that explicit
 * click (`commitA03`), never derived from the mere fact that the screen
 * rendered.
 *
 * ## Invalidation via a deterministic content fingerprint (mission brief
 * sections 16-17)
 *
 * The QG's own preferred strategy: rather than scattering an "invalidate
 * A03" call across every earlier Hero/Death-Notice write path (T03-T08,
 * A01, A02), A03 alone knows whether the version it last verified still
 * matches the CURRENT content. `StepRecord.answer` (engine.ts) already
 * exists as an opaque string a step may use for its own purposes — this
 * is that seam, reused rather than extended: `commitA03` stores a short,
 * deterministic fingerprint of exactly the fields A03 actually displays,
 * and `isA03Complete` recomputes that same fingerprint live and compares.
 * A mismatch means some displayed field changed since the family last
 * verified — `isA03Complete` then reads `false`, `needsA03` shows A03
 * again, with NO explicit "invalidate" call required anywhere else in the
 * codebase (mirrors `hero-step.ts`'s own `resolveT04Record`/`isPageDComplete`
 * doctrine: a live re-check wins over a stale stored "completed", rather
 * than every writer having to remember to clear it).
 *
 * `deathNoticePreviewFingerprint` hashes (never stores verbatim) exactly:
 * `hero.displayName`, `hero.birth`, `hero.death`,
 * `deathNotice.announcementText`, and all five `deathNotice.precisions`
 * fields — precisely AGENTS.md section 16's closed list of "données
 * affichées dans A03". Deliberately EXCLUDED: `hero.photo`/`crop` and
 * `hero.shortPhrase` — none of which A03 renders (section 16's own
 * explicit carve-out) — so replacing the Hero photo or editing the
 * short phrase never invalidates an already-verified A03.
 *
 * The hash itself is a small, dependency-free, non-cryptographic
 * checksum (FNV-1a, 32-bit) — not a security primitive, just a cheap,
 * deterministic equality fingerprint (mission brief's own "ne pas
 * introduire de crypto ou complexité inutile"). Storing the hash rather
 * than the fingerprinted fields themselves is also what keeps this from
 * becoming a second copy of the content (section 17's "ne pas dupliquer
 * le contenu complet") — `content.guidedFlow.A03.answer` never holds
 * more than a short opaque string, whatever the family's announcement
 * text and precisions actually contain.
 */

/** A small, deterministic, non-cryptographic string hash (FNV-1a,
 * 32-bit) — see this section's own docstring for why this is the right
 * tool here (an equality fingerprint, not a security boundary). Returns
 * a fixed-width lowercase hex string. */
function fnv1aHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * The exact fingerprint `commitA03` stores and `isA03Complete` compares
 * against — see this section's own docstring for the closed field list
 * and why a hash, not the raw content, is stored. Exported so a caller
 * that needs to construct an already-verified A03 fixture (this module's
 * own tests, `app/builder/[memorialId]/page.test.tsx`) can compute the
 * exact same value rather than guessing or duplicating this logic.
 */
export function deathNoticePreviewFingerprint(content: MemorialContent): string {
  const hero = readHero(content);
  const deathNotice = readDeathNotice(content);
  const payload = JSON.stringify({
    displayName: hero.displayName,
    birth: hero.birth,
    death: hero.death,
    announcementText: deathNotice.announcementText,
    precisions: {
      generalLocation: deathNotice.precisions.generalLocation,
      familyMessage: deathNotice.precisions.familyMessage,
      thought: deathNotice.precisions.thought,
      quote: deathNotice.precisions.quote,
      other: deathNotice.precisions.other,
    },
  });
  return fnv1aHash(payload);
}

/** A03's real persisted outcome: has the family explicitly verified A03
 * for the content EXACTLY as it stands right now? A stored `"completed"`
 * record whose `answer` no longer matches the live fingerprint reads as
 * NOT complete — the live re-check this section's docstring documents. */
export function isA03Complete(content: MemorialContent): boolean {
  const record = readGuidedFlowState(content).A03;
  if (record?.status !== "completed") return false;
  return record.answer === deathNoticePreviewFingerprint(content);
}

/** A03 is shown once A01 is genuinely complete AND A02 is genuinely
 * resolved (never before — mirrors `needsA02`'s own gate on `needsA01`)
 * and until A03 itself has been verified for the CURRENT content. */
export function needsA03(content: MemorialContent): boolean {
  if (needsA01(content)) return false;
  if (needsA02(content)) return false;
  return !isA03Complete(content);
}

/**
 * A03's own "Continuer" — the ONLY place A03's real `StepRecord` ever
 * gets written, always `"completed"`, always paired with the current
 * content's own fingerprint. Re-verifies its own preconditions rather
 * than trusting the page's gate (the same discipline `commitPageE`
 * applies via `isHeroComplete` before marking T08 done): refuses on a
 * corrupted Hero OR a corrupted Death Notice, refuses if `announcementText`
 * is somehow still null (A01 not genuinely done), and refuses if A02 has
 * never been resolved either way.
 */
export function commitA03(content: MemorialContent): DeathNoticeFieldWriteResult {
  const inspectedDeathNotice = inspectDeathNotice(content);
  if (inspectedDeathNotice.status === "corrupted") return { ok: false, reason: "corrupted" };

  const inspectedHero = inspectHero(content);
  if (inspectedHero.status === "corrupted") return { ok: false, reason: "corrupted" };

  if (inspectedDeathNotice.deathNotice.announcementText === null) {
    return { ok: false, reason: "announcementText" };
  }
  if (!isA02Resolved(content)) {
    return { ok: false, reason: "precisions" };
  }

  const answer = deathNoticePreviewFingerprint(content);
  const nextFlow = { ...readGuidedFlowState(content), A03: { status: "completed", answer } as StepRecord };
  return { ok: true, content: writeGuidedFlowState(content, nextFlow) };
}

/**
 * A03's "Modifier l'annonce" (AGENTS.md section 14) — NOT a second A01
 * screen and NOT itself an `announcementText` write: it only un-marks A01
 * as done by deleting its `StepRecord`, which is exactly what makes
 * `needsA01` (and therefore `needsA02`/`needsA03`, both gated behind it)
 * true again on the very next read. The family lands back on the exact
 * same `DeathNoticeAnnouncementStep` screen, their existing
 * `announcementText` still seeded (mission brief: "le retour en édition
 * ne doit supprimer aucune donnée"). No explicit A03 invalidation is
 * needed here either way: `commitA01` always runs again before A03 is
 * reachable, and by then `isA03Complete`'s own live fingerprint
 * comparison is what decides — identical if the family re-confirms the
 * exact same text, different (so A03 shows again) if they actually
 * changed it.
 */
export function reopenA01(content: MemorialContent): DeathNoticeFieldWriteResult {
  const inspected = inspectDeathNotice(content);
  if (inspected.status === "corrupted") return { ok: false, reason: "corrupted" };

  const nextFlow = { ...readGuidedFlowState(content) };
  delete nextFlow.A01;
  return { ok: true, content: writeGuidedFlowState(content, nextFlow) };
}

/**
 * A03's "Modifier les précisions" (AGENTS.md section 14) — mirrors
 * `reopenA01` exactly, one step down: un-marks only A02 as resolved
 * (deleting its `StepRecord`), leaving A01 and every stored precision
 * untouched. `needsA02` reads true again immediately, routing back to
 * `DeathNoticePrecisionsStep` with every already-entered precision still
 * seeded.
 */
export function reopenA02(content: MemorialContent): DeathNoticeFieldWriteResult {
  const inspected = inspectDeathNotice(content);
  if (inspected.status === "corrupted") return { ok: false, reason: "corrupted" };

  const nextFlow = { ...readGuidedFlowState(content) };
  delete nextFlow.A02;
  return { ok: true, content: writeGuidedFlowState(content, nextFlow) };
}
