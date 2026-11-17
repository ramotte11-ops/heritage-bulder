import type { V2Slot } from "@/config/gallery-a13-v2-manifests";
import {
  CONTRIBUTIONS_A13_REUSE_CONTRACT,
  CONTRIBUTIONS_CARD_BAND,
  CONTRIBUTIONS_MASTER_ITEMS,
  CONTRIBUTIONS_PROTECTED_ZONES,
  type Box,
  type ContributionsFormat,
  type ContributionsSlotId,
  type ContributionsTheme,
} from "@/config/contributions-master-measurements";
import { GroupSession, type AlbumSolverProfile, type GroupFailure } from "@/lib/memorial/album/album-group-solver";
import type { PhotoSource } from "@/lib/memorial/gallery/dynamic-polaroid-layout";
import type { Point } from "@/lib/memorial/gallery/dynamic-polaroid-qa";
import { cardLayout, cardPaperSize, cardShape, polaroidShape, type ContributionShapeLayout, type ContributionTextFormat } from "@/lib/memorial/contributions/contribution-shapes";

/**
 * M4.1 — SCÈNE PRINCIPALE des Contributions des proches, COMPOSITION
 * DYNAMIQUE résolue par le solveur local A13 partagé (`GroupSession`), sans
 * nouveau moteur ni nouveau Master.
 *
 * 1. Règle d'affichage PO (et elle seule) : 0 → état vide validé ; 1 à 3 →
 *    toutes visibles, pas d'accès à la collection ; dès 4 → « Voir tous les
 *    messages » ; au-delà de 4 → quatre dans la scène. Les quatre sont celles
 *    que l'appelant place en tête : ce module n'en choisit aucune.
 * 2. Décision PO O-A : les emplacements du Master (R1, C1, R2, P1) ne sont
 *    plus réservés à un type, ce sont des ANCRAGES (centre, inclinaison,
 *    profondeur), propres au Master Light OU Dark, jamais moyennés. Chaque
 *    contribution garde SA forme : condoléance au format unique bleu pétrole,
 *    récit en carte haute ou large (alternés dans l'ordre des récits, comme
 *    sur le Master : haut puis large), photographie en Polaroid A13.
 * 3. Ancrages employés : une suite de l'ordre de lecture du Master (Desktop
 *    de gauche à droite ; Mobile rangée haute puis rangée basse), contiguë
 *    d'abord, translatée d'un seul vecteur (barycentre de la suite sur celui
 *    des quatre ancrages, puis mi-chemin, puis position du Master). L'ordre de
 *    l'appelant est essayé d'abord ; puis les autres répartitions des types
 *    sur les ancrages. Les rangées sont écartées selon les formes réelles et
 *    chaque carte est installée verticalement hors des zones interdites.
 * 4. Contraintes (les mêmes qu'en M4) : papier d'une carte fixe, zone de
 *    texte (corps, signature, en-tête) visible à 100 % ; photo et légende du
 *    Polaroid visibles à 100 % ; papier visible ≥ 0,90 (contacts et légers
 *    chevauchements) ; aucune zone interdite (en-tête, actions, pied, sceau,
 *    extérieur de la bande) : la scène ne change jamais de dimensions.
 * 5. Recherche, deux passes déterministes du best-first A13 par suite
 *    d'ancrages : A, cartes fixes sur leur ancrage, Polaroids libres
 *    (translation, échelle) ; B, tout libre dans le territoire. Aucune suite
 *    harmonieuse → STOP explicite (`CONTRIBUTIONS_NO_HARMONIOUS_PLACEMENT`),
 *    jamais un rendu dégradé.
 *
 * Mobile : géométrie des Masters Mobile, résultat marqué `provisional` (O1
 * de M0 ouvert : lisibilité), sans empêcher les vérifications géométriques.
 */

export type ContributionKind = "condolence" | "story" | "photo";

export interface ContributionSceneItem {
  id: string;
  kind: ContributionKind;
  /** Dimensions intrinsèques de la photographie (kind "photo" seulement). */
  photo?: PhotoSource | null;
}

/** Nombre maximal de contributions dans la scène principale. */
export const CONTRIBUTIONS_SCENE_CAPACITY = 4;
/** Nombre de contributions à partir duquel « Voir tous les messages » apparaît. */
export const CONTRIBUTIONS_VIEW_ALL_FROM = 4;

