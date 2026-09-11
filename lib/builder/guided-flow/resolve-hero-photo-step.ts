import type { MediaEngineDeps } from "@/lib/media/media-engine";
import type { HeritageActor } from "@/lib/auth/heritage-actor";
import type { DraftRepository } from "@/lib/adapters/draft-repository";
import type { MemorialContent } from "@/types/memorial";
import type { Media } from "@/types/media";
import { listMemorialMedia, createMediaReadUrl } from "@/lib/media/read-media";
import { deleteMedia } from "@/lib/media/delete-media";
import { reconcileHeroPhotoMedia, readHeroForEditing } from "./hero-step";

/**
 * Mission 033 — everything `app/builder/[memorialId]/page.tsx` needs to
 * render PAGE C (T06), composed from the already-tested Mission
 * 030/031/032 primitives rather than a new one — the same discipline as
 * `lib/builder/resume-session.ts`: no JSX, no direct Supabase import
 * (every real read/write happens through the injected `deps`), fully
 * testable with the same in-memory fakes `lib/media/test-fixtures.ts`
 * already provides for Mission 030.
 *
 * `resolveHeroPhotoStepData` (PAGE C's own full data resolution) and
 * `reconcileHeroMediaOnResume` (the QG follow-up below) both build on
 * the SAME `reconcileAndRetireHeroMedia` — one reconciliation, one
 * cleanup pass, two callers, never two implementations.
 *
 * Three things happen inside `reconcileAndRetireHeroMedia`, in order,
 * every time it runs:
 *
 *   1. the section 14 compensation path — `reconcileHeroPhotoMedia`
 *      against every `"hero"`-purpose `"ready"` media this memorial
 *      actually has in Storage/DB, persisted immediately if it changed
 *      anything, so a media that finalized successfully but never got
 *      linked (a lost connection right after the response) is adopted
 *      back into the Hero the very next time this runs;
 *   2. QG follow-up — the DURABLE retry for a "Changer la photo" retire
 *      that failed AFTER the new mediaId was already adopted (see
 *      `retireStaleHeroMedia`'s own docstring below): once, and only
 *      once, the canonical mediaId for THIS read is known — either it
 *      was already the one stored, or step 1 just adopted and persisted
 *      it — every OTHER `"hero"`-purpose `"ready"` media this memorial
 *      holds is a stale replacement retry never finished, and this
 *      best-effort retries retiring each one. Nothing here is a new
 *      engine: it reuses `lib/media/delete-media.ts`'s `deleteMedia`,
 *      the exact primitive `retireHeroPhotoUploadAction` already calls.
 *
 * `resolveHeroPhotoStepData` (PAGE C only) additionally mints:
 *
 *   3. a short-lived signed read URL for whatever photo the (now
 *      reconciled) Hero references, if any — Mission 030's own private-
 *      read mechanism (`lib/media/read-media.ts`), minted fresh here and
 *      never persisted anywhere (mission brief section 16).
 *
 * ## QG follow-up #2 — cleanup must outlive T06 itself
 *
 * `page.tsx` only calls `resolveHeroPhotoStepData` while `needsPageC` is
 * true — i.e. before the family's Continue click on PAGE C. A retire
 * that fails on the VERY LAST replacement, right before that click,
 * would otherwise never be retried again: once T06 is `"completed"`,
 * PAGE C is never shown again, so nothing would ever call
 * `resolveHeroPhotoStepData` for that memorial again.
 *
 * `reconcileHeroMediaOnResume` is the fix: the same reconciliation +
 * cleanup pass, with no PAGE C data (no read URL) to build, called from
 * `page.tsx` on EVERY Builder load once PAGE A, PAGE B and T06 are all
 * genuinely behind the family — the one Builder loading path that
 * already runs after T06, reused rather than a new sweep/cron. It is
 * durable (retried on every such load), idempotent (`deleteMedia`
 * converges regardless of how many times it runs), and preserves the
 * exact same ordering guarantee: reconcile-and-persist an eventual
 * still-unadopted `ready` media FIRST, only then retire what is left
 * over — see `reconcileAndRetireHeroMedia`.
 */
