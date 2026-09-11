// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

/**
 * Mission 034 — contract tests for PAGE D (T07, the Hero photo crop).
 * Same discipline as HeroPhotoStep.test.tsx: STATE and RENDER
 * CONTRACTS — which controls exist for a given state, what they're
 * labelled, whether Continue commits the right thing — never computed
 * CSS/pixel layout from the real browser engine. Where a control's
 * effect is itself DATA (the crop this screen persists, the zoom
 * slider's own value attribute), asserting on it is a behaviour
 * contract, not a layout measurement.
 */

const { useRouter, routerRefresh } = vi.hoisted(() => {
  const refresh = vi.fn();
  return { routerRefresh: refresh, useRouter: vi.fn(() => ({ refresh })) };
});
vi.mock("next/navigation", () => ({ useRouter }));

// Same test-environment stub HeroPhotoStep.test.tsx uses — every Guided
// Flow screen reaches next/font/google transitively through
// BuilderScreen.tsx.
vi.mock("next/font/google", () => ({
  Playfair_Display: () => ({ variable: "--font-heritage-serif-mock", className: "" }),
  Inter: () => ({ variable: "--font-heritage-sans-mock", className: "" }),
}));

const { HeroCropStep } = await import("./HeroCropStep");

afterEach(cleanup);

const MEDIA_ID = "cccccccc-cccc-4ccc-8ccc-000000000001";

const CONTENT_NO_CROP = {
  hero: {
    displayName: "Jean Dupont",
    birth: null,
    death: null,
    shortPhrase: null,
    photo: { mediaId: MEDIA_ID, crop: null },
  },
  guidedFlow: { T04: { status: "skipped" }, T05: { status: "skipped" }, T06: { status: "completed" } },
};

