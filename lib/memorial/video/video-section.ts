import type { VideoDraftItem } from "./video-content";
import type { VideoHommageItem } from "./video-hommage";
import type { LocalVideoEntry } from "./local-video-registry";
import type { HostedVideoView, SignedVideoPlaybackView } from "./hosting/hosted-video-types";

/**
 * VID-08 — ce que la rubrique « Des instants pour se souvenir » montre, selon
 * l'endroit où elle est dessinée. Pur, sans React ni réseau.
 *
 *  - Page publique : seulement les vidéos que le SERVEUR a signées pour
 *    cette visite (hommage publié, offre complète, vidéo prête au moment de
 *    la dernière publication) ; une vidéo du brouillon publié sans lecture
 *    signée est simplement absente. Aucune ne l'est : pas de rubrique.
 *  - Aperçu du Builder : chaque vidéo décrite par la famille, avec un état
 *    honnête : son fichier encore sur l'appareil (lecture locale, jamais
 *    présentée comme hébergée), sinon sa version hébergée prête, sinon
 *    « en préparation », « à sélectionner de nouveau » ou « illisible ».
 */

/** Lecture signée d'une vidéo publique, préparée par le serveur pour UNE visite. */
export interface PublicVideoPlayback extends SignedVideoPlaybackView {
  /** Durée mesurée par l'hébergeur. */
  durationSeconds: number;
}

export type PublicVideoPlaybackMap = Readonly<Record<string, PublicVideoPlayback>>;

function streamSource(playback: SignedVideoPlaybackView): Extract<VideoHommageItem["source"], { kind: "stream" }> {
  return {
    kind: "stream",
    url: playback.hlsUrl,
    posterUrl: playback.posterUrl,
    expiresAt: playback.expiresAt,
    ...(playback.mp4Url === null ? {} : { fallbackUrl: playback.mp4Url }),
  };
}

/** Page publique : l'ordre de la copie publiée, uniquement ce qui est signé. */
export function publicVideoItems(items: readonly VideoDraftItem[], playback: PublicVideoPlaybackMap): VideoHommageItem[] {
  return items.flatMap((item) => {
    const signed = Object.prototype.hasOwnProperty.call(playback, item.id) ? playback[item.id] : undefined;
    if (signed === undefined) return [];
    return [{ id: item.id, title: item.title, durationSeconds: signed.durationSeconds, status: "ready" as const, source: streamSource(signed) }];
  });
}

const FINAL_FAILURES: ReadonlySet<HostedVideoView["failure"]> = new Set(["over_total_duration", "too_many_videos", "duration_unavailable", "asset_errored"]);

/** Aperçu du Builder : l'état réel d'une vidéo décrite par la famille. */
export function previewVideoItem(item: VideoDraftItem, local: LocalVideoEntry | null, hosted: HostedVideoView | null): VideoHommageItem {
  const base = { id: item.id, title: item.title, durationSeconds: item.durationSeconds };
  // Refusée par l'hébergement (durée, nombre) : elle ne sera pas dans l'hommage.
  if (hosted?.state === "failed" && FINAL_FAILURES.has(hosted.failure)) return { ...base, status: "error" };
  if (local !== null) return local.metadata.playable ? { ...base, status: "ready", source: { kind: "local", url: local.url } } : { ...base, status: "error" };
  if (hosted?.state === "ready" && hosted.playback !== null) {
    return { ...base, durationSeconds: hosted.durationSeconds ?? item.durationSeconds, status: "ready", source: streamSource(hosted.playback) };
  }
  if (hosted?.state === "processing") return { ...base, status: "preparing" };
  return { ...base, status: "local-unavailable" };
}

/**
 * Page publique : la rubrique vidéo assemblée reçoit les lectures signées de
 * la visite, restreintes à ses propres vidéos ; sans vidéo lisible, elle est
 * retirée (jamais de rubrique vide). Les autres rubriques sont rendues telles
 * quelles. Générique sur la forme des sections pour rester sans dépendance.
 */
export function withPublicVideoPlayback<S extends { rendererKey: string; props: unknown }>(sections: readonly S[], playback: PublicVideoPlaybackMap): S[] {
  return sections.flatMap((section) => {
    if (section.rendererKey !== "VideoHommageV1Section") return [section];
    const props = section.props as { items: readonly VideoDraftItem[] };
    const own = Object.fromEntries(props.items.flatMap((item) => (Object.prototype.hasOwnProperty.call(playback, item.id) ? [[item.id, playback[item.id]!]] : [])));
    if (Object.keys(own).length === 0) return [];
    return [{ ...section, props: { ...props, publicPlayback: own } }];
  });
}
