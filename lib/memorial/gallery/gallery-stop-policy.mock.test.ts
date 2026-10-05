import { beforeEach, describe, expect, it, vi } from "vitest";
import type { V2Result } from "@/lib/memorial/gallery/gallery-v2";

/**
 * Dette D7 — every V2 STOP code, and a solver exception, forced through a
 * controlled `solveV2` (mocked HERE only — the real solver is untouched).
 * The legacy builder and the V1.1 calibration engine are spied: a STOP must
 * never reach them.
 */

const control: { mode: "pass" | V2Result["status"] | "throw" } = { mode: "pass" };

vi.mock("@/lib/memorial/gallery/gallery-v2", async (orig) => {
  const real = await orig<typeof import("@/lib/memorial/gallery/gallery-v2")>();
  return {
    ...real,
    solveV2: vi.fn((input: Parameters<typeof real.solveV2>[0]) => {
      if (control.mode === "throw") throw new Error("forced solver failure");
      if (control.mode === "pass") return real.solveV2(input);
      return { state: input.state, status: control.mode, slots: [], masterCost: NaN, relations: null, signals: [], jointCandidates: 0, stop: { rule: "forced", detail: `forced ${control.mode}` } } satisfies V2Result;
    }),
  };
});
const legacySpy = vi.fn();
vi.mock("@/lib/memorial/gallery/legacy/gallery-state-v1-1.legacy-qa", () => ({
  buildLegacyV11GalleryStateQa: (...a: unknown[]) => {
    legacySpy(...a);
    throw new Error("LEGACY REACHED");
  },
}));
const calibrateSpy = vi.fn();
vi.mock("@/lib/memorial/gallery/manifest-calibration", async (orig) => {
  const real = await orig<typeof import("@/lib/memorial/gallery/manifest-calibration")>();
  return {
    ...real,
    calibrateState: (...a: Parameters<typeof real.calibrateState>) => {
      calibrateSpy(...a);
      return real.calibrateState(...a);
    },
  };
});

const { runDesktopGallery } = await import("@/lib/memorial/gallery/gallery-desktop-runtime");
const { maskFromRects } = await import("@/lib/memorial/gallery/title-glyph-mask");
const { A13_PILOT_MEDIA_POOL } = await import("@/lib/memorial/gallery/a13-pilot-fixtures");

const MASK = maskFromRects([{ x0: 657, y0: 111, x1: 1014, y1: 144 }]);
const family = (n: number) => Array.from({ length: n }, (_, i) => A13_PILOT_MEDIA_POOL[i % A13_PILOT_MEDIA_POOL.length]);

beforeEach(() => {
  legacySpy.mockClear();
  calibrateSpy.mockClear();
});

describe("D7 — forced STOPs (controlled solver)", () => {
  const STOPS = ["MANIFEST_REJECTS_OWN_MASTER_STOP", "GALLERY_ITEM_INACCESSIBLE_STOP", "TITLE_COLLISION_STOP", "NO_CANDIDATE_WITHIN_TERRITORIES_STOP"] as const;

  it("each V2 STOP code → unresolved with that code; legacy and V1.1 calibration never reached", () => {
    for (const code of STOPS)
      for (const n of [2, 3, 4, 5]) {
        control.mode = code;
        const run = runDesktopGallery(family(n), () => null, null, MASK);
        expect(run).toMatchObject({ outcome: "unresolved", status: code, entries: [], hasCta: false, anomaly: { code, rule: "forced", detail: `forced ${code}` } });
      }
    expect(legacySpy).not.toHaveBeenCalled();
    expect(calibrateSpy).not.toHaveBeenCalled();
  });

  it("a solver exception → unresolved V2_SOLVER_EXCEPTION, no throw to the caller, no fallback", () => {
    control.mode = "throw";
    for (const n of [2, 3, 4, 5]) {
      let run: ReturnType<typeof runDesktopGallery> | null = null;
      expect(() => (run = runDesktopGallery(family(n), () => null, null, MASK))).not.toThrow();
      expect(run!).toMatchObject({ outcome: "unresolved", status: "V2_SOLVER_EXCEPTION", entries: [], hasCta: false, anomaly: { code: "V2_SOLVER_EXCEPTION", rule: "exception", detail: "forced solver failure" } });
    }
    expect(legacySpy).not.toHaveBeenCalled();
    expect(calibrateSpy).not.toHaveBeenCalled();
  });

  it("the same controlled solver in pass mode resolves (the mock is transparent)", () => {
    control.mode = "pass";
    const run = runDesktopGallery(family(3), () => null, null, MASK);
    expect(run.outcome).toBe("resolved");
    expect(run.entries).toHaveLength(3);
    expect(legacySpy).not.toHaveBeenCalled();
  });
});
