-- Mission 002: memorial content — draft and published, kept in two
-- SEPARATE TABLES rather than two columns on `memorials`.
--
-- Why two tables: this makes it structurally impossible for a public RLS
-- policy to leak draft content — the public read policy below only
-- exists on memorial_published_snapshots, a table that never holds
-- draft data. With both in one row, keeping that guarantee would need
-- column-level security (a view) instead of a plain row-level policy.
-- Two tables is the more standard-Postgres, more obviously-correct
-- option, so it's what Mission 002 uses.
--
-- Why JSONB, not one table/column per section: the per-section content
-- shape (Hero copy, gallery items, ...) is not designed yet — that is
-- Builder work for a later mission, and it will not be identical across
-- skins or contexts. A single JSONB payload keyed by section id lets
-- that shape evolve without a migration per change, while the section
-- IDS THEMSELVES stay governed by config/sections.ts and
-- lib/sections.ts, not by this column. A fully relational model (one
-- table per section) would lock in content shapes nothing has designed
-- yet, across six-plus tables, to solve a problem V1 does not have —
-- JSONB is the simplest option that stays maintainable.

create table memorial_drafts (
  memorial_id uuid primary key references memorials (id) on delete cascade,
  -- Keyed by section id (see types/memorial.ts MemorialContent). The
  -- content shape per section is not defined in Mission 002.
  content jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

create trigger memorial_drafts_set_updated_at
  before update on memorial_drafts
  for each row
  execute function set_updated_at();

-- Every memorial always has exactly one draft row, created the moment
-- the memorial itself is created — never as a separate client action.
-- This is a structural invariant (schema-level integrity), not Builder
-- logic: a plain BEFORE/AFTER INSERT trigger, not an Edge Function.
create or replace function create_memorial_draft()
returns trigger
language plpgsql
as $$
begin
  insert into memorial_drafts (memorial_id) values (new.id);
  return new;
end;
$$;

create trigger memorials_create_draft
  after insert on memorials
  for each row
  execute function create_memorial_draft();

alter table memorial_drafts enable row level security;

-- Draft content is never public. Owner only.
create policy memorial_drafts_select_own on memorial_drafts
  for select
  to authenticated
  using (memorial_id in (select id from memorials where owner_id = current_owner_id()));

create policy memorial_drafts_update_own on memorial_drafts
  for update
  to authenticated
  using (memorial_id in (select id from memorials where owner_id = current_owner_id()))
  with check (memorial_id in (select id from memorials where owner_id = current_owner_id()));

-- Published snapshot: at most ONE row per memorial — the current live
-- version, not a full version history (Mission 002 deliberately does
-- not build multi-version rollback). Republishing overwrites this row's
-- content/published_at; it never inserts a new one.
create table memorial_published_snapshots (
  memorial_id uuid primary key references memorials (id) on delete cascade,
  content jsonb not null,
  published_at timestamptz not null default now()
);

alter table memorial_published_snapshots enable row level security;

create policy memorial_published_snapshots_select_own on memorial_published_snapshots
  for select
  to authenticated
  using (memorial_id in (select id from memorials where owner_id = current_owner_id()));

-- Public: read-only, and only for a memorial whose status is
-- 'published'. This is the ONE table a visitor can read directly — no
-- public policy exists for INSERT/UPDATE/DELETE on it at all;
-- publication remains a trusted server action (not built in Mission
-- 002). Uses public_memorial_publication_state() (defined in
-- 20260829154000_memorials.sql) instead of querying memorials directly —
-- see the comment there.
create policy memorial_published_snapshots_select_public on memorial_published_snapshots
  for select
  to anon, authenticated
  using (
    exists (
      select 1 from public_memorial_publication_state(memorial_published_snapshots.memorial_id) s
      where s.status = 'published'
    )
  );
