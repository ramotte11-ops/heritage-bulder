import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  A13_ALBUM_MOBILE_CAPTION as CAP,
  A13_ALBUM_MOBILE_HANDOFF_ID,
  A13_ALBUM_MOBILE_MATERIALS as MAT,
  A13_ALBUM_MOBILE_STOPS,
  A13_ALBUM_MOBILE_WITNESS,
} from "@/config/album-a13-mobile-light";
import type { CaptionMeasurer } from "@/lib/memorial/gallery/caption-layout";
import { partitionAlbumMobile } from "@/lib/memorial/album/album-partition";
import {
  albumMobileAccess,
  albumMobileGroupOffset,
  albumMobileMaterialPlan,
  albumMobileNegativeControls,
  albumMobileSnapshot,
  layoutAlbumMobile,
  solveAlbumMobileGeometry,
  verifyAlbumMobile,
  verifyAlbumMobileMaterials,
} from "@/lib/memorial/album/album-mobile-layout";
import { ALBUM_MOBILE_CAPTION_SETS, ALBUM_MOBILE_COUNTS, ALBUM_MOBILE_RATIO_SETS, albumMobileFixture, type AlbumMobileCaptionSet, type AlbumMobileRatioSet } from "@/lib/memorial/album/album-mobile-pilot-fixtures";
import { albumGeometrySnapshot, clearAlbumSolveCache, layoutAlbum } from "@/lib/memorial/album/album-layout";
import { albumFixture, ALBUM_RATIO_SETS } from "@/lib/memorial/album/album-pilot-fixtures";

/**
 * A13 Full Album Mobile Light — engine-level contract (Handoff V1.1). The
 * rendered pass (real La Belle Aurore metrics, DOM, materials, Viewer,
 * 375 / 390 / 430) runs in the pilot `/pilot/a13-album-mobile-light`
 * (`?matrice=1`). Here the caption measurer is a fixed stand-in.
 */

const fake: CaptionMeasurer = {
  measure: (t) => ({ width: t.length * 11.5, actualBoundingBoxLeft: 0, actualBoundingBoxRight: t.length * 11.5, actualBoundingBoxAscent: 20, actualBoundingBoxDescent: 8 }),
  fontAscent: 22,
  fontDescent: 8,
};
const media = (n: number, r: AlbumMobileRatioSet, c: AlbumMobileCaptionSet) => albumMobileFixture(n, r, c).map(({ mediaId, width, height, caption }) => ({ mediaId, width, height, caption }));
const ROOT = path.resolve(import.meta.dirname, "../../..");

describe("partition (TOP3, PAIR_A / PAIR_B, CLOSURE3)", () => {
  it("the contract examples; no singleton; strict contiguous order; no Album below 7", () => {
    const sizes = (n: number) => partitionAlbumMobile(n).map((g) => g.size);
    expect([7, 8, 9, 10, 11, 20].map(sizes)).toEqual([
      [3, 2, 2],
      [3, 2, 3],
      [3, 2, 2, 2],
      [3, 2, 2, 3],
      [3, 2, 2, 2, 2],
      [3, 2, 2, 2, 2, 2, 2, 2, 3],
    ]);
    expect(partitionAlbumMobile(11).map((g) => g.grammar)).toEqual(["TOP3", "PAIR_A", "PAIR_B", "PAIR_A", "PAIR_B"]);
    expect(partitionAlbumMobile(8).map((g) => g.grammar)).toEqual(["TOP3", "PAIR_A", "CLOSURE3"]);
    for (const n of [0, 1, 2, 6]) expect(partitionAlbumMobile(n)).toEqual([]);
    for (let n = 7; n <= 200; n++) {
      const p = partitionAlbumMobile(n);
      expect(p.every((g) => g.size >= 2)).toBe(true);
      expect(p.reduce((s, g) => (g.start === s ? s + g.size : -1), 0)).toBe(n);
      expect(p[0].grammar).toBe("TOP3");
      expect(p.filter((g) => g.grammar === "CLOSURE3").length).toBe((n - 3) % 2);
    }
  });

  it("placement: TOP3 and the first PAIR_A / PAIR_B at the Master, then the advances 226 / 220; CLOSURE3 at the Master's third body position", () => {
    const off = (n: number) => partitionAlbumMobile(n).map(albumMobileGroupOffset);
    expect(off(11)).toEqual([0, 0, 0, 446, 446]);
    expect(off(8)).toEqual([0, 0, -220]);
    expect(off(10)).toEqual([0, 0, 0, 0]);
    expect(off(20)).toEqual([0, 0, 0, 446, 446, 892, 892, 1338, 1118]);
  });
});

