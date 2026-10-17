// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { CeremonyContent, CeremonyMoment } from "@/types/ceremony";

/**
 * Cérémonie Intemporel V2 — pilote C1 Mobile Light.
 * Contrats du renderer : décor authentique (SHA-256 du ZIP officiel),
 * cartouches présents seulement pour les blocs renseignés (aucun
 * emplacement fantôme), déroulement B1 rendu dans l'ordre de la famille,
 * textes de la famille tels quels, textes HERITAGE traduits.
 * jsdom ne fait aucune mise en page : l'allongement réel du décor et
 * l'absence de débordement sont vérifiés par les captures de validation.
 */

vi.mock("next/font/google", () => ({
  Cormorant_Garamond: () => ({ variable: "--font-heritage-hero-serif-mock", className: "" }),
  La_Belle_Aurore: () => ({ variable: "--font-heritage-hero-script-mock", className: "" }),
  EB_Garamond: () => ({ variable: "--font-heritage-ceremony-serif-mock", className: "" }),
  Playfair_Display: () => ({ variable: "--font-heritage-serif-mock", className: "" }),
  Inter: () => ({ variable: "--font-heritage-sans-mock", className: "" }),
}));

const { CeremonyV2 } = await import("./CeremonyV2");
const { CEREMONY_V2_TOKENS } = await import("@/config/ceremony-v2-tokens");
const { formatCeremonyClock, ceremonyMapUrl } = await import("./format");

afterEach(cleanup);

const ROOT = path.resolve(import.meta.dirname, "../../../..");
const MOBILE_LIGHT = CEREMONY_V2_TOKENS.light!.mobile;
/** SHA-256 de `CEREMONIE_MOBILE_LIGHT_RUNTIME_VIERGE.png` (ZIP officiel). */
const OFFICIAL_MOBILE_LIGHT_SHA256 = "254a036942b2a1102bf03a5bc308190b88ece96b1c1ec44b4331a508b7bca002";

function moment(n: number, time: string | null, label: string, detail: string | null = null): CeremonyMoment {
  return { id: `m${n}`, time, label, detail };
}

const FULL: CeremonyContent = {
  date: "2023-10-21",
  time: "14:00",
  venueName: "Église Saint-Joseph",
  address: "1234, rue des Érables\nLyon, 69002",
  access: "Des places de stationnement sont disponibles.",
  note: "Accessible aux personnes à mobilité réduite.",
  programme: [moment(1, "14:00", "Accueil des proches"), moment(2, null, "Hommage"), moment(3, "16:00", "Verre de l’amitié", "Salle paroissiale")],
};

const EMPTY: CeremonyContent = { date: null, time: null, venueName: null, address: null, access: null, note: null };

function renderCeremony(props: Partial<React.ComponentProps<typeof CeremonyV2>> = {}) {
  return render(<CeremonyV2 ceremony={FULL} language="fr" skinVariant="light" {...props} />);
}

function card(container: HTMLElement, name: string) {
  return container.querySelector(`[data-card="${name}"]`);
}

describe("CeremonyV2 — décor et dérivés", () => {
  it("le décor runtime est le Master vierge officiel, octet pour octet", () => {
    expect(MOBILE_LIGHT.masterSha256).toBe(OFFICIAL_MOBILE_LIGHT_SHA256);
    const digest = createHash("sha256").update(readFileSync(path.join(ROOT, "public", MOBILE_LIGHT.masterSrc))).digest("hex");
    expect(digest).toBe(OFFICIAL_MOBILE_LIGHT_SHA256);
    expect(MOBILE_LIGHT.canvas).toEqual({ width: 941, height: 1671 });
  });

  it("chaque dérivé existe dans le dossier de la variante, et aucun n'est le décor", () => {
    const derived = [MOBILE_LIGHT.paperTone, MOBILE_LIGHT.edgeStrip.src, ...MOBILE_LIGHT.paperGrains.map((g) => g.src)];
    for (const src of [MOBILE_LIGHT.masterSrc, ...derived]) {
      expect(src.startsWith("/assets/ceremony/v2/mobile/light/")).toBe(true);
      expect(existsSync(path.join(ROOT, "public", src))).toBe(true);
    }
    expect(new Set(derived).has(MOBILE_LIGHT.masterSrc)).toBe(false);
  });

  it("la coupe et son fondu tombent dans le Master, entre les cartouches du haut et le pied", () => {
    const T = MOBILE_LIGHT;
    expect(T.cutY - T.fadePx).toBeGreaterThan(T.textTopCanvas);
    expect(T.cutY + T.fadePx).toBeLessThan(T.canvas.height - T.footCanvas);
    expect(T.edgeStrip.heightCanvas).toBeLessThan(T.cutY + T.fadePx);
  });

  it("aucune variante sans réglages : le Dark (C2) ne rend rien et ne se rabat jamais sur le Light", () => {
    const { container } = render(<CeremonyV2 ceremony={FULL} language="fr" skinVariant="dark" />);
    expect(container.innerHTML).toBe("");
  });

  it("le décor est purement décoratif ; pas de surface sans excédent mesuré", () => {
    const { container } = renderCeremony();
    const section = screen.getByTestId("ceremony-v2");
    expect(section.getAttribute("data-extended")).toBe("false");
    expect(container.querySelectorAll('[class*="paper"]:not([class*="cardPaper"])')).toHaveLength(0);
    for (const deco of container.querySelectorAll('[class*="master"], [class*="bottom"]')) {
      expect(deco.getAttribute("aria-hidden")).toBe("true");
    }
  });
});

