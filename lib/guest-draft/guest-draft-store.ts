import {
  GUEST_DRAFT_SCHEMA_VERSION,
  LEGACY_GUEST_DRAFT_SCHEMA_VERSION,
  migrateGuestDraftV1ToV2,
  validateGuestDraft,
  validateGuestDraftV1,
  type GuestDraftV2,
  type GuestDraftValidationReason,
} from "./guest-draft";

export type GuestDraftStorageErrorCode =
  | "quota_exceeded"
  | "unavailable"
  | "blocked"
  | "incompatible_database"
  | "transaction_failed";

export class GuestDraftStorageError extends Error {
  constructor(
    readonly code: GuestDraftStorageErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "GuestDraftStorageError";
  }
}

export type GuestDraftDriverWriteResult = "saved" | "conflict";

/**
 * Minimal persistence seam. Every write method must perform its read/check/write
 * in one atomic transaction. Migration writes V2 without deleting V1.
 */
export interface GuestDraftStorageDriver {
  readCurrent(): Promise<unknown | null>;
  readLegacy(): Promise<unknown | null>;
  create(draft: GuestDraftV2): Promise<GuestDraftDriverWriteResult>;
  replace(draft: GuestDraftV2, expectedRevision: number): Promise<GuestDraftDriverWriteResult>;
  migrate(draft: GuestDraftV2, expectedLegacyRevision: number): Promise<GuestDraftDriverWriteResult>;
  clear(): Promise<void>;
}

export type GuestDraftReadResult =
  | { status: "empty" }
  | { status: "ready"; draft: GuestDraftV2 }
  | { status: "incompatible"; foundVersion: number | null }
  | { status: "corrupted"; reason: Exclude<GuestDraftValidationReason, "unknown_schema_version"> }
  | { status: "migration_failed"; error: GuestDraftStorageError }
  | { status: "error"; error: GuestDraftStorageError };

export type GuestDraftWriteResult =
  | { ok: true }
  | { ok: false; reason: GuestDraftValidationReason | GuestDraftStorageErrorCode | "revision_conflict" };

function storageError(error: unknown): GuestDraftStorageError {
  if (error instanceof GuestDraftStorageError) return error;
  if (error instanceof DOMException) {
    if (error.name === "QuotaExceededError") {
      return new GuestDraftStorageError("quota_exceeded", "Browser storage quota was exceeded.", { cause: error });
    }
    if (error.name === "InvalidStateError" || error.name === "SecurityError" || error.name === "NotSupportedError") {
      return new GuestDraftStorageError("unavailable", "Browser storage is unavailable.", { cause: error });
    }
    if (error.name === "VersionError") {
      return new GuestDraftStorageError("incompatible_database", "The IndexedDB database was created by a newer schema.", { cause: error });
    }
  }
  return new GuestDraftStorageError("transaction_failed", "The local draft transaction failed.", { cause: error });
}

export class GuestDraftStore {
  constructor(private readonly driver: GuestDraftStorageDriver) {}

  async read(): Promise<GuestDraftReadResult> {
    let current: unknown | null;
    try {
      current = await this.driver.readCurrent();
    } catch (error) {
      const mapped = storageError(error);
      if (mapped.code === "incompatible_database") return { status: "incompatible", foundVersion: null };
      return { status: "error", error: mapped };
    }
    if (current !== null) return this.parseCurrent(current);

    let legacy: unknown | null;
    try {
      legacy = await this.driver.readLegacy();
    } catch (error) {
      const mapped = storageError(error);
      if (mapped.code === "incompatible_database") return { status: "incompatible", foundVersion: null };
      return { status: "error", error: mapped };
    }
    if (legacy === null) return { status: "empty" };

    const legacyValidation = validateGuestDraftV1(legacy);
    if (!legacyValidation.ok) {
      if (legacyValidation.reason === "unknown_schema_version") {
        return { status: "incompatible", foundVersion: legacyValidation.foundVersion ?? null };
      }
      return { status: "corrupted", reason: legacyValidation.reason };
    }

    const migration = migrateGuestDraftV1ToV2(legacyValidation.draft);
    if (!migration.ok) {
      if (migration.reason === "unknown_schema_version") {
        return { status: "incompatible", foundVersion: migration.foundVersion ?? null };
      }
      return { status: "corrupted", reason: migration.reason };
    }

    try {
      const outcome = await this.driver.migrate(migration.draft, legacyValidation.draft.revision);
      if (outcome === "saved") return { status: "ready", draft: structuredClone(migration.draft) };

      // Another tab may have completed the same migration first. Accept only
      // its fully valid V2 result; never overwrite or reinterpret it.
      const migratedElsewhere = await this.driver.readCurrent();
      if (migratedElsewhere !== null) return this.parseCurrent(migratedElsewhere);
      return {
        status: "migration_failed",
        error: new GuestDraftStorageError("transaction_failed", "The legacy draft changed during migration."),
      };
    } catch (error) {
      return { status: "migration_failed", error: storageError(error) };
    }
  }

