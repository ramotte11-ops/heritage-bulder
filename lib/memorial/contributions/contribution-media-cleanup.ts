import "server-only";

import { MEDIA_PENDING_TTL_MS } from "@/config/media";
import type { MediaObjectStore } from "@/lib/adapters/media-object-store";
import type { MediaSecurityRepository } from "@/lib/adapters/media-security-repository";
import { buildMediaObjectPrefix } from "@/lib/media/media-path";

/**
 * M8-E2 — retrait des octets d'une photo de proche, sur le circuit de
 * nettoyage EXISTANT (pending_media_cleanup_claims,
 * reserve_/finish_pending_media_cleanup_v1, sweep des réservations
 * abandonnées). Aucun second mécanisme.
 *
 * Différence assumée avec cleanupPendingMedia (lib/media) : les octets
 * sont supprimés TOUT DE SUITE (un fichier refusé, ou retiré par la
 * famille, ne doit pas rester stocké), mais la réclamation n'est close
 * qu'une fois la fenêtre de sécurité de 3 h écoulée depuis la
 * réservation. Avant, une permission d'envoi encore valide pourrait
 * recréer l'objet : la ligne `pending` et sa réclamation restent alors
 * l'inventaire qui permet au balayage de le retrouver (même raisonnement
 * que Mission 030 / Security V1).
 *
 * Meilleur effort : appelée sur un chemin qui répond déjà un refus ou un
 * succès ; un échec laisse une réclamation ouverte que le balayage reprend.
 */
export interface ContributionMediaCleanupDeps {
  mediaSecurityRepository: Pick<MediaSecurityRepository, "reservePendingCleanup" | "finishPendingCleanup">;
  objectStore: Pick<MediaObjectStore, "removeByPrefix">;
  now: () => Date;
}

export async function retireContributionMedia(
  deps: ContributionMediaCleanupDeps,
  media: { memorialId: string; ownerId: string; mediaId: string; createdAt: string },
  existingClaimId: string | null = null,
): Promise<"removed" | "removed_claim_open" | "failed"> {
  let claimId = existingClaimId;
  if (claimId === null) {
    try {
      claimId = (await deps.mediaSecurityRepository.reservePendingCleanup({
        memorialId: media.memorialId,
        ownerId: media.ownerId,
        mediaId: media.mediaId,
      })).claimId;
    } catch {
      return "failed";
    }
  }
  try {
    await deps.objectStore.removeByPrefix({
      prefix: buildMediaObjectPrefix({ memorialId: media.memorialId, mediaId: media.mediaId }),
    });
  } catch {
    return "failed";
  }
  const createdAt = new Date(media.createdAt).getTime();
  if (!Number.isFinite(createdAt) || deps.now().getTime() - createdAt < MEDIA_PENDING_TTL_MS) {
    return "removed_claim_open";
  }
  try {
    await deps.mediaSecurityRepository.finishPendingCleanup({ memorialId: media.memorialId, ownerId: media.ownerId, claimId });
    return "removed";
  } catch {
    return "removed_claim_open";
  }
}
