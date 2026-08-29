-- Mission 002: Owners — the person who manages a memorial.
--
-- auth_user_id is a nullable EXTERNAL REFERENCE to Supabase Auth's user
-- id (auth.users.id), not the owner's identity. HERITAGE's own `id` is
-- the identity every other table links to (e.g. memorials.owner_id ->
-- owners.id). This is deliberate: if HERITAGE ever moves off Supabase
-- Auth, only this one column (and how it gets populated) changes — no
-- other table is touched. There is intentionally no foreign key from
-- auth_user_id to auth.users: that would couple this schema to
-- Supabase's internal auth tables, which rule 7/10 of Mission 002 rule
-- out. See supabase/README.md.
--
-- auth_user_id is nullable because Mission 002 does not wire up real
-- authentication (magic link is a later mission). An Owner row can exist
-- — created by trusted server logic at entitlement-redemption time —
-- before the person has ever logged in.
create table owners (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid,
  email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One Supabase Auth user maps to at most one HERITAGE owner.
create unique index owners_auth_user_id_key on owners (auth_user_id) where auth_user_id is not null;

-- One person (by email) has at most one owner record, even if they buy
-- more than one memorial over time. Case-insensitive so casing alone
-- can't create a duplicate account.
create unique index owners_email_key on owners (lower(email));

create trigger owners_set_updated_at
  before update on owners
  for each row
  execute function set_updated_at();

-- Resolves the current request's HERITAGE owner id from the Supabase
-- Auth session, so RLS policies elsewhere don't each repeat this
-- subquery. Returns NULL when there is no session, or no matching owner
-- yet (anon/public requests, or a Supabase Auth user with no owner row).
create or replace function current_owner_id()
returns uuid
language sql
stable
as $$
  select id from owners where auth_user_id = auth.uid();
$$;

comment on function current_owner_id() is
  'HERITAGE owner id for the current session, resolved via owners.auth_user_id = auth.uid(). NULL if none. Used by RLS policies across tables instead of duplicating the lookup.';

alter table owners enable row level security;

-- An owner may read and update their own row only. There is
-- intentionally no client-facing INSERT policy: owner rows are created
-- by trusted server-side logic (entitlement redemption), never by a
-- direct client insert — see supabase/README.md.
create policy owners_select_own on owners
  for select
  to authenticated
  using (auth_user_id = auth.uid());

create policy owners_update_own on owners
  for update
  to authenticated
  using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());
