import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createGuestDraft,
  prepareGuestDraftTransfer,
  updateGuestDraft,
  validateGuestDraft,
  type GuestDraftPhoto,
  type GuestDraftV1,
} from "./guest-draft";
import {
  createIndexedDbGuestDraftStore,
  GuestDraftStorageError,
  GuestDraftStore,
  type GuestDraftStorageDriver,
} from "./guest-draft-store";

const T0 = "2026-10-25T10:00:00.000Z";
const T1 = "2026-10-25T10:05:00.000Z";

function photo(localId: string, purpose: "hero" | "gallery" = "gallery"): GuestDraftPhoto {
  return {
    localId,
    source: {
      blob: new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: "image/jpeg" }),
      mimeType: "image/jpeg",
      originalFilename: `${localId}.jpg`,
      lastModified: 1_760_000_000_000,
    },
    placement: purpose === "hero"
      ? { purpose: "hero", crop: { focalX: 0.35, focalY: 0.6, zoom: 1.4 } }
      : { purpose: "gallery", caption: "Son jardin" },
  };
}

function draft(): GuestDraftV1 {
  const created = createGuestDraft({
    draftId: "guest-draft-1",
    transferKey: "guest-transfer-1",
    now: T0,
    content: {
      hero: {
        displayName: "Jeanne Dupont",
        birth: { precision: "year", year: 1948 },
        death: null,
        shortPhrase: "Toujours près de nous",
        photo: null,
      },
      guidedFlow: { T04: { status: "completed" }, A99: { status: "completed" } },
      gallery: { items: [] },
    } as never,
    photos: [photo("hero-local", "hero"), photo("gallery-local")],
  });
  if (!created.ok) throw new Error(created.reason);
  return created.draft;
}

class MemoryDriver implements GuestDraftStorageDriver {
  value: unknown | null = null;
  writes = 0;
  failNext: GuestDraftStorageError | null = null;

  async read(): Promise<unknown | null> {
    return this.value === null ? null : structuredClone(this.value);
  }

  async replace(next: GuestDraftV1): Promise<void> {
    if (this.failNext) {
      const error = this.failNext;
      this.failNext = null;
      throw error;
    }
    this.value = structuredClone(next);
    this.writes += 1;
  }

  async clear(): Promise<void> {
    this.value = null;
  }
}

describe("guest draft creation and validation", () => {
  it("preserves real Guided Builder text, unknown future flow data, photographs and crop intent", async () => {
    const value = draft();
    expect(value.content).toMatchObject({
      hero: { displayName: "Jeanne Dupont", shortPhrase: "Toujours près de nous", photo: null },
      guidedFlow: { A99: { status: "completed" } },
    });
    expect(value.photos.map((entry) => entry.localId)).toEqual(["hero-local", "gallery-local"]);
    expect(value.photos[0].placement).toEqual({ purpose: "hero", crop: { focalX: 0.35, focalY: 0.6, zoom: 1.4 } });
    await expect(value.photos[0].source.blob.arrayBuffer()).resolves.toEqual(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer);
  });

  it("updates without changing the stable transfer identity", () => {
    const current = draft();
    const updated = updateGuestDraft(current, {
      now: T1,
      content: { ...current.content, legacy: { text: "Un souvenir fidèle" } } as never,
    });
    expect(updated).toMatchObject({
      ok: true,
      draft: { revision: 1, createdAt: T0, updatedAt: T1, transferKey: "guest-transfer-1" },
    });
  });

  it("refuses fake authenticated-media references and duplicate local photographs", () => {
    expect(validateGuestDraft({
      ...draft(),
      content: { hero: { photo: { mediaId: "fake", crop: null } } },
    })).toEqual({ ok: false, reason: "server_media_reference" });
    expect(validateGuestDraft({
      ...draft(),
      photos: [photo("same"), photo("same")],
    })).toEqual({ ok: false, reason: "duplicate_photo" });
  });

  it("rejects unknown schemas and corrupted records explicitly", () => {
    expect(validateGuestDraft({ ...draft(), schemaVersion: 99 })).toEqual({
      ok: false,
      reason: "unknown_schema_version",
      foundVersion: 99,
    });
    expect(validateGuestDraft({ ...draft(), revision: -1 })).toEqual({ ok: false, reason: "invalid_revision" });
  });

  it("builds a stable, server-neutral future transfer bundle without side effects", () => {
    const value = draft();
    const first = prepareGuestDraftTransfer(value);
    const retry = prepareGuestDraftTransfer(value);
    expect(retry.idempotencyKey).toBe(first.idempotencyKey);
    expect(retry.photos.map((entry) => entry.localPhotoId)).toEqual(["hero-local", "gallery-local"]);
    expect(first.photos[0]).toMatchObject({ purpose: "hero", crop: { focalX: 0.35, focalY: 0.6, zoom: 1.4 }, caption: null });
    expect(first.photos[1]).toMatchObject({ purpose: "gallery", crop: null, caption: "Son jardin" });
  });
});

