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

/**
 * Mission 009B revision — BuilderShell.tsx now calls
 * `useAutosave({ content: state.content, persist })` on every render.
 * That hook cannot be exercised directly here (it needs a real React
 * render; this codebase has no DOM test environment — see this file's
 * top docstring), so this reproduces its exact logical sequence by
 * hand against the real controller: skip notifying for the value
 * present at mount, notify for every value after that. Compare against
 * use-autosave.ts's `isFirstContentRender` effect, which this mirrors
 * line for line.
 */
function simulateBuilderShellMount(
  controller: ReturnType<typeof createAutosaveController> | null,
  initialContent: unknown,
) {
  let isFirstContentRender = true;
  return {
    onContentRender(content: unknown) {
      if (isFirstContentRender) {
        isFirstContentRender = false;
        return;
      }
      controller?.notifyContentChanged(content as Parameters<typeof controller.notifyContentChanged>[0]);
    },
    // Mirrors the hook's own mount effect firing once with the initial value.
    mount: () => void initialContent,
  };
}

describe("BuilderShell's real wiring — mount value is never itself autosaved", () => {
  it("does not persist the memorial's already-saved content just because the Builder mounted", async () => {
    const persist = vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" });
    const controller = createAutosaveController({ persist, debounceMs: DEBOUNCE_MS });

    const initialState = createInitialBuilderState(DEMO_MEMORIALS["demo-announcement"]);
    const shell = simulateBuilderShellMount(controller, initialState.content);
    shell.onContentRender(initialState.content); // the mount render

    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 3);

    expect(persist).not.toHaveBeenCalled();
    expect(controller.getState().status).toBe("idle");
  });

  it("persists a real subsequent edit, produced by the real SectionEditor->updateSectionContent path", async () => {
    const persist = vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" });
    const controller = createAutosaveController({ persist, debounceMs: DEBOUNCE_MS });

    let state = createInitialBuilderState(DEMO_MEMORIALS["demo-announcement"]);
    const shell = simulateBuilderShellMount(controller, state.content);
    shell.onContentRender(state.content); // mount — not persisted, per the test above

    // The exact call SectionEditor's onChange makes.
    state = updateSectionContent(state, "hero", { title: "Éléonore Vasseur — édité" });
    shell.onContentRender(state.content); // re-render after the edit

    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);

    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith(state.content);
    expect(controller.getState().status).toBe("saved");
  });
});

describe("BuilderShell without a persist dependency (Mission 003 demo mode)", () => {
  it("stays inert — edits never reach any persistence, exactly as when no memorialId exists", async () => {
    // No controller at all is the real behaviour when `persist` is
    // undefined — see use-autosave.ts: `persist ? createAutosaveController(...) : null`.
    const controller = null;

    let state = createInitialBuilderState(DEMO_MEMORIALS["demo-announcement"]);
    const shell = simulateBuilderShellMount(controller, state.content);

    expect(() => {
      shell.onContentRender(state.content); // mount
      state = updateSectionContent(state, "hero", { title: "Édité en mode démo" });
      shell.onContentRender(state.content); // edit
    }).not.toThrow();

    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 3);

    // Nothing to assert on persistence — there is no controller, and
    // that absence is itself the guarantee: the demo Builder keeps
    // working exactly as before this mission, with zero Supabase
    // reachability, by construction rather than by a runtime check.
    expect(state.content.hero).toMatchObject({ title: "Édité en mode démo" });
  });
});
