import {
  validateGuestDraft,
  validateGuestDraftV1,
  type GuestDraftV1,
  type GuestDraftV2,
} from "./guest-draft";
import {
  createPreparedGuestDraftPhoto,
  migrateGuestDraftV1ToV3,
  migrateGuestDraftV2ToV3,
  updateGuestDraftV3,
  validateGuestDraftPhotoAsset,
  validateGuestDraftV3,
  type GuestDraftPhotoAsset,
  type GuestDraftV3,
  type GuestDraftV3Migration,
  type GuestDraftV3ValidationReason,
  type PreparedGuestDraftPhotoInput,
} from "./guest-draft-v3";

export type GuestDraftV3StorageErrorCode =
  | "quota_exceeded"
  | "unavailable"
  | "blocked"
  | "incompatible_database"
  | "transaction_failed";

export class GuestDraftV3StorageError extends Error {
  constructor(
    readonly code: GuestDraftV3StorageErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "GuestDraftV3StorageError";
  }
}

export type GuestDraftV3DriverWriteResult = "saved" | "conflict" | "missing_asset";
export type GuestDraftMigrationSource = { schemaVersion: 1 | 2; revision: number };

export interface GuestDraftV3StorageDriver {
  readCurrent(): Promise<unknown | null>;
  readPrevious(): Promise<unknown | null>;
  readLegacy(): Promise<unknown | null>;
  readAssets(localIds: readonly string[]): Promise<unknown[]>;
  readAsset(localId: string): Promise<unknown | null>;
  create(draft: GuestDraftV3): Promise<GuestDraftV3DriverWriteResult>;
  replace(draft: GuestDraftV3, expectedRevision: number): Promise<GuestDraftV3DriverWriteResult>;
  writePhoto(draft: GuestDraftV3, asset: GuestDraftPhotoAsset, expectedRevision: number): Promise<GuestDraftV3DriverWriteResult>;
  migrate(migration: GuestDraftV3Migration, source: GuestDraftMigrationSource): Promise<GuestDraftV3DriverWriteResult>;
  clear(): Promise<void>;
}

export type GuestDraftV3ReadResult =
  | { status: "empty" }
  | { status: "ready"; draft: GuestDraftV3 }
  | { status: "incompatible"; foundVersion: number | null }
  | { status: "corrupted"; reason: Exclude<GuestDraftV3ValidationReason, "unknown_schema_version"> }
  | { status: "migration_failed"; error: GuestDraftV3StorageError }
  | { status: "error"; error: GuestDraftV3StorageError };

export type GuestDraftV3WriteResult =
  | { ok: true }
  | { ok: false; reason: GuestDraftV3ValidationReason | GuestDraftV3StorageErrorCode | "revision_conflict" };

export type GuestDraftV3PhotoWriteResult =
  | { ok: true; draft: GuestDraftV3 }
  | { ok: false; reason: GuestDraftV3ValidationReason | GuestDraftV3StorageErrorCode | "revision_conflict" | "photo_not_found" };

function storageError(error: unknown): GuestDraftV3StorageError {
  if (error instanceof GuestDraftV3StorageError) return error;
  if (error instanceof DOMException) {
    if (error.name === "QuotaExceededError") return new GuestDraftV3StorageError("quota_exceeded", "Browser storage quota was exceeded.", { cause: error });
    if (error.name === "InvalidStateError" || error.name === "SecurityError" || error.name === "NotSupportedError") {
      return new GuestDraftV3StorageError("unavailable", "Browser storage is unavailable.", { cause: error });
    }
    if (error.name === "VersionError") return new GuestDraftV3StorageError("incompatible_database", "The IndexedDB database was created by a newer schema.", { cause: error });
  }
  return new GuestDraftV3StorageError("transaction_failed", "The local draft transaction failed.", { cause: error });
}

function migrationFailure(error: GuestDraftV3StorageError): GuestDraftV3ReadResult {
  return { status: "migration_failed", error };
}

export class GuestDraftV3Store {
  constructor(private readonly driver: GuestDraftV3StorageDriver) {}

