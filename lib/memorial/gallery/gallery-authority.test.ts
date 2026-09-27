import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { A13_V2_1_TITLE, A13_V2_FIXTURES, type V2AssignmentId } from "@/config/gallery-a13-v2-manifests";
import type { CaptionMeasurer } from "@/lib/memorial/gallery/caption-layout";
import { maskFromRects } from "@/lib/memorial/gallery/title-glyph-mask";
import { fixtureSources, solveV2 } from "@/lib/memorial/gallery/gallery-v2";
import { buildG6FamilyState } from "@/lib/memorial/gallery/gallery-state";
import { runDesktopGallery } from "@/lib/memorial/gallery/gallery-desktop-runtime";
import { buildLegacyV11GalleryStateQa } from "@/lib/memorial/gallery/legacy/gallery-state-v1-1.legacy-qa";
import { A13_PILOT_MEDIA_POOL } from "@/lib/memorial/gallery/a13-pilot-fixtures";

/**
 * Dette D6 — ONE authority per Gallery state, guarded.
 *
 * - G2…G5: the V2 runtime (`solveV2`) is the only path a runtime module can
 *   reach; the superseded V1-manifest / V1.1-calibration builder lives in
 *   `lib/memorial/gallery/legacy/` and may only be imported by the listed
 *   historical QA harnesses and by tests.
 * - G6 exact / Signature 7+: `buildG6FamilyState` (closed V2.1), which
 *   refuses every other count.
 * The behavioural half fails if the functional entry point ever returns a
 * G2–G5 layout that is not the V2 one (the legacy layouts differ, checked).
 */

const ROOT = path.resolve(import.meta.dirname, "../../..");
const rel = (f: string) => path.relative(ROOT, f).split(path.sep).join("/");

function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const n of readdirSync(d)) {
      if (n === "node_modules" || n.startsWith(".")) continue;
      const p = path.join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(n)) out.push(p);
    }
  };
  for (const d of ["app", "components", "config", "lib"]) walk(path.join(ROOT, d));
  return out;
}

const isTest = (f: string) => /\.test\.tsx?$/.test(f);
const isLegacy = (f: string) => rel(f).startsWith("lib/memorial/gallery/legacy/");
const importSpecs = (src: string) => [...src.matchAll(/(?:import|export)\s[^;]*?from\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1] ?? m[2]);
const importsName = (src: string, name: string) => [...src.matchAll(/import\s*\{([^}]*)\}\s*from/g)].some((m) => m[1].split(",").map((s) => s.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0]).includes(name));

/** The historical QA harnesses allowed to show the superseded path. */
const LEGACY_QA_HARNESSES = [
  "app/pilot/a13-dynamic-polaroid/PilotQa.tsx",
  "app/pilot/a13-dynamic-polaroid/etats/StatesBoard.tsx",
  "app/pilot/a13-dynamic-polaroid/matrice/MatrixClient.tsx",
  "app/pilot/a13-dynamic-polaroid/g3-territoire/G3TerritoryClient.tsx",
];

function resolveImport(from: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? path.join(ROOT, spec.slice(2)) : spec.startsWith(".") ? path.resolve(path.dirname(from), spec) : null;
  if (!base) return null;
  for (const f of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) if (existsSync(f) && statSync(f).isFile()) return f;
  return null;
}

function importGraph(entries: string[]): string[] {
  const seen = new Set<string>();
  const todo = entries.map((e) => path.join(ROOT, e));
  while (todo.length) {
    const f = todo.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    for (const spec of importSpecs(readFileSync(f, "utf8"))) {
      const r = resolveImport(f, spec);
      if (r) todo.push(r);
    }
  }
  return [...seen];
}

describe("D6 — one runtime authority per Gallery state (import guard)", () => {
  const files = sourceFiles();

  it("the legacy G2–G5 builder and matrix are imported only by legacy/, the listed QA harnesses and tests", () => {
    const offenders = files.filter((f) => !isTest(f) && !isLegacy(f) && importSpecs(readFileSync(f, "utf8")).some((s) => s.includes("/gallery/legacy/"))).map(rel);
    expect(offenders.filter((f) => !LEGACY_QA_HARNESSES.includes(f))).toEqual([]);
  });

  it("the V1.1 calibration engine (`calibrateState`) is reachable only from legacy/ and tests", () => {
    const readers = files.filter((f) => !isTest(f) && importsName(readFileSync(f, "utf8"), "calibrateState")).map(rel);
    expect(readers.every((f) => f.startsWith("lib/memorial/gallery/legacy/"))).toBe(true);
    expect(readers.length).toBeGreaterThan(0);
  });

  it("the functional Desktop surface never reaches legacy/ nor `calibrateState`", () => {
    const graph = importGraph([
      "lib/memorial/gallery/gallery-desktop-runtime.ts",
      "components/memorial/gallery/A13DesktopGallery.tsx",
      "components/memorial/album/A13DesktopFullAlbum.tsx",
      "components/memorial/viewer/MemoryViewer.tsx",
      "app/pilot/a13-desktop/DesktopFlowClient.tsx",
      "lib/memorial/gallery/theme-parity.ts",
    ]);
    expect(graph.filter(isLegacy).map(rel)).toEqual([]);
    expect(graph.filter((f) => importsName(readFileSync(f, "utf8"), "calibrateState")).map(rel)).toEqual([]);
  });

  it("no runtime module exports the former ambiguous all-states builder", () => {
    const exporters = files.filter((f) => !isTest(f) && /export\s+function\s+buildGalleryState\b/.test(readFileSync(f, "utf8"))).map(rel);
    expect(exporters).toEqual([]);
  });
});

