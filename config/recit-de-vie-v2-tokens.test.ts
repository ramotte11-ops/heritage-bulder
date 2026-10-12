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

  it("le Mobile Dark validé garde sa géométrie : numéros 46 px, aucune garde de filet", () => {
    const { tokens } = resolveRecitV2MobileArtwork("dark");
    expect(tokens.numberSize).toBe(46);
    expect(tokens.numberColumn).toBe(0.205);
    expect(tokens.numberInset).toBe(0.035);
    expect(tokens.ruleMinGap).toBe(0);
    expect(tokens.paperGrains).toHaveLength(1);
  });
});

describe("assets des matières", () => {
  for (const [artwork, tokens] of Object.entries(RECIT_V2_MOBILE_ARTWORKS)) {
    it(`${artwork} : le Master est la copie exacte du handoff, le grain existe`, () => {
      const master = publicFile(tokens.masterSrc);
      expect(createHash("sha256").update(readFileSync(master)).digest("hex")).toBe(tokens.masterSha256);
      for (const grain of tokens.paperGrains) expect(existsSync(publicFile(grain.src))).toBe(true);
    });

    it(`${artwork} : les fichiers portent le nom de leur matière, jamais light/dark`, () => {
      for (const src of [tokens.masterSrc, ...tokens.paperGrains.map((g) => g.src)]) {
        expect(path.basename(src)).not.toMatch(/light|dark/i);
      }
    });
  }
});
