import type { HostedVideoView } from "./hosted-video-types";

/**
 * VID-08 — lecture des vues d'hébergement côté navigateur (formulaire A16 et
 * aperçu). Code sans dépendance ni secret.
 */

/** La ligne la plus récente d'un emplacement, hors retrait en cours (la liste est triée par création). */
export function latestHostedView(views: readonly HostedVideoView[], draftVideoId: string): HostedVideoView | null {
  for (let i = views.length - 1; i >= 0; i -= 1) {
    const view = views[i]!;
    if (view.draftVideoId === draftVideoId && view.state !== "removing") return view;
  }
  return null;
}
