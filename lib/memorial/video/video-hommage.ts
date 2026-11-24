/**
 * VID-05A — « Des instants pour se souvenir » : modèle et règles pures.
 *
 * Aucun accès réseau, aucune horloge, aucun DOM : ce module décrit les vidéos
 * d'un hommage et applique le contrat fonctionnel validé par la PO (VID-02
 * V1.1, VID-04B). Il est partagé par la rubrique (composants
 * `components/memorial/video/*`), par le futur Builder et, plus tard, par le
 * contrôle serveur — qui reste la seule autorité au moment de l'ajout
 * définitif.
 *
 * Contrat :
 *  - 3 vidéos au maximum ;
 *  - 600 secondes cumulées au maximum, strictement, sans tolérance ;
 *  - titres facultatifs de 30 caractères au plus, espaces compris ;
 *  - sans titre : « Souvenir n », n = position actuelle (1, 2, 3) ;
 *  - la première vidéo de la liste est celle affichée par défaut.
 */

export const VIDEO_HOMMAGE_MAX_VIDEOS = 3;
export const VIDEO_HOMMAGE_MAX_TOTAL_SECONDS = 600;
export const VIDEO_HOMMAGE_MAX_TITLE_LENGTH = 30;

/**
 * D'où vient l'image d'une vidéo.
 *
 *  - `local` : fichier choisi sur l'appareil de la famille, lu par une
 *    adresse `blob:` créée dans le navigateur (démonstration gratuite).
 *    Rien n'est transmis à un serveur.
 *  - `stream` : flux d'un hébergeur (Mux), adresse COMPLÈTE fournie par le
 *    serveur HERITAGE : jeton de lecture et plafond 720p y sont déjà inclus.
 *    Ce module ne fabrique jamais d'adresse signée.
 */
export type VideoHommageSource =
  | { kind: "local"; url: string }
  | { kind: "stream"; url: string; posterUrl?: string };

/**
 * État d'une vidéo du point de vue de la rubrique.
 *
 *  - `ready` : lisible ;
 *  - `preparing` : ajout définitif en cours chez l'hébergeur ;
 *  - `error` : l'hébergeur ou le navigateur ne peut pas la lire ;
 *  - `local-unavailable` : vidéo de démonstration dont le fichier n'est plus
 *    accessible (onglet rechargé) : la famille doit la sélectionner à nouveau.
 */
export type VideoHommageStatus = "ready" | "preparing" | "error" | "local-unavailable";

export interface VideoHommageItem {
  /** Identifiant stable, propre à HERITAGE (jamais un identifiant Mux brut). */
  id: string;
  /**
   * Titre saisi par la famille (30 caractères au plus) ; `null` ou vide =
   * intitulé automatique. Toujours affiché via `videoDisplayTitle`, qui le
   * normalise.
   */
  title: string | null;
  /** Durée comptée, en secondes ; `null` tant qu'elle n'est pas connue. */
  durationSeconds: number | null;
  status: VideoHommageStatus;
  /** Absente pour `preparing`, `error` et `local-unavailable`. */
  source?: VideoHommageSource;
}

/** Libellés traduisibles dont les règles ont besoin. */
export interface VideoHommageDefaultTitle {
  (position: number): string;
}

/** Nombre de caractères tels qu'une personne les compte (accents, émojis). */
export function countCharacters(value: string): number {
  return splitCharacters(value).length;
}

