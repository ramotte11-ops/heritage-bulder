import type { HeritageActor } from "@/lib/auth/heritage-actor";
import type { MediaEngineDeps } from "@/lib/media/media-engine";
import type { MemorialContent } from "@/types/memorial";
import { createOwnerDraftMediaResolver } from "@/lib/memorial/assembly/owner-draft-media-resolver";
import { readGalleryForEditing } from "./gallery-step";

/**
 * A13 — the thumbnails the Gallery screen needs, resolved server-side for
 * `app/builder/[memorialId]/page.tsx`, through the Preview's own Owner
 * draft resolver (`createOwnerDraftMediaResolver`, purpose `"gallery"`):
 * the same proof of ownership, the same `"ready"` + purpose check, the
 * same short-lived signed URL — no second read mechanism.
 *
 * Only `mediaId -> readUrl` crosses to the browser (never a `Media` row,
 * never a path), and nothing here is ever written back into content. A
 * photograph that cannot be read right now maps to `null`: the screen
 * shows it as unavailable (still listed, still removable) rather than
 * dropping it from the family's registry.
 */

export interface ResolveGalleryStepDeps {
  mediaEngine: MediaEngineDeps;
}

export type GalleryStepThumbnails = Readonly<Record<string, string | null>>;

export type GalleryStepData = { status: "ready"; thumbnails: GalleryStepThumbnails } | { status: "corrupted" };

export async function resolveGalleryStepData(
  deps: ResolveGalleryStepDeps,
  actor: HeritageActor,
  memorialId: string,
  content: MemorialContent,
): Promise<GalleryStepData> {
  const read = readGalleryForEditing(content);
  if (read.status !== "ready") return { status: "corrupted" };

  const resolve = createOwnerDraftMediaResolver(deps.mediaEngine, actor, memorialId);
  const entries = await Promise.all(
    read.gallery.items.map(async ({ mediaId }) => {
      const resolved = await resolve({ mediaId, purpose: "gallery" }).catch(() => null);
      return [mediaId, resolved !== null && resolved.mediaId === mediaId ? resolved.readUrl : null] as const;
    }),
  );
  return { status: "ready", thumbnails: Object.fromEntries(entries) };
}