  async read(): Promise<GuestDraftV3ReadResult> {
    let current: unknown | null;
    try {
      current = await this.driver.readCurrent();
    } catch (error) {
      const mapped = storageError(error);
      return mapped.code === "incompatible_database"
        ? { status: "incompatible", foundVersion: null }
        : { status: "error", error: mapped };
    }
    if (current !== null) return this.parseCurrent(current);

    let previous: unknown | null;
    try {
      previous = await this.driver.readPrevious();
    } catch (error) {
      const mapped = storageError(error);
      return mapped.code === "incompatible_database"
        ? { status: "incompatible", foundVersion: null }
        : { status: "error", error: mapped };
    }
    if (previous !== null) {
      const checked = validateGuestDraft(previous);
      if (!checked.ok) {
        return checked.reason === "unknown_schema_version"
          ? { status: "incompatible", foundVersion: checked.foundVersion ?? null }
          : { status: "corrupted", reason: checked.reason };
      }
      const migration = migrateGuestDraftV2ToV3(checked.draft);
      if (!migration.ok) {
        return migration.reason === "unknown_schema_version"
          ? { status: "incompatible", foundVersion: 2 }
          : { status: "corrupted", reason: migration.reason };
      }
      return this.persistMigration(migration.migration, { schemaVersion: 2, revision: checked.draft.revision });
    }

    let legacy: unknown | null;
    try {
      legacy = await this.driver.readLegacy();
    } catch (error) {
      const mapped = storageError(error);
      return mapped.code === "incompatible_database"
        ? { status: "incompatible", foundVersion: null }
        : { status: "error", error: mapped };
    }
    if (legacy === null) return { status: "empty" };
    const checked = validateGuestDraftV1(legacy);
    if (!checked.ok) {
      return checked.reason === "unknown_schema_version"
        ? { status: "incompatible", foundVersion: checked.foundVersion ?? null }
        : { status: "corrupted", reason: checked.reason };
    }
    const migration = migrateGuestDraftV1ToV3(checked.draft);
    if (!migration.ok) {
      return migration.reason === "unknown_schema_version"
        ? { status: "incompatible", foundVersion: 1 }
        : { status: "corrupted", reason: migration.reason };
    }
    return this.persistMigration(migration.migration, { schemaVersion: 1, revision: checked.draft.revision });
  }

  private async persistMigration(migration: GuestDraftV3Migration, source: GuestDraftMigrationSource): Promise<GuestDraftV3ReadResult> {
    try {
      const outcome = await this.driver.migrate(structuredClone(migration), source);
      if (outcome === "saved") return { status: "ready", draft: structuredClone(migration.draft) };
      const migratedElsewhere = await this.driver.readCurrent();
      return migratedElsewhere === null
        ? migrationFailure(new GuestDraftV3StorageError("transaction_failed", "The previous draft changed during migration."))
        : this.parseCurrent(migratedElsewhere);
    } catch (error) {
      return migrationFailure(storageError(error));
    }
  }

  private async parseCurrent(raw: unknown): Promise<GuestDraftV3ReadResult> {
    const checked = validateGuestDraftV3(raw);
    if (!checked.ok) {
      return checked.reason === "unknown_schema_version"
        ? { status: "incompatible", foundVersion: checked.foundVersion ?? null }
        : { status: "corrupted", reason: checked.reason };
    }
    let assets: unknown[];
    try {
      assets = await this.driver.readAssets(checked.draft.photos.map(({ localId }) => localId));
    } catch (error) {
      return { status: "error", error: storageError(error) };
    }
    if (assets.length !== checked.draft.photos.length) return { status: "corrupted", reason: "missing_photo_asset" };
    const byId = new Map<string, GuestDraftPhotoAsset>();
    for (const asset of assets) {
      if (!validateGuestDraftPhotoAsset(asset)) return { status: "corrupted", reason: "invalid_photo_asset" };
      byId.set(asset.localId, asset);
    }
    if (checked.draft.photos.some(({ localId }) => !byId.has(localId))) return { status: "corrupted", reason: "missing_photo_asset" };
    return { status: "ready", draft: structuredClone(checked.draft) };
  }

