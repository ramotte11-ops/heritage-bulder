// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

/**
 * Mission 035 — contract tests for PAGE E (T08, the Hero reveal). Same
 * discipline as HeroCropStep.test.tsx: STATE and RENDER CONTRACTS —
 * never computed CSS/pixel layout from the real browser engine. The
 * durable write ORDER (mission brief section 17) is the one behaviour
 * this file exists to prove above all else.
 */

const { useRouter, routerRefresh } = vi.hoisted(() => {
  const refresh = vi.fn();
  return { routerRefresh: refresh, useRouter: vi.fn(() => ({ refresh })) };
});
vi.mock("next/navigation", () => ({ useRouter }));

// Same test-environment stub HeroCropStep.test.tsx uses, extended with
// the two Mission 035 typefaces HeroIntemporel pulls in.
vi.mock("next/font/google", () => ({
  Playfair_Display: () => ({ variable: "--font-heritage-serif-mock", className: "" }),
  Inter: () => ({ variable: "--font-heritage-sans-mock", className: "" }),
  Cormorant_Garamond: () => ({ variable: "--font-heritage-hero-serif-mock", className: "" }),
  La_Belle_Aurore: () => ({ variable: "--font-heritage-hero-script-mock", className: "" }),
}));

const { HeroRevealStep } = await import("./HeroRevealStep");

afterEach(cleanup);
beforeEach(() => routerRefresh.mockClear());

const MEDIA_ID = "cccccccc-cccc-4ccc-8ccc-000000000001";

const CONTENT = {
  hero: {
    displayName: "Jean Dupont",
    birth: { precision: "year", year: 1948 },
    death: { precision: "year", year: 2023 },
    shortPhrase: "Toujours dans nos cœurs",
    photo: { mediaId: MEDIA_ID, crop: { focalX: 0.5, focalY: 0.5, zoom: 1 } },
  },
  guidedFlow: {
    T04: { status: "skipped" },
    T05: { status: "completed" },
    T06: { status: "completed" },
    T07: { status: "completed" },
  },
} as const;

const MEDIA = { id: MEDIA_ID, purpose: "hero", status: "ready" } as const;
const PHOTO = { media: MEDIA, readUrl: "https://storage.test/signed/reveal" };

function defaultProps() {
  return {
    language: "fr" as const,
    editorialContext: "remembrance" as const,
    content: CONTENT as never,
    photo: PHOTO as never,
    initialSkinVariant: "light" as const,
    persist: vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" }),
    saveSkinVariant: vi.fn().mockResolvedValue(undefined),
  };
}

function baseProps(overrides: Partial<ReturnType<typeof defaultProps>> = {}) {
  return { ...defaultProps(), ...overrides };
}

describe("HeroRevealStep — the real Hero, rendered", () => {
  it("renders the family's own content — name, dates and phrase", () => {
    render(<HeroRevealStep {...baseProps()} />);

    expect(screen.getByText("Jean Dupont")).toBeTruthy();
    expect(screen.getByText("1948 – 2023")).toBeTruthy();
    expect(screen.getByText("Toujours dans nos cœurs")).toBeTruthy();
  });

  it("shows a controlled notice instead of crashing on a corrupted/incomplete Hero", () => {
    render(<HeroRevealStep {...baseProps({ content: { hero: "garbage" } as never })} />);

    expect(screen.getByRole("alert")).toBeTruthy();
  });
});

describe("HeroRevealStep — Light/Dark preview toggle stays local (mission brief section 16)", () => {
  it("toggles the ambiance visually without ever calling saveSkinVariant or persist", () => {
    const props = baseProps();
    render(<HeroRevealStep {...props} />);

    fireEvent.click(screen.getByRole("button", { name: /sombre/i }));

    expect(props.saveSkinVariant).not.toHaveBeenCalled();
    expect(props.persist).not.toHaveBeenCalled();
    // The toggle's own label flips to offer switching back.
    expect(screen.getByRole("button", { name: /claire/i })).toBeTruthy();
  });
});

describe("HeroRevealStep — the durable confirmation order (mission brief section 17, QG-locked)", () => {
  it("persists skin_variant FIRST, then commits T08's own StepRecord, then saves the draft", async () => {
    const callOrder: string[] = [];
    const props = baseProps({
      saveSkinVariant: vi.fn().mockImplementation(async () => {
        callOrder.push("saveSkinVariant");
      }),
      persist: vi.fn().mockImplementation(async (content: unknown) => {
        callOrder.push("persist");
        expect((content as { guidedFlow: { T08: unknown } }).guidedFlow.T08).toEqual({
          status: "completed",
        });
        return { updatedAt: "2026-01-01T00:00:00.000Z" };
      }),
    });

    render(<HeroRevealStep {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /continuer avec cette ambiance/i }));

    await vi.waitFor(() => expect(routerRefresh).toHaveBeenCalled());

    expect(callOrder).toEqual(["saveSkinVariant", "persist"]);
    expect(props.saveSkinVariant).toHaveBeenCalledWith("light"); // the previewed (unchanged) variant
  });

  it("persists the CURRENTLY PREVIEWED variant, not the initial one, once toggled", async () => {
    const props = baseProps();
    render(<HeroRevealStep {...props} />);

    fireEvent.click(screen.getByRole("button", { name: /sombre/i }));
    fireEvent.click(screen.getByRole("button", { name: /continuer avec cette ambiance/i }));

    await vi.waitFor(() => expect(routerRefresh).toHaveBeenCalled());
    expect(props.saveSkinVariant).toHaveBeenCalledWith("dark");
  });

  it("if saveSkinVariant rejects, T08 is never committed and nothing is persisted", async () => {
    const props = baseProps({ saveSkinVariant: vi.fn().mockRejectedValue(new Error("denied")) });
    render(<HeroRevealStep {...props} />);

    fireEvent.click(screen.getByRole("button", { name: /continuer avec cette ambiance/i }));

    await vi.waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(props.persist).not.toHaveBeenCalled();
    expect(routerRefresh).not.toHaveBeenCalled();
  });

  it("if the photo is no longer usable, commitPageE refuses and nothing is persisted, even though skin_variant already succeeded", async () => {
    const props = baseProps({ photo: { media: { ...MEDIA, status: "pending" }, readUrl: PHOTO.readUrl } as never });
    render(<HeroRevealStep {...props} />);

    fireEvent.click(screen.getByRole("button", { name: /continuer avec cette ambiance/i }));

    await vi.waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(props.saveSkinVariant).toHaveBeenCalled(); // step 1 still ran and succeeded
    expect(props.persist).not.toHaveBeenCalled(); // step 3 never reached
  });

  it("if persist rejects, T08 stays incomplete even though skin_variant is already durable — retrying is safe", async () => {
    const props = baseProps({ persist: vi.fn().mockRejectedValue(new Error("save failed")) });
    render(<HeroRevealStep {...props} />);

    fireEvent.click(screen.getByRole("button", { name: /continuer avec cette ambiance/i }));

    await vi.waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(props.saveSkinVariant).toHaveBeenCalledOnce();
    expect(routerRefresh).not.toHaveBeenCalled();

    // Retry — saveSkinVariant is idempotent, persist now succeeds.
    props.persist.mockResolvedValue({ updatedAt: "2026-01-02T00:00:00.000Z" });
    fireEvent.click(screen.getByRole("button", { name: /continuer avec cette ambiance/i }));

    await vi.waitFor(() => expect(routerRefresh).toHaveBeenCalled());
    expect(props.saveSkinVariant).toHaveBeenCalledTimes(2);
  });
});
