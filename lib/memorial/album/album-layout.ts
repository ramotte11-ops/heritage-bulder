import type { A13Slot } from "@/config/gallery-a13-pilot-manifest";
import { A13_ALBUM_GRAMMARS, type AlbumGrammarId, type AlbumRole, type AlbumStop } from "@/config/album-a13-grammars";
import { A13_ALBUM_V1_1, A13_ALBUM_V1_1_READINGS as READ, type AlbumSeamStateId } from "@/config/album-a13-runtime-calibration-v1-1";
import { A13_ALBUM_V1_2 } from "@/config/album-a13-long-sequence-v1-2";
import type { PhotoSource, PolaroidLayout } from "@/lib/memorial/gallery/dynamic-polaroid-layout";
import { layoutCaption, type CaptionLayout, type CaptionMeasurer } from "@/lib/memorial/gallery/caption-layout";
import { convexIntersectionArea, slotRectToCanvas, type Point } from "@/lib/memorial/gallery/dynamic-polaroid-qa";
import { largestVisibleSquare } from "@/lib/memorial/gallery/gallery-v2";
import { unionCoverArea } from "@/lib/memorial/gallery/manifest-calibration";
import { partitionAlbum, popcount } from "@/lib/memorial/album/album-partition";
import { add, GroupSession, visibleFraction, type GroupCandidate } from "@/lib/memorial/album/album-group-solver";

/**
 * A13 Album — EXTENSIBLE MEMORY TABLE: streaming layout of local groups.
 * Pilot V1 architecture (GREEN) + RUNTIME CALIBRATION HANDOFF V1.1 patch +
 * LONG SEQUENCE CALIBRATION V1.2 (full-group seams only).
 * Pure and theme-free: there is no theme input anywhere below.
 *
 * - partition → groups of 2…5 in strict media order (V1, unchanged);
 * - each group is solved LOCALLY by `GroupSession` (V1 solver, V1.1
 *   territory / scale / safe X); the answer is the rank-0 local solution:
 *   no photo is ever moved independently for a seam (V1.1 §4.4-6);
 * - V1.1 §4 RELATIONAL SEAM: the whole solved group is translated by
 *   (dx, dy). Silhouettes on the outer paper polygons, 12 equal lanes over
 *   x = 80…1590: `lowerPrev[k]` (previous group) and `upperNext[k]`
 *   (incoming group at dx), null lanes ignored, `gap[k] = upperNext[k] +
 *   dy − lowerPrev[k]`. For a state (dx, target, minContact), dy puts the
 *   deepest lane overlap exactly at the target. States COMPACT_LEFT /
 *   BALANCED / COMPACT_RIGHT / AIRY_OFFSET, tried from
 *   `seed = (popcount(i) + 2·popcount(i−1)) mod 4` (V1.2) in
 *   the order seed, +1, +3, +2; the first valid one wins, else
 *   ALBUM_RELATIONAL_SEAM_STOP. V1.2: the translated group's paper stays in
 *   12…1658 and each gesture is bounded by its side's slack
 *   (`sign · min(|nominal|, floor(slack))`, invalid under ½ nominal);
 * - V1.1 §6 RELATIONAL CLOSURES: C2 / C3 / C4 terminate the previous
 *   silhouette with their own dx candidates (rule side, 0, opposite side),
 *   same validity, else ALBUM_CLOSURE_SEAM_STOP;
 * - V1.1 §5 DEPTH: global paint key (depositEpoch = groupIndex,
 *   localZRank = V1 Master depth, mediaIndex). An incoming group is always
 *   painted above the table already there; no clipping, no isolation;
 * - captions last, against the tirages painted above them;
 * - V1.1 §7 page end: lowest paper + shadow reserve 12 + breathing 120.
 */

const V = A13_ALBUM_V1_1;
/** V1.2 — FULL-group seams only: seed, envelope 12…1658, bounded dx. */
const V2 = A13_ALBUM_V1_2;

export interface AlbumMedia extends PhotoSource {
  mediaId: string;
  caption: string | null;
}

