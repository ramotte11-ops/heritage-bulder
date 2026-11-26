import type { HostedVideoView } from "./hosted-video-types";

/**
 * VID-08 — lecture des vues d'hébergement côté navigateur (formulaire A16 et
 * aperçu). Code sans dépendance ni secret.
 */

/**
 * La ligne la plus récente d'un emplacement, hors retrait en cours et hors
 * ancienne version gardée pour la page publique (la liste est triée par
 * création) : c'est la version que la famille prépare.
 */
export function latestHostedView(views: readonly HostedVideoView[], draftVideoId: string): HostedVideoView | null {
  for (let i = views.length - 1; i >= 0; i -= 1) {
    const view = views[i]!;
    if (view.draftVideoId === draftVideoId && view.state !== "removing" && view.state !== "replaced") return view;
  }
  return null;
}

/** VID-09 — l'ancienne version de cet emplacement reste-t-elle visible sur la page publique ? */
export function hasPublishedPreviousVersion(views: readonly HostedVideoView[], draftVideoId: string): boolean {
  return views.some((view) => view.draftVideoId === draftVideoId && view.state === "replaced");
}
