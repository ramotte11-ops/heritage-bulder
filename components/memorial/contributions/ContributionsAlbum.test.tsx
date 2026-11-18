// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CONTRIBUTIONS_ALBUM_BACKGROUND } from "@/config/contributions-album-v1";
import { ContributionsAlbum } from "@/components/memorial/contributions/ContributionsAlbum";
import { ContributionsSection } from "@/components/memorial/contributions/ContributionsSection";
import type { ContributionContent } from "@/components/memorial/contributions/ContributionsSceneDesktop";
import type { ContributionSceneItem } from "@/lib/memorial/contributions/contributions-scene";
import { DEMO_CLOSING, DEMO_SUBTITLE, DEMO_TITLE, demoContributions } from "@/lib/memorial/contributions/demo-contributions";

/** M6 — Album complet : ordre de la source, cartes consultables, retour à l'hommage. */

beforeAll(() => {
  const proto = HTMLDialogElement.prototype as HTMLDialogElement & { showModal?: () => void };
  if (typeof proto.showModal !== "function") {
    proto.showModal = function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    };
  }
});

afterEach(cleanup);

function demo(pattern: string, n: number) {
  const all = demoContributions(Array.from({ length: n }, (_, i) => pattern[i % pattern.length]).join(""));
  const items: ContributionSceneItem[] = all.map((it) => ({ id: it.id, kind: it.kind, ...(it.photo ? { photo: it.photo } : {}) }));
  const contents: Record<string, ContributionContent> = Object.fromEntries(all.map((it) => [it.id, it.content]));
  return { items, contents };
}

describe("M6 Contributions — Album complet", () => {
  it("les fonds prolongeables de l'Album existent", () => {
    for (const frame of ["desktop", "mobile"] as const)
      for (const t of ["light", "dark"] as const) {
        const bg = CONTRIBUTIONS_ALBUM_BACKGROUND[frame][t];
        for (const src of [bg.top, bg.middle, bg.bottom]) expect(existsSync(path.join(process.cwd(), "public", src)), src).toBe(true);
      }
  });

  it("toutes les contributions, dans l'ordre de la source, numérotées de planche en planche", () => {
    for (const frame of ["desktop", "mobile"] as const) {
      const { items, contents } = demo("RCRPCC", 14);
      const view = render(<ContributionsAlbum frame={frame} theme="light" items={items} contents={contents} title={DEMO_TITLE} subtitle={DEMO_SUBTITLE} />);
      const root = view.container.querySelector("[data-contributions-album]")!;
      expect(root.getAttribute("data-album-status")).toBe("PASS");
      const order = [...view.container.querySelectorAll<HTMLElement>("[data-item-id]")].map((li) => li.dataset.itemId);
      expect(order).toEqual(items.map((it) => it.id));
      const lists = [...view.container.querySelectorAll<HTMLOListElement>("ol[data-plate]")];
      let next = 1;
      for (const ol of lists) {
        expect(ol.start).toBe(next);
        next += ol.querySelectorAll("li").length;
      }
      for (const b of view.container.querySelectorAll("[data-open-card]")) expect(b.getAttribute("aria-label")).toMatch(/^(Lire les condoléances|Lire le récit|Voir la photographie) de /);
      cleanup();
    }
  });

  it("photographies chargées à l'approche de l'écran (aperçus)", () => {
    const { items, contents } = demo("P", 6);
    const view = render(<ContributionsAlbum frame="mobile" theme="dark" items={items} contents={contents} title={DEMO_TITLE} subtitle={DEMO_SUBTITLE} />);
    const imgs = [...view.container.querySelectorAll<HTMLImageElement>("[data-contribution=photo] img")];
    expect(imgs.length).toBe(6);
    for (const img of imgs) expect(img.getAttribute("loading")).toBe("lazy");
  });

  it("une carte de l'Album s'ouvre en grand et rend le focus à la carte", () => {
    const { items, contents } = demo("CRP", 9);
    const view = render(<ContributionsAlbum frame="desktop" theme="light" items={items} contents={contents} title={DEMO_TITLE} subtitle={DEMO_SUBTITLE} />);
    const card = view.container.querySelectorAll<HTMLButtonElement>("[data-open-card]")[4];
    fireEvent.click(card);
    expect(document.querySelector("dialog[data-contribution-reading]")?.hasAttribute("open")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /Fermer/ }));
    expect(document.querySelector("dialog[data-contribution-reading]")).toBeNull();
    expect(document.activeElement).toBe(card);
  });
});

describe("M6 Contributions — hôte scène ↔ Album", () => {
  it("« Voir tous » ouvre l'Album (scène garée, focus sur Retour) ; Retour revient à la scène, focus sur « Voir tous »", () => {
    const { items, contents } = demo("RCRPCC", 10);
    const view = render(<ContributionsSection theme="light" items={items} contents={contents} title={DEMO_TITLE} subtitle={DEMO_SUBTITLE} closing={DEMO_CLOSING} />);
    const host = view.container.querySelector<HTMLElement>("[data-contributions-section]")!;
    expect(host.dataset.contributionsFrame).toBe("mobile");
    const viewAll = screen.getByRole("button", { name: /Voir tous les messages/ });
    act(() => fireEvent.click(viewAll));
    expect(host.dataset.contributionsView).toBe("album");
    expect(view.container.querySelector("[data-contributions-scene-host]")?.getAttribute("data-contributions-scene-host")).toBe("parked");
    expect(view.container.querySelectorAll("[data-contributions-album] [data-item-id]")).toHaveLength(10);
    const back = view.container.querySelector<HTMLButtonElement>("[data-album-back]")!;
    expect(back.textContent).toContain("Retour");
    expect(document.activeElement).toBe(back);
    act(() => fireEvent.click(back));
    expect(host.dataset.contributionsView).toBe("scene");
    expect(view.container.querySelector("[data-contributions-album]")).toBeNull();
    expect(document.activeElement).toBe(viewAll);
  });

  it("règle PO inchangée : 1 à 3 contributions, pas de « Voir tous » ; dès 4, l'Album est accessible", () => {
    for (const n of [1, 2, 3]) {
      const { items, contents } = demo("CRP", n);
      render(<ContributionsSection theme="dark" items={items} contents={contents} title={DEMO_TITLE} subtitle={DEMO_SUBTITLE} closing={DEMO_CLOSING} />);
      expect(screen.queryByRole("button", { name: /Voir tous les messages/ })).toBeNull();
      cleanup();
    }
    const { items, contents } = demo("CRP", 4);
    render(<ContributionsSection theme="dark" items={items} contents={contents} title={DEMO_TITLE} subtitle={DEMO_SUBTITLE} closing={DEMO_CLOSING} />);
    expect(screen.getByRole("button", { name: /Voir tous les messages/ })).toBeTruthy();
  });
});