export interface AlbumPrint {
  mediaId: string;
  /** Global family index (DOM and keyboard order). */
  mediaIndex: number;
  groupIndex: number;
  localIndex: number;
  grammar: AlbumGrammarId;
  role: AlbumRole;
  masterPrint: string;
  /** V1.1 §5: (depositEpoch, localZRank, mediaIndex). */
  paintKey: [number, number, number];
  /** Engine slot in PAGE coordinates (1670 frame); zIndex = paint order. */
  slot: A13Slot;
  layout: PolaroidLayout;
  caption: CaptionLayout | null;
  scale: number;
  translation: Point;
  outer: Point[];
  photo: Point[];
  minima: { photo: number; outer: number };
}

export interface AlbumSeamTrial {
  state: AlbumSeamStateId | "CLOSURE";
  dx: number;
  targetOverlap: number;
  minContactLanes: number;
  /** null = valid; otherwise the first failed V1.1 §4.4 rule. */
  failure: string | null;
}

export interface AlbumSeam {
  kind: "relational" | "closure";
  transitionCode: number | null;
  seed: number | null;
  state: AlbumSeamStateId | "CLOSURE";
  dx: number;
  dy: number;
  targetOverlap: number;
  /** Deepest lane overlap (= target when solved). */
  overlap: number;
  contactLanes: number;
  lowerPrev: (number | null)[];
  upperNext: (number | null)[];
  /** gap[k] (null when a silhouette is absent in lane k). */
  gaps: (number | null)[];
  maxCentralPairGap: number | null;
  trials: AlbumSeamTrial[];
}

export interface AlbumGroupResult {
  index: number;
  grammar: AlbumGrammarId;
  phase: "A" | "B" | null;
  size: number;
  start: number;
  status: "PASS" | AlbumStop;
  detail: string | null;
  visualTop: number;
  visualBottom: number;
  /** Relational seam with the previous group (null for the first group). */
  seam: AlbumSeam | null;
  stats: {
    candidateRank: number;
    jointEvaluated: number;
    /** Found by the V2 local repair after the joint budget. */
    repaired: boolean;
    seamTrials: number;
    cacheHit: boolean;
    ms: number;
  };
}

export interface AlbumLayout {
  count: number;
  groups: AlbumGroupResult[];
  prints: AlbumPrint[];
  height: number;
  status: "PASS" | AlbumStop | "ALBUM_ABSENT";
}

const CACHE_LIMIT = 256;
const sessionCache = new Map<string, GroupSession>();

function sessionFor(grammar: AlbumGrammarId, sources: PhotoSource[], first: boolean) {
  const key = `${grammar}|${first ? 1 : 0}|${sources.map((s) => `${s.width}x${s.height}`).join(";")}`;
  const hit = sessionCache.get(key);
  if (hit) return { session: hit, cacheHit: true };
  const session = new GroupSession(A13_ALBUM_GRAMMARS[grammar], sources, first);
  if (sessionCache.size >= CACHE_LIMIT) sessionCache.delete(sessionCache.keys().next().value!);
  sessionCache.set(key, session);
  return { session, cacheHit: false };
}

/** Test/QA only: forget the per-signature cache. */
export function clearAlbumSolveCache() {
  sessionCache.clear();
}

/** V1.1 §5 — numeric paint order for the key (epoch, localZRank, mediaIndex):
 * local z-ranks are < 1000 and distinct inside a group. */
export const paintZ = (depositEpoch: number, localZRank: number) => depositEpoch * 1000 + localZRank;

// ── Silhouettes (V1.1 §4.1) ────────────────────────────────────────────

const [LANE_X0, LANE_X1] = V.silhouette.xRange;
const LANES = V.silhouette.laneCount;
const LANE_W = (LANE_X1 - LANE_X0) / LANES;
export const laneBounds = (k: number): [number, number] => [LANE_X0 + k * LANE_W, LANE_X0 + (k + 1) * LANE_W];

