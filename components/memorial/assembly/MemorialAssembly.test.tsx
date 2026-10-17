// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { MemorialContent } from "@/types/memorial";
import { RENDERER_KEYS } from "@/config/memorial-section-renderers";
import { assembleMemorial, type AssembleMemorialInput } from "@/lib/memorial/assembly/assemble-memorial";
import { RENDERER_ADAPTERS } from "@/lib/memorial/assembly/renderer-adapters";
import {
  FIXTURE_DISPLAY_NAME,
  FIXTURE_PERSON_WORDS,
  FIXTURE_READ_URL,
  FIXTURE_TRADITION_ENTRIES,
  fullAnnouncement,
  fullAnnouncementWithTraditions,
  recordingResolver,
  throughA02,
} from "@/lib/memorial/assembly/test-fixtures";

/**
 * Étape 2 — the assembled Memorial rendered through the REAL renderers
 * (no stubbed renderer anywhere): order, a single <h1> (QG D3), the
 * resolved photo, and fail-closed rendering (QG D1). Same jsdom
 * discipline as each renderer's own test: `next/font` mocked,
 * `ResizeObserver` stubbed.
 */

vi.mock("next/font/google", () => ({
  Cormorant_Garamond: () => ({ variable: "--font-heritage-hero-serif-mock", className: "" }),
  La_Belle_Aurore: () => ({ variable: "--font-heritage-hero-script-mock", className: "" }),
  EB_Garamond: () => ({ variable: "--font-heritage-ceremony-serif-mock", className: "" }),
  Playfair_Display: () => ({ variable: "--font-heritage-serif-mock", className: "" }),
  Inter: () => ({ variable: "--font-heritage-sans-mock", className: "" }),
}));

class StubResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", StubResizeObserver);

const { MemorialAssembly } = await import("./MemorialAssembly");
const { setSectionVisibility } = await import("@/lib/memorial/section-visibility");
const { RENDERER_COMPONENTS } = await import("./renderer-registry");
const { HeroIntemporel } = await import("@/components/memorial/hero/HeroIntemporel");
const { DeathNoticeIntemporel } = await import("@/components/memorial/death-notice/DeathNoticeIntemporel");
const { CeremonyIntemporel } = await import("@/components/memorial/ceremony/CeremonyIntemporel");
const { CeremonyV2 } = await import("@/components/memorial/ceremony/v2/CeremonyV2");
const { RecitDeVieIntemporel } = await import("@/components/memorial/life-story/RecitDeVieIntemporel");
const { RecitDeVieV2 } = await import("@/components/memorial/life-story/v2/RecitDeVieV2");
const { TraditionsV2 } = await import("@/components/memorial/traditions/v2/TraditionsV2");
const { TRADITIONS_V2_TOKENS } = await import("@/config/traditions-v2-tokens");

const adapters = RENDERER_ADAPTERS as unknown as Record<string, unknown>;
const originalAdapters = { ...adapters };

afterEach(() => {
  cleanup();
  Object.assign(adapters, originalAdapters);
});

function input(content: MemorialContent, overrides: Partial<AssembleMemorialInput> = {}): AssembleMemorialInput {
  return { skin: "intemporel", skinVariant: "light", language: "fr", content, ...overrides };
}

async function renderAssembly(content: MemorialContent, resolver = recordingResolver()) {
  const assembled = await assembleMemorial(input(content), { resolveMedia: resolver.resolve });
  return { assembled, ...render(<MemorialAssembly assembled={assembled} />) };
}

function sectionIds(container: HTMLElement): (string | null)[] {
  return Array.from(container.querySelectorAll("[data-memorial-section]")).map((el) =>
    el.getAttribute("data-memorial-section"),
  );
}

