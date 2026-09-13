// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { deathNoticePreviewFingerprint } from "@/lib/builder/guided-flow/death-notice-step";

/**
 * Mission 039B — contract tests for A03 (aperçu de l'avis de décès).
 * Same discipline as DeathNoticeAnnouncementStep/DeathNoticePrecisionsStep's
 * own tests: state and render contracts, against the REAL (unmocked)
 * `death-notice-step.ts`/`hero-step.ts` logic.
 */

const { useRouter, routerRefresh } = vi.hoisted(() => {
  const refresh = vi.fn();
  return { routerRefresh: refresh, useRouter: vi.fn(() => ({ refresh })) };
});
vi.mock("next/navigation", () => ({ useRouter }));

// Standard test-environment stub for next/font/google — every Guided
// Flow screen reaches it transitively through BuilderScreen.tsx /
// DeathNoticeIntemporel.tsx.
vi.mock("next/font/google", () => ({
  Playfair_Display: () => ({ variable: "--font-heritage-serif-mock", className: "" }),
  Inter: () => ({ variable: "--font-heritage-sans-mock", className: "" }),
  Cormorant_Garamond: () => ({ variable: "--font-heritage-hero-serif-mock", className: "" }),
  La_Belle_Aurore: () => ({ variable: "--font-heritage-hero-script-mock", className: "" }),
}));

const { DeathNoticePreviewStep } = await import("./DeathNoticePreviewStep");

afterEach(cleanup);

const BASE_CONTENT = {
  hero: {
    displayName: "Élise Martin",
    birth: { precision: "year", year: 1948 },
    death: { precision: "year", year: 2023 },
    shortPhrase: null,
    photo: null,
  },
  deathNotice: {
    announcementText: "C'est avec une profonde tristesse que nous vous faisons part du décès d'Élise Martin.",
    precisions: { generalLocation: "Lyon", familyMessage: null, thought: null, quote: null, other: null },
  },
  guidedFlow: {
    A01: { status: "completed" },
    A02: { status: "skipped" },
  },
};

function baseProps(overrides: Partial<Parameters<typeof DeathNoticePreviewStep>[0]> = {}) {
  return {
    language: "fr" as const,
    editorialContext: "announcement" as const,
    content: BASE_CONTENT,
    skin: "intemporel" as const,
    skinVariant: "light" as const,
    persist: vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" }),
    ...overrides,
  } as Parameters<typeof DeathNoticePreviewStep>[0];
}

beforeEach(() => {
  routerRefresh.mockClear();
});