/** Convex polygon clipped to the vertical strip x0 ≤ x ≤ x1. */
function clipStrip(poly: Point[], x0: number, x1: number): Point[] {
  const clip = (pts: Point[], inside: (p: Point) => boolean, xc: number) => {
    const out: Point[] = [];
    for (let i = 0; i < pts.length; i++) {
      const cur = pts[i];
      const prev = pts[(i + pts.length - 1) % pts.length];
      if (inside(cur) !== inside(prev)) {
        const t = (xc - prev.x) / (cur.x - prev.x);
        out.push({ x: xc, y: prev.y + t * (cur.y - prev.y) });
      }
      if (inside(cur)) out.push(cur);
    }
    return out;
  };
  return clip(clip(poly, (p) => p.x >= x0, x0), (p) => p.x <= x1, x1);
}

/** Per lane: highest top and lowest bottom of the paper polygons (null = no paper). */
export function laneSilhouette(polys: Point[][], dx = 0) {
  const top: (number | null)[] = [];
  const bottom: (number | null)[] = [];
  for (let k = 0; k < LANES; k++) {
    const [x0, x1] = laneBounds(k);
    let t: number | null = null;
    let b: number | null = null;
    for (const p of polys) {
      const c = clipStrip(dx ? add(p, { x: dx, y: 0 }) : p, x0, x1);
      if (c.length < 3) continue;
      for (const q of c) {
        if (t === null || q.y < t) t = q.y;
        if (b === null || q.y > b) b = q.y;
      }
    }
    top.push(t);
    bottom.push(b);
  }
  return { top, bottom };
}

// ── Seam candidate validity (V1.1 §4.4) ────────────────────────────────

interface PlacedPrint {
  id: string;
  z: number;
  outer: Point[];
  photo: Point[];
}

interface Candidate {
  /** V1.2: failure decided before evaluation (bounded dx below ½ nominal). */
  pre?: string;
  state: AlbumSeamStateId | "CLOSURE";
  dx: number;
  targetOverlap: number;
  minContactLanes: number;
}

interface Evaluated {
  ok: boolean;
  failure: string | null;
  dy: number;
  gaps: (number | null)[];
  overlap: number;
  contact: number;
  maxCentralPairGap: number | null;
  upperNext: (number | null)[];
}

function bbox(p: Point[]) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const q of p) {
    if (q.x < x0) x0 = q.x;
    if (q.y < y0) y0 = q.y;
    if (q.x > x1) x1 = q.x;
    if (q.y > y1) y1 = q.y;
  }
  return { x0, y0, x1, y1 };
}

