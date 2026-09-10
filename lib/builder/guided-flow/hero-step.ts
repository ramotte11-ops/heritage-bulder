import type { EditorialContext } from "@/config/memorial";
import type { MemorialContent } from "@/types/memorial";
import type { HeroContent, HeroDate } from "@/types/hero";
import {
  inspectHero,
  updateHero,
  setHeroBirth,
  setHeroDeath,
  setHeroDisplayName,
  setHeroShortPhrase,
  type HeroValidationReason,
} from "@/lib/memorial/hero";
import { guidedFlowProgress, type StepRecord } from "./engine";
import { humanFlowDefinition, STEP_IDS, type HumanFlowState, type StepId } from "./human-steps";

/**
 * Mission 032 — PAGE A (T03 nom affiché + T04 dates) and PAGE B (T05
 * quelques mots) as real, persisted Guided Flow steps.
 *
 * Pure, framework-free, no I/O — same discipline as engine.ts,
 * human-steps.ts and lib/memorial/hero.ts, which this module composes
 * rather than duplicates. Nothing here renders anything or decides any
 * wording (that is HeroIdentityStep.tsx / HeroPhraseStep.tsx); this is
 * only the seam between the canonical Hero model (Mission 031) and the
 * canonical Guided Flow engine (Mission 025).
 *
 * ## Why T03 stays derived but T04 is only PARTLY derived (QG micro-
 * correction)
 *
 * T03 ("displayName is valid") is fully DERIVABLE from the Hero content
 * itself: it has no "skipped" outcome (non-skippable in human-steps.ts),
 * so a valid `displayName` is unambiguous proof it is done.
 *
 * T04 is NOT symmetric. "At least one date present" is unambiguous
 * proof of `"completed"` and stays derived. But "zero dates" is NOT by
 * itself proof of anything: it is structurally identical whether the
 * family (a) never reached PAGE A, (b) is mid-visit and simply hasn't
 * typed a date yet, or (c) deliberately continued past PAGE A with no
 * date at all — and only (c) is a real `"skipped"`. Collapsing (b) and
 * (c) together (the original Mission 032 shipped this bug: an
 * autosaved `displayName` with zero dates was read back as T04
 * `"skipped"` even if the family had never clicked Continue, e.g. after
 * closing the browser mid-visit) would resume the family straight past
 * PAGE A the moment ANY name gets autosaved, silently dropping their
 * still-open chance to add a date. So `"skipped"` for T04 is real,
 * persisted `StepRecord` data — written only by `commitPageA`, the
 * moment the family actually clicks Continue with no date — never
 * inferred from the mere absence of one. `"completed"` always wins over
 * any stored `"skipped"` the instant a date is (re)added, so a family
 * that skipped once and comes back to add a date needs no extra
 * bookkeeping to "un-skip" T04 (see `resolveT04Record`).
 *
 * T05 needs the same real `StepRecord` treatment as T04's `"skipped"`
 * case, for the same underlying reason: a `shortPhrase` of `null` is
 * structurally identical whether the family has never seen PAGE B or
 * has already declined it, and the mission brief is explicit that a
 * fake non-empty phrase must never be written just to fake that
 * distinction (section 9). So T04's explicit skip and all of T05 use
 * the exact same mechanism: one real `StepRecord`, the type Mission 025
 * already defined for this purpose (mission brief section 9: "réutiliser
 * le mécanisme canonique de step facultative") — never a second,
 * bespoke flag.
 *
 * ## Where that record actually lives
 *
 * `draft.content` (`MemorialContent`) is keyed by `SectionId`
 * (config/sections.ts) — `guidedFlow` is deliberately NOT one, so it
 * never appears in the client-toggleable section list or the old
 * section-based Builder shell. It is still the same flexible JSONB
 * blob `content.hero` already lives in (no migration — mission brief
 * section 22), just a sibling key read/written only through the small,
 * defensive helpers below, which never trust its shape.
 */

/** The one extra key this module reads/writes on top of the ordinary
 * `MemorialContent` shape — never exposed outside this module; callers
 * only ever see plain `MemorialContent` in and out. */
