import type { MemorialContent } from "@/types/memorial";
import {
  VIDEO_HOMMAGE_MAX_TOTAL_SECONDS,
  VIDEO_HOMMAGE_MAX_VIDEOS,
  countCharacters,
  normalizeVideoTitle,
  VIDEO_HOMMAGE_MAX_TITLE_LENGTH,
} from "./video-hommage";

/**
 * VID-06 — ce que le BROUILLON garde de la rubrique « Des instants pour se
 * souvenir » : des informations légères, jamais les fichiers.
 *
 * Stocké sous `content.video` (la rubrique `video`, comme `content.gallery`) :
 *
 *   { "items": [ { "id": "v-…", "title": "Les 80 ans de Mamie", "durationSeconds": 268.4 },
 *                { "id": "v-…", "title": null, "durationSeconds": null } ] }
 *
 *  - L'ORDRE du tableau est l'ordre choisi par la famille (Souvenir 1, 2, 3).
 *  - `title` : facultatif, 30 caractères au plus, déjà normalisé ; `null`
 *    = intitulé automatique « Souvenir n ».
 *  - `durationSeconds` : la durée lue par le navigateur ; `null` = durée
 *    INDISPONIBLE (jamais comptée comme zéro : le cumul est alors « à
 *    vérifier », `videoDraftCompliance`).
 *  - Aucun nom de fichier (souvent porteur de données personnelles), aucune
 *    adresse, aucun octet : le fichier lui-même reste dans le navigateur,
 *    le temps de la page (`local-video-registry.ts`). Après un
 *    rechargement, la famille le sélectionne à nouveau.
 *
 * Publication : `video` est une rubrique premium (`PREMIUM_SECTION_IDS`) sans
 * rendu public ; la projection publiée ne la reprend jamais, et l'offre
 * gratuite affiche l'avis existant « réservées à l'hommage complet ».
 *
 * Lecture défensive (discipline de `contributions-settings.ts`) : une valeur
 * mal formée est signalée `corrupted`, jamais remplacée en silence ; les clés
 * inconnues (version future : état d'hébergement Mux) sont conservées à
 * l'écriture, sous `video` comme sous chaque vidéo.
 */

export interface VideoDraftItem {
  /** Identifiant local stable, `v-` suivi de lettres, chiffres ou tirets. */
  id: string;
  title: string | null;
  durationSeconds: number | null;
}

export type VideoDraftRead =
  | { status: "absent"; items: readonly VideoDraftItem[] }
  | { status: "valid"; items: readonly VideoDraftItem[] }
  | { status: "corrupted" };

interface VideoContentHolder {
  video?: unknown;
}

const ID_PATTERN = /^v-[A-Za-z0-9-]{1,64}$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidDuration(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value) && value > 0);
}

function isValidTitle(value: unknown): value is string | null {
  if (value === null) return true;
  if (typeof value !== "string") return false;
  return normalizeVideoTitle(value) === value && countCharacters(value) <= VIDEO_HOMMAGE_MAX_TITLE_LENGTH;
}

/** Identifiant local d'une nouvelle vidéo. `random` est injectable pour les tests. */
export function createVideoDraftId(random: () => string = () => globalThis.crypto.randomUUID()): string {
  return `v-${random()}`;
}

/** Lit les vidéos préparées ; `absent` = la famille n'en a jamais ajouté. */
export function inspectVideoContent(content: MemorialContent): VideoDraftRead {
  const raw = (content as VideoContentHolder).video;
  if (raw === undefined) return { status: "absent", items: [] };
  if (!isPlainObject(raw) || !Array.isArray(raw.items)) return { status: "corrupted" };
  if (raw.items.length > VIDEO_HOMMAGE_MAX_VIDEOS) return { status: "corrupted" };
  const items: VideoDraftItem[] = [];
  const ids = new Set<string>();
  for (const entry of raw.items) {
    if (!isPlainObject(entry)) return { status: "corrupted" };
    const { id, title, durationSeconds } = entry;
    if (typeof id !== "string" || !ID_PATTERN.test(id) || ids.has(id)) return { status: "corrupted" };
    if (!isValidTitle(title) || !isValidDuration(durationSeconds)) return { status: "corrupted" };
    ids.add(id);
    items.push({ id, title, durationSeconds });
  }
  return { status: "valid", items };
}

/**
 * Écrit la liste complète, dans l'ordre donné, sans toucher à aucune autre
 * clé du brouillon. Les titres sont normalisés ici (dernier mot avant
 * l'enregistrement). Les clés inconnues de `video` et de chaque vidéo déjà
 * présente (même `id`) sont gardées telles quelles.
 */