function evaluateCandidate(
  c: Candidate,
  incoming: PlacedPrint[],
  lowerPrev: (number | null)[],
  table: PlacedPrint[],
  env: readonly [number, number],
): Evaluated {
  const { top: upperNext } = laneSilhouette(
    incoming.map((p) => p.outer),
    c.dx,
  );
  const lanes = lowerPrev.map((l, k) => (l !== null && upperNext[k] !== null ? k : -1)).filter((k) => k >= 0);
  const fail = (failure: string, dy = 0, gaps: (number | null)[] = lowerPrev.map(() => null), overlap = NaN, contact = 0, maxCentralPairGap: number | null = null): Evaluated => ({ ok: false, failure, dy, gaps, overlap, contact, maxCentralPairGap, upperNext });
  if (!lanes.length) return fail("aucune lane commune");
  // dy: deepest lane overlap exactly at the target.
  const dy = Math.max(...lanes.map((k) => lowerPrev[k]! - upperNext[k]!)) - c.targetOverlap;
  const gaps = lowerPrev.map((l, k) => (l !== null && upperNext[k] !== null ? upperNext[k]! + dy - l : null));
  const overlap = Math.max(...lanes.map((k) => -gaps[k]!));
  const contact = lanes.filter((k) => gaps[k]! <= 0).length;
  let maxCentralPairGap: number | null = null;
  for (let i = 0; i + 1 < READ.centralLanes.length; i++) {
    const a = gaps[READ.centralLanes[i]];
    const b = gaps[READ.centralLanes[i + 1]];
    if (a === null || b === null) continue;
    const pair = Math.min(a, b);
    maxCentralPairGap = maxCentralPairGap === null ? pair : Math.max(maxCentralPairGap, pair);
  }
  // 1 — canvas: V1.2 envelope 12…1658 for a full group, 48…1622 for a closure.
  const [sx0, sx1] = env;
  for (const p of incoming) {
    const b = bbox(p.outer);
    if (b.x0 + c.dx < sx0 - 1e-9 || b.x1 + c.dx > sx1 + 1e-9) return fail(`canvas ${sx0}…${sx1}`, dy, gaps, overlap, contact, maxCentralPairGap);
  }
  // 2 — contact lanes.
  if (contact < c.minContactLanes) return fail(`contact ${contact} < ${c.minContactLanes} lanes`, dy, gaps, overlap, contact, maxCentralPairGap);
  // 3 — paper overlap (target ± tolerance, maximum 136).
  if (Math.abs(overlap - c.targetOverlap) > V.seam.overlapTolerance + 1e-9 || overlap > V.seam.maxPaperOverlap + 1e-9) return fail(`chevauchement ${overlap.toFixed(1)}`, dy, gaps, overlap, contact, maxCentralPairGap);
  // 4 — two adjacent central lanes void.
  if (maxCentralPairGap !== null && maxCentralPairGap > V.seam.maxTwoAdjacentCentralLaneGap + 1e-9) return fail(`vide central ${maxCentralPairGap.toFixed(1)} > ${V.seam.maxTwoAdjacentCentralLaneGap}`, dy, gaps, overlap, contact, maxCentralPairGap);
  // 5 — every photo of the table under the incoming group keeps ≥ 0.35.
  const shifted = incoming.map((p) => ({ ...p, outer: add(p.outer, { x: c.dx, y: dy }), photo: add(p.photo, { x: c.dx, y: dy }) }));
  const inc = shifted.map((p) => bbox(p.outer));
  const minVisible = V.seam.minVisibleInteractivePhotoFraction;
  for (const t of table) {
    const tb = bbox(t.outer);
    if (!inc.some((b) => b.x0 < tb.x1 && b.x1 > tb.x0 && b.y0 < tb.y1 && b.y1 > tb.y0)) continue;
    const covers = [...table, ...shifted].filter((o) => o.z > t.z && convexIntersectionArea(t.outer, o.outer) > 1e-6).map((o) => o.outer);
    if (!covers.some((cv) => shifted.some((s) => s.outer === cv))) continue;
    const v = visibleFraction(t.photo, covers);
    if (v < minVisible - 1e-9) return fail(`${t.id} photo visible ${v.toFixed(3)} < ${minVisible}`, dy, gaps, overlap, contact, maxCentralPairGap);
  }
  return { ok: true, failure: null, dy, gaps, overlap, contact, maxCentralPairGap, upperNext };
}

// ── Candidate orders (V1.1 §4.3, §6) ───────────────────────────────────

function transitionCode(prev: AlbumGrammarId, cur: AlbumGrammarId): number {
  const key = `${prev}>${cur}` as keyof typeof V.seam.transitionCodes;
  return V.seam.transitionCodes[key];
}

/**
 * V1.2 order of the four states for full-group seam i. With the incoming
 * group's paper, every non-zero gesture is bounded by the slack of its side
 * inside 12…1658 and invalid below ½ of its V1.1 nominal value.
 */
export function relationalOrder(i: number, prev: AlbumGrammarId, cur: AlbumGrammarId, incoming?: { outer: Point[] }[]) {
  const code = transitionCode(prev, cur);
  const seed = (popcount(i) + 2 * popcount(i - 1)) % 4;
  const [e0, e1] = V2.groupPlacementEnvelope.xRange;
  const xs = incoming ? incoming.flatMap((p) => p.outer.map((q) => q.x)) : [];
  const slackLeft = incoming ? Math.min(...xs) - e0 : Infinity;
  const slackRight = incoming ? e1 - Math.max(...xs) : Infinity;
  const states: Candidate[] = V.seam.states.map((s) => {
    const nominal = "dx" in s ? s.dx : (popcount(i) % 2 === 0 ? -1 : 1) * s.dxMagnitude;
    const c: Candidate = { state: s.id, dx: nominal, targetOverlap: s.targetOverlap, minContactLanes: s.minContactLanes };
    if (nominal !== 0 && incoming) {
      const slack = nominal < 0 ? slackLeft : slackRight;
      const mag = Math.min(Math.abs(nominal), Math.max(0, Math.floor(slack)));
      const min = V2.stateDx.minFractionOfNominal * Math.abs(nominal);
      c.dx = Math.sign(nominal) * mag;
      if (mag < min - 1e-9) c.pre = `geste ${mag} < ${min} (marge ${slack.toFixed(1)})`;
    }
    return c;
  });
  return { code, seed, slackLeft, slackRight, order: V.seam.trialOffsets.map((o) => states[(seed + o) % 4]) };
}

