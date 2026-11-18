import type { ContributionsTheme } from "@/config/contributions-master-measurements";
import {
  CONTRIBUTIONS_ALBUM_FRAMES,
  contributionsAlbumPlateGeometry,
  type ContributionsAlbumFrame,
  type ContributionsAlbumPhase,
} from "@/config/contributions-album-v1";
import { phaseOf } from "@/lib/memorial/album/album-partition";
import type { Point } from "@/lib/memorial/gallery/dynamic-polaroid-qa";
import {
  solveContributionsScene,
  type ContributionSceneItem,
  type ContributionScenePlacement,
  type ContributionsPass,
  type ContributionsSceneStatus,
} from "@/lib/memorial/contributions/contributions-scene";

/**
 * M6 — Album complet des Contributions des proches : COMPOSITION.
 *
 * Aucun second moteur. L'Album réutilise :
 *  - la PARTITION A13 (`album-partition.ts`) : tranches CONTIGUËS de la
 *    source, jamais réordonnées, jamais un groupe isolé d'une seule
 *    contribution quand il y en a plusieurs ; phase Thue–Morse A / B
 *    (`phaseOf`) d'une planche pleine à l'autre ;
 *  - le SOLVEUR LOCAL A13 étendu aux cartes (M4 → M5-B), au travers de
 *    `solveContributionsScene` : une planche = une scène sans en-tête, sur la
 *    géométrie de planche (`contributionsAlbumPlateGeometry`). Son coût est
 *    borné par la planche seule (≤ 4 contributions), jamais par l'Album.
 *
 * Tranches : trois (Desktop) ou quatre (Mobile) par planche ; reste ≥ 2 →
 * une planche de clôture ; reste 1 → les dernières se partagent en deux
 * clôtures (Desktop 2 + 2, Mobile 3 + 2).
 *
 * Ordre de lecture : celui de la source, contribution après contribution.
 * Le solveur garde l'ordre de l'appelant tant qu'une composition le permet
 * (`readingOrderKept`) ; dans tous les cas le DOM suit la source.
 *
 * Cache : une planche ne dépend que de (repère, thème, phase, types,
 * dimensions des photographies). Deux planches identiques — dix
 * condoléances, une collection de photographies au même format — sont
 * composées une fois. Le cache est borné (LRU) et déterministe : un résultat
 * mis en cache est octet pour octet celui d'un calcul neuf.
 *
 * Ajustement : chaque planche prend la hauteur de ses papiers, plus l'air
 * `plateMargin` dessus et dessous ; les planches s'empilent sans se toucher.
 */

export type ContributionsAlbumStatus = "PASS" | "CONTRIBUTIONS_ALBUM_EMPTY" | "CONTRIBUTIONS_ALBUM_NO_HARMONIOUS_PLATE";

export interface ContributionsAlbumGroup {
  index: number;
  /** Première contribution de la tranche (index dans la source). */
  start: number;
  size: number;
  phase: ContributionsAlbumPhase;
}

export interface ContributionsAlbumPlate extends ContributionsAlbumGroup {
  status: ContributionsSceneStatus;
  /** Placements dans le repère de la planche ajustée (y = 0 en haut de la planche). */
  placements: ContributionScenePlacement[];
  /** Haut de la planche dans l'Album (px source). */
  top: number;
  /** Hauteur de la planche ajustée (px source). */
  height: number;
  /** Les contributions se lisent, dans la planche, dans l'ordre de la source. */
  readingOrderKept: boolean;
  /** Planche reprise du cache (aucun calcul). */
  cached: boolean;
  stats: { pass: ContributionsPass; jointEvaluated: number } | null;
}

export interface ContributionsAlbumResult {
  frame: ContributionsAlbumFrame;
  theme: ContributionsTheme;
  total: number;
  status: ContributionsAlbumStatus;
  detail: string | null;
  plates: ContributionsAlbumPlate[];
  /** Largeur du repère et hauteur totale (px source). */
  width: number;
  height: number;
  /** Toutes les planches sont composées (composition progressive : faux tant qu'il en reste). */
  complete: boolean;
}

/**
 * Tailles des tranches, dans l'ordre (règle A13 transposée à des planches de
 * `G`) : planches pleines ; reste ≥ 2 → une clôture de cette taille ; reste 1
 * → les G + 1 dernières se partagent en deux clôtures (jamais une seule
 * contribution isolée sur sa planche quand il y en a plusieurs).
 */
