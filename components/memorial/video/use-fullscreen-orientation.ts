"use client";

import { useEffect } from "react";

/**
 * VID-05A (retour PO) — plein écran du lecteur.
 *
 * La commande plein écran est celle du lecteur natif (`<video controls>`,
 * sans `nofullscreen`) : présente sur ordinateur et sur mobile, elle utilise
 * l'API Fullscreen là où elle existe et le lecteur plein écran du système sur
 * iPhone. Ce module ajoute seulement :
 *
 *  - en plein écran, l'orientation PAYSAGE pour une vidéo horizontale, quand
 *    le navigateur le permet (`screen.orientation.lock`, Chrome et Firefox sur
 *    Android). Une vidéo verticale n'est jamais forcée en paysage ;
 *  - à la sortie, la libération de l'orientation : la page retrouve son
 *    comportement normal et la rubrique sa place.
 *
 * Repli : sans `screen.orientation.lock` (iPhone, iPad, ordinateurs) ou en
 * cas de refus, rien n'est forcé ; le lecteur plein écran suit la rotation de
 * l'appareil. Le ratio d'origine est conservé (`object-fit: contain`).
 */

type WebkitVideo = HTMLVideoElement & { webkitDisplayingFullscreen?: boolean };
type WebkitDocument = Document & { webkitFullscreenElement?: Element | null };
type LockableOrientation = ScreenOrientation & {
  lock?: (orientation: "landscape") => Promise<void>;
  unlock?: () => void;
};

/** Le lecteur occupe-t-il actuellement le plein écran (API standard ou iPhone) ? */
export function isVideoFullscreen(video: HTMLVideoElement): boolean {
  const doc = document as WebkitDocument;
  const element = doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
  if (element !== null && (element === video || element.contains(video))) return true;
  return (video as WebkitVideo).webkitDisplayingFullscreen === true;
}

function orientation(): LockableOrientation | null {
  if (typeof screen === "undefined") return null;
  return (screen.orientation as LockableOrientation | undefined) ?? null;
}

export function useFullscreenOrientation(video: HTMLVideoElement | null): void {
  useEffect(() => {
    if (video === null) return;
    let locked = false;

    const onChange = () => {
      const screenOrientation = orientation();
      if (isVideoFullscreen(video)) {
        const landscape = video.videoWidth > video.videoHeight;
        if (!landscape || screenOrientation?.lock === undefined) return;
        screenOrientation
          .lock("landscape")
          .then(() => {
            locked = true;
          })
          // Refus du navigateur (ordinateur, réglage du système) : on laisse faire.
          .catch(() => {});
      } else if (locked) {
        locked = false;
        try {
          screenOrientation?.unlock?.();
        } catch {
          // Déjà libérée par le navigateur à la sortie du plein écran.
        }
      }
    };

    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
      if (locked) {
        try {
          orientation()?.unlock?.();
        } catch {
          // Rien à libérer.
        }
      }
    };
  }, [video]);
}