export interface ContributionsSceneVisibility {
  state: "empty" | "contributions";
  visibleCount: number;
  viewAll: boolean;
}

/** La règle d'affichage de la PO, sans aucune autre règle. */
export function contributionsSceneVisibility(total: number): ContributionsSceneVisibility {
  const n = Number.isInteger(total) && total > 0 ? total : 0;
  if (n === 0) return { state: "empty", visibleCount: 0, viewAll: false };
  return { state: "contributions", visibleCount: Math.min(n, CONTRIBUTIONS_SCENE_CAPACITY), viewAll: n >= CONTRIBUTIONS_VIEW_ALL_FROM };
}

/**
 * Paramètres M4 de la recherche, à valider en M5 sur rendu : territoire de
 * translation autour du Master, et échelle du Polaroid (une carte n'en a pas).
 */
export interface ContributionsSceneSearch {
  territoryPx: number;
  polaroidScale: { preferred: [number, number]; hard: [number, number] };
  minVisiblePaper: number;
}

/**
 * Valeurs retenues en M4 par mesure (rapport M4) : ±48 px et Polaroid ≥ 0,85
 * résolvent les ratios 3:4, 4:3, 1:1, 9:16, 16:9 et 2,39:1 sur les quatre
 * Masters ; ±24 px et ≥ 0,94 échouent sur 9:16, 16:9 et 2,39:1. À valider
 * visuellement en M5 avant toute intégration.
 */
export const CONTRIBUTIONS_SCENE_SEARCH: Readonly<ContributionsSceneSearch> = {
  territoryPx: 48,
  polaroidScale: { preferred: [1, 1], hard: [0.85, 1] },
  minVisiblePaper: 0.9,
};

/** Ordre de lecture des ancrages du Master (identique Light / Dark). */
export const CONTRIBUTIONS_ANCHOR_ORDER: Record<ContributionsFormat, readonly ContributionsSlotId[]> = {
  desktop: ["R1", "C1", "R2", "P1"],
  mobile: ["R1", "R2", "C1", "P1"],
};

export type ContributionFormat = ContributionTextFormat | "polaroid";

/** Forme d'une contribution : le récit alterne haut / large dans l'ordre des récits. */
export function contributionFormat(kind: ContributionKind, storyIndex: number): ContributionFormat {
  if (kind === "condolence") return "condolence";
  if (kind === "photo") return "polaroid";
  return storyIndex % 2 === 0 ? "story-tall" : "story-wide";
}

export type ContributionsSceneStatus = "PASS" | "CONTRIBUTIONS_EMPTY" | "CONTRIBUTIONS_INVALID_ITEM" | "CONTRIBUTIONS_NO_HARMONIOUS_PLACEMENT";

export interface ContributionScenePlacement {
  /** Ancrage du Master employé (centre, inclinaison, profondeur). */
  anchorId: ContributionsSlotId;
  itemId: string;
  kind: ContributionKind;
  format: ContributionFormat;
  zIndex: number;
  /** Centre du papier (repère source du Master) après translation. */
  center: Point;
  rotationDeg: number;
  scale: number;
  translation: Point;
  outer: Point[];
  /** Texte (carte) ou photographie + légende (Polaroid) : jamais recouvert. */
  protectedRegion: Point[];
  layout: ContributionShapeLayout;
}

export interface ContributionsSceneResult extends ContributionsSceneVisibility {
  frame: ContributionsFormat;
  theme: ContributionsTheme;
  /** Mobile : architecture seulement, aucune intégration définitive (O1). */
  provisional: boolean;
  total: number;
  status: ContributionsSceneStatus;
  detail: string | null;
  placements: ContributionScenePlacement[];
  /** Ancrages retenus (ordre des contributions). */
  anchors: { ids: ContributionsSlotId[]; offset: Point } | null;
  /** Composition retenue (suite d'ancrages, translation, profondeur). */
  seed?: string;
  /** Suites essayées, dans l'ordre, et motif de chaque échec. */
  trials: { ids: ContributionsSlotId[]; offset: Point; outcome: string }[];
  stats: { pass: "A" | "B"; candidateRank: number; jointEvaluated: number; repaired: boolean } | null;
}

