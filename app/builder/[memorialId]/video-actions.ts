"use server";

import { authorizeMemorialForRequest } from "@/lib/auth/heritage-session";
import { createSupabaseMemorialPublicationRepository } from "@/lib/adapters/supabase/memorial-publication-repository";
import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { decideVideoUpload, type VideoUploadActionResult } from "@/lib/memorial/video/video-upload-contract";

const VIDEO_ID = /^v-[A-Za-z0-9-]{1,64}$/;

/**
 * VID-06 — le point d'entrée SERVEUR du futur téléversement d'une vidéo.
 *
 * Non opérationnel dans VID-06 : même une famille autorisée reçoit
 * `not_operational` (aucune adresse d'envoi, aucun appel à Mux, aucune
 * écriture). Ce qui est en place est la barrière :
 *
 *  - l'autorisation est rejouée à chaque appel, depuis la session validée
 *    (`authorizeMemorialForRequest`, comme `saveDraftAction`) ; un refus est
 *    opaque et REJETTE (aucune réponse ne révèle si un mémorial existe) ;
 *  - l'offre est lue côté serveur (`memorials.access_level`, lecture seule,
 *    à travers RLS), jamais reçue du navigateur ; sans l'offre complète, le
 *    refus est explicite (`offer_not_complete`) ;
 *  - l'identifiant de vidéo est revalidé ; l'id de mémorial utilisé est celui
 *    que l'autorisation a rendu.
 *
 * Le parcours invité n'appelle jamais cette action : il n'a pas de mémorial
 * serveur, et ses vidéos ne quittent pas le navigateur.
 */
export async function requestVideoUploadAction(memorialId: string, videoId: string): Promise<VideoUploadActionResult> {
  if (typeof videoId !== "string" || !VIDEO_ID.test(videoId)) throw new Error("Video upload refused.");

  const access = await authorizeMemorialForRequest(memorialId);
  if (access.status !== "granted") throw new Error("Video upload refused.");

  const supabase = await createServerSupabaseClient();
  const snapshot = await createSupabaseMemorialPublicationRepository(supabase).load(access.memorialId);
  if (snapshot === null) throw new Error("Video upload refused.");

  const decision = decideVideoUpload({
    actorIsOwner: true,
    accessLevel: snapshot.accessLevel,
    memorialStatus: snapshot.status,
  });
  if (decision.decision === "deny") return { status: "refused", reason: decision.reason };

  // Lot Mux non ouvert (`VIDEO_HOSTING_OPERATIONAL === false`) : aucune
  // adresse d'envoi n'est créée, aucune réussite n'est simulée.
  return { status: "not_operational" };
}
