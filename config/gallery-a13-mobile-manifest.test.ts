import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  A13_MOBILE_BACKGROUND,
  A13_MOBILE_CAPTION,
  A13_MOBILE_CTA,
  A13_MOBILE_PAPER,
  A13_MOBILE_RELATIONS,
  A13_MOBILE_STATE_SLOTS,
  A13_MOBILE_STATES,
  A13_MOBILE_TITLE,
  a13MobileProfileActive,
  resolveCssClamp,
} from "@/config/gallery-a13-mobile-manifest";
import { GALLERY_HERITAGE_TEXTS } from "@/lib/memorial/assembly/renderer-adapters";
import { A13_MOBILE_PILOT_TITLE } from "@/lib/memorial/gallery/a13-mobile-pilot-fixtures";

const ROOT = path.resolve(import.meta.dirname, "..");

describe("A13 Mobile Light — Handoff V1.4 authority", () => {
  it("the runtime background is the package's common asset, byte for byte (BACKGROUND_DIMENSION_OR_HASH_MISMATCH guard)", () => {
    const bytes = readFileSync(path.join(ROOT, "public", A13_MOBILE_BACKGROUND.src));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(A13_MOBILE_BACKGROUND.sha256);
    // PNG IHDR: width and height, big-endian, at bytes 16–23.
    expect(bytes.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([A13_MOBILE_BACKGROUND.width, A13_MOBILE_BACKGROUND.height]);
    expect([A13_MOBILE_BACKGROUND.width, A13_MOBILE_BACKGROUND.height]).toEqual([941, 1672]);
  });

  it("G6-D5 is the Studio arbitration (642,1212 · 350 × 300 · 17°), in front of D6; Signature 7+ IS g6.json", () => {
    const d5 = A13_MOBILE_STATE_SLOTS.G6.find((s) => s.slotId === "G6-D5")!;
    const d6 = A13_MOBILE_STATE_SLOTS.G6.find((s) => s.slotId === "G6-D6")!;
    expect([d5.referenceCenter, d5.outerReference, d5.rotationDeg]).toEqual([{ x: 642, y: 1212 }, { width: 350, height: 300 }, 17]);
    expect(d5.centerTerritory).toEqual({ x: 612, y: 1187, width: 60, height: 50 });
    expect(d5.paintOrder).toBeGreaterThan(d6.paintOrder);
    expect(A13_MOBILE_RELATIONS.G6.find((r) => r.type === "closing-stack")).toEqual({ type: "closing-stack", behind: "G6-D6", front: "G6-D5" });
    expect(A13_MOBILE_STATE_SLOTS.G7PLUS).toBe(A13_MOBILE_STATE_SLOTS.G6);
    expect(A13_MOBILE_CTA.box).toEqual({ x: 247, y: 1553, width: 446, height: 77 });
    expect(A13_MOBILE_CTA.safeBox).toEqual({ x: 220, y: 1530, width: 500, height: 124 });
  });

  it("every state: family order, one paint order per slot, witness centre inside its centre territory", () => {
    for (const st of A13_MOBILE_STATES) {
      const slots = A13_MOBILE_STATE_SLOTS[st];
      expect(slots.map((s) => s.mediaIndex), st).toEqual(slots.map((_, i) => i));
      expect(new Set(slots.map((s) => s.paintOrder)).size, st).toBe(slots.length);
      for (const s of slots) {
        const t = s.centerTerritory;
        expect(s.referenceCenter.x >= t.x && s.referenceCenter.x <= t.x + t.width && s.referenceCenter.y >= t.y && s.referenceCenter.y <= t.y + t.height, s.slotId).toBe(true);
        expect(s.scaleRange[0] <= 1 && s.scaleRange[1] >= 1, s.slotId).toBe(true);
      }
    }
    expect(A13_MOBILE_STATE_SLOTS.G2.length).toBe(2);
    expect(A13_MOBILE_STATE_SLOTS.G6.length).toBe(6);
  });

  it("profile range and CSS clamp tokens (vw = stage width)", () => {
    expect([374, 375, 390, 430, 431].map(a13MobileProfileActive)).toEqual([false, true, true, true, false]);
    expect(resolveCssClamp(A13_MOBILE_TITLE.fontSizeCss, 375)).toBeCloseTo(30.375, 6);
    expect(resolveCssClamp(A13_MOBILE_TITLE.fontSizeCss, 430)).toBeCloseTo(34.83, 6);
    expect(resolveCssClamp(A13_MOBILE_CAPTION.fontSizeCss, 430)).toBe(16);
    expect(resolveCssClamp(A13_MOBILE_PAPER.captionBandCss, 375)).toBeCloseTo(40.125, 6);
    expect(resolveCssClamp(A13_MOBILE_PAPER.captionBandCss, 430)).toBe(46);
    expect(resolveCssClamp(A13_MOBILE_PAPER.sideBorderCss, 390)).toBeCloseTo(7.02, 6);
  });

  it("the pilot uses the product's own HERITAGE Gallery texts", () => {
    expect(A13_MOBILE_PILOT_TITLE).toEqual(GALLERY_HERITAGE_TEXTS);
  });
});
