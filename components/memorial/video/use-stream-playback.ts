"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type Hls from "hls.js";
import type { VideoHommageSource } from "@/lib/memorial/video/video-hommage";

/**
 * VID-08 — lecture des flux hébergés (HLS signé, plafonné à 720p par son
 * jeton) dans TOUS les navigateurs compatibles.
 *
 * Choix du mode, sur les capacités RÉELLES du navigateur :
 *  1. `native` : le lecteur du navigateur lit le HLS (Safari sur iPhone et
 *     Mac, et les navigateurs qui le déclarent) → l'adresse est posée
 *     directement sur `<video>` ; hls.js n'est jamais téléchargé ;
 *  2. `mse` : pas de HLS natif, mais Media Source Extensions (Chrome,
 *     Firefox, Edge, Android) → hls.js, chargé À LA DEMANDE dans un fichier
 *     séparé, seulement quand le lecteur approche de l'écran ;
 *  3. `none` : ni l'un ni l'autre → message clair (ou MP4 de secours si,
 *     et seulement si, le serveur en fournit un : il n'est jamais créé
 *     automatiquement).
 *
 * Économie : hls.js lit la liste de lecture (quelques Ko) quand le lecteur
 * approche de l'écran, mais ne télécharge AUCUN segment vidéo avant que le
 * visiteur demande la lecture (`autoStartLoad: false`). Aucune lecture
 * automatique, aucun enchaînement : ce module ne lance jamais `play()`.
 *
 * Jetons : une adresse dont le jeton a expiré (heure connue, ou refus 401,
 * 403, 410 de l'hébergeur) donne l'état `expired` ; l'hôte peut alors
 * fournir de nouvelles adresses signées par le serveur. Aucun secret n'est
 * ici : seules les adresses déjà signées arrivent au navigateur.
 *
 * Nettoyage : changement de vidéo, de source ou démontage → hls.js est
 * détruit (tampons, MediaSource et écouteurs libérés).
 */

export type StreamSupport = "native" | "mse" | "none";
export type StreamPlaybackState = "ready" | "unsupported" | "expired" | "error";

const HLS_MIME = "application/vnd.apple.mpegurl";
const MSE_PROBE = 'video/mp4; codecs="avc1.42E01E,mp4a.40.2"';
/** Un jeton qui expire dans moins de 10 s est traité comme expiré. */
export const STREAM_EXPIRY_MARGIN_MS = 10_000;
/** Distance avant l'écran à partir de laquelle hls.js est préparé. */
export const STREAM_PREPARE_MARGIN = "300px";

interface MediaSourceLike {
  isTypeSupported?: (type: string) => boolean;
}

export function detectStreamSupport(scope: unknown = globalThis): StreamSupport {
  const doc = (scope as { document?: Document }).document;
  if (doc !== undefined) {
    const probe = doc.createElement("video");
    if (typeof probe.canPlayType === "function" && probe.canPlayType(HLS_MIME) !== "") return "native";
  }
  const g = scope as { ManagedMediaSource?: MediaSourceLike; MediaSource?: MediaSourceLike; WebKitMediaSource?: MediaSourceLike };
  const mse = g.ManagedMediaSource ?? g.MediaSource ?? g.WebKitMediaSource;
  if (mse !== undefined && typeof mse.isTypeSupported === "function" && mse.isTypeSupported(MSE_PROBE)) return "mse";
  return "none";
}

