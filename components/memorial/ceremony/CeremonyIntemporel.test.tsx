// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, render } from "@testing-library/react";
import type { MemorialContent } from "@/types/memorial";
import { EMPTY_CEREMONY_CONTENT, type CeremonyContent } from "@/types/ceremony";

/**
 * Mission 040B — contract tests for the real Ceremony Memorial renderer.
 * Same discipline as HeroIntemporel.test.tsx/DeathNoticeIntemporel.test.tsx:
 * state/render contracts (what mounts, what text/asset shows for which
 * data), never computed CSS/pixel layout from a real browser engine —
 * that is this mission's separate QA screenshot pass (Playwright,
 * against a real browser), not a jsdom unit test's job.
 */

vi.mock("next/font/google", () => ({
  Cormorant_Garamond: () => ({ variable: "--font-heritage-hero-serif-mock", className: "" }),
  La_Belle_Aurore: () => ({ variable: "--font-heritage-hero-script-mock", className: "" }),
  Playfair_Display: () => ({ variable: "--font-heritage-serif-mock", className: "" }),
  Inter: () => ({ variable: "--font-heritage-sans-mock", className: "" }),
  EB_Garamond: () => ({ variable: "--font-heritage-ceremony-serif-mock", className: "eb-garamond-mock" }),
}));

const { CeremonyIntemporel } = await import("./CeremonyIntemporel");

afterEach(cleanup);

function contentWith(ceremony: Partial<CeremonyContent>): MemorialContent {
  return { ceremony: { ...EMPTY_CEREMONY_CONTENT, ...ceremony } };
}

function renderCeremony(overrides: Partial<React.ComponentProps<typeof CeremonyIntemporel>> = {}) {
  return render(
    <CeremonyIntemporel
      content={contentWith({ date: "2023-10-21", time: "14:00", venueName: "Église Saint-Joseph", address: "1234, rue des Érables, Lyon", access: "Entrée par la cour intérieure.", note: null })}
      language="fr"
      skinVariant="light"
      {...overrides}
    />,
  );
}

describe("CeremonyIntemporel — the Studio's own runtime masters, nothing recomposed", () => {
  it("renders both the light desktop and light mobile masters (one hidden by CSS, the DOM stays single)", () => {
    const { container } = renderCeremony({ skinVariant: "light" });
    expect(container.querySelector('img[src*="ceremonie-master-desktop-light.png"]')).toBeTruthy();
    expect(container.querySelector('img[src*="ceremonie-master-mobile-light.png"]')).toBeTruthy();
    expect(container.querySelector('img[src*="dark"]')).toBeNull();
  });

  it("renders the dark masters when skinVariant is dark", () => {
    const { container } = renderCeremony({ skinVariant: "dark" });
    expect(container.querySelector('img[src*="ceremonie-master-desktop-dark.png"]')).toBeTruthy();
    expect(container.querySelector('img[src*="ceremonie-master-mobile-dark.png"]')).toBeTruthy();
    expect(container.querySelector('img[src*="/light/"]')).toBeNull();
  });

  it("uses the Studio icon/separator/sprig assets verbatim — never an inline SVG/CSS-drawn icon", () => {
    const { container } = renderCeremony();
    expect(container.querySelector('img[src*="icon-calendar.png"]')).toBeTruthy();
    expect(container.querySelector('img[src*="icon-location.png"]')).toBeTruthy();
    expect(container.querySelector('img[src*="icon-info.png"]')).toBeTruthy();
    expect(container.querySelector('img[src*="title-sprig.png"]')).toBeTruthy();
    expect(container.querySelector('img[src*="closing-heart-sprig.png"]')).toBeTruthy();
    expect(container.querySelector('img[src*="separator-vertical.png"]')).toBeTruthy();
    expect(container.querySelectorAll('img[src*="separator-horizontal.png"]').length).toBeGreaterThan(0);
    expect(container.querySelector("svg")).toBeNull();
  });

  it("renders the fixed section title", () => {
    const { getByText } = renderCeremony({ language: "fr" });
    expect(getByText("Cérémonie")).toBeTruthy();
  });
});

