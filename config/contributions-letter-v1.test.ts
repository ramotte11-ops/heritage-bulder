import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import { LETTER_DESKTOP_MIN_WIDTH, LETTER_MASTERS, LETTER_MOBILE_MAX_GROWTH, letterLayout, letterSlices } from "./contributions-letter-v1";

/** M8-E6-A — « La lettre des proches » : la géométrie des Masters, sans déformation. */

const inside = (inner: { left: number; top: number; right: number; bottom: number }, outer: typeof inner) =>
  inner.left >= outer.left && inner.right <= outer.right && inner.top >= outer.top && inner.bottom <= outer.bottom;

describe("M8-E6-A — Masters de la lettre", () => {
  it("les deux Masters du Studio sont présents, aux dimensions livrées", () => {
    for (const m of Object.values(LETTER_MASTERS)) {
      expect(existsSync(path.resolve(import.meta.dirname, "..", "public", m.src.slice(1)))).toBe(true);
    }
    expect([LETTER_MASTERS.desktop.width, LETTER_MASTERS.desktop.height]).toEqual([1536, 1024]);
    expect([LETTER_MASTERS.mobile.width, LETTER_MASTERS.mobile.height]).toEqual([1090, 1443]);
  });

  it("les zones de lecture restent dans le filet doré, et hors des rameaux (mesures du Master)", () => {
    const sprigs = {
      desktop: [{ left: 0, top: 0, right: 411, bottom: 299 }, { left: 1152, top: 622, right: 1536, bottom: 1024 }],
      mobile: [{ left: 0, top: 0, right: 460, bottom: 335 }, { left: 695, top: 915, right: 1090, bottom: 1443 }],
    } as const;
    const overlaps = (a: { left: number; top: number; right: number; bottom: number }, b: typeof a) =>
      a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    for (const frame of ["desktop", "mobile"] as const) {
      const m = LETTER_MASTERS[frame];
      for (const zone of [m.header, m.body, m.footer, m.close]) {
        expect(inside(zone, m.rule)).toBe(true);
        for (const sprig of sprigs[frame]) expect(overlaps(zone, sprig)).toBe(false);
      }
    }
  });

  it("le bandeau Mobile est sous l'enveloppe et au-dessus du rameau inférieur ; le Desktop n'en a aucun", () => {
    expect(LETTER_MASTERS.desktop.band).toBeNull();
    const band = LETTER_MASTERS.mobile.band!;
    expect(band.top).toBeGreaterThanOrEqual(815);
    expect(band.bottom).toBeLessThanOrEqual(905);
  });
});

describe("M8-E6-A — adaptation aux contenus courts et longs", () => {
  it("une seule échelle : la lettre n'est jamais déformée", () => {
    for (const vw of [320, 375, 390, 430, 1440]) {
      const l = letterLayout({ viewportWidth: vw, viewportHeight: 844, contentOverflow: 0 });
      const m = LETTER_MASTERS[l.frame];
      expect(l.width / m.width).toBeCloseTo(l.scale, 10);
      expect(l.height / m.height).toBeCloseTo(l.scale, 10);
    }
  });

  it("Desktop : proportions exactes même pour un contenu long (il défile à l'intérieur)", () => {
    const l = letterLayout({ viewportWidth: 1440, viewportHeight: 900, contentOverflow: 900 });
    expect(l.frame).toBe("desktop");
    expect(l.extensions).toBe(0);
    expect(l.width).toBeLessThanOrEqual(1000);
    expect(l.height).toBeLessThanOrEqual(900 - 32);
    expect(letterLayout({ viewportWidth: LETTER_DESKTOP_MIN_WIDTH - 1, viewportHeight: 900, contentOverflow: 0 }).frame).toBe("mobile");
  });

  it("Mobile : la lettre s'allonge par paires de bandeaux, juste ce qu'il faut, et jamais au-delà de 1,6 fois", () => {
    const base = letterLayout({ viewportWidth: 390, viewportHeight: 844, contentOverflow: 0 });
    expect(base.extensions).toBe(0);
    const some = letterLayout({ viewportWidth: 390, viewportHeight: 844, contentOverflow: 60 });
    const pair = 2 * 70 * some.scale;
    expect(some.extensions).toBe(Math.ceil(60 / pair));
    expect(some.extensionPx).toBeGreaterThanOrEqual(60);
    const huge = letterLayout({ viewportWidth: 320, viewportHeight: 568, contentOverflow: 5000 });
    expect(huge.height).toBeLessThanOrEqual(LETTER_MOBILE_MAX_GROWTH * LETTER_MASTERS.mobile.height * huge.scale + 0.001);
  });

  it("aucune couture : bandeaux en nombre impair, chaque jonction rejoint la ligne voisine du Master", () => {
    const m = LETTER_MASTERS.mobile;
    for (const k of [0, 1, 2, 5]) {
      const slices = letterSlices("mobile", k);
      const total = slices.reduce((n, s) => n + (s.bottom - s.top), 0);
      expect(total).toBe(m.height + k * 2 * (m.band!.bottom - m.band!.top));
      // Ligne du Master vue en bas de chaque morceau, puis en haut du suivant.
      const edge = (s: (typeof slices)[number], end: "top" | "bottom") => (s.flip ? (end === "top" ? s.bottom - 1 : s.top) : end === "top" ? s.top : s.bottom - 1);
      for (let i = 0; i + 1 < slices.length; i++) {
        const a = edge(slices[i], "bottom");
        const b = edge(slices[i + 1], "top");
        // Soit la même ligne répétée (miroir), soit deux lignes voisines du Master.
        expect(b === a || b === a + 1).toBe(true);
      }
      // Bandeaux ajoutés : 2k (un retourné, un droit) ; avec celui du Master, toujours un nombre impair.
      expect(slices.filter((s) => s.top === m.band!.top && s.bottom === m.band!.bottom).length).toBe(2 * k);
      expect(slices.filter((s) => s.flip).length).toBe(k);
    }
  });
});
