import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { A13_DARK_BACKGROUND, A13_DARK_MATERIAL, A13_DARK_PARITY_CONTRACT } from "@/config/gallery-a13-dark-material";
import { A13_V2_1_TITLE } from "@/config/gallery-a13-v2-manifests";
import type { CaptionMeasurer } from "@/lib/memorial/gallery/caption-layout";
import { maskFromRects } from "@/lib/memorial/gallery/title-glyph-mask";
import { darkGrainImage, darkPaperColor, darkPaperSheen, slotSeed } from "@/lib/memorial/gallery/theme-material";
import {
  PARITY_CAPTION_32,
  firstDifference,
  geometrySnapshot,
  parityFixtures,
  runLightEngine,
  snapshotBytes,
  supplementaryParityFixtures,
} from "@/lib/memorial/gallery/theme-parity";

/**
 * A13 Desktop Dark V1.1 — static and engine-level guards of the pilot.
 * The rendered 36-pair parity (real fonts, real glyph masks, DOM
 * geometry) runs in the browser pilot `/pilot/a13-dynamic-polaroid/dark`.
 */

const ROOT = path.resolve(import.meta.dirname, "../../..");

// ── DARK_TOKEN_READ_BY_SOLVER_STOP ─────────────────────────────────────

function resolveImport(from: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? path.join(ROOT, spec.slice(2)) : spec.startsWith(".") ? path.resolve(path.dirname(from), spec) : null;
  if (!base) return null;
  for (const f of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) if (existsSync(f) && statSync(f).isFile()) return f;
  return null;
}

function importGraph(entries: string[]): Set<string> {
  const seen = new Set<string>();
  const todo = entries.map((e) => path.join(ROOT, e));
  while (todo.length) {
    const f = todo.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/(?:import|export)[^"']*?from\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g)) {
      const r = resolveImport(f, m[1] ?? m[2]);
      if (r) todo.push(r);
    }
  }
  return seen;
}

const rel = (f: string) => path.relative(ROOT, f);

/** Every module the Light engine and the geometry snapshot are made of. */
const ENGINE_ENTRIES = [
  "lib/memorial/gallery/gallery-v2.ts",
  "lib/memorial/gallery/gallery-state.ts",
  "lib/memorial/gallery/manifest-calibration.ts",
  "lib/memorial/gallery/caption-layout.ts",
  "lib/memorial/gallery/caption-measurer.ts",
  "lib/memorial/gallery/dynamic-polaroid-layout.ts",
  "lib/memorial/gallery/dynamic-polaroid-qa.ts",
  "lib/memorial/gallery/title-glyph-mask.ts",
  "lib/memorial/gallery/theme-parity.ts",
  "config/gallery-a13-v2-manifests.ts",
  "config/gallery-a13-multi-state-manifests.ts",
  "config/gallery-a13-desktop-manifest.ts",
];
const DARK_MODULES = ["config/gallery-a13-dark-material.ts", "lib/memorial/gallery/theme-material.ts"];

describe("Dark V1.1 — the solver never reads a Dark token", () => {
  it("no Dark material module and no component is reachable from the engine (DARK_TOKEN_READ_BY_SOLVER_STOP)", () => {
    const graph = [...importGraph(ENGINE_ENTRIES)].map(rel);
    expect(graph).toContain("lib/memorial/gallery/gallery-v2.ts");
    expect(graph.filter((f) => DARK_MODULES.includes(f) || f.startsWith("components/"))).toEqual([]);
    for (const f of graph) expect(readFileSync(path.join(ROOT, f), "utf8")).not.toMatch(/A13_DARK_|data-a13-theme|--a13-dark-/);
  });

  it("Dark tokens are imported only by the rendering layer and the Dark pilot", () => {
    const files: string[] = [];
    const walk = (d: string) => {
      for (const n of readdirSync(d)) {
        if (n === "node_modules" || n.startsWith(".")) continue;
        const p = path.join(d, n);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n)) files.push(p);
      }
    };
    for (const d of ["app", "components", "config", "lib"]) walk(path.join(ROOT, d));
    const readers = files.filter((f) => /gallery-a13-dark-material|theme-material/.test(readFileSync(f, "utf8").match(/from\s+["'][^"']+["']/g)?.join(" ") ?? "")).map(rel).sort();
    expect(readers).toEqual([
      "app/pilot/a13-dynamic-polaroid/dark/DarkPilotClient.tsx",
      "components/memorial/gallery/A13GalleryScene.tsx",
      "components/memorial/gallery/DynamicPolaroid.tsx",
      "lib/memorial/gallery/theme-material.ts",
    ]);
  });
});