  async save(draft: GuestDraftV3, expectedRevision: number | null): Promise<GuestDraftV3WriteResult> {
    const checked = validateGuestDraftV3(draft);
    if (!checked.ok) return { ok: false, reason: checked.reason };
    if (expectedRevision !== null && (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0)) return { ok: false, reason: "invalid_revision" };
    if ((expectedRevision === null && draft.revision !== 0) || (expectedRevision !== null && draft.revision !== expectedRevision + 1)) {
      return { ok: false, reason: "invalid_revision" };
    }
    try {
      const assets = await this.driver.readAssets(draft.photos.map(({ localId }) => localId));
      if (assets.length !== draft.photos.length || assets.some((asset) => !validateGuestDraftPhotoAsset(asset))) {
        return { ok: false, reason: "missing_photo_asset" };
      }
      const assetIds = new Set((assets as GuestDraftPhotoAsset[]).map(({ localId }) => localId));
      if (draft.photos.some(({ localId }) => !assetIds.has(localId))) return { ok: false, reason: "missing_photo_asset" };
      const outcome = expectedRevision === null
        ? await this.driver.create(structuredClone(draft))
        : await this.driver.replace(structuredClone(draft), expectedRevision);
      if (outcome === "saved") return { ok: true };
      return { ok: false, reason: outcome === "missing_asset" ? "missing_photo_asset" : "revision_conflict" };
    } catch (error) {
      return { ok: false, reason: storageError(error).code };
    }
  }

  async readPhoto(localId: string): Promise<{ ok: true; asset: GuestDraftPhotoAsset } | { ok: false; reason: GuestDraftV3StorageErrorCode | "photo_not_found" | "invalid_photo_asset" }> {
    try {
      const raw = await this.driver.readAsset(localId);
      if (raw === null) return { ok: false, reason: "photo_not_found" };
      if (!validateGuestDraftPhotoAsset(raw)) return { ok: false, reason: "invalid_photo_asset" };
      return { ok: true, asset: structuredClone(raw) };
    } catch (error) {
      return { ok: false, reason: storageError(error).code };
    }
  }

  async addPhoto(input: PreparedGuestDraftPhotoInput, expectedRevision: number, now: string): Promise<GuestDraftV3PhotoWriteResult> {
    const current = await this.readCurrentForMutation(expectedRevision);
    if (!current.ok) return current;
    const prepared = createPreparedGuestDraftPhoto(input);
    if (!prepared.ok) return prepared;
    const updated = updateGuestDraftV3(current.draft, { now, photos: [...current.draft.photos, prepared.reference] });
    if (!updated.ok) return updated;
    return this.persistPhoto(updated.draft, prepared.asset, expectedRevision);
  }

  async replacePhoto(
    replacedLocalId: string,
    input: Omit<PreparedGuestDraftPhotoInput, "placement">,
    expectedRevision: number,
    now: string,
  ): Promise<GuestDraftV3PhotoWriteResult> {
    const current = await this.readCurrentForMutation(expectedRevision);
    if (!current.ok) return current;
    const replaced = current.draft.photos.find(({ localId }) => localId === replacedLocalId);
    if (replaced === undefined) return { ok: false, reason: "photo_not_found" };
    const prepared = createPreparedGuestDraftPhoto({ ...input, placement: replaced.placement });
    if (!prepared.ok) return prepared;
    const updated = updateGuestDraftV3(current.draft, {
      now,
      photos: current.draft.photos.map((photo) => photo.localId === replacedLocalId ? prepared.reference : photo),
    });
    if (!updated.ok) return updated;
    return this.persistPhoto(updated.draft, prepared.asset, expectedRevision);
  }

