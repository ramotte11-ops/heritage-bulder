// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { MemorialContent } from "@/types/memorial";
import {
  DraftRevisionConflictError,
  DraftRevisionProvider,
  useDraftRevisionCoordinator,
  useRevisionedDraftPersist,
  type DraftSaveTransport,
} from "./draft-revision";

const CONTENT_A = { hero: { displayName: "Version A" } } as MemorialContent;
const CONTENT_B = { hero: { displayName: "Version B" } } as MemorialContent;

function wrapper(initialRevision: number, initialContent: MemorialContent) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <DraftRevisionProvider initialRevision={initialRevision} initialContent={initialContent}>
        {children}
      </DraftRevisionProvider>
    );
  };
}

describe("DraftRevisionProvider", () => {
  it("serializes two same-tab saves so the second uses N+1 instead of creating a false conflict", async () => {
    let releaseFirst: () => void = () => {};
    const firstPending = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let serverRevision = 4;
    let serverContent = CONTENT_A;
    const transport = vi.fn<DraftSaveTransport>(async (content, expectedRevision) => {
      if (transport.mock.calls.length === 1) await firstPending;
      if (expectedRevision !== serverRevision) return { status: "conflict" };
      serverContent = content;
      serverRevision += 1;
      return { status: "saved", updatedAt: `t${serverRevision}`, revision: serverRevision };
    });
    const rendered = renderHook(() => useRevisionedDraftPersist(transport), {
      wrapper: wrapper(4, CONTENT_A),
    });

    const first = rendered.result.current!(CONTENT_A);
    const second = rendered.result.current!(CONTENT_B);

    // The second operation must not leave the browser with the same N while
    // the first one is still unresolved.
    await act(async () => {
      await Promise.resolve();
    });
    expect(transport).toHaveBeenCalledTimes(1);

    await act(async () => {
      releaseFirst();
      await Promise.all([first, second]);
    });

    expect(transport.mock.calls.map((call) => call[1])).toEqual([4, 5]);
    expect(serverRevision).toBe(6);
    expect(serverContent).toEqual(CONTENT_B);
    expect(rendered.result.current).toBeTruthy();
  });

  it("refuses stale tab A after tab B commits N → N+1 and never overwrites B", async () => {
    let serverRevision = 4;
    let serverContent = CONTENT_A;
    const transport = vi.fn<DraftSaveTransport>(async (content, expectedRevision) => {
      if (expectedRevision !== serverRevision) return { status: "conflict" };
      serverContent = content;
      serverRevision += 1;
      return { status: "saved", updatedAt: "2026-10-18T20:00:00Z", revision: serverRevision };
    });

    const tabA = renderHook(() => useRevisionedDraftPersist(transport), {
      wrapper: wrapper(4, CONTENT_A),
    });
    const tabB = renderHook(() => useRevisionedDraftPersist(transport), {
      wrapper: wrapper(4, CONTENT_A),
    });

    await act(async () => {
      await tabB.result.current!(CONTENT_B);
    });
    await expect(tabA.result.current!({ hero: { displayName: "Retard A" } })).rejects.toBeInstanceOf(
      DraftRevisionConflictError,
    );

    expect(serverRevision).toBe(5);
    expect(serverContent).toEqual(CONTENT_B);
    expect(transport).toHaveBeenCalledTimes(2);

    // Once conflicted, the local form stays blocked: no automatic/manual
    // retry can reach persistence until the family explicitly reloads.
    await expect(tabA.result.current!(CONTENT_A)).rejects.toBeInstanceOf(DraftRevisionConflictError);
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it("shares the new revision between autosave and a later explicit/visibility write", async () => {
    const transport = vi.fn<DraftSaveTransport>()
      .mockResolvedValueOnce({ status: "saved", updatedAt: "t1", revision: 8 })
      .mockResolvedValueOnce({ status: "saved", updatedAt: "t2", revision: 9 });

    const rendered = renderHook(
      () => ({ save: useRevisionedDraftPersist(transport), coordinator: useDraftRevisionCoordinator() }),
      { wrapper: wrapper(7, CONTENT_A) },
    );

    await act(async () => {
      await rendered.result.current.save!(CONTENT_B);
      await rendered.result.current.coordinator!.commit(null, (revision) => transport(CONTENT_B, revision));
    });

    expect(transport.mock.calls.map((call) => call[1])).toEqual([7, 8]);
  });

  it("accepts repeated no-op saves and adopts the current server revision without writing", async () => {
    const transport = vi.fn<DraftSaveTransport>().mockResolvedValue({
      status: "saved",
      updatedAt: "stored",
      revision: 12,
    });
    const rendered = renderHook(() => useRevisionedDraftPersist(transport), {
      wrapper: wrapper(11, CONTENT_A),
    });

    await act(async () => {
      await rendered.result.current!(CONTENT_A);
      await rendered.result.current!(CONTENT_A);
    });

    expect(transport.mock.calls.map((call) => call[1])).toEqual([11, 12]);
  });

  it("keeps a network failure retryable and distinct from a version conflict", async () => {
    const transport = vi.fn<DraftSaveTransport>()
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce({ status: "saved", updatedAt: "restored", revision: 5 });
    const rendered = renderHook(
      () => ({ save: useRevisionedDraftPersist(transport), coordinator: useDraftRevisionCoordinator() }),
      { wrapper: wrapper(4, CONTENT_A) },
    );

    await expect(rendered.result.current.save!(CONTENT_B)).rejects.toThrow("network down");
    expect(rendered.result.current.coordinator!.conflictContent).toBeNull();

    await act(async () => {
      await rendered.result.current.save!(CONTENT_B);
    });
    expect(transport.mock.calls.map((call) => call[1])).toEqual([4, 4]);
  });

  it("lets a freshly reloaded device continue from the durable revision", async () => {
    const transport = vi.fn<DraftSaveTransport>().mockResolvedValue({
      status: "saved",
      updatedAt: "mobile",
      revision: 10,
    });
    const mobile = renderHook(() => useRevisionedDraftPersist(transport), {
      wrapper: wrapper(9, CONTENT_B),
    });

    await act(async () => {
      await mobile.result.current!(CONTENT_B);
    });
    expect(transport).toHaveBeenCalledWith(CONTENT_B, 9);
  });
});
