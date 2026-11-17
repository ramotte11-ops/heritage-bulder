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
import { cardShape, polaroidShape, type ContributionShapeLayout, type ContributionTextFormat } from "@/lib/memorial/contributions/contribution-shapes";

/**
 * M4 — SCÈNE PRINCIPALE des Contributions des proches, résolue par le solveur
 * local A13 partagé (`GroupSession`), sans nouveau moteur.
 *
 * 1. Règle d'affichage PO (et elle seule) : 0 → état vide validé ; 1 à 3 →
 *    toutes visibles, pas d'accès à la collection ; dès 4 → « Voir tous les
 *    messages » ; au-delà de 4 → quatre dans la scène. L'ordre des
 *    contributions est celui de l'appelant : ce module n'en choisit aucune.
 * 2. Emplacements = ceux du Master du thème (R1 récit haut, R2 récit large,
 *    C1 condoléance, P1 Polaroid), géométrie propre à Light OU à Dark, jamais
 *    moyennée. Un récit prend le premier emplacement de récit libre ; une
 *    condoléance C1 ; une photographie P1. Un mélange que les Masters ne
 *    couvrent pas (deux condoléances, trois récits…) n'est PAS recomposé :
 *    `CONTRIBUTIONS_MIX_NOT_COVERED` (obstacle M0 O4, en attente PO).
 * 3. Cartes : papier fixe (aucune réduction), zone de texte inviolable
 *    (minima photo = 1), papier visible ≥ 0,90. Polaroid : A13, photo et
 *    légende inviolables. Zones interdites : en-tête, actions, pied, sceau,
 *    et tout ce qui sort de la bande des contributions — la scène ne change
 *    jamais de dimensions.
 * 4. Recherche, en deux passes déterministes du best-first A13 (position du
 *    Master d'abord, puis translations de 2 px, puis échelle du Polaroid) :
 *    passe A, les cartes restent EXACTEMENT à leur position de Master et seul
 *    le Polaroid s'ajuste ; passe B, seulement si A échoue, les cartes
 *    disposent aussi de leur territoire.
 *
 * Mobile : la géométrie Mobile des Masters est acceptée pour préparer
 * l'architecture, mais tout résultat Mobile est marqué `provisional` (O1 de
 * M0 ouvert : aucune intégration visuelle Mobile définitive).
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

export const CONTRIBUTIONS_SLOT_FORMAT: Record<ContributionsSlotId, ContributionTextFormat | "polaroid"> = {
  R1: "story-tall",
  R2: "story-wide",
  C1: "condolence",
  P1: "polaroid",
};

const KIND_SLOTS: Record<ContributionKind, readonly ContributionsSlotId[]> = {
  story: ["R1", "R2"],
  condolence: ["C1"],
  photo: ["P1"],
};

export type ContributionsSceneStatus =
  | "PASS"
  | "CONTRIBUTIONS_EMPTY"
  | "CONTRIBUTIONS_MIX_NOT_COVERED"
  | "CONTRIBUTIONS_INVALID_ITEM"
  | "CONTRIBUTIONS_STRUCTURAL_STOP"
  | "CONTRIBUTIONS_NO_LOCAL_SOLUTION";

export interface ContributionScenePlacement {
  slotId: ContributionsSlotId;
  itemId: string;
  kind: ContributionKind;
  format: ContributionTextFormat | "polaroid";
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
  /** Contributions visibles sans emplacement de Master (mélange non couvert). */
  unplaced: string[];
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

/** Emplacement du Master du thème, au format V2 du solveur A13. */
export function contributionsMasterSlot(
  frame: ContributionsFormat,
  theme: ContributionsTheme,
  slotId: ContributionsSlotId,
  mediaIndex: number,
  search: Readonly<ContributionsSceneSearch> = CONTRIBUTIONS_SCENE_SEARCH,
  cardsFixed = false,
): V2Slot {
  const item = CONTRIBUTIONS_MASTER_ITEMS[frame][theme][slotId];
  const isPolaroid = CONTRIBUTIONS_SLOT_FORMAT[slotId] === "polaroid";
  const t = cardsFixed && !isPolaroid ? 0 : search.territoryPx;
  const { width, height } = item.size;
  return {
    slotId: `contrib-${frame}-${theme}-${slotId}`,
    mediaIndex,
    role: CONTRIBUTIONS_SLOT_FORMAT[slotId],
    witness: { center: { ...item.center }, outerSize: { width, height }, outerArea: width * height, rotationDeg: item.rotationDeg },
    // `0 - t`, jamais `-t` : un territoire nul doit valoir +0 (sinon -0 dans les placements).
    territory: { xMin: 0 - t, xMax: t, yMin: 0 - t, yMax: t },
    scaleBounds: isPolaroid ? { preferred: [...search.polaroidScale.preferred], hard: [...search.polaroidScale.hard] } : { preferred: [1, 1], hard: [1, 1] },
    // Convention A13 (rangée haute → haut-centre) : le Polaroid garde le bord du ruban ; une carte ignore l'ancre (papier centré).
    anchor: "top-center",
    zIndex: item.zIndex,
  };
}