const BIG = 100_000;
const boxPoly = (b: Box): Point[] => [
  { x: b.x0, y: b.y0 },
  { x: b.x1, y: b.y0 },
  { x: b.x1, y: b.y1 },
  { x: b.x0, y: b.y1 },
];

/** Zones interdites (convexes) : zones protégées du Master + extérieur de la bande des contributions. */
export function contributionsForbiddenZones(frame: ContributionsFormat): Point[][] {
  const band = CONTRIBUTIONS_CARD_BAND[frame];
  const outside: Box[] = [
    { x0: -BIG, y0: -BIG, x1: BIG, y1: band.y0 },
    { x0: -BIG, y0: band.y1, x1: BIG, y1: BIG },
    { x0: -BIG, y0: band.y0, x1: band.x0, y1: band.y1 },
    { x0: band.x1, y0: band.y0, x1: BIG, y1: band.y1 },
  ];
  return [...CONTRIBUTIONS_PROTECTED_ZONES[frame], ...outside].map(boxPoly);
}

/** Polaroid témoin : le P1 du Master (sa surface est celle de toute photographie de la scène). */
const polaroidWitness = (frame: ContributionsFormat, theme: ContributionsTheme) => CONTRIBUTIONS_MASTER_ITEMS[frame][theme].P1.size;

/**
 * Une contribution posée sur un ancrage du Master, au format V2 du solveur
 * A13 : centre et profondeur donnés par la composition, inclinaison de
 * l'ancrage, taille témoin = celle de la FORME (carte : son papier fixe ;
 * Polaroid : le P1 du Master), jamais celle de l'ancrage.
 */
export function contributionAnchorSlot(
  frame: ContributionsFormat,
  theme: ContributionsTheme,
  anchorId: ContributionsSlotId,
  format: ContributionFormat,
  center: Point,
  zIndex: number,
  mediaIndex: number,
  search: Readonly<ContributionsSceneSearch> = CONTRIBUTIONS_SCENE_SEARCH,
  cardsFixed = false,
): V2Slot {
  const isPolaroid = format === "polaroid";
  const t = cardsFixed && !isPolaroid ? 0 : search.territoryPx;
  const { width, height } = isPolaroid ? polaroidWitness(frame, theme) : cardPaperSize(format, frame, theme);
  return {
    slotId: `contrib-${frame}-${theme}-${anchorId}`,
    mediaIndex,
    role: format,
    witness: { center: { x: center.x, y: center.y }, outerSize: { width, height }, outerArea: width * height, rotationDeg: contributionTilt(frame, theme, anchorId, format) },
    // `0 - t`, jamais `-t` : un territoire nul doit valoir +0 (sinon -0 dans les placements).
    territory: { xMin: 0 - t, xMax: t, yMin: 0 - t, yMax: t },
    scaleBounds: isPolaroid ? { preferred: [...search.polaroidScale.preferred], hard: [...search.polaroidScale.hard] } : { preferred: [1, 1], hard: [1, 1] },
    // Convention A13 (rangée haute → haut-centre) : le Polaroid garde le bord du ruban ; une carte ignore l'ancre (papier centré).
    anchor: "top-center",
    zIndex,
  };
}

/**
 * Inclinaison d'une contribution sur un ancrage : celle de l'ancrage, sauf
 * pour une CARTE posée sur l'ancrage du Polaroid (+7 à +11° sur les Masters,
 * une inclinaison de photographie) : elle prend celle de la condoléance du
 * Master, la moins inclinée des cartes. Une carte reste ainsi dans la famille
 * d'inclinaisons des cartes du Master.
 */
export function contributionTilt(frame: ContributionsFormat, theme: ContributionsTheme, anchorId: ContributionsSlotId, format: ContributionFormat): number {
  const anchors = CONTRIBUTIONS_MASTER_ITEMS[frame][theme];
  return format !== "polaroid" && anchorId === "P1" ? anchors.C1.rotationDeg : anchors[anchorId].rotationDeg;
}

const centroid = (pts: readonly Point[]) => ({ x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length });
const round2 = (v: number) => Math.round(v * 2) / 2 + 0;

/**
 * Suites de `n` ancrages dans l'ordre de lecture : d'abord les suites
 * CONTIGUËS (le groupement du Master), puis les autres ; dans chaque famille,
 * de la plus petite translation à la plus grande (la translation, arrondie au
 * demi-pixel, amène le barycentre de la suite sur celui des quatre ancrages
 * du Master), puis par ordre de lecture.
 */