  async removePhoto(localId: string, expectedRevision: number, now: string): Promise<GuestDraftV3PhotoWriteResult> {
    const current = await this.readCurrentForMutation(expectedRevision);
    if (!current.ok) return current;
    if (!current.draft.photos.some((photo) => photo.localId === localId)) return { ok: false, reason: "photo_not_found" };
    const updated = updateGuestDraftV3(current.draft, {
      now,
      photos: current.draft.photos.filter((photo) => photo.localId !== localId),
    });
    if (!updated.ok) return updated;
    try {
      const outcome = await this.driver.replace(structuredClone(updated.draft), expectedRevision);
      if (outcome === "saved") return { ok: true, draft: updated.draft };
      return { ok: false, reason: outcome === "missing_asset" ? "missing_photo_asset" : "revision_conflict" };
    } catch (error) {
      return { ok: false, reason: storageError(error).code };
    }
  }

  private async readCurrentForMutation(expectedRevision: number): Promise<{ ok: true; draft: GuestDraftV3 } | { ok: false; reason: "revision_conflict" | GuestDraftV3StorageErrorCode | GuestDraftV3ValidationReason }> {
    let raw: unknown | null;
    try {
      raw = await this.driver.readCurrent();
    } catch (error) {
      return { ok: false, reason: storageError(error).code };
    }
    if (raw === null) return { ok: false, reason: "revision_conflict" };
    const checked = validateGuestDraftV3(raw);
    if (!checked.ok) return { ok: false, reason: checked.reason };
    return checked.draft.revision === expectedRevision
      ? { ok: true, draft: checked.draft }
      : { ok: false, reason: "revision_conflict" };
  }

  private async persistPhoto(draft: GuestDraftV3, asset: GuestDraftPhotoAsset, expectedRevision: number): Promise<GuestDraftV3PhotoWriteResult> {
    try {
      const outcome = await this.driver.writePhoto(structuredClone(draft), structuredClone(asset), expectedRevision);
      return outcome === "saved" ? { ok: true, draft } : { ok: false, reason: "revision_conflict" };
    } catch (error) {
      return { ok: false, reason: storageError(error).code };
    }
  }

  async clear(): Promise<{ ok: true } | { ok: false; reason: GuestDraftV3StorageErrorCode }> {
    try {
      await this.driver.clear();
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: storageError(error).code };
    }
  }
}

const DATABASE_NAME = "heritage-guest-draft";
const DATABASE_VERSION = 2;
const DRAFT_STORE_NAME = "drafts";
const ASSET_STORE_NAME = "photo-assets";
const ACTIVE_DRAFT_KEY = "v3:active";
const PREVIOUS_ACTIVE_DRAFT_KEY = "v2:active";
const LEGACY_ACTIVE_DRAFT_KEY = "v1:active";

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(request.error ?? new Error("IndexedDB request failed.")), { once: true });
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve(), { once: true });
    transaction.addEventListener("abort", () => reject(transaction.error ?? new Error("IndexedDB transaction aborted.")), { once: true });
    transaction.addEventListener("error", () => reject(transaction.error ?? new Error("IndexedDB transaction failed.")), { once: true });
  });
}

