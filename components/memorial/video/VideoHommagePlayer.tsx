"use client";

import { useEffect, useRef, useState } from "react";
import type { VideoHommageItem } from "@/lib/memorial/video/video-hommage";
import type { VideoHommageTexts } from "./texts";
import { useFullscreenOrientation } from "./use-fullscreen-orientation";
import { usePauseWhenHidden } from "./use-pause-when-hidden";
import styles from "./VideoHommageV1.module.css";

/**
 * VID-05A — le lecteur principal de la rubrique.
 *
 * Un seul élément `<video>`, dont la source change avec la vidéo choisie.
 *  - Aucune lecture automatique : la lecture ne démarre que sur une demande
 *    explicite (`playRequest` incrémenté par un clic du visiteur) ou par les
 *    commandes du lecteur.
 *  - Aucun enchaînement : à la fin d'une vidéo, rien ne démarre.
 *  - Aucune boucle, pas de téléchargement proposé (`controlsList`), pas
 *    d'image dans l'image.
 *  - Préchargement : `metadata` pour une vidéo locale (aucun réseau, la
 *    première image s'affiche), `none` pour un flux hébergé (aucune minute
 *    diffusée tant que le visiteur n'a pas cliqué).
 *  - Pause quand le lecteur quitte l'écran, sans reprise automatique.
 *  - Plein écran : commande native du lecteur (ordinateur et mobile),
 *    paysage sur mobile pour une vidéo horizontale quand le système le
 *    permet, ratio d'origine conservé (`use-fullscreen-orientation.ts`).
 *
 * Flux hébergés : l'adresse fournie par le serveur porte déjà le plafond
 * 720p et le jeton. Safari lit le HLS nativement ; les autres navigateurs
 * demanderont un adaptateur HLS au lot de raccordement Mux (dépendance à
 * concerter avec Chef 06, `package-lock.json`).
 */
export function VideoHommagePlayer({
  item,
  title,
  texts,
  playRequest,
}: {
  item: VideoHommageItem | null;
  title: string | null;
  texts: VideoHommageTexts;
  /** Compteur de demandes de lecture explicites ; 0 = aucune. */
  playRequest: number;
}) {
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const handledRequest = useRef(0);
  usePauseWhenHidden(video);
  useFullscreenOrientation(video);

  const source = item?.status === "ready" ? item.source : undefined;
  const sourceUrl = source?.url;

  useEffect(() => {
    if (video === null || sourceUrl === undefined) return;
    if (playRequest <= handledRequest.current) return;
    handledRequest.current = playRequest;
    const attempt = video.play();
    // Un refus du navigateur (politique de lecture, fichier illisible) laisse
    // simplement le lecteur en pause, commandes disponibles.
    if (attempt !== undefined) attempt.catch(() => {});
  }, [video, sourceUrl, playRequest]);

  const unreadable = failed !== null && failed === sourceUrl;
  let message: string | null = null;
  if (item === null) message = texts.empty;
  else if (item.status === "preparing") message = texts.preparing;
  else if (item.status === "local-unavailable") message = texts.localUnavailable;
  else if (item.status === "error" || source === undefined || unreadable) message = texts.error;

  return (
    <div className={styles.playerFrame} data-video-player="" data-state={message === null ? "ready" : item?.status ?? "empty"}>
      {source !== undefined && !unreadable && (
        <video
          ref={setVideo}
          key="player"
          className={styles.video}
          src={source.url}
          poster={source.kind === "stream" ? source.posterUrl : undefined}
          preload={source.kind === "local" ? "metadata" : "none"}
          controls
          playsInline
          controlsList="nodownload noremoteplayback"
          disablePictureInPicture
          aria-label={title === null ? undefined : texts.playerLabel(title)}
          onError={() => setFailed(source.url)}
        />
      )}
      {message !== null && (
        <p className={styles.playerMessage} role="status">
          {message}
        </p>
      )}
    </div>
  );
}