  private parseCurrent(raw: unknown): GuestDraftReadResult {
    const validation = validateGuestDraft(raw);
    if (validation.ok) return { status: "ready", draft: structuredClone(validation.draft) };
    if (validation.reason === "unknown_schema_version") {
      return { status: "incompatible", foundVersion: validation.foundVersion ?? null };
    }
    return { status: "corrupted", reason: validation.reason };
  }

  /** `null` creates; a number conditionally replaces that exact revision. */
  async save(draft: GuestDraftV2, expectedRevision: number | null): Promise<GuestDraftWriteResult> {
    const validation = validateGuestDraft(draft);
    if (!validation.ok) return { ok: false, reason: validation.reason };
    if (expectedRevision !== null && (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0)) {
      return { ok: false, reason: "invalid_revision" };
    }
    if (
      (expectedRevision === null && validation.draft.revision !== 0)
      || (expectedRevision !== null && validation.draft.revision !== expectedRevision + 1)
    ) {
      return { ok: false, reason: "invalid_revision" };
    }
    try {
      const outcome = expectedRevision === null
        ? await this.driver.create(structuredClone(validation.draft))
        : await this.driver.replace(structuredClone(validation.draft), expectedRevision);
      return outcome === "saved" ? { ok: true } : { ok: false, reason: "revision_conflict" };
    } catch (error) {
      return { ok: false, reason: storageError(error).code };
    }
  }

  /** The only deletion operation. Nothing invokes it automatically. */
  async clear(): Promise<{ ok: true } | { ok: false; reason: GuestDraftStorageErrorCode }> {
    try {
      await this.driver.clear();
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: storageError(error).code };
    }
  }
}

const DATABASE_NAME = "heritage-guest-draft";
// The physical schema is unchanged: V2 uses a new record key in the same
// object store, allowing V1 to be read and retained during migration.
const DATABASE_VERSION = 1;
const STORE_NAME = "drafts";
const ACTIVE_DRAFT_KEY = `v${GUEST_DRAFT_SCHEMA_VERSION}:active`;
const LEGACY_ACTIVE_DRAFT_KEY = `v${LEGACY_GUEST_DRAFT_SCHEMA_VERSION}:active`;

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

