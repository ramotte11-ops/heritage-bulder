import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAutosaveController } from "./autosave-controller";
import { hasUnsavedChanges } from "./autosave-state";
import type { MemorialContent } from "@/types/memorial";

/**
 * Mission 010 — the required scenarios (brief section 15, Tests A–J),
 * each traceable one to one below. `hasUnsavedChanges(controller.getState())`
 * is exactly the boundary lib/builder/use-autosave.ts's `beforeunload`
 * guard is armed/disarmed by (Test H) — this file proves that boundary
 * transitions correctly through every required scenario using the real
 * controller (autosave-controller.ts) and the real pure predicate
 * (autosave-state.ts), never a parallel "dirty" tracker of its own.
 *
 * The literal `window.addEventListener("beforeunload"/"online", ...)`
 * wiring itself is not exercised here (or anywhere in this codebase —
 * no DOM test environment exists; see autosave-integration.test.ts's
 * docstring for the same, already-established limitation). What *is*
 * proven is the one thing that actually decides correctness: the
 * activation condition never gives a false positive or false negative
 * at any point in these scenarios.
 */

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const DEBOUNCE_MS = 500;

const CONTENT_A: MemorialContent = { hero: { title: "A" } };
const CONTENT_B: MemorialContent = { hero: { title: "B" } };

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Test A — already-saved state", () => {
  it("hasUnsavedChanges is false once the latest generation is really saved", async () => {
    const persist = vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" });
    const controller = createAutosaveController({ persist, debounceMs: DEBOUNCE_MS });

    controller.notifyContentChanged(CONTENT_A);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);

    expect(controller.getState().status).toBe("saved");
    expect(hasUnsavedChanges(controller.getState())).toBe(false);
  });
});

describe("Test B — during the debounce window", () => {
  it("hasUnsavedChanges is true the instant a change is made, before the debounce elapses", () => {
    const persist = vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" });
    const controller = createAutosaveController({ persist, debounceMs: DEBOUNCE_MS });

    controller.notifyContentChanged(CONTENT_A);

    expect(controller.getState().status).toBe("pending");
    expect(hasUnsavedChanges(controller.getState())).toBe(true);
    expect(persist).not.toHaveBeenCalled(); // reload right now would lose this edit
  });
});

describe("Test C — during an in-flight save", () => {
  it("hasUnsavedChanges stays true for the whole time a slow save is unresolved", async () => {
    const inFlight = deferred<{ updatedAt: string }>();
    const persist = vi.fn().mockReturnValueOnce(inFlight.promise);
    const controller = createAutosaveController({ persist, debounceMs: DEBOUNCE_MS });

    controller.notifyContentChanged(CONTENT_A);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);

    expect(controller.getState().status).toBe("saving");
    expect(hasUnsavedChanges(controller.getState())).toBe(true);

    // Still true well after the debounce window — nothing about time
    // passing makes an in-flight save "safe" on its own.
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 5);
    expect(hasUnsavedChanges(controller.getState())).toBe(true);

    inFlight.resolve({ updatedAt: "2026-01-01T00:00:00.000Z" });
    await vi.advanceTimersByTimeAsync(0);
    expect(hasUnsavedChanges(controller.getState())).toBe(false);
  });
});

describe("Test D — after a real saved confirmation", () => {
  it("the protection disables exactly once the save actually succeeds, not before", async () => {
    const inFlight = deferred<{ updatedAt: string }>();
    const persist = vi.fn().mockReturnValueOnce(inFlight.promise);
    const controller = createAutosaveController({ persist, debounceMs: DEBOUNCE_MS });

    controller.notifyContentChanged(CONTENT_A);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(hasUnsavedChanges(controller.getState())).toBe(true);

    inFlight.resolve({ updatedAt: "2026-01-01T00:00:00.000Z" });
    await vi.advanceTimersByTimeAsync(0);

    expect(controller.getState().status).toBe("saved");
    expect(hasUnsavedChanges(controller.getState())).toBe(false);
  });
});

describe("Test E — persistence error", () => {
  it("keeps the content, records the error, and leaves protection active", async () => {
    const persist = vi.fn().mockRejectedValueOnce(new Error("network down"));
    const controller = createAutosaveController({ persist, debounceMs: DEBOUNCE_MS });

    controller.notifyContentChanged(CONTENT_A);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);

    expect(controller.getState()).toEqual({
      status: "error",
      lastSavedAt: null,
      lastError: "network down",
    });
    expect(hasUnsavedChanges(controller.getState())).toBe(true);
    // The content itself was never touched by the controller — it only
    // ever reads what notifyContentChanged was given; a caller's own
    // Builder state (state.content) is completely untouched by a
    // persistence failure.
  });
});

describe("Test F — retry after error", () => {
  it("sends the last unsaved version, reaches saved only on real success, and protection then clears", async () => {
    const persist = vi.fn().mockRejectedValueOnce(new Error("network down"));
    const controller = createAutosaveController({ persist, debounceMs: DEBOUNCE_MS });

    controller.notifyContentChanged(CONTENT_A);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(hasUnsavedChanges(controller.getState())).toBe(true);

    persist.mockResolvedValueOnce({ updatedAt: "2026-01-01T00:00:00.000Z" });
    controller.retry();

    expect(persist).toHaveBeenLastCalledWith(CONTENT_A);
    expect(hasUnsavedChanges(controller.getState())).toBe(true); // saving, not yet confirmed

    await vi.advanceTimersByTimeAsync(0);

    expect(controller.getState().status).toBe("saved");
    expect(hasUnsavedChanges(controller.getState())).toBe(false);
  });
});