describe("MemorialAssembly — the real renderers, in the composition's order", () => {
  it("renders every assembled section, in order, each in its own neutral block", async () => {
    const { container, assembled } = await renderAssembly(fullAnnouncement());
    expect(sectionIds(container)).toEqual(["hero", "deathNotice", "ceremony", "story"]);
    expect(sectionIds(container)).toEqual(assembled.composition.renderable);

    for (const block of Array.from(container.querySelectorAll("[data-memorial-section]"))) {
      expect(block.getAttribute("class")).toBeNull();
      expect(block.getAttribute("style")).toBeNull();
    }
  });

  it("each block holds its own real renderer", async () => {
    const { container } = await renderAssembly(fullAnnouncement());
    const block = (id: string) => container.querySelector(`[data-memorial-section="${id}"]`) as HTMLElement;

    expect(block("hero").querySelector('img[src*="hero-runtime-light-desktop.png"]')).toBeTruthy();
    expect(block("deathNotice").querySelector('img[src*="a03-scene-top.png"]')).toBeTruthy();
    expect(block("story").querySelector('[data-testid="recit-de-vie-v2"]')).toBeTruthy();
    expect(block("story").textContent).toContain(FIXTURE_PERSON_WORDS);
    expect(block("ceremony").querySelector('[data-testid="ceremony-v2"]')).toBeTruthy();
  });

  it("the Hero shows the resolved photo URL", async () => {
    const { container } = await renderAssembly(fullAnnouncement());
    const hero = container.querySelector('[data-memorial-section="hero"]') as HTMLElement;
    expect(hero.querySelector(`img[src="${FIXTURE_READ_URL}"]`)).toBeTruthy();
  });

  it("every skin scope is Intemporel — never another skin", async () => {
    const { container } = await renderAssembly(fullAnnouncement());
    const scopes = Array.from(container.querySelectorAll("[data-heritage-skin]"));
    expect(scopes.length).toBe(4);
    for (const scope of scopes) expect(scope.getAttribute("data-heritage-skin")).toBe("intemporel");
  });
});

describe("MemorialAssembly — heading hierarchy (QG D3)", () => {
  it("the Hero's name is the only <h1>", async () => {
    const { container } = await renderAssembly(fullAnnouncement());
    const h1s = Array.from(container.querySelectorAll("h1"));
    expect(h1s).toHaveLength(1);
    expect(h1s[0].textContent).toBe(FIXTURE_DISPLAY_NAME);
    expect(h1s[0].closest("[data-memorial-section]")?.getAttribute("data-memorial-section")).toBe("hero");
  });

  it("the Avis title is an <h2> and its name an <h3>", async () => {
    const { container } = await renderAssembly(fullAnnouncement());
    const notice = container.querySelector('[data-memorial-section="deathNotice"]') as HTMLElement;
    expect(notice.querySelector("h1")).toBeNull();
    expect(notice.querySelector("h2")?.textContent).toBe("Avis de décès");
    expect(notice.querySelector("h3")?.textContent).toBe(FIXTURE_DISPLAY_NAME);
  });
});

describe("MemorialAssembly — fail closed (QG D1)", () => {
  it("an unavailable Memorial (Hero media unresolvable) renders nothing at all", async () => {
    const { container, assembled } = await renderAssembly(fullAnnouncement(), recordingResolver(() => null));
    expect(assembled.status).toBe("unavailable");
    expect(container.innerHTML).toBe("");
  });

  it("nothing renderable yet renders nothing at all", async () => {
    const { container } = await renderAssembly({});
    expect(container.innerHTML).toBe("");
  });

  it("a failed non-Hero section leaves no trace — no placeholder, no other renderer", async () => {
    adapters.CeremonyV2 = async () => ({ ok: false, reason: "contentUnreadable" });
    const { container } = await renderAssembly(fullAnnouncement());
    expect(sectionIds(container)).toEqual(["hero", "deathNotice", "story"]);
    expect(container.querySelector('[data-testid="ceremony-v2"]')).toBeNull();
  });

  it("Hero-only Memorial renders the Hero alone", async () => {
    const { container } = await renderAssembly(throughA02());
    expect(sectionIds(container)).toEqual(["hero"]);
  });
});

