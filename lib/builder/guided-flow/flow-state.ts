import type { MemorialContent } from "@/types/memorial";
import type { StepRecord } from "./engine";
import { STEP_IDS, type HumanFlowState, type StepId } from "./human-steps";

/**
 * Mission 039 — the one `content.guidedFlow` bag every per-step module
 * reads/writes through.
 *
 * Extracted verbatim out of `hero-step.ts` (Mission 032-035 built this
 * defensive parsing once, for T03-T08): `death-notice-step.ts` (Mission
 * 039's own A01/A02) needs the EXACT same bag, the EXACT same fail-safe
 * parsing, and the EXACT same shallow-merge write — never a second
 * `content.guidedFlow`-shaped representation, never a second copy of
 * this logic silently drifting from the first (mission brief section 6:
 * "ne créer aucune seconde représentation"). `hero-step.ts` now imports
 * from here instead of defining its own private copy; its own
 * `readGuidedFlowState` re-export keeps every existing caller (including
 * its own tests) unchanged.
 */

/** The one extra key every per-step module reads/writes on top of the
 * ordinary `MemorialContent` shape — never exposed outside this module;
 * callers only ever see plain `MemorialContent` in and out. */
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
 * `lib/memorial/hero.ts`'s `updateHero` and `lib/memorial/death-notice.ts`'s
 * `writeDeathNotice`. */
export function writeGuidedFlowState(content: MemorialContent, flow: HumanFlowState): MemorialContent {
  return { ...content, guidedFlow: flow } as MemorialContent;
}
