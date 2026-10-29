// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DraftRevisionProvider } from "@/lib/builder/draft-revision";
import { BuilderStepCompletionProvider } from "@/components/builder/journey/journey-context";
import { DraftConflictNotice } from "@/components/builder/DraftConflictNotice";
import type { LocalPhotoSnapshot } from "@/lib/media/local-photo";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("next/font/google", () => ({
  Playfair_Display: () => ({ variable: "--font-heritage-serif-mock", className: "" }),
  Inter: () => ({ variable: "--font-heritage-sans-mock", className: "" }),
  Cormorant_Garamond: () => ({ variable: "--font-heritage-hero-serif-mock", className: "" }),
  La_Belle_Aurore: () => ({ variable: "--font-heritage-hero-script-mock", className: "" }),
  EB_Garamond: () => ({ variable: "--font-heritage-ceremony-serif-mock", className: "" }),
}));

const { getBrowserSupabaseClient } = vi.hoisted(() => ({ getBrowserSupabaseClient: vi.fn() }));
vi.mock("@/lib/supabase/browser-client", () => ({ getBrowserSupabaseClient }));

const { preparePhotoForUpload } = vi.hoisted(() => ({
  preparePhotoForUpload: vi.fn(async () => ({
    ok: true as const,
    file: new File([new Uint8Array([1, 2, 3])], "photo.webp", { type: "image/webp" }),
    report: {
      purpose: "hero",
      inputBytes: 100,
      inputWidth: 3000,
      inputHeight: 2000,
      outputBytes: 3,
      width: 1800,
      height: 1200,
      type: "image/webp",
      quality: 0.9,
      attempts: 1,
      targetMet: true,
      heavierThanInput: false,
      durationMs: 1,
    },
  })),
}));
vi.mock("@/lib/media/photo-preparation", () => ({ preparePhotoForUpload }));

const { HeroPhotoStep } = await import("@/components/builder/HeroPhotoStep");
const { HeroCropStep } = await import("@/components/builder/HeroCropStep");

const CONTENT = {
  hero: { displayName: "Jeanne", birth: null, death: null, shortPhrase: null, photo: null },
  guidedFlow: { T04: { status: "skipped" }, A00: { status: "completed", answer: "no" }, T05: { status: "skipped" } },
} as never;

function localPhoto(localId = "local-hero", crop: LocalPhotoSnapshot["crop"] = null): LocalPhotoSnapshot {
  return {
    localId,
    blob: new Blob([new Uint8Array([4, 5, 6])], { type: "image/webp" }),
    mimeType: "image/webp",
    width: 1800,
    height: 1200,
    crop,
  };
}

function hosted(ui: React.ReactNode, revision: number, done = vi.fn()) {
  return {
    done,
    view: render(
      <DraftRevisionProvider initialRevision={revision} initialContent={CONTENT}>
        <DraftConflictNotice language="fr" />
        <BuilderStepCompletionProvider finishStep={done}>{ui}</BuilderStepCompletionProvider>
      </DraftRevisionProvider>,
    ),
  };
}

let urlSequence = 0;
const revokeObjectURL = vi.fn();

