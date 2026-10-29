import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createGuestDraft, type GuestDraftPhoto, type GuestDraftV2 } from "./guest-draft";
import {
  createGuestDraftV3,
  prepareGuestDraftTransferV3,
  updateGuestDraftV3,
  type GuestDraftPhotoAsset,
  type GuestDraftV3,
  type PreparedGuestDraftPhotoInput,
} from "./guest-draft-v3";
import {
  createIndexedDbGuestDraftV3Store,
  GuestDraftV3StorageError,
  GuestDraftV3Store,
  type GuestDraftMigrationSource,
  type GuestDraftV3DriverWriteResult,
  type GuestDraftV3StorageDriver,
} from "./guest-draft-v3-store";

const T0 = "2026-10-26T10:00:00.000Z";
const T1 = "2026-10-26T10:01:00.000Z";
const T2 = "2026-10-26T10:02:00.000Z";

function blob(bytes: number[] = [0xff, 0xd8, 0xff, 0xd9]): Blob {
  return new Blob([new Uint8Array(bytes)], { type: "image/jpeg" });
}

function prepared(localId: string, purpose: "hero" | "gallery" = "gallery"): PreparedGuestDraftPhotoInput {
  return {
    localId,
    blob: blob(),
    mimeType: "image/jpeg",
    width: purpose === "hero" ? 1800 : 1200,
    height: purpose === "hero" ? 2400 : 900,
    originalFilename: `${localId}.jpg`,
    lastModified: 1_760_000_000_000,
    placement: purpose === "hero"
      ? { purpose: "hero", crop: { focalX: 0.4, focalY: 0.6, zoom: 1.2 } }
      : { purpose: "gallery", caption: "Son jardin" },
  };
}

function v3Draft(): GuestDraftV3 {
  const created = createGuestDraftV3({
    draftId: "guest-v3",
    transferKey: "transfer-v3",
    now: T0,
    language: "fr",
    skinVariant: "dark",
    content: { hero: { displayName: "Jeanne", birth: null, death: null, shortPhrase: null, photo: null } } as never,
  });
  if (!created.ok) throw new Error(created.reason);
  return created.draft;
}

function inlinePhoto(localId: string, purpose: "hero" | "gallery"): GuestDraftPhoto {
  return {
    localId,
    source: {
      blob: blob(purpose === "hero" ? [1, 2, 3] : [4, 5, 6, 7]),
      mimeType: "image/jpeg",
      originalFilename: `${localId}.jpg`,
      lastModified: 1_760_000_000_000,
    },
    placement: purpose === "hero"
      ? { purpose: "hero", crop: { focalX: 0.3, focalY: 0.7, zoom: 1.4 } }
      : { purpose: "gallery", caption: "Le jardin" },
  };
}

function v2Draft(): GuestDraftV2 {
  const created = createGuestDraft({
    draftId: "guest-v2",
    transferKey: "transfer-v2",
    now: T0,
    language: "es",
    skinVariant: "light",
    content: { hero: { displayName: "Ana", birth: null, death: null, shortPhrase: "Siempre", photo: null } } as never,
    photos: [inlinePhoto("hero-old", "hero"), inlinePhoto("gallery-old", "gallery")],
  });
  if (!created.ok) throw new Error(created.reason);
  return created.draft;
}

interface MemoryDatabase {
  current: unknown | null;
  previous: unknown | null;
  legacy: unknown | null;
  assets: Map<string, unknown>;
  assetWrites: number;
}

function memoryDatabase(): MemoryDatabase {
  return { current: null, previous: null, legacy: null, assets: new Map(), assetWrites: 0 };
}

class MemoryDriver implements GuestDraftV3StorageDriver {
  failNext: GuestDraftV3StorageError | null = null;

  constructor(readonly database = memoryDatabase()) {}

  private failIfRequested() {
    if (this.failNext === null) return;
    const error = this.failNext;
    this.failNext = null;
    throw error;
  }

  async readCurrent() { return this.database.current === null ? null : structuredClone(this.database.current); }
  async readPrevious() { return this.database.previous === null ? null : structuredClone(this.database.previous); }
  async readLegacy() { return this.database.legacy === null ? null : structuredClone(this.database.legacy); }
  async readAssets(localIds: readonly string[]) {
    return localIds.flatMap((id) => this.database.assets.has(id) ? [structuredClone(this.database.assets.get(id))] : []);
  }
  async readAsset(localId: string) {
    return this.database.assets.has(localId) ? structuredClone(this.database.assets.get(localId)) : null;
  }

  async create(draft: GuestDraftV3): Promise<GuestDraftV3DriverWriteResult> {
    this.failIfRequested();
    if (this.database.current !== null || this.database.previous !== null || this.database.legacy !== null) return "conflict";
    if (draft.photos.some(({ localId }) => !this.database.assets.has(localId))) return "missing_asset";
    this.database.current = structuredClone(draft);
    return "saved";
  }

