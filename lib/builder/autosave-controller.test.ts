import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAutosaveController } from "./autosave-controller";
import type { MemorialContent } from "@/types/memorial";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// A short, fixed delay — the exact value doesn't matter (fake timers
// control the clock either way), but keeping it distinct from the real
// AUTOSAVE_DEBOUNCE_MS makes test intent independent of that constant
// ever changing.
const DEBOUNCE_MS = 500;

const CONTENT_A: MemorialContent = { hero: { title: "A" } };
const CONTENT_B: MemorialContent = { hero: { title: "AB" } };
const CONTENT_C: MemorialContent = { hero: { title: "ABC" } };

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Test A — real debounce", () => {
  it("does not persist before the debounce window elapses, and persists exactly once after it does", async () => {
    const persist = vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" });
    const controller = createAutosaveController({ persist, debounceMs: DEBOUNCE_MS });

    controller.notifyContentChanged(CONTENT_A);
    expect(persist).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS - 1);
    expect(persist).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith(CONTENT_A);
  });
});

describe("Test B — burst of changes", () => {
  it("persists only the last content once, not one write per change", async () => {
    const persist = vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" });
    const controller = createAutosaveController({ persist, debounceMs: DEBOUNCE_MS });

    controller.notifyContentChanged(CONTENT_A);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS / 2);
    controller.notifyContentChanged(CONTENT_B);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS / 2);
    controller.notifyContentChanged(CONTENT_C);

    expect(persist).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);

    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith(CONTENT_C);
  });
});

describe("Test C — a change arriving during an in-flight save", () => {
  it("keeps a newer change pending, never marks it saved for the older save's completion, and eventually persists it on its own schedule", async () => {
    const saveA = deferred<{ updatedAt: string }>();
    const persist = vi.fn().mockReturnValueOnce(saveA.promise);
    const controller = createAutosaveController({ persist, debounceMs: DEBOUNCE_MS });

    controller.notifyContentChanged(CONTENT_A);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(controller.getState().status).toBe("saving");

    // B arrives while A is still in flight, well before B's own debounce
    // would elapse.
    controller.notifyContentChanged(CONTENT_B);
    expect(controller.getState().status).toBe("pending");

    // A resolves now.
    persist.mockResolvedValueOnce({ updatedAt: "2026-01-02T00:00:00.000Z" }); // for the eventual B save
    saveA.resolve({ updatedAt: "2026-01-01T00:00:00.000Z" });
    await vi.advanceTimersByTimeAsync(0);

    // B must not have been marked saved by A's completion, and A's
    // save must not have been re-triggered for B's content yet either
    // — B's own debounce hasn't elapsed.
    expect(controller.getState().status).toBe("pending");
    expect(persist).toHaveBeenCalledTimes(1);

    // B's own debounce now elapses — its own save fires.
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(persist).toHaveBeenCalledTimes(2);
    expect(persist).toHaveBeenLastCalledWith(CONTENT_B);
    expect(controller.getState().status).toBe("saved");
    expect(controller.getState().lastSavedAt).toBe("2026-01-02T00:00:00.000Z");
  });

  it("retries immediately once the in-flight save clears, when the newer change's own debounce had already elapsed and was blocked", async () => {
    const saveA = deferred<{ updatedAt: string }>();
    const persist = vi.fn().mockReturnValueOnce(saveA.promise);
    const controller = createAutosaveController({ persist, debounceMs: DEBOUNCE_MS });

    controller.notifyContentChanged(CONTENT_A);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(persist).toHaveBeenCalledTimes(1);

    controller.notifyContentChanged(CONTENT_B);
    // B's own debounce elapses WHILE A is still saving.
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    // Blocked — a save is already in flight, no second concurrent call.
    expect(persist).toHaveBeenCalledTimes(1);
    expect(controller.getState().status).toBe("pending");

    persist.mockResolvedValueOnce({ updatedAt: "2026-01-02T00:00:00.000Z" });
    saveA.resolve({ updatedAt: "2026-01-01T00:00:00.000Z" });
    // No further timer advance needed — the retry fires immediately.
    await vi.advanceTimersByTimeAsync(0);

    expect(persist).toHaveBeenCalledTimes(2);
    expect(persist).toHaveBeenLastCalledWith(CONTENT_B);
    expect(controller.getState().status).toBe("saved");
    expect(controller.getState().lastSavedAt).toBe("2026-01-02T00:00:00.000Z");
  });
});