describe("renderer registry", () => {
  it("maps every renderer key, and only those, to its real validated component", () => {
    expect(Object.keys(RENDERER_COMPONENTS).sort()).toEqual([...RENDERER_KEYS].sort());
    expect(RENDERER_COMPONENTS.HeroIntemporel).toBe(HeroIntemporel);
    expect(RENDERER_COMPONENTS.DeathNoticeIntemporel).toBe(DeathNoticeIntemporel);
    expect(RENDERER_COMPONENTS.CeremonyIntemporel).toBe(CeremonyIntemporel);
    expect(RENDERER_COMPONENTS.CeremonyV2).toBe(CeremonyV2);
    expect(RENDERER_COMPONENTS.RecitDeVieIntemporel).toBe(RecitDeVieIntemporel);
    expect(RENDERER_COMPONENTS.RecitDeVieV2).toBe(RecitDeVieV2);
    expect(RENDERER_COMPONENTS.TraditionsV2).toBe(TraditionsV2);
  });
});

describe("MemorialAssembly — « Gérer les rubriques visibles »: hidden sections, and the archive links", () => {
  const hide = (content: MemorialContent, ...ids: ("deathNotice" | "ceremony" | "story")[]) =>
    ids.reduce((c, id) => {
      const next = setSectionVisibility(c, id, false, "intemporel");
      if (!next.ok) throw new Error("fixture");
      return next.content;
    }, content);

  it("a hidden section is absent from the flow; an archived one sits behind a closed, discreet link after it", async () => {
    const { container } = await renderAssembly(hide(fullAnnouncement(), "deathNotice", "ceremony", "story"));
    expect(sectionIds(container)).toEqual(["hero"]);
    const archives = container.querySelector("[data-memorial-archives]") as HTMLElement;
    expect(archives).toBeTruthy();
    const entries = [...archives.querySelectorAll("details")];
    expect(entries.map((d) => d.getAttribute("data-memorial-archive"))).toEqual(["deathNotice", "ceremony"]);
    expect(entries.every((d) => !d.open)).toBe(true);
    expect(entries.map((d) => d.querySelector("summary")?.textContent)).toEqual([
      "Consulter l'annonce de décès",
      "Consulter les informations de la cérémonie",
    ]);
    // The secondary presentation is the section's OWN renderer, unchanged.
    expect(entries[0].querySelector("[data-memorial-archive] > div")).toBeTruthy();
    expect(entries[0].textContent).toContain(FIXTURE_DISPLAY_NAME);
  });

  it("no archive strip at all when nothing is archived (story hidden only, or nothing hidden)", async () => {
    const { container } = await renderAssembly(hide(fullAnnouncement(), "story"));
    expect(container.querySelector("[data-memorial-archives]")).toBeNull();
    expect(sectionIds(container)).toEqual(["hero", "deathNotice", "ceremony"]);
  });

  it("the archive link is translated with the memorial's language", async () => {
    const assembled = await assembleMemorial(input(hide(fullAnnouncement(), "ceremony"), { language: "en" }), {
      resolveMedia: recordingResolver().resolve,
    });
    const { container } = render(<MemorialAssembly assembled={assembled} />);
    expect(container.querySelector("summary")?.textContent).toBe("View the ceremony details");
  });
});

