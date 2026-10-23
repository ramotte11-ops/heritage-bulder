// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { BuilderShell } from "./BuilderShell";
import { DEMO_MEMORIALS } from "@/lib/builder/demo-memorials";
import { AUTOSAVE_DEBOUNCE_MS } from "@/lib/builder/autosave-state";

/**
 * Recette Builder V1 — the free Builder (after the Guided Flow) autosaved
 * silently: it now shows the same « Enregistrement… / Enregistré » line as
 * every Guided Flow screen. The local demo (no `persist`) shows nothing.
 */
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("BuilderShell — autosave status", () => {
  it("no persist (local demo): no save status at all", () => {
    render(<BuilderShell memorial={DEMO_MEMORIALS["demo-announcement"]} />);
    expect(screen.queryByText("Enregistrement…")).toBeNull();
    expect(document.querySelector("p[role=status]")).toBeNull();
  });

  it("with persist: « Enregistrement… » after an edit, « Enregistré » once the save answered", async () => {
    vi.useFakeTimers();
    const persist = vi.fn().mockResolvedValue({ updatedAt: "2026-01-02T00:00:00.000Z" });
    render(<BuilderShell memorial={DEMO_MEMORIALS["demo-announcement"]} persist={persist} />);
    const field = document.querySelector<HTMLInputElement | HTMLTextAreaElement>("input[type=text], textarea");
    expect(field).not.toBeNull();
    fireEvent.change(field!, { target: { value: `${field!.value} modifié` } });
    expect(screen.getByText("Enregistrement…")).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS + 50);
    });
    expect(persist).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Enregistré")).toBeTruthy();
  });
});
