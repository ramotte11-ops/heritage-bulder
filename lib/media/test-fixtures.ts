import type { MediaObjectStore } from "@/lib/adapters/media-object-store";
import type { MediaRepository } from "@/lib/adapters/media-repository";
import type { MemorialOwnershipRepository } from "@/lib/adapters/memorial-ownership-repository";
import type { HeritageActor } from "@/lib/auth/heritage-actor";
import type { Media } from "@/types/media";
import type { MediaPurpose, MediaStatus } from "@/config/media";
import type { MediaEngineDeps } from "./media-engine";

/**
 * Mission 030 — in-memory doubles for the media engine's ports.
 *
 * ## Why these are fakes and not mocks
 *
 * The properties this mission has to prove are about SEQUENCES and
 * STATE — "the old media still exists after the new one failed", "an
 * abandoned reservation is reclaimed but a finalized one never is",
 * "two racing finalizations produce one winner". A mock that records
 * calls can only show which methods were invoked; it cannot show what
 * the world looked like afterwards, which is the only thing that
 * matters for a lifecycle. So these fakes hold real state and enforce
 * the same invariants the real adapters do — including the
 * compare-and-set in `markReady`, without which the concurrency tests
 * would pass against a fake that is more permissive than production.
 *
 * They deliberately do NOT enforce ownership. The whole point of the
 * cross-owner tests is that the ENGINE refuses, so a fake that filtered
 * by owner would hide the very bug being hunted: if
 * `authorizeMemorialAccess` were ever removed from a primitive, these
 * fakes would happily serve another family's media, and the test would
 * go red. That is the intended failure mode.
 */

export const OWNER_A = "11111111-1111-4111-8111-111111111111";
export const OWNER_B = "22222222-2222-4222-8222-222222222222";
export const MEMORIAL_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const MEMORIAL_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

// ---------------------------------------------------------------------
// Minimal but REAL image headers (dette D1): the signature the type check
// reads AND the dimensions finalization now measures. No pixel data — the
// engine never decodes one.
// ---------------------------------------------------------------------

function segment(marker: number, data: readonly number[] | Uint8Array): Uint8Array {
  const length = data.length + 2;
  const out = new Uint8Array(length + 2);
  out.set([0xff, marker, length >> 8, length & 0xff]);
  out.set(data, 4);
  return out;
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));

/** A JPEG header: SOI, APP0 JFIF, optional APP1 EXIF orientation / padding / DHT / SOS, a SOF, EOI. */
export function jpegWithDimensions(
  width: number,
  height: number,
  options: {
    sof?: number;
    orientation?: number;
    byteOrder?: "II" | "MM";
    /** APP2 segments of ~64 KiB each (EXIF thumbnail / ICC / XMP stand-ins). */
    paddingSegments?: number;
    dhtFirst?: boolean;
    sosBeforeSof?: boolean;
  } = {},
): Uint8Array {
  const parts: Uint8Array[] = [new Uint8Array([0xff, 0xd8])];
  parts.push(segment(0xe0, [...ascii("JFIF"), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]));
  if (options.orientation !== undefined) {
    const le = options.byteOrder === "II";
    const u16 = (v: number) => (le ? [v & 0xff, v >> 8] : [v >> 8, v & 0xff]);
    const u32 = (v: number) => (le ? [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, v >>> 24] : [v >>> 24, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff]);
    const tiff = [...ascii(le ? "II" : "MM"), ...u16(42), ...u32(8), ...u16(1), ...u16(0x0112), ...u16(3), ...u32(1), ...u16(options.orientation), 0, 0, ...u32(0)];
    parts.push(segment(0xe1, [...ascii("Exif"), 0, 0, ...tiff]));
  }
  for (let i = 0; i < (options.paddingSegments ?? 0); i += 1) parts.push(segment(0xe2, new Uint8Array(65533)));
  if (options.dhtFirst) parts.push(segment(0xc4, [0x00, ...new Array(16).fill(0)]));
  if (options.sosBeforeSof) parts.push(segment(0xda, [1, 1, 0, 0, 63, 0]));
  parts.push(segment(options.sof ?? 0xc0, [8, height >> 8, height & 0xff, width >> 8, width & 0xff, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]));
  parts.push(new Uint8Array([0xff, 0xd9]));
  return concat(parts);
}

