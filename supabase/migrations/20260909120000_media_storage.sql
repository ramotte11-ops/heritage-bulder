-- Mission 030: the secure foundation for memorial media.
--
-- ---------------------------------------------------------------------
-- WHAT THIS MIGRATION DOES
-- ---------------------------------------------------------------------
--
--   1. creates ONE private Storage bucket, `memorial-media`;
--   2. teaches the existing `media` table the two things a real upload
--      lifecycle needs and it did not have: what a media is FOR
--      (hero/gallery) and whether its bytes have been VERIFIED yet
--      (pending/ready);
--   3. opens exactly the `media` privileges the server engine needs,
--      and not one more.
--
-- It creates NO policy on storage.objects, and that is the security
-- decision at the centre of this mission — see section 2.
--
-- ---------------------------------------------------------------------
-- 1. THE BUCKET: ONE, AND PRIVATE
-- ---------------------------------------------------------------------
--
-- ONE bucket for every family and every purpose, rather than one per
-- family or one per feature. A bucket is not the security boundary
-- here: isolation comes from paths being server-generated under a
-- memorial id, from ownership being proven before any path is handed
-- out, and from no client role holding any policy on this bucket at
-- all. A bucket per family would multiply objects to administer without
-- adding a single guarantee, and would put a per-family artefact in a
-- namespace that is global to the project.
--
-- PRIVATE, unconditionally. A published memorial will one day need to
-- show photographs to visitors who have no session, and the tempting
-- shortcut is to make this bucket public now and be done with it. That
-- would mean every ORIGINAL — the full-resolution, un-cropped,
-- un-normalized photograph a family uploaded — is readable by anyone
-- who can guess or is handed a URL, forever, including the ones they
-- later removed from the memorial. Publication is a separate problem
-- with a separate answer (a derived, deliberately-published variant),
-- and it is not solved today by opening the originals.
--
-- Guarded by to_regclass so this file also applies to a plain
-- PostgreSQL cluster that has no `storage` schema — which is exactly
-- what scripts/db/test-local.sh runs against, with a stand-in it
-- defines itself (never here, so it can never reach a real project).

do $$
declare
  has_size_limit boolean;
  has_mime_types boolean;
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'Mission 030: no storage schema on this cluster, skipping bucket creation.';
    return;
  end if;

  -- `public = false` is the whole point of the row. Written with an
  -- explicit ON CONFLICT so this migration is re-runnable, and so that
  -- a bucket someone created by hand in the dashboard — possibly
  -- PUBLIC — is corrected rather than silently left as it is.
  insert into storage.buckets (id, name, public)
  values ('memorial-media', 'memorial-media', false)
  on conflict (id) do update set public = false;

  -- file_size_limit and allowed_mime_types are enforced by Storage
  -- itself, at upload time, before the bytes are accepted. That matters
  -- because HERITAGE uploads go browser -> Storage directly, so this is
  -- the only limit that can stop an oversized or wrongly-typed transfer
  -- while it is still in flight; the application's own checks
  -- (lib/media/upload-lifecycle.ts) necessarily run afterwards.
  --
  -- Both are set through a catalogue check rather than named in the
  -- INSERT above, because these columns were added to storage.buckets
  -- later than the table itself and this migration must not fail on a
  -- project whose Storage version predates them. supabase/checks/
  -- 030_preflight.sql reports which of them actually exist before
  -- anything is applied.
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'storage' and table_name = 'buckets'
      and column_name = 'file_size_limit'
  ) into has_size_limit;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'storage' and table_name = 'buckets'
      and column_name = 'allowed_mime_types'
  ) into has_mime_types;

  -- 15 MiB = 15728640 bytes. Must stay equal to MAX_MEDIA_BYTES in
  -- config/media.ts — the two are asserted against each other by
  -- config/media.test.ts, because a bucket that accepts more than the
  -- domain does is a hole and a bucket that accepts less is a bug that
  -- only shows up on a real project.
  if has_size_limit then
    update storage.buckets set file_size_limit = 15728640 where id = 'memorial-media';
  else
    raise notice 'Mission 030: storage.buckets.file_size_limit absent, size enforced by the application only.';
  end if;

  -- The same allowlist as ALLOWED_IMAGE_MIME_TYPES in config/media.ts.
  -- Note what is NOT here: no image/svg+xml (an SVG is a script host),
  -- no HEIC/HEIF, no AVIF, no GIF, and nothing video — Mission 030 is
  -- an image foundation and admits no video at any layer.
  --
  -- This is a check on the content-type the CLIENT declares, so it is
  -- a filter, never proof. The proof is the byte-signature check at
  -- finalization (lib/media/image-signature.ts).
  if has_mime_types then
    update storage.buckets
      set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
      where id = 'memorial-media';
  else
    raise notice 'Mission 030: storage.buckets.allowed_mime_types absent, type enforced by the application only.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. NO POLICY ON storage.objects — THE MODEL, NOT AN OMISSION
