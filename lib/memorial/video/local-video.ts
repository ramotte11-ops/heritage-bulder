/**
 * VID-05A — vidéos de DÉMONSTRATION, lues localement dans le navigateur.
 *
 * Décision PO (VID-02) : avant l'offre complète, la famille choisit ses
 * vidéos sur son appareil et les voit dans le lecteur HERITAGE, sans aucun
 * transfert. Ce module ne fait jamais de requête réseau : il crée une adresse
 * `blob:` propre à l'onglet, lit la durée par un élément `<video>` détaché, et
 * libère l'adresse quand la vidéo est retirée ou remplacée.
 *
 * Rien n'est conservé durablement : une adresse `blob:` meurt avec l'onglet.
 * Après un rechargement, la vidéo passe à l'état `local-unavailable` et la
 * famille la sélectionne à nouveau (contrat VID-02 § 3).
 */

export interface LocalVideoMetadata {
  /** Durée lue par le navigateur, en secondes ; `null` s'il ne sait pas la lire. */
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  /** Le navigateur sait-il décoder ce fichier pour l'aperçu ? */
  playable: boolean;
}

export interface LocalVideoHandle {
  url: string;
  metadata: LocalVideoMetadata;
  /** Libère l'adresse `blob:` ; sans effet au second appel. */
  release(): void;
}

/** Fichier présenté comme une vidéo par l'appareil (type MIME `video/…`). */
export function isVideoFile(file: Pick<File, "type">): boolean {
  return file.type.startsWith("video/");
}

/** Dépendances injectables, pour les tests et pour garder ce module sans état global. */
export interface LocalVideoEnvironment {
  createObjectURL(file: Blob): string;
  revokeObjectURL(url: string): void;
  createVideoElement(): HTMLVideoElement;
  /** Délai maximal d'attente des métadonnées, en millisecondes. */
  timeoutMs: number;
}

function browserEnvironment(): LocalVideoEnvironment {
  return {
    createObjectURL: (file) => URL.createObjectURL(file),
    revokeObjectURL: (url) => URL.revokeObjectURL(url),
    createVideoElement: () => document.createElement("video"),
    timeoutMs: 15_000,
  };
}

/**
 * Ouvre un fichier local pour la démonstration : adresse `blob:` et
 * métadonnées. Un fichier que le navigateur ne sait pas décoder (par exemple
 * du HEVC hors Safari) n'est pas une erreur : `playable` vaut `false` et la
 * durée peut rester inconnue.
 */
export async function openLocalVideo(file: Blob, environment: LocalVideoEnvironment = browserEnvironment()): Promise<LocalVideoHandle> {
  const url = environment.createObjectURL(file);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    environment.revokeObjectURL(url);
  };
  const metadata = await readMetadata(url, environment);
  return { url, metadata, release };
}

function readMetadata(url: string, environment: LocalVideoEnvironment): Promise<LocalVideoMetadata> {
  return new Promise((resolve) => {
    const video = environment.createVideoElement();
    let settled = false;
    const finish = (metadata: LocalVideoMetadata) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeAttribute("src");
      video.load?.();
      resolve(metadata);
    };
    const timer = setTimeout(() => finish({ durationSeconds: null, width: null, height: null, playable: false }), environment.timeoutMs);
    video.preload = "metadata";
    video.muted = true;
    video.addEventListener(
      "loadedmetadata",
      () => {
        const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null;
        finish({
          durationSeconds: duration,
          width: video.videoWidth > 0 ? video.videoWidth : null,
          height: video.videoHeight > 0 ? video.videoHeight : null,
          playable: video.videoWidth > 0,
        });
      },
      { once: true },
    );
    video.addEventListener("error", () => finish({ durationSeconds: null, width: null, height: null, playable: false }), { once: true });
    video.src = url;
  });
}