describe("CeremonyIntemporel — FULL vs NO_PRACTICAL_INFO (geometry.json's own closed state list)", () => {
  it("FULL: practical block, its icon, and its own closing rule/box render when access or note is present", () => {
    const { container, getByText } = renderCeremony({
      content: contentWith({ access: "Entrée par la cour intérieure." }),
    });
    expect(getByText("Informations pratiques")).toBeTruthy();
    expect(getByText("Entrée par la cour intérieure.")).toBeTruthy();
    expect(container.querySelector('img[src*="icon-info.png"]')).toBeTruthy();
  });

  it("NO_PRACTICAL_INFO: the practical block and its icon are entirely absent — never an empty reserved block", () => {
    const { container, queryByText } = renderCeremony({
      content: contentWith({ access: null, note: null }),
    });
    expect(queryByText("Informations pratiques")).toBeNull();
    expect(container.querySelector('img[src*="icon-info.png"]')).toBeNull();
  });

  it("the closing sprig still renders in both states (one asset, two different positions)", () => {
    const full = renderCeremony({ content: contentWith({ access: "x" }) });
    expect(full.container.querySelector('img[src*="closing-heart-sprig.png"]')).toBeTruthy();
    full.unmount();

    const noPractical = renderCeremony({ content: contentWith({ access: null, note: null }) });
    expect(noPractical.container.querySelector('img[src*="closing-heart-sprig.png"]')).toBeTruthy();
  });
});

describe("CeremonyIntemporel — date/heure field states", () => {
  it("DATE_ONLY: renders the date, no blank second line", () => {
    const { getByText, queryByText } = renderCeremony({
      content: contentWith({ date: "2023-10-21", time: null }),
    });
    expect(getByText("Samedi 21 octobre 2023")).toBeTruthy();
    expect(queryByText(/^à /)).toBeNull();
  });

  it("TIME_ONLY: renders the time, no blank first line", () => {
    const { getByText, queryByText } = renderCeremony({
      content: contentWith({ date: null, time: "14:00" }),
    });
    expect(getByText("à 14 h 00")).toBeTruthy();
    expect(queryByText("Samedi 21 octobre 2023")).toBeNull();
  });

  it("DATE_TIME: date first, time second", () => {
    const { getByText } = renderCeremony({
      content: contentWith({ date: "2023-10-21", time: "14:00" }),
    });
    expect(getByText("Samedi 21 octobre 2023")).toBeTruthy();
    expect(getByText("à 14 h 00")).toBeTruthy();
  });

  it("QG-locked rule (Mission 040B finalization): neither date nor time present — the whole dateTime zone (icon + label + text) disappears, no placeholder, no reserved blank space", () => {
    const { container, queryByText } = renderCeremony({
      content: contentWith({ date: null, time: null }),
    });
    expect(queryByText("Date et heure")).toBeNull();
    expect(container.querySelector('img[src*="icon-calendar.png"]')).toBeNull();
  });

  it("the empty-dateTime rule never touches the other Studio zones (title, sprig, lieu, closing all still render)", () => {
    const { container, getByText } = renderCeremony({
      content: contentWith({ date: null, time: null, venueName: "Église Saint-Joseph" }),
    });
    expect(getByText("Cérémonie")).toBeTruthy();
    expect(container.querySelector('img[src*="title-sprig.png"]')).toBeTruthy();
    expect(getByText("Église Saint-Joseph")).toBeTruthy();
    expect(container.querySelector('img[src*="closing-heart-sprig.png"]')).toBeTruthy();
  });
});