export function writeVideoItems(content: MemorialContent, items: readonly VideoDraftItem[]): MemorialContent {
  const raw = (content as VideoContentHolder).video;
  const previous = isPlainObject(raw) ? raw : {};
  const previousItems = new Map<string, Record<string, unknown>>();
  if (Array.isArray(previous.items)) {
    for (const entry of previous.items) {
      if (isPlainObject(entry) && typeof entry.id === "string") previousItems.set(entry.id, entry);
    }
  }
  const nextItems = items.map((item) => ({
    ...Object.fromEntries(
      Object.entries(previousItems.get(item.id) ?? {}).filter(([key]) => key !== "id" && key !== "title" && key !== "durationSeconds"),
    ),
    id: item.id,
    title: normalizeVideoTitle(item.title),
    durationSeconds: item.durationSeconds,
  }));
  const next = {
    ...Object.fromEntries(Object.entries(previous).filter(([key]) => key !== "items")),
    items: nextItems,
  };
  return { ...content, video: next } as MemorialContent;
}

// ------------------------------------------------------------- Limites

/** Secondes → millisecondes entières, arrondies vers le haut (même règle que `video-hommage.ts`). */
function toCountedMilliseconds(seconds: number): number {
  return Math.ceil(seconds * 1000 - 1e-6);
}

const LIMIT_MS = VIDEO_HOMMAGE_MAX_TOTAL_SECONDS * 1000;

export interface VideoDraftBudget {
  count: number;
  /** Cumul des durées CONNUES. */
  knownSeconds: number;
  /** Vidéos dont la durée est indisponible : jamais comptées comme zéro. */
  unknownCount: number;
  /** Ce qui reste sur 600 s d'après les durées connues (0 au minimum). */
  remainingSeconds: number;
  canAddAnother: boolean;
}

export function videoDraftBudget(items: readonly Pick<VideoDraftItem, "durationSeconds">[]): VideoDraftBudget {
  const knownMs = items.reduce((sum, item) => (item.durationSeconds === null ? sum : sum + toCountedMilliseconds(item.durationSeconds)), 0);
  return {
    count: items.length,
    knownSeconds: knownMs / 1000,
    unknownCount: items.filter((item) => item.durationSeconds === null).length,
    remainingSeconds: Math.max(0, LIMIT_MS - knownMs) / 1000,
    canAddAnother: items.length < VIDEO_HOMMAGE_MAX_VIDEOS,
  };
}

/**
 * Conformité de la sélection aux limites de l'offre :
 *  - `empty` : aucune vidéo ;
 *  - `within` : 3 vidéos au plus, toutes mesurées, 600 s au plus ;
 *  - `unverified` : au moins une durée indisponible — le cumul ne peut PAS
 *    être déclaré conforme ; il sera vérifié par la mesure de l'hébergeur,
 *    après activation de l'offre complète ;
 *  - `over` : plus de 3 vidéos, ou plus de 600 s mesurées.
 */
export type VideoDraftCompliance = "empty" | "within" | "unverified" | "over";

export function videoDraftCompliance(items: readonly Pick<VideoDraftItem, "durationSeconds">[]): VideoDraftCompliance {
  if (items.length === 0) return "empty";
  const budget = videoDraftBudget(items);
  if (items.length > VIDEO_HOMMAGE_MAX_VIDEOS || budget.knownSeconds * 1000 > LIMIT_MS) return "over";
  return budget.unknownCount > 0 ? "unverified" : "within";
}

export type VideoDraftAdmission =
  | { ok: true; durationVerified: boolean }
  | { ok: false; reason: "too-many-videos" }
  | { ok: false; reason: "no-time-left" }
  | { ok: false; reason: "too-long"; durationSeconds: number; remainingSeconds: number };

/**
 * Une nouvelle vidéo (ou le remplacement de `replacingId`) peut-elle entrer ?
 *  - jamais une quatrième ;
 *  - durée connue : le cumul doit rester ≤ 600 s (600 s exactement passe) ;
 *  - durée indisponible : acceptée, mais SIGNALÉE (`durationVerified:
 *    false`), sauf s'il ne reste plus une seconde — toute vidéo dépasserait.
 */
export function admitDraftVideo(
  items: readonly Pick<VideoDraftItem, "id" | "durationSeconds">[],
  durationSeconds: number | null,
  replacingId?: string,
): VideoDraftAdmission {
  const others = replacingId === undefined ? items : items.filter((item) => item.id !== replacingId);
  if (others.length >= VIDEO_HOMMAGE_MAX_VIDEOS) return { ok: false, reason: "too-many-videos" };
  const { remainingSeconds } = videoDraftBudget(others);
  if (durationSeconds === null || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return remainingSeconds > 0 ? { ok: true, durationVerified: false } : { ok: false, reason: "no-time-left" };
  }
  if (toCountedMilliseconds(durationSeconds) > remainingSeconds * 1000) {
    return remainingSeconds > 0
      ? { ok: false, reason: "too-long", durationSeconds, remainingSeconds }
      : { ok: false, reason: "no-time-left" };
  }
  return { ok: true, durationVerified: true };
}
