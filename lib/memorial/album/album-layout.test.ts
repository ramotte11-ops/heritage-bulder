import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { A13_ALBUM_GRAMMARS, A13_ALBUM_HARD } from "@/config/album-a13-grammars";
import { A13_ALBUM_V1_1, A13_ALBUM_V1_1_READINGS } from "@/config/album-a13-runtime-calibration-v1-1";
import { A13_ALBUM_V1_2 } from "@/config/album-a13-long-sequence-v1-2";
import { A13_ALBUM_MASTER_PRINTS, A13_ALBUM_SOURCE_TO_CANONICAL as S } from "@/config/album-a13-master-measurements";
import type { CaptionMeasurer } from "@/lib/memorial/gallery/caption-layout";
import {
  albumGeometrySnapshot as geometry,
  albumPrintQa,
  albumSeamQa,
  clearAlbumSolveCache,
  closureOrder,
  laneSilhouette,
  layoutAlbum,
  relationalOrder,
  verifyAlbumDeterminism,
  type AlbumLayout,
  type AlbumMedia,
} from "@/lib/memorial/album/album-layout";
import { ALBUM_MAX_JOINT } from "@/lib/memorial/album/album-group-solver";
import { popcount } from "@/lib/memorial/album/album-partition";
import { albumFixture, ALBUM_RATIO_SETS, type AlbumCaptionSet, type AlbumRatioSet } from "@/lib/memorial/album/album-pilot-fixtures";

const V = A13_ALBUM_V1_1;
const fake: CaptionMeasurer = {
  measure: (t) => ({ width: t.length * 11, actualBoundingBoxLeft: 0, actualBoundingBoxRight: t.length * 11, actualBoundingBoxAscent: 18, actualBoundingBoxDescent: 6 }),
  fontAscent: 22,
  fontDescent: 8,
};

function media(n: number, ratios: AlbumRatioSet, captions: AlbumCaptionSet = "none"): AlbumMedia[] {
  return albumFixture(n, ratios, captions).map(({ mediaId, width, height, caption }) => ({ mediaId, width, height, caption }));
}

const prefix = (l: AlbumLayout, k: number) => geometry({ ...l, groups: l.groups.slice(0, k), prints: l.prints.filter((p) => p.groupIndex < k), height: 0 });

beforeEach(() => clearAlbumSolveCache());

describe("A13 Album — grammars measured on the Master (V1, unchanged)", () => {
  it("every slot is a measured Master tirage in the 1670 frame (no invented slot)", () => {
    for (const g of Object.values(A13_ALBUM_GRAMMARS)) {
      expect(g.slots.length).toBe(g.size);
      g.slots.forEach((s, i) => {
        const p = A13_ALBUM_MASTER_PRINTS.find((x) => x.id === g.members[i].print)!;
        expect(s.witness.center.x).toBeCloseTo(p.outerCenter.x * S, 1);
        expect(s.witness.center.y).toBeCloseTo(p.outerCenter.y * S, 1);
        expect(s.witness.outerSize.width).toBeCloseTo(p.outerSize.width * S, 1);
        expect(s.witness.rotationDeg).toBe(p.rotationDeg);
        expect(s.mediaIndex).toBe(i);
      });
    }
    expect([...A13_ALBUM_GRAMMARS.A.members, ...A13_ALBUM_GRAMMARS.B.members].map((m) => m.print)).toEqual(["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8", "P9", "P10"]);
  }, 120000);

  it("uses the V1.1 solver parameters (territory 11 / 18 / 19 %, scale 0.995…1.000)", () => {
    for (const g of Object.values(A13_ALBUM_GRAMMARS))
      for (const s of g.slots) {
        const lead = s.role === "lead-memory";
        expect(s.territory.xMax).toBe(Math.round((lead ? 0.11 : 0.18) * s.witness.outerSize.width));
        expect(s.territory.yMax).toBe(Math.round((lead ? 0.11 : 0.19) * s.witness.outerSize.height));
        expect(s.scaleBounds.hard).toEqual([0.995, 1]);
      }
  }, 120000);

  it("Master-like media keep the Master witness (s = 1); only the safe-X canvas moves B-P6 / B-P8", () => {
    const l = layoutAlbum(media(10, "master-like"), null);
    expect(l.status).toBe("PASS");
    for (const p of l.prints) {
      expect(p.scale).toBe(1);
      if (!(p.grammar === "B" && (p.masterPrint === "P6" || p.masterPrint === "P8"))) expect(p.translation).toEqual({ x: 0, y: 0 });
    }
  }, 120000);
});

