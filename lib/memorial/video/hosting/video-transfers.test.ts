import { describe, expect, it, vi } from "vitest";
import { createVideoTransferManager } from "./video-transfers";
import type { DirectUploadOptions, DirectUploadResult } from "./direct-upload";

/** VID-07 — gestionnaire des envois de la page (doubles de test, aucun réseau). */

const ID = "22222222-2222-4222-8222-222222222222";
const granted = { status: "granted" as const, videoId: ID, uploadUrl: "https://upload.example/u", expiresAt: "x" };

function controlledUpload() {
  const calls: { options: DirectUploadOptions; finish: (r: DirectUploadResult) => void }[] = [];
  const upload = vi.fn((options: DirectUploadOptions) => new Promise<DirectUploadResult>((finish) => calls.push({ options, finish })));
  return { upload, calls };
}

describe("VID-07 — envois de la page", () => {
  it("préparation → envoi (progression arrondie vers le bas) → reçu ; 100 % seulement à la fin", async () => {
    const { upload, calls } = controlledUpload();
    const manager = createVideoTransferManager({ upload });
    const hosting = { request: vi.fn(async () => granted), cancel: vi.fn() };
    const done = manager.start({ draftVideoId: "v-1", file: new Blob([new Uint8Array(1000)]), declaredDurationSeconds: 10, hosting });
    expect(manager.get("v-1")?.phase).toBe("preparing");
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    expect(manager.get("v-1")).toMatchObject({ phase: "sending", percent: 0, videoId: ID });
    calls[0]!.options.onProgress!(999, 1000);
    expect(manager.get("v-1")?.percent).toBe(99);
    calls[0]!.finish({ status: "done" });
    await done;
    expect(manager.get("v-1")).toMatchObject({ phase: "sent", percent: 100 });
  });

  it("un second départ pendant un envoi est ignoré (pas de double envoi)", async () => {
    const { upload, calls } = controlledUpload();
    const manager = createVideoTransferManager({ upload });
    const hosting = { request: vi.fn(async () => granted), cancel: vi.fn() };
    void manager.start({ draftVideoId: "v-1", file: new Blob(["x"]), declaredDurationSeconds: 1, hosting });
    void manager.start({ draftVideoId: "v-1", file: new Blob(["x"]), declaredDurationSeconds: 1, hosting });
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    expect(hosting.request).toHaveBeenCalledTimes(1);
  });

  it("serveur injoignable ou refus : phase refused, aucun envoi", async () => {
    const { upload } = controlledUpload();
    const manager = createVideoTransferManager({ upload });
    await manager.start({ draftVideoId: "v-1", file: new Blob(["x"]), declaredDurationSeconds: 1, hosting: { request: vi.fn(async () => Promise.reject(new Error("x"))), cancel: vi.fn() } });
    expect(manager.get("v-1")).toMatchObject({ phase: "refused", refusal: "other" });
    await manager.start({ draftVideoId: "v-2", file: new Blob(["x"]), declaredDurationSeconds: 1, hosting: { request: vi.fn(async () => ({ status: "refused" as const, reason: "duration" as const })), cancel: vi.fn() } });
    expect(manager.get("v-2")).toMatchObject({ phase: "refused", refusal: "duration" });
    expect(upload).not.toHaveBeenCalled();
  });

  it("oubli (retrait) : l'envoi est interrompu et ses résultats tardifs sont ignorés", async () => {
    const { upload, calls } = controlledUpload();
    const manager = createVideoTransferManager({ upload });
    const done = manager.start({ draftVideoId: "v-1", file: new Blob(["x"]), declaredDurationSeconds: 1, hosting: { request: vi.fn(async () => granted), cancel: vi.fn() } });
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    manager.forget("v-1");
    expect(calls[0]!.options.signal!.aborted).toBe(true);
    calls[0]!.finish({ status: "done" });
    await done;
    expect(manager.get("v-1")).toBeNull();
  });

  it("annulation : arrêt, serveur prévenu, phase cancelled ; un envoi précédent est annulé avant toute nouvelle demande", async () => {
    const { upload, calls } = controlledUpload();
    const manager = createVideoTransferManager({ upload });
    const hosting = { request: vi.fn(async () => granted), cancel: vi.fn(async () => ({ status: "cancelled" as const })) };
    void manager.start({ draftVideoId: "v-1", file: new Blob(["x"]), declaredDurationSeconds: 1, hosting });
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    await manager.cancel("v-1", hosting);
    expect(calls[0]!.options.signal!.aborted).toBe(true);
    expect(hosting.cancel).toHaveBeenCalledWith(ID);
    expect(manager.get("v-1")?.phase).toBe("cancelled");

    void manager.start({ draftVideoId: "v-1", file: new Blob(["x"]), declaredDurationSeconds: 1, hosting, previousVideoId: "old" });
    await vi.waitFor(() => expect(calls).toHaveLength(2));
    expect(hosting.cancel).toHaveBeenLastCalledWith("old");
    expect(hosting.cancel.mock.invocationCallOrder.at(-1)!).toBeLessThan(hosting.request.mock.invocationCallOrder.at(-1)!);
  });
});