export function contributionAnchorRuns(frame: ContributionsFormat, theme: ContributionsTheme, n: number) {
  const order = CONTRIBUTIONS_ANCHOR_ORDER[frame];
  const items = CONTRIBUTIONS_MASTER_ITEMS[frame][theme];
  const all = centroid(order.map((id) => items[id].center));
  const runs: { ids: ContributionsSlotId[]; offset: Point; contiguous: boolean; key: string }[] = [];
  const pick = (from: number, chosen: number[]) => {
    if (chosen.length === n) {
      const ids = chosen.map((k) => order[k]);
      const c = centroid(ids.map((id) => items[id].center));
      runs.push({ ids, offset: { x: round2(all.x - c.x), y: round2(all.y - c.y) }, contiguous: chosen[n - 1] - chosen[0] === n - 1, key: chosen.join("") });
      return;
    }
    for (let k = from; k < order.length; k++) pick(k + 1, [...chosen, k]);
  };
  pick(0, []);
  return runs
    .sort((a, b) => Number(b.contiguous) - Number(a.contiguous) || Math.hypot(a.offset.x, a.offset.y) - Math.hypot(b.offset.x, b.offset.y) || a.key.localeCompare(b.key))
    .map(({ ids, offset }) => ({ ids, offset }));
}

/** Profil A13 de la scène : fabrique Carte / Polaroid, minima, zones interdites. */
export function contributionsSolverProfile(
  frame: ContributionsFormat,
  theme: ContributionsTheme,
  formats: readonly ContributionFormat[],
  search: Readonly<ContributionsSceneSearch> = CONTRIBUTIONS_SCENE_SEARCH,
): AlbumSolverProfile<ContributionShapeLayout> {
  const contract = CONTRIBUTIONS_A13_REUSE_CONTRACT.solverProfile[frame];
  return {
    id: `contributions-${frame}-${theme}`,
    safeX: [contract.safeX[0], contract.safeX[1]],
    firstGroupMinY: -BIG,
    firstGroupZone: null,
    hitTargetPx: contract.hitTargetSourcePx,
    minima: (slots) => slots.map(() => ({ photo: 1, outer: search.minVisiblePaper })),
    shapeFor: (v, source, s, i) => {
      const f = formats[i];
      return f === "polaroid" ? polaroidShape(v, source, s) : cardShape(v, f, frame, theme);
    },
    forbiddenZones: contributionsForbiddenZones(frame),
  };
}

const CARD_SOURCE: PhotoSource = { width: 1, height: 1 };
const KINDS: ReadonlySet<string> = new Set<ContributionKind>(["condolence", "story", "photo"]);

/** Rangées du Master (ordre de lecture). */
const MASTER_ROWS: Record<ContributionsFormat, readonly (readonly ContributionsSlotId[])[]> = {
  desktop: [["R1", "C1", "R2", "P1"]],
  mobile: [
    ["R1", "R2"],
    ["C1", "P1"],
  ],
};

/** Budget de recherche par essai (le solveur A13 garde ses budgets par défaut). */
export const CONTRIBUTIONS_SEARCH_BUDGET = { maxJoint: 4000, repairBudget: 4000 } as const;

/** Une composition candidate : ancrages, centres, profondeurs, formes. */
export interface ContributionsSeed {
  /** perm[k] = index (dans l'ordre de l'appelant) de la contribution posée sur ids[k]. */
  perm: number[];
  ids: ContributionsSlotId[];
  centers: Point[];
  z: number[];
  formats: ContributionFormat[];
  label: string;
}

const rad = (d: number) => (d * Math.PI) / 180;

/** Largeur horizontale du papier incliné (boîte englobante). */
function tiltedWidth(frame: ContributionsFormat, theme: ContributionsTheme, f: ContributionFormat, rotationDeg: number) {
  const { width: w, height: h } = f === "polaroid" ? polaroidWitness(frame, theme) : cardPaperSize(f, frame, theme);
  const a = rad(rotationDeg);
  return w * Math.abs(Math.cos(a)) + h * Math.abs(Math.sin(a));
}

/**
 * Ce qu'un papier voisin peut couvrir sur un côté (px) : la marge hors zone
 * protégée (texte d'une carte, légende d'un Polaroid), bornée par la part de
 * papier qui peut être couverte (1 − papier visible minimal).
 */
