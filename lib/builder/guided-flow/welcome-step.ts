import type { EditorialContext } from "@/config/memorial";
import type { MemorialContent } from "@/types/memorial";

/**
 * Builder Welcome — the one screen between T01 (language) and the rest
 * of the Guided Flow: "Chaque vie mérite d'être racontée."
 *
 * Pure, framework-free, no I/O — same discipline as every other module
 * in this folder.
 *
 * ## Not a Guided Flow step
 *
 * The Welcome asks nothing and records no answer, so it is deliberately
 * NOT a `StepId` in `human-steps.ts`: adding one would change every
 * screen's progress denominator (`guidedFlowProgress`) for a screen that
 * carries no progress bar of its own. Its only persisted trace is
 * `content.welcome`, written once, when the family presses the CTA.
 *
 * ## Shown once, never on a resumed draft
 *
 * `needsWelcome` is true only for a draft nobody has started: no
 * editorial context recorded yet AND a completely empty
 * `memorial_drafts.content` (the column's own `'{}'` default). Any
 * content at all — a Hero autosave, a Guided Flow record, or the
 * Welcome's own marker — means the family has already been here, so a
 * resumed draft (including every draft created before this screen
 * existed) never sees it again. A family that closes the page on the
 * Welcome itself, before pressing the CTA, has started nothing yet and
 * simply sees it again next time.
 */

/** The marker `commitWelcome` writes — never exposed outside this
 * module; callers only see plain `MemorialContent` in and out. */
interface WelcomeContent {
  welcome?: unknown;
}

export function needsWelcome(editorialContext: EditorialContext | null, content: MemorialContent): boolean {
  if (editorialContext !== null) return false;
  return Object.keys(content).length === 0;
}

/** The CTA's content-side write: records that the Welcome was passed,
 * preserving every other content key untouched (a plain shallow merge,
 * same discipline as `writeGuidedFlowState`). */
export function commitWelcome(content: MemorialContent): MemorialContent {
  const marker: WelcomeContent = { welcome: { status: "completed" } };
  return { ...content, ...marker } as MemorialContent;
}