beforeEach(() => {
  urlSequence = 0;
  revokeObjectURL.mockClear();
  getBrowserSupabaseClient.mockClear();
  preparePhotoForUpload.mockClear();
  vi.stubGlobal("fetch", vi.fn());
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: vi.fn(() => `blob:guest-${++urlSequence}`),
    revokeObjectURL,
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("HeroPhotoStep — local guest port", () => {
  it("prepares, validates and stores the optimized photo before exposing it", async () => {
    const saved = localPhoto();
    const savePreparedPhoto = vi.fn(async (photo) => ({
      status: "saved" as const,
      updatedAt: "2026-10-26T10:01:00.000Z",
      revision: 1,
      photo: { ...saved, blob: photo.blob, width: photo.width, height: photo.height },
    }));
    const completePhoto = vi.fn(async () => ({ status: "saved" as const, updatedAt: "2026-10-26T10:02:00.000Z", revision: 2 }));
    const { done } = hosted(
      <HeroPhotoStep
        mode="local"
        language="fr"
        content={CONTENT}
        localMedia={{ initialPhoto: null, savePreparedPhoto, completePhoto }}
      />,
      0,
    );

    fireEvent.change(document.querySelector("input[type='file']") as HTMLInputElement, {
      target: { files: [new File([new Uint8Array(100)], "portrait.jpg", { type: "image/jpeg", lastModified: 123 })] },
    });

    await waitFor(() => expect(savePreparedPhoto).toHaveBeenCalled());
    expect(savePreparedPhoto.mock.calls[0][0]).toMatchObject({
      mimeType: "image/webp",
      width: 1800,
      height: 1200,
      originalFilename: "portrait.jpg",
      lastModified: 123,
    });
    await waitFor(() => expect((screen.getByRole("img") as HTMLImageElement).src).toContain("blob:guest-1"));
    expect(getBrowserSupabaseClient).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /continuer/i }));
    await waitFor(() => expect(completePhoto).toHaveBeenCalledWith(1));
    expect(done).toHaveBeenCalledOnce();
  });

  it("rejects an invalid file without preparing or storing it", async () => {
    const savePreparedPhoto = vi.fn();
    hosted(
      <HeroPhotoStep
        mode="local"
        language="fr"
        content={CONTENT}
        localMedia={{ initialPhoto: null, savePreparedPhoto, completePhoto: vi.fn() }}
      />,
      0,
    );
    fireEvent.change(document.querySelector("input[type='file']") as HTMLInputElement, {
      target: { files: [new File(["pdf"], "document.pdf", { type: "application/pdf" })] },
    });
    await screen.findByRole("alert");
    expect(preparePhotoForUpload).not.toHaveBeenCalled();
    expect(savePreparedPhoto).not.toHaveBeenCalled();
  });

  it("keeps the previous photo visible when replacement storage fails", async () => {
    hosted(
      <HeroPhotoStep
        mode="local"
        language="fr"
        content={CONTENT}
        localMedia={{
          initialPhoto: localPhoto("old"),
          savePreparedPhoto: vi.fn(async () => { throw Object.assign(new Error("quota"), { reason: "quota_exceeded" }); }),
          completePhoto: vi.fn(),
        }}
      />,
      4,
    );
    expect((screen.getByRole("img") as HTMLImageElement).src).toContain("blob:guest-1");
    fireEvent.change(document.querySelector("input[type='file']") as HTMLInputElement, {
      target: { files: [new File([new Uint8Array(100)], "new.jpg", { type: "image/jpeg" })] },
    });
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect((screen.getByRole("img") as HTMLImageElement).src).toContain("blob:guest-1");
  });

  it("surfaces the existing blocking conflict notice for a stale tab", async () => {
    hosted(
      <HeroPhotoStep
        mode="local"
        language="fr"
        content={CONTENT}
        localMedia={{
          initialPhoto: null,
          savePreparedPhoto: vi.fn(async () => ({ status: "conflict" as const })),
          completePhoto: vi.fn(),
        }}
      />,
      7,
    );
    fireEvent.change(document.querySelector("input[type='file']") as HTMLInputElement, {
      target: { files: [new File([new Uint8Array(100)], "new.jpg", { type: "image/jpeg" })] },
    });
    await screen.findByText("Une version plus récente a été enregistrée ailleurs.");
    expect(screen.getByRole("button", { name: "Recharger la version enregistrée" })).toBeTruthy();
  });

  it("revokes replaced and unmounted object URLs", async () => {
    const saved = localPhoto("new");
    const { view } = hosted(
      <HeroPhotoStep
        mode="local"
        language="fr"
        content={CONTENT}
        localMedia={{
          initialPhoto: localPhoto("old"),
          savePreparedPhoto: vi.fn(async (photo) => ({
            status: "saved" as const,
            updatedAt: "2026-10-26T10:01:00.000Z",
            revision: 2,
            photo: { ...saved, blob: photo.blob },
          })),
          completePhoto: vi.fn(),
        }}
      />,
      1,
    );
    fireEvent.change(document.querySelector("input[type='file']") as HTMLInputElement, {
      target: { files: [new File([new Uint8Array(100)], "new.jpg", { type: "image/jpeg" })] },
    });
    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith("blob:guest-1"));
    view.unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:guest-2");
  });
});

describe("HeroCropStep — local guest port", () => {
  it("autosaves the shared crop geometry, completes T07 and restores it after remount", async () => {
    vi.useFakeTimers();
    const crop = { focalX: 0.5, focalY: 0.5, zoom: 1.5 };
    const saveCrop = vi.fn(async () => ({ status: "saved" as const, updatedAt: "2026-10-26T10:02:00.000Z", revision: 3 }));
    const completeCrop = vi.fn(async () => ({ status: "saved" as const, updatedAt: "2026-10-26T10:03:00.000Z", revision: 4 }));
    const first = hosted(
      <HeroCropStep
        mode="local"
        language="fr"
        content={CONTENT}
        localMedia={{ photo: localPhoto(), saveCrop, completeCrop, reopenPhoto: vi.fn() }}
      />,
      2,
    );

    fireEvent.change(screen.getByRole("slider"), { target: { value: "1.5" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(saveCrop).toHaveBeenCalledWith(crop, 2);
    fireEvent.click(screen.getByRole("button", { name: /continuer/i }));
    await act(async () => {});
    expect(completeCrop).toHaveBeenCalledWith(crop, 3);
    expect(first.done).toHaveBeenCalledOnce();
    first.view.unmount();

    const second = hosted(
      <HeroCropStep
        mode="local"
        language="fr"
        content={CONTENT}
        localMedia={{ photo: localPhoto("local-hero", crop), saveCrop: vi.fn(), completeCrop: vi.fn(), reopenPhoto: vi.fn() }}
      />,
      4,
    );
    expect((screen.getByRole("slider") as HTMLInputElement).value).toBe("1.5");
    second.view.unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:guest-2");
  });
});
