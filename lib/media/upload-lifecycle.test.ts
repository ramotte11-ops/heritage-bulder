import { describe, expect, it } from "vitest";
import { MAX_MEDIA_BYTES } from "@/config/media";
import { finalizeMediaUpload, reserveMediaUpload } from "./upload-lifecycle";
import {
  ADMIN_NON_OWNER,
  AUTHENTICATED_NON_OWNER,
  HEIC_BYTES,
  JPEG_BYTES,
  MEMORIAL_A,
  MEMORIAL_B,
  MP4_BYTES,
  OWNER_A,
  OWNER_B,
  PNG_BYTES,
  SCRIPT_BYTES,
  SVG_BYTES,
  VISITOR,
  WEBP_BYTES,
  ZIP_BYTES,
  createTestEngine,
  ownerActor,
} from "./test-fixtures";

/** Reserve, then simulate the browser uploading `bytes`. */
async function uploadedMedia(
  engine: ReturnType<typeof createTestEngine>,
  options: {
    memorialId?: string;
    owner?: string;
    declaredMimeType?: string;
    bytes?: Uint8Array;
    sizeOverride?: number;
    purpose?: "hero" | "gallery";
  } = {},
) {
  const memorialId = options.memorialId ?? MEMORIAL_A;
  const reserved = await reserveMediaUpload(engine, ownerActor(options.owner ?? OWNER_A), {
    memorialId,
    purpose: options.purpose ?? "gallery",
    declaredMimeType: options.declaredMimeType ?? "image/jpeg",
  });

  if (!reserved.ok) throw new Error(`reservation failed: ${reserved.code}`);

  if (options.bytes) {
    engine.objectStore.put(reserved.value.storagePath, options.bytes, options.sizeOverride);
  }

  return reserved.value;
}

// =====================================================================
// OWNERSHIP — section 11: "Auth ≠ ownership"
// =====================================================================

describe("reserveMediaUpload — ownership", () => {
  it("lets an Owner reserve on their OWN memorial", () => {
    const engine = createTestEngine();
    return expect(
      reserveMediaUpload(engine, ownerActor(OWNER_A), {
        memorialId: MEMORIAL_A,
        purpose: "hero",
        declaredMimeType: "image/jpeg",
      }),
    ).resolves.toMatchObject({ ok: true });
  });

  it("refuses Owner A on Owner B's memorial", async () => {
    // THE cross-owner test. Owner A is fully authenticated and holds a
    // real Owner record — being signed in is simply not the question.
    const engine = createTestEngine();

    const result = await reserveMediaUpload(engine, ownerActor(OWNER_A), {
      memorialId: MEMORIAL_B,
      purpose: "hero",
      declaredMimeType: "image/jpeg",
    });

    expect(result).toEqual({ ok: false, code: "access_denied" });
  });

  it("creates NOTHING when ownership fails", async () => {
    // A refusal must not leave a row, and must not consume a media id
    // or issue a permission. Otherwise anyone signed in could fill the
    // table by pointing at memorials they do not own.
    const engine = createTestEngine();

    await reserveMediaUpload(engine, ownerActor(OWNER_A), {
      memorialId: MEMORIAL_B,
      purpose: "hero",
      declaredMimeType: "image/jpeg",
    });

    expect(engine.mediaRepository.rows.size).toBe(0);
    expect(engine.objectStore.issuedPermissions).toEqual([]);
  });

  it("refuses a visitor", async () => {
    const engine = createTestEngine();
    const result = await reserveMediaUpload(engine, VISITOR, {
      memorialId: MEMORIAL_A,
      purpose: "hero",
      declaredMimeType: "image/jpeg",
    });

    expect(result).toEqual({ ok: false, code: "access_denied" });
  });

  it("refuses a signed-in user who is not an Owner", async () => {
    const engine = createTestEngine();
    const result = await reserveMediaUpload(engine, AUTHENTICATED_NON_OWNER, {
      memorialId: MEMORIAL_A,
      purpose: "hero",
      declaredMimeType: "image/jpeg",
    });

    expect(result).toEqual({ ok: false, code: "access_denied" });
  });

  it("gives HERITAGE staff no bypass", async () => {
    // An Admin is staff, not a super-owner (lib/auth/memorial-access.ts).
    // Staff must not reach a family's photographs by virtue of being
    // staff.
    const engine = createTestEngine();
    const result = await reserveMediaUpload(engine, ADMIN_NON_OWNER, {
      memorialId: MEMORIAL_A,
      purpose: "hero",
      declaredMimeType: "image/jpeg",
    });

    expect(result).toEqual({ ok: false, code: "access_denied" });
  });

  it("refuses a memorial that does not exist, with the SAME code", async () => {
    // Indistinguishable from "not yours" on purpose: distinguishing
    // them would let anyone walk ids to learn which are real.
    const engine = createTestEngine();
    const result = await reserveMediaUpload(engine, ownerActor(OWNER_A), {
      memorialId: "99999999-9999-4999-8999-999999999999",
      purpose: "hero",
      declaredMimeType: "image/jpeg",
    });

    expect(result).toEqual({ ok: false, code: "access_denied" });
  });

  it("never trusts a memorialId simply because it was sent", async () => {
    // The claim is verified against the ownership repository, not
    // accepted. Proved by removing the memorial from that repository:
    // the same id that worked a moment ago now fails.
    const engine = createTestEngine();
    const before = await reserveMediaUpload(engine, ownerActor(OWNER_A), {
      memorialId: MEMORIAL_A,
      purpose: "hero",
      declaredMimeType: "image/jpeg",
    });
    expect(before.ok).toBe(true);

    const emptyEngine = createTestEngine();
    Object.assign(emptyEngine.memorialOwnershipRepository, { owners: {} });

    const after = await reserveMediaUpload(emptyEngine, ownerActor(OWNER_A), {
      memorialId: MEMORIAL_A,
      purpose: "hero",
      declaredMimeType: "image/jpeg",
    });

    expect(after).toEqual({ ok: false, code: "access_denied" });
  });

  it("propagates an ownership-repository failure instead of reading it as a refusal", async () => {
    // An outage must never be answered as "denied" — that is how an
    // incident silently becomes a wrong authorization answer. The
    // engine lets it throw (see lib/auth/memorial-access.ts).
    const engine = createTestEngine();
    engine.memorialOwnershipRepository.failWith = new Error("database unreachable");

    await expect(
      reserveMediaUpload(engine, ownerActor(OWNER_A), {
        memorialId: MEMORIAL_A,
        purpose: "hero",
        declaredMimeType: "image/jpeg",
      }),
    ).rejects.toThrow("database unreachable");
  });
});

