import type { MemorialStatus } from "@/types/memorial";

/**
 * VID-06 / VID-07 — la décision premium du téléversement distant.
 *
 * Préparation (titres, durées, ordre, aperçu local) : ouverte à toutes les
 * familles, invitées comprises, sans aucun réseau (VID-06).
 * Téléversement distant (VID-07) : seulement le propriétaire, seulement
 * avec l'offre complète lue CÔTÉ SERVEUR, jamais sur un hommage archivé ;
 * toute valeur inattendue refuse. Cette décision est un premier filtre des
 * actions serveur ; la base la refait sous verrou
 * (reserve_memorial_video_upload_v1), avec les limites de capacité.
 *
 * L'hébergement lui-même (Mux) : lib/memorial/video/hosting/ ; il n'est
 * opérationnel que configuré ET activé (`HERITAGE_VIDEO_HOSTING=enabled`,
 * hosting-runtime.ts).
 */

export interface VideoUploadFacts {
  /** La session est-elle celle du propriétaire du mémorial (autorisation déjà rejouée) ? */
  actorIsOwner: boolean;
  /** `memorials.access_level`, tel que lu côté serveur — non fiable par nature. */
  accessLevel: unknown;
  /** `memorials.status`, tel que lu côté serveur. */
  memorialStatus: MemorialStatus | string | null;
}

export type VideoUploadRefusal = "not_owner" | "offer_not_complete" | "archived" | "unknown_status";

export type VideoUploadDecision = { decision: "allow" } | { decision: "deny"; reason: VideoUploadRefusal };

const KNOWN_STATUSES: readonly string[] = ["draft", "ready", "published", "editing", "archived"];

export function decideVideoUpload(facts: VideoUploadFacts): VideoUploadDecision {
  if (!facts.actorIsOwner) return { decision: "deny", reason: "not_owner" };
  if (typeof facts.memorialStatus !== "string" || !KNOWN_STATUSES.includes(facts.memorialStatus)) {
    return { decision: "deny", reason: "unknown_status" };
  }
  if (facts.memorialStatus === "archived") return { decision: "deny", reason: "archived" };
  if (facts.accessLevel !== "complet") return { decision: "deny", reason: "offer_not_complete" };
  return { decision: "allow" };
}