describe("A13 Album — V1.1 relational seam (§4)", () => {
  it("computes the V1.2 seed and the V1.1 trial order", () => {
    for (let i = 1; i < 40; i++)
      for (const [pa, pb] of [["A", "A"], ["A", "B"], ["B", "A"], ["B", "B"]] as const) {
        const r = relationalOrder(i, pa, pb);
        const seed = (popcount(i) + 2 * popcount(i - 1)) % 4;
        expect(r.seed).toBe(seed);
        const ids = ["COMPACT_LEFT", "BALANCED", "COMPACT_RIGHT", "AIRY_OFFSET"];
        expect(r.order.map((o) => o.state)).toEqual([0, 1, 3, 2].map((o) => ids[(seed + o) % 4]));
        const airy = r.order.find((o) => o.state === "AIRY_OFFSET")!;
        expect(airy.dx).toBe(popcount(i) % 2 === 0 ? -40 : 40);
      }
  }, 120000);

  it("every seam satisfies §4.4 exactly and is the first valid state in seed order", () => {
    for (const set of ALBUM_RATIO_SETS)
      for (const n of [20, 40]) {
        const l = layoutAlbum(media(n, set), null);
        expect(l.status).toBe("PASS");
        for (const g of l.groups.slice(1)) {
          const s = g.seam!;
          expect(s.kind).toBe("relational");
          const st = V.seam.states.find((x) => x.id === s.state)!;
          expect(s.targetOverlap).toBe(st.targetOverlap);
          expect(Math.abs(s.overlap - st.targetOverlap)).toBeLessThanOrEqual(V.seam.overlapTolerance);
          expect(s.overlap).toBeLessThanOrEqual(V.seam.maxPaperOverlap + 1e-9);
          expect(s.contactLanes).toBeGreaterThanOrEqual(st.minContactLanes);
          if (s.maxCentralPairGap !== null) expect(s.maxCentralPairGap).toBeLessThanOrEqual(V.seam.maxTwoAdjacentCentralLaneGap);
          // gap definition, recomputed from the placed paper
          const prev = laneSilhouette(l.prints.filter((p) => p.groupIndex === g.index - 1).map((p) => p.outer)).bottom;
          const next = laneSilhouette(l.prints.filter((p) => p.groupIndex === g.index).map((p) => p.outer)).top;
          next.forEach((u, k) => {
            if (u === null || prev[k] === null) expect(s.gaps[k]).toBeNull();
            else expect(s.gaps[k]!).toBeCloseTo(u - prev[k]!, 6);
          });
          // all earlier trials failed, the chosen one passed
          expect(s.trials[s.trials.length - 1].failure).toBeNull();
          expect(s.trials.slice(0, -1).every((t) => t.failure !== null)).toBe(true);
          // V1.2 bounded gesture: same sign as nominal, |dx| ≤ |nominal|, ≥ ½ |nominal|
          const nominal = "dx" in st ? st.dx : st.dxMagnitude;
          if (nominal !== 0) {
            expect(Math.abs(s.dx)).toBeLessThanOrEqual(Math.abs(nominal));
            expect(Math.abs(s.dx)).toBeGreaterThanOrEqual(A13_ALBUM_V1_2.stateDx.minFractionOfNominal * Math.abs(nominal));
            expect(Number.isInteger(s.dx)).toBe(true);
          } else expect(s.dx).toBe(0);
        }
      }
  }, 240000);

  it("keeps full groups in 12…1658, the first group and closures in 48…1622 (V1.2 canvas)", () => {
    for (const set of ALBUM_RATIO_SETS)
      for (const n of [11, 40]) {
        const l = layoutAlbum(media(n, set, "mixed"), fake);
        for (const g of l.groups) {
          const [c0, c1] = g.seam?.kind === "relational" ? A13_ALBUM_V1_2.groupPlacementEnvelope.xRange : A13_ALBUM_V1_2.localSolverSafeX;
          for (const p of l.prints.filter((x) => x.groupIndex === g.index))
            for (const q of p.outer) {
              expect(q.x).toBeGreaterThanOrEqual(c0 - 1e-6);
              expect(q.x).toBeLessThanOrEqual(c1 + 1e-6);
            }
        }
      }
    expect(V.seam.canvasSafeX).toEqual([48, 1622]);
  }, 240000);

  it("makes the four relational states reachable (V1.2)", () => {
    const seen = new Set<string>();
    for (const set of ALBUM_RATIO_SETS)
      for (const n of [20, 40, 60]) for (const g of layoutAlbum(media(n, set), null).groups) if (g.seam?.kind === "relational") seen.add(g.seam.state);
    expect([...seen].sort()).toEqual(["AIRY_OFFSET", "BALANCED", "COMPACT_LEFT", "COMPACT_RIGHT"]);
  }, 240000);

  it("mixed-natural: no STOP caused by a previous group's depth (former B→B STOP)", () => {
    for (const n of [14, 20, 40, 53]) {
      const l = layoutAlbum(media(n, "mixed-natural"), null);
      expect(l.status).toBe("PASS");
    }
  }, 240000);
});

