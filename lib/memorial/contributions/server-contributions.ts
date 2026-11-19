import "server-only";

import { randomUUID } from "node:crypto";
import { SupabaseContributionPhotoStore } from "@/lib/adapters/supabase/contribution-photo-store";
import { SupabaseContributionRepository, SupabaseFamilyContributionReader } from "@/lib/adapters/supabase/contribution-repository";
import { SupabaseMediaObjectStore } from "@/lib/adapters/supabase/media-object-store";
import { SupabaseMediaRepository } from "@/lib/adapters/supabase/media-repository";
import { SupabaseMediaSecurityRepository } from "@/lib/adapters/supabase/media-security-repository";
import { requireOwner } from "@/lib/auth/heritage-actor";
import { authorizeMemorialForRequest, getHeritageActor } from "@/lib/auth/heritage-session";
import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role-client";
import type { FamilyContributionDeps } from "./family-contributions";
import { readFormTokenSecrets } from "./form-token";
import { processContributionPhoto } from "./photo-processing";
import type { VisitorContributionDeps } from "./visitor-contributions";

/**
 * SERVER ONLY. M8-E2 — le seul endroit qui branche le moteur des
 * Contributions sur Supabase (même rôle que lib/media/server-media-engine.ts) :
 * aucune décision ici, seulement des adaptateurs réels.
 *
 * Jamais importé par un composant client : construit le client
 * service_role (lib/entitlement/server-only-boundary.test.ts).
 */

export function createVisitorContributionDeps(): VisitorContributionDeps {
  const client = createServiceRoleSupabaseClient();
  return {
    repository: new SupabaseContributionRepository(client),
    objectStore: new SupabaseMediaObjectStore(client),
    mediaRepository: new SupabaseMediaRepository(client),
    mediaSecurityRepository: new SupabaseMediaSecurityRepository(client),
    photoStore: new SupabaseContributionPhotoStore(client),
    processPhoto: processContributionPhoto,
    secrets: readFormTokenSecrets(),
    generateId: () => randomUUID(),
    now: () => new Date(),
  };
}

export function createFamilyContributionDeps(): FamilyContributionDeps {
  const client = createServiceRoleSupabaseClient();
  return {
    repository: new SupabaseContributionRepository(client),
    createReader: async () => new SupabaseFamilyContributionReader(await createServerSupabaseClient()),
    mediaRepository: new SupabaseMediaRepository(client),
    mediaSecurityRepository: new SupabaseMediaSecurityRepository(client),
    objectStore: new SupabaseMediaObjectStore(client),
    resolveOwnerId: async () => {
      const gate = requireOwner(await getHeritageActor());
      return gate.status === "granted" ? gate.owner.id : null;
    },
    authorizeMemorial: async (memorialId) => {
      const access = await authorizeMemorialForRequest(memorialId);
      return access.status === "granted" ? access.ownerId : null;
    },
    now: () => new Date(),
  };
}