export function closureOrder(grammar: "C2" | "C3" | "C4", lowerPrev: (number | null)[]): Candidate[] {
  const spec = V.closures[grammar];
  const mag = Math.max(...spec.dxCandidates.map(Math.abs));
  const known = lowerPrev.filter((v): v is number => v !== null);
  let sign: -1 | 1;
  if (spec.preference === "largest_outer_four_lane_void") {
    const lowest = Math.max(...known);
    const voidOf = (ks: readonly number[]) => ks.reduce((s, k) => s + (lowerPrev[k] === null ? 0 : lowest - lowerPrev[k]!), 0);
    sign = voidOf(READ.outerLanesLeft) >= voidOf(READ.outerLanesRight) ? -1 : 1;
  } else {
    const min = Math.min(...known);
    let sw = 0;
    let sx = 0;
    lowerPrev.forEach((v, k) => {
      if (v === null) return;
      const [x0, x1] = laneBounds(k);
      sw += v - min;
      sx += (v - min) * ((x0 + x1) / 2);
    });
    const bary = sw > 0 ? sx / sw : READ.canvasCenterX;
    sign = bary > READ.canvasCenterX ? -1 : bary < READ.canvasCenterX ? 1 : -1;
  }
  return [sign * mag, 0, -sign * mag].map((dx) => ({ state: "CLOSURE" as const, dx, targetOverlap: spec.targetOverlap, minContactLanes: spec.minContactLanes }));
}

// ── Layout ─────────────────────────────────────────────────────────────

const digest = (ps: AlbumPrint[]) => JSON.stringify(ps.map((p) => [p.slot.center, p.slot.zIndex, p.scale, p.outer]));