  async replace(draft: GuestDraftV3, expectedRevision: number): Promise<GuestDraftV3DriverWriteResult> {
    this.failIfRequested();
    const current = this.database.current as { revision?: unknown } | null;
    if (current?.revision !== expectedRevision) return "conflict";
    if (draft.photos.some(({ localId }) => !this.database.assets.has(localId))) return "missing_asset";
    this.database.current = structuredClone(draft);
    return "saved";
  }

  async writePhoto(draft: GuestDraftV3, asset: GuestDraftPhotoAsset, expectedRevision: number): Promise<GuestDraftV3DriverWriteResult> {
    this.failIfRequested();
    const current = this.database.current as { revision?: unknown } | null;
    if (current?.revision !== expectedRevision || this.database.assets.has(asset.localId)) return "conflict";
    this.database.assets.set(asset.localId, structuredClone(asset));
    this.database.current = structuredClone(draft);
    this.database.assetWrites += 1;
    return "saved";
  }

  async migrate(migration: { draft: GuestDraftV3; assets: GuestDraftPhotoAsset[] }, source: GuestDraftMigrationSource): Promise<GuestDraftV3DriverWriteResult> {
    this.failIfRequested();
    const raw = source.schemaVersion === 2 ? this.database.previous : this.database.legacy;
    const previous = raw as { revision?: unknown; schemaVersion?: unknown } | null;
    if (this.database.current !== null || previous?.revision !== source.revision || previous.schemaVersion !== source.schemaVersion) return "conflict";
    const nextAssets = new Map(this.database.assets);
    for (const asset of migration.assets) {
      if (nextAssets.has(asset.localId)) return "conflict";
      nextAssets.set(asset.localId, structuredClone(asset));
    }
    this.database.assets = nextAssets;
    this.database.current = structuredClone(migration.draft);
    this.database.assetWrites += migration.assets.length;
    return "saved";
  }

  async clear() {
    this.database.current = null;
    this.database.previous = null;
    this.database.legacy = null;
    this.database.assets.clear();
  }
}