const fake: CaptionMeasurer = {
  measure: (t) => ({ width: t.length * 11.5, actualBoundingBoxLeft: 0, actualBoundingBoxRight: t.length * 11.5, actualBoundingBoxAscent: 20, actualBoundingBoxDescent: 8 }),
  fontAscent: 22,
  fontDescent: 8,
};
const R = A13_V2_1_TITLE;
const MASK = maskFromRects([
  { x0: R.headingInkReference.xMin - 3, y0: R.headingInkReference.yMin - 3, x1: R.headingInkReference.xMax + 2, y1: R.headingInkReference.yMax + 2 },
  { x0: R.microcopyInkReference.xMin - 3, y0: R.microcopyInkReference.yMin - 3, x1: R.microcopyInkReference.xMax + 2, y1: R.microcopyInkReference.yMax + 2 },
]);
const C32 = "MAMAN ET MAMIE, À MIMIZAN, 1966.";
const geo = (e: { slot: { slotId: string }; layout: unknown; caption: unknown }) => JSON.stringify([e.slot.slotId, e.layout, e.caption]);

describe("D6 — behaviour: G2–G5 are V2, G6 / 7+ unchanged", () => {
  it("G2…G5 through the functional entry point = solveV2, never the superseded V1.1 layout", { timeout: 240000 }, () => {
    const states = ["G2", "G3", "G4", "G5"] as const;
    const assignments = A13_V2_FIXTURES.assignments.map((a) => a.id as V2AssignmentId).slice(0, 3);
    const differsFromLegacy: Record<string, string[]> = { G2: [], G3: [], G4: [], G5: [] };
    for (const state of states)
      for (const assignment of assignments)
        for (const cap of [null, C32]) {
          const sources = fixtureSources(state, assignment);
          const run = runDesktopGallery(sources, () => cap, fake, MASK);
          const v2 = solveV2({ state, sources, captions: sources.map(() => cap), measurer: fake, titleMask: MASK });
          const tag = `${state}:${assignment}:${cap ? "32" : "none"}`;
          expect(run.stateId, tag).toBe(state);
          expect(run.status, tag).toBe(v2.status);
          expect(run.entries.map(geo), tag).toEqual(v2.slots.map(geo));
          const legacy = buildLegacyV11GalleryStateQa(sources, () => cap, fake)!;
          if (JSON.stringify(legacy.entries.map(geo)) !== JSON.stringify(run.entries.map(geo))) differsFromLegacy[state].push(tag);
        }
    // The guard is meaningful: in every state the superseded path produces
    // other layouts (it may coincide with V2 on a Master witness case).
    for (const state of states) expect(differsFromLegacy[state].length, state).toBeGreaterThan(0);
    expect(Object.values(differsFromLegacy).flat().length).toBeGreaterThanOrEqual(20);
  });

  it("G6 exact / Signature 7+ = the former composition, byte for byte (legacy builder = verbatim former code)", () => {
    const strip = <T extends { calibration?: unknown }>(e: T) => {
      const { calibration, ...rest } = e;
      void calibration;
      return rest;
    };
    for (const n of [6, 7, 8, 14])
      for (const mode of ["aucune", "une-ligne", "24", "32"] as const)
        for (const measurer of [fake, null]) {
          const media = Array.from({ length: n }, (_, i) => A13_PILOT_MEDIA_POOL[i % A13_PILOT_MEDIA_POOL.length]);
          const now = buildG6FamilyState(media, (m) => m.captions[mode], measurer);
          const before = buildLegacyV11GalleryStateQa(media, (m) => m.captions[mode], measurer)!;
          expect(JSON.stringify({ ...now, entries: now.entries })).toBe(JSON.stringify({ ...before, entries: before.entries.map(strip) }));
        }
  });

  it("the G6 builder refuses every G2–G5 count", () => {
    for (let n = 0; n <= 5; n++) expect(() => buildG6FamilyState(A13_PILOT_MEDIA_POOL.slice(0, n), () => null, null)).toThrow();
  });
});
