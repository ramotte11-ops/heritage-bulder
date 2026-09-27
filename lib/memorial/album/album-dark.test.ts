import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { A13_ALBUM_DARK_BACKGROUNDS, A13_ALBUM_DARK_MATERIAL } from "@/config/album-a13-dark-material";
import { A13_DARK_MATERIAL } from "@/config/gallery-a13-dark-material";
import { darkBackgroundRepeat, darkRuleLeaks, darkRules } from "@/lib/memorial/album/album-dark-guard";
import { firstDifference } from "@/lib/memorial/gallery/theme-parity";
import { albumGeometrySnapshot, clearAlbumSolveCache, layoutAlbum } from "@/lib/memorial/album/album-layout";
import { albumFixture } from "@/lib/memorial/album/album-pilot-fixtures";

const ROOT = path.resolve(__dirname, "../../..");
const read = (f: string) => readFileSync(path.join(ROOT, f), "utf8");

describe("A13 Album Dark V1 — material only", () => {
  it("print tokens are the Gallery Dark V1.1 tokens carried by DynamicPolaroid (same material, reused)", () => {
    expect(A13_ALBUM_DARK_MATERIAL.polaroid.paper).toEqual(A13_DARK_MATERIAL.polaroid.paper);
    expect(A13_ALBUM_DARK_MATERIAL.polaroid.shadow).toEqual(A13_DARK_MATERIAL.polaroid.shadow);
    expect({ ...A13_ALBUM_DARK_MATERIAL.polaroid.edge, innerStrokeWidth: null }).toEqual({ ...A13_DARK_MATERIAL.polaroid.edge, innerStrokeWidth: null });
    expect({ ...A13_ALBUM_DARK_MATERIAL.caption, geometry: null, arbitration: null }).toEqual({ ...A13_DARK_MATERIAL.caption, geometry: null, arbitration: null });
    expect(A13_ALBUM_DARK_MATERIAL.photo).toEqual(A13_DARK_MATERIAL.photo);
    expect({ ...A13_ALBUM_DARK_MATERIAL.focus, geometry: null }).toEqual({ ...A13_DARK_MATERIAL.focus, geometry: null });
  });

  it("the Album and DynamicPolaroid Dark rules set no geometric and no photo-processing property", () => {
    for (const f of ["components/memorial/album/AlbumMemoryTable.module.css", "components/memorial/gallery/DynamicPolaroid.module.css"]) {
      expect(darkRules(read(f)).length).toBeGreaterThan(0);
      expect(darkRuleLeaks(read(f))).toEqual([]);
    }
  });

  it("negative control: an injected geometric or photo token is caught", () => {
    expect(darkRuleLeaks(`[data-a13-theme="dark"] .print { padding: 3px; }`)[0]?.stop).toBe("DARK_TOKEN_GEOMETRY_LEAK_STOP");
    expect(darkRuleLeaks(`[data-a13-theme="dark"] .slot { transform: translateY(2px); }`)[0]?.stop).toBe("DARK_TOKEN_GEOMETRY_LEAK_STOP");
    expect(darkRuleLeaks(`[data-a13-theme="dark"] .print { z-index: 9; }`)[0]?.stop).toBe("DARK_TOKEN_GEOMETRY_LEAK_STOP");
    expect(darkRuleLeaks(`[data-a13-theme="dark"] .captionText { font-size: 30px; }`)[0]?.stop).toBe("DARK_TOKEN_GEOMETRY_LEAK_STOP");
    expect(darkRuleLeaks(`[data-a13-theme="dark"] .x { object-fit: cover; }`)[0]?.stop).toBe("DARK_TOKEN_GEOMETRY_LEAK_STOP");
    expect(darkRuleLeaks(`[data-a13-theme="dark"] .photo { filter: saturate(0.8); }`).map((l) => l.stop)).toContain("DARK_PHOTO_PROCESSING_STOP");
    expect(darkRuleLeaks(`[data-a13-theme="dark"] .print { opacity: 0.9; }`)[0]?.stop).toBe("DARK_PHOTO_PROCESSING_STOP");
  });

  it("paints the TOP once and repeats only the BODY (and catches a repeated TOP)", () => {
    expect(darkBackgroundRepeat(read("components/memorial/album/AlbumMemoryTable.module.css"))).toBe("PASS");
    expect(darkBackgroundRepeat(`[data-a13-theme="dark"] .body { background-image: var(--a13-dark-album-top), var(--a13-dark-album-body); background-repeat: repeat-y, repeat-y; }`)).toBe("DARK_BACKGROUND_REPEAT_STOP");
  });

  it("uses the Studio backgrounds byte for byte (1670 × 941 PNG)", () => {
    for (const a of [A13_ALBUM_DARK_BACKGROUNDS.top, A13_ALBUM_DARK_BACKGROUNDS.body]) {
      const buf = readFileSync(path.join(ROOT, "public", a.src));
      expect(createHash("sha256").update(buf).digest("hex")).toBe(a.sha256);
      expect(buf.readUInt32BE(16)).toBe(1670);
      expect(buf.readUInt32BE(20)).toBe(941);
    }
  });

  it("no Album geometry module reads a theme or a Dark token (DARK_SOLVER_FORK_STOP)", () => {
    for (const f of ["lib/memorial/album/album-layout.ts", "lib/memorial/album/album-group-solver.ts", "lib/memorial/album/album-partition.ts", "config/album-a13-grammars.ts", "config/album-a13-runtime-calibration-v1-1.ts", "config/album-a13-long-sequence-v1-2.ts", "config/album-a13-master-measurements.ts"]) {
      expect(read(f)).not.toMatch(/dark-material|theme-material|AlbumTheme|A13Theme|data-a13-theme|--a13-dark-/);
    }
  });

  it("negative control: one displaced slot breaks the geometry snapshot (THEME_GEOMETRY_PARITY_STOP)", () => {
    clearAlbumSolveCache();
    const m = albumFixture(20, "natural-mix", "none").map(({ mediaId, width, height, caption }) => ({ mediaId, width, height, caption }));
    const light = layoutAlbum(m, null);
    const dark = layoutAlbum(m, null);
    expect(firstDifference(JSON.parse(albumGeometrySnapshot(light)), JSON.parse(albumGeometrySnapshot(dark)))).toBeNull();
    const leaked = JSON.parse(albumGeometrySnapshot(dark));
    leaked.prints[7].slot.center.x += 1;
    expect(firstDifference(JSON.parse(albumGeometrySnapshot(light)), leaked)).toMatch(/^\$\.prints\.7\.slot\.center\.x/);
  }, 120000);
});