/** A PNG header: signature + IHDR (width, height big-endian). */
export function pngWithDimensions(width: number, height: number): Uint8Array {
  const u32 = (v: number) => [v >>> 24, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, ...ascii("IHDR"), ...u32(width), ...u32(height), 8, 2, 0, 0, 0, 0, 0, 0, 0]);
}

function webp(chunk: string, body: number[]): Uint8Array {
  const bytes = new Uint8Array(30);
  bytes.set([...ascii("RIFF"), 0x24, 0, 0, 0, ...ascii("WEBP"), ...ascii(chunk), body.length, 0, 0, 0]);
  bytes.set(body, 20);
  return bytes;
}

/** A lossy WebP header (`VP8 `). */
export function webpVp8WithDimensions(width: number, height: number): Uint8Array {
  return webp("VP8 ", [0x10, 0x02, 0x00, 0x9d, 0x01, 0x2a, width & 0xff, (width >> 8) & 0x3f, height & 0xff, (height >> 8) & 0x3f]);
}

/** A lossless WebP header (`VP8L`): 14-bit width-1 and height-1, packed LSB first. */
export function webpVp8lWithDimensions(width: number, height: number): Uint8Array {
  const bits = ((width - 1) | ((height - 1) << 14)) >>> 0;
  return webp("VP8L", [0x2f, bits & 0xff, (bits >> 8) & 0xff, (bits >> 16) & 0xff, (bits >>> 24) & 0xff, 0, 0, 0, 0, 0]);
}

/** An extended WebP header (`VP8X`): 24-bit canvas width-1 and height-1. */
export function webpVp8xWithDimensions(width: number, height: number): Uint8Array {
  const w = width - 1;
  const h = height - 1;
  return webp("VP8X", [0, 0, 0, 0, w & 0xff, (w >> 8) & 0xff, (w >> 16) & 0xff, h & 0xff, (h >> 8) & 0xff, (h >> 16) & 0xff]);
}

/** A valid JPEG header — `FF D8 FF`, and a real SOF (1200 × 1600, portrait 3:4). */
export const JPEG_BYTES = jpegWithDimensions(1200, 1600);

/** A valid PNG header — signature + IHDR (1600 × 1200). */
export const PNG_BYTES = pngWithDimensions(1600, 1200);

/** "RIFF" + size + "WEBP" + a VP8X canvas (1920 × 1080). */
export const WEBP_BYTES = webpVp8xWithDimensions(1920, 1080);

/** `<svg ...` — the format that must never be accepted. */
export const SVG_BYTES = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg">');

/** `#!/bin/sh` — an executable renamed to .jpg. */
export const SCRIPT_BYTES = new TextEncoder().encode("#!/bin/sh\nrm -rf /\n");

/** `PK\x03\x04` — a ZIP archive wearing an image's name. */
export const ZIP_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]);

/** An MP4 `ftyp` box — video, which this foundation admits nowhere. */
export const MP4_BYTES = new Uint8Array([
  0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d,
]);

/** A HEIC `ftyp` box — deliberately not supported (see config/media.ts). */
export const HEIC_BYTES = new Uint8Array([
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63,
]);

