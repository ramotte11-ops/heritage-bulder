import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  A13_MOBILE_BACKGROUND,
  A13_MOBILE_BOTTOM_CONTINUATION,
  A13_MOBILE_CAPTION,
  A13_MOBILE_CTA,
  A13_MOBILE_GROUP_TRANSLATION,
  A13_MOBILE_HANDOFF_ID,
  A13_MOBILE_PAPER,
  A13_MOBILE_RELATIONS,
  A13_MOBILE_STATE_SLOTS,
  A13_MOBILE_STATES,
  A13_MOBILE_STOPS,
  A13_MOBILE_TITLE_BLOCK,
  a13MobileProfileActive,
  resolveByViewport,
  resolveCssClamp,
} from "@/config/gallery-a13-mobile-manifest";
import { GALLERY_HERITAGE_TEXTS } from "@/lib/memorial/assembly/renderer-adapters";
import { A13_MOBILE_CAPTION_TEXTS, A13_MOBILE_PILOT_TITLE } from "@/lib/memorial/gallery/a13-mobile-pilot-fixtures";

const ROOT = path.resolve(import.meta.dirname, "..");

describe("A13 Mobile Light — Handoff V1.7 authority", () => {
  it("the runtime background is the package's common asset V2, byte for byte (BACKGROUND_DIMENSION_OR_HASH_MISMATCH guard)", () => {
    expect(A13_MOBILE_HANDOFF_ID).toBe("A13_MOBILE_GALLERY_LIGHT_FINAL_HANDOFF_V1_7");
    expect(A13_MOBILE_BACKGROUND.sha256).toBe("ee636a0a94c648c717d6729d10b4d79991420eae5212b7a47975267f38ee6bf8");
    const bytes = readFileSync(path.join(ROOT, "public", A13_MOBILE_BACKGROUND.src));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(A13_MOBILE_BACKGROUND.sha256);
    // PNG IHDR: width and height, big-endian, at bytes 16–23.
    expect(bytes.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([A13_MOBILE_BACKGROUND.width, A13_MOBILE_BACKGROUND.height]);
    expect([A13_MOBILE_BACKGROUND.width, A13_MOBILE_BACKGROUND.height]).toEqual([941, 1672]);
    // PNG colour type 6 = RGBA (byte 25), as declared by the package.
    expect(bytes[25]).toBe(6);
  });

  it("the runtime never uses the superseded V1 background (removed by explicit QG/PO decision, pre-PR cleanup)", () => {
    expect(A13_MOBILE_BACKGROUND.src).not.toBe("/assets/gallery/a13-mobile/a13-mobile-light-gallery-background-common.png");
  });

  it("V1.6 captions: occlusion allowed, the safe zone a diagnostic, no caption STOP", () => {
    expect(A13_MOBILE_CAPTION).toMatchObject({ safeZoneRole: "diagnostic", occlusionAllowed: true });
    expect(A13_MOBILE_STOPS as readonly string[]).not.toContain("CAPTION_SAFE_ZONE_UNRESOLVED");
    expect([...A13_MOBILE_STOPS]).toEqual([
      "CENTER_OUTSIDE_TERRITORY",
      "PAPER_OVERFLOW_EXCEEDED",
      "ITEM_INACCESSIBLE",
      "TITLE_GLYPH_COLLISION_UNRESOLVED",
      "TITLE_BLOCK_COLLISION_UNRESOLVED",
      "CTA_COLLISION_UNRESOLVED",
      "BOTTOM_MATERIAL_SEAM_VISIBLE",
      "HORIZONTAL_OVERFLOW",
      "MASTER_HANDOFF_CONTRADICTION_STOP",
      "DESKTOP_REGRESSION",
      "BACKGROUND_DIMENSION_OR_HASH_MISMATCH",
    ]);
  });

  it("the internal geometry of every slot is V1.4's, unchanged (digest of the slot data, computed on b1e00a1)", () => {
    const digest = createHash("sha256").update(JSON.stringify(A13_MOBILE_STATE_SLOTS)).digest("hex");
    expect(digest).toBe("a1d8e97bb599e174ce77c2060f850859d8e983b6715a2e1bff15906c5ae84658");
  });

  it("G6-D5 is the Studio arbitration (642,1212 · 350 × 300 · 17°), in front of D6; Signature 7+ IS g6.json", () => {
    const d5 = A13_MOBILE_STATE_SLOTS.G6.find((s) => s.slotId === "G6-D5")!;
    const d6 = A13_MOBILE_STATE_SLOTS.G6.find((s) => s.slotId === "G6-D6")!;
    expect([d5.referenceCenter, d5.outerReference, d5.rotationDeg]).toEqual([{ x: 642, y: 1212 }, { width: 350, height: 300 }, 17]);
    expect(d5.centerTerritory).toEqual({ x: 612, y: 1187, width: 60, height: 50 });
    expect(d5.paintOrder).toBeGreaterThan(d6.paintOrder);
    expect(A13_MOBILE_RELATIONS.G6.find((r) => r.type === "closing-stack")).toEqual({ type: "closing-stack", behind: "G6-D6", front: "G6-D5" });
    expect(A13_MOBILE_STATE_SLOTS.G7PLUS).toBe(A13_MOBILE_STATE_SLOTS.G6);
  });

  it("group translations: one per state, source = CSS@375 × 941 / 375, the stage extended by exactly that; 7+ inherits G6", () => {
    const at375 = { G2: 0, G3: 18, G4: 4, G5: 34, G6: 14, G7PLUS: 14 } as const;
    for (const st of A13_MOBILE_STATES) {
      const t = A13_MOBILE_GROUP_TRANSLATION[st];
      expect(t.translateYCssAt375, st).toBe(at375[st]);
      expect(t.translateYSource, st).toBeCloseTo((at375[st] * 941) / 375, 3);
      expect(t.backgroundExtensionSource, st).toBe(t.translateYSource);
      expect(t.stageHeightSource, st).toBeCloseTo(1672 + t.translateYSource, 9);
    }
    expect(A13_MOBILE_GROUP_TRANSLATION.G7PLUS).toEqual(A13_MOBILE_GROUP_TRANSLATION.G6);
  });

  it("V1.7 7+ CTA (g7plus.json cta): V1.6 horizontal geometry, inset and sizes kept; vertical placement after the group, 24 + 24 CSS px", () => {
    const c = A13_MOBILE_CTA;
    // The V1.6 boxes (stage frame) remain the base: x / widths and the inset and heights derive from them.
    expect(c.baseBox).toEqual({ x: 247, y: 1588.131, width: 446, height: 77 });
    expect(c.baseSafeBox).toEqual({ x: 220, y: 1565.131, width: 500, height: 124 });
    expect(c.horizontal).toEqual({ boxX: c.baseBox.x, boxWidth: c.baseBox.width, safeBoxX: c.baseSafeBox.x, safeBoxWidth: c.baseSafeBox.width });
    expect(c.vertical).toEqual({
      gapGroupToSafeBoxCss: 24,
      safeBoxHeightSource: c.baseSafeBox.height,
      boxTopInsetSource: 23,
      boxHeightSource: c.baseBox.height,
      boxMinHeightCss: 44,
      bottomBreathingCss: 24,
      baseStageHeightSource: 1707.131,
    });
    expect(c.baseBox.y - c.baseSafeBox.y).toBeCloseTo(c.vertical.boxTopInsetSource, 9);
    // The base stage is the G6 stage (1672 + the 7+ translation).
    expect(c.vertical.baseStageHeightSource).toBeCloseTo(A13_MOBILE_GROUP_TRANSLATION.G7PLUS.stageHeightSource, 3);
    expect([c.minTargetCssPx, c.zIndex]).toEqual([44, 950]);
  });

  it("V1.7 bottom continuation: neutral paper #F4DFCB, shared texture at 0.18, a 20 CSS px fade; the seam is a QA STOP", () => {
    expect(A13_MOBILE_BOTTOM_CONTINUATION).toEqual({ baseColor: "#F4DFCB", baseColorRgb: [244, 223, 203], textureOpacity: 0.18, seamBlendCss: 20 });
    const hex = A13_MOBILE_BOTTOM_CONTINUATION.baseColor.slice(1);
    expect([0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16))).toEqual([...A13_MOBILE_BOTTOM_CONTINUATION.baseColorRgb]);
    const css = readFileSync(path.join(ROOT, "components/memorial/gallery/A13MobileGalleryScene.module.css"), "utf8");
    const rule = (sel: string) => css.match(new RegExp(`\\${sel}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
    expect(rule(".extension")).toMatch(/background-color:\s*#f4dfcb;/i);
    expect(rule(".extension::before")).toMatch(/opacity:\s*0\.18;/);
    expect(rule(".extension::before")).toContain("feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' seed='7'");
    expect(rule(".extension::after")).toMatch(/top:\s*-20px;/);
    expect(rule(".extension::after")).toMatch(/height:\s*20px;/);
    expect(rule(".extension::after")).toMatch(/linear-gradient\(to bottom, rgb\(244 223 203 \/ 0\), #f4dfcb\)/);
    // No stretch, no repetition of the raster, no decor in the continuation.
    expect(css).not.toMatch(/background-repeat:\s*repeat-y/);
    expect(rule(".extension") + rule(".extension::before") + rule(".extension::after")).not.toContain(".png");
  });

  it("the title block stack sums to its protected block at 375 / 390 / 430 (separator + gap + title line + gap + subtitle + 28 px)", () => {
    const tb = A13_MOBILE_TITLE_BLOCK;
    for (const w of [375, 390, 430] as const) {
      const sum = tb.separator.heightCss[w] + tb.separatorToTitleGapCss[w] + tb.title.fontSizeCss[w] * tb.title.lineHeight + tb.titleToSubtitleGapCss[w] + tb.subtitle.lineHeightCss + tb.subtitleToFirstPolaroidGapCssMin;
      expect(sum, String(w)).toBeCloseTo(tb.protectedBlockBottomCss[w], 9);
      expect(tb.title.maxWidthCss[w]).toBeLessThanOrEqual(tb.protectedBlockWidthCss[w]);
      expect(tb.separator.widthCss[w]).toBeLessThanOrEqual(tb.protectedBlockWidthCss[w]);
    }
    const p = tb.separator.partsPercent;
    expect(p.leftRule + p.leftGap + p.sprig + p.rightGap + p.rightRule).toBe(100);
  });

  it("per-viewport values: exact at 375 / 390 / 430, linear between, no jump, clamped outside", () => {
    const t = A13_MOBILE_TITLE_BLOCK.separator.widthCss;
    expect([375, 390, 430].map((w) => resolveByViewport(t, w))).toEqual([92, 96, 108]);
    expect(resolveByViewport(t, 382.5)).toBeCloseTo(94, 9);
    expect(resolveByViewport(t, 410)).toBeCloseTo(102, 9);
    expect([resolveByViewport(t, 300), resolveByViewport(t, 500)]).toEqual([92, 108]);
    for (let w = 375; w < 430; w += 0.5) expect(resolveByViewport(t, w + 0.5)).toBeGreaterThanOrEqual(resolveByViewport(t, w));
  });

  it("caption and paper tokens (V1.5)", () => {
    expect(A13_MOBILE_CAPTION).toMatchObject({ maxCharacters: 32, maxLines: 2, fontSizeCss: 12, lineHeightCss: 14.5, horizontalInsetCss: 8, usableBandHeightCss: 42, safeZonePaddingCss: { x: 6, y: 4 }, autoShrink: false, thirdLineAllowed: false });
    expect(A13_MOBILE_PAPER.captionBandCss).toBe(42);
    expect(resolveCssClamp(A13_MOBILE_PAPER.sideBorderCss, 375)).toBeCloseTo(6.75, 9);
    expect(resolveCssClamp(A13_MOBILE_PAPER.sideBorderCss, 390)).toBeCloseTo(7.02, 9);
    expect(resolveCssClamp(A13_MOBILE_PAPER.sideBorderCss, 430)).toBe(7.74);
    expect(resolveCssClamp(A13_MOBILE_CTA.fontSizeCss, 430)).toBeCloseTo(19.78, 9);
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

  it("profile range", () => {
    expect([374, 375, 390, 430, 431].map(a13MobileProfileActive)).toEqual([false, true, true, true, false]);
  });

  it("the pilot uses the product's own HERITAGE Gallery texts; QA captions are natural case, ≤ 32 characters", () => {
    expect(A13_MOBILE_PILOT_TITLE).toEqual(GALLERY_HERITAGE_TEXTS);
    const all = [...A13_MOBILE_CAPTION_TEXTS.twoLines, ...Object.values(A13_MOBILE_CAPTION_TEXTS.narrow).flat()];
    for (const c of all) {
      expect([...c].length, c).toBeLessThanOrEqual(A13_MOBILE_CAPTION.maxCharacters);
      expect(c, c).not.toBe(c.toUpperCase());
    }
  });
});