function coverAllowance(
  frame: ContributionsFormat,
  theme: ContributionsTheme,
  f: ContributionFormat,
  side: "left" | "right" | "top" | "bottom",
  paperSlack: number,
): number {
  if (f === "polaroid") {
    const { width, height } = polaroidWitness(frame, theme);
    // Photo : légère couverture permise ; légende (bas) : jamais.
    if (side === "bottom") return 0;
    return paperSlack * (side === "top" ? height : width);
  }
  const size = cardPaperSize(f, frame, theme);
  const hull = cardLayout(f, size).protectedText;
  const text = { left: hull.x, right: size.width - (hull.x + hull.width), top: hull.y, bottom: size.height - (hull.y + hull.height) }[side];
  return Math.min(text, paperSlack * (side === "left" || side === "right" ? size.width : size.height));
}

/** Hauteur verticale du papier incliné (boîte englobante). */
function tiltedHeight(frame: ContributionsFormat, theme: ContributionsTheme, f: ContributionFormat, rotationDeg: number) {
  const { width: w, height: h } = f === "polaroid" ? polaroidWitness(frame, theme) : cardPaperSize(f, frame, theme);
  const a = rad(rotationDeg);
  return h * Math.abs(Math.cos(a)) + w * Math.abs(Math.sin(a));
}

/**
 * Espace, rangée par rangée, les ancrages selon les formes RÉELLES. Pour deux
 * papiers voisins, l'écart minimal laisse le dessus mordre au plus 80 % de
 * la marge libre (hors texte) de celui qui est dessous, et jamais au-delà de
 * cette marge. Les écarts du Master sont gardés quand ils suffisent. Si la
 * rangée sort de la bande, l'excédent est repris d'abord sur les écarts du
 * Master plus larges que nécessaire, puis sur les 20 % de marge restants ;
 * le barycentre de la rangée est conservé autant que la bande le permet.
 */
function spreadRows(frame: ContributionsFormat, theme: ContributionsTheme, seed: ContributionsSeed, paperSlack: number): Point[] {
  const centers = seed.centers.map((c) => ({ ...c }));
  const band = CONTRIBUTIONS_CARD_BAND[frame];
  const [b0, b1] = [band.x0 + 2, band.x1 - 2];
  for (const row of MASTER_ROWS[frame]) {
    const idx = seed.ids.map((id, i) => (row.includes(id) ? i : -1)).filter((i) => i >= 0).sort((a, b) => centers[a].x - centers[b].x);
    if (!idx.length) continue;
    const w = idx.map((i) => tiltedWidth(frame, theme, seed.formats[i], contributionTilt(frame, theme, seed.ids[i], seed.formats[i])));
    const gaps: { d: number; need: number; hard: number }[] = [];
    for (let k = 1; k < idx.length; k++) {
      const [a, b] = [idx[k - 1], idx[k]];
      const lower = seed.z[a] < seed.z[b] ? { i: a, side: "right" as const } : { i: b, side: "left" as const };
      const margin = coverAllowance(frame, theme, seed.formats[lower.i], lower.side, paperSlack);
      const half = (w[k - 1] + w[k]) / 2;
      const need = half - 0.8 * margin;
      gaps.push({ d: Math.max(centers[b].x - centers[a].x, need), need, hard: half - margin });
    }
    const span = () => w[0] / 2 + gaps.reduce((s, g) => s + g.d, 0) + w[w.length - 1] / 2;
    // Reprise de l'excédent : écarts du Master d'abord, puis marge de réserve.
    for (const floor of ["need", "hard"] as const) {
      const excess = span() - (b1 - b0);
      if (excess <= 0) break;
      const slack = gaps.map((g) => Math.max(0, g.d - g[floor]));
      const total = slack.reduce((s, v) => s + v, 0);
      if (total <= 0) continue;
      const k = Math.min(1, excess / total);
      gaps.forEach((g, j) => (g.d -= slack[j] * k));
    }
    const xs = [0];
    gaps.forEach((g) => xs.push(xs[xs.length - 1] + g.d));
    const target = idx.reduce((s, i) => s + centers[i].x, 0) / idx.length - xs.reduce((s, x) => s + x, 0) / xs.length;
    const lo = b0 + w[0] / 2;
    const hi = b1 - w[w.length - 1] / 2 - xs[xs.length - 1];
    const start = lo <= hi ? Math.min(hi, Math.max(lo, target)) : lo;
    idx.forEach((i, k) => (centers[i].x = round2(start + xs[k])));
  }
  return spreadRowsVertically(frame, theme, seed, centers, paperSlack);
}