describe("CeremonyIntemporel — lieu/adresse field states", () => {
  it("PLACE_ONLY: venue alone", () => {
    const { getByText, queryByText } = renderCeremony({
      content: contentWith({ venueName: "Église Saint-Joseph", address: null }),
    });
    expect(getByText("Église Saint-Joseph")).toBeTruthy();
    expect(queryByText(/rue des/)).toBeNull();
  });

  it("ADDRESS_ONLY: address alone", () => {
    const { getByText, queryByText } = renderCeremony({
      content: contentWith({ venueName: null, address: "1234, rue des Érables, Lyon" }),
    });
    expect(getByText("1234, rue des Érables, Lyon")).toBeTruthy();
    expect(queryByText("Église Saint-Joseph")).toBeNull();
  });

  it("PLACE_ADDRESS: venue then address", () => {
    const { getByText } = renderCeremony({
      content: contentWith({ venueName: "Église Saint-Joseph", address: "1234, rue des Érables, Lyon" }),
    });
    expect(getByText("Église Saint-Joseph")).toBeTruthy();
    expect(getByText("1234, rue des Érables, Lyon")).toBeTruthy();
  });

  it("QG-locked rule (Mission 040B finalization): neither venue nor address present — the whole placeAddress zone disappears, no placeholder, no reserved blank space", () => {
    const { container, queryByText } = renderCeremony({
      content: contentWith({ venueName: null, address: null }),
    });
    expect(queryByText("Lieu de la cérémonie")).toBeNull();
    expect(container.querySelector('img[src*="icon-location.png"]')).toBeNull();
  });

  it("the empty-placeAddress rule never touches the other Studio zones (title, sprig, date/heure, closing all still render)", () => {
    const { container, getByText } = renderCeremony({
      content: contentWith({ venueName: null, address: null, date: "2023-10-21" }),
    });
    expect(getByText("Cérémonie")).toBeTruthy();
    expect(container.querySelector('img[src*="title-sprig.png"]')).toBeTruthy();
    expect(getByText("Samedi 21 octobre 2023")).toBeTruthy();
    expect(container.querySelector('img[src*="closing-heart-sprig.png"]')).toBeTruthy();
  });
});

describe("CeremonyIntemporel — informations pratiques field states", () => {
  it("access alone", () => {
    const { getByText, queryByText } = renderCeremony({
      content: contentWith({ access: "Entrée par la cour intérieure.", note: null }),
    });
    expect(getByText("Entrée par la cour intérieure.")).toBeTruthy();
    expect(queryByText("Merci d'arriver tôt.")).toBeNull();
  });

  it("note alone", () => {
    const { getByText, queryByText } = renderCeremony({
      content: contentWith({ access: null, note: "Merci d'arriver tôt." }),
    });
    expect(getByText("Merci d'arriver tôt.")).toBeTruthy();
    expect(queryByText("Entrée par la cour intérieure.")).toBeNull();
  });

  it("access + note: both render, no invented separator between them", () => {
    const { getByText } = renderCeremony({
      content: contentWith({ access: "Entrée par la cour intérieure.", note: "Merci d'arriver tôt." }),
    });
    expect(getByText("Entrée par la cour intérieure.")).toBeTruthy();
    expect(getByText("Merci d'arriver tôt.")).toBeTruthy();
  });
});

describe("CeremonyIntemporel — Light/Dark ink", () => {
  it("sets the light ink custom properties", () => {
    const { container } = renderCeremony({ skinVariant: "light" });
    const wrap = container.querySelector('[data-testid="ceremony-intemporel"]') as HTMLElement;
    expect(wrap.style.getPropertyValue("--ceremony-ink-text-primary")).toBe("#373226");
  });

  it("sets the dark ink custom properties", () => {
    const { container } = renderCeremony({ skinVariant: "dark" });
    const wrap = container.querySelector('[data-testid="ceremony-intemporel"]') as HTMLElement;
    expect(wrap.style.getPropertyValue("--ceremony-ink-text-primary")).toBe("#F1E5D2");
  });

  it("never uses prefers-color-scheme — skinVariant alone decides", () => {
    const { container } = renderCeremony({ skinVariant: "dark" });
    expect(container.innerHTML).not.toContain("prefers-color-scheme");
  });
});