interface GuidedFlowContent {
  guidedFlow?: unknown;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStepId(value: string): value is StepId {
  return (STEP_IDS as readonly string[]).includes(value);
}

function isStepRecord(value: unknown): value is StepRecord {
  if (!isPlainObject(value)) return false;
  if (value.status !== "completed" && value.status !== "skipped") return false;
  return !("answer" in value) || typeof value.answer === "string";
}

/**
 * Reads `content.guidedFlow` defensively: anything that isn't a
 * well-formed `{ [StepId]: StepRecord }` bag — missing, the wrong
 * type, an unknown step id, a malformed record — is simply dropped
 * entry by entry, never thrown. Fail-safe on purpose, the same way
 * `readHero` fails safe on a malformed `content.hero`: bad flow-
 * bookkeeping data must never take down the rest of the draft.
 */
export function readGuidedFlowState(content: MemorialContent): HumanFlowState {
  const raw = (content as GuidedFlowContent).guidedFlow;
  if (!isPlainObject(raw)) return {};

  const result: HumanFlowState = {};
  for (const [key, value] of Object.entries(raw)) {
    if (isStepId(key) && isStepRecord(value)) {
      result[key] = value;
    }
  }
  return result;
}

/** Writes the flow-state bag back, preserving every other content key
 * untouched — a plain shallow merge, same discipline as
 * `lib/memorial/hero.ts`'s `updateHero`. */
function writeGuidedFlowState(content: MemorialContent, flow: HumanFlowState): MemorialContent {
  return { ...content, guidedFlow: flow } as MemorialContent;
}

function hasAnyDate(hero: HeroContent): boolean {
  return hero.birth !== null || hero.death !== null;
}

/** T03's status, derived live from the Hero content every time — never
 * read back from storage. `undefined` (rather than an "incomplete"
 * record — engine.ts's own convention, see `stepRuntimeStatus`) means
 * `displayName` hasn't been set yet. */
function deriveT03Record(hero: HeroContent): StepRecord | undefined {
  return hero.displayName !== null ? { status: "completed" } : undefined;
}

/**
 * T04's status. `undefined` until `displayName` is set (PAGE A hasn't
 * really started). Once it is:
 *
 *  - at least one date present -> `"completed"`, derived, unconditional
 *    — the data itself is the proof, no explicit action required. This
 *    ALWAYS wins over a previously stored `"skipped"`: a family that
 *    skipped once and comes back to add a date needs no separate
 *    "un-skip" step (mission brief's canonical rule: "T04 précédemment
 *    skipped puis famille revient et ajoute une date -> T04 completed").
 *  - zero dates -> resolves ONLY from a real, persisted `"skipped"`
 *    record, written exclusively by `commitPageA` at the moment the
 *    family actually clicks Continue with no date. Absent that record,
 *    this returns `undefined` ("incomplete") even with a perfectly
 *    valid, already-autosaved `displayName` — an empty date field is
 *    never, by itself, proof the family chose to leave it empty (QG
 *    micro-correction; see this module's own docstring).
 */
function resolveT04Record(content: MemorialContent, hero: HeroContent): StepRecord | undefined {
  if (hero.displayName === null) return undefined;
  if (hasAnyDate(hero)) return { status: "completed" };
  const stored = readGuidedFlowState(content).T04;
  return stored?.status === "skipped" ? stored : undefined;
}

/**
 * The full `HumanFlowState` this mission's steps contribute: whatever
 * was actually persisted (T04's explicit skip, T05, and anything a
 * future mission already wrote), with T03 and T04 always recomputed
 * fresh on top — `resolveT04Record`'s own resolution wins over
 * whatever raw record happens to be stored for T04, in both directions
 * (a stale/malformed one is ignored; a genuinely stored skip is kept
 * only while it is still the correct answer).
 */
export function resolveHeroFlowState(content: MemorialContent, hero: HeroContent): HumanFlowState {
  const result: HumanFlowState = { ...readGuidedFlowState(content) };

  const t03 = deriveT03Record(hero);
  if (t03) {
    result.T03 = t03;
  } else {
    delete result.T03;
  }

  const t04 = resolveT04Record(content, hero);
  if (t04) {
    result.T04 = t04;
  } else {
    delete result.T04;
  }

  return result;
}

/**
 * A normalized 0..1 progress fraction for PAGE A/PAGE B, computed by
 * feeding the REAL Mission 025 engine the real, resolved flow state for
 * this memorial's editorial context — never a hand-picked constant.
 * Reuses `guidedFlowProgress`/`humanFlowDefinition` unmodified (mission
 * brief section 8: audit, don't bricoler, the engine).
 */
export function heroStepProgress(
  editorialContext: EditorialContext,
  content: MemorialContent,
  hero: HeroContent,
): number {
  return guidedFlowProgress(humanFlowDefinition(editorialContext), resolveHeroFlowState(content, hero));
}

// ---------------------------------------------------------------------
// Reading the Hero for editing — corruption stays visible, never
// silently collapsed to empty (mission brief section 10; Mission 031's
// own `inspectHero` docstring).
// ---------------------------------------------------------------------

export type HeroEditState = { status: "ready"; hero: HeroContent } | { status: "corrupted" };

/**
 * The one read PAGE A/PAGE B use to seed their form. Built on
 * `inspectHero`, never `readHero`: a `"corrupted"` stored Hero must
 * surface as a distinct, honest state a screen can react to (refuse to
 * edit, show a calm notice) rather than silently starting the family
 * from an empty form that would overwrite the real, if malformed, data
 * the moment they typed anything.
 */
export function readHeroForEditing(content: MemorialContent): HeroEditState {
  const inspected = inspectHero(content);
  if (inspected.status === "corrupted") return { status: "corrupted" };
  return { status: "ready", hero: inspected.hero };
}

// ---------------------------------------------------------------------
// Page gates — the single condition app/builder/[memorialId]/page.tsx
// checks, same discipline as T01's `language === null` / T02's
// `editorialContext === null`.
// ---------------------------------------------------------------------

/**
 * PAGE A (T03 + T04) is shown whenever the Hero cannot be safely edited
 * from (corrupted), has no `displayName` yet, OR T04 is not yet
 * resolved — which, per `resolveT04Record`, means: zero dates AND no
 * explicit skip ever recorded via `commitPageA`. An autosaved
 * `displayName` with no date and no Continue click therefore still
 * routes back to PAGE A on resume (QG micro-correction): the family
 * never actually left the page, so nothing was ever "treated".
 */
export function needsPageA(content: MemorialContent): boolean {
  const read = readHeroForEditing(content);
  if (read.status !== "ready") return true;
  if (read.hero.displayName === null) return true;
  return resolveT04Record(content, read.hero) === undefined;
}

/** T05's real persisted outcome: has the family ever left PAGE B,
 * whichever way (with or without a phrase)? */
export function isPageBComplete(content: MemorialContent): boolean {
  const status = readGuidedFlowState(content).T05?.status;
  return status === "completed" || status === "skipped";
}

/** PAGE B (T05) is shown once PAGE A is behind the family (never
 * before — a corrupted or nameless Hero always routes back to PAGE A
 * first, see `needsPageA`) and T05 itself has not been treated yet. */
export function needsPageB(content: MemorialContent): boolean {
  if (needsPageA(content)) return false;
  return !isPageBComplete(content);
}

// ---------------------------------------------------------------------
// Writes — every one re-reads via inspectHero first (mission brief
// section 10: "utiliser inspectHero() avant les chemins d'écriture"),
// so a corrupted stored Hero is refused rather than silently replaced.
// ---------------------------------------------------------------------

export type HeroFieldWriteResult =
  | { ok: true; content: MemorialContent }
  | { ok: false; reason: "corrupted" | HeroValidationReason };

/** T03 — sets `displayName`. Never rejects on its own (a blanks-only
 * value normalizes to absent, per Mission 031) — the only failure mode
 * here is a corrupted stored Hero refusing the write entirely. */
export function writeDisplayName(content: MemorialContent, value: string | null): HeroFieldWriteResult {
  const inspected = inspectHero(content);
  if (inspected.status === "corrupted") return { ok: false, reason: "corrupted" };
  return { ok: true, content: updateHero(content, setHeroDisplayName(inspected.hero, value)) };
}

/** T04 — sets `birth`. Rejects a malformed date or a certainly-
 * impossible chronology (Mission 031's own `setHeroBirth`) — the caller
 * (HeroDateField) never commits either candidate, so `content` only
 * ever holds values that already passed this check. */
export function writeBirth(content: MemorialContent, date: HeroDate | null): HeroFieldWriteResult {
  const inspected = inspectHero(content);
  if (inspected.status === "corrupted") return { ok: false, reason: "corrupted" };
  const result = setHeroBirth(inspected.hero, date);
  if (!result.ok) return { ok: false, reason: result.reason };
  return { ok: true, content: updateHero(content, result.hero) };
}

/** T04 — sets `death`. Same rules as `writeBirth`. */
export function writeDeath(content: MemorialContent, date: HeroDate | null): HeroFieldWriteResult {
  const inspected = inspectHero(content);
  if (inspected.status === "corrupted") return { ok: false, reason: "corrupted" };
  const result = setHeroDeath(inspected.hero, date);
  if (!result.ok) return { ok: false, reason: result.reason };
  return { ok: true, content: updateHero(content, result.hero) };
}

/** T05 — sets `shortPhrase`. Never rejects on its own, same reasoning
 * as `writeDisplayName`. */
export function writeShortPhrase(content: MemorialContent, value: string | null): HeroFieldWriteResult {
  const inspected = inspectHero(content);
  if (inspected.status === "corrupted") return { ok: false, reason: "corrupted" };
  return { ok: true, content: updateHero(content, setHeroShortPhrase(inspected.hero, value)) };
}

/**
 * PAGE A's own "Continue" — the one moment T04's real `"skipped"`
 * `StepRecord` gets written, and ONLY when it is actually needed: zero
 * dates present. With at least one date, `resolveT04Record` already
 * derives `"completed"` unconditionally, so there is nothing to persist
 * — this is a deliberate no-op content passthrough in that case, never
 * a redundant write that could later go stale. Rejects up front (before
 * any write) if `displayName` is still null: T03 is required, and
 * PAGE A's own Continue must never be reachable without it — this is a
 * defensive re-check, the same discipline `setHeroBirth`/`setHeroDeath`
 * already apply to chronology, not a trust boundary the UI is expected
 * to bypass.
 */
export function commitPageA(content: MemorialContent): HeroFieldWriteResult {
  const inspected = inspectHero(content);
  if (inspected.status === "corrupted") return { ok: false, reason: "corrupted" };
  if (inspected.hero.displayName === null) return { ok: false, reason: "displayName" };

  if (hasAnyDate(inspected.hero)) {
    return { ok: true, content };
  }

  const nextFlow = { ...readGuidedFlowState(content), T04: { status: "skipped" as const } };
  return { ok: true, content: writeGuidedFlowState(content, nextFlow) };
}

/**
 * PAGE B's own "Continue" — the one moment T05's real `StepRecord` gets
 * written: `"completed"` if the family's current `shortPhrase` is set,
 * `"skipped"` if they are leaving with none (mission brief section 9:
 * a clean distinction between "no phrase chosen" and "invalid data" —
 * there is no invalid state here at all, only chosen-or-not). Every
 * other `guidedFlow` entry already stored is preserved untouched.
 */
export function commitPageB(content: MemorialContent): HeroFieldWriteResult {
  const inspected = inspectHero(content);
  if (inspected.status === "corrupted") return { ok: false, reason: "corrupted" };

  const t05: StepRecord = { status: inspected.hero.shortPhrase !== null ? "completed" : "skipped" };
  const nextFlow = { ...readGuidedFlowState(content), T05: t05 };
  return { ok: true, content: writeGuidedFlowState(content, nextFlow) };
}