class IndexedDbGuestDraftV3Driver implements GuestDraftV3StorageDriver {
  constructor(private readonly factory: IDBFactory) {}

  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = this.factory.open(DATABASE_NAME, DATABASE_VERSION);
      let settled = false;
      request.addEventListener("upgradeneeded", () => {
        if (!request.result.objectStoreNames.contains(DRAFT_STORE_NAME)) request.result.createObjectStore(DRAFT_STORE_NAME);
        if (!request.result.objectStoreNames.contains(ASSET_STORE_NAME)) request.result.createObjectStore(ASSET_STORE_NAME);
      });
      request.addEventListener("blocked", () => {
        settled = true;
        reject(new GuestDraftV3StorageError("blocked", "IndexedDB upgrade is blocked by another tab."));
      }, { once: true });
      request.addEventListener("error", () => {
        if (!settled) reject(request.error ?? new Error("IndexedDB could not be opened."));
      }, { once: true });
      request.addEventListener("success", () => {
        if (settled) return request.result.close();
        request.result.addEventListener("versionchange", () => request.result.close());
        resolve(request.result);
      }, { once: true });
    });
  }

  private async readDraftKey(key: string): Promise<unknown | null> {
    const database = await this.open();
    try {
      const transaction = database.transaction(DRAFT_STORE_NAME, "readonly");
      const done = transactionDone(transaction);
      const value = await requestResult(transaction.objectStore(DRAFT_STORE_NAME).get(key));
      await done;
      return value === undefined ? null : value;
    } finally {
      database.close();
    }
  }

  readCurrent() { return this.readDraftKey(ACTIVE_DRAFT_KEY); }
  readPrevious() { return this.readDraftKey(PREVIOUS_ACTIVE_DRAFT_KEY); }
  readLegacy() { return this.readDraftKey(LEGACY_ACTIVE_DRAFT_KEY); }

  async readAssets(localIds: readonly string[]): Promise<unknown[]> {
    if (localIds.length === 0) return [];
    const database = await this.open();
    try {
      const transaction = database.transaction(ASSET_STORE_NAME, "readonly");
      const done = transactionDone(transaction);
      const store = transaction.objectStore(ASSET_STORE_NAME);
      const values = await Promise.all(localIds.map((localId) => requestResult(store.get(localId))));
      await done;
      return values.filter((value) => value !== undefined);
    } finally {
      database.close();
    }
  }

  async readAsset(localId: string): Promise<unknown | null> {
    const values = await this.readAssets([localId]);
    return values[0] ?? null;
  }

  async create(draft: GuestDraftV3): Promise<GuestDraftV3DriverWriteResult> {
    const database = await this.open();
    try {
      const transaction = database.transaction([DRAFT_STORE_NAME, ASSET_STORE_NAME], "readwrite");
      const done = transactionDone(transaction);
      try {
        const store = transaction.objectStore(DRAFT_STORE_NAME);
        const [current, previous, legacy] = await Promise.all([
          requestResult(store.get(ACTIVE_DRAFT_KEY)),
          requestResult(store.get(PREVIOUS_ACTIVE_DRAFT_KEY)),
          requestResult(store.get(LEGACY_ACTIVE_DRAFT_KEY)),
        ]);
        if (current !== undefined || previous !== undefined || legacy !== undefined) {
          await done;
          return "conflict";
        }
        const assets = transaction.objectStore(ASSET_STORE_NAME);
        const referenced = await Promise.all(draft.photos.map(({ localId }) => requestResult(assets.get(localId))));
        if (referenced.some((asset) => asset === undefined)) {
          await done;
          return "missing_asset";
        }
        await requestResult(store.put(draft, ACTIVE_DRAFT_KEY));
        await done;
        return "saved";
      } catch (error) {
        await done.catch(() => undefined);
        throw error;
      }
    } finally {
      database.close();
    }
  }

  async replace(draft: GuestDraftV3, expectedRevision: number): Promise<GuestDraftV3DriverWriteResult> {
    const database = await this.open();
    try {
      const transaction = database.transaction([DRAFT_STORE_NAME, ASSET_STORE_NAME], "readwrite");
      const done = transactionDone(transaction);
      try {
        const store = transaction.objectStore(DRAFT_STORE_NAME);
        const current = await requestResult(store.get(ACTIVE_DRAFT_KEY));
        if (!isExpectedRevision(current, expectedRevision)) {
          await done;
          return "conflict";
        }
        const assets = transaction.objectStore(ASSET_STORE_NAME);
        const referenced = await Promise.all(draft.photos.map(({ localId }) => requestResult(assets.get(localId))));
        if (referenced.some((asset) => asset === undefined)) {
          await done;
          return "missing_asset";
        }
        await requestResult(store.put(draft, ACTIVE_DRAFT_KEY));
        await done;
        return "saved";
      } catch (error) {
        await done.catch(() => undefined);
        throw error;
      }
    } finally {
      database.close();
    }
  }

  async writePhoto(draft: GuestDraftV3, asset: GuestDraftPhotoAsset, expectedRevision: number): Promise<GuestDraftV3DriverWriteResult> {
    const database = await this.open();
    try {
      const transaction = database.transaction([DRAFT_STORE_NAME, ASSET_STORE_NAME], "readwrite");
      const done = transactionDone(transaction);
      try {
        const drafts = transaction.objectStore(DRAFT_STORE_NAME);
        const current = await requestResult(drafts.get(ACTIVE_DRAFT_KEY));
        if (!isExpectedRevision(current, expectedRevision)) {
          await done;
          return "conflict";
        }
        const assets = transaction.objectStore(ASSET_STORE_NAME);
        if (await requestResult(assets.get(asset.localId)) !== undefined) {
          await done;
          return "conflict";
        }
        await requestResult(assets.add(asset, asset.localId));
        await requestResult(drafts.put(draft, ACTIVE_DRAFT_KEY));
        await done;
        return "saved";
      } catch (error) {
        await done.catch(() => undefined);
        throw error;
      }
    } finally {
      database.close();
    }
  }

  async migrate(migration: GuestDraftV3Migration, source: GuestDraftMigrationSource): Promise<GuestDraftV3DriverWriteResult> {
    const database = await this.open();
    try {
      const transaction = database.transaction([DRAFT_STORE_NAME, ASSET_STORE_NAME], "readwrite");
      const done = transactionDone(transaction);
      try {
        const drafts = transaction.objectStore(DRAFT_STORE_NAME);
        const sourceKey = source.schemaVersion === 2 ? PREVIOUS_ACTIVE_DRAFT_KEY : LEGACY_ACTIVE_DRAFT_KEY;
        const [current, previous] = await Promise.all([
          requestResult(drafts.get(ACTIVE_DRAFT_KEY)),
          requestResult(drafts.get(sourceKey)),
        ]);
        if (current !== undefined || !isExpectedRevision(previous, source.revision) || !isSchemaVersion(previous, source.schemaVersion)) {
          await done;
          return "conflict";
        }
        const assets = transaction.objectStore(ASSET_STORE_NAME);
        const existing = await Promise.all(migration.assets.map(({ localId }) => requestResult(assets.get(localId))));
        if (existing.some((asset) => asset !== undefined)) {
          await done;
          return "conflict";
        }
        for (const asset of migration.assets) await requestResult(assets.add(asset, asset.localId));
        await requestResult(drafts.put(migration.draft, ACTIVE_DRAFT_KEY));
        // The V1/V2 record remains intact until an explicit clear.
        await done;
        return "saved";
      } catch (error) {
        await done.catch(() => undefined);
        throw error;
      }
    } finally {
      database.close();
    }
  }

  async clear(): Promise<void> {
    const database = await this.open();
    try {
      const transaction = database.transaction([DRAFT_STORE_NAME, ASSET_STORE_NAME], "readwrite");
      const done = transactionDone(transaction);
      try {
        await requestResult(transaction.objectStore(DRAFT_STORE_NAME).clear());
        await requestResult(transaction.objectStore(ASSET_STORE_NAME).clear());
        await done;
      } catch (error) {
        await done.catch(() => undefined);
        throw error;
      }
    } finally {
      database.close();
    }
  }
}

