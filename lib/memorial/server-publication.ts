import type { MemorialOwnershipRepository } from "@/lib/adapters/memorial-ownership-repository";
import { SupabaseMemorialOwnershipRepository } from "@/lib/adapters/supabase/memorial-ownership-repository";
import { createSupabaseMemorialPublicationRepository } from "@/lib/adapters/supabase/memorial-publication-repository";
import { authorizeMemorialAccess } from "@/lib/auth/memorial-access";
import { getHeritageActor } from "@/lib/auth/heritage-session";
import type { HeritageActor } from "@/lib/auth/heritage-actor";
import { createOwnerDraftMediaResolver } from "@/lib/memorial/assembly/owner-draft-media-resolver";
import type { MediaResolver } from "@/lib/memorial/assembly/media-resolver";
import { createServerMediaEngineDeps } from "@/lib/media/server-media-engine";
import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role-client";
import {
  publishMemorial,
  type MemorialPublicationRepository,
  type PublishMemorialResult,
} from "./publish-memorial";
import {
  publishFromPreview,
  type MemorialFirstPublicationRepository,
  type PublishFromPreviewResult,
} from "./publish-from-preview";

export interface AuthorizedPublicationDeps {
  memorialOwnershipRepository: MemorialOwnershipRepository;
  publicationRepository: MemorialPublicationRepository;
  resolveMedia: MediaResolver;
}

/** Pure request-boundary core: ownership comes only from the resolved actor. */
export async function authorizeAndPublishMemorial(
  deps: AuthorizedPublicationDeps,
  actor: HeritageActor,
  input: { memorialId: string; expectedRevision: number; gallerySelection?: unknown },
): Promise<PublishMemorialResult> {
  const access = await authorizeMemorialAccess(
    { memorialOwnershipRepository: deps.memorialOwnershipRepository },
    actor,
    input.memorialId,
  );
  if (access.status !== "granted") return { ok: false, code: "not_found_or_forbidden" };

  return publishMemorial(
    { repository: deps.publicationRepository, resolveMedia: deps.resolveMedia },
    {
      memorialId: access.memorialId,
      ownerId: access.ownerId,
      expectedRevision: input.expectedRevision,
      gallerySelection: input.gallerySelection,
    },
  );
}

/**
 * Internal server foundation only. This file is not a Server Action and is
 * intentionally not imported by any route or client-facing component.
 */
export async function publishMemorialForCurrentOwner(
  memorialId: string,
  expectedRevision: number,
  gallerySelection?: unknown,
): Promise<PublishMemorialResult> {
  const actor = await getHeritageActor();
  const mediaEngine = createServerMediaEngineDeps();
  const readClient = await createServerSupabaseClient();

  return authorizeAndPublishMemorial(
    {
      memorialOwnershipRepository: new SupabaseMemorialOwnershipRepository(
        createServiceRoleSupabaseClient(),
      ),
      publicationRepository: createSupabaseMemorialPublicationRepository(readClient),
      resolveMedia: createOwnerDraftMediaResolver(mediaEngine, actor, memorialId),
    },
    actor,
    { memorialId, expectedRevision, gallerySelection },
  );
}

/**
 * QG 008 Lot 3 — « Publier » from the private preview, for the owner of
 * the memorial only. The identity comes from the server session; the
 * revision, fingerprint and gallery choice from the preview are untrusted
 * and re-checked by publishFromPreview against the stored draft.
 */
export async function authorizeAndPublishFromPreview(
  deps: {
    memorialOwnershipRepository: MemorialOwnershipRepository;
    publicationRepository: MemorialFirstPublicationRepository;
    resolveMedia: MediaResolver;
  },
  actor: HeritageActor,
  input: { memorialId: string; expectedRevision: number; expectedDigest: string; gallerySelection?: unknown },
): Promise<PublishFromPreviewResult> {
  const access = await authorizeMemorialAccess(
    { memorialOwnershipRepository: deps.memorialOwnershipRepository },
    actor,
    input.memorialId,
  );
  if (access.status !== "granted") return { ok: false, code: "not_found_or_forbidden" };
  return publishFromPreview(
    { repository: deps.publicationRepository, resolveMedia: deps.resolveMedia },
    {
      memorialId: access.memorialId,
      ownerId: access.ownerId,
      expectedRevision: input.expectedRevision,
      expectedDigest: input.expectedDigest,
      gallerySelection: input.gallerySelection,
    },
  );
}

export async function publishFromPreviewForCurrentOwner(
  memorialId: string,
  expectedRevision: number,
  expectedDigest: string,
  gallerySelection?: unknown,
): Promise<PublishFromPreviewResult> {
  const actor = await getHeritageActor();
  const mediaEngine = createServerMediaEngineDeps();
  const readClient = await createServerSupabaseClient();
  return authorizeAndPublishFromPreview(
    {
      memorialOwnershipRepository: new SupabaseMemorialOwnershipRepository(
        createServiceRoleSupabaseClient(),
      ),
      publicationRepository: createSupabaseMemorialPublicationRepository(readClient),
      resolveMedia: createOwnerDraftMediaResolver(mediaEngine, actor, memorialId),
    },
    actor,
    { memorialId, expectedRevision, expectedDigest, gallerySelection },
  );
}