describe("guest draft V3 media contract", () => {
  it("stores validated prepared-media metadata without a server identifier", async () => {
    const driver = new MemoryDriver();
    const store = new GuestDraftV3Store(driver);
    const initial = v3Draft();
    await expect(store.save(initial, null)).resolves.toEqual({ ok: true });
    const added = await store.addPhoto(prepared("hero-local", "hero"), 0, T1);
    expect(added).toMatchObject({
      ok: true,
      draft: { schemaVersion: 3, revision: 1, photos: [{ localId: "hero-local", placement: { purpose: "hero" } }] },
    });
    const stored = await store.readPhoto("hero-local");
    expect(stored).toMatchObject({
      ok: true,
      asset: {
        localId: "hero-local",
        source: {
          blobRole: "prepared_high_quality",
          mimeType: "image/jpeg",
          sizeBytes: 4,
          dimensions: { status: "known", width: 1800, height: 2400 },
        },
      },
    });
    expect(JSON.stringify(driver.database.current)).not.toMatch(/mediaId|memorialId|blob/);
  });

  it("resumes the separated draft and Blob after recreating the store", async () => {
    const database = memoryDatabase();
    const firstSession = new GuestDraftV3Store(new MemoryDriver(database));
    await firstSession.save(v3Draft(), null);
    await expect(firstSession.addPhoto(prepared("reload-photo"), 0, T1)).resolves.toMatchObject({ ok: true });

    const nextSession = new GuestDraftV3Store(new MemoryDriver(database));
    await expect(nextSession.read()).resolves.toMatchObject({
      status: "ready",
      draft: { revision: 1, photos: [{ localId: "reload-photo" }] },
    });
    await expect(nextSession.readPhoto("reload-photo")).resolves.toMatchObject({
      ok: true,
      asset: { localId: "reload-photo", source: { dimensions: { status: "known" } } },
    });
  });

  it("does not rewrite a Blob for a text, language or crop-reference metadata save", async () => {
    const driver = new MemoryDriver();
    const store = new GuestDraftV3Store(driver);
    await store.save(v3Draft(), null);
    const added = await store.addPhoto(prepared("hero-local", "hero"), 0, T1);
    if (!added.ok) throw new Error(added.reason);
    const text = updateGuestDraftV3(added.draft, { now: T2, language: "en", content: { note: { text: "Remembered" } } as never });
    if (!text.ok) throw new Error(text.reason);
    await expect(store.save(text.draft, added.draft.revision)).resolves.toEqual({ ok: true });
    expect(driver.database.assetWrites).toBe(1);
    await expect(store.readPhoto("hero-local")).resolves.toMatchObject({ ok: true, asset: { localId: "hero-local" } });
  });

  it("updates a Hero crop with CAS without rewriting its Blob", async () => {
    const driver = new MemoryDriver();
    const store = new GuestDraftV3Store(driver);
    await store.save(v3Draft(), null);
    await store.addPhoto(prepared("hero-local", "hero"), 0, T1);
    const writes = driver.database.assetWrites;
    const crop = { focalX: 0.25, focalY: 0.75, zoom: 1.5 };
    await expect(store.updatePhotoPlacement("hero-local", { purpose: "hero", crop }, 1, T2)).resolves.toMatchObject({
      ok: true,
      draft: { revision: 2, photos: [{ localId: "hero-local", placement: { purpose: "hero", crop } }] },
    });
    expect(driver.database.assetWrites).toBe(writes);
    await expect(store.updatePhotoPlacement("hero-local", { purpose: "hero", crop }, 1, T2)).resolves.toEqual({
      ok: false,
      reason: "revision_conflict",
    });
  });

  it("refuses a metadata save that would introduce a dangling photo reference", async () => {
    const driver = new MemoryDriver();
    const store = new GuestDraftV3Store(driver);
    const initial = v3Draft();
    await store.save(initial, null);
    const dangling = updateGuestDraftV3(initial, {
      now: T1,
      photos: [{ localId: "missing", placement: { purpose: "gallery", caption: null } }],
    });
    if (!dangling.ok) throw new Error(dangling.reason);
    await expect(store.save(dangling.draft, 0)).resolves.toEqual({ ok: false, reason: "missing_photo_asset" });
    await expect(store.read()).resolves.toEqual({ status: "ready", draft: initial });
  });

  it("migrates V2 to V3 losslessly, keeps V2, and never invents dimensions or Blob provenance", async () => {
    const driver = new MemoryDriver();
    const previous = v2Draft();
    driver.database.previous = structuredClone(previous);
    const store = new GuestDraftV3Store(driver);

    const result = await store.read();
    expect(result).toMatchObject({
      status: "ready",
      draft: {
        schemaVersion: 3,
        draftId: previous.draftId,
        transferKey: previous.transferKey,
        revision: previous.revision,
        language: "es",
        skinVariant: "light",
        content: previous.content,
        photos: [
          { localId: "hero-old", placement: { purpose: "hero", crop: { focalX: 0.3, focalY: 0.7, zoom: 1.4 } } },
          { localId: "gallery-old", placement: { purpose: "gallery", caption: "Le jardin" } },
        ],
      },
    });
    expect(driver.database.previous).toEqual(previous);
    const hero = await store.readPhoto("hero-old");
    expect(hero).toMatchObject({
      ok: true,
      asset: {
        source: {
          blobRole: "legacy_unspecified",
          sizeBytes: 3,
          dimensions: { status: "unknown", reason: "legacy_unmeasured" },
          originalFilename: "hero-old.jpg",
        },
      },
    });
    if (!hero.ok) throw new Error(hero.reason);
    await expect(hero.asset.blob.arrayBuffer()).resolves.toEqual(await previous.photos[0].source.blob.arrayBuffer());
  });

  it("keeps V2 and all prior state intact when migration fails", async () => {
    const driver = new MemoryDriver();
    const previous = v2Draft();
    driver.database.previous = structuredClone(previous);
    driver.failNext = new GuestDraftV3StorageError("quota_exceeded", "quota");
    await expect(new GuestDraftV3Store(driver).read()).resolves.toMatchObject({
      status: "migration_failed",
      error: { code: "quota_exceeded" },
    });
    expect(driver.database.previous).toEqual(previous);
    expect(driver.database.current).toBeNull();
    expect(driver.database.assets.size).toBe(0);
  });

  it("adds Blob and reference atomically, preserving the last valid draft on quota or transaction failure", async () => {
    for (const code of ["quota_exceeded", "transaction_failed"] as const) {
      const driver = new MemoryDriver();
      const store = new GuestDraftV3Store(driver);
      const initial = v3Draft();
      await store.save(initial, null);
      driver.failNext = new GuestDraftV3StorageError(code, code);
      await expect(store.addPhoto(prepared(`failed-${code}`), 0, T1)).resolves.toEqual({ ok: false, reason: code });
      await expect(store.read()).resolves.toEqual({ status: "ready", draft: initial });
      expect(driver.database.assets.size).toBe(0);
    }
  });

  it("replaces the selected reference atomically while retaining the previous asset", async () => {
    const driver = new MemoryDriver();
    const store = new GuestDraftV3Store(driver);
    await store.save(v3Draft(), null);
    const first = await store.addPhoto(prepared("gallery-old"), 0, T1);
    if (!first.ok) throw new Error(first.reason);
    const replacement = prepared("gallery-new");
    const replaced = await store.replacePhoto("gallery-old", {
      localId: replacement.localId,
      blob: replacement.blob,
      mimeType: replacement.mimeType,
      width: replacement.width,
      height: replacement.height,
      originalFilename: replacement.originalFilename,
      lastModified: replacement.lastModified,
    }, 1, T2);
    expect(replaced).toMatchObject({
      ok: true,
      draft: { revision: 2, photos: [{ localId: "gallery-new", placement: { purpose: "gallery", caption: "Son jardin" } }] },
    });
    await expect(store.readPhoto("gallery-old")).resolves.toMatchObject({ ok: true, asset: { localId: "gallery-old" } });
    await expect(store.readPhoto("gallery-new")).resolves.toMatchObject({ ok: true, asset: { localId: "gallery-new" } });
  });

  it("removes a reference without deleting the file and preserves the remaining order", async () => {
    const driver = new MemoryDriver();
    const store = new GuestDraftV3Store(driver);
    await store.save(v3Draft(), null);
    const one = await store.addPhoto(prepared("one"), 0, T1);
    if (!one.ok) throw new Error(one.reason);
    const two = await store.addPhoto({ ...prepared("two"), placement: { purpose: "gallery", caption: "Deux" } }, 1, T1);
    if (!two.ok) throw new Error(two.reason);
    const three = await store.addPhoto({ ...prepared("three"), placement: { purpose: "gallery", caption: "Trois" } }, 2, T1);
    if (!three.ok) throw new Error(three.reason);

    const removed = await store.removePhoto("two", 3, T2);
    expect(removed).toMatchObject({ ok: true, draft: { photos: [{ localId: "one" }, { localId: "three" }] } });
    await expect(store.readPhoto("two")).resolves.toMatchObject({ ok: true, asset: { localId: "two" } });
  });

  it("blocks a stale tab and leaves the winning photo and revision intact", async () => {
    const database = memoryDatabase();
    const tabA = new GuestDraftV3Store(new MemoryDriver(database));
    const tabB = new GuestDraftV3Store(new MemoryDriver(database));
    await tabA.save(v3Draft(), null);
    await expect(tabA.addPhoto(prepared("winner"), 0, T1)).resolves.toMatchObject({ ok: true, draft: { revision: 1 } });
    await expect(tabB.addPhoto(prepared("stale"), 0, T1)).resolves.toEqual({ ok: false, reason: "revision_conflict" });
    await expect(tabB.read()).resolves.toMatchObject({ status: "ready", draft: { revision: 1, photos: [{ localId: "winner" }] } });
    expect(database.assets.has("stale")).toBe(false);
  });

  it("reconstructs a stable future transfer bundle from metadata and separate assets", async () => {
    const driver = new MemoryDriver();
    const store = new GuestDraftV3Store(driver);
    await store.save(v3Draft(), null);
    const added = await store.addPhoto(prepared("transfer-photo", "hero"), 0, T1);
    if (!added.ok) throw new Error(added.reason);
    const photo = await store.readPhoto("transfer-photo");
    if (!photo.ok) throw new Error(photo.reason);
    const first = prepareGuestDraftTransferV3(added.draft, [photo.asset]);
    const retry = prepareGuestDraftTransferV3(added.draft, [photo.asset]);
    expect(retry.idempotencyKey).toBe(first.idempotencyKey);
    expect(first.photos[0]).toMatchObject({
      localPhotoId: "transfer-photo",
      blobRole: "prepared_high_quality",
      dimensions: { status: "known", width: 1800, height: 2400 },
      purpose: "hero",
    });
  });

  it("fails safely when IndexedDB is unavailable", async () => {
    const store = createIndexedDbGuestDraftV3Store(undefined);
    await expect(store.read()).resolves.toMatchObject({ status: "error", error: { code: "unavailable" } });
    await expect(store.save(v3Draft(), null)).resolves.toEqual({ ok: false, reason: "unavailable" });
  });
});

describe("V3 isolation boundaries", () => {
  it("contains no network, Supabase, persistent-storage prompt, route or server integration", () => {
    const domain = readFileSync(new URL("./guest-draft-v3.ts", import.meta.url), "utf8");
    const storage = readFileSync(new URL("./guest-draft-v3-store.ts", import.meta.url), "utf8");
    const implementation = `${domain}\n${storage}`;
    expect(implementation).not.toMatch(/@supabase|lib\/supabase|fetch\s*\(|XMLHttpRequest|WebSocket/);
    expect(implementation).not.toMatch(/navigator\.storage\.persist|mediaId|memorialId|app\/builder|server action/i);
  });
});
