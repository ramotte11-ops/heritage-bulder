// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { MemorialContent } from "@/types/memorial";
import { useAutosave } from "./use-autosave";
import { createPreviewFlushRegistry, PreviewFlushRegistryContext, type PreviewFlushRegistry } from "./preview-flush-registry";

/**
 * Étape 3 — the registry through which the Preview host drains the
 * current step's autosave, and its wiring inside `useAutosave` (so no
 * Guided Flow step has to know the Preview exists).
 */

afterEach(cleanup);

describe("createPreviewFlushRegistry", () => {
  it("flushAll resolves at once when nothing is registered (a screen with no autosave)", async () => {
    await expect(createPreviewFlushRegistry().flushAll()).resolves.toBeUndefined();
  });

  it("flushAll drains every registered flush", async () => {
    const registry = createPreviewFlushRegistry();
    const a = vi.fn(() => Promise.resolve());
    const b = vi.fn(() => Promise.resolve());
    registry.register(a);
    registry.register(b);
    await registry.flushAll();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("flushAll rejects as soon as one flush fails", async () => {
    const registry = createPreviewFlushRegistry();
    registry.register(() => Promise.resolve());
    registry.register(() => Promise.reject(new Error("save failed")));
    await expect(registry.flushAll()).rejects.toThrow("save failed");
  });

  it("an unregistered flush is no longer called", async () => {
    const registry = createPreviewFlushRegistry();
    const flush = vi.fn(() => Promise.resolve());
    const unregister = registry.register(flush);
    unregister();
    await registry.flushAll();
    expect(flush).not.toHaveBeenCalled();
  });
});

function Step({ persist }: { persist?: (content: MemorialContent) => Promise<{ updatedAt: string }> }) {
  const [content, setContent] = useState<MemorialContent>({});
  useAutosave({ content, persist });
  return (
    <input
      aria-label="champ"
      onChange={(event) => setContent({ hero: { displayName: event.target.value } } as unknown as MemorialContent)}
    />
  );
}

function withRegistry(registry: PreviewFlushRegistry, children: React.ReactNode) {
  return <PreviewFlushRegistryContext.Provider value={registry}>{children}</PreviewFlushRegistryContext.Provider>;
}

describe("useAutosave registers its own flush with the Preview host", () => {
  it("flushAll saves the step's pending edit immediately, not after the debounce", async () => {
    const registry = createPreviewFlushRegistry();
    const persist = vi.fn<(content: MemorialContent) => Promise<{ updatedAt: string }>>(() =>
      Promise.resolve({ updatedAt: "2026-09-24T00:00:00.000Z" }),
    );
    render(withRegistry(registry, <Step persist={persist} />));

    fireEvent.change(screen.getByLabelText("champ"), { target: { value: "Éléonore" } });
    expect(persist).not.toHaveBeenCalled(); // still debounced

    await act(() => registry.flushAll());
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist.mock.calls[0][0]).toEqual({ hero: { displayName: "Éléonore" } });
  });

  it("flushAll rejects when the step's save fails", async () => {
    const registry = createPreviewFlushRegistry();
    const persist = vi.fn(() => Promise.reject(new Error("offline")));
    render(withRegistry(registry, <Step persist={persist} />));

    fireEvent.change(screen.getByLabelText("champ"), { target: { value: "x" } });
    await act(async () => {
      await expect(registry.flushAll()).rejects.toThrow();
    });
  });

  it("unregisters on unmount", async () => {
    const registry = createPreviewFlushRegistry();
    const persist = vi.fn(() => Promise.resolve({ updatedAt: "2026-09-24T00:00:00.000Z" }));
    const { unmount } = render(withRegistry(registry, <Step persist={persist} />));
    fireEvent.change(screen.getByLabelText("champ"), { target: { value: "x" } });
    unmount();
    await registry.flushAll();
    expect(persist).not.toHaveBeenCalled();
  });

  it("registers nothing for a mount without autosave", async () => {
    const registry = createPreviewFlushRegistry();
    const register = vi.spyOn(registry, "register");
    render(withRegistry(registry, <Step />));
    expect(register).not.toHaveBeenCalled();
  });

  it("changes nothing outside a Preview host", () => {
    const persist = vi.fn(() => Promise.resolve({ updatedAt: "2026-09-24T00:00:00.000Z" }));
    expect(() => render(<Step persist={persist} />)).not.toThrow();
  });
});
