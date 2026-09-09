import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  ALLOWED_IMAGE_MIME_TYPES,
  CANONICAL_IMAGE_EXTENSION,
  MAX_MEDIA_BYTES,
  MEDIA_BUCKET,
  MEDIA_PURPOSES,
  MEDIA_READ_URL_TTL_SECONDS,
  MEDIA_STATUSES,
  MEDIA_TYPES,
  MEDIA_PENDING_TTL_MS,
  SIGNED_UPLOAD_PERMISSION_TTL_MS,
} from "./media";

/**
 * Mission 030 — the constants in config/media.ts and the SQL in the
 * migration describe the SAME rules in two languages, and a drift
 * between them is a security hole rather than an inconsistency: a
 * bucket that accepts a format the domain rejects, or a size ceiling
 * that disagrees with the one Storage enforces.
 *
 * Nothing can make TypeScript and SQL share a literal, so this reads
 * the migration and asserts the agreement directly.
 */
const MIGRATION = readFileSync(
  path.resolve(
    import.meta.dirname,
    "..",
    "supabase",
    "migrations",
    "20260909120000_media_storage.sql",
  ),
  "utf8",
);

/**
 * The migration with its `--` comments stripped.
 *
 * The "must NOT contain" assertions below are about executable
 * statements, not prose — and this migration's comments discuss the
 * very things those assertions forbid (they explain at length why no
 * `create policy` on storage.objects exists, and why `anon` and
 * `authenticated` are granted nothing). Matching the raw text would
 * fail on the documentation of the correct decision, which is the
 * worst kind of test: one that punishes explaining yourself.
 */
const MIGRATION_SQL = MIGRATION.split("\n")
  .map((line) => {
    const comment = line.indexOf("--");
    return comment === -1 ? line : line.slice(0, comment);
  })
  .join("\n");

