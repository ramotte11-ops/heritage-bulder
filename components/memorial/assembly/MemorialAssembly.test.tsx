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
  fullAnnouncement,
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
const { RENDERER_COMPONENTS } = await import("./renderer-registry");
const { HeroIntemporel } = await import("@/components/memorial/hero/HeroIntemporel");
const { DeathNoticeIntemporel } = await import("@/components/memorial/death-notice/DeathNoticeIntemporel");
const { CeremonyIntemporel } = await import("@/components/memorial/ceremony/CeremonyIntemporel");
const { RecitDeVieIntemporel } = await import("@/components/memorial/life-story/RecitDeVieIntemporel");

const adapters = RENDERER_ADAPTERS as unknown as Record<string, unknown>;
const originalAdapters = { ...adapters };

afterEach(() => {
  cleanup();
  Object.assign(adapters, originalAdapters);
});

function input(content: MemorialContent, overrides: Partial<AssembleMemorialInput> = {}): AssembleMemorialInput {
  return { editorialContext: "announcement", skin: "intemporel", skinVariant: "light", language: "fr", content, ...overrides };
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
    expect(sectionIds(container)).toEqual(["hero", "deathNotice", "story", "ceremony"]);
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
    expect(block("story").querySelector('[data-testid="recit-de-vie-intemporel"]')).toBeTruthy();
    expect(block("story").textContent).toContain(FIXTURE_PERSON_WORDS);
    expect(block("ceremony").querySelector('[data-testid="ceremony-intemporel"]')).toBeTruthy();
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
    adapters.CeremonyIntemporel = async () => ({ ok: false, reason: "contentUnreadable" });
    const { container } = await renderAssembly(fullAnnouncement());
    expect(sectionIds(container)).toEqual(["hero", "deathNotice", "story"]);
    expect(container.querySelector('[data-testid="ceremony-intemporel"]')).toBeNull();
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
    expect(RENDERER_COMPONENTS.RecitDeVieIntemporel).toBe(RecitDeVieIntemporel);
  });
});