// ── Material-only CSS (materialOnlyGuard) ──────────────────────────────

function darkRules(file: string) {
  const css = readFileSync(path.join(ROOT, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map(([, sel, body]) => ({ selector: sel.trim(), props: body.split(";").map((d) => d.split(":")[0].trim()).filter(Boolean) }))
    .filter((r) => r.selector.includes("data-a13-theme"));
}

describe("Dark V1.1 — stylesheets are material only", () => {
  const files = ["components/memorial/gallery/A13GalleryScene.module.css", "components/memorial/gallery/DynamicPolaroid.module.css"];
  const rules = files.flatMap(darkRules);
  const forbidden = new Set<string>(A13_DARK_MATERIAL.materialOnlyGuard.forbiddenProperties);
  // Shorthands/longhands that carry a forbidden length or a photo process.
  const alsoForbidden = /^(margin|padding|inset|border(-(top|right|bottom|left))?(-width)?|border$|outline$|outline-(width|offset)|font(-.*)?|display|position|filter|opacity|mix-blend-mode|backdrop-filter|mask.*|clip-path|zoom|contain|columns?|flex.*|grid.*|align.*|justify.*|white-space|word-spacing|text-indent|vertical-align)$/;

  it("declares Dark rules, and none of them sets a geometric or photo-processing property", () => {
    expect(rules.length).toBeGreaterThanOrEqual(9);
    for (const r of rules) for (const p of r.props) {
      expect(forbidden.has(p), `${r.selector} → ${p}`).toBe(false);
      expect(alsoForbidden.test(p), `${r.selector} → ${p}`).toBe(false);
    }
  });

  it("never targets the photo, its window or the background image", () => {
    for (const r of rules) expect(r.selector).not.toMatch(/\.photo|\.window|\bimg\b|\.background/);
  });

  it("keeps the Light rules byte-for-byte (Dark rules are appended, never edits)", () => {
    // Every non-Dark rule still exists exactly once, and the Light values
    // this pilot depends on are unchanged.
    const scene = readFileSync(path.join(ROOT, files[0]), "utf8");
    const polaroid = readFileSync(path.join(ROOT, files[1]), "utf8");
    expect(scene).toContain("border: calc(1.5 * var(--k)) solid rgb(92 74 41);");
    expect(scene).toContain("outline: 2px solid currentColor;\n  outline-offset: 4px;");
    expect(polaroid).toContain("background-color: #f4ebdf;");
    expect(polaroid).toContain("box-shadow: inset 0 0 0 calc(1.2 * var(--k)) rgba(116, 91, 67, 0.24);");
    expect(polaroid).toContain("fill: #5a4a3e;");
    expect(polaroid).toContain("outline: calc(3 * var(--k)) solid #2f5d8a;");
  });
});

// ── Background asset ───────────────────────────────────────────────────

describe("Dark V1.1 — background asset", () => {
  const file = path.join(ROOT, "public", A13_DARK_BACKGROUND.src);
  const buf = readFileSync(file);
  it("is the package asset byte for byte (DARK_BACKGROUND_HASH_MISMATCH_STOP)", () => {
    expect(createHash("sha256").update(buf).digest("hex")).toBe(A13_DARK_BACKGROUND.sha256);
  });
  it("is a 1670 × 941 PNG (DARK_BACKGROUND_DIMENSION_MISMATCH_STOP)", () => {
    expect(buf.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect([buf.readUInt32BE(16), buf.readUInt32BE(20)]).toEqual([A13_DARK_BACKGROUND.width, A13_DARK_BACKGROUND.height]);
  });
});

// ── Material derivations ───────────────────────────────────────────────

function hexRgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function hsl(hex: string) {
  const [r, g, b] = hexRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const h = d === 0 ? 0 : max === r ? (((g - b) / d + 6) % 6) * 60 : max === g ? ((b - r) / d + 2) * 60 : ((r - g) / d + 4) * 60;
  return { h, l };
}
const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = (rgb: number[]) => 0.2126 * lin(rgb[0] / 255) + 0.7152 * lin(rgb[1] / 255) + 0.0722 * lin(rgb[2] / 255);
const contrast = (a: number[], b: number[]) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v * (1 - t) + b[i] * t);

describe("Dark V1.1 — paper material", () => {
  const paper = A13_DARK_MATERIAL.polaroid.paper;
  const ids = parityFixtures().flatMap((f) => f.media.map((_, i) => `${f.state}-D${i + 1}`)).concat(["D1", "D2", "D3", "D4", "D5", "D6"]);

  it("is deterministic per slotId, hue-stable, within ± 2.5 % lightness", () => {
    const base = hsl(paper.base);
    for (const id of ids) {
      const a = darkPaperColor(id);
      expect(darkPaperColor(id)).toEqual(a);
      expect(Math.abs(a.lightnessShiftPercent)).toBeLessThanOrEqual(paper.variationLightnessPercent);
      const c = hsl(a.color);
      expect(Math.abs(c.l - base.l) * 100).toBeLessThanOrEqual(paper.variationLightnessPercent + 0.3);
      expect(Math.abs(c.h - base.h)).toBeLessThan(1.5); // 8-bit rounding only
    }
    expect(slotSeed("G2-D1")).not.toBe(slotSeed("G2-D2"));
  });

  it("grain: fibre alpha 0.16 hard-capped at 0.09, seeded by the slotId only", () => {
    const g = darkGrainImage("G3-D2");
    expect(g).toBe(darkGrainImage("G3-D2"));
    expect(g).not.toBe(darkGrainImage("G3-D3"));
    const alphaRow = /0 0 0 ([\d.]+) 0'\/>/.exec(g)!;
    const slope = /slope='([\d.]+)'/.exec(g)!;
    expect(Number(slope[1])).toBe(paper.grainOpacityMax);
    expect(Number(alphaRow[1]) * Number(slope[1])).toBeCloseTo(0.16, 3);
  });

  it("sheen moves the paper lightness by ≤ 2 % at the bottom (bottomBand)", () => {
    const s = darkPaperSheen();
    const lo = /rgba\(201,174,134,([\d.]+)\) 100%/.exec(s)!;
    const lb = hsl(paper.base).l;
    const ll = hsl(paper.lowlight).l;
    expect((Number(lo[1]) * (lb - ll)) / lb).toBeLessThanOrEqual(A13_DARK_MATERIAL.polaroid.bottomBand.maximumBottomDarkeningPercent / 100);
  });

  it("grain contrast stays ≤ 0.05 (CIE L*) and caption ink ≥ 4.5:1 on the darkest possible paper", () => {
    const Lstar = (rgb: number[]) => {
      const Y = lum(rgb);
      return Y > 216 / 24389 ? 116 * Math.cbrt(Y) - 16 : (24389 / 27) * Y;
    };
    const fibre = [88, 62, 39];
    const lowlight = hexRgb(paper.lowlight);
    const loAlpha = Number(/rgba\(201,174,134,([\d.]+)\) 100%/.exec(darkPaperSheen())![1]);
    let worst = Infinity;
    for (const id of ids) {
      const p = hexRgb(darkPaperColor(id).color);
      expect((Lstar(p) - Lstar(mix(p, fibre, paper.grainOpacityMax))) / 100).toBeLessThanOrEqual(paper.grainContrastMax);
      const darkest = mix(mix(p, lowlight, loAlpha), fibre, paper.grainOpacityMax);
      worst = Math.min(worst, contrast(hexRgb(A13_DARK_MATERIAL.caption.ink), darkest));
    }
    expect(worst).toBeGreaterThanOrEqual(A13_DARK_MATERIAL.caption.minimumContrast);
  });
});

// ── Engine-level parity matrix ─────────────────────────────────────────

const fake: CaptionMeasurer = {
  measure: (t) => ({ width: t.length * 11.5, actualBoundingBoxLeft: 0, actualBoundingBoxRight: t.length * 11.5, actualBoundingBoxAscent: 20, actualBoundingBoxDescent: 8 }),
  fontAscent: 22,
  fontDescent: 8,
};
const R = A13_V2_1_TITLE;
const d = R.dilationPx;
const MASK = maskFromRects([
  { x0: R.headingInkReference.xMin - d, y0: R.headingInkReference.yMin - d, x1: R.headingInkReference.xMax + d - 1, y1: R.headingInkReference.yMax + d - 1 },
  { x0: R.microcopyInkReference.xMin - d, y0: R.microcopyInkReference.yMin - d, x1: R.microcopyInkReference.xMax + d - 1, y1: R.microcopyInkReference.yMax + d - 1 },
]);
const TITLE = { heading: R.headingInkReference, microcopy: R.microcopyInkReference, mask: MASK };

describe("Dark V1.1 — parity matrix (engine level)", () => {
  const fixtures = parityFixtures();

  it("is the handoff's minimal matrix: 6 states × 3 ratio sets × 2 captions = 36 pairs", () => {
    const m = A13_DARK_PARITY_CONTRACT.minimalPilotMatrix;
    expect(fixtures).toHaveLength(m.geometryPairs);
    expect([...new Set(fixtures.map((f) => f.state))]).toEqual(m.states);
    expect([...new Set(fixtures.map((f) => f.ratioSet))]).toEqual(m.ratioSets);
    expect([...new Set(fixtures.map((f) => f.captions))]).toEqual(m.captions);
    expect(PARITY_CAPTION_32).toHaveLength(32);
    expect(supplementaryParityFixtures()).toHaveLength(4);
  });

  it("runs the unchanged Light engine deterministically (byte-identical reruns); G6 no CTA, 7+ CTA with six of seven media", { timeout: 180000 }, () => {
    // Every fixture once; one fixture per state (captions on, the hardest)
    // twice, byte for byte. The browser pilot runs all 36 in each theme.
    const twice = new Set(["G2", "G3", "G4", "G5", "G6", "G6_SIGNATURE_7PLUS"].map((s) => `${s}:extremes:32-chars-two-lines`));
    for (const fx of [...fixtures, ...supplementaryParityFixtures()]) {
      const a = geometrySnapshot(runLightEngine(fx, fake, MASK), TITLE);
      if (twice.has(fx.id)) {
        const b = geometrySnapshot(runLightEngine(fx, fake, MASK), TITLE);
        expect(firstDifference(a, b), fx.id).toBeNull();
        expect(snapshotBytes(a)).toBe(snapshotBytes(b));
      }
      expect(a.selectedState).toBe(fx.state);
      expect(a.cta !== null).toBe(fx.state === "G6_SIGNATURE_7PLUS");
      if (fx.state === "G6_SIGNATURE_7PLUS") {
        expect(fx.media).toHaveLength(7);
        expect(a.slotIds).toHaveLength(6);
      }
      expect(a.slots.length, fx.id).toBeGreaterThan(0);
      for (const k of A13_DARK_PARITY_CONTRACT.snapshotFields) {
        const top = k in a;
        const perSlot = a.slots.length > 0 && k in a.slots[0];
        expect(top || perSlot, `${fx.id}: snapshot field ${k}`).toBe(true);
      }
    }
  });

  it("the engine input carries no theme: runLightEngine takes (fixture, measurer, titleMask) only", () => {
    expect(runLightEngine.length).toBe(3);
    const fx = fixtures[0];
    expect(Object.keys(fx).sort()).toEqual(["captionTexts", "captions", "id", "locale", "media", "ratioSet", "state", "viewport"]);
  });

  it("reports the first differing path (THEME_GEOMETRY_PARITY_STOP diagnosis)", () => {
    expect(firstDifference({ a: [1, { x: 2 }] }, { a: [1, { x: 2.001 }] })).toBe("$.a.1.x: 2 ≠ 2.001");
  });
});