/**
 * Rangées superposées (Mobile) : même règle à la verticale. Deux rangées
 * s'écartent symétriquement si le dessus mordait au-delà de 80 % de ce que
 * le dessous peut céder (marge hors texte ou hors légende, part de papier),
 * dans la limite de la bande. Sans effet quand une seule rangée est occupée.
 */
function spreadRowsVertically(frame: ContributionsFormat, theme: ContributionsTheme, seed: ContributionsSeed, centers: Point[], paperSlack: number): Point[] {
  const rows = MASTER_ROWS[frame].map((row) => seed.ids.map((id, i) => (row.includes(id) ? i : -1)).filter((i) => i >= 0)).filter((r) => r.length);
  if (rows.length < 2) return centers;
  const band = CONTRIBUTIONS_CARD_BAND[frame];
  const out = centers.map((c) => ({ ...c }));
  for (let r = 1; r < rows.length; r++) {
    const [top, bottom] = [rows[r - 1], rows[r]];
    const h = (i: number) => tiltedHeight(frame, theme, seed.formats[i], contributionTilt(frame, theme, seed.ids[i], seed.formats[i]));
    let need = 0;
    for (const a of top)
      for (const b of bottom) {
        const allow = seed.z[a] < seed.z[b] ? coverAllowance(frame, theme, seed.formats[a], "bottom", paperSlack) : coverAllowance(frame, theme, seed.formats[b], "top", paperSlack);
        need = Math.max(need, (h(a) + h(b)) / 2 - 0.8 * allow);
      }
    const yTop = top.reduce((s, i) => s + out[i].y, 0) / top.length;
    const yBot = bottom.reduce((s, i) => s + out[i].y, 0) / bottom.length;
    if (yBot - yTop >= need) continue;
    const grow = (need - (yBot - yTop)) / 2;
    const upMax = Math.max(0, Math.min(...top.map((i) => out[i].y - h(i) / 2 - (band.y0 + 2))));
    const downMax = Math.max(0, Math.min(...bottom.map((i) => band.y1 - 2 - (out[i].y + h(i) / 2))));
    let up = Math.min(grow, upMax);
    let down = Math.min(grow, downMax);
    up += Math.min(upMax - up, grow - down);
    down += Math.min(downMax - down, grow - up);
    top.forEach((i) => (out[i].y = round2(out[i].y - up)));
    bottom.forEach((i) => (out[i].y = round2(out[i].y + down)));
  }
  return out;
}

/**
 * Compositions candidates, dans un ordre fixe : suites d'ancrages (plus petite
 * translation d'abord) × translation (centrée, à mi-chemin, position du
 * Master) × profondeur (celle du Master, puis « déposées l'une après
 * l'autre » dans l'ordre de lecture). Le récit préfère l'alternance haut /
 * large ; un récit haut qui ne tient pas sur son ancrage devient large. Les
 * rangées trop serrées sont écartées, puis chaque carte est installée seule à
 * la position valide la plus proche de son ancrage (zones interdites, bande).
 */
