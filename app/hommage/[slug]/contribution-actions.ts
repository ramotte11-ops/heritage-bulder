"use server";

import { createVisitorContributionDeps } from "@/lib/memorial/contributions/server-contributions";
import {
  finishContributionPhoto,
  openContributionForm,
  readPublicContributions,
  renewPublicContributionPhotos,
  startContributionPhoto,
  submitContributionText,
  type PhotoFinishResult,
  type PhotoStartResult,
  type PublicContributionsPage,
  type RenewPhotosResult,
  type VisitorDepositResult,
} from "@/lib/memorial/contributions/visitor-contributions";

/**
 * M8-E2 — Server Actions publiques des Contributions des proches.
 *
 * Point d'entrée des visiteurs anonymes (la fenêtre de dépôt E4 les
 * appellera ; aucune interface ici). Tout argument arrive `unknown` et
 * peut être forgé ; toutes les décisions sont prises par le moteur serveur
 * (lib/memorial/contributions/visitor-contributions.ts) puis par la base.
 * Aucune clé privilégiée ne quitte le serveur : le navigateur ne reçoit
 * qu'un jeton de formulaire signé, une permission d'envoi pour UN objet,
 * un ticket photo, et des résultats sans raison de refus.
 *
 * Parcours photo : beginContributionPhoto → envoi direct du fichier par le
 * navigateur (uploadToSignedUrl) → completeContributionPhoto.
 */

function withDeps<T>(run: (deps: ReturnType<typeof createVisitorContributionDeps>) => Promise<T> | T): Promise<T | { status: "unavailable" }> {
  let deps;
  try {
    deps = createVisitorContributionDeps();
  } catch {
    console.error("Contributions: server configuration missing");
    return Promise.resolve({ status: "unavailable" } as const);
  }
  return Promise.resolve(run(deps));
}

export async function openContributionWindow(slug: unknown) {
  return withDeps((deps) => openContributionForm(deps, slug));
}

export async function depositContributionText(input: {
  slug: unknown;
  type: unknown;
  authorName: unknown;
  text: unknown;
  formToken: unknown;
  website?: unknown;
}): Promise<VisitorDepositResult> {
  const i = (input ?? {}) as Record<string, unknown>;
  return withDeps((deps) =>
    submitContributionText(deps, { slug: i.slug, type: i.type, authorName: i.authorName, text: i.text, formToken: i.formToken, honeypot: i.website }),
  );
}

export async function beginContributionPhoto(input: { slug: unknown; declaredMimeType: unknown; formToken: unknown; website?: unknown }): Promise<PhotoStartResult> {
  const i = (input ?? {}) as Record<string, unknown>;
  return withDeps((deps) => startContributionPhoto(deps, { slug: i.slug, declaredMimeType: i.declaredMimeType, formToken: i.formToken, honeypot: i.website }));
}

export async function completeContributionPhoto(input: {
  slug: unknown;
  mediaId: unknown;
  photoTicket: unknown;
  authorName: unknown;
  caption?: unknown;
  formToken: unknown;
  website?: unknown;
}): Promise<PhotoFinishResult> {
  const i = (input ?? {}) as Record<string, unknown>;
  return withDeps((deps) =>
    finishContributionPhoto(deps, {
      slug: i.slug,
      mediaId: i.mediaId,
      photoTicket: i.photoTicket,
      authorName: i.authorName,
      caption: i.caption,
      formToken: i.formToken,
      honeypot: i.website,
    }),
  );
}

/** Pages suivantes de l'Album (P1) ; la page initiale est lue côté serveur par l'hôte public (E3). */
export async function loadContributions(slug: unknown, cursor: unknown): Promise<PublicContributionsPage | { status: "refused" | "unavailable" }> {
  return withDeps((deps) => readPublicContributions(deps, { slug, cursor }));
}

/** M8-E3 — renouvelle les liens expirés de photos encore publiées (voir renewPublicContributionPhotos). */
export async function renewContributionPhotos(slug: unknown, ids: unknown): Promise<RenewPhotosResult | { status: "unavailable" }> {
  return withDeps((deps) => renewPublicContributionPhotos(deps, { slug, ids }));
}
