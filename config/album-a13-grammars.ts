import type { V2Anchor, V2Slot } from "@/config/gallery-a13-v2-manifests";
import { A13_ALBUM_V1_1, type AlbumStopV11 } from "@/config/album-a13-runtime-calibration-v1-1";
import {
  A13_ALBUM_MASTER_DEPTH,
  A13_ALBUM_MASTER_PRINTS,
  A13_ALBUM_MASTER_TOP_ORNAMENT,
  A13_ALBUM_SOURCE_TO_CANONICAL as S,
  type AlbumMasterPrintId,
} from "@/config/album-a13-master-measurements";

/**
 * A13 — ALBUM COMPLET DESKTOP LIGHT — EXTENSIBLE MEMORY TABLE, grammars
 * (runtime pilot V1). Authority: `A13_ALBUM_COMPLET_DESKTOP_EXTENSIBLE_
 * MEMORY_TABLE_ARCHITECTURE_STUDY_V1` (GREEN QG) + the Album Light Master
 * measured in `album-a13-master-measurements.ts`.
 *
 * Every slot below IS a measured Master tirage (centre, outer paper size,
 * rotation, depth) brought to the canonical 1670 frame. No slot is invented,
 * mirrored or derived from the Gallery.
 *
 * ## Reading of the Master (11 tirages, reading order P1…P11)
 *
 * - A — upper table (Handoff §3 "un souvenir leader, un grand ancrage
 *   horizontal et un groupe secondaire en profondeur"): P1…P5 — leader P1,
 *   horizontal anchor P4 (the panorama), secondaries P2, P3, P5.
 * - B — lower table ("masse visuelle décalée, ancrage bas et souvenirs
 *   secondaires répartis autour de lui"): P6…P10 — offset mass P6, low
 *   anchor P10, secondaries P7, P8, P9 around it. A + B = P1…P10 is the
 *   Handoff's "10 : lecture directe du Master".
 * - Closures (§3 "trois grammaires de fermeture dédiées"): the Master holds
 *   11 tirages, and the Handoff partitions 11 as 5 + 4 + 2 — read directly:
 *   C4 = P6…P9, C2 = P10…P11. C3 = P9…P11, the Master's closing row (its
 *   last three tirages). A closure uses exactly its own tirages: no hidden
 *   slot, no reserved blank.
 *
 * ## Solver parameters — Runtime Calibration Handoff V1.1 (contractual)
 *
 * `A13_ALBUM_V1_1` (config/album-a13-runtime-calibration-v1-1.ts) is the
 * authority: territory leader ±11 % (X and Y), others ±18 % (X) / ±19 %
 * (Y); scale 0.995 … 1.000, step 0.005 (Master position, then local
 * translations, then scale); canvas safe X 48 … 1622. The internal slots,
 * rotations, anchors and z-ranks of A, B, C2, C3, C4 are those of V1
 * (README §3). Anchor convention kept from V1: top row → top-center
 * (right-top for the rightmost), bottom row → left-bottom / bottom-center
 * / right-bottom; a single-row closure is a top row.
 */

export type AlbumGrammarId = "A" | "B" | "C4" | "C3" | "C2";
export type AlbumRole = "lead-memory" | "wide-anchor" | "supporting-memory-a" | "supporting-memory-b" | "depth-memory";

interface MemberSpec {
  print: AlbumMasterPrintId;
  role: AlbumRole;
  anchor: V2Anchor;
}

export interface AlbumGrammar {
  id: AlbumGrammarId;
  size: 2 | 3 | 4 | 5;
  family: "full" | "closure";
  description: string;
  members: readonly MemberSpec[];
  /** V2-shaped slots, witness in the Master page frame × S (1670). */
  slots: readonly V2Slot[];
}

const { territory: T, scale: SCALE } = A13_ALBUM_V1_1.localSolver;
/** V1.1: scale 0.995 … 1.000. "Preferred" = 1.000 only, so 0.995 is tried
 * after every local translation (README §3 "puis échelle"). */
const PREFERRED: [number, number] = [SCALE.max, SCALE.max];
const HARD: [number, number] = [SCALE.min, SCALE.max];
const TERRITORY_LEAD = { x: T.leaderPercentXY / 100, y: T.leaderPercentXY / 100 };
const TERRITORY = { x: T.otherPercentX / 100, y: T.otherPercentY / 100 };

const r2 = (v: number) => Math.round(v * 100) / 100;