const READY_MEDIA = {
  id: MEDIA_ID,
  memorialId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  ownerId: "11111111-1111-4111-8111-111111111111",
  storagePath: `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/${MEDIA_ID}/original.jpg`,
  mediaType: "photo" as const,
  purpose: "hero" as const,
  status: "ready" as const,
  mimeType: "image/jpeg",
  originalFilename: null,
  sizeBytes: 12345,
  width: null,
  height: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function baseProps(overrides: Partial<Parameters<typeof HeroCropStep>[0]> = {}) {
  return {
    language: "fr" as const,
    editorialContext: "remembrance" as const,
    content: CONTENT_NO_CROP,
    photo: { media: READY_MEDIA, readUrl: "https://storage.test/signed/x" },
    persist: vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" }),
    ...overrides,
  } as Parameters<typeof HeroCropStep>[0];
}

beforeEach(() => {
  routerRefresh.mockClear();
});

describe("HeroCropStep — rendering", () => {
  it("shows the title/subtitle and the photo, never any Hero/Light-Dark content", () => {
    render(<HeroCropStep {...baseProps()} />);

    expect(screen.getByText("Ajustez votre photo")).toBeTruthy();
    const img = screen.getByAltText("Photo choisie pour l'hommage") as HTMLImageElement;
    expect(img.src).toContain("https://storage.test/signed/x");
    expect(screen.queryByText("Jean Dupont")).toBeNull();
    expect(screen.queryByText(/clair|sombre|dark|light/i)).toBeNull();
  });

  it("renders the zoom slider at the neutral value by default", () => {
    render(<HeroCropStep {...baseProps()} />);
    const slider = screen.getByLabelText("Zoom") as HTMLInputElement;
    expect(slider.value).toBe("1");
    expect(slider.min).toBe("1");
  });

  it("renders four labelled, focusable directional move buttons", () => {
    render(<HeroCropStep {...baseProps()} />);
    expect(screen.getByLabelText("Déplacer la photo vers le haut")).toBeTruthy();
    expect(screen.getByLabelText("Déplacer la photo vers le bas")).toBeTruthy();
    expect(screen.getByLabelText("Déplacer la photo vers la gauche")).toBeTruthy();
    expect(screen.getByLabelText("Déplacer la photo vers la droite")).toBeTruthy();
  });

  it("renders Réinitialiser and Changer la photo as secondary actions, and Continue", () => {
    render(<HeroCropStep {...baseProps()} />);
    expect(screen.getByRole("button", { name: "Réinitialiser" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Changer la photo" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /continuer/i })).toBeTruthy();
  });

  it("Continue is never disabled just because the crop is still neutral — accepting the default is valid", () => {
    render(<HeroCropStep {...baseProps()} />);
    const button = screen.getByRole("button", { name: /continuer/i });
    expect(button).toHaveProperty("disabled", false);
  });

  it("shows the data-unavailable notice instead of the form when the stored Hero is corrupted", () => {
    render(<HeroCropStep {...baseProps({ content: { hero: "garbage" } as never })} />);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.queryByText("Ajustez votre photo")).toBeNull();
  });
});

describe("HeroCropStep — zoom", () => {
  it("changing the slider updates its own value", () => {
    render(<HeroCropStep {...baseProps()} />);
    const slider = screen.getByLabelText("Zoom") as HTMLInputElement;

    fireEvent.change(slider, { target: { value: "2" } });

    expect(slider.value).toBe("2");
  });

  it("clamps a change beyond the max down to HERO_CROP_MAX_ZOOM", () => {
    render(<HeroCropStep {...baseProps()} />);
    const slider = screen.getByLabelText("Zoom") as HTMLInputElement;

    fireEvent.change(slider, { target: { value: "50" } });

    expect(Number(slider.value)).toBe(3);
  });
});

describe("HeroCropStep — reset", () => {
  it("restores the neutral zoom after a change, without validating T07", async () => {
    const persist = vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" });
    render(<HeroCropStep {...baseProps({ persist })} />);
    const slider = screen.getByLabelText("Zoom") as HTMLInputElement;

    fireEvent.change(slider, { target: { value: "2" } });
    expect(slider.value).toBe("2");

    fireEvent.click(screen.getByRole("button", { name: "Réinitialiser" }));

    expect(slider.value).toBe("1");
    expect(routerRefresh).not.toHaveBeenCalled();
  });
});

describe("HeroCropStep — Continue (commitPageD)", () => {
  it("writes the explicit NEUTRAL crop and commits when the family never touched anything", async () => {
    const persist = vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" });
    render(<HeroCropStep {...baseProps({ persist })} />);

    fireEvent.click(screen.getByRole("button", { name: /continuer/i }));

    await vi.waitFor(() => expect(persist).toHaveBeenCalled());
    const persistedContent = persist.mock.calls.at(-1)?.[0];
    expect(persistedContent.hero.photo.crop).toEqual({ focalX: 0.5, focalY: 0.5, zoom: 1 });
    expect(persistedContent.guidedFlow.T07).toEqual({ status: "completed" });
    await vi.waitFor(() => expect(routerRefresh).toHaveBeenCalled());
  });

  it("commits the crop the family actually set via the slider", async () => {
    const persist = vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" });
    render(<HeroCropStep {...baseProps({ persist })} />);
    const slider = screen.getByLabelText("Zoom") as HTMLInputElement;
    fireEvent.change(slider, { target: { value: "2" } });

    fireEvent.click(screen.getByRole("button", { name: /continuer/i }));

    await vi.waitFor(() => expect(persist).toHaveBeenCalled());
    const persistedContent = persist.mock.calls.at(-1)?.[0];
    expect(persistedContent.hero.photo.crop.zoom).toBe(2);
    expect(persistedContent.guidedFlow.T07).toEqual({ status: "completed" });
  });

  it("shows an error and never refreshes when persist rejects", async () => {
    const persist = vi.fn().mockRejectedValue(new Error("network"));
    render(<HeroCropStep {...baseProps({ persist })} />);

    fireEvent.click(screen.getByRole("button", { name: /continuer/i }));

    await vi.waitFor(() => expect(screen.getByText(/une erreur est survenue/i)).toBeTruthy());
    expect(routerRefresh).not.toHaveBeenCalled();
  });

  it("refuses to commit when the media handed in is not the one the Hero actually references", async () => {
    const persist = vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" });
    render(
      <HeroCropStep
        {...baseProps({ persist, photo: { media: { ...READY_MEDIA, id: "different-media-id" }, readUrl: "https://storage.test/signed/x" } })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /continuer/i }));

    await vi.waitFor(() => expect(screen.getByText(/une erreur est survenue/i)).toBeTruthy());
    expect(persist).not.toHaveBeenCalled();
    expect(routerRefresh).not.toHaveBeenCalled();
  });
});

describe("HeroCropStep — Changer la photo (reopenPageC, never a second upload engine)", () => {
  it("persists T06 un-marked and refreshes, without touching the crop", async () => {
    const contentWithCrop = {
      ...CONTENT_NO_CROP,
      hero: { ...CONTENT_NO_CROP.hero, photo: { mediaId: MEDIA_ID, crop: { focalX: 0.3, focalY: 0.7, zoom: 1.5 } } },
    };
    const persist = vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" });
    render(<HeroCropStep {...baseProps({ content: contentWithCrop, persist })} />);

    fireEvent.click(screen.getByRole("button", { name: "Changer la photo" }));

    await vi.waitFor(() => expect(persist).toHaveBeenCalled());
    const persistedContent = persist.mock.calls.at(-1)?.[0];
    expect(persistedContent.guidedFlow.T06).toBeUndefined();
    expect(persistedContent.hero.photo.crop).toEqual({ focalX: 0.3, focalY: 0.7, zoom: 1.5 });
    await vi.waitFor(() => expect(routerRefresh).toHaveBeenCalled());
  });

  it("shows an error and never refreshes when persist rejects", async () => {
    const persist = vi.fn().mockRejectedValue(new Error("network"));
    render(<HeroCropStep {...baseProps({ persist })} />);

    fireEvent.click(screen.getByRole("button", { name: "Changer la photo" }));

    await vi.waitFor(() => expect(screen.getByText(/une erreur est survenue/i)).toBeTruthy());
    expect(routerRefresh).not.toHaveBeenCalled();
  });
});

describe("HeroCropStep — directional move buttons", () => {
  it("clicking a directional button moves the rendered image's own position", () => {
    render(<HeroCropStep {...baseProps()} />);
    const img = screen.getByAltText("Photo choisie pour l'hommage") as HTMLImageElement;
    const before = img.style.left;

    // At the neutral zoom on a defensive square fallback (no real image
    // decoded in jsdom — width == height, ratio 1), the 4:5 window's
    // tighter axis is height, so the image sits wider than the window
    // and there IS horizontal room to move — the image's own left
    // offset must change.
    fireEvent.click(screen.getByLabelText("Déplacer la photo vers la droite"));

    expect(img.style.left).not.toBe(before);
  });

  it("zooming in first creates room to move on every axis, including vertical", () => {
    render(<HeroCropStep {...baseProps()} />);
    const img = screen.getByAltText("Photo choisie pour l'hommage") as HTMLImageElement;
    fireEvent.change(screen.getByLabelText("Zoom"), { target: { value: "2" } });
    const before = img.style.top;

    fireEvent.click(screen.getByLabelText("Déplacer la photo vers le bas"));

    expect(img.style.top).not.toBe(before);
  });
});
