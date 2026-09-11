import type { EditorialContext } from "@/config/memorial";
import type { MemorialContent } from "@/types/memorial";
import type { Media } from "@/types/media";
import type { HeroContent, HeroDate } from "@/types/hero";
import {
  inspectHero,
  updateHero,
  isHeroPhotoMediaUsable,
  setHeroBirth,
  setHeroDeath,
  setHeroDisplayName,
  setHeroPhotoMedia,
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
 * ## Why T03 stays derived but T04 is a real, explicit `StepRecord`
 * (QG final correction)
 *
 * T03 ("displayName is valid") is fully DERIVABLE from the Hero content
 * itself: it has no "skipped" outcome (non-skippable in human-steps.ts),
 * so a valid `displayName` is unambiguous proof it is done.
 *
 * T04 is NOT derivable from the Hero content alone, in EITHER direction.
 * Two earlier QG passes narrowed this down:
 *
 *   1. "zero dates" is not by itself proof of a skip — it's structurally
 *      identical whether the family never reached PAGE A, is mid-visit
 *      and simply hasn't typed a date yet, or deliberately continued
 *      with none. Only an explicit Continue click is real "skipped".
 *   2. Symmetrically, "at least one date present" is not by itself
 *      proof PAGE A was ever LEFT either — an autosaved date with the
 *      browser closed before Continue must still resume on PAGE A, not
 *      jump straight to PAGE B. So a date alone no longer derives
 *      `"completed"` — that also now requires the explicit click.
 *
 * The ONE exception, and the reason `"completed"` still wins over a
 * previously stored `"skipped"` without a second click: once T04 has
 * ALREADY been resolved once (any stored record exists at all — PAGE A
 * has genuinely been left, whichever way), a date later added while
 * revisiting always flips it to `"completed"` live, no new commit
 * required ("T04 précédemment skipped puis famille ajoute une date ->
 * T04 completed"). Before that first resolution, dates are just draft
 * content sitting on the page — see `resolveT04Record` for the exact
 * rule.
 *
 * So T04 needs a real, persisted `StepRecord`, written exclusively by
 * `commitPageA` at the moment of an actual Continue click — its
 * presence or absence is itself the canonical "has PAGE A been left"
 * marker; no second, separate page-visited flag is introduced.
 *
 * T05 needs the identical treatment, for the identical underlying
 * reason: a `shortPhrase` of `null` is structurally identical whether
 * the family has never seen PAGE B or has already declined it, and the
 * mission brief is explicit that a fake non-empty phrase must never be
 * written just to fake that distinction (section 9). T04 and T05 both
 * use the exact same mechanism: one real `StepRecord`, the type Mission
 * 025 already defined for this purpose (mission brief section 9:
 * "réutiliser le mécanisme canonique de step facultative") — never a
 * second, bespoke flag.
 *
 * ## Mission 033 — PAGE C (T06 photo Hero)
 *
 * T06 gets the same StepRecord treatment as T04/T05, for a related but
 * stricter reason: `human-steps.ts` already declares it
 * `required: true, skippable: false`, so its stored record only ever
 * legally holds `"completed"`. A `mediaId` sitting in the stored Hero is
 * NOT by itself proof the family left PAGE C — exactly T04's "a value
 * present is not proof the page was left" problem — so `commitPageC`
 * is the one place T06's record is ever written, at an actual Continue
 * click, and only once the referenced media is proven `"hero"`-purpose
 * and `"ready"` (never merely a `mediaId` string — mission brief section
 * 2: "aucun mémorial ne peut poursuivre sans photo Hero valide").
 * `reconcileHeroPhotoMedia` below is the section 14 compensation path:
 * pure, and given the caller's own I/O result, so a finalize that
 * succeeded but whose draft write then failed can never leave a `ready`
 * media invisibly orphaned — see its own docstring.
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
 * T04's status. `undefined` ("incomplete") whenever `displayName` is
 * still null (PAGE A hasn't really started) OR no `T04` `StepRecord`
 * has ever been persisted yet — the QG final correction: NEITHER "zero
 * dates" NOR "a date is present" is, by itself, proof PAGE A was ever
 * explicitly left. Only `commitPageA`'s own write (the real Continue
 * click) creates that first record, whichever value it holds.
 *
 * Once that record exists, a date present ALWAYS resolves to
 * `"completed"` live, overriding whatever was actually stored — so a
 * family that clicked Continue with none, then comes back and adds one,
 * needs no second click to "un-skip" T04 (mission brief's canonical
 * rule: "T04 précédemment skipped puis famille ajoute une date -> T04
 * completed"). With no date, the stored record itself is the answer
 * (normally `"skipped"`, or `"completed"` if a date was present at the
 * moment of that original commit and has since been removed again — an
 * edge case with no separate rule of its own, so the last real decision
 * simply stands rather than silently reverting to "incomplete").
 */
function resolveT04Record(content: MemorialContent, hero: HeroContent): StepRecord | undefined {
  if (hero.displayName === null) return undefined;
  const stored = readGuidedFlowState(content).T04;
  if (stored === undefined) return undefined;
  return hasAnyDate(hero) ? { status: "completed" } : stored;
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
 * from (corrupted), has no `displayName` yet, OR T04 has no persisted
 * `StepRecord` at all — per `resolveT04Record`, that record's mere
 * existence IS "PAGE A explicitly left", regardless of dates. So an
 * autosaved `displayName` (with or without a date) but no Continue
 * click yet still routes back to PAGE A on resume (QG final
 * correction): the family never actually left the page, so nothing was
 * ever "treated" — a date sitting in a field is draft content, not a
 * decision.
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
 * PAGE A's own "Continue" — the ONLY place T04's real `StepRecord` ever
 * gets its first write (QG final correction): `"completed"` if at least
 * one date is present at the moment of the click, `"skipped"` if none
 * is — always ONE of the two, never a no-op, because the record's mere
 * EXISTENCE is what `resolveT04Record` reads as "PAGE A has genuinely
 * been left" (mission brief's own canonical rule: "aucun StepRecord T04
 * -> PAGE A pas encore quittée explicitement ; T04 completed/skipped ->
 * PAGE A déjà validée"). Neither an autosaved name alone nor an
 * autosaved name-plus-date resolves T04 on its own — only this call
 * does. Rejects up front (before any write) if `displayName` is still
 * null: T03 is required, and PAGE A's own Continue must never be
 * reachable without it — a defensive re-check, the same discipline
 * `setHeroBirth`/`setHeroDeath` already apply to chronology, not a
 * trust boundary the UI is expected to bypass.
 */
export function commitPageA(content: MemorialContent): HeroFieldWriteResult {
  const inspected = inspectHero(content);
  if (inspected.status === "corrupted") return { ok: false, reason: "corrupted" };
  if (inspected.hero.displayName === null) return { ok: false, reason: "displayName" };

  const t04: StepRecord = { status: hasAnyDate(inspected.hero) ? "completed" : "skipped" };
  const nextFlow = { ...readGuidedFlowState(content), T04: t04 };
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

// ---------------------------------------------------------------------
// PAGE C — T06 (photo Hero, Mission 033). OBLIGATOIRE, NON PASSABLE
// (mission brief section 2): unlike T04/T05, its own `HeroContent` write
// (`writeHeroPhotoMedia`) never rejects on an empty value the way
// `writeDisplayName`/`writeShortPhrase` don't either, but its Guided
// Flow *commit* additionally refuses unless the referenced media is
// genuinely usable — see `commitPageC`.
// ---------------------------------------------------------------------

/** T06's real persisted outcome: has the family ever clicked Continue on
 * PAGE C? Mirrors `isPageBComplete`, but T06 being `skippable: false`
 * (human-steps.ts) means `"skipped"` is never a legitimate stored value
 * here — only `"completed"` counts, so a corrupted/stale `"skipped"`
 * record reads as not-yet-done rather than as a pass, exactly what
 * `stepRuntimeStatus`'s own fail-safe already does for the engine at
 * large (engine.ts's docstring). */
export function isPageCComplete(content: MemorialContent): boolean {
  return readGuidedFlowState(content).T06?.status === "completed";
}

/** PAGE C (T06) is shown once PAGE A and PAGE B are both behind the
 * family (never before) and T06 itself has not been explicitly
 * completed yet. */
export function needsPageC(content: MemorialContent): boolean {
  if (needsPageA(content)) return false;
  if (needsPageB(content)) return false;
  return !isPageCComplete(content);
}

/**
 * T06 — links the Hero's photo to a media id, guarded by `inspectHero`
 * like every other Hero write in this file. Deliberately does NOT check
 * the media is `"ready"` — that would need I/O this pure function
 * cannot perform, and a caller only ever calls this right after its own
 * successful finalize/replace (mission brief section 13: "la nouvelle
 * photo ne doit être liée au Hero qu'après finalisation réussie du
 * média" — the caller's own finalize/replace result IS that proof, this
 * function only records it). Writing this is intentionally NOT the same
 * moment T06's `StepRecord` is written (see `commitPageC`) — the mission
 * brief's own resume rule (section 18/19) needs the photo visible on
 * resume even if the family closes the browser before ever clicking
 * Continue, so this write must happen the instant a photo becomes ready,
 * not deferred to the Continue click.
 */
export function writeHeroPhotoMedia(content: MemorialContent, mediaId: string): HeroFieldWriteResult {
  const inspected = inspectHero(content);
  if (inspected.status === "corrupted") return { ok: false, reason: "corrupted" };
  const result = setHeroPhotoMedia(inspected.hero, mediaId);
  if (!result.ok) return { ok: false, reason: result.reason };
  return { ok: true, content: updateHero(content, result.hero) };
}

/**
 * PAGE C's own "Continue" — the ONLY place T06's real `StepRecord` ever
 * gets written, and always `"completed"`: T06 is not skippable, so there
 * is no `"skipped"` outcome for this page the way PAGE A/PAGE B have one
 * (mission brief section 2 — "OBLIGATOIRE, NON PASSABLE"). Refuses to
 * write anything at all unless `media` — the caller's own lookup of
 * `hero.photo.mediaId`, exactly `isHeroComplete`'s existing contract in
 * lib/memorial/hero.ts — proves the referenced media is really a
 * `"hero"`-purpose, `"ready"` upload. A `mediaId` alone, or a media that
 * is still `"pending"`, or one belonging to another purpose, is refused
 * with reason `"photo"` — the same defensive re-check discipline
 * `commitPageA` already applies to `displayName`, not a trust boundary
 * the UI is expected to uphold on its own.
 */
export function commitPageC(content: MemorialContent, media: Media | null): HeroFieldWriteResult {
  const inspected = inspectHero(content);
  if (inspected.status === "corrupted") return { ok: false, reason: "corrupted" };
  if (!isHeroPhotoMediaUsable(inspected.hero, media)) return { ok: false, reason: "photo" };

  const t06: StepRecord = { status: "completed" };
  const nextFlow = { ...readGuidedFlowState(content), T06: t06 };
  return { ok: true, content: writeGuidedFlowState(content, nextFlow) };
}

/**
 * Mission 033 section 14 — the compensation path for "finalize/replace
 * succeeded, the draft write that should have linked it (`writeHeroPhotoMedia`)
 * then failed" (a lost connection right after the response, a browser
 * closed mid-autosave-retry, ...). Reused every time PAGE A and PAGE B
 * are already behind the family, whether or not PAGE C turns out to
 * still be needed — see `resolveHeroPhotoStepData` (the one caller).
 *
 * Pure and I/O-free: `readyHeroMedia` must already be every `"hero"`-
 * purpose, `"ready"` media belonging to THIS memorial, newest first —
 * exactly what `lib/media/read-media.ts`'s `listMemorialMedia` already
 * returns (`MediaRepository.listForMemorial` orders by `created_at
 * desc`). The caller performs that one read; this function only decides
 * what the Hero should do with it.
 *
 * If the stored Hero already references one of them, this is a no-op —
 * the ordinary case on every single render, and it must stay cheap. If
 * it references none of them (no photo yet, or a stale/foreign/still-
 * pending id) and at least one ready hero media exists, the Hero adopts
 * the MOST RECENTLY CREATED one: Mission 030's own selection doctrine
 * (lib/media/replace-media.ts's docstring — "whoever consumes a hero
 * takes the most recently created ready one"), reused here rather than
 * reinvented. This is what turns an orphaned `ready` upload back into
 * the family's visible T06 photo the very next time the page is read,
 * with no separate cleanup job and no `ready` media ever silently
 * forgotten forever (mission brief section 14's own requirement).
 *
 * Never marks T06 `"completed"` by itself — only `commitPageC`'s own
 * explicit Continue click does that (mission brief section 18/19: a
 * photo becoming visible again on resume is not, on its own, the
 * family's decision to move on).
 */
export function reconcileHeroPhotoMedia(
  content: MemorialContent,
  readyHeroMedia: readonly Media[],
): HeroFieldWriteResult {
  const inspected = inspectHero(content);
  if (inspected.status === "corrupted") return { ok: false, reason: "corrupted" };

  const hero = inspected.hero;
  const currentMediaId = hero.photo?.mediaId ?? null;
  const alreadyLinked =
    currentMediaId !== null && readyHeroMedia.some((media) => media.id === currentMediaId);

  if (alreadyLinked || readyHeroMedia.length === 0) {
    return { ok: true, content };
  }

  // Newest first is the caller's contract (see this function's own
  // docstring) — the first entry IS "the most recently created ready
  // hero media".
  const [mostRecent] = readyHeroMedia;
  const result = setHeroPhotoMedia(hero, mostRecent.id);
  if (!result.ok) return { ok: false, reason: result.reason };
  return { ok: true, content: updateHero(content, result.hero) };
}