describe("guest draft persistence contract", () => {
  it("saves and faithfully reads a complete local draft", async () => {
    const store = new GuestDraftStore(new MemoryDriver());
    const value = draft();
    await expect(store.save(value)).resolves.toEqual({ ok: true });
    await expect(store.read()).resolves.toEqual({ status: "ready", draft: value });
  });

  it("resumes from the same durable store through a new application session", async () => {
    const driver = new MemoryDriver();
    await new GuestDraftStore(driver).save(draft());
    const nextBrowserSession = new GuestDraftStore(driver);
    await expect(nextBrowserSession.read()).resolves.toMatchObject({
      status: "ready",
      draft: { draftId: "guest-draft-1", photos: [{ localId: "hero-local" }, { localId: "gallery-local" }] },
    });
  });

  it("replaces one active record on repeated writes without duplicating photographs", async () => {
    const driver = new MemoryDriver();
    const store = new GuestDraftStore(driver);
    const value = draft();
    await store.save(value);
    await store.save(value);
    expect(driver.writes).toBe(2);
    await expect(store.read()).resolves.toMatchObject({
      status: "ready",
      draft: { photos: [{ localId: "hero-local" }, { localId: "gallery-local" }] },
    });
  });

  it("keeps the previous valid draft when a quota failure aborts the replacement", async () => {
    const driver = new MemoryDriver();
    const store = new GuestDraftStore(driver);
    const previous = draft();
    await store.save(previous);
    const changed = updateGuestDraft(previous, { now: T1, content: { hero: { displayName: "Changed", photo: null } } as never });
    if (!changed.ok) throw new Error(changed.reason);

    driver.failNext = new GuestDraftStorageError("quota_exceeded", "quota");
    await expect(store.save(changed.draft)).resolves.toEqual({ ok: false, reason: "quota_exceeded" });
    await expect(store.read()).resolves.toEqual({ status: "ready", draft: previous });
  });

  it("reports incompatible and corrupted stored data without erasing it", async () => {
    const driver = new MemoryDriver();
    const store = new GuestDraftStore(driver);
    driver.value = { ...draft(), schemaVersion: 2 };
    await expect(store.read()).resolves.toEqual({ status: "incompatible", foundVersion: 2 });
    expect(driver.value).not.toBeNull();

    driver.value = { ...draft(), photos: "broken" };
    await expect(store.read()).resolves.toEqual({ status: "corrupted", reason: "invalid_photo" });
    expect(driver.value).not.toBeNull();
  });

  it("reports a newer physical IndexedDB schema as incompatible", async () => {
    const driver = new MemoryDriver();
    driver.read = async () => {
      throw new DOMException("newer", "VersionError");
    };
    await expect(new GuestDraftStore(driver).read()).resolves.toEqual({ status: "incompatible", foundVersion: null });
  });

  it("clears data only through the explicit operation", async () => {
    const store = new GuestDraftStore(new MemoryDriver());
    await store.save(draft());
    await expect(store.clear()).resolves.toEqual({ ok: true });
    await expect(store.read()).resolves.toEqual({ status: "empty" });
  });

  it("fails safely when IndexedDB is unavailable", async () => {
    const store = createIndexedDbGuestDraftStore(undefined);
    await expect(store.read()).resolves.toMatchObject({ status: "error", error: { code: "unavailable" } });
    await expect(store.save(draft())).resolves.toEqual({ ok: false, reason: "unavailable" });
  });
});

describe("isolation boundaries", () => {
  it("contains no Supabase, network, publication or authenticated Builder integration", () => {
    const domain = readFileSync(new URL("./guest-draft.ts", import.meta.url), "utf8");
    const storage = readFileSync(new URL("./guest-draft-store.ts", import.meta.url), "utf8");
    const implementation = `${domain}\n${storage}`;
    expect(implementation).not.toMatch(/@supabase|lib\/supabase|fetch\s*\(|XMLHttpRequest|WebSocket/);
    expect(implementation).not.toMatch(/published|publication|app\/builder|server action/i);
  });
});