/** Affectation déterministe des contributions visibles aux emplacements du Master. */
export function assignContributionSlots(items: readonly ContributionSceneItem[]) {
  const taken = new Set<ContributionsSlotId>();
  const assigned: { item: ContributionSceneItem; slotId: ContributionsSlotId }[] = [];
  const unplaced: string[] = [];
  for (const item of items) {
    const slotId = KIND_SLOTS[item.kind]?.find((s) => !taken.has(s));
    if (!slotId) {
      unplaced.push(item.id);
      continue;
    }
    taken.add(slotId);
    assigned.push({ item, slotId });
  }
  // Ordre de peinture et d'évaluation : la profondeur du Master.
  assigned.sort((a, b) => CONTRIBUTIONS_MASTER_ITEMS.desktop.light[a.slotId].zIndex - CONTRIBUTIONS_MASTER_ITEMS.desktop.light[b.slotId].zIndex);
  return { assigned, unplaced };
}

/** Profil A13 de la scène : fabrique Carte / Polaroid, minima, zones interdites. */
export function contributionsSolverProfile(
  frame: ContributionsFormat,
  theme: ContributionsTheme,
  formats: readonly (ContributionTextFormat | "polaroid")[],
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

export function solveContributionsScene(
  items: readonly ContributionSceneItem[],
  options: { frame: ContributionsFormat; theme: ContributionsTheme; search?: Readonly<ContributionsSceneSearch> },
): ContributionsSceneResult {
  const { frame, theme } = options;
  const search = options.search ?? CONTRIBUTIONS_SCENE_SEARCH;
  const vis = contributionsSceneVisibility(items.length);
  const head = { ...vis, frame, theme, provisional: frame === "mobile", total: items.length };
  if (vis.state === "empty") return { ...head, status: "CONTRIBUTIONS_EMPTY", detail: null, placements: [], unplaced: [], stats: null };

  const visible = items.slice(0, vis.visibleCount);
  const invalid = visible.find((it) => !KIND_SLOTS[it.kind] || (it.kind === "photo" && !(it.photo && it.photo.width > 0 && it.photo.height > 0)));
  if (invalid) return { ...head, status: "CONTRIBUTIONS_INVALID_ITEM", detail: `contribution ${invalid.id} invalide`, placements: [], unplaced: [], stats: null };

  const { assigned, unplaced } = assignContributionSlots(visible);
  const formats = assigned.map((a) => CONTRIBUTIONS_SLOT_FORMAT[a.slotId]);
  const sources = assigned.map((a) => (a.item.kind === "photo" ? a.item.photo! : CARD_SOURCE));
  const profile = contributionsSolverProfile(frame, theme, formats, search);
  const run = (cardsFixed: boolean) => {
    const slots = assigned.map((a, i) => contributionsMasterSlot(frame, theme, a.slotId, i, search, cardsFixed));
    const session = new GroupSession<{ slots: readonly V2Slot[] }, ContributionShapeLayout>({ slots }, sources, false, { profile });
    return { slots, session, best: session.structuralStop ? null : session.candidate(0) };
  };
  const passA = run(true);
  const pass: "A" | "B" = passA.best ? "A" : "B";
  const { slots, session, best } = passA.best ? passA : run(false);

  let status: ContributionsSceneStatus = unplaced.length ? "CONTRIBUTIONS_MIX_NOT_COVERED" : "PASS";
  let detail: string | null = unplaced.length ? `sans emplacement de Master : ${unplaced.join(", ")}` : null;
  if (session.structuralStop) {
    status = "CONTRIBUTIONS_STRUCTURAL_STOP";
    detail = session.structuralStop;
  } else if (!best) {
    status = "CONTRIBUTIONS_NO_LOCAL_SOLUTION";
    const f: GroupFailure | undefined = session.bestFailure?.[0];
    detail = `aucune solution locale (${session.evaluated} candidats)${f ? ` — ${f.slotId} ${f.rule} ${f.value.toFixed(3)} < ${f.minimum.toFixed(3)}` : ""}`;
  }
  // Un STOP de résolution n'est jamais une solution : rien n'est placé. Un
  // mélange non couvert garde ses placements pour la QA, statut STOP compris.
  if (!best) return { ...head, status, detail, placements: [], unplaced, stats: null };

  const placements = best.placements.map((p, i): ContributionScenePlacement => {
    const v = slots[i];
    return {
      slotId: assigned[i].slotId,
      itemId: assigned[i].item.id,
      kind: assigned[i].item.kind,
      format: formats[i],
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
  const jointEvaluated = passA.session.evaluated + passA.session.repairEvaluated + (pass === "B" ? session.evaluated + session.repairEvaluated : 0);
  return { ...head, status, detail, placements, unplaced, stats: { pass, candidateRank: best.rank, jointEvaluated, repaired: session.repaired } };
}

/** Empreinte octet par octet (déterminisme). */
export function contributionsSceneSnapshot(r: ContributionsSceneResult): string {
  return JSON.stringify({ ...r, stats: r.stats ? { pass: r.stats.pass, candidateRank: r.stats.candidateRank } : null });
}
