import type { MemorialContent } from "@/types/memorial";
import { readHero } from "@/lib/memorial/hero";
import type { StepRecord } from "./engine";
import { readGuidedFlowState, writeGuidedFlowState } from "./flow-state";
import { A00_ANSWERS, isAnnouncementVisible, resolveA00Record, type A00Answer } from "./human-steps";
import { heroStepProgress, needsPageA } from "./hero-step";

/**
 * A00 — "Souhaitez-vous également publier une annonce de décès ?"
 *
 * Asked once, right after identity (PAGE A) and before the Hero, of
 * every family (B02-L2: no editorial-context choice any more). Three distinct, persisted answers in
 * `content.guidedFlow.A00` (the same bag every step writes through,
 * protected by B02-L1):
 *
 *   - "yes"   → `{ status: "completed", answer: "yes" }`: A01-A03 apply;
 *   - "no"    → `{ status: "completed", answer: "no" }`;
 *   - "later" → `{ status: "skipped", answer: "later" }`: decided later,
 *               never re-proposed automatically.
 *
 * Pure, framework-free, no I/O — same discipline as every other module
 * in this folder.
 *
 * ## What A00 never does
 *
 * It never reads or writes `content.deathNotice`, `content.ceremony` or
 * any other content key: changing the answer hides or shows the
 * announcement steps, it never deletes what the family already wrote.
 * It never publishes anything ("yes" only makes the announcement steps
 * applicable), and it never makes the ceremony (A04-A08) depend on it.
 */

/** The family's answer as the route sees it — explicit, or "yes" for a
 * pre-A00 draft that already validated its announcement — or `null`
 * while A00 has not been answered. */
export function readAnnouncementChoice(content: MemorialContent): A00Answer | null {
  const answer = resolveA00Record(readGuidedFlowState(content))?.answer;
  return answer !== undefined && (A00_ANSWERS as readonly string[]).includes(answer)
    ? (answer as A00Answer)
    : null;
}

/** True only for "yes": the announcement steps (A01-A03) are offered. */
export function isAnnouncementChosen(content: MemorialContent): boolean {
  return isAnnouncementVisible(readGuidedFlowState(content));
}

/** A00 is shown once PAGE A is behind the family (never before) and
 * until A00 has an answer — explicit or derived. */
export function needsA00(content: MemorialContent): boolean {
  if (needsPageA(content)) return false;
  return readAnnouncementChoice(content) === null;
}

export function isA00Answer(value: string): value is A00Answer {
  return (A00_ANSWERS as readonly string[]).includes(value);
}

export type AnnouncementChoiceWriteResult =
  | { ok: true; content: MemorialContent }
  | { ok: false; reason: "answer" };

/** A00's own "Continuer": records the answer, overwriting any earlier
 * one, and touches nothing else. Also the write a later revision screen
 * (B03) reuses to change the choice. */
export function commitA00(content: MemorialContent, answer: string): AnnouncementChoiceWriteResult {
  if (!isA00Answer(answer)) return { ok: false, reason: "answer" };
  const record: StepRecord =
    answer === "later" ? { status: "skipped", answer: "later" } : { status: "completed", answer };
  const nextFlow = { ...readGuidedFlowState(content), A00: record };
  return { ok: true, content: writeGuidedFlowState(content, nextFlow) };
}

/** The real engine's progress for this screen — same resolved state
 * every other Guided Flow screen reads. */
export function announcementChoiceProgress(content: MemorialContent): number {
  return heroStepProgress(content, readHero(content));
}
