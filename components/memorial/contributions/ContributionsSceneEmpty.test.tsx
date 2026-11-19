// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { ContributionsSceneEmpty } from "./ContributionsSceneEmpty";
import { CONTRIBUTIONS_EMPTY_CARD_ORNAMENTS } from "@/config/contributions-render-v1";

/**
 * M8-E3 — directive PO : texte de l'état vide IDENTIQUE en Light et Dark,
 * composition graphique PROPRE à chaque Master (ornements de la carte).
 */
afterEach(cleanup);

const hearts = (c: HTMLElement) => c.querySelectorAll("svg path[d^='M12 20.3']").length;
const draw = (frame: "desktop" | "mobile", theme: "light" | "dark") =>
  render(<ContributionsSceneEmpty frame={frame} theme={theme} title="Contributions des proches" subtitle="Sous-titre" closing="Phrase finale" />);

describe("M8-E3 — état vide Light / Dark", () => {
  it("le même texte dans les quatre Masters", () => {
    const texts = (["desktop", "mobile"] as const).flatMap((f) =>
      (["light", "dark"] as const).map((t) => {
        const v = draw(f, t);
        const txt = [...v.container.querySelectorAll("p, h2, button span")].map((n) => n.textContent).join("|");
        cleanup();
        return txt;
      }),
    );
    expect(new Set(texts).size).toBe(1);
    expect(texts[0]).toContain("Laissez le premier message en sa mémoire.");
    expect(texts[0]).not.toContain("Soyez le premier");
  });

  it("ornements de la carte propres à chaque Master (cœur Light, filet simple Dark)", () => {
    // Le cœur du pied de scène (sous le bouton) est commun aux quatre Masters.
    expect(hearts(draw("desktop", "light").container)).toBe(2);
    cleanup();
    expect(hearts(draw("desktop", "dark").container)).toBe(1);
    cleanup();
    expect(hearts(draw("mobile", "light").container)).toBe(2);
    cleanup();
    expect(hearts(draw("mobile", "dark").container)).toBe(1);
    expect(CONTRIBUTIONS_EMPTY_CARD_ORNAMENTS.desktop.dark).toEqual([{ kind: "rule", y: 507.5, x0: 783, x1: 888 }]);
    expect(CONTRIBUTIONS_EMPTY_CARD_ORNAMENTS.mobile.dark).toEqual([{ kind: "rule", y: 976, x0: 429, x1: 546 }]);
  });

  it("chaque Master garde son propre fond nettoyé", () => {
    const bg = (f: "desktop" | "mobile", t: "light" | "dark") => {
      const v = draw(f, t);
      const s = (v.container.querySelector("section") as HTMLElement).style.backgroundImage;
      cleanup();
      return s;
    };
    const all = [bg("desktop", "light"), bg("desktop", "dark"), bg("mobile", "light"), bg("mobile", "dark")];
    expect(new Set(all).size).toBe(4);
    expect(all[1]).toContain("fond-vide-desktop-dark.webp");
  });
});