export interface HeroPhotoStepData {
  /** The draft content PAGE C should actually render from — identical to
   * the one passed in, unless reconciliation changed and persisted it. */
  content: MemorialContent;
  /** The Hero's current photo, ready to display — `null` when there is
   * none yet (a brand-new PAGE C, or a photo that never actually became
   * usable). */
  initialPhoto: { media: Media; readUrl: string } | null;
}

export interface ResolveHeroPhotoStepDeps {
  mediaEngine: MediaEngineDeps;
  draftRepository: Pick<DraftRepository, "saveDraftContent">;
}

/**
 * QG follow-up to Mission 033's replacement-ordering correction — the
 * DURABLE half of "retire the previous media only after the new one is
 * canonical" (see `media-actions.ts`'s docstring for the write-time
 * half). `HeroPhotoStep.tsx`'s own best-effort `retireUpload` call at
 * upload time can fail (a dropped connection, a transient Storage
 * error) with nothing left to retry it — `deleteMedia` being idempotent
 * is not, by itself, a retry mechanism if nothing ever calls it again.
 *
 * This is that "again": called every time PAGE C's data is resolved
 * (i.e. every time `needsPageC` is true — the family hasn't clicked
 * Continue on PAGE C yet), with `canonicalMediaId` already confirmed —
 * either it was the mediaId already stored, or `reconcileHeroPhotoMedia`
 * just adopted and PERSISTED it (never before that persist has actually
 * happened — see the caller). Every OTHER `"hero"`-purpose `"ready"`
 * media this memorial holds is, by construction, a replacement that
 * already lost the race: superseded by the canonical one, and only
 * still `"ready"` because a previous retire attempt for it failed. Each
 * is retried here, one at a time, through the exact same
 * `lib/media/delete-media.ts` primitive `retireHeroPhotoUploadAction`
 * uses — never a second delete mechanism.
 *
 * Every failure is swallowed: this is a best-effort cleanup pass on a
 * read path, not a write the caller is allowed to fail over. A retry
 * that fails again simply leaves the same stale row for the NEXT read
 * to retry — durable and idempotent by construction, with no state of
 * its own to track "how many times" (nothing here needs one: `deleteMedia`
 * converges to the same end state no matter how many times it runs).
 *
 * The canonical mediaId itself is structurally excluded from the
 * candidates (`!== canonicalMediaId`) — this function cannot delete it
 * even if it wanted to, which is what makes "never touches the media
 * currently canonical in the draft" a fact about the code rather than a
 * discipline a caller has to remember.
 */
async function retireStaleHeroMedia(
  deps: ResolveHeroPhotoStepDeps,
  actor: HeritageActor,
  memorialId: string,
  readyHeroMedia: readonly Media[],
  canonicalMediaId: string,
): Promise<void> {
  const stale = readyHeroMedia.filter((media) => media.id !== canonicalMediaId);

  for (const media of stale) {
    try {
      await deleteMedia(deps.mediaEngine, actor, { memorialId, mediaId: media.id });
    } catch {
      // Deliberately ignored — see this function's own docstring. The
      // next read (another PAGE C load) retries it.
    }
  }
}

interface ReconciledHeroMedia {
  /** The draft content, identical to the one passed in unless
   * reconciliation changed and persisted it. */
  content: MemorialContent;
  /** Every `"hero"`-purpose `"ready"` media this memorial holds AT THE
   * MOMENT this ran — already-retired stale ones removed by side
   * effect, so a caller that lists again would see fewer. Returned so
   * `resolveHeroPhotoStepData` can find the canonical one's row without
   * a second `listMemorialMedia` call. */
  readyHeroMedia: readonly Media[];
  /** The canonical media, when one could be confirmed — `null` for an
   * absent/corrupted Hero or one whose stored mediaId matches no real
   * ready media (still pending, foreign, or simply none exist). */
  canonical: Media | null;
}

/**
 * THE shared reconciliation + durable cleanup pass — see this module's
 * own docstring for the full ordering rationale. Both
 * `resolveHeroPhotoStepData` (PAGE C) and `reconcileHeroMediaOnResume`
 * (every Builder load once T06 is behind the family) call this and
 * this alone; neither re-implements any part of it.
 */
