// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createGuestDraft, type GuestDraftV2 } from "@/lib/guest-draft/guest-draft";
import type { GuestDraftReadResult, GuestDraftWriteResult } from "@/lib/guest-draft/guest-draft-store";
import type { GuestBuilderDraftStore } from "@/lib/guest-draft/guest-builder-runtime";
import { translate } from "@/lib/i18n/translate";

const { useRouter } = vi.hoisted(() => ({
  useRouter: vi.fn(() => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() })),
}));
vi.mock("next/navigation", () => ({ useRouter }));

vi.mock("next/font/google", () => ({
  Playfair_Display: () => ({ variable: "--font-heritage-serif-mock", className: "" }),
  Inter: () => ({ variable: "--font-heritage-sans-mock", className: "" }),
  Cormorant_Garamond: () => ({ variable: "--font-heritage-hero-serif-mock", className: "" }),
  La_Belle_Aurore: () => ({ variable: "--font-heritage-hero-script-mock", className: "" }),
  EB_Garamond: () => ({ variable: "--font-heritage-ceremony-serif-mock", className: "" }),
}));

const { GuestBuilderRuntime } = await import("./GuestBuilderRuntime");

class MemoryStore implements GuestBuilderDraftStore {
  value: GuestDraftV2 | null;

  constructor(value: GuestDraftV2 | null) {
    this.value = value;
  }

  async read(): Promise<GuestDraftReadResult> {
    return this.value === null
      ? { status: "empty" }
      : { status: "ready", draft: structuredClone(this.value) };
  }

  async save(draft: GuestDraftV2, expectedRevision: number | null): Promise<GuestDraftWriteResult> {
    if (
      (expectedRevision === null && this.value !== null)
      || (expectedRevision !== null && this.value?.revision !== expectedRevision)
    ) {
      return { ok: false, reason: "revision_conflict" };
    }
    this.value = structuredClone(draft);
    return { ok: true };
  }
}

function newDraft(): GuestDraftV2 {
  const created = createGuestDraft({
    draftId: "guest-ui-draft",
    transferKey: "guest-ui-transfer",
    now: "2026-10-26T09:00:00.000Z",
  });
  if (!created.ok) throw new Error(created.reason);
  return created.draft;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("GuestBuilderRuntime", () => {
  it("persists T01 and Welcome locally, advancing and resuming the same screens after reload", async () => {
    const store = new MemoryStore(newDraft());
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const createStore = () => store;
    const now = () => "2026-10-26T09:01:00.000Z";

    const first = render(
      <GuestBuilderRuntime createStore={createStore} createId={() => "unused"} now={now} />,
    );
    await screen.findByRole("radio", { name: "Français" });
    fireEvent.click(screen.getByRole("radio", { name: "Français" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await screen.findByRole("heading", { name: translate("fr", "welcome.title") });
    expect(store.value).toMatchObject({
      language: "fr",
      revision: 1,
      draftId: "guest-ui-draft",
      transferKey: "guest-ui-transfer",
    });
    expect(fetchSpy).not.toHaveBeenCalled();

    first.unmount();
    const reloaded = render(<GuestBuilderRuntime createStore={createStore} createId={() => "unused"} now={now} />);
    await screen.findByRole("heading", { name: translate("fr", "welcome.title") });
    expect(screen.queryByRole("radio", { name: "Français" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: translate("fr", "welcome.cta") }));
    await screen.findByRole("heading", { name: translate("fr", "hero.identityTitle") });
    expect(store.value?.content).toMatchObject({ welcome: { status: "completed" } });
    expect(store.value?.revision).toBe(2);
    expect(fetchSpy).not.toHaveBeenCalled();

    reloaded.unmount();
    render(<GuestBuilderRuntime createStore={createStore} createId={() => "unused"} now={now} />);
    await screen.findByRole("heading", { name: translate("fr", "hero.identityTitle") });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("surfaces an unavailable local store with existing generic copy", async () => {
    const createStore = (): GuestBuilderDraftStore => ({
      read: async () => ({
        status: "error",
        error: Object.assign(new Error("unavailable"), { code: "unavailable" as const }),
      }),
      save: async () => ({ ok: false, reason: "unavailable" }),
    });

    render(
      <GuestBuilderRuntime
        createStore={createStore}
        createId={() => "unused"}
        now={() => "2026-10-26T09:01:00.000Z"}
      />,
    );

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(translate("en", "errors.generic"));
    expect(alert.getAttribute("data-guest-builder-error")).toBe("unavailable");
  });
});
