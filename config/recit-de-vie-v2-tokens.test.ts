import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SKIN_VARIANTS } from "@/config/skins";
import {
  RECIT_V2_ARTWORK_FOR_VARIANT,
  RECIT_V2_MOBILE_ARTWORKS,
  resolveRecitV2MobileArtwork,
} from "./recit-de-vie-v2-tokens";

/** Décision PO (Récit de vie seulement) : LIGHT = bleu pétrole,
 * DARK = ivoire / champagne. */

const publicFile = (src: string) => path.join(process.cwd(), "public", src);

describe("RECIT_V2_ARTWORK_FOR_VARIANT", () => {
  it("affecte le bleu pétrole au Récit LIGHT et l'ivoire / champagne au Récit DARK", () => {
    expect(RECIT_V2_ARTWORK_FOR_VARIANT).toEqual({ light: "bleuPetrole", dark: "ivoireChampagne" });
  });

  it("couvre exactement les variantes du mémorial, une matière distincte chacune", () => {
    expect(Object.keys(RECIT_V2_ARTWORK_FOR_VARIANT).sort()).toEqual([...SKIN_VARIANTS].sort());
    expect(new Set(Object.values(RECIT_V2_ARTWORK_FOR_VARIANT)).size).toBe(SKIN_VARIANTS.length);
  });

  it("est figée", () => {
    expect(Object.isFrozen(RECIT_V2_ARTWORK_FOR_VARIANT)).toBe(true);
    expect(Object.isFrozen(RECIT_V2_MOBILE_ARTWORKS)).toBe(true);
  });
});

describe("resolveRecitV2MobileArtwork", () => {
  it("DARK → ivoire / champagne, le Master validé", () => {
    const { artwork, tokens } = resolveRecitV2MobileArtwork("dark");
    expect(artwork).toBe("ivoireChampagne");
    expect(tokens.masterSrc).toBe("/assets/recit-de-vie/runtime-v2/mobile/ivoire-champagne.png");
    expect(tokens.masterSha256).toBe("7c228a98e628d5074082c0d6d1916ef6804af1dd301620ee5b1634d89198056f");
    expect(tokens.canvas).toEqual({ width: 941, height: 1672 });
  });

  it("LIGHT → bleu pétrole, le Master du handoff `mobile_dark.png`", () => {
    const { artwork, tokens } = resolveRecitV2MobileArtwork("light");
    expect(artwork).toBe("bleuPetrole");
    expect(tokens.masterSrc).toBe("/assets/recit-de-vie/runtime-v2/mobile/bleu-petrole.png");
    expect(tokens.masterSha256).toBe("4aef3d0f4b947c03953c380d5016835281229f52af1d6e5c7fdd9255336035c5");
    expect(tokens.canvas).toEqual({ width: 942, height: 1669 });
  });

  it("arbitrages QG du bleu pétrole (version B) : coupe 1150, numéros 40 px à 0,215, colonne 0,235", () => {
    const { tokens } = resolveRecitV2MobileArtwork("light");
    expect(tokens.cutY).toBe(1150);
    expect(tokens.numberSize).toBe(40);
    expect(tokens.numberColumn).toBe(0.235);
    expect(tokens.textLeft + tokens.numberInset).toBeCloseTo(0.215, 10);
    expect(tokens.ruleMinGap).toBeGreaterThan(0);
  });

  it("le Mobile Dark validé garde sa géométrie : numéros 46 px ; garde de filet 6 px (GO PO, « 03 » à 320 px)", () => {
    const { tokens } = resolveRecitV2MobileArtwork("dark");
    expect(tokens.numberSize).toBe(46);
    expect(tokens.numberColumn).toBe(0.205);
    expect(tokens.numberInset).toBe(0.035);
    expect(tokens.ruleMinGap).toBe(6);
    expect(tokens.paperGrains).toHaveLength(1);
  });
});

describe("Desktop (≥ 1024 px)", () => {
  it("LIGHT → Master Desktop bleu pétrole (`desktop_dark.png` du handoff)", () => {
    const { tokens } = resolveRecitV2MobileArtwork("light");
    expect(tokens.desktop.masterSrc).toBe("/assets/recit-de-vie/runtime-v2/desktop/bleu-petrole-desktop.png");
    expect(tokens.desktop.masterSha256).toBe("71a409ffbd403be08a0c696bae450f9894709be5c08528b87697d4d4671ece3d");
    expect(tokens.desktop.canvas).toEqual({ width: 1671, height: 941 });
  });

  it("DARK → Master Desktop ivoire / champagne (`desktop_light.png` du handoff)", () => {
    const { tokens } = resolveRecitV2MobileArtwork("dark");
    expect(tokens.desktop.masterSrc).toBe("/assets/recit-de-vie/runtime-v2/desktop/ivoire-champagne-desktop.png");
    expect(tokens.desktop.masterSha256).toBe("5a2272c2e8233c785ed8fa489bd4f20151fcff35c5ce0a1a214a6f44da09c7ff");
    expect(tokens.desktop.canvas).toEqual({ width: 1671, height: 941 });
  });

  it("arbitrages validés : numéros progressifs 52 → 64 px, coupes au milieu du Master", () => {
    for (const variant of ["light", "dark"] as const) {
      const { desktop } = resolveRecitV2MobileArtwork(variant).tokens;
      expect(desktop.numberSize).toBe("clamp(52px, 4.4cqw, 64px)");
      expect(desktop.cutY).toBeGreaterThan(desktop.canvas.height * 0.4);
      expect(desktop.cutY).toBeLessThan(desktop.canvas.height * 0.7);
      expect(desktop.textLeft).toBeLessThan(desktop.textRight);
    }
  });
});

describe("assets des matières", () => {
  for (const [artwork, tokens] of Object.entries(RECIT_V2_MOBILE_ARTWORKS)) {
    for (const [format, set] of [["Mobile", tokens], ["Desktop", tokens.desktop]] as const) {
      it(`${artwork} ${format} : le Master est la copie exacte du handoff, les grains existent`, () => {
        const master = publicFile(set.masterSrc);
        expect(createHash("sha256").update(readFileSync(master)).digest("hex")).toBe(set.masterSha256);
        for (const grain of set.paperGrains) expect(existsSync(publicFile(grain.src))).toBe(true);
      });

      it(`${artwork} ${format} : les fichiers portent le nom de leur matière, jamais light/dark`, () => {
        for (const src of [set.masterSrc, ...set.paperGrains.map((g) => g.src)]) {
          expect(path.basename(src)).not.toMatch(/light|dark/i);
        }
      });
    }
  }
});
