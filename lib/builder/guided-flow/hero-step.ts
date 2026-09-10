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
 * ## Why T05 is the only step actually STORED here
 *
 * T03 ("displayName is valid") and T04 ("the family left PAGE A, dates
 * or not") are both fully DERIVABLE from the Hero content itself — see
 * `deriveIdentityFlowRecords` below — so this module never persists a
 * second, potentially-stale flag for either of them (exactly the
 * discipline engine.ts's own docstring asks for: "the real data...
 * must remain the one source of truth, never a second, potentially-
 * stale index alongside it"). T05 cannot be derived the same way: a
 * `shortPhrase` of `null` is structurally identical whether the family
 * has never seen PAGE B or has already declined it, and the mission
 * brief is explicit that a fake non-empty phrase must never be written
 * just to fake that distinction (section 9). So — and only for T05 —
 * this module persists one real `StepRecord`, using the exact type
 * Mission 025 already defined for this purpose (mission brief section
 * 9: "réutiliser le mécanisme canonique de step facultative").
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

/**
 * T03 and T04's status, derived live from the Hero content every time
 * — never read back from storage. `displayName === null` means neither
 * has been reached yet (both stay absent from the returned bag, i.e.
 * "incomplete" once merged into a `HumanFlowState`). Once a
 * `displayName` is set, T03 is unconditionally `"completed"` and T04
 * resolves in the same instant: `"completed"` if the family entered
 * at least one date, `"skipped"` if they left PAGE A with zero dates —
 * exactly the mission brief's "T04 est considérée traitée lorsque la
 * famille quitte volontairement PAGE A, même avec zéro date" (section
 * 8), true by construction here because PAGE A's own gate (see
 * `needsPageA` below) requires a valid `displayName` before it can be
 * left at all.
 */
export function deriveIdentityFlowRecords(hero: HeroContent): Partial<Record<"T03" | "T04", StepRecord>> {
  if (hero.displayName === null) return {};
  const t04: StepRecord = hasAnyDate(hero) ? { status: "completed" } : { status: "skipped" };
  return { T03: { status: "completed" }, T04: t04 };
}

/**
 * The full `HumanFlowState` this mission's steps contribute: whatever
 * was actually persisted (T05, plus anything a future mission already
 * wrote) with T03/T04 always recomputed fresh from `hero` on top —
 * derived facts win over any stale stored copy, though none is ever
 * written for those two ids in the first place.
 */
export function resolveHeroFlowState(content: MemorialContent, hero: HeroContent): HumanFlowState {
  return { ...readGuidedFlowState(content), ...deriveIdentityFlowRecords(hero) };
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

/** PAGE A (T03 + T04) is shown whenever the Hero cannot be safely
 * edited from (corrupted) or has no `displayName` yet. */
export function needsPageA(content: MemorialContent): boolean {
  const read = readHeroForEditing(content);
  return read.status !== "ready" || read.hero.displayName === null;
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
