// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, render, screen, within } from "@testing-library/react";

/**
 * Offrandes symboliques V1 — pilote statique M1 (scène de recueillement).
 * Contrats : sources artistiques intactes (SHA-256 des livraisons PO),
 * versions servies présentes, une seule offrande par scène, textes validés
 * en texte vivant, aucun état « cartes », aucun branchement au registre des
 * rubriques. jsdom ne fait aucune mise en page : composition, lisibilité et
 * raccord flamme / mèche sont vérifiés par les planches de
 * `docs/validation/offrandes-v1/`.
 */

vi.mock("next/font/google", () => ({
  Cormorant_Garamond: () => ({ variable: "--font-heritage-hero-serif-mock", className: "" }),
  La_Belle_Aurore: () => ({ variable: "--font-heritage-hero-script-mock", className: "" }),
  EB_Garamond: () => ({ variable: "--font-heritage-ceremony-serif-mock", className: "" }),
  Playfair_Display: () => ({ variable: "--font-heritage-serif-mock", className: "" }),
  Inter: () => ({ variable: "--font-heritage-sans-mock", className: "" }),
}));

const { SymbolicOfferingsSceneV1 } = await import("./SymbolicOfferingsSceneV1");
const { OFFERINGS_V1_TOKENS, OFFERING_KINDS } = await import("@/config/symbolic-offerings-v1-tokens");
const { RENDERER_KEYS, SECTION_RENDERERS } = await import("@/config/memorial-section-renderers");
const { SECTION_IDS } = await import("@/config/sections");
const { RESERVED_MEMORIAL_SLOTS } = await import("@/config/memorial-section-order");

afterEach(cleanup);

const ROOT = path.resolve(import.meta.dirname, "../../../..");

/** SHA-256 des livraisons PO (`OFFRANDES_INTEMPOREL_RECUEILLEMENT_4_FONDS_V1.zip`,
 * `HERITAGE_OFFRANDES_OBJETS_ISOLES_V1.zip`). */
const PO_SOURCES: Record<string, string> = {
  "offrandes-recueillement-mobile-light.png": "3e34472567f5d81ea3ff9d5f1e4ff8fb667ebb6a3894e1c27bc1aee4f4781f58",
  "offrandes-recueillement-mobile-dark.png": "fc57a1982ae473aa3d843ae578bae939093c6110d8350b64f327be35b8df2381",
  "offrandes-recueillement-desktop-light.png": "f491b13184b7d17861b15a4adb58275749c3386206c9174789dcd20c7b55d68e",
  "offrandes-recueillement-desktop-dark.png": "2204e3aa6163af9049d9a80dbb0dac8936e8e9ca93331368365019d5b9e6a2e2",
  "01_Bougie_eteinte.png": "4f3df62e630de0fb53e2e360a6493c608bed0f2520d83599ecba79800a383a98",
  "02_Flamme.png": "e8a4ba480135201d733debd6355d4f618114c6d33b44bddac5158197c6235a9b",
  "03_Lys_ivoire.png": "71d74bb473a6eb77e8eb43869985af63f3f0eb457fb9878e57f71b95ca038b7e",
  "04_Coeur_sculpte.png": "0e072f5f25c30832a0ac2ac4d3701edbf865e8bbddab886484579f1a7a5c1364",
};

const CONFIRMATIONS = {
  bougie: "Une lumière brille désormais en sa mémoire.",
  lys: "Une fleur déposée en sa mémoire.",
  coeur: "Une pensée d’amour offerte en sa mémoire.",
} as const;

const COMPOSITIONS = (["light", "dark"] as const).flatMap((variant) =>
  (["mobile", "desktop"] as const).map((layout) => [`${layout} ${variant}`, OFFERINGS_V1_TOKENS[variant][layout]] as const),
);

describe("Offrandes V1 — assets", () => {
  it.each(Object.entries(PO_SOURCES))("source %s : octet pour octet la livraison PO", (file, sha) => {
    const bytes = readFileSync(path.join(ROOT, "assets/offrandes-intemporel-v1/source", file));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(sha);
  });

  it.each(COMPOSITIONS)("%s : chaque image référencée existe en AVIF et en WebP servis", (_, C) => {
    const bases = [C.fond, ...OFFERING_KINDS.flatMap((k) => [C.scenes[k].object, C.scenes[k].flame?.image].filter((b) => b !== undefined))];
    for (const base of bases) {
      expect(base.startsWith("/assets/offrandes/v1/")).toBe(true);
      for (const ext of [".avif", ".webp"]) expect(existsSync(path.join(ROOT, "public", `${base}${ext}`))).toBe(true);
    }
  });

  it("le fond de chaque variante est le sien (aucun fond partagé)", () => {
    const fonds = COMPOSITIONS.map(([, C]) => C.fond);
    expect(new Set(fonds).size).toBe(4);
  });
});