describe("Test D — persistence error", () => {
  it("moves to error, keeps the content, and lets the next change start a normal new cycle", async () => {
    const persist = vi.fn().mockRejectedValueOnce(new Error("network down"));
    const controller = createAutosaveController({ persist, debounceMs: DEBOUNCE_MS });

    controller.notifyContentChanged(CONTENT_A);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);

    expect(controller.getState()).toEqual({
      status: "error",
      lastSavedAt: null,
      lastError: "network down",
    });

    persist.mockResolvedValueOnce({ updatedAt: "2026-01-01T00:00:00.000Z" });
    controller.notifyContentChanged(CONTENT_B);
    expect(controller.getState().status).toBe("pending");

    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);

    expect(persist).toHaveBeenCalledTimes(2);
    expect(persist).toHaveBeenLastCalledWith(CONTENT_B);
    expect(controller.getState()).toEqual({
      status: "saved",
      lastSavedAt: "2026-01-01T00:00:00.000Z",
      lastError: null,
    });
  });

  it("normalizes a non-Error rejection to a string reason", async () => {
    const persist = vi.fn().mockRejectedValueOnce("raw failure");
    const controller = createAutosaveController({ persist, debounceMs: DEBOUNCE_MS });

    controller.notifyContentChanged(CONTENT_A);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);

    expect(controller.getState().status).toBe("error");
    expect(controller.getState().lastError).toBe("raw failure");
  });
});

describe("Test E — cleanup", () => {
  it("cancels a pending debounce timer on destroy — no phantom save", async () => {
    const persist = vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" });
    const controller = createAutosaveController({ persist, debounceMs: DEBOUNCE_MS });

    controller.notifyContentChanged(CONTENT_A);
    controller.destroy();

    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 10);

    expect(persist).not.toHaveBeenCalled();
  });

  it("ignores an in-flight save's outcome once destroyed — no state change, no retry", async () => {
    const saveA = deferred<{ updatedAt: string }>();
    const persist = vi.fn().mockReturnValueOnce(saveA.promise);
    const controller = createAutosaveController({ persist, debounceMs: DEBOUNCE_MS });
    const listener = vi.fn();
    controller.subscribe(listener);

    controller.notifyContentChanged(CONTENT_A);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(controller.getState().status).toBe("saving");

    listener.mockClear();
    controller.destroy();

    saveA.resolve({ updatedAt: "2026-01-01T00:00:00.000Z" });
    await vi.advanceTimersByTimeAsync(0);

    expect(controller.getState().status).toBe("saving"); // frozen at destroy time
    expect(listener).not.toHaveBeenCalled();
  });

  it("is idempotent — calling destroy twice does not throw", () => {
    const controller = createAutosaveController({ persist: vi.fn() });
    controller.destroy();
    expect(() => controller.destroy()).not.toThrow();
  });

  it("ignores a notifyContentChanged call after destroy", async () => {
    const persist = vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" });
    const controller = createAutosaveController({ persist, debounceMs: DEBOUNCE_MS });

    controller.destroy();
    controller.notifyContentChanged(CONTENT_A);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 10);

    expect(persist).not.toHaveBeenCalled();
    expect(controller.getState().status).toBe("idle");
  });
});

describe("Test F — no redundant save", () => {
  it("does not persist again if nothing changed after a successful save", async () => {
    const persist = vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" });
    const controller = createAutosaveController({ persist, debounceMs: DEBOUNCE_MS });

    controller.notifyContentChanged(CONTENT_A);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(controller.getState().status).toBe("saved");

    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 5);

    expect(persist).toHaveBeenCalledTimes(1);
  });
});

describe("setPersist", () => {
  it("uses the replaced callback for the next save, and an in-flight save keeps using the one it started with", async () => {
    const saveA = deferred<{ updatedAt: string }>();
    const oldPersist = vi.fn().mockReturnValueOnce(saveA.promise);
    const newPersist = vi.fn().mockResolvedValue({ updatedAt: "2026-01-02T00:00:00.000Z" });
    const controller = createAutosaveController({ persist: oldPersist, debounceMs: DEBOUNCE_MS });

    controller.notifyContentChanged(CONTENT_A);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(oldPersist).toHaveBeenCalledTimes(1);

    controller.setPersist(newPersist);
    saveA.resolve({ updatedAt: "2026-01-01T00:00:00.000Z" });
    await vi.advanceTimersByTimeAsync(0);
    expect(controller.getState().status).toBe("saved");
    expect(newPersist).not.toHaveBeenCalled();

    controller.notifyContentChanged(CONTENT_B);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);

    expect(newPersist).toHaveBeenCalledTimes(1);
    expect(newPersist).toHaveBeenCalledWith(CONTENT_B);
    expect(oldPersist).toHaveBeenCalledTimes(1);
  });
});

describe("subscribe/getState", () => {
  it("notifies subscribers on every transition and unsubscribe stops further notifications", async () => {
    const persist = vi.fn().mockResolvedValue({ updatedAt: "2026-01-01T00:00:00.000Z" });
    const controller = createAutosaveController({ persist, debounceMs: DEBOUNCE_MS });
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);

    controller.notifyContentChanged(CONTENT_A); // -> pending
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS); // -> saving -> saved

    expect(listener).toHaveBeenCalledTimes(1);
  });
});
