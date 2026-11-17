import { describe, expect, it } from "vitest";
import { A13_ALBUM_GRAMMARS } from "@/config/album-a13-grammars";
import {
  DESKTOP_ALBUM_SOLVER_PROFILE,
  GroupSession,
  shapeAt,
  witnessMediaRatio,
  type AlbumSolverProfile,
} from "@/lib/memorial/album/album-group-solver";
import type { Point } from "@/lib/memorial/gallery/dynamic-polaroid-qa";

/**
 * M4 — extension du solveur local A13 : fabrique de formes et zones
 * interdites. Ces tests prouvent que l'extension est NEUTRE quand elle n'est
 * pas employée (le Polaroid A13 reste le défaut) et EFFECTIVE quand elle l'est.
 * La non-régression globale est figée par `a13-default-path-fingerprint.test.ts`.
 */

const grammar = A13_ALBUM_GRAMMARS.A;
const sources = grammar.slots.map((s) => ({ width: Math.round(witnessMediaRatio(s) * 1000), height: 1000 }));
const run = (profile?: AlbumSolverProfile) => {
  const s = new GroupSession(grammar, sources, true, profile ? { profile } : {});
  return { s, c: s.candidate(0) };
};
const snap = (x: ReturnType<typeof run>) => JSON.stringify({ stop: x.s.structuralStop, c: x.c, f: x.s.fallback(), evaluated: x.s.evaluated, minima: x.s.minima });

describe("M4 — solveur A13 : chemin par défaut inchangé", () => {
  it("sans profil = profil Desktop explicite", () => {
    expect(snap(run())).toBe(snap(run(DESKTOP_ALBUM_SOLVER_PROFILE)));
  });

  it("une fabrique qui rend le Polaroid A13 donne exactement le chemin par défaut", () => {
    const explicit: AlbumSolverProfile = { ...DESKTOP_ALBUM_SOLVER_PROFILE, shapeFor: (v, src, s) => shapeAt(v, src, s, DESKTOP_ALBUM_SOLVER_PROFILE.paper) };
    expect(snap(run(explicit))).toBe(snap(run()));
  });

  it("une liste de zones interdites vide ne change rien", () => {
    expect(snap(run({ ...DESKTOP_ALBUM_SOLVER_PROFILE, forbiddenZones: [] }))).toBe(snap(run()));
  });
});

describe("M4 — solveur A13 : extensions effectives", () => {
  it("la fabrique est appelée pour chaque emplacement, avec son index", () => {
    const seen = new Set<number>();
    run({ ...DESKTOP_ALBUM_SOLVER_PROFILE, shapeFor: (v, src, s, i) => (seen.add(i), shapeAt(v, src, s)) });
    expect([...seen].sort()).toEqual(grammar.slots.map((_, i) => i));
  });

  it("aucun papier n'entre dans une zone interdite ; une zone qui couvre tout le territoire est un STOP nommé", () => {
    const base = run().c!;
    const p0 = base.placements[0].outer;
    const xs = p0.map((q) => q.x);
    const ys = p0.map((q) => q.y);
    // Zone qui touche le bord droit du tirage 0 à sa position de Master.
    const x0 = Math.max(...xs) - 20;
    const zone: Point[] = [
      { x: x0, y: Math.min(...ys) - 500 },
      { x: x0 + 2000, y: Math.min(...ys) - 500 },
      { x: x0 + 2000, y: Math.max(...ys) + 500 },
      { x: x0, y: Math.max(...ys) + 500 },
    ];
    const moved = run({ ...DESKTOP_ALBUM_SOLVER_PROFILE, forbiddenZones: [zone] });
    // La zone barre aussi d'autres tirages : soit une solution hors zone, soit un STOP nommé.
    if (moved.c) for (const pl of moved.c.placements) for (const q of pl.outer) expect(q.x).toBeLessThanOrEqual(x0 + 1e-6);
    else expect(moved.s.structuralStop ?? "").toMatch(/zone interdite/);
    const everywhere: Point[] = [
      { x: -1e5, y: -1e5 },
      { x: 1e5, y: -1e5 },
      { x: 1e5, y: 1e5 },
      { x: -1e5, y: 1e5 },
    ];
    const blocked = run({ ...DESKTOP_ALBUM_SOLVER_PROFILE, forbiddenZones: [everywhere] });
    expect(blocked.c).toBeNull();
    expect(blocked.s.structuralStop).toMatch(/zone interdite \d+/);
  }, 60_000);
});
