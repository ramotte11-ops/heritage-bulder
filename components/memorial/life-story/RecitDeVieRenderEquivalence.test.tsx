// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { MemorialContent } from "@/types/memorial";

/**
 * QG 016 / M2 — correction L1. The Récit adapters now hand both renderers
 * only what they read (`lifeStoryRendererContent`). This proves the
 * RENDER is byte-for-byte unchanged: each renderer, each variant, each
 * language, drawn once from the memorial's full content and once from the
 * reduced content, produces the same HTML.
 */

vi.mock("next/font/google", () => ({
  Cormorant_Garamond: () => ({ variable: "--font-heritage-hero-serif-mock", className: "" }),
  La_Belle_Aurore: () => ({ variable: "--font-heritage-hero-script-mock", className: "" }),
  Playfair_Display: () => ({ variable: "--font-heritage-serif-mock", className: "" }),
  Inter: () => ({ variable: "--font-heritage-sans-mock", className: "" }),
  EB_Garamond: () => ({ variable: "--font-heritage-ceremony-serif-mock", className: "" }),
}));

const { RecitDeVieV2 } = await import("./v2/RecitDeVieV2");
const { RecitDeVieIntemporel } = await import("./RecitDeVieIntemporel");
const { lifeStoryRendererContent } = await import("@/lib/memorial/assembly/renderer-adapters");
const { fullAnnouncementWithTraditions, fullAnnouncementEmptyRecit } = await import("@/lib/memorial/assembly/test-fixtures");

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

afterEach(cleanup);

function published(): MemorialContent {
  return {
    ...fullAnnouncementWithTraditions(),
    lovedThings: { text: "Les jardins au petit matin ; un café au soleil." },
    legacy: { text: "La patience d'écouter." },
    gallery: { items: [{ mediaId: "b09b82fc-2b94-400f-b8ba-252682e048b2", caption: null }] },
  } as unknown as MemorialContent;
}

function html(node: React.ReactElement): string {
  const { container, unmount } = render(node);
  const out = container.innerHTML;
  unmount();
  return out;
}

const CASES: [string, () => MemorialContent][] = [
  ["a full published memorial", published],
  ["three empty matters (HERITAGE fallbacks)", fullAnnouncementEmptyRecit],
];

describe("Récit de vie — render unchanged by the L1 reduction", () => {
  for (const [label, build] of CASES) {
    for (const skinVariant of ["light", "dark"] as const) {
      for (const language of ["fr", "en", "es"] as const) {
        it(`V2, ${label}, ${skinVariant}, ${language}`, () => {
          const content = build();
          const full = html(<RecitDeVieV2 content={content} language={language} skinVariant={skinVariant} />);
          const reduced = html(<RecitDeVieV2 content={lifeStoryRendererContent(content)} language={language} skinVariant={skinVariant} />);
          expect(reduced).toBe(full);
          expect(full.length).toBeGreaterThan(200);
        });

        it(`V1, ${label}, ${skinVariant}, ${language}`, () => {
          const content = build();
          const full = html(<RecitDeVieIntemporel content={content} language={language} skinVariant={skinVariant} />);
          const reduced = html(<RecitDeVieIntemporel content={lifeStoryRendererContent(content)} language={language} skinVariant={skinVariant} />);
          expect(reduced).toBe(full);
          expect(full.length).toBeGreaterThan(200);
        });
      }
    }
  }
});