class IndexedDbGuestDraftDriver implements GuestDraftStorageDriver {
  constructor(private readonly factory: IDBFactory) {}

  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = this.factory.open(DATABASE_NAME, DATABASE_VERSION);
      let settled = false;
      request.addEventListener("upgradeneeded", () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
      });
      request.addEventListener("blocked", () => {
        settled = true;
        reject(new GuestDraftStorageError("blocked", "IndexedDB upgrade is blocked by another tab."));
      }, { once: true });
      request.addEventListener("error", () => {
        if (!settled) reject(request.error ?? new Error("IndexedDB could not be opened."));
      }, { once: true });
      request.addEventListener("success", () => {
        if (settled) {
          request.result.close();
          return;
        }
        request.result.addEventListener("versionchange", () => request.result.close());
        resolve(request.result);
      }, { once: true });
    });
  }

  private async readKey(key: string): Promise<unknown | null> {
    const database = await this.open();
    try {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const done = transactionDone(transaction);
      const [value] = await Promise.all([
        requestResult(transaction.objectStore(STORE_NAME).get(key)),
        done,
      ]);
      return value === undefined ? null : value;
    } finally {
      database.close();
    }
  }

  readCurrent(): Promise<unknown | null> {
    return this.readKey(ACTIVE_DRAFT_KEY);
  }

  readLegacy(): Promise<unknown | null> {
    return this.readKey(LEGACY_ACTIVE_DRAFT_KEY);
  }

  async create(draft: GuestDraftV2): Promise<GuestDraftDriverWriteResult> {
    const database = await this.open();
    try {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const done = transactionDone(transaction);
      const store = transaction.objectStore(STORE_NAME);
      const [current, legacy] = await Promise.all([
        requestResult(store.get(ACTIVE_DRAFT_KEY)),
        requestResult(store.get(LEGACY_ACTIVE_DRAFT_KEY)),
      ]);
      if (current !== undefined || legacy !== undefined) {
        await done;
        return "conflict";
      }
      await requestResult(store.put(draft, ACTIVE_DRAFT_KEY));
      await done;
      return "saved";
    } finally {
      database.close();
    }
  }

  async replace(draft: GuestDraftV2, expectedRevision: number): Promise<GuestDraftDriverWriteResult> {
    const database = await this.open();
    try {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const done = transactionDone(transaction);
      const store = transaction.objectStore(STORE_NAME);
      const current = await requestResult(store.get(ACTIVE_DRAFT_KEY));
      if (
        typeof current !== "object"
        || current === null
        || !("revision" in current)
        || current.revision !== expectedRevision
      ) {
        await done;
        return "conflict";
      }
      await requestResult(store.put(draft, ACTIVE_DRAFT_KEY));
      await done;
      return "saved";
    } finally {
      database.close();
    }
  }

  async migrate(draft: GuestDraftV2, expectedLegacyRevision: number): Promise<GuestDraftDriverWriteResult> {
    const database = await this.open();
    try {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const done = transactionDone(transaction);
      const store = transaction.objectStore(STORE_NAME);
      const [current, legacy] = await Promise.all([
        requestResult(store.get(ACTIVE_DRAFT_KEY)),
        requestResult(store.get(LEGACY_ACTIVE_DRAFT_KEY)),
      ]);
      if (
        current !== undefined
        || typeof legacy !== "object"
        || legacy === null
        || !("revision" in legacy)
        || legacy.revision !== expectedLegacyRevision
      ) {
        await done;
        return "conflict";
      }
      await requestResult(store.put(draft, ACTIVE_DRAFT_KEY));
      // Keep V1 intact. Explicit clear remains the only deletion operation.
      await done;
      return "saved";
    } finally {
      database.close();
    }
  }

  async clear(): Promise<void> {
    const database = await this.open();
    try {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const done = transactionDone(transaction);
      await Promise.all([
        requestResult(transaction.objectStore(STORE_NAME).delete(ACTIVE_DRAFT_KEY)),
        requestResult(transaction.objectStore(STORE_NAME).delete(LEGACY_ACTIVE_DRAFT_KEY)),
        done,
      ]);
    } finally {
      database.close();
    }
  }
}

/**
 * Browser entry point. Calling it in SSR/test without IndexedDB is safe and
 * yields an explicit `unavailable` result on the first operation.
 */
export function createIndexedDbGuestDraftStore(
  factory: IDBFactory | undefined = typeof indexedDB === "undefined" ? undefined : indexedDB,
): GuestDraftStore {
  if (factory) return new GuestDraftStore(new IndexedDbGuestDraftDriver(factory));
  const unavailable = async (): Promise<never> => {
    throw new GuestDraftStorageError("unavailable", "IndexedDB is not available in this environment.");
  };
  return new GuestDraftStore({
    readCurrent: unavailable,
    readLegacy: unavailable,
    create: unavailable,
    replace: unavailable,
    migrate: unavailable,
    clear: unavailable,
  });
}