describe("A13 Album — V1.1 depth (§5)", () => {
  it("paints by (depositEpoch, localZRank, mediaIndex): an incoming group is always above", () => {
    const l = layoutAlbum(media(40, "natural-mix"), null);
    for (const p of l.prints) {
      expect(p.paintKey).toEqual([p.groupIndex, A13_ALBUM_GRAMMARS[p.grammar].slots[p.localIndex].zIndex, p.mediaIndex]);
      for (const q of l.prints) {
        if (q.groupIndex > p.groupIndex) expect(q.slot.zIndex).toBeGreaterThan(p.slot.zIndex);
        if (q.groupIndex === p.groupIndex && q.paintKey[1] > p.paintKey[1]) expect(q.slot.zIndex).toBeGreaterThan(p.slot.zIndex);
      }
    }
  }, 120000);

  it("holds the photo visibility (≥ 0.35) and the 44 px hit target on the final page", () => {
    for (const set of ALBUM_RATIO_SETS) {
      const l = layoutAlbum(media(40, set, "32-two-lines"), fake);
      expect(l.status).toBe("PASS");
      albumPrintQa(l).forEach((q) => {
        expect(q.visiblePhoto).toBeGreaterThanOrEqual(V.seam.minVisibleInteractivePhotoFraction - 1e-6);
        expect(q.hitTargetSide).toBeGreaterThanOrEqual(A13_ALBUM_HARD.minimumConnectedHitTargetCssPx);
      });
    }
  }, 240000);
});

describe("A13 Album — V1.1 relational closures (§6)", () => {
  it("closes 7, 8, 9, 11 relationally with the contractual dx order", () => {
    for (const set of ALBUM_RATIO_SETS)
      for (const n of [7, 8, 9, 11]) {
        const l = layoutAlbum(media(n, set, "mixed"), fake);
        expect(l.status).toBe("PASS");
        for (const g of l.groups.slice(1)) {
          const s = g.seam!;
          expect(s.kind).toBe("closure");
          const spec = V.closures[g.grammar as "C2" | "C3" | "C4"];
          const order = closureOrder(g.grammar as "C2" | "C3" | "C4", s.lowerPrev);
          expect(order.map((o) => o.dx)).toEqual([order[0].dx, 0, -order[0].dx]);
          expect(Math.abs(order[0].dx)).toBe(Math.max(...spec.dxCandidates.map(Math.abs)));
          expect(s.targetOverlap).toBe(spec.targetOverlap);
          expect(s.contactLanes).toBeGreaterThanOrEqual(spec.minContactLanes);
          expect(s.trials.map((t) => t.dx)).toEqual(order.slice(0, s.trials.length).map((o) => o.dx));
        }
      }
  }, 240000);

  it("C2 tries first the side whose 4 outer lanes hold the larger void", () => {
    const lower = [500, 500, 500, 500, 600, 600, 600, 600, 590, 590, 590, 590];
    expect(closureOrder("C2", lower)[0].dx).toBe(-96);
    expect(closureOrder("C2", [...lower].reverse())[0].dx).toBe(96);
    // C3 / C4: opposite the previous lower barycentre
    const lowRight = [500, 500, 500, 500, 500, 500, 520, 540, 600, 620, 640, 660];
    expect(closureOrder("C3", lowRight)[0].dx).toBe(-64);
    expect(closureOrder("C4", [...lowRight].reverse())[0].dx).toBe(48);
    expect(A13_ALBUM_V1_1_READINGS.centralLanes).toEqual([4, 5, 6, 7]);
  }, 120000);

  it("ends the page 12 + 120 px below the lowest paper, with exactly the remaining media", () => {
    for (const [n, last] of [[7, 2], [8, 3], [9, 4], [10, 5], [11, 2], [12, 2], [13, 3], [14, 4]] as const) {
      const l = layoutAlbum(media(n, "natural-mix", "mixed"), fake);
      expect(l.status).toBe("PASS");
      expect(l.prints.length).toBe(n);
      expect(l.groups[l.groups.length - 1].size).toBe(last);
      const lowest = Math.max(...l.prints.flatMap((p) => p.outer.map((q) => q.y)));
      expect(l.height).toBeCloseTo(lowest + V.ending.functionalShadowReserveMax + V.ending.breathing, 6);
    }
  }, 240000);
});

