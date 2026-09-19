// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { MemorialContent } from "@/types/memorial";
import type { Skin } from "@/config/skins";

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
    editorialContext: "announcement" as const,
    content: READY_CONTENT,
    skin: "intemporel" as Skin,
    skinVariant: "light" as const,
    persist: vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" }),
  };
}

function baseProps(overrides: Partial<ReturnType<typeof defaultProps>> = {}) {
  return { ...defaultProps(), ...overrides };
}

describe("DeathNoticePreviewStep — the real renderer, rendered", () => {
  it("renders the family's own content through the real DeathNoticeIntemporel", () => {
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