function splitCharacters(value: string): string[] {
  const Segmenter = (Intl as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (Segmenter !== undefined) {
    return Array.from(new Segmenter("fr", { granularity: "grapheme" }).segment(value), (s) => s.segment);
  }
  return Array.from(value);
}

/**
 * Titre saisi → titre conservé. Espaces de début et de fin retirés, suites
 * d'espaces (y compris retours à la ligne) ramenées à une seule, puis coupure
 * à 30 caractères. Une chaîne vide devient `null` (intitulé automatique).
 */
export function normalizeVideoTitle(input: string | null | undefined): string | null {
  if (input === null || input === undefined) return null;
  const collapsed = input.replace(/\s+/gu, " ").trim();
  if (collapsed === "") return null;
  const characters = splitCharacters(collapsed);
  if (characters.length <= VIDEO_HOMMAGE_MAX_TITLE_LENGTH) return collapsed;
  return characters.slice(0, VIDEO_HOMMAGE_MAX_TITLE_LENGTH).join("").trimEnd();
}

/**
 * Saisie en cours → valeur gardée dans le champ : seulement limitée à
 * 30 caractères, sans retirer les espaces (la famille doit pouvoir taper
 * « À la plage » lettre par lettre). La normalisation se fait à l'affichage
 * et à l'enregistrement (`normalizeVideoTitle`).
 */
export function limitVideoTitleInput(input: string): string {
  const characters = splitCharacters(input.replace(/[\r\n\t]+/gu, " "));
  return characters.length <= VIDEO_HOMMAGE_MAX_TITLE_LENGTH ? characters.join("") : characters.slice(0, VIDEO_HOMMAGE_MAX_TITLE_LENGTH).join("");
}

/** Titre affiché : celui de la famille, sinon « Souvenir n » selon la position (0 → 1). */
export function videoDisplayTitle(item: Pick<VideoHommageItem, "title">, index: number, defaultTitle: VideoHommageDefaultTitle): string {
  const title = normalizeVideoTitle(item.title);
  return title ?? defaultTitle(index + 1);
}

/** Durée affichée : minutes et secondes entières, « 4:28 ». Inconnue → `null`. */
export function formatVideoDuration(seconds: number | null): string | null {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return null;
  const whole = Math.floor(seconds);
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

/**
 * Secondes → millisecondes entières, arrondies VERS LE HAUT : le cumul se
 * calcule en entiers (aucune erreur d'arrondi flottant) et l'arrondi ne
 * peut jamais faire passer sous la limite une vidéo qui la dépasse.
 */
function toCountedMilliseconds(seconds: number): number {
  return Math.ceil(seconds * 1000 - 1e-6);
}

const LIMIT_MS = VIDEO_HOMMAGE_MAX_TOTAL_SECONDS * 1000;

export interface VideoHommageBudget {
  count: number;
  usedSeconds: number;
  remainingSeconds: number;
  /** Une vidéo de plus peut-elle être ajoutée (nombre seulement) ? */
  canAddAnother: boolean;
}

/**
 * Temps et places restants. Une vidéo dont la durée est encore inconnue
 * occupe une place mais ne consomme pas de temps : le contrôle définitif
 * l'intégrera quand sa durée sera mesurée.
 */
export function videoHommageBudget(items: readonly Pick<VideoHommageItem, "durationSeconds">[]): VideoHommageBudget {
  const usedMs = items.reduce((sum, item) => (item.durationSeconds === null ? sum : sum + toCountedMilliseconds(item.durationSeconds)), 0);
  const remainingMs = Math.max(0, LIMIT_MS - usedMs);
  return {
    count: items.length,
    usedSeconds: usedMs / 1000,
    remainingSeconds: remainingMs / 1000,
    canAddAnother: items.length < VIDEO_HOMMAGE_MAX_VIDEOS,
  };
}

export type VideoAdmission =
  | { ok: true }
  | { ok: false; reason: "too-many-videos" }
  | { ok: false; reason: "duration-unknown" }
  | { ok: false; reason: "too-long"; durationSeconds: number; remainingSeconds: number };

/**
 * Une vidéo de `durationSeconds` peut-elle rejoindre `items` ?
 * `replacingId` : la vidéo remplacée libère d'abord sa place et son temps.
 * Limite stricte : 600 s pile passe, 600,001 s ne passe pas.
 */
export function admitVideo(
  items: readonly Pick<VideoHommageItem, "id" | "durationSeconds">[],
  durationSeconds: number | null,
  replacingId?: string,
): VideoAdmission {
  const others = replacingId === undefined ? items : items.filter((item) => item.id !== replacingId);
  if (others.length >= VIDEO_HOMMAGE_MAX_VIDEOS) return { ok: false, reason: "too-many-videos" };
  if (durationSeconds === null || !Number.isFinite(durationSeconds) || durationSeconds < 0) {
    return { ok: false, reason: "duration-unknown" };
  }
  const { remainingSeconds } = videoHommageBudget(others);
  if (toCountedMilliseconds(durationSeconds) > remainingSeconds * 1000) {
    return { ok: false, reason: "too-long", durationSeconds, remainingSeconds };
  }
  return { ok: true };
}

/** La liste entière respecte-t-elle le contrat (nombre et cumul) ? */
export function isVideoCollectionWithinLimits(items: readonly Pick<VideoHommageItem, "durationSeconds">[]): boolean {
  if (items.length > VIDEO_HOMMAGE_MAX_VIDEOS) return false;
  const usedMs = items.reduce((sum, item) => (item.durationSeconds === null ? sum : sum + toCountedMilliseconds(item.durationSeconds)), 0);
  return usedMs <= LIMIT_MS;
}

/** Déplace la vidéo `from` à la position `to` (copie, l'entrée n'est pas modifiée). */
export function moveVideo<T>(items: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items.slice();
  const next = items.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved as T);
  return next;
}

/** Remplace la vidéo `id` par `replacement`, à la même position. */
export function replaceVideo<T extends { id: string }>(items: readonly T[], id: string, replacement: T): T[] {
  return items.map((item) => (item.id === id ? replacement : item));
}

/** Retire la vidéo `id`. */
export function removeVideo<T extends { id: string }>(items: readonly T[], id: string): T[] {
  return items.filter((item) => item.id !== id);
}

/**
 * Durée COMPTÉE d'une vidéo hébergée chez Mux (décision PO : base piste image).
 *
 * Mesures VID-04B (fichiers synthétiques, 8 à 120 s) : la durée de la piste
 * image fournie par Mux est exactement celle du fichier, tandis que la durée
 * globale de l'actif ajoute toujours deux images de traitement
 * (+0,033 s à 60 i/s, +0,067 s à 30 i/s).
 *
 * Contrôle de la piste son (question de l'ordre VID-05A § 7) : si le son
 * dure plus longtemps que l'image, la vidéo dure réellement plus longtemps
 * que sa piste image. La durée globale Mux couvre alors ce son ; on lui
 * retire seulement les deux images de traitement constatées, et l'on garde
 * la plus grande des deux valeurs :
 *
 *     comptée = max(piste image, durée globale − 2 / images par seconde)
 *
 * Ainsi une vidéo de 10:00 pile n'est pas refusée pour 0,067 s de
 * traitement, et un son qui déborde de l'image est toujours compté.
 * Sans piste image ou sans fréquence d'images connue, la durée globale est
 * comptée telle quelle (prudence : jamais de marge implicite).
 *
 * À confirmer sur de vraies vidéos de téléphone (fréquence variable, son plus
 * long que l'image) avant l'activation du contrôle serveur.
 */
export function countedHostedDurationSeconds(input: {
  assetDurationSeconds: number;
  videoTrackDurationSeconds?: number | null;
  frameRate?: number | null;
}): number {
  const { assetDurationSeconds, videoTrackDurationSeconds, frameRate } = input;
  if (
    videoTrackDurationSeconds === null ||
    videoTrackDurationSeconds === undefined ||
    !Number.isFinite(videoTrackDurationSeconds) ||
    frameRate === null ||
    frameRate === undefined ||
    !Number.isFinite(frameRate) ||
    frameRate <= 0
  ) {
    return assetDurationSeconds;
  }
  const processingPadding = 2 / frameRate;
  return Math.max(videoTrackDurationSeconds, assetDurationSeconds - processingPadding);
}
