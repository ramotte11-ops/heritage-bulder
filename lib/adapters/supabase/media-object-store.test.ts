import { afterEach, describe, expect, it, vi } from "vitest";
import { MEDIA_BUCKET } from "@/config/media";
import { SupabaseMediaObjectStore } from "./media-object-store";

/**
 * Mission 030 — the Storage adapter.
 *
 * The properties worth testing here are the ones a reviewer cannot
 * verify by reading a comment: that upload permissions are never
 * overwrite-capable, that a missing object is distinguished from an
 * outage, and that deletion covers a whole media directory rather than
 * one known file.
 */

interface StorageLog {
  bucket: string[];
  signedUpload: [string, unknown][];
  signedUrl: [string, number][];
  info: string[];
  list: string[];
  remove: string[][];
}

function store(responses: {
  createSignedUploadUrl?: unknown;
  createSignedUrl?: unknown;
  info?: unknown;
  list?: unknown;
  remove?: unknown;
}) {
  const log: StorageLog = {
    bucket: [],
    signedUpload: [],
    signedUrl: [],
    info: [],
    list: [],
    remove: [],
  };

  const bucketApi = {
    createSignedUploadUrl: vi.fn(async (path: string, options?: unknown) => {
      log.signedUpload.push([path, options]);
      return (
        responses.createSignedUploadUrl ?? {
          data: { signedUrl: `https://storage.test/${path}`, token: "tok", path },
          error: null,
        }
      );
    }),
    createSignedUrl: vi.fn(async (path: string, expiresIn: number) => {
      log.signedUrl.push([path, expiresIn]);
      return (
        responses.createSignedUrl ?? {
          data: { signedUrl: `https://storage.test/signed/${path}` },
          error: null,
        }
      );
    }),
    info: vi.fn(async (path: string) => {
      log.info.push(path);
      return responses.info ?? { data: { size: 2048 }, error: null };
    }),
    list: vi.fn(async (prefix: string) => {
      log.list.push(prefix);
      return responses.list ?? { data: [{ name: "original.jpg" }], error: null };
    }),
    remove: vi.fn(async (paths: string[]) => {
      log.remove.push(paths);
      return responses.remove ?? { data: [], error: null };
    }),
  };

  const client = { storage: { from: (bucket: string) => { log.bucket.push(bucket); return bucketApi; } } };

  return {
    objectStore: new SupabaseMediaObjectStore(
      client as unknown as ConstructorParameters<typeof SupabaseMediaObjectStore>[0],
    ),
    log,
    bucketApi,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createUploadPermission", () => {
  it("targets the one private bucket", async () => {
    const { objectStore, log } = store({});

    await objectStore.createUploadPermission({ path: "memorial-a/media-1/original.jpg" });

    expect(log.bucket).toContain(MEDIA_BUCKET);
  });

  it("NEVER enables overwrite", async () => {
    // An overwrite-capable permission would let a replayed reservation
    // destroy bytes that are already finalized and in use.
    const { objectStore, log } = store({});

    await objectStore.createUploadPermission({ path: "memorial-a/media-1/original.jpg" });

    const [, options] = log.signedUpload[0];
    expect(options).toBeUndefined();
  });

  it("authorizes exactly the path it was given", async () => {
    const { objectStore, log } = store({});

    await objectStore.createUploadPermission({ path: "memorial-a/media-1/original.jpg" });

    expect(log.signedUpload[0][0]).toBe("memorial-a/media-1/original.jpg");
    expect(log.signedUpload).toHaveLength(1);
  });

  it("propagates a failure instead of returning an unusable permission", async () => {
    const { objectStore } = store({
      createSignedUploadUrl: { data: null, error: new Error("storage down") },
    });

    await expect(
      objectStore.createUploadPermission({ path: "memorial-a/media-1/original.jpg" }),
    ).rejects.toThrow("storage down");
  });
});

describe("createReadUrl", () => {
  it("signs with the requested expiry", async () => {
    const { objectStore, log } = store({});

    await objectStore.createReadUrl({ path: "memorial-a/m/original.jpg", expiresInSeconds: 300 });

    expect(log.signedUrl[0]).toEqual(["memorial-a/m/original.jpg", 300]);
  });

  it("never uses a public URL", async () => {
    // The bucket is private; getPublicUrl would produce a link that
    // either does not work or, worse, works forever.
    const { objectStore, bucketApi } = store({});

    await objectStore.createReadUrl({ path: "memorial-a/m/original.jpg", expiresInSeconds: 60 });

    expect(bucketApi.createSignedUrl).toHaveBeenCalled();
    expect(bucketApi).not.toHaveProperty("getPublicUrl");
  });
});

