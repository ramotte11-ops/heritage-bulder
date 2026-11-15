import "server-only";
import {
  UNKNOWN_OWNER_FREE_PUBLICATION_STATUS,
  type OwnerFreePublicationStatus,
} from "@/lib/adapters/owner-free-publication-status-repository";
import { SupabaseOwnerFreePublicationStatusRepository } from "@/lib/adapters/supabase/owner-free-publication-status-repository";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role-client";

/**
 * SERVER ONLY. `ownerId` is supplied by `getHeritageActor` → `requireOwner`,
 * never by a request parameter. The privileged client and raw RPC result do
 * not cross the Server Component boundary.
 */
export async function loadOwnerFreePublicationStatus(
  ownerId: string,
): Promise<OwnerFreePublicationStatus> {
  try {
    return await new SupabaseOwnerFreePublicationStatusRepository(
      createServiceRoleSupabaseClient(),
    ).read(ownerId);
  } catch (error) {
    console.error(
      "Owner free publication status unavailable:",
      error instanceof Error ? error.message : error,
    );
    return UNKNOWN_OWNER_FREE_PUBLICATION_STATUS;
  }
}
