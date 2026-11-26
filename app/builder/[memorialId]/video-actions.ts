"use server";

import { authorizeMemorialForRequest } from "@/lib/auth/heritage-session";
import { createSupabaseMemorialPublicationRepository } from "@/lib/adapters/supabase/memorial-publication-repository";
import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { decideVideoUpload } from "@/lib/memorial/video/video-upload-contract";
import { headers } from "next/headers";
import { videoHostingRuntime } from "@/lib/memorial/video/hosting/hosting-runtime";
import { resolveUploadOrigin } from "@/lib/memorial/video/hosting/mux-config";
import type { VideoHostingLoad, VideoUploadRequestResult } from "@/lib/memorial/video/hosting/hosted-video-types";

const DRAFT_VIDEO_ID = /^v-[A-Za-z0-9-]{1,64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REFUSED = "Video hosting refused.";

/**
 * VID-07 — les points d'entrée SERVEUR de l'hébergement vidéo du Builder.
 *
 * Sur chaque appel, dans cet ordre, avant toute action :
 *  1. la session est rejouée (`authorizeMemorialForRequest`, comme
 *     `saveDraftAction`) : sans session, sur l'hommage d'un autre, ou sur
 *     un hommage inexistant, le refus est OPAQUE et rejette ;
 *  2. l'hébergement doit être configuré et activé côté serveur ; sinon
 *     `unavailable` : le formulaire reste en préparation locale (VID-06) ;
 *  3. l'offre est lue côté serveur (`memorials.access_level`), jamais
 *     reçue du navigateur ; sans l'offre complète : `unavailable` ;
 *  4. la base revérifie TOUT sous le verrou de l'hommage (propriétaire,
 *     offre, 3 vidéos, 600 s, envois en cours, durée inconnue).
 *
 * Aucune clé Mux ne quitte le serveur : le navigateur ne reçoit qu'une
 * adresse d'envoi à usage unique, ou des adresses de lecture signées et
 * de courte durée pour SES vidéos prêtes.
 */

async function context(memorialId: string) {
  const access = await authorizeMemorialForRequest(memorialId);
  if (access.status !== "granted") throw new Error(REFUSED);
  return access;
}

async function premiumState(memorialId: string): Promise<"complete" | "not_complete"> {
  const snapshot = await createSupabaseMemorialPublicationRepository(await createServerSupabaseClient()).load(memorialId);
  if (snapshot === null) throw new Error(REFUSED);
  const decision = decideVideoUpload({ actorIsOwner: true, accessLevel: snapshot.accessLevel, memorialStatus: snapshot.status });
  return decision.decision === "allow" ? "complete" : "not_complete";
}

/** Ouverture de l'étape A16 (et rafraîchissement pendant un traitement). */
export async function loadVideoHostingAction(memorialId: string): Promise<VideoHostingLoad> {
  const access = await context(memorialId);
  const runtime = videoHostingRuntime();
  if (runtime === null) return { status: "unavailable" };
  if ((await premiumState(access.memorialId)) !== "complete") return { status: "unavailable" };
  const scope = { ownerId: access.ownerId, memorialId: access.memorialId };
  // Une notification Mux manquée ne bloque jamais la famille : les vidéos
  // restées sans nouvelle sont réinterrogées avant l'affichage.
  await runtime.service.refreshForOwner(scope).catch(() => 0);
  return { status: "available", videos: await runtime.service.listForOwner(scope) };
}

/** Demande d'envoi direct d'une vidéo du brouillon vers l'hébergeur. */
export async function requestVideoUploadAction(
  memorialId: string,
  draftVideoId: string,
  declaredDurationSeconds: number | null,
): Promise<VideoUploadRequestResult> {
  if (typeof draftVideoId !== "string" || !DRAFT_VIDEO_ID.test(draftVideoId)) throw new Error(REFUSED);
  if (declaredDurationSeconds !== null && (typeof declaredDurationSeconds !== "number" || !Number.isFinite(declaredDurationSeconds) || declaredDurationSeconds <= 0)) {
    throw new Error(REFUSED);
  }
  const access = await context(memorialId);
  const runtime = videoHostingRuntime();
  if (runtime === null) return { status: "unavailable" };
  if ((await premiumState(access.memorialId)) !== "complete") return { status: "refused", reason: "offer" };
  // VID-10 — l'origine de la page qui envoie (site, ou déploiement du même site si permis).
  const corsOrigin = resolveUploadOrigin(runtime.config, (await headers()).get("origin"));
  const result = await runtime.service.requestUpload({
    ownerId: access.ownerId,
    memorialId: access.memorialId,
    draftVideoId,
    declaredDurationSeconds,
    corsOrigin,
  });
  if (result.status !== "refused") return result;
  const reason = {
    refused_too_many: "too_many",
    refused_duration: "duration",
    refused_unknown_pending: "unknown_pending",
    refused_in_progress: "in_progress",
    refused_offer: "offer",
  } as const;
  return { status: "refused", reason: reason[result.reason as keyof typeof reason] ?? "other" };
}

/** Annulation par la famille d'un envoi en cours. */
export async function cancelVideoUploadAction(memorialId: string, videoId: string): Promise<{ status: "cancelled" | "ignored" | "unavailable" }> {
  if (typeof videoId !== "string" || !UUID.test(videoId)) throw new Error(REFUSED);
  const access = await context(memorialId);
  const runtime = videoHostingRuntime();
  if (runtime === null) return { status: "unavailable" };
  const outcome = await runtime.service.cancelUpload({ ownerId: access.ownerId, memorialId: access.memorialId, videoId });
  if (outcome === "refused") throw new Error(REFUSED);
  return { status: outcome };
}

/**
 * Retrait d'une vidéo hébergée (retrait ou remplacement abandonné) : permis
 * au propriétaire quelle que soit l'offre — retirer ne publie rien.
 * `pending_cleanup` : la vidéo n'est plus lisible ; la suppression chez
 * l'hébergeur sera reprise par la réconciliation.
 */
export async function removeHostedVideoAction(memorialId: string, draftVideoId: string): Promise<{ status: "removed" | "pending_cleanup" | "unavailable" }> {
  if (typeof draftVideoId !== "string" || !DRAFT_VIDEO_ID.test(draftVideoId)) throw new Error(REFUSED);
  const access = await context(memorialId);
  const runtime = videoHostingRuntime();
  if (runtime === null) return { status: "unavailable" };
  const outcome = await runtime.service.removeVideo({ ownerId: access.ownerId, memorialId: access.memorialId, draftVideoId });
  if (outcome === "refused") throw new Error(REFUSED);
  return { status: outcome };
}
