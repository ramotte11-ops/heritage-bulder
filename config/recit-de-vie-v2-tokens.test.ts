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
    const resolution = resolveRecitV2MobileArtwork("dark");
    expect(resolution.status).toBe("ready");
    if (resolution.status !== "ready") return;
    expect(resolution.artwork).toBe("ivoireChampagne");
    expect(resolution.tokens.masterSrc).toBe("/assets/recit-de-vie/runtime-v2/mobile/ivoire-champagne.png");
    expect(resolution.tokens.canvas).toEqual({ width: 941, height: 1672 });
  });

  it("LIGHT → bleu pétrole, pas encore construit : en attente, jamais l'ivoire à sa place", () => {
    expect(resolveRecitV2MobileArtwork("light")).toEqual({ status: "pending", artwork: "bleuPetrole" });
  });
});

describe("assets des matières", () => {
  for (const [artwork, tokens] of Object.entries(RECIT_V2_MOBILE_ARTWORKS)) {
    it(`${artwork} : le Master est la copie exacte du handoff, le grain existe`, () => {
      const master = publicFile(tokens.masterSrc);
      expect(createHash("sha256").update(readFileSync(master)).digest("hex")).toBe(tokens.masterSha256);
      expect(existsSync(publicFile(tokens.grainSrc))).toBe(true);
    });

    it(`${artwork} : les fichiers portent le nom de leur matière, jamais light/dark`, () => {
      for (const src of [tokens.masterSrc, tokens.grainSrc]) {
        expect(path.basename(src)).not.toMatch(/light|dark/i);
      }
    });
  }
});
