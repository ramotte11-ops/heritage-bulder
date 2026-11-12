import type { EditorialContext } from "@/config/memorial";
import type { MemorialContent } from "@/types/memorial";
import { EMPTY_HERO_CONTENT } from "@/types/hero";

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
 * written once, when the family presses the CTA: `content.welcome` in
 * the guest Builder's local draft (`commitWelcome`), the empty Hero in
 * an authenticated durable draft (`commitAuthenticatedWelcome`).
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

/**
 * QG 008 Lot 2 — the AUTHENTICATED Builder's Welcome CTA (the guest
 * Builder and the demo keep `commitWelcome`).
 *
 * A durable draft can only be written through the audited, authorized
 * edit path, and `welcome` is no authorized edit target
 * (lib/memorial/edit-authorization.ts): the marker was refused, leaving
 * the family on the Welcome. Instead, the CTA records the canonical EMPTY
 * Hero (`EMPTY_HERO_CONTENT`, every field `null`) — the very shape the
 * first Hero screen writes next, already an authorized pre-publication
 * edit. The content is no longer empty, so `needsWelcome` is false and
 * the Welcome is never shown again; an empty Hero is not a complete one
 * (`isHeroContentComplete`), so nothing becomes publishable or visible.
 *
 * Only an absent (or `null`) Hero is filled; any other content is
 * returned untouched — an existing draft is never rewritten.
 */
export function commitAuthenticatedWelcome(content: MemorialContent): MemorialContent {
  const hero = (content as { hero?: unknown }).hero;
  if (hero !== undefined && hero !== null) return content;
  return { ...content, hero: { ...EMPTY_HERO_CONTENT } } as MemorialContent;
}
