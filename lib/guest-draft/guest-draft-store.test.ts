import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createGuestDraft,
  migrateGuestDraftV1ToV2,
  prepareGuestDraftTransfer,
  updateGuestDraft,
  validateGuestDraft,
  type GuestDraftPhoto,
  type GuestDraftV1,
  type GuestDraftV2,
} from "./guest-draft";
import {
  createIndexedDbGuestDraftStore,
  GuestDraftStorageError,
  GuestDraftStore,
  type GuestDraftStorageDriver,
  type GuestDraftDriverWriteResult,
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

function draft(): GuestDraftV2 {
  const created = createGuestDraft({
    draftId: "guest-draft-1",
    transferKey: "guest-transfer-1",
    now: T0,
    language: "fr",
    skinVariant: "dark",
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

function legacyDraft(): GuestDraftV1 {
  const current = draft();
  return {
    schemaVersion: 1,
    draftId: current.draftId,
    transferKey: current.transferKey,
    revision: current.revision,
    createdAt: current.createdAt,
    updatedAt: current.updatedAt,
    content: current.content,
    photos: current.photos,
  };
}

interface MemoryDatabase {
  current: unknown | null;
  legacy: unknown | null;
  writes: number;
}

function memoryDatabase(): MemoryDatabase {
  return { current: null, legacy: null, writes: 0 };
}

class MemoryDriver implements GuestDraftStorageDriver {
  failNext: GuestDraftStorageError | null = null;

  constructor(readonly database: MemoryDatabase = memoryDatabase()) {}

  private failIfRequested(): void {
    if (!this.failNext) return;
    const error = this.failNext;
    this.failNext = null;
    throw error;
  }

  async readCurrent(): Promise<unknown | null> {
    return this.database.current === null ? null : structuredClone(this.database.current);
  }

  async readLegacy(): Promise<unknown | null> {
    return this.database.legacy === null ? null : structuredClone(this.database.legacy);
  }

  async create(next: GuestDraftV2): Promise<GuestDraftDriverWriteResult> {
    this.failIfRequested();
    if (this.database.current !== null || this.database.legacy !== null) return "conflict";
    this.database.current = structuredClone(next);
    this.database.writes += 1;
    return "saved";
  }

  async replace(next: GuestDraftV2, expectedRevision: number): Promise<GuestDraftDriverWriteResult> {
    this.failIfRequested();
    const current = this.database.current as { revision?: unknown } | null;
    if (current === null || current.revision !== expectedRevision) return "conflict";
    this.database.current = structuredClone(next);
    this.database.writes += 1;
    return "saved";
  }

  async migrate(next: GuestDraftV2, expectedLegacyRevision: number): Promise<GuestDraftDriverWriteResult> {
    this.failIfRequested();
    const legacy = this.database.legacy as { revision?: unknown } | null;
    if (this.database.current !== null || legacy === null || legacy.revision !== expectedLegacyRevision) {
      return "conflict";
    }
    this.database.current = structuredClone(next);
    this.database.writes += 1;
    return "saved";
  }

  async clear(): Promise<void> {
    this.database.current = null;
    this.database.legacy = null;
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
    expect(value).toMatchObject({ schemaVersion: 2, language: "fr", skinVariant: "dark", transfer: { status: "not_started" } });
    expect(value.photos[0].placement).toEqual({ purpose: "hero", crop: { focalX: 0.35, focalY: 0.6, zoom: 1.4 } });
    await expect(value.photos[0].source.blob.arrayBuffer()).resolves.toEqual(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer);
  });

  it("updates without changing the stable transfer identity", () => {
    const current = draft();
    const updated = updateGuestDraft(current, {
      now: T1,
      language: "es",
      skinVariant: "light",
      content: { ...current.content, legacy: { text: "Un souvenir fidèle" } } as never,
    });
    expect(updated).toMatchObject({
      ok: true,
      draft: {
        draftId: "guest-draft-1",
        revision: 1,
        createdAt: T0,
        updatedAt: T1,
        transferKey: "guest-transfer-1",
        language: "es",
        skinVariant: "light",
        photos: [{ localId: "hero-local" }, { localId: "gallery-local" }],
      },
    });
  });

  it("persists the minimal future transfer checkpoint without a server identifier", () => {
    const current = draft();
    const updated = updateGuestDraft(current, {
      now: T1,
      transfer: { status: "pending", sourceRevision: current.revision, startedAt: T1 },
    });
    expect(updated).toMatchObject({
      ok: true,
      draft: {
        transferKey: current.transferKey,
        transfer: { status: "pending", sourceRevision: 0, startedAt: T1 },
      },
    });
    expect(JSON.stringify(updated)).not.toMatch(/memorialId|mediaId/);
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
    expect(first).toMatchObject({ language: "fr", skinVariant: "dark" });
    expect(retry.photos.map((entry) => entry.localPhotoId)).toEqual(["hero-local", "gallery-local"]);
    expect(first.photos[0]).toMatchObject({ purpose: "hero", crop: { focalX: 0.35, focalY: 0.6, zoom: 1.4 }, caption: null });
    expect(first.photos[1]).toMatchObject({ purpose: "gallery", crop: null, caption: "Son jardin" });
  });

  it("migrates V1 to V2 without inventing choices or changing stable data", async () => {
    const legacy = legacyDraft();
    const migrated = migrateGuestDraftV1ToV2(legacy);
    expect(migrated).toMatchObject({
      ok: true,
      draft: {
        schemaVersion: 2,
        draftId: legacy.draftId,
        transferKey: legacy.transferKey,
        revision: legacy.revision,
        createdAt: legacy.createdAt,
        updatedAt: legacy.updatedAt,
        language: null,
        skinVariant: null,
        transfer: { status: "not_started" },
        content: legacy.content,
        photos: [
          { localId: "hero-local", placement: { purpose: "hero", crop: { focalX: 0.35, focalY: 0.6, zoom: 1.4 } } },
          { localId: "gallery-local", placement: { purpose: "gallery", caption: "Son jardin" } },
        ],
      },
    });
    if (!migrated.ok) throw new Error(migrated.reason);
    await expect(migrated.draft.photos[0].source.blob.arrayBuffer()).resolves.toEqual(
      await legacy.photos[0].source.blob.arrayBuffer(),
    );
  });
});

describe("guest draft persistence contract", () => {
  it("saves and faithfully reads a complete local draft", async () => {
    const store = new GuestDraftStore(new MemoryDriver());
    const value = draft();
    await expect(store.save(value, null)).resolves.toEqual({ ok: true });
    await expect(store.read()).resolves.toEqual({ status: "ready", draft: value });
  });

  it("resumes from the same durable store through a new application session", async () => {
    const driver = new MemoryDriver();
    await new GuestDraftStore(driver).save(draft(), null);
    const nextBrowserSession = new GuestDraftStore(driver);
    await expect(nextBrowserSession.read()).resolves.toMatchObject({
      status: "ready",
      draft: { draftId: "guest-draft-1", photos: [{ localId: "hero-local" }, { localId: "gallery-local" }] },
    });
  });

  it("discovers the V1 key, durably writes V2, and retains V1", async () => {
    const database = memoryDatabase();
    const legacy = legacyDraft();
    database.legacy = structuredClone(legacy);

    await expect(new GuestDraftStore(new MemoryDriver(database)).read()).resolves.toMatchObject({
      status: "ready",
      draft: {
        schemaVersion: 2,
        draftId: legacy.draftId,
        transferKey: legacy.transferKey,
        language: null,
        skinVariant: null,
      },
    });
    expect(database.legacy).toEqual(legacy);
    expect(database.current).toMatchObject({ schemaVersion: 2, draftId: legacy.draftId });
  });

  it("keeps V1 intact and reports an explicit migration failure", async () => {
    const database = memoryDatabase();
    const legacy = legacyDraft();
    database.legacy = structuredClone(legacy);
    const driver = new MemoryDriver(database);
    driver.failNext = new GuestDraftStorageError("quota_exceeded", "quota");

    await expect(new GuestDraftStore(driver).read()).resolves.toMatchObject({
      status: "migration_failed",
      error: { code: "quota_exceeded" },
    });
    expect(database.legacy).toEqual(legacy);
    expect(database.current).toBeNull();
  });

  it("never replaces an incompatible or corrupted current record with V1", async () => {
    const database = memoryDatabase();
    database.legacy = legacyDraft();
    database.current = { ...draft(), schemaVersion: 99 };
    const store = new GuestDraftStore(new MemoryDriver(database));

    await expect(store.read()).resolves.toEqual({ status: "incompatible", foundVersion: 99 });
    expect(database.current).toMatchObject({ schemaVersion: 99 });
    expect(database.legacy).toMatchObject({ schemaVersion: 1 });

    database.current = { ...draft(), photos: "broken" };
    await expect(store.read()).resolves.toEqual({ status: "corrupted", reason: "invalid_photo" });
    expect(database.current).toMatchObject({ photos: "broken" });
  });

  it("refuses a stale revision atomically between two simulated tabs", async () => {
    const database = memoryDatabase();
    const tabA = new GuestDraftStore(new MemoryDriver(database));
    const tabB = new GuestDraftStore(new MemoryDriver(database));
    const initial = draft();
    await expect(tabA.save(initial, null)).resolves.toEqual({ ok: true });

    const readA = await tabA.read();
    const readB = await tabB.read();
    if (readA.status !== "ready" || readB.status !== "ready") throw new Error("draft not ready");
    const updateA = updateGuestDraft(readA.draft, { now: T1, language: "es" });
    const updateB = updateGuestDraft(readB.draft, { now: T1, skinVariant: "light" });
    if (!updateA.ok || !updateB.ok) throw new Error("update invalid");

    await expect(tabA.save(updateA.draft, readA.draft.revision)).resolves.toEqual({ ok: true });
    await expect(tabB.save(updateB.draft, readB.draft.revision)).resolves.toEqual({
      ok: false,
      reason: "revision_conflict",
    });
    await expect(tabB.read()).resolves.toMatchObject({
      status: "ready",
      draft: { revision: 1, language: "es", skinVariant: "dark" },
    });
  });

  it("replaces one active record on repeated writes without duplicating photographs", async () => {
    const driver = new MemoryDriver();
    const store = new GuestDraftStore(driver);
    const value = draft();
    await store.save(value, null);
    const updated = updateGuestDraft(value, { now: T1, language: "es" });
    if (!updated.ok) throw new Error(updated.reason);
    await store.save(updated.draft, value.revision);
    expect(driver.database.writes).toBe(2);
    await expect(store.read()).resolves.toMatchObject({
      status: "ready",
      draft: { photos: [{ localId: "hero-local" }, { localId: "gallery-local" }] },
    });
  });

  it("keeps the previous valid draft when a quota failure aborts the replacement", async () => {
    const driver = new MemoryDriver();
    const store = new GuestDraftStore(driver);
    const previous = draft();
    await store.save(previous, null);
    const changed = updateGuestDraft(previous, { now: T1, content: { hero: { displayName: "Changed", photo: null } } as never });
    if (!changed.ok) throw new Error(changed.reason);

    driver.failNext = new GuestDraftStorageError("quota_exceeded", "quota");
    await expect(store.save(changed.draft, previous.revision)).resolves.toEqual({ ok: false, reason: "quota_exceeded" });
    await expect(store.read()).resolves.toEqual({ status: "ready", draft: previous });
  });

  it("keeps the previous valid draft when a transaction is interrupted", async () => {
    const driver = new MemoryDriver();
    const store = new GuestDraftStore(driver);
    const previous = draft();
    await store.save(previous, null);
    const changed = updateGuestDraft(previous, { now: T1, language: "es" });
    if (!changed.ok) throw new Error(changed.reason);

    driver.failNext = new GuestDraftStorageError("transaction_failed", "interrupted");
    await expect(store.save(changed.draft, previous.revision)).resolves.toEqual({
      ok: false,
      reason: "transaction_failed",
    });
    await expect(store.read()).resolves.toEqual({ status: "ready", draft: previous });
  });

  it("reports incompatible and corrupted stored data without erasing it", async () => {
    const driver = new MemoryDriver();
    const store = new GuestDraftStore(driver);
    driver.database.current = { ...draft(), schemaVersion: 99 };
    await expect(store.read()).resolves.toEqual({ status: "incompatible", foundVersion: 99 });
    expect(driver.database.current).not.toBeNull();

    driver.database.current = { ...draft(), photos: "broken" };
    await expect(store.read()).resolves.toEqual({ status: "corrupted", reason: "invalid_photo" });
    expect(driver.database.current).not.toBeNull();
  });

  it("reports a newer physical IndexedDB schema as incompatible", async () => {
    const driver = new MemoryDriver();
    driver.readCurrent = async () => {
      throw new DOMException("newer", "VersionError");
    };
    await expect(new GuestDraftStore(driver).read()).resolves.toEqual({ status: "incompatible", foundVersion: null });
  });

  it("clears data only through the explicit operation", async () => {
    const store = new GuestDraftStore(new MemoryDriver());
    await store.save(draft(), null);
    await expect(store.clear()).resolves.toEqual({ ok: true });
    await expect(store.read()).resolves.toEqual({ status: "empty" });
  });

  it("fails safely when IndexedDB is unavailable", async () => {
    const store = createIndexedDbGuestDraftStore(undefined);
    await expect(store.read()).resolves.toMatchObject({ status: "error", error: { code: "unavailable" } });
    await expect(store.save(draft(), null)).resolves.toEqual({ ok: false, reason: "unavailable" });
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