describe("MemorialAssembly — Traditions & repères V2 (M1), the real validated renderer", () => {
  async function renderWith(content: MemorialContent, overrides: Partial<AssembleMemorialInput> = {}) {
    const assembled = await assembleMemorial(input(content, overrides), { resolveMedia: recordingResolver().resolve });
    return render(<MemorialAssembly assembled={assembled} />);
  }

  it("sits right after the Récit, in its own neutral block", async () => {
    const { container } = await renderWith(fullAnnouncementWithTraditions());
    expect(sectionIds(container)).toEqual(["hero", "deathNotice", "ceremony", "story", "traditions"]);
    const block = container.querySelector('[data-memorial-section="traditions"]') as HTMLElement;
    expect(block.getAttribute("class")).toBeNull();
    expect(block.getAttribute("style")).toBeNull();
    expect(block.querySelector('[data-testid="traditions-v2"]')).toBeTruthy();
  });

  it("the family's repères, in their order, titles and texts unchanged", async () => {
    const { container } = await renderWith(fullAnnouncementWithTraditions());
    const block = container.querySelector('[data-memorial-section="traditions"]') as HTMLElement;
    const entries = Array.from(block.querySelectorAll("[data-entry]"));
    expect(entries.map((entry) => entry.getAttribute("data-entry"))).toEqual(FIXTURE_TRADITION_ENTRIES.map((e) => e.id));
    expect(entries.map((entry) => entry.querySelector("p")?.textContent)).toEqual(FIXTURE_TRADITION_ENTRIES.map((e) => e.text));
    expect(entries[0].querySelector("h3")?.textContent).toBe("Une bougie");
    expect(entries[1].querySelector("h3")).toBeNull();
  });

  it("keeps the Hero's name the only <h1>: Traditions at section level (<h2>, repères <h3>)", async () => {
    const { container } = await renderWith(fullAnnouncementWithTraditions());
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    const block = container.querySelector('[data-memorial-section="traditions"]') as HTMLElement;
    expect(block.querySelector("h1")).toBeNull();
    expect(block.querySelector("h2")?.textContent).toBe("Traditions & repères");
  });

  it.each([
    ["light", "fr", "Traditions & repères"],
    ["dark", "fr", "Traditions & repères"],
    ["light", "en", "Traditions & personal notes"],
    ["dark", "es", "Tradiciones y detalles"],
  ] as const)(
    "%s / %s: the variant's own Mobile and Desktop décor, the memorial's language",
    async (skinVariant, language, title) => {
      const { container } = await renderWith(fullAnnouncementWithTraditions(), { skinVariant, language });
      const block = container.querySelector('[data-memorial-section="traditions"]') as HTMLElement;
      const wrap = block.querySelector("[data-variant]") as HTMLElement;
      expect(wrap.getAttribute("data-variant")).toBe(skinVariant);
      expect(wrap.getAttribute("lang")).toBe(language);
      // Desktop tokens present: the stylesheet switches to the Desktop Master at ≥ 1024 px of container.
      expect(wrap.hasAttribute("data-desktop")).toBe(true);
      const tokens = TRADITIONS_V2_TOKENS[skinVariant]!;
      expect(wrap.getAttribute("style")).toContain(tokens.mobile.masterSrc);
      const section = block.querySelector('[data-testid="traditions-v2"]') as HTMLElement;
      expect(section.getAttribute("style")).toContain(tokens.desktop!.masterSrc);
      expect(block.querySelector("h2")?.textContent).toBe(title);
      expect(block.querySelector("[data-heritage-skin]")?.getAttribute("data-heritage-skin")).toBe("intemporel");
    },
  );

  it("hidden by the family: no Traditions block, no archive link for it", async () => {
    const hidden = setSectionVisibility(fullAnnouncementWithTraditions(), "traditions", false, "intemporel");
    if (!hidden.ok) throw new Error("fixture");
    const { container } = await renderWith(hidden.content);
    expect(sectionIds(container)).toEqual(["hero", "deathNotice", "ceremony", "story"]);
    expect(container.querySelector('[data-testid="traditions-v2"]')).toBeNull();
    expect(container.querySelector("[data-memorial-archives]")).toBeNull();
  });

  it("no repère: no Traditions block at all — never the HERITAGE frame alone", async () => {
    const { container } = await renderWith(fullAnnouncement());
    expect(container.querySelector('[data-testid="traditions-v2"]')).toBeNull();
  });
});
