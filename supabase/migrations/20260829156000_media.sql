-- Mission 002: media metadata only. No actual upload happens in this
-- mission — storage_path is a reserved internal identifier, not backed
-- by an actual Supabase Storage object yet.
create table media (
  id uuid primary key default gen_random_uuid(),
  memorial_id uuid not null references memorials (id) on delete cascade,
  -- Denormalized from memorials.owner_id — kept here so RLS policies and
  -- queries on media don't need to join to memorials for every check. A
  -- plain, standard Postgres trade-off (a little redundancy for
  -- simpler/cheaper security checks), not Supabase-specific. Refreshed
  -- only if a memorial is ever transferred to a new owner (not built
  -- yet).
  owner_id uuid not null references owners (id),
  -- Internal HERITAGE identifier/path (e.g. "<memorial_id>/<media_id>"),
  -- NEVER a full Supabase Storage URL — see the portability rule in
  -- supabase/README.md. The actual public/signed URL is generated on
  -- read, from this path, by
  -- lib/adapters/supabase/media-storage-provider.ts.
  storage_path text not null unique,
  media_type text not null check (media_type in ('photo')),
  mime_type text not null,
  original_filename text,
  size_bytes bigint not null check (size_bytes > 0),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  created_at timestamptz not null default now()
);

create index media_memorial_id_idx on media (memorial_id);

alter table media enable row level security;

-- Owner: full control (read/insert/update/delete) over media on their
-- own memorials. No public policy: photos are not served by a direct
-- read of this metadata table — a future mission adds whatever public
-- read is actually needed (e.g. for a published gallery) once it exists
-- to consume it.
create policy media_all_own on media
  for all
  to authenticated
  using (owner_id = current_owner_id())
  with check (owner_id = current_owner_id());
