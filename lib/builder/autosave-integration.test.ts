import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAutosaveController } from "./autosave-controller";
import { createInitialBuilderState, updateSectionContent } from "./builder-state";
import { DEMO_MEMORIALS } from "./demo-memorials";

/**
 * Mission 009B, point 19 — an integration test wiring the real Builder
 * state module (lib/builder/builder-state.ts, unchanged since Mission
 * 003) to the autosave runtime, with a fake persistence boundary. This
 * is deliberately NOT a rendered-component test: this codebase has no
 * DOM/React-rendering test anywhere (Vitest runs in the "node"
 * environment — see vitest.config.mts), so this proves the same wiring
 * a future `components/builder/*` caller would do — Builder state
 * change -> controller.notifyContentChanged -> debounce -> persist —
 * using the actual, already-existing Builder state functions rather
 * than a rendered mock of them.
 */

const DEBOUNCE_MS = 500;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Builder state change -> autosave runtime -> fake persistence", () => {
  it("captures the final, fully-merged Builder content after a real edit", async () => {
    const persist = vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" });
    const controller = createAutosaveController({ persist, debounceMs: DEBOUNCE_MS });

    let state = createInitialBuilderState(DEMO_MEMORIALS["demo-announcement"]);
    state = updateSectionContent(state, "hero", { title: "Éléonore Vasseur — édité" });

    controller.notifyContentChanged(state.content);

    expect(persist).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);

    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith(state.content);
    // The section untouched by this edit is preserved as-is — this is
    // whole-content, last-write-wins persistence (Mission 007/008), not
    // a per-field patch.
    expect((persist.mock.calls[0][0] as typeof state.content).deathNotice).toEqual(
      DEMO_MEMORIALS["demo-announcement"].draft.content.deathNotice,
    );
    expect(controller.getState().status).toBe("saved");
  });

  it("keeps only the latest of several rapid Builder edits pending, matching the burst behaviour already covered in isolation", async () => {
    const persist = vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" });
    const controller = createAutosaveController({ persist, debounceMs: DEBOUNCE_MS });

    let state = createInitialBuilderState(DEMO_MEMORIALS["demo-remembrance"]);

    state = updateSectionContent(state, "hero", { title: "Marcel" });
    controller.notifyContentChanged(state.content);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS / 2);

    state = updateSectionContent(state, "hero", { title: "Marcel Onésime" });
    controller.notifyContentChanged(state.content);

    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);

    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith(state.content);
  });
});
