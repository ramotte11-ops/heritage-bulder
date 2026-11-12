"use server";

import { getHeritageActor, authorizeMemorialForRequest } from "@/lib/auth/heritage-session";
import { createSupabaseMemorialPublicationRepository } from "@/lib/adapters/supabase/memorial-publication-repository";
import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { createServerMediaEngineDeps } from "@/lib/media/server-media-engine";
import { resolveHeroFlowState } from "@/lib/builder/guided-flow/hero-step";
import { isPreviewUnlocked } from "@/lib/builder/guided-flow/preview-lock";
import { readGuidedFlowState } from "@/lib/builder/guided-flow/flow-state";
import { inspectHero, readHero } from "@/lib/memorial/hero";
import { resolveSkinVariantRuntime } from "@/lib/memorial/skin-runtime";
import { assembleMemorial } from "@/lib/memorial/assembly/assemble-memorial";
import type { MediaResolver } from "@/lib/memorial/assembly/media-resolver";
import { createOwnerDraftMediaResolver } from "@/lib/memorial/assembly/owner-draft-media-resolver";
import {
  computePublicationPreview,
  type PublicationPreviewComputation,
} from "@/lib/memorial/publication-preview";
import type { MemorialPublicationSnapshot } from "@/lib/memorial/publish-memorial";
import { heroPhotoUsable } from "@/lib/memorial/publish-from-preview";
import type { AccessLevel } from "@/config/access-levels";
import type {
  PreviewGalleryChoice,
  PreviewPublication,
  PublicationReadiness,
} from "@/lib/memorial/publication-preview-types";
import type { MemorialPreviewResult } from "@/components/builder/preview/BuilderPreviewHost";

/**
 * Étape 3 — the Builder's private Preview, re-read on the server each time
 * it opens.
 *
 * QG 008 Lot 3 — the Preview shows EXACTLY what « Publier » would publish:
 * it assembles the publication projection (lib/memorial/publication-preview.ts)
 * for the access level stored in the database — never the raw draft — read
 * through the same repository the publication uses, so that both compute
 * the same fingerprint from the same inputs. `requestedSelection` is the
 * family's gallery choice for an `avis` with more than six photos:
 * untrusted, revalidated by the publication policy, and replaced by the
 * default proposal (the first six) when it is not acceptable.
 *
 * Read-only: nothing is saved, reconciled or revalidated here. Media are
 * resolved through the Owner/draft resolver (owner-only signed URLs).
 */
export async function loadMemorialPreviewAction(
  memorialId: string,
  requestedSelection?: unknown,
): Promise<MemorialPreviewResult> {
  const actor = await getHeritageActor();
  const access = await authorizeMemorialForRequest(memorialId);
  if (access.status !== "granted") {
    // Same deliberate opacity as saveDraftAction's refusal.
    throw new Error("Preview refused.");
  }

  const supabase = await createServerSupabaseClient();
  let snapshot: MemorialPublicationSnapshot | null;
  try {
    snapshot = await createSupabaseMemorialPublicationRepository(supabase).load(access.memorialId);
  } catch {
    return { status: "unavailable" };
  }
  if (snapshot === null) return { status: "unavailable" };
  if (snapshot.language === null) return { status: "locked" };

  const content = snapshot.draft.content;
  const firstPublication = snapshot.status === "draft" && snapshot.firstPublishedAt === null;
  if (!isPreviewUnlocked(resolveHeroFlowState(content, readHero(content)))) {
    // QG 008 Lot 3 (E1): a draft whose main photo was removed says why.
    return firstPublication && heroPhotoMissing(content) ? { status: "hero_photo_required" } : { status: "locked" };
  }

  // `skin_variant` is not re-validated at the repository boundary.
  const variant = resolveSkinVariantRuntime(snapshot.skinVariant);
  if (variant.status !== "resolved") return { status: "unavailable" };

  let preview = computePublicationPreview({
    draft: content,
    accessLevel: snapshot.accessLevel,
    skin: snapshot.skin,
    requestedSelection,
  });
  if (!preview.ok && requestedSelection !== undefined) {
    preview = computePublicationPreview({ draft: content, accessLevel: snapshot.accessLevel, skin: snapshot.skin });
  }
  if (!preview.ok) return { status: "unavailable" };

  const resolveMedia = createOwnerDraftMediaResolver(createServerMediaEngineDeps(), actor, access.memorialId);
  const assembled = await assembleMemorial(
    {
      skin: snapshot.skin,
      skinVariant: variant.variant,
      language: snapshot.language,
      content: preview.projection.content,
    },
    { resolveMedia },
  );
  if (assembled.status !== "assembled") {
    // QG 008 Lot 3 (E1): the Hero requires its main photo, resolved READY
    // for this owner. When that is what failed, say so — never a vague
    // « réessayez » for something only the family can fix. Read-only: the
    // draft (which may be saved without a photo) is not touched.
    const heroMediaFailed = assembled.failures.some(
      (failure) => failure.sectionId === "hero" && failure.reason === "mediaUnavailable",
    );
    if (firstPublication && heroMediaFailed && !(await heroPhotoUsable(preview.projection.content, resolveMedia))) {
      return { status: "hero_photo_required" };
    }
    return { status: "unavailable" };
  }

  return { status: "ready", assembled, publication: await describePublication(snapshot, preview, resolveMedia) };
}

async function describePublication(
  snapshot: MemorialPublicationSnapshot,
  preview: Extract<PublicationPreviewComputation, { ok: true }>,
  resolveMedia: MediaResolver,
): Promise<PreviewPublication> {
  // The Preview only reaches this point once assembleMemorial assembled the
  // Hero — which requires its main photo, resolved for this owner — so a
  // draft shown here is publishable (« Publier » re-checks it server-side,
  // then the database does: hero_photo_required / HD422).
  let readiness: PublicationReadiness = "unavailable";
  if (snapshot.status === "draft" && snapshot.firstPublishedAt === null) {
    readiness = "publishable";
  } else if (snapshot.status === "published" && snapshot.firstPublishedAt !== null) {
    readiness = "published";
  }

  const choices: PreviewGalleryChoice[] = [];
  if (preview.gallery.selection !== undefined) {
    for (const mediaId of preview.gallery.draftIds) {
      let readUrl: string | null = null;
      try {
        const resolved = await resolveMedia({ mediaId, purpose: "gallery" });
        readUrl = resolved !== null && resolved.mediaId === mediaId ? resolved.readUrl : null;
      } catch {
        readUrl = null;
      }
      choices.push({ mediaId, readUrl });
    }
  }

  return {
    revision: snapshot.draft.revision,
    // computePublicationPreview succeeded, so the policy accepted the level.
    accessLevel: snapshot.accessLevel as AccessLevel,
    digest: preview.digest,
    gallery: {
      total: preview.gallery.draftIds.length,
      limit: preview.gallery.limit,
      selection: preview.gallery.selection,
      proposed: preview.gallery.proposed,
      choices,
    },
    premiumSections: preview.premiumSections,
    readiness,
  };
}

/** The family had already reached the Preview (T08 recorded as completed)
 * and the Hero, still well-formed, no longer carries a main photo. Before
 * T08 was ever completed the Preview simply stays `locked`. */
function heroPhotoMissing(content: MemorialPublicationSnapshot["draft"]["content"]): boolean {
  if (readGuidedFlowState(content).T08?.status !== "completed") return false;
  const read = inspectHero(content);
  return read.status === "valid" && read.hero.photo === null;
}
