// @vitest-environment jsdom
import { act, createElement } from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { renderHook, act as rtlAct } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAutosave } from "./use-autosave";
import { INITIAL_AUTOSAVE_STATE } from "./autosave-state";
import type { MemorialContent } from "@/types/memorial";

/**
 * Hotfix — Builder autosave SSR snapshot.
 *
 * `use-autosave.ts`'s own docstring (and use-autosave.test.ts's) predate
 * this file: they describe a "no DOM rendering" convention that, in
 * practice, several `components/builder/*.test.tsx` files already
 * relaxed (HeroCropStep/HeroPhotoStep/HeroRevealStep, all `@vitest-
 * environment jsdom`). This file follows their precedent, for the one
 * thing that genuinely cannot be proven without a real server-render
 * pass: that `useAutosave` no longer throws "Missing getServerSnapshot"
 * when actually server-rendered — the exact, real failure every Guided
 * Flow screen (T01-V04, including every screen listed in the hotfix
 * brief's own regression list) hit on a direct navigation or a browser
 * refresh, reproduced end-to-end in the hotfix's own manual audit
 * against `/builder/demo/[demoId]` in both `next dev` and `next build &&
 * next start`.
 *
 * `renderToString` (react-dom/server) is what actually exercises
 * React's "am I being asked for getServerSnapshot?" branch of
 * `useSyncExternalStore` — this is a property of which renderer entry
 * point is called (`react-dom/server` vs `react-dom/client`), not of
 * whether `window`/`document` happen to exist, so this reproduces the
 * real failure faithfully even though Vitest's jsdom environment does
 * provide both.
 */

const CONTENT: MemorialContent = {
  hero: { displayName: "Jean Dupont", birth: null, death: null, shortPhrase: null, photo: null },
} as unknown as MemorialContent;

interface ProbeProps {
  content: MemorialContent;
  persist?: (content: MemorialContent) => Promise<{ updatedAt: string }>;
}

function Probe({ content, persist }: ProbeProps) {
  const { state } = useAutosave({ content, persist });
  return createElement(
    "div",
    { "data-testid": "status", "data-last-error": state.lastError ?? "" },
    state.status,
  );
}

describe("useAutosave — SSR snapshot never throws (hook/render SSR sans getServerSnapshot error)", () => {
  it("server-renders without throwing when a real persist is configured", () => {
    const persist = vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" });
    let html = "";
    expect(() => {
      html = renderToString(createElement(Probe, { content: CONTENT, persist }));
    }).not.toThrow();
    expect(html).toContain(">idle<");
    // The server pass never itself attempts a save.
    expect(persist).not.toHaveBeenCalled();
  });

  it("server-renders without throwing with no persist at all (demo/no-op mode)", () => {
    expect(() => renderToString(createElement(Probe, { content: CONTENT }))).not.toThrow();
  });
});

describe("useAutosave — snapshot serveur stable", () => {
  it("the server snapshot is always the neutral idle state — never pending/saving/error, regardless of persist", () => {
    const persist = vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" });
    const withPersist = renderToString(createElement(Probe, { content: CONTENT, persist }));
    const withoutPersist = renderToString(createElement(Probe, { content: CONTENT }));

    expect(withPersist).toContain(">idle<");
    expect(withoutPersist).toContain(">idle<");
    // Renders identically for a subsequent call, too — a stable
    // snapshot never varies render to render for the exact same input.
    expect(renderToString(createElement(Probe, { content: CONTENT, persist }))).toBe(withPersist);
  });

  it("never carries a fake lastError on the server", () => {
    const persist = vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" });
    const html = renderToString(createElement(Probe, { content: CONTENT, persist }));
    expect(html).toContain('data-last-error=""');
  });
});

