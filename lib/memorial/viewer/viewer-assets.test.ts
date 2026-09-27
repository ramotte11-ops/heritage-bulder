import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { A13_VIEWER_ASSETS } from "@/config/viewer-a13-desktop-v2";

const ROOT = path.resolve(__dirname, "../../..");
const png = (src: string) => readFileSync(path.join(ROOT, "public", src));

describe("A13 Viewer Desktop V2 — material authorities", () => {
  it("uses the five Studio material assets byte for byte (SHA-256 of the GREEN package, no recolouring)", () => {
    const all = [A13_VIEWER_ASSETS.environment.light, A13_VIEWER_ASSETS.environment.dark, A13_VIEWER_ASSETS.paper.light, A13_VIEWER_ASSETS.paper.dark, A13_VIEWER_ASSETS.edgeMask];
    for (const a of all) {
      const buf = png(a.src);
      expect(createHash("sha256").update(buf).digest("hex"), a.packageAsset).toBe(a.sha256);
      const size = "size" in a ? a.size : 0;
      expect(buf.readUInt32BE(16)).toBe(size);
      expect(buf.readUInt32BE(20)).toBe(size);
    }
    // colour type: tiles RGB (2), mask RGBA (6)
    expect(png(A13_VIEWER_ASSETS.paper.dark.src)[25]).toBe(2);
    expect(png(A13_VIEWER_ASSETS.edgeMask.src)[25]).toBe(6);
  });

  it("the Viewer sheet never processes the photograph and draws no improvised texture", () => {
    const css = readFileSync(path.join(ROOT, "components/memorial/viewer/MemoryViewer.module.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const photo = /\.photo\s*\{([^}]*)\}/.exec(css)![1];
    expect(photo).toMatch(/object-fit:\s*contain/);
    expect(photo).toMatch(/filter:\s*none/);
    expect(photo).toMatch(/opacity:\s*1/);
    expect(photo).toMatch(/mix-blend-mode:\s*normal/);
    expect(css).not.toMatch(/data-a13-viewer-theme/);
    expect(css).not.toMatch(/gradient|feTurbulence|data:image/);
    expect(css).not.toMatch(/object-fit:\s*cover/);
  });
});
