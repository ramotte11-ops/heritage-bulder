// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createGuestDraftV3, type GuestDraftV3 } from "@/lib/guest-draft/guest-draft-v3";
import type {
  GuestDraftV3PhotoWriteResult,
  GuestDraftV3ReadResult,
  GuestDraftV3WriteResult,
} from "@/lib/guest-draft/guest-draft-v3-store";
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
  value: GuestDraftV3 | null;

  constructor(value: GuestDraftV3 | null) {
    this.value = value;
  }

  async read(): Promise<GuestDraftV3ReadResult> {
    return this.value === null
      ? { status: "empty" }
      : { status: "ready", draft: structuredClone(this.value) };
  }

  async save(draft: GuestDraftV3, expectedRevision: number | null): Promise<GuestDraftV3WriteResult> {
    if (
      (expectedRevision === null && this.value !== null)
      || (expectedRevision !== null && this.value?.revision !== expectedRevision)
    ) {
      return { ok: false, reason: "revision_conflict" };
    }
    this.value = structuredClone(draft);
    return { ok: true };
  }

  async readPhoto() { return { ok: false as const, reason: "photo_not_found" as const }; }
  async addPhoto(): Promise<GuestDraftV3PhotoWriteResult> { return { ok: false, reason: "photo_not_found" }; }
  async replacePhoto(): Promise<GuestDraftV3PhotoWriteResult> { return { ok: false, reason: "photo_not_found" }; }
  async updatePhotoPlacement(): Promise<GuestDraftV3PhotoWriteResult> { return { ok: false, reason: "photo_not_found" }; }
}

function newDraft(): GuestDraftV3 {
  const created = createGuestDraftV3({
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
    const createStore = () => ({
      read: async (): Promise<GuestDraftV3ReadResult> => ({
        status: "error",
        error: Object.assign(new Error("unavailable"), { code: "unavailable" as const }),
      }),
      save: async (): Promise<GuestDraftV3WriteResult> => ({ ok: false, reason: "unavailable" }),
      readPhoto: async () => ({ ok: false as const, reason: "photo_not_found" as const }),
      addPhoto: async () => ({ ok: false as const, reason: "unavailable" as const }),
      replacePhoto: async () => ({ ok: false as const, reason: "unavailable" as const }),
      updatePhotoPlacement: async () => ({ ok: false as const, reason: "unavailable" as const }),
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