describe("geometry (375 profile, scaled by s = W / 1024)", () => {
  it("witness media: TOP3 + the first PAIR_A / PAIR_B on their Master centres at scale 1 (within the shared contain policy)", () => {
    const g = solveAlbumMobileGeometry(media(11, "witness", "aucune"));
    expect(g.status).toBe("PASS");
    for (const p of g.prints.slice(0, 7)) {
      const w = A13_ALBUM_MOBILE_WITNESS[p.witnessSlot];
      expect([p.slot.center.x, p.slot.center.y, p.scale], `${p.mediaIndex}`).toEqual([w.center.x, w.center.y, 1]);
      expect(p.slot.rotationDeg).toBe(w.rotationDeg);
    }
  });

  it("every QA case resolves; dominant ≥ 96 CSS px and secondaries ≥ 72 CSS px at 375 — except P3 with a 9:16 media (69.3 px at the scale ceiling 1.06)", { timeout: 300000 }, () => {
    const unreached = new Set<string>();
    for (const n of ALBUM_MOBILE_COUNTS)
      for (const r of ALBUM_MOBILE_RATIO_SETS) {
        const g = solveAlbumMobileGeometry(media(n, r, "aucune"));
        expect(g.status, `${n} ${r}`).toBe("PASS");
        for (const p of g.prints) {
          const req = p.role === "dominant" ? 96 : 72;
          if (p.minimumReached) expect(p.shortSideCss375, `${n} ${r} ${p.mediaIndex}`).toBeGreaterThanOrEqual(req - 1e-6);
          else {
            unreached.add(`${r}:${p.witnessSlot}:${p.shortSideCss375.toFixed(1)}`);
            expect(p.scale).toBe(1.06);
          }
          expect(p.scale).toBeGreaterThanOrEqual(0.92);
        }
        expect(g.prints.filter((p) => p.role === "dominant").map((p) => p.witnessSlot)).toEqual(["P1"]);
      }
    expect([...unreached]).toEqual(["9x16:P3:69.3"]);
  });

  it("no reduction as the page grows: every group before the last is identical for 7, 9, 11, 20, 40 media", () => {
    for (const r of ["3x4", "natural-mix", "16x9"] as const) {
      const all = [7, 9, 11, 20, 40].map((n) => solveAlbumMobileGeometry(media(n, r, "aucune")));
      const key = (g: (typeof all)[number], k: number) => JSON.stringify(g.prints.filter((p) => p.groupIndex === k).map((p) => [p.slot.center, p.scale, p.layout.outer]));
      for (let i = 0; i < all.length; i++)
        for (let j = i + 1; j < all.length; j++) {
          const common = Math.min(all[i].groups.length, all[j].groups.length) - 1;
          for (let k = 0; k < common; k++) expect(key(all[i], k), `${r} ${all[i].count}/${all[j].count} g${k}`).toBe(key(all[j], k));
        }
    }
  });

  it("proportional at 390 / 430: the same source-px composition, s = W / 1024, never a function of the count", () => {
    const m = media(20, "natural-mix", "aucune");
    const geo = solveAlbumMobileGeometry(m);
    const at = (W: number) => layoutAlbumMobile(m, null, W, geo);
    const [a, b, c] = [375, 390, 430].map(at);
    expect([a.scale, b.scale, c.scale]).toEqual([375 / 1024, 390 / 1024, 430 / 1024]);
    for (const l of [b, c]) expect(l.prints.map((p) => [p.slot.center, p.drawn.outer])).toEqual(a.prints.map((p) => [p.slot.center, p.drawn.outer]));
    // The dominant / secondary minima follow s: 96 / 72 at 375 become ×W/375.
    const dom = a.prints[0];
    expect(Math.min(dom.layout.outer.width, dom.layout.outer.height) * c.scale).toBeCloseTo(dom.shortSideCss375 * (430 / 375), 9);
  });

  it("deterministic: two cold computations are byte-identical", () => {
    const m = media(40, "natural-mix", "deux-lignes");
    expect(albumMobileSnapshot(layoutAlbumMobile(m, fake, 390))).toBe(albumMobileSnapshot(layoutAlbumMobile(m, fake, 390)));
  });
});

