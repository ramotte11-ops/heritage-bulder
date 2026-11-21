// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { CONTRIBUTIONS_MOBILE_BACKGROUND, CONTRIBUTIONS_MOBILE_LAYOUTS, CONTRIBUTIONS_MOBILE_TYPE_CSS } from "@/config/contributions-mobile-v1";
import { ContributionsSceneMobile } from "@/components/memorial/contributions/ContributionsSceneMobile";
import type { ContributionContent } from "@/components/memorial/contributions/ContributionsSceneDesktop";
import { solveContributionsScene } from "@/lib/memorial/contributions/contributions-scene";
import { DEMO_CLOSING, DEMO_SUBTITLE, DEMO_TITLE, demoContributions } from "@/lib/memorial/contributions/demo-contributions";

/** M5-B — prototype Mobile : la scène affiche ce que le moteur a résolu, textes en px CSS fixes. */

afterEach(cleanup);

function renderMobile(layoutId: keyof typeof CONTRIBUTIONS_MOBILE_LAYOUTS, combo: string, theme: "light" | "dark" = "light") {
  const layout = CONTRIBUTIONS_MOBILE_LAYOUTS[layoutId];
  const items = demoContributions(combo).slice(0, layout.sceneCapacity);
  const scene = solveContributionsScene(items, { frame: "mobile", theme, geometry: layout.geometry[theme] });
  const contents: Record<string, ContributionContent> = Object.fromEntries(items.map((it) => [it.id, it.content]));
  return render(<ContributionsSceneMobile theme={theme} layout={layout} placements={scene.placements} contents={contents} viewAll={scene.viewAll} title={DEMO_TITLE} subtitle={DEMO_SUBTITLE} closing={DEMO_CLOSING} />);
}

describe("M5-B Contributions — prototype Mobile", () => {
  it("les fonds Mobile prolongeables existent", () => {
    for (const t of ["light", "dark"] as const) for (const src of [CONTRIBUTIONS_MOBILE_BACKGROUND[t].top, CONTRIBUTIONS_MOBILE_BACKGROUND[t].middle, CONTRIBUTIONS_MOBILE_BACKGROUND[t].bottom]) expect(existsSync(path.join(process.cwd(), "public", src)), src).toBe(true);
  });

  it("colonne, quatre contributions : quatre identités graphiques, deux boutons", () => {
    const view = renderMobile("colonne", "RCRP", "dark");
    expect(view.container.querySelectorAll("[data-contribution]")).toHaveLength(4);
    expect(screen.getByRole("button", { name: "Laisser un message" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Voir tous les messages/ })).toBeTruthy();
  });

  it("le corps du texte est en px CSS fixes (jamais réduit avec la largeur)", () => {
    const view = renderMobile("grille-2x2", "CCCC");
    const bodies = [...view.container.querySelectorAll<HTMLElement>("[data-capacity]")];
    expect(bodies.length).toBe(4);
    for (const b of bodies) expect(b.style.fontSize).toBe(`${CONTRIBUTIONS_MOBILE_TYPE_CSS.condolenceBody}px`);
  });

  it("une contribution seule : pas de « Voir tous les messages »", () => {
    renderMobile("colonne", "R");
    expect(screen.queryByRole("button", { name: /Voir tous les messages/ })).toBeNull();
  });
});
