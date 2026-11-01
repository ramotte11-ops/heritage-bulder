// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { GuidedFlowPause } from "./GuidedFlowPause";
import { PreviewEntryContext, type PreviewEntryState } from "./preview/BuilderPreviewHost";

/**
 * QG 008 Lot 3 — the resting screen of the AUTHENTICATED Builder leads to
 * the private Preview (where « Publier » lives). The guest Builder and the
 * demo never pass `openPreview`: nothing changes for them.
 */

vi.mock("next/font/google", () => ({
  Cormorant_Garamond: () => ({ variable: "--font-a", className: "" }),
  La_Belle_Aurore: () => ({ variable: "--font-b", className: "" }),
  EB_Garamond: () => ({ variable: "--font-c", className: "" }),
  Playfair_Display: () => ({ variable: "--font-d", className: "" }),
  Inter: () => ({ variable: "--font-e", className: "" }),
}));

afterEach(cleanup);

const CTA = "Découvrir l'aperçu de mon hommage";

function entry(overrides: Partial<PreviewEntryState> = {}): PreviewEntryState {
  return { language: "fr", busy: false, unavailable: false, open: vi.fn(), registerButton: vi.fn(), ...overrides };
}

describe("GuidedFlowPause — openPreview (Lot 3)", () => {
  it("without openPreview (guest, demo): no Preview call-to-action, even inside a host", () => {
    render(
      <PreviewEntryContext.Provider value={entry()}>
        <GuidedFlowPause language="fr" progress={0.9} ownerSpace={false} />
      </PreviewEntryContext.Provider>,
    );
    expect(screen.queryByRole("button", { name: CTA })).toBeNull();
  });

  it("with openPreview inside a host: the call-to-action opens the Preview", () => {
    const state = entry();
    render(
      <PreviewEntryContext.Provider value={state}>
        <GuidedFlowPause language="fr" progress={0.9} openPreview />
      </PreviewEntryContext.Provider>,
    );
    fireEvent.click(screen.getByRole("button", { name: CTA }));
    expect(state.open).toHaveBeenCalledOnce();
  });

  it("with openPreview but the Preview unavailable (no host value): nothing is rendered", () => {
    render(<GuidedFlowPause language="fr" progress={0.9} openPreview />);
    expect(screen.queryByRole("button", { name: CTA })).toBeNull();
  });

  it("while the Preview loads: the call-to-action is disabled and busy", () => {
    render(
      <PreviewEntryContext.Provider value={entry({ busy: true })}>
        <GuidedFlowPause language="fr" progress={0.9} openPreview />
      </PreviewEntryContext.Provider>,
    );
    const button = document.querySelector("[data-pause-preview]") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
  });
});