export function contributionsSeeds(
  frame: ContributionsFormat,
  theme: ContributionsTheme,
  kinds: readonly ContributionKind[],
  /** Translation qui installe cette forme seule à sa position valide la plus proche, ou null. */
  settle: (anchorId: ContributionsSlotId, format: ContributionFormat, center: Point) => Point | null,
  search: Readonly<ContributionsSceneSearch> = CONTRIBUTIONS_SCENE_SEARCH,
): ContributionsSeed[] {
  const fits = (id: ContributionsSlotId, f: ContributionFormat, c: Point) => settle(id, f, c) !== null;
  const anchors = CONTRIBUTIONS_MASTER_ITEMS[frame][theme];
  const order = CONTRIBUTIONS_ANCHOR_ORDER[frame];
  const paperSlack = 1 - search.minVisiblePaper;
  const seeds: ContributionsSeed[] = [];
  const seen = new Set<string>();
  // L'ordre de l'appelant d'abord ; puis les autres répartitions des types
  // sur les ancrages (une par suite de types distincte, ordre lexicographique).
  const perms = permutations(kinds.length).filter((p, i, all) => {
    const sig = p.map((j) => kinds[j]).join();
    return all.findIndex((q) => q.map((j) => kinds[j]).join() === sig) === i;
  });
  for (const perm of perms) {
    const ks = perm.map((j) => kinds[j]);
    for (const run of contributionAnchorRuns(frame, theme, ks.length)) {
      for (const k of [1, 0.5, 0]) {
        const offset = { x: round2(run.offset.x * k), y: round2(run.offset.y * k) };
        const base = run.ids.map((id) => ({ x: anchors[id].center.x + offset.x, y: anchors[id].center.y + offset.y }));
        let stories = 0;
        const formats = ks.map((kind, i): ContributionFormat => {
          const preferred = contributionFormat(kind, kind === "story" ? stories++ : 0);
          if (kind !== "story" || fits(run.ids[i], preferred, base[i])) return preferred;
          const other: ContributionFormat = preferred === "story-tall" ? "story-wide" : "story-tall";
          return fits(run.ids[i], other, base[i]) ? other : preferred;
        });
        for (const zMode of ["master", "reading", "reverse"] as const) {
          const z = run.ids.map((id) => (zMode === "master" ? anchors[id].zIndex : zMode === "reading" ? 10 * (order.indexOf(id) + 1) : 10 * (order.length - order.indexOf(id))));
          const seed: ContributionsSeed = { perm, ids: run.ids, centers: base, z, formats, label: `${run.ids.join("+")} ×${k} z:${zMode}${perm.some((j, i) => j !== i) ? ` ordre:${perm.join("")}` : ""}` };
          // Écarter les rangées, puis installer chaque CARTE seule, verticalement,
          // à sa position valide la plus proche (le Polaroid reste libre en passe A).
          seed.centers = spreadRows(frame, theme, seed, paperSlack).map((c, i) => {
            if (seed.formats[i] === "polaroid") return c;
            const d = settle(seed.ids[i], seed.formats[i], c);
            return d ? { x: c.x + d.x, y: c.y + d.y } : c;
          });
          const key = JSON.stringify([seed.perm, seed.ids, seed.centers, seed.z, seed.formats]);
          if (seen.has(key)) continue;
          seen.add(key);
          seeds.push(seed);
        }
      }
    }
  }
  return seeds;
}

/** Permutations de 0…n−1, l'identité d'abord puis l'ordre lexicographique. */
function permutations(n: number): number[][] {
  const out: number[][] = [];
  const go = (prefix: number[], rest: number[]) => {
    if (!rest.length) out.push(prefix);
    rest.forEach((v, i) => go([...prefix, v], [...rest.slice(0, i), ...rest.slice(i + 1)]));
  };
  go([], Array.from({ length: n }, (_, i) => i));
  return out;
}

