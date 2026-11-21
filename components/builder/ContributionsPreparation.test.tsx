// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { translate } from "@/lib/i18n/translate";
import { NO_CONTRIBUTION_FEATURES, type ContributionsFeatures } from "@/lib/memorial/contributions/contributions-settings";
import type { Language } from "@/config/languages";
import type { SkinVariant } from "@/config/skins";
vi.mock("next/font/google", () => ({
  Playfair_Display: () => ({ variable: "--font-heritage-serif-mock", className: "" }),
  Inter: () => ({ variable: "--font-heritage-sans-mock", className: "" }),
  Cormorant_Garamond: () => ({ variable: "--font-heritage-hero-serif-mock", className: "" }),
  La_Belle_Aurore: () => ({ variable: "--font-heritage-hero-script-mock", className: "" }),
  EB_Garamond: () => ({ variable: "--font-heritage-ceremony-serif-mock", className: "" }),
  Allura: () => ({ variable: "--font-heritage-contributions-signature-mock", className: "" }),
}));

const { ContributionsPreparation } = await import("@/components/builder/ContributionsPreparation");

/** M7 — préparation : interrupteurs, dévoilement progressif, réversibilité, Light / Dark, Desktop / Mobile. */

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function Host({ language = "fr", skinVariant = "light", onChange }: { language?: Language; skinVariant?: SkinVariant; onChange?: (f: ContributionsFeatures) => void }) {
  const [features, setFeatures] = useState<ContributionsFeatures>(NO_CONTRIBUTION_FEATURES);
  return (
    <ContributionsPreparation
      language={language}
      skinVariant={skinVariant}
      features={features}
      onChange={(f) => {
        setFeatures(f);
        onChange?.(f);
      }}
    />
  );
}

const preview = (c: HTMLElement) => c.querySelector<HTMLElement>("[data-contributions-builder-preview]")!;
const sw = (key: "condolences" | "stories" | "photos") => screen.getByRole("switch", { name: new RegExp(translate("fr", `contributionsStep.${key}`)) });

describe("M7 — ContributionsPreparation", () => {
  it("trois interrupteurs accessibles, fermés au départ ; scène vierge (B0)", () => {
    const view = render(<Host />);
    for (const k of ["condolences", "stories", "photos"] as const) expect((sw(k) as HTMLInputElement).checked).toBe(false);
    expect(preview(view.container).dataset.visibleCount).toBe("0");
    expect(view.container.querySelectorAll("[data-contribution]")).toHaveLength(0);
    expect(screen.getByText(translate("fr", "contributionsStep.previewEmpty"))).toBeTruthy();
  });

  it("dévoilement progressif : chaque fonctionnalité fait apparaître ses cartes ; la retirer revient à l'état antérieur", () => {
    const view = render(<Host />);
    const kinds = () => [...view.container.querySelectorAll<HTMLElement>("[data-contribution]")].map((li) => li.dataset.contribution).sort();
    fireEvent.click(sw("condolences"));
    expect(kinds()).toEqual(["condolence"]);
    fireEvent.click(sw("stories"));
    expect(kinds()).toEqual(["condolence", "story", "story"]);
    fireEvent.click(sw("photos"));
    expect(kinds()).toEqual(["condolence", "photo", "story", "story"]);
    expect(screen.getByText(translate("fr", "contributionsStep.previewNote"))).toBeTruthy();
    fireEvent.click(sw("stories"));
    expect(kinds()).toEqual(["condolence", "photo"]);
    fireEvent.click(sw("condolences"));
    fireEvent.click(sw("photos"));
    expect(kinds()).toEqual([]);
  });

  it("les cartes d'exemple s'ouvrent au toucher (lecture agrandie M5-C)", () => {
    const proto = HTMLDialogElement.prototype as HTMLDialogElement & { showModal?: () => void };
    if (typeof proto.showModal !== "function") proto.showModal = function (this: HTMLDialogElement) { this.setAttribute("open", ""); };
    const view = render(<Host />);
    fireEvent.click(sw("condolences"));
    fireEvent.click(view.container.querySelector<HTMLButtonElement>("[data-open-card]")!);
    expect(document.querySelector("dialog[data-contribution-reading='condolence']")).toBeTruthy();
  });

  it("Light / Dark : la scène suit l'ambiance choisie", () => {
    for (const v of ["light", "dark"] as const) {
      const view = render(<Host skinVariant={v} />);
      expect(view.container.querySelector("[data-contributions-scene]")?.getAttribute("data-theme-variant")).toBe(v);
      cleanup();
    }
  });

  it("Desktop dès 64 rem (1024 px) de fenêtre, Mobile P1 en deçà", () => {
    const media = (matches: boolean) =>
      vi.spyOn(window, "matchMedia").mockImplementation((query: string) => ({ matches: matches && query === "(min-width: 64rem)", media: query, onchange: null, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false }) as MediaQueryList);
    if (typeof window.matchMedia !== "function") window.matchMedia = (() => ({ matches: false })) as unknown as typeof window.matchMedia;
    media(true);
    let view = render(<Host />);
    expect(preview(view.container).dataset.frame).toBe("desktop");
    expect(view.container.querySelector("[data-contributions-scene]")?.getAttribute("data-contributions-scene")).toBe("desktop");
    cleanup();
    vi.restoreAllMocks();
    media(false);
    view = render(<Host />);
    expect(preview(view.container).dataset.frame).toBe("mobile");
    expect(view.container.querySelector("[data-contributions-scene]")?.getAttribute("data-contributions-scene")).toBe("mobile");
  });

  it("hors du français : aucun texte de scène non validé, un message neutre à la place", () => {
    const view = render(<Host language="en" />);
    expect(view.container.querySelector("[data-contributions-scene]")).toBeNull();
    expect(screen.getByText(translate("en", "contributionsStep.previewUnavailable"))).toBeTruthy();
    expect(screen.getByRole("switch", { name: new RegExp(translate("en", "contributionsStep.photos")) })).toBeTruthy();
  });

  it("aucune écriture : le composant ne fait que signaler les choix", () => {
    const seen: ContributionsFeatures[] = [];
    render(<Host onChange={(f) => seen.push(f)} />);
    fireEvent.click(sw("photos"));
    expect(seen).toEqual([{ condolences: false, stories: false, photos: true }]);
  });
});