export function isStreamExpired(source: VideoHommageSource | undefined, nowMs: number): boolean {
  if (source?.kind !== "stream" || source.expiresAt === undefined) return false;
  const expiresAt = Date.parse(source.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt - STREAM_EXPIRY_MARGIN_MS <= nowMs;
}

// La détection ne change pas pendant la vie de la page ; côté serveur, elle
// est inconnue (`null`) : aucune adresse de flux n'est rendue dans le HTML.
let detected: StreamSupport | null = null;
const noSubscription = () => () => {};
const clientSupport = () => (detected ??= detectStreamSupport());
const serverSupport = () => null;

/** Tests seulement : oublie la détection mise en cache. */
export function resetStreamSupportForTests(): void {
  detected = null;
}

type HlsModule = { default: typeof Hls };
const loadHls = (): Promise<HlsModule> => import("hls.js");

export interface StreamPlayback {
  /** L'adresse à poser sur `<video src>` ; `undefined` quand hls.js gère l'élément. */
  src: string | undefined;
  state: StreamPlaybackState;
  support: StreamSupport | null;
  /** Erreur rapportée par l'élément `<video>` lui-même. */
  reportMediaError(): void;
}

export function useStreamPlayback(video: HTMLVideoElement | null, source: VideoHommageSource | undefined): StreamPlayback {
  const support = useSyncExternalStore(noSubscription, clientSupport, serverSupport);
  const [failure, setFailure] = useState<{ url: string; state: StreamPlaybackState } | null>(null);
  const stream = source?.kind === "stream" ? source : undefined;
  const url = source?.url;
  // Dépendances par valeur : un nouvel objet pour la même adresse ne recrée pas le lecteur.
  const streamUrl = stream?.url;
  const streamExpiresAt = stream?.expiresAt;

  let src: string | undefined;
  let base: StreamPlaybackState = "ready";
  if (source?.kind === "local") src = source.url;
  else if (stream !== undefined && support === "native") src = stream.url;
  else if (stream !== undefined && support === "none") {
    if (stream.fallbackUrl !== undefined) src = stream.fallbackUrl;
    else base = "unsupported";
  }
  const state = failure !== null && failure.url === url ? failure.state : base;

  // Jeton expiré au moment où le visiteur demande la lecture : aucune
  // requête vouée à l'échec, l'hôte peut renouveler les adresses.
  useEffect(() => {
    if (video === null || streamUrl === undefined) return;
    const current = { kind: "stream", url: streamUrl, expiresAt: streamExpiresAt } as const;
    const onPlay = () => {
      if (!isStreamExpired(current, Date.now())) return;
      video.pause();
      setFailure({ url: streamUrl, state: "expired" });
    };
    video.addEventListener("play", onPlay);
    return () => video.removeEventListener("play", onPlay);
  }, [video, streamUrl, streamExpiresAt]);

  // hls.js, seulement en mode MSE, seulement près de l'écran.
  useEffect(() => {
    if (video === null || streamUrl === undefined || support !== "mse") return;
    const stream = { kind: "stream", url: streamUrl, expiresAt: streamExpiresAt } as const;
    let disposed = false;
    let hls: Hls | null = null;
    let preparing = false;
    let loading = false;
    const fail = (next: StreamPlaybackState) => {
      if (!disposed) setFailure({ url: stream.url, state: next });
    };
    const startLoading = () => {
      if (hls === null || loading) return;
      loading = true;
      hls.startLoad(-1);
    };
    const prepare = async () => {
      if (preparing) return;
      preparing = true;
      let HlsClass: typeof Hls;
      try {
        HlsClass = (await loadHls()).default;
      } catch {
        fail("error");
        return;
      }
      if (disposed) return;
      if (!HlsClass.isSupported()) {
        fail("unsupported");
        return;
      }
      const instance = new HlsClass({ autoStartLoad: false, capLevelToPlayerSize: true, maxBufferLength: 30, backBufferLength: 30 });
      hls = instance;
      let mediaRecoveries = 0;
      instance.on(HlsClass.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        if (data.type === HlsClass.ErrorTypes.NETWORK_ERROR) {
          const code = data.response?.code;
          instance.stopLoad();
          fail(code === 401 || code === 403 || code === 410 || isStreamExpired(stream, Date.now()) ? "expired" : "error");
          return;
        }
        if (data.type === HlsClass.ErrorTypes.MEDIA_ERROR && mediaRecoveries < 1) {
          mediaRecoveries += 1;
          instance.recoverMediaError();
          return;
        }
        fail("error");
      });
      instance.attachMedia(video);
      instance.loadSource(stream.url);
      if (!video.paused) startLoading();
    };
    const onPlay = () => {
      if (isStreamExpired(stream, Date.now())) return;
      if (hls === null) void prepare().then(startLoading);
      else startLoading();
    };
    video.addEventListener("play", onPlay);

    let observer: IntersectionObserver | null = null;
    if (typeof IntersectionObserver === "undefined") void prepare();
    else {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            observer?.disconnect();
            void prepare();
          }
        },
        { rootMargin: STREAM_PREPARE_MARGIN },
      );
      observer.observe(video);
    }

    return () => {
      disposed = true;
      observer?.disconnect();
      video.removeEventListener("play", onPlay);
      hls?.destroy();
      hls = null;
    };
  }, [video, streamUrl, streamExpiresAt, support]);

  return {
    src,
    state,
    support,
    reportMediaError() {
      if (url === undefined) return;
      setFailure({ url, state: isStreamExpired(source, Date.now()) ? "expired" : "error" });
    },
  };
}