export function layoutAlbum(media: readonly AlbumMedia[], measurer: CaptionMeasurer | null): AlbumLayout {
  const specs = partitionAlbum(media.length);
  if (!specs.length) return { count: media.length, groups: [], prints: [], height: 0, status: "ALBUM_ABSENT" };
  const groups: AlbumGroupResult[] = [];
  const prints: AlbumPrint[] = [];
  const groupDigests: string[] = [];
  const minVisible = V.seam.minVisibleInteractivePhotoFraction;

  for (const spec of specs) {
    const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
    const src = media.slice(spec.start, spec.start + spec.size);
    const { session, cacheHit } = sessionFor(spec.grammar, src, spec.index === 0);
    const before = session.evaluated + session.repairEvaluated;
    const g = session.grammar;
    let status: AlbumGroupResult["status"] = "PASS";
    let detail: string | null = null;

    const local: GroupCandidate | null = session.structuralStop ? null : session.candidate(0);
    if (session.structuralStop) {
      status = session.structuralCanvas ? "ALBUM_CANVAS_STOP" : "ITEM_INACCESSIBLE_STOP";
      detail = session.structuralStop;
    } else if (!local) {
      status = "ITEM_INACCESSIBLE_STOP";
      const f = session.bestFailure?.[0];
      detail = `aucune solution locale (${session.evaluated} candidats joints)${f ? ` — ${f.slotId} ${f.rule} ${f.value.toFixed(3)} < ${f.minimum.toFixed(3)}` : ""}`;
    }
    const cand = local ?? session.fallback();
    const incoming: PlacedPrint[] = cand.placements.map((p, i) => ({ id: `media ${spec.start + i + 1}`, z: paintZ(spec.index, g.slots[i].zIndex), outer: p.outer, photo: p.photo }));

    // V1.1 §5: an incoming photo below 0.35 after its INTERNAL order.
    if (status === "PASS") {
      for (let i = 0; i < incoming.length; i++) {
        const covers = incoming.filter((o) => o.z > incoming[i].z && convexIntersectionArea(incoming[i].outer, o.outer) > 1e-6).map((o) => o.outer);
        const v = covers.length ? visibleFraction(incoming[i].photo, covers) : 1;
        if (v < minVisible - 1e-9) {
          status = "ITEM_INACCESSIBLE_STOP";
          detail = `${incoming[i].id} photo visible ${v.toFixed(3)} < ${minVisible} (ordre interne)`;
          break;
        }
      }
    }
    if (status === "PASS" && cand.placements.some((p) => p.shape.s < V.localSolver.scale.min - 1e-9)) {
      status = "ALBUM_SCALE_STOP";
      detail = "échelle < 0.995";
    }

    let dx = 0;
    let dy = 0;
    let seam: AlbumSeam | null = null;
    let seamTrials = 0;
    const prevGroup = groups[groups.length - 1];
    if (prevGroup) {
      const prevPrints = prints.filter((p) => p.groupIndex === prevGroup.index);
      const lowerPrev = laneSilhouette(prevPrints.map((p) => p.outer)).bottom;
      const table: PlacedPrint[] = prints.map((p) => ({ id: `media ${p.mediaIndex + 1}`, z: p.slot.zIndex, outer: p.outer, photo: p.photo }));
      const closure = g.family === "closure";
      const rel = closure ? null : relationalOrder(spec.index, prevGroup.grammar, spec.grammar, incoming);
      const order = closure ? closureOrder(spec.grammar as "C2" | "C3" | "C4", lowerPrev) : rel!.order;
      const trials: AlbumSeamTrial[] = [];
      let chosen: { c: Candidate; e: Evaluated } | null = null;
      let first: { c: Candidate; e: Evaluated } | null = null;
      for (const c of order) {
        seamTrials++;
        const e: Evaluated = c.pre
          ? { ok: false, failure: c.pre, dy: 0, gaps: lowerPrev.map(() => null), overlap: NaN, contact: 0, maxCentralPairGap: null, upperNext: lowerPrev.map(() => null) }
          : evaluateCandidate(c, incoming, lowerPrev, table, closure ? V2.closuresCanvas : V2.groupPlacementEnvelope.xRange);
        trials.push({ state: c.state, dx: c.dx, targetOverlap: c.targetOverlap, minContactLanes: c.minContactLanes, failure: e.failure });
        if (!first) first = { c, e };
        if (e.ok) {
          chosen = { c, e };
          break;
        }
      }
      if (!chosen && status === "PASS") {
        status = closure ? "ALBUM_CLOSURE_SEAM_STOP" : "ALBUM_RELATIONAL_SEAM_STOP";
        detail = trials.map((t) => `${t.state} dx ${t.dx} : ${t.failure}`).join(" · ");
      }
      // A STOP is still drawn (first trial) for QA — never as a solution.
      const use = chosen ?? first!;
      dx = use.c.dx;
      dy = use.e.dy;
      seam = {
        kind: closure ? "closure" : "relational",
        transitionCode: rel?.code ?? null,
        seed: rel?.seed ?? null,
        state: use.c.state,
        dx,
        dy,
        targetOverlap: use.c.targetOverlap,
        overlap: use.e.overlap,
        contactLanes: use.e.contact,
        lowerPrev,
        upperNext: use.e.upperNext,
        gaps: use.e.gaps,
        maxCentralPairGap: use.e.maxCentralPairGap,
        trials,
      };
    }

    const groupPrints: AlbumPrint[] = cand.placements.map((p, i) => {
      const v = g.slots[i];
      const mediaIndex = spec.start + i;
      const z = paintZ(spec.index, v.zIndex);
      const slot: A13Slot = {
        ...p.shape.slot,
        slotId: `g${spec.index}-${v.slotId}`,
        mediaIndex,
        center: { x: v.witness.center.x + p.d.x + dx, y: v.witness.center.y + p.d.y + dy },
        zIndex: z,
      };
      return {
        mediaId: media[mediaIndex].mediaId,
        mediaIndex,
        groupIndex: spec.index,
        localIndex: i,
        grammar: g.id,
        role: g.members[i].role,
        masterPrint: g.members[i].print,
        paintKey: [spec.index, v.zIndex, mediaIndex],
        slot,
        layout: p.shape.layout,
        caption: null,
        scale: p.shape.s,
        translation: p.d,
        outer: add(p.outer, { x: dx, y: dy }),
        photo: add(p.photo, { x: dx, y: dy }),
        minima: session.minima[i],
      };
    });
    // Captions last, against every tirage painted above them.
    for (const pr of groupPrints) {
      const text = media[pr.mediaIndex].caption;
      if (!text || !measurer) continue;
      const obstacles = [...prints, ...groupPrints].filter((o) => o.slot.zIndex > pr.slot.zIndex && convexIntersectionArea(pr.outer, o.outer) > 1e-6).map((o) => ({ slotId: o.slot.slotId, polygon: o.outer }));
      pr.caption = layoutCaption(pr.slot, pr.layout, text, measurer, obstacles);
    }
    prints.push(...groupPrints);

    // ALBUM_CANVAS_STOP (V1.2): local solve and closures 48…1622; a full
    // group placed by a relational seam: 12…1658 after translation.
    const [c0, c1] = seam && seam.kind === "relational" ? V2.groupPlacementEnvelope.xRange : V2.localSolverSafeX;
    const gx = groupPrints.flatMap((p) => p.outer.map((q) => q.x));
    if (status === "PASS" && (Math.min(...gx) < c0 - 1e-6 || Math.max(...gx) > c1 + 1e-6)) {
      status = "ALBUM_CANVAS_STOP";
      detail = `papier ${Math.min(...gx).toFixed(1)}…${Math.max(...gx).toFixed(1)} hors ${c0}…${c1}`;
    }

    // ALBUM_GROUP_LEAK_STOP: no earlier group may have changed.
    for (let k = 0; k < groupDigests.length; k++) {
      if (digest(prints.filter((p) => p.groupIndex === k)) !== groupDigests[k] && status === "PASS") {
        status = "ALBUM_GROUP_LEAK_STOP";
        detail = `groupe ${k} modifié par la résolution du groupe ${spec.index}`;
      }
    }
    groupDigests.push(digest(groupPrints));

    const ys = groupPrints.flatMap((p) => p.outer.map((q) => q.y));
    const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();
    groups.push({
      index: spec.index,
      grammar: spec.grammar,
      phase: spec.phase,
      size: spec.size,
      start: spec.start,
      status,
      detail,
      visualTop: Math.min(...ys),
      visualBottom: Math.max(...ys),
      seam,
      stats: { candidateRank: cand.rank, jointEvaluated: session.evaluated + session.repairEvaluated - before, repaired: session.repaired, seamTrials, cacheHit, ms: t1 - t0 },
    });
  }

  // V1.1 §7: lowest paper + functional shadow reserve (max 12) + breathing 120.
  const lowest = Math.max(...prints.flatMap((p) => p.outer.map((q) => q.y)));
  const height = lowest + V.ending.functionalShadowReserveMax + V.ending.breathing;
  const stop = groups.find((g) => g.status !== "PASS");
  return { count: media.length, groups, prints, height, status: stop ? stop.status : "PASS" };
}

