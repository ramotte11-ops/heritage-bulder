import { describe, expect, it } from "vitest";
import {
  AUTOSAVE_DEBOUNCE_MS,
  hasUnsavedChanges,
  INITIAL_AUTOSAVE_STATE,
  markContentChanged,
  saveFailed,
  saveSucceeded,
  startSaving,
  type AutosaveState,
  type AutosaveStatus,
} from "./autosave-state";

describe("INITIAL_AUTOSAVE_STATE", () => {
  it("starts idle, with no save recorded and no error", () => {
    expect(INITIAL_AUTOSAVE_STATE).toEqual({
      status: "idle",
      lastSavedAt: null,
      lastError: null,
    });
  });
});

describe("AUTOSAVE_DEBOUNCE_MS", () => {
  it("is a positive, finite delay", () => {
    expect(AUTOSAVE_DEBOUNCE_MS).toBeGreaterThan(0);
    expect(Number.isFinite(AUTOSAVE_DEBOUNCE_MS)).toBe(true);
  });
});

describe("markContentChanged", () => {
  it("moves idle -> pending", () => {
    expect(markContentChanged(INITIAL_AUTOSAVE_STATE).status).toBe("pending");
  });

  it("moves saved -> pending, preserving lastSavedAt", () => {
    const saved: AutosaveState = {
      status: "saved",
      lastSavedAt: "2026-01-01T00:00:00.000Z",
      lastError: null,
    };

    expect(markContentChanged(saved)).toEqual({
      status: "pending",
      lastSavedAt: "2026-01-01T00:00:00.000Z",
      lastError: null,
    });
  });

  it("moves error -> pending, clearing the stale error", () => {
    const errored: AutosaveState = { status: "error", lastSavedAt: null, lastError: "network down" };

    expect(markContentChanged(errored)).toEqual({
      status: "pending",
      lastSavedAt: null,
      lastError: null,
    });
  });

  it("moves saving -> pending — a further edit during a save queues the next one", () => {
    const saving: AutosaveState = { status: "saving", lastSavedAt: null, lastError: null };

    expect(markContentChanged(saving).status).toBe("pending");
  });

  it("is a no-op from pending — one queued save already covers it", () => {
    const pending: AutosaveState = { status: "pending", lastSavedAt: null, lastError: null };

    expect(markContentChanged(pending)).toBe(pending);
  });
});

describe("startSaving", () => {
  it("moves pending -> saving", () => {
    const pending: AutosaveState = { status: "pending", lastSavedAt: null, lastError: null };

    expect(startSaving(pending).status).toBe("saving");
  });

  const NOT_PENDING: AutosaveState[] = [
    INITIAL_AUTOSAVE_STATE,
    { status: "saving", lastSavedAt: null, lastError: null },
    { status: "saved", lastSavedAt: "2026-01-01T00:00:00.000Z", lastError: null },
    { status: "error", lastSavedAt: null, lastError: "network down" },
  ];

  it.each(NOT_PENDING)("is a no-op from every status but pending (%o)", (state) => {
    expect(startSaving(state)).toBe(state);
  });
});

describe("saveSucceeded", () => {
  it("moves saving -> saved, recording the save time and clearing any error", () => {
    const saving: AutosaveState = { status: "saving", lastSavedAt: null, lastError: "previous failure" };

    expect(saveSucceeded(saving, "2026-01-01T00:00:00.000Z")).toEqual({
      status: "saved",
      lastSavedAt: "2026-01-01T00:00:00.000Z",
      lastError: null,
    });
  });

  const NOT_SAVING: AutosaveState[] = [
    INITIAL_AUTOSAVE_STATE,
    { status: "pending", lastSavedAt: null, lastError: null },
    { status: "saved", lastSavedAt: "2026-01-01T00:00:00.000Z", lastError: null },
    { status: "error", lastSavedAt: null, lastError: "network down" },
  ];

  it.each(NOT_SAVING)("is a no-op from every status but saving (%o)", (state) => {
    expect(saveSucceeded(state, "2026-01-02T00:00:00.000Z")).toBe(state);
  });
});

describe("saveFailed", () => {
  it("moves saving -> error, recording the reason", () => {
    const saving: AutosaveState = { status: "saving", lastSavedAt: null, lastError: null };

    expect(saveFailed(saving, "network down")).toEqual({
      status: "error",
      lastSavedAt: null,
      lastError: "network down",
    });
  });

  it("preserves a previous lastSavedAt — a failed retry must never hide a real earlier save", () => {
    const saving: AutosaveState = {
      status: "saving",
      lastSavedAt: "2026-01-01T00:00:00.000Z",
      lastError: null,
    };

    expect(saveFailed(saving, "network down")).toEqual({
      status: "error",
      lastSavedAt: "2026-01-01T00:00:00.000Z",
      lastError: "network down",
    });
  });

  const NOT_SAVING: AutosaveState[] = [
    INITIAL_AUTOSAVE_STATE,
    { status: "pending", lastSavedAt: null, lastError: null },
    { status: "saved", lastSavedAt: "2026-01-01T00:00:00.000Z", lastError: null },
    { status: "error", lastSavedAt: null, lastError: "network down" },
  ];

  it.each(NOT_SAVING)("is a no-op from every status but saving (%o)", (state) => {
    expect(saveFailed(state, "some reason")).toBe(state);
  });
});

describe("a realistic sequence", () => {
  it("idle -> change -> save -> succeed -> change -> save -> fail, keeping the earlier save visible", () => {
    let state = INITIAL_AUTOSAVE_STATE;

    state = markContentChanged(state);
    expect(state.status).toBe("pending");

    state = startSaving(state);
    expect(state.status).toBe("saving");

    state = saveSucceeded(state, "2026-01-01T00:00:00.000Z");
    expect(state).toEqual({ status: "saved", lastSavedAt: "2026-01-01T00:00:00.000Z", lastError: null });

    state = markContentChanged(state);
    state = startSaving(state);
    state = saveFailed(state, "network down");

    expect(state).toEqual({
      status: "error",
      lastSavedAt: "2026-01-01T00:00:00.000Z",
      lastError: "network down",
    });
  });
});

describe("hasUnsavedChanges — Mission 010's loss-protection boundary", () => {
  const RISKY: AutosaveStatus[] = ["pending", "saving", "error"];
  const SAFE: AutosaveStatus[] = ["idle", "saved"];

  it.each(RISKY)("is true while %s — the latest edit isn't guaranteed persisted", (status) => {
    const state: AutosaveState = { status, lastSavedAt: null, lastError: null };
    expect(hasUnsavedChanges(state)).toBe(true);
  });

  it.each(SAFE)("is false while %s — nothing currently at risk", (status) => {
    const state: AutosaveState = { status, lastSavedAt: null, lastError: null };
    expect(hasUnsavedChanges(state)).toBe(false);
  });

  it("is false for INITIAL_AUTOSAVE_STATE — never a false positive before any edit, and never one in persist-less (demo) mode either, since that mode never leaves idle", () => {
    expect(hasUnsavedChanges(INITIAL_AUTOSAVE_STATE)).toBe(false);
  });
});