export function contributionsAlbumSizes(count: number, G: number): number[] {
  if (!Number.isInteger(count) || count < 1) return [];
  if (count <= G) return [count];
  const full = Math.floor(count / G);
  const r = count % G;
  if (r === 0) return Array(full).fill(G);
  if (r === 1) return [...Array(full - 1).fill(G), Math.ceil((G + 1) / 2), Math.floor((G + 1) / 2)];
  return [...Array(full).fill(G), r];
}

/** Tranches contiguës et phase de chaque planche (A13 : Thue–Morse ; une clôture garde sa phase de rang). */
export function partitionContributionsAlbum(count: number, frame: ContributionsAlbumFrame): ContributionsAlbumGroup[] {
  let start = 0;
  return contributionsAlbumSizes(count, CONTRIBUTIONS_ALBUM_FRAMES[frame].groupSize).map((size, index) => {
    const g: ContributionsAlbumGroup = { index, start, size, phase: phaseOf(index) };
    start += size;
    return g;
  });
}

// ── Cache des planches ───────────────────────────────────────────────────

interface CachedPlate {
  status: ContributionsSceneStatus;
  detail: string | null;
  /** Placements avec des identifiants POSITIONNELS (`0` … `3`), avant ajustement. */
  placements: ContributionScenePlacement[];
  readingOrderKept: boolean;
  stats: ContributionsAlbumPlate["stats"];
}

export const CONTRIBUTIONS_ALBUM_CACHE_LIMIT = 256;
const plateCache = new Map<string, CachedPlate>();
const counters = { solved: 0, hits: 0 };

/** Statistiques du cache (rapport de performance, tests). */
export function contributionsAlbumCacheStats() {
  return { size: plateCache.size, solved: counters.solved, hits: counters.hits };
}

export function clearContributionsAlbumCache() {
  plateCache.clear();
  counters.solved = 0;
  counters.hits = 0;
}

/** Signature d'une tranche : tout ce dont dépend sa composition, rien d'autre. */
export function plateSignature(frame: ContributionsAlbumFrame, theme: ContributionsTheme, phase: ContributionsAlbumPhase, items: readonly ContributionSceneItem[]): string {
  const kinds = items.map((it) => (it.kind === "photo" ? `P${it.photo ? `${it.photo.width}x${it.photo.height}` : "?"}` : it.kind === "story" ? "R" : "C"));
  return `${frame}|${theme}|${phase}|${kinds.join(",")}`;
}

function solvePlate(frame: ContributionsAlbumFrame, theme: ContributionsTheme, phase: ContributionsAlbumPhase, items: readonly ContributionSceneItem[]): { plate: CachedPlate; cached: boolean } {
  const key = plateSignature(frame, theme, phase, items);
  const hit = plateCache.get(key);
  if (hit) {
    // LRU : la dernière planche lue passe en fin de file.
    plateCache.delete(key);
    plateCache.set(key, hit);
    counters.hits++;
    return { plate: hit, cached: true };
  }
  const geometry = contributionsAlbumPlateGeometry(frame, theme, phase);
  const positional = items.map((it, k) => ({ ...it, id: String(k) }));
  const scene = solveContributionsScene(positional, { frame, theme, geometry });
  const order = geometry.order;
  const reading = [...scene.placements].sort((a, b) => order.indexOf(a.anchorId) - order.indexOf(b.anchorId)).map((p) => Number(p.itemId));
  const plate: CachedPlate = {
    status: scene.status,
    detail: scene.detail,
    placements: scene.placements,
    readingOrderKept: reading.every((k, i) => k === i),
    stats: scene.stats ? { pass: scene.stats.pass, jointEvaluated: scene.stats.jointEvaluated } : null,
  };
  counters.solved++;
  plateCache.set(key, plate);
  while (plateCache.size > CONTRIBUTIONS_ALBUM_CACHE_LIMIT) plateCache.delete(plateCache.keys().next().value!);
  return { plate, cached: false };
}

const shift = (pts: readonly Point[], dy: number) => pts.map((p) => ({ x: p.x, y: p.y + dy }));
const round2 = (v: number) => Math.round(v * 2) / 2 + 0;

/**
 * Compositeur INCRÉMENTAL : une planche par pas, dans l'ordre. L'hôte compose
 * les premières planches à l'ouverture, puis les suivantes par tranches de
 * quelques millisecondes : un grand Album ne bloque jamais la page. Le
 * résultat final est, octet pour octet, celui de `solveContributionsAlbum`.
 */
