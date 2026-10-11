// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { HeroDate } from "@/types/hero";
import {
  createPendingInputRegistry,
  hasIncompleteNativeInput,
  PendingInputRegistryContext,
  usePendingInput,
} from "./pending-input";

vi.mock("next/font/google", () => ({
  Playfair_Display: () => ({ variable: "--font-heritage-serif-mock", className: "" }),
  Inter: () => ({ variable: "--font-heritage-sans-mock", className: "" }),
  Cormorant_Garamond: () => ({ variable: "--font-heritage-hero-serif-mock", className: "" }),
  La_Belle_Aurore: () => ({ variable: "--font-heritage-hero-script-mock", className: "" }),
  EB_Garamond: () => ({ variable: "--font-heritage-ceremony-serif-mock", className: "" }),
}));

const { HeroDateField } = await import("../HeroDateField");

afterEach(cleanup);

describe("the pending-input registry", () => {
  it("is false when empty, true as soon as one registered check is, and forgets unregistered ones", () => {
    const registry = createPendingInputRegistry();
    expect(registry.hasPending()).toBe(false);
    const off = registry.register(() => true);
    registry.register(() => false);
    expect(registry.hasPending()).toBe(true);
    off();
    expect(registry.hasPending()).toBe(false);
  });

  it("usePendingInput follows the latest value and unregisters on unmount; no-op without a provider", () => {
    function Probe({ pending }: { pending: boolean }) {
      usePendingInput(pending);
      return null;
    }
    const registry = createPendingInputRegistry();
    const { rerender, unmount } = render(
      <PendingInputRegistryContext.Provider value={registry}>
        <Probe pending={false} />
      </PendingInputRegistryContext.Provider>,
    );
    expect(registry.hasPending()).toBe(false);
    rerender(
      <PendingInputRegistryContext.Provider value={registry}>
        <Probe pending />
      </PendingInputRegistryContext.Provider>,
    );
    expect(registry.hasPending()).toBe(true);
    unmount();
    expect(registry.hasPending()).toBe(false);
    expect(() => render(<Probe pending />)).not.toThrow();
  });
});

describe("hasIncompleteNativeInput — a date or time typed halfway", () => {
  it("detects an input whose validity reports badInput (its value reads empty)", () => {
    const root = document.createElement("div");
    const input = document.createElement("input");
    input.type = "date";
    root.appendChild(input);
    expect(hasIncompleteNativeInput(root)).toBe(false);
    Object.defineProperty(input, "validity", { value: { badInput: true } });
    expect(input.value).toBe("");
    expect(hasIncompleteNativeInput(root)).toBe(true);
  });
});

describe("HeroDateField — a typed year the Hero does not hold is reported", () => {
  function renderField(value: HeroDate | null, onChange = vi.fn()) {
    const registry = createPendingInputRegistry();
    const view = render(
      <PendingInputRegistryContext.Provider value={registry}>
        <HeroDateField language="fr" label="Naissance" value={value} onChange={onChange} error={null} idPrefix="birth" />
      </PendingInputRegistryContext.Provider>,
    );
    return { registry, onChange, ...view };
  }

  it("nothing pending when the field shows exactly what is stored", () => {
    expect(renderField(null).registry.hasPending()).toBe(false);
    cleanup();
    expect(renderField({ precision: "year", year: 1950 }).registry.hasPending()).toBe(false);
  });

  it("an invalid year (rejected, so never stored) stays reported until it is fixed", () => {
    const { registry, onChange, rerender } = renderField(null);
    const field = screen.getByRole("textbox");
    fireEvent.change(field, { target: { value: "19" } });
    fireEvent.blur(field);
    expect(onChange).toHaveBeenCalledWith({ precision: "year", year: 19 });
    // The parent rejected it: the stored value is still null.
    expect(registry.hasPending()).toBe(true);

    fireEvent.change(field, { target: { value: "1950" } });
    rerender(
      <PendingInputRegistryContext.Provider value={registry}>
        <HeroDateField language="fr" label="Naissance" value={{ precision: "year", year: 1950 }} onChange={onChange} error={null} idPrefix="birth" />
      </PendingInputRegistryContext.Provider>,
    );
    expect(registry.hasPending()).toBe(false);
  });
});
