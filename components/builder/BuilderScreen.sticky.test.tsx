// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, render } from "@testing-library/react";

vi.mock("next/font/google", () => ({
  Playfair_Display: () => ({ variable: "--font-heritage-serif-mock", className: "" }),
  Inter: () => ({ variable: "--font-heritage-sans-mock", className: "" }),
  Cormorant_Garamond: () => ({ variable: "--a", className: "" }),
  La_Belle_Aurore: () => ({ variable: "--b", className: "" }),
  EB_Garamond: () => ({ variable: "--c", className: "" }),
  Allura: () => ({ variable: "--d", className: "" }),
}));

const { BuilderScreen } = await import("./BuilderScreen");

/** UX-A15 (#110) — la barre collante d'A15, sans toucher au cadre des autres écrans. */

afterEach(cleanup);

const mainClass = (allowSticky?: boolean) => {
  const view = render(
    <BuilderScreen progress={0.5} allowSticky={allowSticky}>
      <p>contenu</p>
    </BuilderScreen>,
  );
  const cls = view.container.querySelector("main")!.className;
  cleanup();
  return cls;
};

describe("UX-A15 — BuilderScreen.allowSticky", () => {
  it("absent (tous les autres écrans) : le cadre est exactement celui d'avant ; présent : une classe de plus", () => {
    const plain = mainClass();
    const sticky = mainClass(true);
    expect(mainClass(false)).toBe(plain);
    expect(sticky.split(/\s+/).filter(Boolean).length).toBe(plain.split(/\s+/).filter(Boolean).length + 1);
  });

  it("la classe découpe avec overflow: clip (sans conteneur de défilement), repli overflow: hidden", () => {
    const css = readFileSync(path.resolve(import.meta.dirname, "BuilderScreen.module.css"), "utf8");
    const rule = css.slice(css.indexOf(".pageAllowsSticky {"), css.indexOf("}", css.indexOf(".pageAllowsSticky {")));
    expect(rule).toMatch(/overflow: hidden;\s*overflow: clip;/);
    // La règle de base de la page reste inchangée.
    expect(css).toMatch(/\.page \{[^}]*overflow: hidden;/);
  });

  it("seul l'écran A15 (ContributionsStep) l'active", () => {
    const step = readFileSync(path.resolve(import.meta.dirname, "ContributionsStep.tsx"), "utf8");
    expect(step).toMatch(/<BuilderScreen [^>]*allowSticky>/);
    const others = ["GalleryStep.tsx", "HeroPhotoStep.tsx", "PersonSheetStep.tsx", "TraditionsStep.tsx"].map((f) => readFileSync(path.resolve(import.meta.dirname, f), "utf8"));
    for (const src of others) expect(src).not.toMatch(/allowSticky/);
  });
});
