// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MemorialContent } from "@/types/memorial";
import { AUTOSAVE_DEBOUNCE_MS } from "@/lib/builder/autosave-state";
import { DraftRevisionProvider, type DraftSaveTransport } from "@/lib/builder/draft-revision";

const { routerRefresh, useRouter } = vi.hoisted(() => {
  const refresh = vi.fn();
  return { routerRefresh: refresh, useRouter: vi.fn(() => ({ refresh })) };
});
vi.mock("next/navigation", () => ({ useRouter }));

vi.mock("next/font/google", () => ({
  Playfair_Display: () => ({ variable: "--font-heritage-serif-mock", className: "" }),
  Inter: () => ({ variable: "--font-heritage-sans-mock", className: "" }),
  Cormorant_Garamond: () => ({ variable: "--font-heritage-hero-serif-mock", className: "" }),
  La_Belle_Aurore: () => ({ variable: "--font-heritage-hero-script-mock", className: "" }),
  EB_Garamond: () => ({ variable: "--font-heritage-ceremony-serif-mock", className: "" }),
}));

const { HeroIdentityStep } = await import("./HeroIdentityStep");

const INITIAL = {
  hero: { displayName: "Jeanne", birth: null, death: null, shortPhrase: null, photo: null },
} as MemorialContent;

beforeEach(() => {
  vi.useFakeTimers();
  routerRefresh.mockClear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("HeroIdentityStep — autosave puis Continuer", () => {
  it("drains the in-flight autosave before committing the StepRecord with the next revision", async () => {
    let releaseAutosave: () => void = () => {};
    const autosavePending = new Promise<void>((resolve) => {
      releaseAutosave = resolve;
    });
    let serverRevision = 7;
    const persist = vi.fn<DraftSaveTransport>(async (_content, expectedRevision) => {
      if (persist.mock.calls.length === 1) await autosavePending;
      if (expectedRevision !== serverRevision) return { status: "conflict" };
      serverRevision += 1;
      return { status: "saved", updatedAt: `t${serverRevision}`, revision: serverRevision };
    });

    render(
      <DraftRevisionProvider initialRevision={7} initialContent={INITIAL}>
        <HeroIdentityStep language="fr" content={INITIAL} persist={persist} />
      </DraftRevisionProvider>,
    );

    fireEvent.change(screen.getByLabelText("Nom affiché"), {
      target: { value: "Jeanne Martin" },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
    });
    expect(persist).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
    expect(persist).toHaveBeenCalledTimes(1);

    await act(async () => {
      releaseAutosave();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(persist).toHaveBeenCalledTimes(2);
    expect(persist.mock.calls.map((call) => call[1])).toEqual([7, 8]);
    expect((persist.mock.calls[1][0] as { guidedFlow?: Record<string, unknown> }).guidedFlow?.T04).toBeTruthy();
    expect(routerRefresh).toHaveBeenCalledOnce();
  });
});