-- ---------------------------------------------------------------------
--
-- The mission offered two models:
--
--   A. let `authenticated` reach storage.objects directly, fenced in by
--      Storage policies that re-derive ownership in SQL;
--   B. give client roles no access to storage.objects at all, and
--      perform every operation through server primitives that prove
--      ownership first.
--
-- This migration implements B, for reasons specific to this codebase
-- rather than general preference:
--
--   * It is the model already in force. Mission 013C closed every
--     client-role privilege on `media` and every other HERITAGE table,
--     and Mission 021B reopened three, one at a time, for one named
--     screen. Model A would be the first thing in this schema to grant
--     a client role access to a family's data on the strength of a
--     policy expression alone.
--
--   * Model A's policy would have to re-implement ownership in SQL:
--     parse the memorial id out of the object path, join to
--     `memorials`, compare to current_owner_id(). That is the SAME rule
--     as lib/auth/memorial-access.ts, expressed a second time, in a
--     second language, over a string split. Two implementations of one
--     authorization rule is one implementation and one future
--     divergence.
--
--   * Under B the browser never holds a credential that names the
--     bucket. What it receives is a token authorizing ONE object path
--     for a couple of minutes, minted after ownership was proven. There
--     is nothing to escalate: no session-wide read, no list, no
--     overwrite, no delete.
--
--   * `anon` gets nothing under either model, but under B that is
--     structural rather than policy-shaped.
--
-- So the absence of a `create policy` statement below is the
-- least-privilege choice, and it is enforced by RLS's own default: on a
-- Supabase project storage.objects has row-level security enabled, and
-- a bucket that no policy names is a bucket no client role can read,
-- write, list or delete. Access to the objects therefore happens ONLY
-- through `service_role`, which bypasses RLS, and only ever behind
-- lib/auth/memorial-access.ts.
--
-- HOW STORAGE DIFFERS FROM THE TABLE MODEL, stated explicitly as the
-- mission requires: for HERITAGE's own tables, privilege is the first
-- lock and RLS the second, and Mission 013C proved a policy is inert
-- without a grant. storage.objects is not ours — Supabase owns it,
-- grants the client roles table privileges on it as part of the
-- platform, and expects policies to be the only gate. We therefore do
-- NOT revoke anything on storage.objects: those grants are shared with
-- every Supabase-managed feature, revoking them is invisible in Git for
-- anyone reading only HERITAGE's schema, and it could break platform
-- behaviour unrelated to us. We rely on the gate Storage actually
-- uses — policies — and we create none.
--
-- The consequence worth naming for whoever picks this up: a permissive
-- policy on storage.objects added by ANY other means (the dashboard's
-- "New policy" button, a Supabase quickstart, another feature) would
-- apply to this bucket too, because storage policies are written
-- against one shared table. supabase/checks/030_preflight.sql lists
-- every existing policy on storage.objects for exactly that reason, and
-- 030_postflight.sql re-checks it after.