describe("CeremonyIntemporel — Mission 041: renders identically regardless of content.deathNotice", () => {
  it("the same ceremony data renders the same date/heure/lieu/adresse whether deathNotice is absent, present, or a completely different value", () => {
    const ceremony = { date: "2023-10-21", time: "14:00", venueName: "Église Saint-Joseph", address: "1234, rue des Érables, Lyon", access: null, note: null };

    const first = render(<CeremonyIntemporel content={{ ceremony }} language="fr" skinVariant="light" />);
    const dateText = first.getByText("Samedi 21 octobre 2023").textContent;
    const venueText = first.getByText("Église Saint-Joseph").textContent;
    cleanup();

    const second = render(
      <CeremonyIntemporel
        content={{
          ceremony,
          deathNotice: {
            announcementText: "Un texte d'annonce sans rapport.",
            precisions: { generalLocation: "Ailleurs", familyMessage: null, thought: null, quote: null, other: null },
          },
        }}
        language="fr"
        skinVariant="light"
      />,
    );

    expect(second.getByText("Samedi 21 octobre 2023").textContent).toBe(dateText);
    expect(second.getByText("Église Saint-Joseph").textContent).toBe(venueText);
    // The unrelated deathNotice text never leaks into the Ceremony renderer.
    expect(second.queryByText("Un texte d'annonce sans rapport.")).toBeNull();
    expect(second.queryByText(/Ailleurs/)).toBeNull();
  });
});

describe("CeremonyIntemporel — corrupted content never crashes", () => {
  it("a corrupted content.ceremony (unknown key) renders the empty/absent fallback instead of throwing", () => {
    const corrupted: MemorialContent = {
      ceremony: { venueName: "Église", cause: "x" } as unknown as MemorialContent["ceremony"],
    };
    expect(() => renderCeremony({ content: corrupted })).not.toThrow();
    const { queryByText } = renderCeremony({ content: corrupted });
    expect(queryByText("Église")).toBeNull();
  });

  it("a corrupted content.ceremony (wrong type) renders without throwing", () => {
    const corrupted: MemorialContent = { ceremony: "not an object" as unknown as MemorialContent["ceremony"] };
    expect(() => renderCeremony({ content: corrupted })).not.toThrow();
  });

  it("an entirely absent content.ceremony renders without throwing (nothing planned yet)", () => {
    expect(() => renderCeremony({ content: {} })).not.toThrow();
  });
});

describe("CeremonyIntemporel — i18n zone labels resolve per language", () => {
  it("English", () => {
    const { getByText } = renderCeremony({ language: "en" });
    expect(getByText("Ceremony")).toBeTruthy();
    expect(getByText("Date and time")).toBeTruthy();
    expect(getByText("Ceremony location")).toBeTruthy();
  });

  it("Spanish", () => {
    const { getByText } = renderCeremony({ language: "es" });
    expect(getByText("Ceremonia")).toBeTruthy();
    expect(getByText("Fecha y hora")).toBeTruthy();
  });
});

describe("CeremonyIntemporel — master images never carry an anisotropic-scaling mechanism (QG audit, Mission 040B finalization)", () => {
  it("neither master <img> has an inline style or class beyond the intrinsic-ratio one", () => {
    const { container } = renderCeremony();
    const desktop = container.querySelector('img[src*="ceremonie-master-desktop-light.png"]') as HTMLImageElement;
    const mobile = container.querySelector('img[src*="ceremonie-master-mobile-light.png"]') as HTMLImageElement;
    expect(desktop.getAttribute("style")).toBeNull();
    expect(mobile.getAttribute("style")).toBeNull();
  });

  it("source-level guard: the module stylesheet sizes both masters by width only (height: auto), never object-fit or transform", () => {
    const css = readFileSync(path.resolve(import.meta.dirname, "CeremonyIntemporel.module.css"), "utf8");
    const masterRule = css.match(/\.masterDesktop,\s*\n?\.masterMobile\s*\{[^}]*\}/)?.[0] ?? "";
    expect(masterRule).toContain("width: 100%");
    expect(masterRule).toContain("height: auto");
    expect(css).not.toMatch(/\.master(Desktop|Mobile)[^{]*\{[^}]*object-fit/);
    expect(css).not.toMatch(/\.master(Desktop|Mobile)[^{]*\{[^}]*transform/);
  });
});