describe("captions (V1.1): 11 / 13 px, band 14 → 22 → 34 px grown downward, window unchanged", () => {
  it("band heights per line count; font 11 CSS px; ≤ 2 lines; photo window and paper top identical with and without caption", () => {
    for (const W of [375, 390, 430])
      for (const c of ALBUM_MOBILE_CAPTION_SETS) {
        const m = media(11, "natural-mix", c);
        const l = layoutAlbumMobile(m, fake, W);
        const bare = layoutAlbumMobile(m, null, W);
        const s = W / 1024;
        expect(l.captionFontPx * s).toBeCloseTo(CAP.fontSizeCssPx, 9);
        l.prints.forEach((p, i) => {
          const thin = p.layout.band.height * s;
          expect(thin).toBeCloseTo((14 * W) / 375, 9);
          const want = p.captionLines === 0 ? thin : Math.max(thin, p.captionLines === 1 ? 22 : 34);
          expect(p.bandCss, `${W} ${c} ${i}`).toBeCloseTo(want, 9);
          expect(p.drawn.window).toEqual(bare.prints[i].drawn.window);
          expect(p.drawn.photo).toEqual(bare.prints[i].drawn.photo);
          expect([p.drawn.outer.x, p.drawn.outer.y, p.drawn.outer.width]).toEqual([bare.prints[i].drawn.outer.x, bare.prints[i].drawn.outer.y, bare.prints[i].drawn.outer.width]);
          expect(p.caption?.lines.length ?? 0).toBeLessThanOrEqual(2);
          if (m[i].caption) expect([...m[i].caption!].length).toBeLessThanOrEqual(32);
        });
        if (c === "aucune") expect(l.prints.every((p) => p.captionLines === 0)).toBe(true);
        if (c === "deux-lignes") expect(l.prints.some((p) => p.captionLines === 2)).toBe(true);
      }
  });

  it("captions never move a print nor stop the Album: the same geometry with every caption set", () => {
    const base = JSON.stringify(solveAlbumMobileGeometry(media(20, "3x4", "aucune")).prints.map((p) => [p.slot, p.layout]));
    for (const c of ALBUM_MOBILE_CAPTION_SETS) expect(JSON.stringify(solveAlbumMobileGeometry(media(20, "3x4", c)).prints.map((p) => [p.slot, p.layout]))).toBe(base);
  });

  it("the QA caption texts are natural case, exactly 12 / 24 / 32 characters", () => {
    for (let i = 0; i < 8; i++) {
      for (const [set, len] of [
        ["12", 12],
        ["24", 24],
        ["32", 32],
      ] as const)
        expect([...albumMobileFixture(8, "1x1", set)[i].caption!].length).toBe(len);
      for (const set of ["une-ligne", "deux-lignes"] as const) {
        const t = albumMobileFixture(8, "1x1", set)[i].caption!;
        expect(t).not.toBe(t.toUpperCase());
        expect([...t].length).toBeLessThanOrEqual(32);
      }
    }
  });
});

describe("page end and materials", () => {
  it("height = the lowest real paper edge (bands included, shadows excluded) + 164; TOP once, BODY tiles with 112 then 64 crossfades", () => {
    const l7 = layoutAlbumMobile(media(7, "witness", "aucune"), null, 390);
    expect(l7.height - l7.paperBottom).toBe(MAT.endBreathingRefPx);
    expect(l7.materials).toEqual([{ asset: "top", y: 0, height: 1536, fadeIn: 0 }]);
    const l40 = layoutAlbumMobile(media(40, "9x16", "deux-lignes"), fake, 375);
    expect(l40.paperBottom).toBeCloseTo(Math.max(...l40.prints.flatMap((p) => p.drawnOuter.map((q) => q.y))), 9);
    const m = l40.materials;
    expect(m[0]).toEqual({ asset: "top", y: 0, height: 1536, fadeIn: 0 });
    expect(m[1]).toEqual({ asset: "body", y: 1536 - 112, height: 1536, fadeIn: 112 });
    for (let i = 2; i < m.length; i++) expect(m[i]).toEqual({ asset: "body", y: m[i - 1].y + 1536 - 64, height: 1536, fadeIn: 64 });
    expect(m[m.length - 1].y + 1536).toBeGreaterThanOrEqual(l40.height);
    expect(m[m.length - 2].y + 1536).toBeLessThan(l40.height);
    expect(verifyAlbumMobileMaterials(m, l40.height)).toEqual([]);
  });

  it("a hard seam (no crossfade), a second TOP or an uncovered page bottom is VISIBLE_MATERIAL_SEAM", () => {
    expect(verifyAlbumMobileMaterials(albumMobileMaterialPlan(4000, { topBody: 0, bodyBody: 64 }), 4000).map((f) => f.stop)).toContain("VISIBLE_MATERIAL_SEAM");
    const plan = albumMobileMaterialPlan(4000);
    expect(verifyAlbumMobileMaterials([...plan, { asset: "top", y: 3000, height: 1536, fadeIn: 64 }], 4000).length).toBeGreaterThan(0);
    expect(verifyAlbumMobileMaterials(plan.slice(0, -1), 4000).length).toBeGreaterThan(0);
  });
});

