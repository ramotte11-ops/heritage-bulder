import type { LocalVideoHandle, LocalVideoMetadata } from "./local-video";

/**
 * VID-06 — les fichiers vidéo choisis par la famille, le temps de la page.
 *
 * Le brouillon ne garde que des informations légères (`video-content.ts`) ;
 * le fichier lui-même reste dans le navigateur, ici, en MÉMOIRE seulement :
 *  - aucune écriture dans IndexedDB, localStorage ou un cache (dix minutes
 *    de vidéo de téléphone pèsent des centaines de Mo : les quotas du
 *    navigateur ne sont pas faits pour cela, et une vidéo prétendument
 *    « sauvegardée » qui disparaîtrait serait trompeuse) ;
 *  - aucune requête réseau ;
 *  - le registre survit aux allers-retours entre les écrans du Builder
 *    (« Mon parcours », « Voir l'aperçu ») parce qu'il vit au niveau du
 *    module, pas d'un composant ; il meurt avec la page (fermeture,
 *    rechargement) : la vidéo passe alors à l'état « à sélectionner de
 *    nouveau », ses titre, durée et ordre restant dans le brouillon.
 *
 * Chaque entrée possède son adresse `blob:` ; la remplacer ou la retirer la
 * libère aussitôt (pas de fuite de mémoire).
 */

export interface LocalVideoEntry {
  url: string;
  metadata: LocalVideoMetadata;
}

export interface LocalVideoRegistry {
  get(id: string): LocalVideoEntry | null;
  has(id: string): boolean;
  /** Associe le fichier ouvert à la vidéo `id` ; libère l'éventuel fichier précédent. */
  set(id: string, handle: LocalVideoHandle): void;
  /** Retire et libère ; sans effet si absent. */
  release(id: string): void;
  /** Libère tout ce qui n'est plus dans `keepIds` (vidéos retirées ailleurs, autre onglet). */
  retainOnly(keepIds: readonly string[]): void;
  size(): number;
}

export function createLocalVideoRegistry(): LocalVideoRegistry {
  const handles = new Map<string, LocalVideoHandle>();
  const release = (id: string) => {
    const handle = handles.get(id);
    if (handle === undefined) return;
    handles.delete(id);
    handle.release();
  };
  return {
    get: (id) => {
      const handle = handles.get(id);
      return handle === undefined ? null : { url: handle.url, metadata: handle.metadata };
    },
    has: (id) => handles.has(id),
    set: (id, handle) => {
      const previous = handles.get(id);
      handles.set(id, handle);
      if (previous !== undefined && previous !== handle) previous.release();
    },
    release,
    retainOnly: (keepIds) => {
      const keep = new Set(keepIds);
      for (const id of [...handles.keys()]) if (!keep.has(id)) release(id);
    },
    size: () => handles.size,
  };
}

let pageRegistry: LocalVideoRegistry | null = null;

/** Le registre de la page (un seul par onglet). */
export function pageLocalVideoRegistry(): LocalVideoRegistry {
  pageRegistry ??= createLocalVideoRegistry();
  return pageRegistry;
}