describe("CeremonyV2 — cartouches présents seulement s'ils ont un contenu", () => {
  it("contenu complet : quatre cartouches, quatre médaillons, dans l'ordre du Master", () => {
    const { container } = renderCeremony();
    expect([...container.querySelectorAll("article")].map((a) => a.getAttribute("data-card"))).toEqual([
      "dateTime",
      "place",
      "programme",
      "practical",
    ]);
    expect(container.querySelectorAll('[data-ornament="medaillon"]')).toHaveLength(4);
  });

  it("sans déroulement : le cartouche et son médaillon disparaissent, sans emplacement fantôme", () => {
    const withoutProgramme: CeremonyContent = { ...FULL };
    delete withoutProgramme.programme;
    const { container } = renderCeremony({ ceremony: withoutProgramme });
    expect(card(container, "programme")).toBeNull();
    expect(container.querySelector("ol")).toBeNull();
    expect(container.querySelectorAll('[data-ornament="medaillon"]')).toHaveLength(3);
    expect(screen.queryByText("Le déroulement")).toBeNull();
  });

  it("un déroulement vide se lit comme absent", () => {
    const { container } = renderCeremony({ ceremony: { ...FULL, programme: [] } });
    expect(card(container, "programme")).toBeNull();
  });

  it.each([
    ["dateTime", { date: null, time: null }],
    ["place", { venueName: null, address: null }],
    ["practical", { access: null, note: null }],
  ] as const)("%s absent quand tous ses champs sont vides", (name, empty) => {
    const { container } = renderCeremony({ ceremony: { ...FULL, ...empty } });
    expect(card(container, name)).toBeNull();
    expect(container.querySelectorAll('[data-ornament="medaillon"]')).toHaveLength(3);
  });

  it("un seul des deux cartouches du haut : il occupe seul la rangée", () => {
    const { container } = renderCeremony({ ceremony: { ...FULL, venueName: null, address: null } });
    const row = card(container, "dateTime")!.parentElement!;
    expect(row.getAttribute("data-count")).toBe("1");
  });

  it("aucun contenu : seuls l'en-tête et le pied HERITAGE restent", () => {
    const { container } = renderCeremony({ ceremony: EMPTY });
    expect(container.querySelectorAll("article")).toHaveLength(0);
    expect(screen.getByText("Cérémonie")).toBeTruthy();
    expect(screen.getByText("Tous unis dans sa mémoire")).toBeTruthy();
  });
});

