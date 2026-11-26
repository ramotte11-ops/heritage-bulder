"use client";

import { useEffect } from "react";
import { isVideoFullscreen } from "./use-fullscreen-orientation";

/**
 * VID-05A — pause automatique, jamais de reprise automatique.
 *
 * Décision PO : quand le lecteur quitte la zone visible (en descendant vers
 * le pied de page, ou quand une autre carte du stacking le recouvre), la
 * lecture se met en pause, et elle ne reprend pas toute seule au retour.
 *
 * Le critère est la VISIBILITÉ du lecteur à l'écran (moins de la moitié
 * visible), et non le recouvrement par une carte : la Vidéo est la dernière
 * rubrique du mémorial, et ce critère fonctionne aussi quand l'effet de
 * cartes est coupé (mouvements réduits, téléphone en paysage). L'onglet
 * masqué (`visibilitychange`) met aussi en pause.
 *
 * `video` est l'élément lui-même (référence par rappel) : le suivi suit
 * l'élément quand il apparaît, change ou disparaît. Sans
 * `IntersectionObserver`, seule la règle de l'onglet masqué s'applique.
 */
export const VIDEO_PAUSE_VISIBILITY_THRESHOLD = 0.5;

export function usePauseWhenHidden(video: HTMLVideoElement | null): void {
  useEffect(() => {
    if (video === null) return;

    const pause = () => {
      if (!video.paused) video.pause();
    };
    // En plein écran, la position du lecteur dans la page ne compte plus :
    // seul l'onglet masqué met encore en pause.
    const pauseIfInPage = () => {
      if (!isVideoFullscreen(video)) pause();
    };

    let observer: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== "undefined") {
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.intersectionRatio < VIDEO_PAUSE_VISIBILITY_THRESHOLD) pauseIfInPage();
          }
        },
        { threshold: [0, VIDEO_PAUSE_VISIBILITY_THRESHOLD] },
      );
      observer.observe(video);
    }

    const onVisibility = () => {
      if (document.visibilityState === "hidden") pause();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      observer?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [video]);
}