async function reconcileAndRetireHeroMedia(
  deps: ResolveHeroPhotoStepDeps,
  actor: HeritageActor,
  memorialId: string,
  content: MemorialContent,
): Promise<ReconciledHeroMedia> {
  const heroMedia = await listMemorialMedia(deps.mediaEngine, actor, {
    memorialId,
    purpose: "hero",
  });
  // `listMemorialMedia` already returns `"ready"` media only, newest
  // first — see lib/media/read-media.ts. A refusal (denied/unavailable)
  // degrades to "nothing to reconcile against" rather than throwing:
  // this is a best-effort compensation pass, not the authorization
  // decision itself, which the caller (page.tsx) has already made
  // before ever reaching this function.
  const readyHeroMedia = heroMedia.ok ? heroMedia.value : [];

  // Step 1 — reconcile and PERSIST an eventual still-unadopted `ready`
  // media BEFORE anything below ever considers cleaning anything up.
  let resolvedContent = content;
  const reconciled = reconcileHeroPhotoMedia(content, readyHeroMedia);
  if (reconciled.ok && reconciled.content !== content) {
    await deps.draftRepository.saveDraftContent(memorialId, reconciled.content);
    resolvedContent = reconciled.content;
  }

  const read = readHeroForEditing(resolvedContent);
  if (read.status !== "ready" || read.hero.photo === null) {
    // No canonical mediaId could be confirmed for this read (an absent
    // or corrupted Hero) — nothing is retired. A `"ready"` media whose
    // adoption is not yet resolved must never be touched by cleanup
    // (QG rule): this early return is what guarantees that structurally,
    // not merely by convention.
    return { content: resolvedContent, readyHeroMedia, canonical: null };
  }

  const canonicalMediaId = read.hero.photo.mediaId;
  const canonical = readyHeroMedia.find((candidate) => candidate.id === canonicalMediaId) ?? null;

  // Step 2 — only once a REAL, ready media backs the canonical mediaId
  // do we retry retiring the others — never on the strength of a stored
  // mediaId alone (which could reference a still-pending or foreign
  // media `reconcileHeroPhotoMedia` deliberately left untouched).
  if (canonical !== null) {
    await retireStaleHeroMedia(deps, actor, memorialId, readyHeroMedia, canonicalMediaId);
  }

  return { content: resolvedContent, readyHeroMedia, canonical };
}

export async function resolveHeroPhotoStepData(
  deps: ResolveHeroPhotoStepDeps,
  actor: HeritageActor,
  memorialId: string,
  content: MemorialContent,
): Promise<HeroPhotoStepData> {
  const { content: resolvedContent, canonical } = await reconcileAndRetireHeroMedia(
    deps,
    actor,
    memorialId,
    content,
  );

  if (canonical === null) {
    return { content: resolvedContent, initialPhoto: null };
  }

  const displayable = await createMediaReadUrl(deps.mediaEngine, actor, {
    memorialId,
    mediaId: canonical.id,
  });
  if (!displayable.ok) {
    return { content: resolvedContent, initialPhoto: null };
  }

  return {
    content: resolvedContent,
    initialPhoto: { media: canonical, readUrl: displayable.value.readUrl },
  };
}

/**
 * QG follow-up #2 — see this module's own docstring section on why
 * cleanup must outlive T06. Identical reconciliation + durable retry as
 * `resolveHeroPhotoStepData`, minus the PAGE C-only signed read URL:
 * called from `page.tsx` on every Builder load once PAGE A, PAGE B and
 * T06 are all genuinely behind the family (i.e. exactly where
 * `needsPageC` would now return `false`), so a retire that failed on
 * the family's very last replacement — right before their Continue
 * click — still gets retried on their next visit, instead of being
 * abandoned the moment T06 became `"completed"`.
 *
 * Returns the (possibly reconciled) content so the caller can feed the
 * up-to-date draft onward (e.g. into `BuilderShell`) rather than the
 * raw, pre-reconciliation one it was handed.
 */
export async function reconcileHeroMediaOnResume(
  deps: ResolveHeroPhotoStepDeps,
  actor: HeritageActor,
  memorialId: string,
  content: MemorialContent,
): Promise<MemorialContent> {
  const { content: resolvedContent } = await reconcileAndRetireHeroMedia(deps, actor, memorialId, content);
  return resolvedContent;
}