describe("CeremonyV2 — données de la famille, telles quelles", () => {
  it("date et heure formatées, adresse sur ses lignes, textes inchangés", () => {
    const { container } = renderCeremony();
    expect(screen.getByText("Samedi 21 octobre 2023")).toBeTruthy();
    expect(card(container, "dateTime")!.textContent).toContain("14 h 00");
    expect(screen.getByText("Église Saint-Joseph")).toBeTruthy();
    expect(screen.getByText((_, el) => el?.textContent === "1234, rue des Érables\nLyon, 69002" && el.tagName === "P")).toBeTruthy();
    expect(screen.getByText("Des places de stationnement sont disponibles.")).toBeTruthy();
    expect(screen.getByText("Accessible aux personnes à mobilité réduite.")).toBeTruthy();
  });

  it("le déroulement suit l'ordre de la famille ; heure et précision facultatives", () => {
    const { container } = renderCeremony();
    const items = within(container.querySelector("ol")!).getAllByRole("listitem");
    expect(items.map((li) => li.getAttribute("data-moment"))).toEqual(["m1", "m2", "m3"]);
    expect(items[0].textContent).toBe("14 h 00Accueil des proches");
    expect(items[1].querySelector("time")).toBeNull();
    expect(items[1].textContent).toBe("Hommage");
    expect(items[2].textContent).toBe("16 h 00Verre de l’amitiéSalle paroissiale");
  });

  it("déroulement sans aucune heure : pas de colonne d'heures", () => {
    const { container } = renderCeremony({ ceremony: { ...FULL, programme: [moment(1, null, "Accueil"), moment(2, null, "Hommage")] } });
    expect(container.querySelector("ol")!.getAttribute("data-timed")).toBe("false");
    expect(container.querySelectorAll('[class*="momentTime"]')).toHaveLength(0);
  });

  it.each([1, 2, 4, 8, 12])("%i moment(s) : autant de lignes et de points, aucun nombre imposé", (count) => {
    const programme = Array.from({ length: count }, (_, i) => moment(i + 1, "10:00", `Moment ${i + 1}`));
    const { container } = renderCeremony({ ceremony: { ...FULL, programme } });
    expect(container.querySelectorAll("ol > li")).toHaveLength(count);
    expect(container.querySelectorAll('[class*="momentDot"]')).toHaveLength(count);
  });

  it("le lien « Voir sur la carte » n'existe qu'avec une adresse", () => {
    renderCeremony();
    const link = screen.getByRole("link", { name: /Voir sur la carte/ });
    expect(link.getAttribute("href")).toBe(ceremonyMapUrl(FULL.venueName, FULL.address!));
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    cleanup();
    renderCeremony({ ceremony: { ...FULL, address: null } });
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("Église Saint-Joseph")).toBeTruthy();
  });

  it("ornements masqués aux lecteurs d'écran", () => {
    const { container } = renderCeremony();
    for (const el of container.querySelectorAll("[data-ornament]")) {
      expect(el.closest('[aria-hidden="true"]')).not.toBeNull();
    }
  });
});

describe("CeremonyV2 — textes HERITAGE et niveaux de titre", () => {
  it.each([
    ["fr", "En son honneur", "Cérémonie", "Le déroulement", "Tous unis dans sa mémoire"],
    ["en", "In their honour", "Ceremony", "Order of the ceremony", "United in remembrance"],
    ["es", "En su honor", "Ceremonia", "El desarrollo", "Unidos en su memoria"],
  ] as const)("%s : surtitre, titre, intitulé du déroulement et phrase du pied traduits", (language, surtitle, title, programme, closing) => {
    renderCeremony({ language });
    expect(screen.getByText(surtitle)).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: title })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: programme })).toBeTruthy();
    expect(screen.getByText(closing)).toBeTruthy();
  });

  it("les textes de la famille ne sont jamais traduits", () => {
    renderCeremony({ language: "en" });
    expect(screen.getByText("Accueil des proches")).toBeTruthy();
    expect(screen.getByText("Église Saint-Joseph")).toBeTruthy();
  });

  it("niveaux de titre : page → h1 / h2 ; section → h2 / h3", () => {
    renderCeremony({ headingLevel: "section" });
    expect(screen.getByRole("heading", { level: 2, name: "Cérémonie" })).toBeTruthy();
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(4);
  });

  it("composition des cartouches du haut : auto par défaut, forçable pour la comparaison", () => {
    renderCeremony();
    expect(screen.getByTestId("ceremony-v2").getAttribute("data-top-layout")).toBe("auto");
    cleanup();
    renderCeremony({ topLayout: "stack" });
    expect(screen.getByTestId("ceremony-v2").getAttribute("data-top-layout")).toBe("stack");
  });
});

describe("CeremonyV2 — heures et lien de carte", () => {
  it.each([
    ["14:00", "fr", "14 h 00"],
    ["09:30", "fr", "9 h 30"],
    ["14:00", "es", "14:00"],
    ["14:00", "en", "2:00 PM"],
    ["00:15", "en", "12:15 AM"],
  ] as const)("%s (%s) → %s", (time, language, expected) => {
    expect(formatCeremonyClock(time, language)).toBe(expected);
  });

  it("recherche OpenStreetMap sur le lieu et l'adresse, lignes jointes", () => {
    expect(ceremonyMapUrl("Église", "1 rue A\nLyon")).toBe(
      `https://www.openstreetmap.org/search?query=${encodeURIComponent("Église, 1 rue A, Lyon")}`,
    );
    expect(ceremonyMapUrl(null, "1 rue A")).toBe(`https://www.openstreetmap.org/search?query=${encodeURIComponent("1 rue A")}`);
  });
});