describe("Offrandes V1 — géométrie des maquettes validées", () => {
  it.each(COMPOSITIONS)("%s : canevas du fond, bougie seule à porter flamme, halo et lueur", (name, C) => {
    expect(C.canvas).toEqual(name.startsWith("mobile") ? { width: 941, height: 1672 } : { width: 1670, height: 942 });
    expect(C.scenes.bougie.flame).toBeDefined();
    expect(C.scenes.bougie.halo).toBeDefined();
    expect(C.scenes.bougie.wax).toBeDefined();
    for (const k of ["lys", "coeur"] as const) {
      expect(C.scenes[k].flame).toBeUndefined();
      expect(C.scenes[k].halo).toBeUndefined();
    }
  });

  it.each(COMPOSITIONS)("%s : la base de la flamme est sur l'axe de la mèche (≤ 1 px de canevas)", (_, C) => {
    const { flame } = C.scenes.bougie;
    // Base de la flamme dans son image : x 782 / 1536, y 935 / 1024 (mesuré).
    const baseX = flame!.box.left + (782 / 1536) * flame!.box.width;
    const baseY = flame!.box.top + (935 / 1024) * flame!.box.height;
    expect(Math.abs(baseX - flame!.wick[0])).toBeLessThanOrEqual(1);
    expect(Math.abs(baseY - flame!.wick[1])).toBeLessThanOrEqual(1);
  });

  it.each(COMPOSITIONS)("%s : textes et bouton bornés au papier libre", (_, C) => {
    for (const k of OFFERING_KINDS) {
      const s = C.scenes[k];
      expect(s.confirmation.textMaxWidth).toBeGreaterThan(0);
      // Le bouton des maquettes (246 px de canevas) tient dans sa largeur libre.
      expect(s.buttonMaxWidth).toBeGreaterThanOrEqual(246);
      expect(s.confirmation.lines.join(" ")).toBe(CONFIRMATIONS[k]);
    }
  });
});

describe("Offrandes V1 — rendu", () => {
  it.each(OFFERING_KINDS.flatMap((g) => (["light", "dark"] as const).map((v) => [g, v] as const)))(
    "%s %s : une seule offrande, textes vivants validés, bouton réel",
    (offering, variant) => {
      const { container } = render(<SymbolicOfferingsSceneV1 offering={offering} skinVariant={variant} />);
      for (const layout of ["mobile", "desktop"]) {
        const scene = screen.getByTestId(`offerings-v1-${layout}`);
        const q = within(scene);
        expect(q.getByRole("heading", { level: 2 }).textContent).toBe("Un geste pour sa mémoire");
        expect(q.getByText("HERITAGE")).toBeTruthy();
        expect(q.getByText("HOMMAGE INTEMPOREL")).toBeTruthy();
        expect(q.getByText(CONFIRMATIONS[offering].split(" ")[0], { exact: false }).closest("p")!.textContent!.replace(/\s+/g, " ").trim()).toBe(CONFIRMATIONS[offering]);
        expect(q.getByRole("button", { name: "Poursuivre la visite" })).toBeTruthy();
        // Une seule offrande : son image (ombre large + ombre de contact), et
        // la flamme pour la bougie ; aucune autre offrande, aucune carte.
        const objects = [...scene.querySelectorAll("img")].map((i) => i.getAttribute("src")).filter((s) => s!.includes("/objets/"));
        const own = `/assets/offrandes/v1/objets/${offering}.webp`;
        expect(objects.filter((s) => s === own)).toHaveLength(2);
        expect(objects.filter((s) => s !== own)).toEqual(offering === "bougie" ? ["/assets/offrandes/v1/objets/flamme.webp"] : []);
      }
      expect(container.textContent).not.toMatch(/Déposer une fleur|Allumer une bougie|Offrir un cœur|jardin/);
      expect(container.querySelector(`[data-heritage-skin-variant="${variant}"]`)).not.toBeNull();
    },
  );

  it("images décoratives : alternative vide, AVIF proposé avant le WebP", () => {
    const { container } = render(<SymbolicOfferingsSceneV1 offering="lys" skinVariant="light" />);
    for (const img of container.querySelectorAll("img")) expect(img.getAttribute("alt")).toBe("");
    for (const picture of container.querySelectorAll("picture")) {
      expect(picture.querySelector("source")!.getAttribute("type")).toBe("image/avif");
    }
  });

  it("titre de page en h1 sur demande", () => {
    render(<SymbolicOfferingsSceneV1 offering="coeur" skinVariant="dark" headingLevel="page" />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(2);
  });
});

describe("Offrandes V1 — hors produit (M1)", () => {
  it("aucune rubrique, aucun rendu enregistré, la réservation reste une réservation", () => {
    expect(SECTION_IDS as readonly string[]).not.toContain("symbolicOfferings");
    expect(RENDERER_KEYS.some((k) => /offr|offering/i.test(k))).toBe(false);
    expect(Object.keys(SECTION_RENDERERS)).not.toContain("symbolicOfferings");
    expect(RESERVED_MEMORIAL_SLOTS).toEqual(["symbolicOfferings"]);
  });
});