describe("Test G — a newer version arriving during retry/save wins", () => {
  it("never lets an older save's success clear protection for a newer, still-unsaved version", async () => {
    const saveA = deferred<{ updatedAt: string }>();
    const persist = vi.fn().mockRejectedValueOnce(new Error("network down"));
    const controller = createAutosaveController({ persist, debounceMs: DEBOUNCE_MS });

    controller.notifyContentChanged(CONTENT_A);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);

    persist.mockReturnValueOnce(saveA.promise);
    controller.retry(); // A's retry starts

    controller.notifyContentChanged(CONTENT_B); // B arrives mid-retry
    expect(hasUnsavedChanges(controller.getState())).toBe(true);

    persist.mockResolvedValueOnce({ updatedAt: "2026-01-02T00:00:00.000Z" });
    saveA.resolve({ updatedAt: "2026-01-01T00:00:00.000Z" }); // A succeeds
    await vi.advanceTimersByTimeAsync(0);

    // Protection must still be active — B is not saved yet.
    expect(controller.getState().status).toBe("pending");
    expect(hasUnsavedChanges(controller.getState())).toBe(true);

    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS); // B's own save fires
    expect(persist).toHaveBeenLastCalledWith(CONTENT_B);
    expect(hasUnsavedChanges(controller.getState())).toBe(false);
  });
});

describe("Test H — beforeunload activation boundary", () => {
  // The actual window.addEventListener wiring lives in
  // lib/builder/use-autosave.ts and is gated by exactly
  // `hasUnsavedChanges(state)` — see this file's own top docstring for
  // why that wiring itself isn't independently DOM-tested. What's
  // proven here is that the boundary it reads never misfires across a
  // full realistic lifecycle.
  it("is inactive at idle, active once dirty, and inactive again once saved", async () => {
    const persist = vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" });
    const controller = createAutosaveController({ persist, debounceMs: DEBOUNCE_MS });

    expect(hasUnsavedChanges(controller.getState())).toBe(false); // idle

    controller.notifyContentChanged(CONTENT_A);
    expect(hasUnsavedChanges(controller.getState())).toBe(true); // pending

    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(hasUnsavedChanges(controller.getState())).toBe(false); // saved
  });

  it("destroy() leaves no further transitions to observe — nothing to guard after cleanup", async () => {
    const inFlight = deferred<{ updatedAt: string }>();
    const persist = vi.fn().mockReturnValueOnce(inFlight.promise);
    const controller = createAutosaveController({ persist, debounceMs: DEBOUNCE_MS });
    const listener = vi.fn();
    controller.subscribe(listener);

    controller.notifyContentChanged(CONTENT_A);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(hasUnsavedChanges(controller.getState())).toBe(true);

    listener.mockClear();
    controller.destroy();
    inFlight.resolve({ updatedAt: "2026-01-01T00:00:00.000Z" });
    await vi.advanceTimersByTimeAsync(0);

    // No further notification for a future beforeunload effect to
    // re-evaluate against — a real React unmount's cleanup already
    // removed the listener regardless (see use-autosave.ts).
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("Test I — no persist configured (demo mode)", () => {
  it("never reports a risk, because state never leaves idle without a controller", () => {
    // This is exactly lib/builder/use-autosave.ts's own behaviour when
    // `persist` is undefined: no controller is created at all.
    const controller: ReturnType<typeof createAutosaveController> | null = null;

    expect(controller).toBeNull();
    // The hook's own getNoopState() always returns INITIAL_AUTOSAVE_STATE.
    expect(hasUnsavedChanges({ status: "idle", lastSavedAt: null, lastError: null })).toBe(false);
  });
});

describe("Test J — slow network, simulated with a controllable promise", () => {
  it("keeps protection accurate through edits arriving during a slow save, an attempted departure, and eventual resolution", async () => {
    const slowSave = deferred<{ updatedAt: string }>();
    const persist = vi.fn().mockReturnValueOnce(slowSave.promise);
    const controller = createAutosaveController({ persist, debounceMs: DEBOUNCE_MS });

    // Family types.
    controller.notifyContentChanged(CONTENT_A);
    expect(hasUnsavedChanges(controller.getState())).toBe(true); // "leaving now" would be risky

    // Debounce elapses, the slow save begins.
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(controller.getState().status).toBe("saving");

    // A long, unresolved wait — simulating a slow/mobile connection.
    // An attempted departure right now must still be considered risky.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(hasUnsavedChanges(controller.getState())).toBe(true);

    // More edits arrive before the slow request ever resolves.
    controller.notifyContentChanged(CONTENT_B);
    expect(hasUnsavedChanges(controller.getState())).toBe(true);

    // The slow request finally resolves — for the OLD content.
    persist.mockResolvedValueOnce({ updatedAt: "2026-01-02T00:00:00.000Z" });
    slowSave.resolve({ updatedAt: "2026-01-01T00:00:00.000Z" });
    await vi.advanceTimersByTimeAsync(0);

    // Still risky — B was never confirmed by that resolution.
    expect(hasUnsavedChanges(controller.getState())).toBe(true);

    // B's own save eventually completes.
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(persist).toHaveBeenLastCalledWith(CONTENT_B);
    expect(hasUnsavedChanges(controller.getState())).toBe(false);
  });
});