describe("the image allowlist", () => {
  it("is exactly JPEG, PNG and WebP", () => {
    expect([...ALLOWED_IMAGE_MIME_TYPES]).toEqual(["image/jpeg", "image/png", "image/webp"]);
  });

  it("matches the bucket's allowed_mime_types in the migration", () => {
    const declared = ALLOWED_IMAGE_MIME_TYPES.map((type) => `'${type}'`).join(", ");
    expect(MIGRATION).toContain(`array[${declared}]`);
  });

  it("contains no SVG, at either layer", () => {
    // An SVG is a script host. This is the single format that must
    // never appear in a family media foundation.
    expect(ALLOWED_IMAGE_MIME_TYPES).not.toContain("image/svg+xml");
    expect(MIGRATION_SQL).not.toContain("svg");
  });

  it("contains no HEIC/HEIF, which is a decision and not an omission", () => {
    // Nothing in this runtime can decode HEIC — see config/media.ts.
    for (const type of ["image/heic", "image/heif"]) {
      expect(ALLOWED_IMAGE_MIME_TYPES as readonly string[]).not.toContain(type);
      expect(MIGRATION_SQL).not.toContain(type);
    }
  });

  it("contains no video anywhere", () => {
    for (const type of ALLOWED_IMAGE_MIME_TYPES) {
      expect(type.startsWith("image/")).toBe(true);
    }
    expect(MIGRATION_SQL).not.toMatch(/'video\//);
  });

  it("gives every accepted type exactly one canonical extension", () => {
    for (const type of ALLOWED_IMAGE_MIME_TYPES) {
      expect(CANONICAL_IMAGE_EXTENSION[type]).toMatch(/^[a-z0-9]+$/);
    }

    // Distinct extensions, so a path's extension identifies its type
    // unambiguously.
    const extensions = Object.values(CANONICAL_IMAGE_EXTENSION);
    expect(new Set(extensions).size).toBe(extensions.length);
  });
});

describe("the size ceiling", () => {
  it("is 15 MiB", () => {
    expect(MAX_MEDIA_BYTES).toBe(15 * 1024 * 1024);
  });

  it("is the same number the bucket enforces", () => {
    // The domain check and the Storage check must not disagree: a
    // bucket that accepts more than the domain is a hole; one that
    // accepts less is a bug that only appears on a real project.
    expect(MIGRATION).toContain(`file_size_limit = ${MAX_MEDIA_BYTES}`);
  });

  it("comfortably accepts a normal smartphone photograph", () => {
    // A 48 MP phone JPEG lands around 5-9 MB.
    expect(MAX_MEDIA_BYTES).toBeGreaterThan(10 * 1024 * 1024);
  });

  it("is not so large that it invites abuse", () => {
    expect(MAX_MEDIA_BYTES).toBeLessThan(50 * 1024 * 1024);
  });
});

describe("the bucket", () => {
  it("is named memorial-media, and the migration creates that exact bucket", () => {
    expect(MEDIA_BUCKET).toBe("memorial-media");
    expect(MIGRATION).toContain(`'${MEDIA_BUCKET}'`);
  });

  it("is created private", () => {
    // The single most important line in the migration.
    expect(MIGRATION).toContain("values ('memorial-media', 'memorial-media', false)");
  });

  it("is corrected back to private even if it already exists", () => {
    // A bucket someone created by hand in the dashboard — possibly
    // public — must not be left as it is.
    expect(MIGRATION).toContain("on conflict (id) do update set public = false");
  });

  it("is never made public anywhere in the migration", () => {
    expect(MIGRATION_SQL).not.toMatch(/public\s*=\s*true/);
    expect(MIGRATION_SQL).not.toContain("getPublicUrl");
  });

  it("is the only bucket — no forest of buckets", () => {
    const insertions = MIGRATION_SQL.match(/insert into storage\.buckets/g) ?? [];
    expect(insertions).toHaveLength(1);
  });
});

describe("Storage policies", () => {
  it("creates NO policy on storage.objects", () => {
    // Model B: no client-role access at all. A policy appearing here
    // would be a change of security model, and it should not pass
    // unnoticed.
    expect(MIGRATION_SQL).not.toMatch(/create\s+policy/i);
  });

  it("grants no client role anything on media", () => {
    expect(MIGRATION_SQL).not.toMatch(/grant[^;]*\bto\s+(anon|authenticated)\b/i);
  });

  it("revokes media from every client role explicitly", () => {
    expect(MIGRATION).toContain(
      "revoke all privileges on table media from public, anon, authenticated;",
    );
  });

  it("opens exactly the four service_role privileges the engine needs", () => {
    expect(MIGRATION).toContain("grant select, insert, update, delete on table media to service_role;");
  });
});

describe("the closed vocabularies", () => {
  it("keeps media_type to photo — no video", () => {
    expect([...MEDIA_TYPES]).toEqual(["photo"]);
  });

  it("matches the purpose CHECK constraint", () => {
    expect([...MEDIA_PURPOSES]).toEqual(["hero", "gallery"]);
    const declared = MEDIA_PURPOSES.map((p) => `'${p}'`).join(", ");
    expect(MIGRATION).toContain(`check (purpose in (${declared}))`);
  });

  it("matches the status CHECK constraint", () => {
    expect([...MEDIA_STATUSES]).toEqual(["pending", "ready"]);
    const declared = MEDIA_STATUSES.map((s) => `'${s}'`).join(", ");
    expect(MIGRATION).toContain(`check (status in (${declared}))`);
  });

  it("defaults status to the SAFE value", () => {
    // A row written by a path that forgets to set this must be treated
    // as unverified, never as usable.
    expect(MIGRATION).toContain(`add column if not exists status text not null default 'pending'`);
  });
});

describe("the lifecycle windows", () => {
  it("gives an abandoned upload three hours before it is reclaimed", () => {
    expect(MEDIA_PENDING_TTL_MS).toBe(3 * 60 * 60 * 1000);
  });

  it("NEVER reclaims a reservation whose upload permission could still be used", () => {
    // THE invariant this pair of constants exists for.
    //
    // Supabase keeps a signed upload permission valid for two hours and
    // offers no way to shorten it. If the sweep ran sooner, a browser
    // could complete its upload AFTER the row and object were deleted,
    // producing an object no row records — an unrecoverable orphan, and
    // exactly what the anti-orphan design forbids.
    //
    // The first version of this constant was one hour and had that bug.
    // It could not be caught by a behavioural test, because the two
    // hours belong to the platform and nothing in this repository
    // declared them. Now they are declared, and the relationship is
    // checked here rather than trusted to a comment.
    expect(MEDIA_PENDING_TTL_MS).toBeGreaterThan(SIGNED_UPLOAD_PERMISSION_TTL_MS);
  });

  it("keeps a real safety margin, not a one-millisecond technicality", () => {
    // Room for clock skew between our runtime and Storage, and for a
    // permission issued a moment before the row was timestamped.
    const margin = MEDIA_PENDING_TTL_MS - SIGNED_UPLOAD_PERMISSION_TTL_MS;
    expect(margin).toBeGreaterThanOrEqual(60 * 60 * 1000);
  });

  it("still reclaims predictably rather than eventually", () => {
    expect(MEDIA_PENDING_TTL_MS).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
  });

  it("keeps a read URL short-lived", () => {
    // These are bearer credentials for a private object.
    expect(MEDIA_READ_URL_TTL_SECONDS).toBeGreaterThan(0);
    expect(MEDIA_READ_URL_TTL_SECONDS).toBeLessThanOrEqual(900);
  });

  it("declares no upload-permission TTL, because Storage does not accept one", () => {
    // A constant here would describe a setting HERITAGE cannot apply —
    // a lie about a security property. See
    // lib/adapters/media-object-store.ts.
    const source = readFileSync(path.resolve(import.meta.dirname, "media.ts"), "utf8");
    expect(source).not.toMatch(/export const MEDIA_UPLOAD_URL_TTL_SECONDS/);
  });
});

describe("the media table is reused, not replaced", () => {
  it("alters the Mission 002 table instead of creating a second one", () => {
    // No media_v2, no uploads table (mission brief, section 14).
    expect(MIGRATION).toContain("alter table media");
    expect(MIGRATION_SQL).not.toMatch(/create table (public\.)?(media_v2|uploads|media_objects)/i);
  });

  it("keeps a ready media's size mandatory", () => {
    expect(MIGRATION).toContain("check (status <> 'ready' or size_bytes is not null)");
  });

  it("adds no unique index that would break safe replacement", () => {
    // A "one ready hero per memorial" constraint would forbid the
    // overlap that keeps a family from losing their photograph.
    expect(MIGRATION_SQL).not.toMatch(/create unique index/i);
  });
});
