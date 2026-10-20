// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

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

const { CeremonyDateTimeStep } = await import("./CeremonyDateTimeStep");

afterEach(cleanup);
beforeEach(() => routerRefresh.mockClear());

const CONTENT = {
  hero: { displayName: "Jean Dupont", birth: null, death: null, shortPhrase: null, photo: null },
  guidedFlow: { A04: { status: "completed", answer: "yes" } },
  ceremony: { date: "2026-11-03", time: "14:00", venueName: null, address: null, access: null, note: null },
};

function baseProps(overrides: Partial<Parameters<typeof CeremonyDateTimeStep>[0]> = {}) {
  return {
    language: "fr" as const,
    content: CONTENT,
    persist: vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" }),
    ...overrides,
  } as Parameters<typeof CeremonyDateTimeStep>[0];
}

function timeInput(): HTMLInputElement {
  return screen.getByLabelText("Heure") as HTMLInputElement;
}

describe("CeremonyDateTimeStep — sélecteur horaire Android", () => {
  it("keeps the stored time and explicitly opens the native picker from the field tap", () => {
    render(<CeremonyDateTimeStep {...baseProps()} />);
    const input = timeInput();
    const showPicker = vi.fn();
    Object.defineProperty(input, "showPicker", { configurable: true, value: showPicker });

    expect(input.value).toBe("14:00");
    fireEvent.click(input);

    expect(showPicker).toHaveBeenCalledOnce();
  });

  it("retains normal input behaviour when showPicker is unavailable", () => {
    render(<CeremonyDateTimeStep {...baseProps()} />);
    const input = timeInput();
    Object.defineProperty(input, "showPicker", { configurable: true, value: undefined });

    expect(() => fireEvent.click(input)).not.toThrow();
    fireEvent.change(input, { target: { value: "15:30" } });
    expect(input.value).toBe("15:30");
  });

  it("retains normal input behaviour when showPicker is rejected", () => {
    render(<CeremonyDateTimeStep {...baseProps()} />);
    const input = timeInput();
    Object.defineProperty(input, "showPicker", {
      configurable: true,
      value: vi.fn(() => {
        throw new DOMException("Picker already open", "InvalidStateError");
      }),
    });

    expect(() => fireEvent.click(input)).not.toThrow();
    fireEvent.change(input, { target: { value: "15:30" } });
    expect(input.value).toBe("15:30");
  });
});

describe("CeremonyDateTimeStep — modification et persistance", () => {
  it("persists an initially empty time selected during first creation", async () => {
    const persist = vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" });
    const content = { ...CONTENT, ceremony: { ...CONTENT.ceremony, date: null, time: null } };
    render(<CeremonyDateTimeStep {...baseProps({ content, persist })} />);

    fireEvent.change(timeInput(), { target: { value: "09:15" } });
    fireEvent.click(screen.getByRole("button", { name: /continuer/i }));

    await vi.waitFor(() => expect(routerRefresh).toHaveBeenCalled());
    expect(persist.mock.calls.at(-1)?.[0].ceremony.time).toBe("09:15");
  });

  it("persists an edited stored time before completing A05", async () => {
    const persist = vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" });
    render(<CeremonyDateTimeStep {...baseProps({ persist })} />);

    fireEvent.change(timeInput(), { target: { value: "16:45" } });
    fireEvent.click(screen.getByRole("button", { name: /continuer/i }));

    await vi.waitFor(() => expect(routerRefresh).toHaveBeenCalled());
    expect(persist).toHaveBeenCalledTimes(2);
    expect(persist.mock.calls[0][0].ceremony.time).toBe("16:45");
    expect(persist.mock.calls[0][0].guidedFlow.A05).toBeUndefined();
    expect(persist.mock.calls[1][0].ceremony.time).toBe("16:45");
    expect(persist.mock.calls[1][0].guidedFlow.A05).toEqual({ status: "completed" });
  });

  it("reloads the exact persisted time", () => {
    const { unmount } = render(<CeremonyDateTimeStep {...baseProps()} />);
    fireEvent.change(timeInput(), { target: { value: "16:45" } });
    unmount();

    render(
      <CeremonyDateTimeStep
        {...baseProps({ content: { ...CONTENT, ceremony: { ...CONTENT.ceremony, time: "16:45" } } })}
      />,
    );

    expect(timeInput().value).toBe("16:45");
  });
});
