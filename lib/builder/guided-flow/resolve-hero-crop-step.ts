import type { MediaEngineDeps } from "@/lib/media/media-engine";
import type { HeritageActor } from "@/lib/auth/heritage-actor";
import type { MemorialContent } from "@/types/memorial";
import type { Media } from "@/types/media";
import { createMediaReadUrl } from "@/lib/media/read-media";
import { readHeroForEditing } from "./hero-step";

/**
 * Mission 034 — everything `app/builder/[memorialId]/page.tsx` needs to
 * render PAGE D (T07, the Hero photo crop), composed from the same
 * Mission 030/031 primitives `resolve-hero-photo-step.ts` already uses
 * for PAGE C — no second read mechanism.
 *
 * PAGE D is only ever reached once T06 is genuinely behind the family
 * (`needsPageC` is false — see `needsPageD`,
 * lib/builder/guided-flow/hero-step.ts), and `page.tsx` always resolves
 * this against the content Mission 033's own `reconcileHeroMediaOnResume`
 * has already reconciled for this exact load — so, unlike PAGE C, this
 * module performs no reconciliation of its own: by the time this runs,
 * `content.hero.photo.mediaId` (if any) is already the canonical one.
 *
 * What this DOES still need to do, every time: mint a fresh, short-lived
 * signed read URL for that photo (Mission 030's private-read mechanism —
 * never persisted, mission brief section 12), and hand back the real
 * `Media` row alongside it, because `HeroCropStep`'s own Continue handler
 * needs that exact `Media` to re-verify against before calling
 * `commitPageD` (mission brief section 16 — the same discipline
 * `HeroPhotoStep`/`commitPageC` already apply).
 */
export interface HeroCropStepData {
  media: Media;
  readUrl: string;
}

export interface ResolveHeroCropStepDeps {
  mediaEngine: MediaEngineDeps;
}

/**
 * Resolves PAGE D's data — `null` when there is genuinely no usable
 * photo to crop (a defensive case: by the time `needsPageD` is true,
 * T06 should already guarantee one exists, but this never trusts that
 * blindly — a missing/corrupted Hero, a photo reference whose media
 * cannot be read, or a media that somehow stopped being `"ready"` all
 * degrade to `null` rather than throwing, exactly like
 * `resolveHeroPhotoStepData` degrades to `initialPhoto: null`).
 */
export async function resolveHeroCropStepData(
  deps: ResolveHeroCropStepDeps,
  actor: HeritageActor,
  memorialId: string,
  content: MemorialContent,
): Promise<HeroCropStepData | null> {
  const read = readHeroForEditing(content);
  if (read.status !== "ready" || read.hero.photo === null) return null;

  const displayable = await createMediaReadUrl(deps.mediaEngine, actor, {
    memorialId,
    mediaId: read.hero.photo.mediaId,
  });
  if (!displayable.ok) return null;

  return { media: displayable.value.media, readUrl: displayable.value.readUrl };
}