-- ---------------------------------------------------------------------
-- 3. `media` — REUSED, NOT REPLACED
-- ---------------------------------------------------------------------
--
-- The table from Mission 002 already models most of this correctly:
-- memorial ownership, a denormalized owner_id, a UNIQUE internal
-- storage_path, mime type, size, dimensions, timestamps. No
-- `media_v2`, no `uploads`, no second abstraction — this mission adds
-- the two columns a lifecycle needs and changes nothing else.

-- What a media is FOR.
--
-- Hero and Gallery are two values here, and that is the entire
-- difference between them at the storage layer: same bucket, same path
-- shape, same ownership check, same validation, same engine. This
-- column exists so a future Hero screen can find its photograph — not
-- so that hero and gallery media can be stored or secured differently.
--
-- DEFAULT 'gallery' so the statement is valid regardless of existing
-- rows. There are none — Mission 002 shipped this table with no upload
-- path at all, and nothing has ever written to it — but a migration
-- should not depend on that being true.
alter table media
  add column if not exists purpose text not null default 'gallery';

alter table media drop constraint if exists media_purpose_check;
alter table media
  add constraint media_purpose_check check (purpose in ('hero', 'gallery'));

comment on column media.purpose is
  'What this media is for: hero or gallery. Mirrors MEDIA_PURPOSES in config/media.ts. A label only — it never changes how the object is stored, pathed, authorized or validated (Mission 030).';

-- Whether the bytes have been VERIFIED.
--
--   pending  a path is reserved and an upload permission was issued.
--            No verified bytes exist. Nothing may display this.
--   ready    the object exists and the server has measured its size and
--            its ACTUAL content type from the file's own signature.
--
-- This is what makes "no orphans by design" true rather than hoped
-- for: the row is written before the upload permission is ever issued,
-- so every path HERITAGE hands out is recorded before it can be
-- written to. An abandoned upload is therefore never an unknown object
-- in a bucket — it is a known `pending` row that
-- lib/media/orphan-sweep.ts reclaims once it is older than the TTL.
--
-- DEFAULT 'pending' is deliberately the SAFE default: a row created by
-- any path that forgets to set this is treated as unverified, never as
-- usable.
alter table media
  add column if not exists status text not null default 'pending';

alter table media drop constraint if exists media_status_check;
alter table media
  add constraint media_status_check check (status in ('pending', 'ready'));

comment on column media.status is
  'Lifecycle state: pending (path reserved, bytes never verified) or ready (object verified). Mirrors MEDIA_STATUSES in config/media.ts. Nothing displays a pending media (Mission 030).';

-- size_bytes becomes NULLABLE, and that is a strengthening, not a
-- relaxation.
--
-- A reservation is created before the file exists, so its size is
-- genuinely unknown at that moment. The Mission 002 shape (NOT NULL,
-- > 0) left only two ways to write that row: invent a placeholder size,
-- or don't record the reservation at all — and the second is the one
-- that manufactures orphans. Recording an honest NULL and constraining
-- it at the state where it must be known is stricter than a placeholder
-- that lies.
alter table media alter column size_bytes drop not null;

-- The measured size is REQUIRED the moment a media becomes usable, so
-- there is no path to a `ready` media of unknown size.
--
-- The original inline `check (size_bytes > 0)` from Mission 002 is left
-- in place and still does its job: a CHECK evaluates to NULL — and
-- therefore passes — for a NULL input, so it constrains every size that
-- is actually recorded without obstructing a pending row.
alter table media drop constraint if exists media_ready_requires_size;
alter table media
  add constraint media_ready_requires_size
  check (status <> 'ready' or size_bytes is not null);

comment on column media.size_bytes is
  'Size in bytes, MEASURED from the stored object at finalization — never a value the client declared. NULL while pending (the file does not exist yet); NOT NULL once ready, enforced by media_ready_requires_size (Mission 030).';

comment on column media.mime_type is
  'While pending: the type the client DECLARED, used only to derive the path extension. Once ready: the type verified from the object''s own byte signature (lib/media/image-signature.ts). A finalization whose real type disagrees with the declared one is refused, so a ready row''s mime_type always matches both its bytes and its path (Mission 030).';