describe("A13 Album — non-regressions", () => {
  it("is deterministic: two cold computations are byte-identical (no ALBUM_NONDETERMINISM_STOP)", () => {
    for (const set of ALBUM_RATIO_SETS) expect(verifyAlbumDeterminism(media(40, set, "mixed"), fake)).toBe("PASS");
    const m = media(20, "natural-mix", "mixed");
    const a = geometry(layoutAlbum(m, fake));
    expect(geometry(layoutAlbum(m, fake))).toBe(a); // cached
  }, 240000);

  it("keeps the strict family order in prints (DOM order) and groups", () => {
    for (const n of [7, 10, 11, 20, 40]) {
      const m = media(n, "natural-mix");
      const l = layoutAlbum(m, null);
      expect(l.prints.map((p) => p.mediaId)).toEqual(m.map((x) => x.mediaId));
      l.prints.forEach((p, i) => expect(p.mediaIndex).toBe(i));
    }
  }, 120000);

  it("never recomputes a previous group and never scales below 0.995 (page grows)", () => {
    const l10 = layoutAlbum(media(10, "natural-mix"), null);
    const l20 = layoutAlbum(media(20, "natural-mix"), null);
    const l40 = layoutAlbum(media(40, "natural-mix"), null);
    expect(prefix(l40, 2)).toBe(prefix(l10, 2));
    expect(prefix(l40, 4)).toBe(prefix(l20, 4));
    expect(l40.height).toBeGreaterThan(l20.height);
    for (const l of [l10, l20, l40]) {
      expect(l.groups.some((g) => g.status === "ALBUM_GROUP_LEAK_STOP")).toBe(false);
      for (const p of l.prints) expect(p.scale).toBeGreaterThanOrEqual(0.995);
    }
  }, 120000);

  it("captions (none / 32 / mixed) never change the geometry", () => {
    const strip = (l: AlbumLayout) => JSON.stringify(l.prints.map((p) => [p.slot.center, p.slot.zIndex, p.scale, p.layout.outer]));
    const a = strip(layoutAlbum(media(20, "natural-mix", "none"), null));
    expect(strip(layoutAlbum(media(20, "natural-mix", "32-two-lines"), fake))).toBe(a);
    expect(strip(layoutAlbum(media(20, "natural-mix", "mixed"), fake))).toBe(a);
  }, 120000);

  it("bounds the work per group (≤ 5 media, bounded search)", () => {
    const l = layoutAlbum(media(40, "natural-mix"), null);
    for (const g of l.groups) {
      expect(g.size).toBeLessThanOrEqual(5);
      expect(g.stats.jointEvaluated).toBeLessThanOrEqual(ALBUM_MAX_JOINT * 20);
      expect(g.stats.seamTrials).toBeLessThanOrEqual(4);
    }
    expect(albumSeamQa(l).length).toBe(7);
  }, 120000);

  it("is theme-free: no Album geometry module imports a theme or Dark material", () => {
    for (const f of ["album-layout.ts", "album-group-solver.ts", "album-partition.ts"]) {
      expect(readFileSync(path.join(__dirname, f), "utf8")).not.toMatch(/dark-material|theme-material|A13Theme/);
    }
    for (const f of ["config/album-a13-grammars.ts", "config/album-a13-master-measurements.ts", "config/album-a13-runtime-calibration-v1-1.ts"]) {
      expect(readFileSync(path.join(__dirname, "../../..", f), "utf8")).not.toMatch(/dark-material|theme-material|A13Theme/);
    }
  }, 120000);
});