describe("useAutosave — hydratation / état initial compatible (no mismatch warning)", () => {
  let container: HTMLDivElement;
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
    container.remove();
  });

  it("hydrates the server-rendered markup cleanly, with persist configured", () => {
    const persist = vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" });
    container.innerHTML = renderToString(createElement(Probe, { content: CONTENT, persist }));

    act(() => {
      hydrateRoot(container, createElement(Probe, { content: CONTENT, persist }));
    });

    expect(consoleError).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="status"]')?.textContent).toBe("idle");
  });

  it("hydrates cleanly with no persist at all (demo/no-op mode)", () => {
    container.innerHTML = renderToString(createElement(Probe, { content: CONTENT }));

    act(() => {
      hydrateRoot(container, createElement(Probe, { content: CONTENT }));
    });

    expect(consoleError).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="status"]')?.textContent).toBe("idle");
  });
});

describe("useAutosave — comportement client existant inchangé (regression)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("still transitions idle -> pending -> saving -> saved as content changes and persist resolves", async () => {
    let resolvePersist!: (value: { updatedAt: string }) => void;
    const persist = vi.fn(
      () =>
        new Promise<{ updatedAt: string }>((resolve) => {
          resolvePersist = resolve;
        }),
    );

    const { result, rerender } = renderHook(({ content }: { content: MemorialContent }) => useAutosave({ content, persist }), {
      initialProps: { content: CONTENT },
    });

    expect(result.current.state).toEqual(INITIAL_AUTOSAVE_STATE);

    const changed = { ...CONTENT, hero: { ...(CONTENT.hero as object), displayName: "Changée" } } as MemorialContent;
    rerender({ content: changed });
    expect(result.current.state.status).toBe("pending");

    await rtlAct(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith(changed);
    expect(result.current.state.status).toBe("saving");

    await rtlAct(async () => {
      resolvePersist({ updatedAt: "2026-02-02T00:00:00.000Z" });
      await Promise.resolve();
    });
    expect(result.current.state.status).toBe("saved");
    expect(result.current.state.lastSavedAt).toBe("2026-02-02T00:00:00.000Z");
  });

  it("still reports 'error' with the failure reason when persist rejects", async () => {
    const persist = vi.fn().mockRejectedValue(new Error("network down"));

    const { result, rerender } = renderHook(({ content }: { content: MemorialContent }) => useAutosave({ content, persist }), {
      initialProps: { content: CONTENT },
    });

    const changed = { ...CONTENT, hero: { ...(CONTENT.hero as object), displayName: "Changée" } } as MemorialContent;
    rerender({ content: changed });

    await rtlAct(async () => {
      await vi.advanceTimersByTimeAsync(1500);
      await Promise.resolve();
    });

    expect(result.current.state.status).toBe("error");
    expect(result.current.state.lastError).toBe("network down");
  });

  it("flush() still drains a pending autosave to durable completion before resolving", async () => {
    const persist = vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" });

    const { result, rerender } = renderHook(({ content }: { content: MemorialContent }) => useAutosave({ content, persist }), {
      initialProps: { content: CONTENT },
    });

    const changed = { ...CONTENT, hero: { ...(CONTENT.hero as object), displayName: "Changée" } } as MemorialContent;
    rerender({ content: changed });
    expect(persist).not.toHaveBeenCalled();

    await rtlAct(async () => {
      await result.current.flush();
    });

    expect(persist).toHaveBeenCalledTimes(1);
    expect(result.current.state.status).toBe("saved");
  });

  it("stays permanently idle, and flush()/retry() remain safe no-ops, with no persist at all", async () => {
    const { result } = renderHook(({ content }: { content: MemorialContent }) => useAutosave({ content }), {
      initialProps: { content: CONTENT },
    });

    expect(result.current.state).toEqual(INITIAL_AUTOSAVE_STATE);
    await rtlAct(async () => {
      await result.current.flush();
    });
    result.current.retry();
    expect(result.current.state).toEqual(INITIAL_AUTOSAVE_STATE);
  });
});