/** ALBUM_NONDETERMINISM_STOP check: two cold computations must be byte-identical. */
export function albumGeometrySnapshot(l: AlbumLayout) {
  return JSON.stringify({
    groups: l.groups.map((g) => ({ ...g, stats: null })),
    prints: l.prints.map((p) => ({ id: p.mediaId, i: p.mediaIndex, key: p.paintKey, slot: p.slot, outer: p.layout.outer, window: p.layout.window, photo: p.layout.photo, mode: p.layout.mode, s: p.scale, d: p.translation, cap: p.caption?.lines.map((x) => [x.text, x.x, x.baseline]) ?? null })),
    height: l.height,
  });
}

export function verifyAlbumDeterminism(media: readonly AlbumMedia[], measurer: CaptionMeasurer | null): "PASS" | "ALBUM_NONDETERMINISM_STOP" {
  clearAlbumSolveCache();
  const a = albumGeometrySnapshot(layoutAlbum(media, measurer));
  clearAlbumSolveCache();
  const b = albumGeometrySnapshot(layoutAlbum(media, measurer));
  return a === b ? "PASS" : "ALBUM_NONDETERMINISM_STOP";
}

// ── QA (read-only measurements on a solved Album) ──────────────────────

export interface AlbumPrintQa {
  mediaIndex: number;
  visiblePhoto: number;
  visibleOuter: number;
  hitTargetSide: number;
  captionVisibleInk: number | null;
}

