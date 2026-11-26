"use client";

import { useEffect, useRef, useState } from "react";
import type { VideoHommageItem } from "@/lib/memorial/video/video-hommage";
import type { VideoHommageTexts } from "./texts";
import { useFullscreenOrientation } from "./use-fullscreen-orientation";
import { usePauseWhenHidden } from "./use-pause-when-hidden";
import { useStreamPlayback } from "./use-stream-playback";
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
 * Flux hébergés (VID-08) : `use-stream-playback.ts` choisit le HLS natif
 * (Safari) ou hls.js chargé à la demande (Chrome, Firefox, Edge, Android),
 * et signale un navigateur incompatible ou un jeton expiré. L'adresse
 * fournie par le serveur porte déjà le plafond 720p et le jeton.
 */
export function VideoHommagePlayer({
  item,
  title,
  texts,
  playRequest,
  onExpired,
}: {
  item: VideoHommageItem | null;
  title: string | null;
  texts: VideoHommageTexts;
  /** Compteur de demandes de lecture explicites ; 0 = aucune. */
  playRequest: number;
  /** VID-08 — l'hôte sait renouveler les adresses signées (bouton « Recharger la vidéo »). */
  onExpired?: () => void;
}) {
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const handledRequest = useRef(0);
  usePauseWhenHidden(video);
  useFullscreenOrientation(video);

  const source = item?.status === "ready" ? item.source : undefined;
  const playback = useStreamPlayback(video, source);
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

  let message: string | null = null;
  let state: string = item?.status ?? "empty";
  if (item === null) message = texts.empty;
  else if (item.status === "preparing") message = texts.preparing;
  else if (item.status === "local-unavailable") message = texts.localUnavailable;
  else if (item.status === "error" || source === undefined) message = texts.error;
  else if (playback.state !== "ready") {
    state = playback.state;
    message = playback.state === "unsupported" ? texts.unsupported : playback.state === "expired" ? texts.expired : texts.error;
  }
  const showVideo = source !== undefined && playback.state === "ready";

  return (
    <div
      className={styles.playerFrame}
      data-video-player=""
      data-state={message === null ? "ready" : state}
      data-stream-support={source?.kind === "stream" ? (playback.support ?? "pending") : undefined}
    >
      {showVideo && (
        <video
          ref={setVideo}
          key="player"
          className={styles.video}
          src={playback.src}
          poster={source.kind === "stream" ? source.posterUrl : undefined}
          preload={source.kind === "local" ? "metadata" : "none"}
          controls
          playsInline
          controlsList="nodownload noremoteplayback"
          disablePictureInPicture
          aria-label={title === null ? undefined : texts.playerLabel(title)}
          onError={playback.reportMediaError}
        />
      )}
      {message !== null && (
        <div className={styles.playerMessage} role="status">
          <p className={styles.playerMessageText}>{message}</p>
          {state === "expired" && onExpired !== undefined && (
            <button type="button" className={styles.playerAction} onClick={onExpired}>
              {texts.reload}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