function buildSlots(id: AlbumGrammarId, members: readonly MemberSpec[]): V2Slot[] {
  return members.map((m, i) => {
    const p = A13_ALBUM_MASTER_PRINTS.find((x) => x.id === m.print)!;
    const w = r2(p.outerSize.width * S);
    const h = r2(p.outerSize.height * S);
    const t = m.role === "lead-memory" ? TERRITORY_LEAD : TERRITORY;
    const tx = Math.round(t.x * w);
    const ty = Math.round(t.y * h);
    return {
      slotId: `${id}-${m.print}`,
      mediaIndex: i,
      role: m.role,
      witness: {
        center: { x: r2(p.outerCenter.x * S), y: r2(p.outerCenter.y * S) },
        outerSize: { width: w, height: h },
        outerArea: r2(w * h),
        rotationDeg: p.rotationDeg,
      },
      territory: { xMin: -tx, xMax: tx, yMin: -ty, yMax: ty },
      scaleBounds: { preferred: PREFERRED, hard: HARD },
      anchor: m.anchor,
      zIndex: A13_ALBUM_MASTER_DEPTH[m.print],
    };
  });
}

function grammar(id: AlbumGrammarId, family: AlbumGrammar["family"], description: string, members: MemberSpec[]): AlbumGrammar {
  return { id, size: members.length as AlbumGrammar["size"], family, description, members, slots: buildSlots(id, members) };
}

export const A13_ALBUM_GRAMMARS: Record<AlbumGrammarId, AlbumGrammar> = {
  A: grammar("A", "full", "A — upper table (Master P1…P5)", [
    { print: "P1", role: "lead-memory", anchor: "top-center" },
    { print: "P2", role: "supporting-memory-a", anchor: "right-top" },
    { print: "P3", role: "depth-memory", anchor: "left-bottom" },
    { print: "P4", role: "wide-anchor", anchor: "bottom-center" },
    { print: "P5", role: "supporting-memory-b", anchor: "right-bottom" },
  ]),
  B: grammar("B", "full", "B — lower table (Master P6…P10)", [
    { print: "P6", role: "lead-memory", anchor: "top-center" },
    { print: "P7", role: "supporting-memory-a", anchor: "top-center" },
    { print: "P8", role: "supporting-memory-b", anchor: "right-top" },
    { print: "P9", role: "depth-memory", anchor: "left-bottom" },
    { print: "P10", role: "wide-anchor", anchor: "bottom-center" },
  ]),
  C4: grammar("C4", "closure", "closure 4 (Master P6…P9 — 11 = 5 + 4 + 2)", [
    { print: "P6", role: "lead-memory", anchor: "top-center" },
    { print: "P7", role: "supporting-memory-a", anchor: "top-center" },
    { print: "P8", role: "supporting-memory-b", anchor: "right-top" },
    { print: "P9", role: "depth-memory", anchor: "left-bottom" },
  ]),
  C3: grammar("C3", "closure", "closure 3 (Master closing row P9…P11)", [
    { print: "P9", role: "supporting-memory-a", anchor: "top-center" },
    { print: "P10", role: "wide-anchor", anchor: "top-center" },
    { print: "P11", role: "supporting-memory-b", anchor: "right-top" },
  ]),
  C2: grammar("C2", "closure", "closure 2 (Master P10…P11 — 11 = 5 + 4 + 2)", [
    { print: "P10", role: "wide-anchor", anchor: "top-center" },
    { print: "P11", role: "supporting-memory-a", anchor: "right-top" },
  ]),
};

/** Handoff §2 / JSON `partition`. */
export const A13_ALBUM_PARTITION = {
  preferredGroupSize: 5,
  allowedGroupSizes: [2, 3, 4, 5] as const,
  singletonGroupAllowed: false,
} as const;

/** Canonical A13 frame (DynamicPolaroid px). The page grows downward only.
 * V1.1: every tirage's paper stays inside `canvasSafeX` (48 … 1622). */
export const A13_ALBUM_CANVAS = {
  width: A13_ALBUM_V1_1.coordinateSpace.width,
  safeX: A13_ALBUM_V1_1.seam.canvasSafeX,
} as const;

/** Structural top zone protected for the first group only (canonical px). */
export const A13_ALBUM_TOP_ZONE = {
  x0: r2(A13_ALBUM_MASTER_TOP_ORNAMENT.x0 * S),
  y0: r2(A13_ALBUM_MASTER_TOP_ORNAMENT.y0 * S),
  x1: r2(A13_ALBUM_MASTER_TOP_ORNAMENT.x1 * S),
  y1: r2(A13_ALBUM_MASTER_TOP_ORNAMENT.y1 * S),
} as const;

/** Internal (local solver) hard rules — Handoff V1 §6 (44 × 44 connected
 * hit target) + V2 contract minima; the photo cap is the V1.1
 * `minVisibleInteractivePhotoFraction`. Unchanged by V1.1. */
export const A13_ALBUM_HARD = {
  minimumConnectedHitTargetCssPx: 44,
  hardMinimumVisiblePhotoFractionCap: A13_ALBUM_V1_1.seam.minVisibleInteractivePhotoFraction,
  hardMinimumVisibleOuterFractionCap: 0.3,
} as const;

/** V1.1 §8 — the STOP codes implemented and reported. */
export const A13_ALBUM_STOPS = A13_ALBUM_V1_1.stopConditions;
export type AlbumStop = AlbumStopV11;