// =====================================================================
// THE RESERVATION ITSELF
// =====================================================================

describe("reserveMediaUpload — what it produces", () => {
  it("generates the media id itself and records the row BEFORE issuing a permission", async () => {
    // The anti-orphan ordering: every path handed out is already a
    // known row, so abandoned bytes can never be an unknown object.
    const engine = createTestEngine();
    const reserved = await uploadedMedia(engine);

    const row = engine.mediaRepository.rows.get(reserved.mediaId);
    expect(row?.status).toBe("pending");
    expect(engine.objectStore.issuedPermissions).toEqual([reserved.storagePath]);
    expect(row?.storagePath).toBe(reserved.storagePath);
  });

  it("stores the VERIFIED owner id, never one supplied by the caller", async () => {
    const engine = createTestEngine();
    const reserved = await uploadedMedia(engine);

    expect(engine.mediaRepository.rows.get(reserved.mediaId)?.ownerId).toBe(OWNER_A);
  });

  it("issues a permission for exactly one path", async () => {
    // Not bucket access — one object (mission brief, section 10).
    const engine = createTestEngine();
    const reserved = await uploadedMedia(engine);

    expect(engine.objectStore.issuedPermissions).toHaveLength(1);
    expect(engine.objectStore.issuedPermissions[0]).toBe(reserved.storagePath);
    expect(reserved.storagePath.startsWith(`${MEMORIAL_A}/`)).toBe(true);
  });

  it("never records the client's filename", async () => {
    const engine = createTestEngine();
    const reserved = await uploadedMedia(engine);

    expect(engine.mediaRepository.rows.get(reserved.mediaId)?.originalFilename).toBeNull();
  });

  it("records no size while pending, because the file does not exist yet", async () => {
    const engine = createTestEngine();
    const reserved = await uploadedMedia(engine);

    expect(engine.mediaRepository.rows.get(reserved.mediaId)?.sizeBytes).toBeNull();
  });

  it("rejects a declared type outside the allowlist before reserving anything", async () => {
    const engine = createTestEngine();

    for (const type of ["image/svg+xml", "image/heic", "image/gif", "video/mp4", "application/pdf", "text/html"]) {
      const result = await reserveMediaUpload(engine, ownerActor(OWNER_A), {
        memorialId: MEMORIAL_A,
        purpose: "gallery",
        declaredMimeType: type,
      });

      expect(result).toEqual({ ok: false, code: "unsupported_format" });
    }

    expect(engine.mediaRepository.rows.size).toBe(0);
  });

  it("rejects an unknown purpose", async () => {
    const engine = createTestEngine();
    const result = await reserveMediaUpload(engine, ownerActor(OWNER_A), {
      memorialId: MEMORIAL_A,
      purpose: "banner" as never,
      declaredMimeType: "image/jpeg",
    });

    expect(result).toEqual({ ok: false, code: "invalid_file" });
    expect(engine.mediaRepository.rows.size).toBe(0);
  });
});

