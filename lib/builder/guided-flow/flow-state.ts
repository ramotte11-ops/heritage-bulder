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

/**
 * Every entry of the STORED `content.guidedFlow` bag whose key is not a
 * `StepId` this build knows, kept verbatim — whatever its value. `[]`
 * when the bag itself is missing or not a plain object (there is then
 * nothing addressable to keep).
 */
function unknownStepEntries(content: MemorialContent): [string, unknown][] {
  const raw = (content as GuidedFlowContent).guidedFlow;
  if (!isPlainObject(raw)) return [];
  return Object.entries(raw).filter(([key]) => !isStepId(key));
}

/**
 * Writes the flow-state bag back, preserving every other content key
 * untouched — a plain shallow merge, same discipline as
 * `lib/memorial/hero.ts`'s `updateHero` and `lib/memorial/death-notice.ts`'s
 * `writeDeathNotice`.
 *
 * ## Mission B02-L1 — a save never deletes a key this build doesn't know
 *
 * Every per-step write is `writeGuidedFlowState(content,
 * { ...readGuidedFlowState(content), X })`, and `readGuidedFlowState`
 * drops unknown ids on purpose. Writing that filtered state back as the
 * WHOLE bag used to erase every unknown key on the next Continue/Skip/
 * reopen click — e.g. a step record written by a newer release, read
 * back after a rollback to this one (B01 report, risk R4).
 *
 * So the bag written is: every unknown-id entry of the stored bag,
 * verbatim, then `flow`. For a KNOWN id, `flow` stays the sole
 * authority, exactly as before — present means written, absent means
 * removed (which is how `reopenPageC`/`reopenA01`/`reopenA02` un-mark a
 * step), and a malformed known-id record is still dropped. Business
 * reads are unchanged: `readGuidedFlowState` still never returns an
 * unknown id.
 *
 * `Object.fromEntries` (rather than assigning keys one by one) keeps a
 * stored key such as `"__proto__"` an ordinary own property instead of
 * a prototype change.
 */
export function writeGuidedFlowState(content: MemorialContent, flow: HumanFlowState): MemorialContent {
  const guidedFlow = Object.fromEntries([...unknownStepEntries(content), ...Object.entries(flow)]);
  return { ...content, guidedFlow } as MemorialContent;
}
