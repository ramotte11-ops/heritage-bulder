import type { MemorialContent } from "@/types/memorial";
import type { EditorialContext } from "@/config/memorial";
import type { GalleryContent } from "@/types/gallery";
import { inspectGallery } from "@/lib/memorial/gallery-content";
import { readHero } from "@/lib/memorial/hero";
import { guidedFlowProgress, type StepRecord } from "./engine";
import { readGuidedFlowState, writeGuidedFlowState } from "./flow-state";
import { humanFlowDefinition } from "./human-steps";
import { resolveHeroFlowState } from "./hero-step";
import { isPersonSheetResolved } from "./person-sheet-step";

/**
 * A13 — "Vos souvenirs en images": the Guided Flow moment of the Gallery.
 * Same page-gate discipline as `person-sheet-step.ts` / `traditions-step.ts`:
 * the step is shown once the previous one is genuinely behind the family,
 * and only until A13's own `StepRecord` exists.
 *
 * ## What belongs to the step, and what does not
 *
 * This module owns ONLY A13's `StepRecord`. The Gallery itself
 * (`content.gallery`, lib/memorial/gallery-content.ts) is section-based
 * content: its edits never read or write A13, and nothing here ever
 * touches the photographs, their order or their captions. That is what
 * lets a future revision surface — or a Remembrance memorial, which has
 * no A13 — edit the Gallery without depending on this step.
 *
 * ## Continue vs. Skip
 *
 * Both resolve the step; neither touches a single photograph.
 *  - `commitA13` ("Continuer"): `"completed"` when the Gallery holds at
 *    least one photograph, `"skipped"` when it holds none — the same
 *    per-matière rule `commitPersonSheet` applies (text present ->
 *    completed, empty -> skipped). Continue is never blocked to force
 *    photographs (QG: the step is facultative).
 *  - `skipA13` ("Passer cette étape"): `"skipped"`, whatever the Gallery
 *    already holds — photographs already added stay in the draft.
 * Both refuse on a corrupted Gallery rather than resolving a step over
 * content nobody can read.
 */

export type GalleryStepEditState = { status: "ready"; gallery: GalleryContent } | { status: "corrupted" };

/** The one read the Gallery screen seeds itself from — corruption stays visible, never collapsed to empty. */
export function readGalleryForEditing(content: MemorialContent): GalleryStepEditState {
  const inspected = inspectGallery(content);
  return inspected.status === "corrupted" ? { status: "corrupted" } : { status: "ready", gallery: inspected.gallery };
}

/** A13's real persisted outcome: has the family ever left the step, whichever way? */
export function isA13Resolved(content: MemorialContent): boolean {
  const status = readGuidedFlowState(content).A13?.status;
  return status === "completed" || status === "skipped";
}

/** Shown once the A10–A12 sheet is behind the family, and until A13 itself has been treated once. */
export function needsA13(content: MemorialContent): boolean {
  if (!isPersonSheetResolved(content)) return false;
  return !isA13Resolved(content);
}

/** The real engine's progress — never a hand-picked constant. */
export function galleryStepProgress(editorialContext: EditorialContext, content: MemorialContent): number {
  return guidedFlowProgress(humanFlowDefinition(editorialContext), resolveHeroFlowState(content, readHero(content)));
}

export type GalleryStepWriteResult = { ok: true; content: MemorialContent } | { ok: false; reason: "corrupted" };

function writeA13(content: MemorialContent, record: StepRecord): GalleryStepWriteResult {
  return { ok: true, content: writeGuidedFlowState(content, { ...readGuidedFlowState(content), A13: record }) };
}

/** "Continuer": completed with photographs, skipped without — the Gallery itself is never touched. */
export function commitA13(content: MemorialContent): GalleryStepWriteResult {
  const read = readGalleryForEditing(content);
  if (read.status !== "ready") return { ok: false, reason: "corrupted" };
  return writeA13(content, { status: read.gallery.items.length > 0 ? "completed" : "skipped" });
}

/** "Passer cette étape": skipped, keeping every photograph already added. */
export function skipA13(content: MemorialContent): GalleryStepWriteResult {
  const read = readGalleryForEditing(content);
  if (read.status !== "ready") return { ok: false, reason: "corrupted" };
  return writeA13(content, { status: "skipped" });
}
