import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  A13_MOBILE_BACKGROUND,
  A13_MOBILE_CAPTION,
  A13_MOBILE_CTA,
  A13_MOBILE_GROUP_TRANSLATION,
  A13_MOBILE_HANDOFF_ID,
  A13_MOBILE_PAPER,
  A13_MOBILE_RELATIONS,
  A13_MOBILE_STATE_SLOTS,
  A13_MOBILE_STATES,
  A13_MOBILE_TITLE_BLOCK,
  a13MobileProfileActive,
  resolveByViewport,
  resolveCssClamp,
} from "@/config/gallery-a13-mobile-manifest";
import { GALLERY_HERITAGE_TEXTS } from "@/lib/memorial/assembly/renderer-adapters";
import { A13_MOBILE_CAPTION_TEXTS, A13_MOBILE_PILOT_TITLE } from "@/lib/memorial/gallery/a13-mobile-pilot-fixtures";

const ROOT = path.resolve(import.meta.dirname, "..");

describe("A13 Mobile Light — Handoff V1.5 authority", () => {
  it("the runtime background is the package's common asset, byte for byte (BACKGROUND_DIMENSION_OR_HASH_MISMATCH guard)", () => {
    expect(A13_MOBILE_HANDOFF_ID).toBe("A13_MOBILE_GALLERY_LIGHT_FINAL_HANDOFF_V1_5");
    const bytes = readFileSync(path.join(ROOT, "public", A13_MOBILE_BACKGROUND.src));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(A13_MOBILE_BACKGROUND.sha256);
    // PNG IHDR: width and height, big-endian, at bytes 16–23.
    expect(bytes.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([A13_MOBILE_BACKGROUND.width, A13_MOBILE_BACKGROUND.height]);
    expect([A13_MOBILE_BACKGROUND.width, A13_MOBILE_BACKGROUND.height]).toEqual([941, 1672]);
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

  it("the 7+ CTA and its safe box are V1.4's moved by the G6 group translation (stage frame)", () => {
    const T = A13_MOBILE_GROUP_TRANSLATION.G7PLUS.translateYSource;
    expect(A13_MOBILE_CTA.box).toEqual({ x: 247, y: 1588.131, width: 446, height: 77 });
    expect(A13_MOBILE_CTA.safeBox).toEqual({ x: 220, y: 1565.131, width: 500, height: 124 });
    expect(A13_MOBILE_CTA.box.y - T).toBeCloseTo(1553, 9);
    expect(A13_MOBILE_CTA.safeBox.y - T).toBeCloseTo(1530, 9);
    expect(A13_MOBILE_CTA.safeBox.y + A13_MOBILE_CTA.safeBox.height).toBeLessThanOrEqual(A13_MOBILE_GROUP_TRANSLATION.G7PLUS.stageHeightSource);
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