comment on column media.original_filename is
  'Kept from Mission 002 and deliberately NEVER written by the Mission 030 foundation. A client filename is attacker-controlled and routinely carries personal data ("papa-jean-dupont.jpg"); no product need for it has been established, and it is never any part of an object path. Left in place rather than dropped so the decision is reversible without a destructive migration.';

comment on column media.storage_path is
  'Internal HERITAGE path, "<memorial_id>/<media_id>/original.<ext>", generated by lib/media/media-path.ts from server-side UUIDs. NEVER a provider URL: the bucket is private, so a usable URL is a short-lived signed one minted per read and never stored (see supabase/README.md).';

-- Timestamps: `updated_at` is what makes a finalization visible in the
-- row itself, using the same helper and the same trigger shape as every
-- other HERITAGE table.
alter table media
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists media_set_updated_at on media;
create trigger media_set_updated_at
  before update on media
  for each row
  execute function set_updated_at();

-- The sweep's index.
--
-- Partial, on `pending` rows only, because that is the only thing the
-- sweep ever looks for and a `ready` media must never be a candidate.
-- It keeps the reclamation scan proportional to the number of
-- outstanding reservations rather than to the number of photographs
-- HERITAGE holds.
create index if not exists media_pending_created_at_idx
  on media (created_at)
  where status = 'pending';

-- Finding one memorial's media of one purpose — the Hero read and the
-- Gallery read, which are the same query with a different constant.
create index if not exists media_memorial_purpose_idx
  on media (memorial_id, purpose, status);

-- Note on a constraint that is deliberately ABSENT: there is no unique
-- index forcing at most one `ready` hero per memorial. It would look
-- like an invariant worth having and it would break safe replacement,
-- which REQUIRES the old and the new hero to be ready at the same
-- instant — that overlap is precisely what guarantees a family is never
-- left with no photograph when an upload fails
-- (lib/media/replace-media.ts). "Which hero is current" is therefore a
-- selection rule for the consumer (the most recently created ready
-- hero), not a storage constraint.

-- ---------------------------------------------------------------------
-- 4. PRIVILEGES
-- ---------------------------------------------------------------------
--
-- Mission 013C revoked everything on `media` from every application
-- role, including service_role, and left this note: "The mission that
-- wires an owner-facing screen opens the grant it needs, as a conscious
-- act". Mission 030 wires the media engine. This is that conscious act.
--
-- service_role gets four privileges because the engine performs four
-- operations, each traceable to a file:
--
--   SELECT  lib/media/read-media.ts (the owner's own media),
--           lib/media/upload-lifecycle.ts (finalization re-reads the
--           reservation), lib/media/orphan-sweep.ts (expired pendings)
--   INSERT  reserveMediaUpload creates the pending row
--   UPDATE  finalizeMediaUpload flips pending -> ready
--   DELETE  deleteMedia, and the sweep reclaiming an abandoned upload
--
-- DELETE is granted here where Mission 013C granted it nowhere, and the
-- difference is worth stating: a purchase record is history and must
-- not be removable by a server flow, but a photograph is a thing a
-- family is entitled to take back, and an abandoned reservation MUST be
-- removable or the "zero orphans" requirement cannot hold. It is
-- reachable only through deleteMedia (which proves ownership first,
-- against the memorial, before touching anything) and through the
-- sweep (which can only ever see `pending` rows).

grant select, insert, update, delete on table media to service_role;

-- anon and authenticated get NOTHING, exactly as before this migration.
--
-- Not an oversight, and not a deferral: no browser session reads or
-- writes `media` in this architecture. Every media operation goes
-- through a server primitive that proves ownership first, so a client
-- privilege here would be a second, weaker route to the same data.
--
-- The Mission 002 policy `media_all_own` is left exactly as it is:
-- correct, and inert while no grant exists. It is the second lock
-- behind a door whose first lock is closed, and it costs nothing to
-- keep for the day a mission genuinely needs a client-role read.
--
-- Stated as an executable fact rather than a comment, and re-asserted
-- by both the local harness and supabase/checks/030_postflight.sql:
revoke all privileges on table media from public, anon, authenticated;