function coversFor(p: AlbumPrint, all: AlbumPrint[]) {
  return all.filter((o) => o.slot.zIndex > p.slot.zIndex && Math.abs(o.groupIndex - p.groupIndex) <= 2 && convexIntersectionArea(p.outer, o.outer) > 1e-6).map((o) => o.outer);
}

function inkVisible(p: AlbumPrint, covers: Point[][]) {
  if (!p.caption || !p.caption.lines.length) return null;
  let total = 0;
  let covered = 0;
  for (const l of p.caption.lines) {
    const ink = slotRectToCanvas(p.slot, {
      x: p.layout.outer.x + l.x - l.metrics.actualBoundingBoxLeft,
      y: p.layout.outer.y + l.baseline - l.metrics.actualBoundingBoxAscent,
      width: l.metrics.actualBoundingBoxLeft + l.metrics.actualBoundingBoxRight,
      height: l.metrics.actualBoundingBoxAscent + l.metrics.actualBoundingBoxDescent,
    });
    const a = Math.abs(ink.reduce((s, q, i) => s + q.x * ink[(i + 1) % ink.length].y - ink[(i + 1) % ink.length].x * q.y, 0)) / 2;
    total += a;
    covered += unionCoverArea(ink, covers.filter((c) => convexIntersectionArea(ink, c) > 1e-6));
  }
  return total > 1e-6 ? Math.max(0, 1 - covered / total) : 1;
}

export function albumPrintQa(layout: AlbumLayout): AlbumPrintQa[] {
  return layout.prints.map((p) => {
    const covers = coversFor(p, layout.prints);
    return {
      mediaIndex: p.mediaIndex,
      visiblePhoto: covers.length ? visibleFraction(p.photo, covers) : 1,
      visibleOuter: covers.length ? visibleFraction(p.outer, covers) : 1,
      hitTargetSide: largestVisibleSquare(p.outer, covers, 0).side,
      captionVisibleInk: inkVisible(p, covers),
    };
  });
}

export interface AlbumSeamQa {
  between: [number, number];
  transition: string;
  state: string;
  dx: number;
  overlap: number;
  contactLanes: number;
  maxCentralPairGap: number | null;
  /** Lane pattern: '#' contact (gap ≤ 0), '.' void (gap > 0), ' ' null lane. */
  pattern: string;
  maxGap: number | null;
  /** Paper overlap area across the seam (px²) and tirage pairs involved. */
  crossOverlapPx2: number;
  crossPairs: number;
}

export function albumSeamQa(layout: AlbumLayout): AlbumSeamQa[] {
  const out: AlbumSeamQa[] = [];
  for (let k = 1; k < layout.groups.length; k++) {
    const g = layout.groups[k];
    const s = g.seam!;
    const a = layout.prints.filter((p) => p.groupIndex === k - 1);
    const b = layout.prints.filter((p) => p.groupIndex === k);
    let area = 0;
    let pairs = 0;
    for (const p of a)
      for (const q of b) {
        const x = convexIntersectionArea(p.outer, q.outer);
        if (x > 1e-6) {
          area += x;
          pairs++;
        }
      }
    const known = s.gaps.filter((v): v is number => v !== null);
    out.push({
      between: [k - 1, k],
      transition: `${layout.groups[k - 1].grammar}→${g.grammar}`,
      state: s.state,
      dx: s.dx,
      overlap: s.overlap,
      contactLanes: s.contactLanes,
      maxCentralPairGap: s.maxCentralPairGap,
      pattern: s.gaps.map((v) => (v === null ? " " : v <= 0 ? "#" : ".")).join(""),
      maxGap: known.length ? Math.max(...known) : null,
      crossOverlapPx2: area,
      crossPairs: pairs,
    });
  }
  return out;
}

