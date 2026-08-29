-- Mission 002: Memorials — the core entity. One row per purchased
-- memorial. See Mission 000/001 for the product rules behind every
-- constraint below.
create table memorials (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references owners (id),
  -- 1 entitlement -> exactly 1 memorial, enforced by NOT NULL + UNIQUE.
  entitlement_id uuid not null unique references entitlements (id),

  -- Mirrors config/memorial.ts. "pet" is not listed yet — see the
  -- comment there; adding it later is a single ALTER TABLE
  -- DROP/ADD CONSTRAINT, not a schema redesign.
  memorial_type text not null check (memorial_type in ('person')),
  editorial_context text not null check (editorial_context in ('announcement', 'remembrance')),
  -- Mirrors config/skins.ts.
  skin_id text not null check (skin_id in ('intemporel')),
  -- Mirrors config/languages.ts.
  language text not null check (language in ('en', 'fr', 'es')),

  -- Client-toggleable OPTIONAL sections only (mirrors
  -- types/memorial.ts Memorial.enabledSections). Hero and Death Notice
  -- are always-on socle sections, and the Footer is a permanent
  -- structural element outside the client's control entirely — neither
  -- is ever in this array. See config/sections.ts.
  --
  -- This CHECK validates against the UNION of optional ids across both
  -- editorial contexts. Which subset is actually valid for a given
  -- memorial's own editorial_context (e.g. "ceremony" only makes sense
  -- for "announcement") is enforced in application code
  -- (lib/sections.ts), not here — see supabase/README.md for why a
  -- cross-column CHECK was not added for this in V1.
  enabled_sections text[] not null default '{}'
    check (enabled_sections <@ array[
      'story', 'ceremony', 'traditions', 'gallery',
      'testimonials', 'condolences', 'video', 'memoryMessage'
    ]),

  -- Mirrors types/memorial.ts MemorialStatus.
  status text not null default 'draft'
    check (status in ('draft', 'ready', 'published', 'editing', 'archived')),

  -- Public URL slug (e.g. "prenom-nom-xxxxxx"). Generation logic is not
  -- built in Mission 002 — this column only reserves the uniqueness
  -- rule.
  slug text not null unique,

  -- Set once, the first time this memorial is published. Distinct from
  -- memorial_published_snapshots.published_at (the CURRENT publication
  -- time, which changes on republish) — this one never changes again
  -- after it is first set, and is what will trigger the Hero/name/dates
  -- lock (Mission 000 principle 15). Not built in Mission 002.
  first_published_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index memorials_owner_id_idx on memorials (owner_id);

-- Completes the entitlements <-> memorials relationship declared in
-- 20260829153000_entitlements.sql, now that both tables exist. This is
-- the normal way to handle two tables that reference each other: create
-- both without the second FK, then add it once both exist.
alter table entitlements
  add constraint entitlements_memorial_id_fkey
  foreign key (memorial_id) references memorials (id);

create trigger memorials_set_updated_at
  before update on memorials
  for each row
  execute function set_updated_at();

alter table memorials enable row level security;

-- Owner: full read/update access to their own memorials. No client-facing
-- INSERT or DELETE policy: a memorial is created by the (future) trusted
-- entitlement-redemption flow, not by a direct client insert, and
-- deletion is deliberately not a self-service action in V1 — see
-- supabase/README.md.
create policy memorials_select_own on memorials
  for select
  to authenticated
  using (owner_id = current_owner_id());

create policy memorials_update_own on memorials
  for update
  to authenticated
  using (owner_id = current_owner_id())
  with check (owner_id = current_owner_id());

-- Public: no policy is created here. A visitor never reads the
-- memorials row directly, even for a published memorial — they read
-- memorial_published_snapshots instead (next migration), which exposes
-- only published content, never status/owner_id/entitlement_id.

-- The next migration's public-read policy (on memorial_published_
-- snapshots) and the messages migration's public-insert policy both
-- need to check THIS table's status/enabled_sections for a memorial —
-- without ever granting a visitor direct SELECT on memorials (see
-- above). A plain EXISTS subquery from those policies would itself be
-- blocked by this table's own RLS, since the subquery runs as the
-- visitor's role too. The standard PostgreSQL fix is a narrow SECURITY
-- DEFINER function: it runs with the privileges of its owner (the
-- migration role, which owns this table and therefore bypasses its RLS)
-- and returns only the two columns those policies actually need — never
-- the full row.
create or replace function public_memorial_publication_state(p_memorial_id uuid)
returns table (status text, enabled_sections text[])
language sql
security definer
set search_path = public
stable
as $$
  select status, enabled_sections from memorials where id = p_memorial_id;
$$;

revoke all on function public_memorial_publication_state(uuid) from public;
grant execute on function public_memorial_publication_state(uuid) to anon, authenticated;