export interface ContributionsAlbumComposer {
  /** Toutes les planches sont composées, ou un STOP est survenu. */
  readonly done: boolean;
  /** Compose la planche suivante. */
  step(): void;
  /** Compose des planches tant que le budget (ms) n'est pas épuisé (au moins une, au plus `maxPlates`). */
  run(budgetMs: number, now?: () => number, maxPlates?: number): void;
  /** État courant : planches déjà composées (`complete` = Album entier). */
  result(): ContributionsAlbumResult;
}

export function createContributionsAlbumComposer(
  items: readonly ContributionSceneItem[],
  options: { frame: ContributionsAlbumFrame; theme: ContributionsTheme },
): ContributionsAlbumComposer {
  const { frame, theme } = options;
  const spec = CONTRIBUTIONS_ALBUM_FRAMES[frame];
  const head = { frame, theme, total: items.length, width: spec.width };
  const groups = partitionContributionsAlbum(items.length, frame);
  const plates: ContributionsAlbumPlate[] = [];
  let next = 0;
  let top = 0;
  let stop: string | null = null;
  const done = () => stop !== null || next >= groups.length;
  const step = () => {
    if (done()) return;
    const group = groups[next++];
    const slice = items.slice(group.start, group.start + group.size);
    const { plate, cached } = solvePlate(frame, theme, group.phase, slice);
    if (plate.status !== "PASS") {
      stop = `planche ${group.index + 1} (contributions ${group.start + 1}–${group.start + group.size}) : ${plate.status}${plate.detail ? ` — ${plate.detail}` : ""}`;
      return;
    }
    // Ajustement : la planche commence `plateMargin` au-dessus du plus haut papier.
    const ys = plate.placements.flatMap((p) => p.outer.map((q) => q.y));
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const dy = round2(spec.plateMargin - minY);
    const height = Math.ceil(maxY - minY + 2 * spec.plateMargin);
    const placements = plate.placements.map((p): ContributionScenePlacement => {
      const k = Number(p.itemId);
      return {
        ...p,
        itemId: slice[k].id,
        center: { x: p.center.x, y: p.center.y + dy },
        outer: shift(p.outer, dy),
        protectedRegion: shift(p.protectedRegion, dy),
      };
    });
    plates.push({ ...group, status: plate.status, placements, top, height, readingOrderKept: plate.readingOrderKept, cached, stats: plate.stats });
    top += height;
  };
  return {
    get done() {
      return done();
    },
    step,
    run(budgetMs, now = () => performance.now(), maxPlates = Infinity) {
      const t0 = now();
      let n = 0;
      do {
        step();
        n++;
      } while (!done() && n < maxPlates && now() - t0 < budgetMs);
    },
    result(): ContributionsAlbumResult {
      if (!items.length) return { ...head, status: "CONTRIBUTIONS_ALBUM_EMPTY", detail: null, plates: [], height: 0, complete: true };
      // Un STOP ne laisse rien à l'écran : aucune planche partielle, rien d'inventé.
      if (stop !== null) return { ...head, status: "CONTRIBUTIONS_ALBUM_NO_HARMONIOUS_PLATE", detail: stop, plates: [], height: 0, complete: true };
      return { ...head, status: "PASS", detail: null, plates: plates.slice(), height: top, complete: next >= groups.length };
    },
  };
}

/**
 * Compose l'Album entier. Pur et déterministe : mêmes contributions, même
 * Album. Une planche sans composition harmonieuse arrête tout (STOP explicite,
 * rien n'est inventé) : l'hôte garde alors la scène principale à l'écran.
 */
export function solveContributionsAlbum(
  items: readonly ContributionSceneItem[],
  options: { frame: ContributionsAlbumFrame; theme: ContributionsTheme },
): ContributionsAlbumResult {
  const composer = createContributionsAlbumComposer(items, options);
  while (!composer.done) composer.step();
  return composer.result();
}

/** Empreinte octet par octet (déterminisme ; ni le drapeau de cache ni celui de complétude n'en font partie). */
export function contributionsAlbumSnapshot(r: ContributionsAlbumResult): string {
  return JSON.stringify({ ...r, complete: undefined, plates: r.plates.map((p) => ({ ...p, cached: undefined, stats: p.stats ? { pass: p.stats.pass } : null })) });
}