function isExpectedRevision(value: unknown, revision: number): boolean {
  return typeof value === "object" && value !== null && "revision" in value && value.revision === revision;
}

function isSchemaVersion(value: unknown, schemaVersion: number): boolean {
  return typeof value === "object" && value !== null && "schemaVersion" in value && value.schemaVersion === schemaVersion;
}

export function createIndexedDbGuestDraftV3Store(
  factory: IDBFactory | undefined = typeof indexedDB === "undefined" ? undefined : indexedDB,
): GuestDraftV3Store {
  if (factory) return new GuestDraftV3Store(new IndexedDbGuestDraftV3Driver(factory));
  const unavailable = async (): Promise<never> => {
    throw new GuestDraftV3StorageError("unavailable", "IndexedDB is not available in this environment.");
  };
  return new GuestDraftV3Store({
    readCurrent: unavailable,
    readPrevious: unavailable,
    readLegacy: unavailable,
    readAssets: unavailable,
    readAsset: unavailable,
    create: unavailable,
    replace: unavailable,
    writePhoto: unavailable,
    migrate: unavailable,
    clear: unavailable,
  });
}

/** Type-only proof that V1/V2 remain accepted migration inputs. */
export type GuestDraftPreviousVersion = GuestDraftV1 | GuestDraftV2;