// =====================================================================
// FINALIZATION — the byte-level truth
// =====================================================================

describe("finalizeMediaUpload — accepting genuine photographs", () => {
  it.each([
    ["image/jpeg", JPEG_BYTES],
    ["image/png", PNG_BYTES],
    ["image/webp", WEBP_BYTES],
  ])("accepts a real %s", async (mimeType, bytes) => {
    const engine = createTestEngine();
    const reserved = await uploadedMedia(engine, { declaredMimeType: mimeType, bytes });

    const result = await finalizeMediaUpload(engine, ownerActor(OWNER_A), {
      memorialId: MEMORIAL_A,
      mediaId: reserved.mediaId,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe("ready");
    expect(result.value.mimeType).toBe(mimeType);
    expect(result.value.sizeBytes).toBe(bytes.length);
  });

  it("records the MEASURED size, not anything the client said", async () => {
    const engine = createTestEngine();
    const reserved = await uploadedMedia(engine, { bytes: JPEG_BYTES, sizeOverride: 4096 });

    const result = await finalizeMediaUpload(engine, ownerActor(OWNER_A), {
      memorialId: MEMORIAL_A,
      mediaId: reserved.mediaId,
    });

    expect(result.ok && result.value.sizeBytes).toBe(4096);
  });

  it("is idempotent — finalizing twice returns the same ready media", async () => {
    // A browser on a bad connection retries. That must not be punished.
    const engine = createTestEngine();
    const reserved = await uploadedMedia(engine, { bytes: JPEG_BYTES });

    const first = await finalizeMediaUpload(engine, ownerActor(OWNER_A), {
      memorialId: MEMORIAL_A,
      mediaId: reserved.mediaId,
    });
    const second = await finalizeMediaUpload(engine, ownerActor(OWNER_A), {
      memorialId: MEMORIAL_A,
      mediaId: reserved.mediaId,
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(first.ok && second.ok && second.value.id).toBe(first.ok ? first.value.id : "");
  });
});

describe("finalizeMediaUpload — a lying client", () => {
  it("refuses an SVG uploaded under an image/jpeg declaration", async () => {
    // The headline case: the declaration and the extension both say
    // JPEG, the bytes are a script host.
    const engine = createTestEngine();
    const reserved = await uploadedMedia(engine, {
      declaredMimeType: "image/jpeg",
      bytes: SVG_BYTES,
    });

    const result = await finalizeMediaUpload(engine, ownerActor(OWNER_A), {
      memorialId: MEMORIAL_A,
      mediaId: reserved.mediaId,
    });

    expect(result).toEqual({ ok: false, code: "invalid_file" });
  });

  it.each([
    ["a shell script", SCRIPT_BYTES],
    ["a ZIP archive", ZIP_BYTES],
    ["an MP4 video", MP4_BYTES],
    ["a HEIC photo", HEIC_BYTES],
  ])("refuses %s disguised as a JPEG", async (_label, bytes) => {
    const engine = createTestEngine();
    const reserved = await uploadedMedia(engine, { declaredMimeType: "image/jpeg", bytes });

    const result = await finalizeMediaUpload(engine, ownerActor(OWNER_A), {
      memorialId: MEMORIAL_A,
      mediaId: reserved.mediaId,
    });

    expect(result).toEqual({ ok: false, code: "invalid_file" });
  });

  it("refuses real PNG bytes uploaded under a JPEG declaration", async () => {
    // Both are allowlisted formats, so nothing dangerous was uploaded —
    // but the path says `.jpg` and the content is PNG. Refused so an
    // object's extension can never disagree with its bytes.
    const engine = createTestEngine();
    const reserved = await uploadedMedia(engine, {
      declaredMimeType: "image/jpeg",
      bytes: PNG_BYTES,
    });

    const result = await finalizeMediaUpload(engine, ownerActor(OWNER_A), {
      memorialId: MEMORIAL_A,
      mediaId: reserved.mediaId,
    });

    expect(result).toEqual({ ok: false, code: "invalid_file" });
  });

  it("leaves no row and no object behind after refusing", async () => {
    // A rejected upload must not become an orphan of either kind.
    const engine = createTestEngine();
    const reserved = await uploadedMedia(engine, {
      declaredMimeType: "image/jpeg",
      bytes: SVG_BYTES,
    });

    await finalizeMediaUpload(engine, ownerActor(OWNER_A), {
      memorialId: MEMORIAL_A,
      mediaId: reserved.mediaId,
    });

    expect(engine.mediaRepository.rows.has(reserved.mediaId)).toBe(false);
    expect(engine.objectStore.objects.has(reserved.storagePath)).toBe(false);
  });

  it("never marks a refused media ready", async () => {
    const engine = createTestEngine();
    const reserved = await uploadedMedia(engine, {
      declaredMimeType: "image/png",
      bytes: ZIP_BYTES,
    });

    await finalizeMediaUpload(engine, ownerActor(OWNER_A), {
      memorialId: MEMORIAL_A,
      mediaId: reserved.mediaId,
    });

    expect(engine.mediaRepository.rows.get(reserved.mediaId)?.status).not.toBe("ready");
  });
});

describe("finalizeMediaUpload — size", () => {
  it("refuses a file larger than the maximum", async () => {
    const engine = createTestEngine();
    const reserved = await uploadedMedia(engine, {
      bytes: JPEG_BYTES,
      sizeOverride: MAX_MEDIA_BYTES + 1,
    });

    const result = await finalizeMediaUpload(engine, ownerActor(OWNER_A), {
      memorialId: MEMORIAL_A,
      mediaId: reserved.mediaId,
    });

    expect(result).toEqual({ ok: false, code: "file_too_large" });
  });

  it("accepts a file exactly at the maximum", async () => {
    // The boundary is inclusive; an off-by-one here would reject a
    // legitimate photograph.
    const engine = createTestEngine();
    const reserved = await uploadedMedia(engine, {
      bytes: JPEG_BYTES,
      sizeOverride: MAX_MEDIA_BYTES,
    });

    const result = await finalizeMediaUpload(engine, ownerActor(OWNER_A), {
      memorialId: MEMORIAL_A,
      mediaId: reserved.mediaId,
    });

    expect(result.ok).toBe(true);
  });

  it("cleans up after refusing an oversized upload", async () => {
    const engine = createTestEngine();
    const reserved = await uploadedMedia(engine, {
      bytes: JPEG_BYTES,
      sizeOverride: MAX_MEDIA_BYTES + 1,
    });

    await finalizeMediaUpload(engine, ownerActor(OWNER_A), {
      memorialId: MEMORIAL_A,
      mediaId: reserved.mediaId,
    });

    expect(engine.objectStore.objects.size).toBe(0);
    expect(engine.mediaRepository.rows.size).toBe(0);
  });
});

describe("finalizeMediaUpload — an upload that never happened", () => {
  it("reports upload_incomplete when no object exists", async () => {
    const engine = createTestEngine();
    const reserved = await uploadedMedia(engine); // reserved, never uploaded

    const result = await finalizeMediaUpload(engine, ownerActor(OWNER_A), {
      memorialId: MEMORIAL_A,
      mediaId: reserved.mediaId,
    });

    expect(result).toEqual({ ok: false, code: "upload_incomplete" });
  });

  it("KEEPS the pending row so the sweep — not this call — decides its fate", async () => {
    // The user may still be retrying. Deleting the reservation here
    // would turn a slow upload into a permanent failure.
    const engine = createTestEngine();
    const reserved = await uploadedMedia(engine);

    await finalizeMediaUpload(engine, ownerActor(OWNER_A), {
      memorialId: MEMORIAL_A,
      mediaId: reserved.mediaId,
    });

    expect(engine.mediaRepository.rows.get(reserved.mediaId)?.status).toBe("pending");
  });

  it("reports upload_incomplete for a zero-byte object", async () => {
    const engine = createTestEngine();
    const reserved = await uploadedMedia(engine);
    engine.objectStore.objects.set(reserved.storagePath, new Uint8Array([]));

    const result = await finalizeMediaUpload(engine, ownerActor(OWNER_A), {
      memorialId: MEMORIAL_A,
      mediaId: reserved.mediaId,
    });

    expect(result).toEqual({ ok: false, code: "upload_incomplete" });
  });
});

describe("finalizeMediaUpload — ownership", () => {
  it("refuses Owner B finalizing Owner A's upload", async () => {
    const engine = createTestEngine();
    const reserved = await uploadedMedia(engine, { bytes: JPEG_BYTES });

    const result = await finalizeMediaUpload(engine, ownerActor(OWNER_B), {
      memorialId: MEMORIAL_A,
      mediaId: reserved.mediaId,
    });

    expect(result).toEqual({ ok: false, code: "access_denied" });
    expect(engine.mediaRepository.rows.get(reserved.mediaId)?.status).toBe("pending");
  });

  it("refuses a media id from another memorial, even for its real owner", async () => {
    // Owner B genuinely owns MEMORIAL_B and genuinely owns nothing in
    // MEMORIAL_A. Naming their own memorial with someone else's media
    // id must find nothing.
    const engine = createTestEngine();
    const reserved = await uploadedMedia(engine, { bytes: JPEG_BYTES });

    const result = await finalizeMediaUpload(engine, ownerActor(OWNER_B), {
      memorialId: MEMORIAL_B,
      mediaId: reserved.mediaId,
    });

    expect(result).toEqual({ ok: false, code: "access_denied" });
  });

  it("refuses a media that does not exist, with the same code", async () => {
    const engine = createTestEngine();
    const result = await finalizeMediaUpload(engine, ownerActor(OWNER_A), {
      memorialId: MEMORIAL_A,
      mediaId: "77777777-7777-4777-8777-777777777777",
    });

    expect(result).toEqual({ ok: false, code: "access_denied" });
  });
});

describe("finalizeMediaUpload — concurrency", () => {
  it("produces one winner when two finalizations race", async () => {
    // The compare-and-set in markReady. Both callers see success (the
    // loser re-reads and reports the same ready media), and the media
    // is finalized exactly once.
    const engine = createTestEngine();
    const reserved = await uploadedMedia(engine, { bytes: JPEG_BYTES });

    const [first, second] = await Promise.all([
      finalizeMediaUpload(engine, ownerActor(OWNER_A), {
        memorialId: MEMORIAL_A,
        mediaId: reserved.mediaId,
      }),
      finalizeMediaUpload(engine, ownerActor(OWNER_A), {
        memorialId: MEMORIAL_A,
        mediaId: reserved.mediaId,
      }),
    ]);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(engine.mediaRepository.rows.get(reserved.mediaId)?.status).toBe("ready");
  });

  it("cannot resurrect a reservation the sweep has already reclaimed", async () => {
    const engine = createTestEngine();
    const reserved = await uploadedMedia(engine, { bytes: JPEG_BYTES });

    // The sweep got there first.
    engine.mediaRepository.rows.delete(reserved.mediaId);

    const result = await finalizeMediaUpload(engine, ownerActor(OWNER_A), {
      memorialId: MEMORIAL_A,
      mediaId: reserved.mediaId,
    });

    expect(result.ok).toBe(false);
    expect(engine.mediaRepository.rows.has(reserved.mediaId)).toBe(false);
  });
});

describe("finalizeMediaUpload — a tampered stored path", () => {
  it("refuses to act on a row pointing outside its memorial", async () => {
    // A corrupted or tampered row must not redirect an authorized
    // operation at another family's object.
    const engine = createTestEngine();
    const reserved = await uploadedMedia(engine, { bytes: JPEG_BYTES });

    const row = engine.mediaRepository.rows.get(reserved.mediaId)!;
    engine.mediaRepository.rows.set(reserved.mediaId, {
      ...row,
      storagePath: `${MEMORIAL_B}/stolen/original.jpg`,
    });

    const result = await finalizeMediaUpload(engine, ownerActor(OWNER_A), {
      memorialId: MEMORIAL_A,
      mediaId: reserved.mediaId,
    });

    expect(result).toEqual({ ok: false, code: "storage_unavailable" });
  });
});

// =====================================================================
// HERO AND GALLERY ARE ONE ENGINE — section 15
// =====================================================================

describe("hero and gallery share one foundation", () => {
  it("uses the same primitives, paths and validation for both purposes", async () => {
    const engine = createTestEngine();

    const hero = await uploadedMedia(engine, { purpose: "hero", bytes: JPEG_BYTES });
    const gallery = await uploadedMedia(engine, { purpose: "gallery", bytes: JPEG_BYTES });

    // Same path shape, same memorial prefix — nothing about storage
    // differs.
    expect(hero.storagePath.startsWith(`${MEMORIAL_A}/`)).toBe(true);
    expect(gallery.storagePath.startsWith(`${MEMORIAL_A}/`)).toBe(true);
    expect(hero.storagePath).toMatch(/\/original\.jpg$/);
    expect(gallery.storagePath).toMatch(/\/original\.jpg$/);

    for (const media of [hero, gallery]) {
      const result = await finalizeMediaUpload(engine, ownerActor(OWNER_A), {
        memorialId: MEMORIAL_A,
        mediaId: media.mediaId,
      });
      expect(result.ok).toBe(true);
    }
  });

  it("applies the SAME refusal to a hero as to a gallery upload", async () => {
    // If hero had its own engine, this is where the two would drift.
    const engine = createTestEngine();

    for (const purpose of ["hero", "gallery"] as const) {
      const reserved = await uploadedMedia(engine, { purpose, bytes: SVG_BYTES });
      const result = await finalizeMediaUpload(engine, ownerActor(OWNER_A), {
        memorialId: MEMORIAL_A,
        mediaId: reserved.mediaId,
      });

      expect(result).toEqual({ ok: false, code: "invalid_file" });
    }
  });

  it("applies the same ownership refusal to a hero as to a gallery upload", async () => {
    const engine = createTestEngine();

    for (const purpose of ["hero", "gallery"] as const) {
      const result = await reserveMediaUpload(engine, ownerActor(OWNER_A), {
        memorialId: MEMORIAL_B,
        purpose,
        declaredMimeType: "image/jpeg",
      });

      expect(result).toEqual({ ok: false, code: "access_denied" });
    }
  });
});

// =====================================================================
// NO VIDEO — section 21
// =====================================================================

describe("no video reaches this foundation", () => {
  it("refuses every video type at reservation", async () => {
    const engine = createTestEngine();

    for (const type of ["video/mp4", "video/quicktime", "video/webm", "video/x-msvideo"]) {
      const result = await reserveMediaUpload(engine, ownerActor(OWNER_A), {
        memorialId: MEMORIAL_A,
        purpose: "gallery",
        declaredMimeType: type,
      });

      expect(result).toEqual({ ok: false, code: "unsupported_format" });
    }
  });

  it("refuses video bytes even when declared as an image", async () => {
    const engine = createTestEngine();
    const reserved = await uploadedMedia(engine, {
      declaredMimeType: "image/jpeg",
      bytes: MP4_BYTES,
    });

    const result = await finalizeMediaUpload(engine, ownerActor(OWNER_A), {
      memorialId: MEMORIAL_A,
      mediaId: reserved.mediaId,
    });

    expect(result).toEqual({ ok: false, code: "invalid_file" });
  });
});

// =====================================================================
// ERROR HYGIENE — section 19
// =====================================================================

describe("refusals leak nothing", () => {
  it("returns a bare code with no path, bucket, policy or SQL detail", async () => {
    const engine = createTestEngine();

    const denied = await reserveMediaUpload(engine, ownerActor(OWNER_A), {
      memorialId: MEMORIAL_B,
      purpose: "hero",
      declaredMimeType: "image/jpeg",
    });

    // A failure is exactly two fields. There is no field an
    // implementation could leak through.
    expect(Object.keys(denied)).toEqual(["ok", "code"]);
    expect(JSON.stringify(denied)).not.toContain("memorial-media");
    expect(JSON.stringify(denied)).not.toContain(MEMORIAL_B);
  });

  it("turns a repository outage into an opaque technical code", async () => {
    const engine = createTestEngine();
    engine.mediaRepository.failOn.createPending = new Error(
      'permission denied for table media (service_role) at memorial-media/secret',
    );

    const result = await reserveMediaUpload(engine, ownerActor(OWNER_A), {
      memorialId: MEMORIAL_A,
      purpose: "hero",
      declaredMimeType: "image/jpeg",
    });

    expect(result).toEqual({ ok: false, code: "storage_unavailable" });
    expect(JSON.stringify(result)).not.toContain("permission denied");
    expect(JSON.stringify(result)).not.toContain("service_role");
  });
});