export function solveContributionsScene(
  items: readonly ContributionSceneItem[],
  options: { frame: ContributionsFormat; theme: ContributionsTheme; search?: Readonly<ContributionsSceneSearch> },
): ContributionsSceneResult {
  const { frame, theme } = options;
  const search = options.search ?? CONTRIBUTIONS_SCENE_SEARCH;
  const vis = contributionsSceneVisibility(items.length);
  const head = { ...vis, frame, theme, provisional: frame === "mobile", total: items.length };
  const none = { placements: [], anchors: null, stats: null };
  if (vis.state === "empty") return { ...head, ...none, status: "CONTRIBUTIONS_EMPTY", detail: null, trials: [] };

  const visible = items.slice(0, vis.visibleCount);
  const invalid = visible.find((it) => !KINDS.has(it.kind) || (it.kind === "photo" && !(it.photo && it.photo.width > 0 && it.photo.height > 0)));
  if (invalid) return { ...head, ...none, status: "CONTRIBUTIONS_INVALID_ITEM", detail: `contribution ${invalid.id} invalide`, trials: [] };

  const sources = visible.map((it) => (it.kind === "photo" ? it.photo! : CARD_SOURCE));
  const budget = { ...CONTRIBUTIONS_SEARCH_BUDGET };
  // Une forme seule : la plus petite translation valide autour de ce centre (zones interdites, bande), ou null.
  const settleCache = new Map<string, Point | null>();
  const settle = (anchorId: ContributionsSlotId, format: ContributionFormat, center: Point) => {
    const key = `${anchorId}|${format}|${center.x}|${center.y}`;
    if (!settleCache.has(key)) {
      // Installation VERTICALE seulement : l'espacement horizontal appartient à `spreadRows`.
      const slot = { ...contributionAnchorSlot(frame, theme, anchorId, format, center, 0, 0, search), territory: { xMin: 0, xMax: 0, yMin: 0 - search.territoryPx, yMax: search.territoryPx } };
      const one = new GroupSession<{ slots: readonly V2Slot[] }, ContributionShapeLayout>({ slots: [slot] }, [CARD_SOURCE], false, {
        profile: { ...contributionsSolverProfile(frame, theme, [format], search), ...budget },
      });
      const c = one.structuralStop ? null : one.candidate(0);
      settleCache.set(key, c ? { ...c.placements[0].d } : null);
    }
    return settleCache.get(key)!;
  };
  const seeds = contributionsSeeds(
    frame,
    theme,
    visible.map((it) => it.kind),
    settle,
    search,
  );
  const trials: ContributionsSceneResult["trials"] = [];
  let evaluated = 0;
  const attempt = (seed: ContributionsSeed, cardsFixed: boolean) => {
    const slots = seed.ids.map((id, i) => contributionAnchorSlot(frame, theme, id, seed.formats[i], seed.centers[i], seed.z[i], i, search, cardsFixed));
    const profile = { ...contributionsSolverProfile(frame, theme, seed.formats, search), ...budget };
    const session = new GroupSession<{ slots: readonly V2Slot[] }, ContributionShapeLayout>({ slots }, seed.perm.map((j) => sources[j]), false, { profile });
    const best = session.structuralStop ? null : session.candidate(0);
    evaluated += session.evaluated + session.repairEvaluated;
    const f: GroupFailure | undefined = session.bestFailure?.[0];
    const outcome = best ? "PASS" : (session.structuralStop ?? `aucune solution locale${f ? ` — ${f.slotId} ${f.rule} ${f.value.toFixed(3)} < ${f.minimum.toFixed(3)}` : ""}`);
    trials.push({ ids: seed.ids, offset: { x: 0, y: 0 }, outcome: `${cardsFixed ? "A" : "B"} ${seed.label} : ${outcome}` });
    return { slots, session, best };
  };

  // Passe A sur toutes les compositions (cartes fixes, peu coûteuse), puis B
  // (tout libre, coûteuse) sur celles qui gardent l'ordre de l'appelant.
  const identity = (s: ContributionsSeed) => s.perm.every((j, i) => j === i);
  for (const pass of ["A", "B"] as const) {
    for (const seed of pass === "A" ? seeds : seeds.filter(identity)) {
      const { slots, session, best } = attempt(seed, pass === "A");
      if (!best) continue;
      const placements = best.placements.map((p, i): ContributionScenePlacement => {
        const v = slots[i];
        return {
          anchorId: seed.ids[i],
          itemId: visible[seed.perm[i]].id,
          kind: visible[seed.perm[i]].kind,
          format: seed.formats[i],
          zIndex: v.zIndex,
          center: { x: v.witness.center.x + p.d.x, y: v.witness.center.y + p.d.y },
          rotationDeg: v.witness.rotationDeg,
          scale: p.shape.s,
          translation: p.d,
          outer: p.outer,
          protectedRegion: p.photo,
          layout: p.shape.layout,
        };
      });
      return {
        ...head,
        status: "PASS",
        detail: null,
        placements,
        anchors: { ids: seed.ids, offset: { x: 0, y: 0 } },
        seed: seed.label,
        trials,
        stats: { pass, candidateRank: best.rank, jointEvaluated: evaluated, repaired: session.repaired },
      };
    }
  }
  // Aucune composition ne respecte les contraintes : STOP, rien n'est placé.
  return { ...head, ...none, status: "CONTRIBUTIONS_NO_HARMONIOUS_PLACEMENT", detail: `${seeds.length} compositions essayées, aucune harmonieuse`, trials };
}

/** Empreinte octet par octet (déterminisme). */
export function contributionsSceneSnapshot(r: ContributionsSceneResult): string {
  return JSON.stringify({ ...r, stats: r.stats ? { pass: r.stats.pass, candidateRank: r.stats.candidateRank } : null });
}
