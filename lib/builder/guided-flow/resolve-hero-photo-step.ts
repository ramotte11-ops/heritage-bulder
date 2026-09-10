import type { MediaEngineDeps } from "@/lib/media/media-engine";
import type { HeritageActor } from "@/lib/auth/heritage-actor";
import type { DraftRepository } from "@/lib/adapters/draft-repository";
import type { MemorialContent } from "@/types/memorial";
import type { Media } from "@/types/media";
import { listMemorialMedia, createMediaReadUrl } from "@/lib/media/read-media";
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
 * Two things happen here, in order, every time PAGE A and PAGE B are
 * already behind the family (the caller's job to check, via
 * `needsPageC` — see page.tsx):
 *
 *   1. the section 14 compensation path — `reconcileHeroPhotoMedia`
 *      against every `"hero"`-purpose `"ready"` media this memorial
 *      actually has in Storage/DB, persisted immediately if it changed
 *      anything, so a media that finalized successfully but never got
 *      linked (a lost connection right after the response) is adopted
 *      back into the Hero the very next time this page is read;
 *   2. a short-lived signed read URL for whatever photo the (now
 *      reconciled) Hero references, if any — Mission 030's own private-
 *      read mechanism (`lib/media/read-media.ts`), minted fresh here and
 *      never persisted anywhere (mission brief section 16).
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

export async function resolveHeroPhotoStepData(
  deps: ResolveHeroPhotoStepDeps,
  actor: HeritageActor,
  memorialId: string,
  content: MemorialContent,
): Promise<HeroPhotoStepData> {
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

  let resolvedContent = content;
  const reconciled = reconcileHeroPhotoMedia(content, readyHeroMedia);
  if (reconciled.ok && reconciled.content !== content) {
    await deps.draftRepository.saveDraftContent(memorialId, reconciled.content);
    resolvedContent = reconciled.content;
  }

  const read = readHeroForEditing(resolvedContent);
  if (read.status !== "ready" || read.hero.photo === null) {
    return { content: resolvedContent, initialPhoto: null };
  }

  const media = readyHeroMedia.find((candidate) => candidate.id === read.hero.photo!.mediaId) ?? null;
  if (media === null) {
    return { content: resolvedContent, initialPhoto: null };
  }

  const displayable = await createMediaReadUrl(deps.mediaEngine, actor, {
    memorialId,
    mediaId: media.id,
  });
  if (!displayable.ok) {
    return { content: resolvedContent, initialPhoto: null };
  }

  return {
    content: resolvedContent,
    initialPhoto: { media, readUrl: displayable.value.readUrl },
  };
}
