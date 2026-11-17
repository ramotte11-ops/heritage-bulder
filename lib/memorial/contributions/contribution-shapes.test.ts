import { describe, expect, it } from "vitest";
import { CONTRIBUTIONS_MASTER_ITEMS, type ContributionsFormat, type ContributionsTheme } from "@/config/contributions-master-measurements";
import type { Point } from "@/lib/memorial/gallery/dynamic-polaroid-qa";
import { cardLayout, cardPaperSize, cardShape, polaroidShape, type ContributionTextFormat } from "@/lib/memorial/contributions/contribution-shapes";
import { contributionsMasterSlot } from "@/lib/memorial/contributions/contributions-scene";

const FRAMES: ContributionsFormat[] = ["desktop", "mobile"];
const THEMES: ContributionsTheme[] = ["light", "dark"];
const TEXT_FORMATS: ContributionTextFormat[] = ["condolence", "story-tall", "story-wide"];
const SOURCE = { condolence: "C1", "story-tall": "R1", "story-wide": "R2" } as const;

const edgeAngle = (p: Point[]) => (Math.atan2(p[1].y - p[0].y, p[1].x - p[0].x) * 180) / Math.PI;
/** Dans le polygone convexe, bord compris (tolérance numérique 1e-6). */
const insideOrOn = (q: Point, poly: Point[]) => {
  const s = poly.map((a, i) => {
    const b = poly[(i + 1) % poly.length];
    return (b.x - a.x) * (q.y - a.y) - (b.y - a.y) * (q.x - a.x);
  });
  return s.every((v) => v >= -1e-6) || s.every((v) => v <= 1e-6);
};

describe("M4 Contributions — forme Carte", () => {
  it("a exactement trois formats textuels : la condoléance et deux récits (haut, large)", () => {
    expect(TEXT_FORMATS.map((f) => cardLayout(f, { width: 400, height: 300 }).format)).toEqual(["condolence", "story-tall", "story-wide"]);
  });

  for (const frame of FRAMES)
    for (const theme of THEMES) {
      it(`${frame} ${theme} : chaque format a les dimensions de son Master, sans moyenne Light / Dark`, () => {
        for (const f of TEXT_FORMATS) expect(cardPaperSize(f, frame, theme)).toEqual(CONTRIBUTIONS_MASTER_ITEMS[frame][theme][SOURCE[f]].size);
      });

      it(`${frame} ${theme} : une carte n'est jamais mise à l'échelle (dimensions identiques à toute échelle)`, () => {
        const v = contributionsMasterSlot(frame, theme, "C1", 0);
        const a = cardShape(v, "condolence", frame, theme);
        const b = cardShape({ ...v, scaleBounds: { preferred: [0.5, 0.5], hard: [0.5, 2] } }, "condolence", frame, theme);
        expect(a.outer0).toEqual(b.outer0);
        expect(a.s).toBe(1);
        expect(a.area).toBeCloseTo(cardPaperSize("condolence", frame, theme).width * cardPaperSize("condolence", frame, theme).height, 6);
      });

      it(`${frame} ${theme} : le papier suit l'inclinaison du Master et la zone de texte est dans le papier`, () => {
        for (const f of TEXT_FORMATS) {
          const slotId = SOURCE[f];
          const sh = cardShape(contributionsMasterSlot(frame, theme, slotId, 0), f, frame, theme);
          expect(edgeAngle(sh.outer0)).toBeCloseTo(CONTRIBUTIONS_MASTER_ITEMS[frame][theme][slotId].rotationDeg, 6);
          for (const q of sh.photo0) expect(insideOrOn(q, sh.outer0)).toBe(true);
        }
      });
    }

  it("la zone protégée couvre le corps, la signature et l'en-tête fixe", () => {
    for (const f of TEXT_FORMATS) {
      const c = cardLayout(f, { width: 444, height: 264 });
      const p = c.protectedText;
      for (const r of [c.body, c.signature, ...(c.overline ? [c.overline] : [])]) {
        expect(r.x).toBeGreaterThanOrEqual(p.x - 1e-9);
        expect(r.y).toBeGreaterThanOrEqual(p.y - 1e-9);
        expect(r.x + r.width).toBeLessThanOrEqual(p.x + p.width + 1e-9);
        expect(r.y + r.height).toBeLessThanOrEqual(p.y + p.height + 1e-9);
      }
    }
  });
});

describe("M4 Contributions — forme Polaroid (A13 inchangé)", () => {
  const v = contributionsMasterSlot("desktop", "light", "P1", 0);
  for (const [w, h] of [[3, 4], [4, 3], [1, 1], [9, 16], [16, 9], [239, 100]]) {
    it(`ratio ${w}:${h} : photographie entière, jamais recadrée ; photo et légende protégées`, () => {
      const sh = polaroidShape(v, { width: w * 100, height: h * 100 }, 1);
      expect(sh.layout.kind).toBe("polaroid");
      if (sh.layout.kind !== "polaroid") return;
      const l = sh.layout.polaroid;
      expect(l.visibleFraction).toBe(1);
      expect(l.photo.width / l.photo.height).toBeCloseTo((w * 100) / (h * 100), 6);
      // Zone protégée : de la fenêtre photo jusqu'au bas du papier (bande de légende comprise).
      for (const q of sh.photo0) expect(insideOrOn(q, sh.outer0)).toBe(true);
      const area = (p: Point[]) => Math.abs(p.reduce((s, a, i) => s + a.x * p[(i + 1) % p.length].y - p[(i + 1) % p.length].x * a.y, 0)) / 2;
      expect(area(sh.photo0)).toBeCloseTo(l.window.width * (l.outer.height - l.window.y), 4);
    });
  }
});
