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

export interface AuthorizedPublicationDeps {
  memorialOwnershipRepository: MemorialOwnershipRepository;
  publicationRepository: MemorialPublicationRepository;
  resolveMedia: MediaResolver;
}

/** Pure request-boundary core: ownership comes only from the resolved actor. */
export async function authorizeAndPublishMemorial(
  deps: AuthorizedPublicationDeps,
  actor: HeritageActor,
  input: { memorialId: string; expectedRevision: number },
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
    { memorialId, expectedRevision },
  );
}
