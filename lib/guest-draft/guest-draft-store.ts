import {
  GUEST_DRAFT_SCHEMA_VERSION,
  validateGuestDraft,
  type GuestDraftV1,
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

/** Minimal persistence seam. Implementations must make `replace` atomic. */
export interface GuestDraftStorageDriver {
  read(): Promise<unknown | null>;
  replace(draft: GuestDraftV1): Promise<void>;
  clear(): Promise<void>;
}

export type GuestDraftReadResult =
  | { status: "empty" }
  | { status: "ready"; draft: GuestDraftV1 }
  | { status: "incompatible"; foundVersion: number | null }
  | { status: "corrupted"; reason: Exclude<GuestDraftValidationReason, "unknown_schema_version"> }
  | { status: "error"; error: GuestDraftStorageError };

export type GuestDraftWriteResult =
  | { ok: true }
  | { ok: false; reason: GuestDraftValidationReason | GuestDraftStorageErrorCode };

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
    let raw: unknown | null;
    try {
      raw = await this.driver.read();
    } catch (error) {
      const mapped = storageError(error);
      if (mapped.code === "incompatible_database") return { status: "incompatible", foundVersion: null };
      return { status: "error", error: mapped };
    }
    if (raw === null) return { status: "empty" };

    const validation = validateGuestDraft(raw);
    if (validation.ok) return { status: "ready", draft: structuredClone(validation.draft) };
    if (validation.reason === "unknown_schema_version") {
      return { status: "incompatible", foundVersion: validation.foundVersion ?? null };
    }
    return { status: "corrupted", reason: validation.reason };
  }

  async save(draft: GuestDraftV1): Promise<GuestDraftWriteResult> {
    const validation = validateGuestDraft(draft);
    if (!validation.ok) return { ok: false, reason: validation.reason };
    try {
      await this.driver.replace(structuredClone(validation.draft));
      return { ok: true };
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
const DATABASE_VERSION = 1;
const STORE_NAME = "drafts";
const ACTIVE_DRAFT_KEY = `v${GUEST_DRAFT_SCHEMA_VERSION}:active`;

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

  async read(): Promise<unknown | null> {
    const database = await this.open();
    try {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const done = transactionDone(transaction);
      const [value] = await Promise.all([
        requestResult(transaction.objectStore(STORE_NAME).get(ACTIVE_DRAFT_KEY)),
        done,
      ]);
      return value === undefined ? null : value;
    } finally {
      database.close();
    }
  }

  async replace(draft: GuestDraftV1): Promise<void> {
    const database = await this.open();
    try {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const done = transactionDone(transaction);
      await Promise.all([
        requestResult(transaction.objectStore(STORE_NAME).put(draft, ACTIVE_DRAFT_KEY)),
        done,
      ]);
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
  return new GuestDraftStore({ read: unavailable, replace: unavailable, clear: unavailable });
}