export function ownerActor(ownerId: string): HeritageActor {
  return {
    audience: "owner",
    identity: { id: `auth-${ownerId}`, email: `${ownerId}@heritage.test`, app_metadata: {} },
    owner: {
      id: ownerId,
      email: `${ownerId}@heritage.test`,
      authUserId: `auth-${ownerId}`,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    isHeritageAdmin: false,
  };
}

export const VISITOR: HeritageActor = {
  audience: "visitor",
  identity: null,
  owner: null,
  isHeritageAdmin: false,
};

/** Signed in, but with no Owner record — must be refused like a visitor. */
export const AUTHENTICATED_NON_OWNER: HeritageActor = {
  audience: "authenticated",
  identity: { id: "auth-stranger", email: "stranger@heritage.test", app_metadata: {} },
  owner: null,
  isHeritageAdmin: false,
};

/** Staff. Must get no bypass whatsoever — see lib/auth/memorial-access.ts. */
export const ADMIN_NON_OWNER: HeritageActor = {
  audience: "authenticated",
  identity: { id: "auth-admin", email: "admin@heritage.test", app_metadata: {} },
  owner: null,
  isHeritageAdmin: true,
};

export class FakeOwnershipRepository implements MemorialOwnershipRepository {
  /** Set to make the repository fail, to prove errors are not read as "denied". */
  public failWith: Error | null = null;

  constructor(private readonly owners: Record<string, string> = {
    [MEMORIAL_A]: OWNER_A,
    [MEMORIAL_B]: OWNER_B,
  }) {}

  async findOwnerIdForMemorial(memorialId: string): Promise<string | null> {
    if (this.failWith) throw this.failWith;
    return this.owners[memorialId] ?? null;
  }
}

export class FakeMediaRepository implements MediaRepository {
  public rows = new Map<string, Media>();
  public failOn: Partial<Record<keyof MediaRepository, Error>> = {};

  /**
   * Shares the ENGINE's clock, not the wall clock.
   *
   * This matters: the sweep compares a row's `createdAt` against a
   * cutoff derived from `deps.now()`. If rows were stamped with
   * `new Date()` while the engine ran on a pinned clock, advancing the
   * test clock would never make a reservation look old, and every
   * TTL assertion would silently measure nothing.
   */
  constructor(private readonly now: () => Date = () => new Date()) {}

  private guard(method: keyof MediaRepository): void {
    const failure = this.failOn[method];
    if (failure) throw failure;
  }

  async createPending(input: {
    memorialId: string;
    ownerId: string;
    mediaId: string;
    storagePath: string;
    purpose: MediaPurpose;
    declaredMimeType: string;
  }): Promise<Media> {
    this.guard("createPending");

    const media: Media = {
      id: input.mediaId,
      memorialId: input.memorialId,
      ownerId: input.ownerId,
      storagePath: input.storagePath,
      mediaType: "photo",
      purpose: input.purpose,
      status: "pending",
      mimeType: input.declaredMimeType,
      // Never written by the foundation — asserted by the tests.
      originalFilename: null,
      sizeBytes: null,
      width: null,
      height: null,
      createdAt: this.now().toISOString(),
      updatedAt: this.now().toISOString(),
    };

    this.rows.set(input.mediaId, media);
    return media;
  }

  async markReady(input: {
    memorialId: string;
    mediaId: string;
    mimeType: string;
    sizeBytes: number;
    width: number | null;
    height: number | null;
  }): Promise<Media | null> {
    this.guard("markReady");

    const existing = this.rows.get(input.mediaId);

    // The same compare-and-set the real adapter performs with
    // `.eq("status", "pending")`. Reproduced here because the
    // concurrency tests are meaningless against a fake that lets a
    // second finalization win.
    if (!existing) return null;
    if (existing.memorialId !== input.memorialId) return null;
    if (existing.status !== "pending") return null;

    const updated: Media = {
      ...existing,
      status: "ready",
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      width: input.width,
      height: input.height,
      updatedAt: this.now().toISOString(),
    };

    this.rows.set(input.mediaId, updated);
    return updated;
  }

  async findById(input: { memorialId: string; mediaId: string }): Promise<Media | null> {
    this.guard("findById");

    const media = this.rows.get(input.mediaId);
    if (!media) return null;

    // Both ids, exactly as the real query does. This is what makes "a
    // media of another memorial" indistinguishable from "no such
    // media".
    if (media.memorialId !== input.memorialId) return null;

    return media;
  }

  async listForMemorial(input: {
    memorialId: string;
    purpose?: MediaPurpose;
    status?: MediaStatus;
  }): Promise<Media[]> {
    this.guard("listForMemorial");

    return [...this.rows.values()]
      .filter((media) => media.memorialId === input.memorialId)
      .filter((media) => input.purpose === undefined || media.purpose === input.purpose)
      .filter((media) => input.status === undefined || media.status === input.status)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async deleteById(input: { memorialId: string; mediaId: string }): Promise<boolean> {
    this.guard("deleteById");

    const media = this.rows.get(input.mediaId);
    if (!media || media.memorialId !== input.memorialId) return false;

    this.rows.delete(input.mediaId);
    return true;
  }

  async findExpiredPending(input: { olderThan: Date; limit: number }): Promise<Media[]> {
    this.guard("findExpiredPending");

    return [...this.rows.values()]
      .filter((media) => media.status === "pending")
      .filter((media) => new Date(media.createdAt) < input.olderThan)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(0, input.limit);
  }
}

export class FakeObjectStore implements MediaObjectStore {
  /** path -> stored bytes. */
  public objects = new Map<string, Uint8Array>();
  /** Every path an upload permission was ever issued for. */
  public issuedPermissions: string[] = [];
  public failOn: Partial<Record<keyof MediaObjectStore, Error>> = {};

  private guard(method: keyof MediaObjectStore): void {
    const failure = this.failOn[method];
    if (failure) throw failure;
  }

  async createUploadPermission(input: { path: string }): Promise<{
    url: string;
    token: string;
  }> {
    this.guard("createUploadPermission");
    this.issuedPermissions.push(input.path);
    return { url: `https://storage.test/upload/${input.path}`, token: `token-${input.path}` };
  }

  async createReadUrl(input: { path: string; expiresInSeconds: number }): Promise<string> {
    this.guard("createReadUrl");
    return `https://storage.test/signed/${input.path}?expires=${input.expiresInSeconds}`;
  }

  async statObject(input: { path: string }): Promise<{ sizeBytes: number } | null> {
    this.guard("statObject");
    const bytes = this.objects.get(input.path);
    return bytes ? { sizeBytes: bytes.length } : null;
  }

  async readObjectHead(input: {
    path: string;
    byteCount: number;
  }): Promise<Uint8Array | null> {
    this.guard("readObjectHead");
    const bytes = this.objects.get(input.path);
    return bytes ? bytes.subarray(0, input.byteCount) : null;
  }

  async removeByPrefix(input: { prefix: string }): Promise<void> {
    this.guard("removeByPrefix");
    for (const path of [...this.objects.keys()]) {
      if (path === input.prefix || path.startsWith(`${input.prefix}/`)) {
        this.objects.delete(path);
      }
    }
  }

  /**
   * Simulate the browser completing an upload, INCLUDING a dishonest
   * one: `bytes` need not match what was declared at reservation.
   * `sizeOverride` fakes a large file without allocating it.
   */
  put(path: string, bytes: Uint8Array, sizeOverride?: number): void {
    if (sizeOverride === undefined) {
      this.objects.set(path, bytes);
      return;
    }

    // A sparse stand-in: the signature bytes are real, the length is
    // whatever the test needs. Allocating 16 MiB per test would be
    // slow for no added truth.
    const padded = new Uint8Array(sizeOverride);
    padded.set(bytes.subarray(0, Math.min(bytes.length, sizeOverride)));
    this.objects.set(path, padded);
  }
}

export interface TestEngine extends MediaEngineDeps {
  memorialOwnershipRepository: FakeOwnershipRepository;
  mediaRepository: FakeMediaRepository;
  objectStore: FakeObjectStore;
  /** Move the engine's clock, for the sweep's TTL. */
  advance(ms: number): void;
}

export function createTestEngine(options: { now?: Date } = {}): TestEngine {
  let clock = options.now ?? new Date("2026-09-09T12:00:00.000Z");
  let counter = 0;

  return {
    memorialOwnershipRepository: new FakeOwnershipRepository(),
    mediaRepository: new FakeMediaRepository(() => clock),
    objectStore: new FakeObjectStore(),
    // Deterministic, but still a real UUID shape — media-path.ts
    // refuses anything else, so a test cannot accidentally prove
    // something about ids the production code would reject.
    generateMediaId: () => {
      counter += 1;
      const suffix = counter.toString(16).padStart(12, "0");
      return `cccccccc-cccc-4ccc-8ccc-${suffix}`;
    },
    now: () => clock,
    advance(ms: number) {
      clock = new Date(clock.getTime() + ms);
    },
  };
}