describe("STOP conditions", () => {
  it("the whole engine matrix (7 / 8 / 11 / 20 / 40 × 7 ratio sets × 6 caption sets, 375 / 430) raises no STOP", { timeout: 600000 }, () => {
    const found: string[] = [];
    for (const W of [375, 430])
      for (const n of ALBUM_MOBILE_COUNTS)
        for (const r of ALBUM_MOBILE_RATIO_SETS) {
          const geo = solveAlbumMobileGeometry(media(n, r, "aucune"));
          for (const c of ALBUM_MOBILE_CAPTION_SETS) {
            const m = media(n, r, c);
            const l = layoutAlbumMobile(m, fake, W, geo);
            for (const f of verifyAlbumMobile({ media: m, layout: l, reference: geo })) found.push(`${W} ${n} ${r} ${c} ${f.stop} ${f.detail}`);
            const acc = albumMobileAccess(l.prints);
            expect(Math.min(...acc.map((a) => a.hitSideCss375))).toBeGreaterThanOrEqual(44);
          }
        }
    expect(found).toEqual([]);
  });

  it("every negative control raises its contractual STOP", () => {
    for (const [n, r] of [
      [7, "witness"],
      [20, "natural-mix"],
      [40, "9x16"],
    ] as const) {
      const m = media(n, r, "32");
      const res = albumMobileNegativeControls(m, layoutAlbumMobile(m, fake, 390));
      expect(res.map((x) => [x.injection, x.expected, x.pass])).toEqual([
        ["permutation média", "MEDIA_ORDER_CHANGED", true],
        ["crop cover", "DESTRUCTIVE_CROP", true],
        ["scale global dépendant du nombre", "GLOBAL_SCALE_FROM_MEDIA_COUNT", true],
        ["singleton", "SINGLETON_GROUP", true],
        ["couture franche", "VISIBLE_MATERIAL_SEAM", true],
        ["z-rank inaccessible", "ITEM_INACCESSIBLE", true],
      ]);
    }
    expect([...A13_ALBUM_MOBILE_STOPS]).not.toContain("CAPTION_COLLISION_UNRESOLVED");
  });

  it("a Dark theme or a non-Mobile profile is THEME_OR_DESKTOP_GEOMETRY_MUTATION", () => {
    const m = media(7, "1x1", "aucune");
    const l = layoutAlbumMobile(m, null, 390);
    expect(verifyAlbumMobile({ media: m, layout: l, theme: "dark" }).map((f) => f.stop)).toContain("THEME_OR_DESKTOP_GEOMETRY_MUTATION");
  });
});

describe("authority and Desktop non-regression", () => {
  it("handoff id; the two runtime assets are the package's, byte for byte", () => {
    expect(A13_ALBUM_MOBILE_HANDOFF_ID).toBe("A13_FULL_ALBUM_MOBILE_LIGHT_FINAL_HANDOFF_V1_1");
    for (const a of [MAT.top, MAT.body]) {
      const bytes = readFileSync(path.join(ROOT, "public", a.src));
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(a.sha256);
      expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([1024, 1536]);
    }
  });

  it("the Desktop Album geometry is unchanged by the shared solver profiles (digest of 20 Albums computed on c8009aa)", { timeout: 600000 }, () => {
    const out: Record<string, string> = {};
    for (const n of [7, 10, 11, 20, 40])
      for (const r of ALBUM_RATIO_SETS) {
        clearAlbumSolveCache();
        out[`${n}|${r}`] = createHash("sha256").update(albumGeometrySnapshot(layoutAlbum(albumFixture(n, r, "none"), null))).digest("hex");
      }
    expect(createHash("sha256").update(JSON.stringify(out)).digest("hex")).toBe("2e41c713b1fa6c6bed3d71d1715abb5b34dfe76cedfc5c0ef302658d486f0387");
  });
});