describe("DeathNoticePreviewStep — rendering the real editorial card", () => {
  it("shows the family's own content, and the three Builder-only controls outside it", () => {
    render(<DeathNoticePreviewStep {...baseProps()} />);

    expect(screen.getByText("Élise Martin")).toBeTruthy();
    expect(
      screen.getByText("C'est avec une profonde tristesse que nous vous faisons part du décès d'Élise Martin."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Modifier l'annonce" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Modifier les précisions" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /continuer/i })).toBeTruthy();
  });

  it("shows the data-unavailable notice instead of the card when the stored Death Notice is corrupted", () => {
    const content = { ...BASE_CONTENT, deathNotice: "garbage" };
    render(<DeathNoticePreviewStep {...baseProps({ content: content as never })} />);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.queryByText("Élise Martin")).toBeNull();
  });

  it("shows the data-unavailable notice when the stored Hero is corrupted", () => {
    const content = { ...BASE_CONTENT, hero: "garbage" };
    render(<DeathNoticePreviewStep {...baseProps({ content: content as never })} />);
    expect(screen.getByRole("alert")).toBeTruthy();
  });
});

describe("DeathNoticePreviewStep — Continuer verifies A03 (AGENTS.md section 15)", () => {
  it("commits A03 as completed with the current content's own fingerprint, and persists it", async () => {
    const persist = vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" });
    render(<DeathNoticePreviewStep {...baseProps({ persist })} />);

    fireEvent.click(screen.getByRole("button", { name: /continuer/i }));

    await vi.waitFor(() => expect(routerRefresh).toHaveBeenCalled());
    const persistedContent = persist.mock.calls.at(-1)?.[0];
    expect(persistedContent.guidedFlow.A03.status).toBe("completed");
    expect(persistedContent.guidedFlow.A03.answer).toBe(deathNoticePreviewFingerprint(BASE_CONTENT));
  });

  it("persist échoue → A03 stays incomplete: shows an error, never refreshes", async () => {
    const persist = vi.fn().mockRejectedValue(new Error("network down"));
    render(<DeathNoticePreviewStep {...baseProps({ persist })} />);

    fireEvent.click(screen.getByRole("button", { name: /continuer/i }));

    await vi.waitFor(() => expect(screen.getByText(/une erreur est survenue/i)).toBeTruthy());
    expect(routerRefresh).not.toHaveBeenCalled();
  });

  it("the simple display of A03 never persists anything on its own — no mount-time write", () => {
    const persist = vi.fn();
    render(<DeathNoticePreviewStep {...baseProps({ persist })} />);
    expect(persist).not.toHaveBeenCalled();
  });
});

describe("DeathNoticePreviewStep — the skin guard (Mission 039B correction finale)", () => {
  it("intemporel renders the real card as before", () => {
    render(<DeathNoticePreviewStep {...baseProps({ skin: "intemporel" })} />);
    expect(screen.getByText("Élise Martin")).toBeTruthy();
    expect(screen.getByRole("button", { name: /continuer/i })).toBeTruthy();
  });

  it.each(["musulman", "juif", "hindou"] as const)(
    "%s NEVER silently renders the Intemporel card — shows the unavailable notice instead",
    (skin) => {
      render(<DeathNoticePreviewStep {...baseProps({ skin })} />);

      expect(screen.queryByText("Élise Martin")).toBeNull();
      expect(
        screen.queryByText(
          "C'est avec une profonde tristesse que nous vous faisons part du décès d'Élise Martin.",
        ),
      ).toBeNull();
      expect(screen.getByRole("alert")).toBeTruthy();
    },
  );

  it("an unrecognized/corrupted skin value also never falls back to Intemporel", () => {
    render(<DeathNoticePreviewStep {...baseProps({ skin: "occidental" as never })} />);
    expect(screen.queryByText("Élise Martin")).toBeNull();
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it.each(["musulman", "juif", "hindou"] as const)(
    "%s shows no edit links and no Continue — nothing was actually shown to verify",
    (skin) => {
      render(<DeathNoticePreviewStep {...baseProps({ skin })} />);
      expect(screen.queryByRole("button", { name: "Modifier l'annonce" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Modifier les précisions" })).toBeNull();
      expect(screen.queryByRole("button", { name: /continuer/i })).toBeNull();
    },
  );

  it("never persists anything for an unbuilt skin — no accidental A03 completion", () => {
    const persist = vi.fn();
    render(<DeathNoticePreviewStep {...baseProps({ skin: "musulman", persist })} />);
    expect(persist).not.toHaveBeenCalled();
  });

  it("never deletes or alters any stored data for an unbuilt skin — content passes through untouched", () => {
    render(<DeathNoticePreviewStep {...baseProps({ skin: "juif" })} />);
    // The notice is shown; nothing about BASE_CONTENT was ever read
    // destructively (no crash, no persisted mutation — see the previous
    // test). This is a structural smoke check that the guard branch
    // returns before touching `content` at all beyond the corruption read.
    expect(screen.getByRole("alert")).toBeTruthy();
  });
});

describe("DeathNoticePreviewStep — Modifier l'annonce / Modifier les précisions (AGENTS.md section 14)", () => {
  it("'Modifier l'annonce' un-marks A01 and persists, without touching announcementText itself", async () => {
    const persist = vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" });
    render(<DeathNoticePreviewStep {...baseProps({ persist })} />);

    fireEvent.click(screen.getByRole("button", { name: "Modifier l'annonce" }));

    await vi.waitFor(() => expect(routerRefresh).toHaveBeenCalled());
    const persistedContent = persist.mock.calls.at(-1)?.[0];
    expect(persistedContent.guidedFlow.A01).toBeUndefined();
    expect(persistedContent.deathNotice.announcementText).toBe(BASE_CONTENT.deathNotice.announcementText);
  });

  it("'Modifier les précisions' un-marks only A02, leaving A01 and every precision untouched", async () => {
    const persist = vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" });
    render(<DeathNoticePreviewStep {...baseProps({ persist })} />);

    fireEvent.click(screen.getByRole("button", { name: "Modifier les précisions" }));

    await vi.waitFor(() => expect(routerRefresh).toHaveBeenCalled());
    const persistedContent = persist.mock.calls.at(-1)?.[0];
    expect(persistedContent.guidedFlow.A01).toEqual({ status: "completed" });
    expect(persistedContent.guidedFlow.A02).toBeUndefined();
    expect(persistedContent.deathNotice.precisions.generalLocation).toBe("Lyon");
  });
});
