// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { MemorialContent } from "@/types/memorial";
import type { Skin, SkinVariant } from "@/config/skins";

/**
 * Mission 039B — contract tests for A03's Builder screen
 * (`DeathNoticePreviewStep`). Same discipline as `HeroRevealStep.test.tsx`:
 * state and render contracts, never computed CSS/pixel layout. The skin
 * guard (mission brief section 11) is the one behaviour this file exists
 * to prove above every other Guided Flow screen's own pattern.
 */

const { useRouter, routerRefresh } = vi.hoisted(() => {
  const refresh = vi.fn();
  return { routerRefresh: refresh, useRouter: vi.fn(() => ({ refresh })) };
});
vi.mock("next/navigation", () => ({ useRouter }));

vi.mock("next/font/google", () => ({
  Playfair_Display: () => ({ variable: "--font-heritage-serif-mock", className: "" }),
  Inter: () => ({ variable: "--font-heritage-sans-mock", className: "" }),
  Cormorant_Garamond: () => ({ variable: "--font-heritage-hero-serif-mock", className: "" }),
  La_Belle_Aurore: () => ({ variable: "--font-heritage-hero-script-mock", className: "" }),
  EB_Garamond: () => ({ variable: "--font-heritage-ceremony-serif-mock", className: "" }),
}));

class StubResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", StubResizeObserver);

const { DeathNoticePreviewStep } = await import("./DeathNoticePreviewStep");
const { JourneyContext } = await import("./journey/journey-context");
const { resolveJourney } = await import("@/lib/builder/guided-flow/journey");

afterEach(cleanup);
beforeEach(() => routerRefresh.mockClear());

/** A01 completed, A02 skipped — A03's normal starting point. */
const READY_CONTENT: MemorialContent = {
  hero: {
    displayName: "Jean Dupont",
    birth: { precision: "year", year: 1948 },
    death: { precision: "year", year: 2023 },
    shortPhrase: "Toujours dans nos cœurs",
    photo: null,
  },
  deathNotice: {
    announcementText: "Elle s'en est allée paisiblement, entourée des siens.",
    precisions: {
      generalLocation: null,
      familyMessage: null,
      thought: null,
      quote: null,
      other: null,
    },
  },
  guidedFlow: {
    A01: { status: "completed" },
    A02: { status: "skipped" },
  },
} as unknown as MemorialContent;

function defaultProps() {
  return {
    language: "fr" as const,
    content: READY_CONTENT,
    skin: "intemporel" as Skin,
    skinVariant: "light" as SkinVariant,
    persist: vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" }),
  };
}

function baseProps(overrides: Partial<ReturnType<typeof defaultProps>> = {}) {
  return { ...defaultProps(), ...overrides };
}