describe("statObject", () => {
  it("returns the measured size", async () => {
    const { objectStore } = store({});

    expect(await objectStore.statObject({ path: "memorial-a/m/original.jpg" })).toEqual({
      sizeBytes: 2048,
    });
  });

  it("returns null for a missing object", async () => {
    // How finalization learns a reservation was never uploaded.
    const { objectStore } = store({
      info: { data: null, error: { statusCode: "404", message: "Object not found" } },
    });

    expect(await objectStore.statObject({ path: "memorial-a/m/original.jpg" })).toBeNull();
  });

  it("rethrows a genuine outage rather than calling it 'not uploaded'", async () => {
    // Reading an outage as an absent file would make us discard a
    // perfectly good reservation.
    const { objectStore } = store({
      info: { data: null, error: { statusCode: 500, message: "internal error" } },
    });

    await expect(objectStore.statObject({ path: "memorial-a/m/original.jpg" })).rejects.toBeTruthy();
  });

  it("treats an absent size as absent, not as zero", async () => {
    // A zero would be reported to the user as an incomplete upload —
    // a claim we have no evidence for.
    const { objectStore } = store({ info: { data: {}, error: null } });

    expect(await objectStore.statObject({ path: "memorial-a/m/original.jpg" })).toBeNull();
  });
});

describe("readObjectHead", () => {
  it("requests only the leading bytes with a Range header", async () => {
    // Downloading a 15 MiB photograph to inspect 16 bytes would put a
    // photo-sized transfer on every finalization.
    const fetchMock = vi.fn(async () => ({
      status: 206,
      ok: false,
      arrayBuffer: async () => new Uint8Array([0xff, 0xd8, 0xff]).buffer,
    }));
    vi.stubGlobal("fetch", fetchMock);

    const { objectStore } = store({});
    const head = await objectStore.readObjectHead({
      path: "memorial-a/m/original.jpg",
      byteCount: 16,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ headers: { Range: "bytes=0-15" } }),
    );
    expect(head).toEqual(new Uint8Array([0xff, 0xd8, 0xff]));
  });

  it("truncates when a server ignores the Range header", async () => {
    // A server answering 200 with the whole file must not break the
    // method's contract.
    const whole = new Uint8Array(100).fill(7);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ status: 200, ok: true, arrayBuffer: async () => whole.buffer })),
    );

    const { objectStore } = store({});
    const head = await objectStore.readObjectHead({
      path: "memorial-a/m/original.jpg",
      byteCount: 16,
    });

    expect(head).toHaveLength(16);
  });

  it("returns null for a missing object", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ status: 404, ok: false, arrayBuffer: async () => new ArrayBuffer(0) })),
    );

    const { objectStore } = store({});

    expect(
      await objectStore.readObjectHead({ path: "memorial-a/m/original.jpg", byteCount: 16 }),
    ).toBeNull();
  });

  it("returns null for an empty object", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ status: 206, ok: false, arrayBuffer: async () => new ArrayBuffer(0) })),
    );

    const { objectStore } = store({});

    expect(
      await objectStore.readObjectHead({ path: "memorial-a/m/original.jpg", byteCount: 16 }),
    ).toBeNull();
  });

  it("throws on an unexpected status rather than reporting no bytes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ status: 500, ok: false, arrayBuffer: async () => new ArrayBuffer(0) })),
    );

    const { objectStore } = store({});

    await expect(
      objectStore.readObjectHead({ path: "memorial-a/m/original.jpg", byteCount: 16 }),
    ).rejects.toThrow(/500/);
  });
});

describe("removeByPrefix", () => {
  it("removes every object in the media directory", async () => {
    // Future derivatives are siblings under the same prefix; deleting
    // only `original.jpg` would orphan them.
    const { objectStore, log } = store({
      list: {
        data: [{ name: "original.jpg" }, { name: "hero-1200.webp" }, { name: "thumb.webp" }],
        error: null,
      },
    });

    await objectStore.removeByPrefix({ prefix: "memorial-a/media-1" });

    expect(log.list).toEqual(["memorial-a/media-1"]);
    expect(log.remove[0]).toEqual([
      "memorial-a/media-1/original.jpg",
      "memorial-a/media-1/hero-1200.webp",
      "memorial-a/media-1/thumb.webp",
    ]);
  });

  it("is a successful no-op when the directory is empty", async () => {
    // What makes deletion and the sweep idempotent.
    const { objectStore, log } = store({ list: { data: [], error: null } });

    await expect(
      objectStore.removeByPrefix({ prefix: "memorial-a/media-1" }),
    ).resolves.toBeUndefined();
    expect(log.remove).toHaveLength(0);
  });

  it("is a successful no-op when the directory does not exist", async () => {
    const { objectStore } = store({
      list: { data: null, error: { statusCode: "404", message: "Not found" } },
    });

    await expect(
      objectStore.removeByPrefix({ prefix: "memorial-a/media-1" }),
    ).resolves.toBeUndefined();
  });

  it("propagates a genuine failure so the caller keeps the row", async () => {
    // A swallowed error here would let deleteMedia remove the row and
    // orphan the object.
    const { objectStore } = store({
      list: { data: null, error: { statusCode: 500, message: "internal error" } },
    });

    await expect(
      objectStore.removeByPrefix({ prefix: "memorial-a/media-1" }),
    ).rejects.toBeTruthy();
  });

  it("never removes anything outside the prefix it was given", async () => {
    const { objectStore, log } = store({
      list: { data: [{ name: "original.jpg" }], error: null },
    });

    await objectStore.removeByPrefix({ prefix: "memorial-a/media-1" });

    for (const path of log.remove[0]) {
      expect(path.startsWith("memorial-a/media-1/")).toBe(true);
    }
  });
});