describe("DeathNoticePreviewStep — the real renderer, rendered", () => {
  it("renders the family's own content through the real DeathNoticeV2", () => {
    render(<DeathNoticePreviewStep {...baseProps()} />);
    expect(screen.getByText("Jean Dupont")).toBeTruthy();
    expect(screen.getByText("Elle s'en est allée paisiblement, entourée des siens.")).toBeTruthy();
  });

  /**
   * Correction pass — the PO rejected the first pass because
   * DeathNoticeIntemporel was nested inside BuilderScreen's own
   * 600px-capped `.frame`, reading as "a small card inside the
   * Builder" rather than the real Memorial Stage. This guards against
   * that regression: the Memorial's own wrapper must be a DIRECT
   * child of this screen's root, never a descendant of any
   * BuilderScreen-owned frame element.
   */
  it("never nests the Memorial inside BuilderScreen's own frame — no ancestor caps its width", () => {
    const { container } = render(<DeathNoticePreviewStep {...baseProps()} />);
    const memorialWrap = container.querySelector('[data-heritage-skin="intemporel"]');
    expect(memorialWrap).toBeTruthy();
    let node = memorialWrap?.parentElement ?? null;
    while (node && node !== container) {
      expect(node.className).not.toMatch(/frame/i);
      node = node.parentElement;
    }
  });

  it("shows a controlled notice instead of crashing on a corrupted Hero", () => {
    render(<DeathNoticePreviewStep {...baseProps({ content: { hero: "garbage" } as unknown as MemorialContent })} />);
    expect(screen.queryByText("Jean Dupont")).toBeNull();
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("shows a controlled notice instead of crashing on a corrupted Death Notice", () => {
    render(
      <DeathNoticePreviewStep
        {...baseProps({ content: { ...READY_CONTENT, deathNotice: "garbage" } as unknown as MemorialContent })}
      />,
    );
    expect(screen.getByRole("alert")).toBeTruthy();
  });
});

describe("DeathNoticePreviewStep — Avis de décès V2, the validated renderer", () => {
  it.each(["light", "dark"] as const)("shows the real DeathNoticeV2 in %s — never the V1 scene", (skinVariant) => {
    const { container } = render(<DeathNoticePreviewStep {...baseProps({ skinVariant })} />);
    const notice = container.querySelector('[data-testid="death-notice-v2"]');
    expect(notice).toBeTruthy();
    expect(notice?.closest("[data-variant]")?.getAttribute("data-variant")).toBe(skinVariant);
    expect(container.querySelector('img[src*="a03-scene-top.png"]')).toBeNull();
  });

  it("the Memorial zone is a direct child of the page, between the Builder strips", () => {
    const { container } = render(<DeathNoticePreviewStep {...baseProps()} />);
    const page = container.querySelector("main") as HTMLElement;
    const children = Array.from(page.children);
    const scope = page.querySelector('[data-heritage-skin="intemporel"]') as HTMLElement;
    expect(children).toContain(scope);
    expect(children.indexOf(scope)).toBeGreaterThan(0);
    expect(children[children.length - 1].tagName).toBe("FORM");
  });

  it("A03 has no Hero above it: the Avis title is the page's <h1>, the name an <h2>", () => {
    render(<DeathNoticePreviewStep {...baseProps()} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Avis de décès");
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Jean Dupont");
  });

  /* jsdom has no layout: this pins the one rule that keeps V2 from
   * collapsing to 0px in `.page`'s centring flex column (V2's wrapper is a
   * `container-type: inline-size` box with no intrinsic width) —
   * verified in a real browser during the integration QA. */
  it("the page stretches the Memorial zone to its full width", () => {
    const css = readFileSync(path.resolve(import.meta.dirname, "DeathNoticePreviewStep.module.css"), "utf8");
    expect(css).toMatch(/\.page > \[data-heritage-skin\]\s*\{\s*align-self: stretch;\s*\}/);
  });

  it("keeps the three Builder controls", () => {
    render(<DeathNoticePreviewStep {...baseProps()} />);
    expect(screen.getByRole("button", { name: "Modifier l'annonce" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Modifier les précisions" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continuer" })).toBeTruthy();
  });
});

describe("DeathNoticePreviewStep — the skin guard (mission brief section 11)", () => {
  it("renders the real Intemporel renderer for the intemporel skin", () => {
    render(<DeathNoticePreviewStep {...baseProps({ skin: "intemporel" })} />);
    expect(screen.getByText("Jean Dupont")).toBeTruthy();
  });

  it.each(["musulman", "juif", "hindou"] as const)(
    "never silently falls back to the Intemporel renderer for %s — shows the honest 'unavailable' notice instead",
    (skin) => {
      render(<DeathNoticePreviewStep {...baseProps({ skin })} />);
      expect(screen.queryByText("Jean Dupont")).toBeNull();
      expect(
        screen.getByText(
          "L'aperçu de l'avis de décès pour ce style n'est pas encore disponible. Vos informations sont conservées ; l'équipe HERITAGE vous préviendra dès qu'il sera prêt.",
        ),
      ).toBeTruthy();
    },
  );

  it("offers no edit links and no Continue when the skin is unavailable — nothing was shown to verify", () => {
    render(<DeathNoticePreviewStep {...baseProps({ skin: "musulman" })} />);
    expect(screen.queryByText("Modifier l'annonce")).toBeNull();
    expect(screen.queryByText("Modifier les précisions")).toBeNull();
    expect(screen.queryByRole("button", { name: "Continuer" })).toBeNull();
  });

  it("never touches or clears any data when the skin is unavailable", () => {
    const persist = vi.fn();
    render(<DeathNoticePreviewStep {...baseProps({ skin: "juif", persist })} />);
    expect(persist).not.toHaveBeenCalled();
  });

  it("a corrupted/unrecognized skin value also falls to the unavailable notice, never Intemporel", () => {
    render(<DeathNoticePreviewStep {...baseProps({ skin: "not-a-real-skin" as never })} />);
    expect(screen.queryByText("Jean Dupont")).toBeNull();
  });
});

describe("DeathNoticePreviewStep — 'Modifier l'annonce' / 'Modifier les précisions' (mission brief section 10)", () => {
  it("reopens A01 and persists, without deleting the family's own text", async () => {
    const persist = vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" });
    render(<DeathNoticePreviewStep {...baseProps({ persist })} />);

    fireEvent.click(screen.getByText("Modifier l'annonce"));

    await waitFor(() => expect(persist).toHaveBeenCalledTimes(1));
    const [persistedContent] = persist.mock.calls[0];
    expect((persistedContent as { guidedFlow: Record<string, unknown> }).guidedFlow.A01).toBeUndefined();
    expect((persistedContent as { deathNotice: { announcementText: string } }).deathNotice.announcementText).toBe(
      "Elle s'en est allée paisiblement, entourée des siens.",
    );
    expect(routerRefresh).toHaveBeenCalledTimes(1);
  });

  it("reopens A02 and persists, leaving A01 untouched", async () => {
    const persist = vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" });
    render(<DeathNoticePreviewStep {...baseProps({ persist })} />);

    fireEvent.click(screen.getByText("Modifier les précisions"));

    await waitFor(() => expect(persist).toHaveBeenCalledTimes(1));
    const [persistedContent] = persist.mock.calls[0];
    const flow = (persistedContent as { guidedFlow: Record<string, unknown> }).guidedFlow;
    expect(flow.A02).toBeUndefined();
    expect(flow.A01).toEqual({ status: "completed" });
    expect(routerRefresh).toHaveBeenCalledTimes(1);
  });
});

describe("DeathNoticePreviewStep — 'Continuer' commits A03 with its fingerprint", () => {
  it("commits A03 and persists on submit", async () => {
    const persist = vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" });
    render(<DeathNoticePreviewStep {...baseProps({ persist })} />);

    fireEvent.click(screen.getByRole("button", { name: "Continuer" }));

    await waitFor(() => expect(persist).toHaveBeenCalledTimes(1));
    const [persistedContent] = persist.mock.calls[0];
    const flow = (persistedContent as { guidedFlow: Record<string, { status: string; answer?: string }> })
      .guidedFlow;
    expect(flow.A03.status).toBe("completed");
    expect(typeof flow.A03.answer).toBe("string");
    expect(routerRefresh).toHaveBeenCalledTimes(1);
  });

  it("shows a generic error and never refreshes when persist fails", async () => {
    const persist = vi.fn().mockRejectedValue(new Error("network"));
    render(<DeathNoticePreviewStep {...baseProps({ persist })} />);

    fireEvent.click(screen.getByRole("button", { name: "Continuer" }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(routerRefresh).not.toHaveBeenCalled();
  });
});

describe("DeathNoticePreviewStep — « Mon parcours » and the way back (correction Light / Dark, navigation)", () => {
  function journey(revising: "announcementPreview" | null) {
    return {
      language: "fr" as const,
      snapshot: resolveJourney(READY_CONTENT as MemorialContent, revising),
      skinVariant: "light" as const,
      openScreen: vi.fn().mockResolvedValue(true),
      resume: vi.fn().mockResolvedValue(true),
      finishReview: vi.fn().mockResolvedValue(true),
      finishStep: vi.fn(),
      hasPendingInput: () => false,
      backNavigationFailed: false,
    };
  }

  it("shows « Mon parcours » above the Avis, the Avis itself unchanged", () => {
    render(
      <JourneyContext.Provider value={journey(null)}>
        <DeathNoticePreviewStep {...baseProps()} />
      </JourneyContext.Provider>,
    );
    expect(screen.getByRole("button", { name: "Mon parcours" })).toBeTruthy();
  });

  it("reopened for revision: « Reprendre où j'en étais » goes back without writing anything", async () => {
    const persist = vi.fn();
    const value = journey("announcementPreview");
    render(
      <JourneyContext.Provider value={value}>
        <DeathNoticePreviewStep {...baseProps({ persist })} />
      </JourneyContext.Provider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Reprendre où j'en étais" }));
    await vi.waitFor(() => expect(value.resume).toHaveBeenCalled());
    expect(persist).not.toHaveBeenCalled();
  });

  it("renders no navigation outside a journey", () => {
    render(<DeathNoticePreviewStep {...baseProps()} />);
    expect(screen.queryByRole("button", { name: "Mon parcours" })).toBeNull();
  });
});
