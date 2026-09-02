-- Mission 013C: the HERITAGE privilege model, made explicit.
--
-- ---------------------------------------------------------------------
-- WHY THIS MIGRATION EXISTS
-- ---------------------------------------------------------------------
--
-- Until now NO HERITAGE migration granted a single table privilege. The
-- schema relied entirely on the platform's implicit default privileges,
-- and a read-only diagnostic of the real Supabase project showed what
-- that actually produced:
--
--   * every HERITAGE table is owned by `postgres`;
--   * pg_default_acl holds two entries for public/tables — one FOR ROLE
--     `supabase_admin` granting everything to anon/authenticated/
--     service_role, and one FOR ROLE `postgres` granting only
--     MAINTAIN, REFERENCES, TRIGGER and TRUNCATE;
--   * tables created by `postgres` therefore inherit ONLY that second,
--     DML-less set.
--
-- So the default privileges did apply — they simply exclude SELECT,
-- INSERT, UPDATE and DELETE. Measured consequences on a cluster
-- reproducing that state exactly:
--
--   service_role  -> redeem_entitlement(...)   permission denied for table entitlements
--   authenticated -> select from memorials     permission denied for table owners
--   anon          -> select from snapshots     permission denied
--
-- Mission 011A's redemption RPC has therefore never been able to run
-- against the real project. Nothing revealed it because no code path is
-- wired and the tables hold zero rows. This is not a Mission 013
-- problem; Mission 013 is where it surfaced.
--
-- What the roles DID inherit is worse than what they did not. Measured,
-- reproducing the remote grants exactly: a role holding TRUNCATE but no
-- SELECT can still empty every table — `TRUNCATE` is not filtered by
-- row-level security. Both `anon` and `authenticated` could wipe all
-- seven tables while being unable to read a single row. PostgREST never
-- emits TRUNCATE and these roles are NOLOGIN, so it is not reachable
-- through the REST API today — but the protection rests on the shape of
-- the API surface rather than on the privilege model, which is exactly
-- what this migration fixes.
--
-- ---------------------------------------------------------------------
-- DOCTRINE
-- ---------------------------------------------------------------------
--
-- Security lives in Git, not in a hosting provider's defaults. Every
-- HERITAGE migration that creates a table states its privileges
-- explicitly: revoke everything, then grant only what a wired code path
-- provably needs today.
--
-- The platform's own ALTER DEFAULT PRIVILEGES are deliberately NOT
-- touched: they are shared with Supabase-managed objects, they are
-- invisible to Git, and they would not reproduce on a plain PostgreSQL
-- instance. Being explicit per table costs a few lines and is
-- deterministic everywhere.
--
-- This migration is written to be safely re-runnable, and to apply
-- whether or not 20260901180000_activation_keys.sql has been applied —
-- it names no column, so nothing here depends on activation_key_hash
-- existing.

-- ---------------------------------------------------------------------
-- 1. REVOKE EVERYTHING FROM EVERY APPLICATION ROLE, ON EVERY TABLE
-- ---------------------------------------------------------------------
--
-- `REVOKE ALL PRIVILEGES` rather than a named list on purpose: it
-- removes MAINTAIN on PostgreSQL 17+ without naming it, so this exact
-- statement also runs on PostgreSQL 16, where that privilege does not
-- exist yet. The local test harness runs 16; the real project runs 17+.
--
-- PUBLIC is named explicitly. It holds nothing today, and this
-- migration must not silently depend on that staying true.
--
-- service_role is revoked here too and re-granted narrowly below: the
-- point is that its access becomes a decision recorded in Git rather
-- than an inheritance.

revoke all privileges on table
  owners,
  entitlements,
  memorials,
  memorial_drafts,
  memorial_published_snapshots,
  media,
  messages
from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2. service_role — the server-side engine, and nothing more
-- ---------------------------------------------------------------------
--
-- Every privilege below was established by measurement, not convention:
-- each was added one at a time against a bare cluster until
-- redeem_entitlement() stopped failing, and no further.
--
--   owners        SELECT  resolve-owner.ts looks up by auth_user_id and
--                         by email (lib/entitlement/resolve-owner.ts)
--                 INSERT  creates the owner on a first redemption.
--                         `INSERT ... RETURNING` also needs SELECT.
--
--   entitlements  SELECT  redeem_entitlement()'s `SELECT ... FOR UPDATE`,
--                         findById, and the activation-key lookup
--                 UPDATE  consuming the right; the activation-key
--                         compare-and-swap
--                 INSERT  issuing a right with its key (Mission 013)
--
--   memorials     INSERT  created inside redeem_entitlement()
--                 SELECT  required TWICE over: by `INSERT ... RETURNING
--                         id`, and by the idempotent branch that returns
--                         an existing memorial to a retrying owner.
--                         Verified: without it, a retry fails.
--
-- DELETE is granted nowhere. No code path deletes, and a purchase record
-- is not something a server flow should be able to remove by accident.
--
-- memorial_drafts is deliberately absent: section 4 makes the draft
-- trigger SECURITY DEFINER, so no application role needs to write it.

grant select, insert on table owners to service_role;
grant select, insert, update on table entitlements to service_role;
grant select, insert on table memorials to service_role;

-- ---------------------------------------------------------------------
-- 3. anon / authenticated — nothing yet, deliberately
-- ---------------------------------------------------------------------
--
-- No client role receives any table privilege in this migration, and
-- that is a decision rather than an omission: nothing in this codebase
-- reads or writes these tables as a client role today. Every repository
-- that could is unwired, and the only Supabase client built in a
-- request path is the auth one.
--
-- The RLS policies stay exactly as they are. A policy without a grant is
-- inert, not broken — it is the second lock on a door whose first lock
-- is closed. The mission that wires an owner-facing screen opens the
-- grant it needs, as a conscious act, and the harness proves what is
-- open at any moment.
--
-- Two consequences worth naming for whoever picks this up:
--
--   * entitlements.activation_key_hash needs no special protection here.
--     `authenticated` holds no privilege on the table at all, so the
--     column is unreachable — which is stronger than a column-level
--     revoke, and cannot be undone by adding a column later.
--   * `messages_insert_public` (anon INSERT on a published memorial) is
--     likewise inert. It must stay that way until the mission that adds
--     rate limiting and moderation opens it — before the first
--     publication, never after.

-- ---------------------------------------------------------------------
-- 4. FUNCTIONS AND TRIGGERS
-- ---------------------------------------------------------------------
--
-- PostgreSQL grants EXECUTE on every new function to PUBLIC by default.
-- The diagnostic confirmed the consequence on the real project:
-- current_owner_id(), create_memorial_draft() and set_updated_at() are
-- all executable by anon, authenticated and service_role without anyone
-- having granted anything. Each is revoked below and re-granted only
-- where a caller was actually found.

-- current_owner_id() -> SECURITY DEFINER
--
-- It is a policy helper, not business logic. As SECURITY INVOKER it
-- reads `owners` with the caller's own rights, so every owner-scoped
-- policy silently required SELECT on `owners` — and without it a client
-- got `permission denied for table owners` while reading `memorials`,
-- an error rather than an empty result.
--
-- DEFINER removes that requirement entirely, and the escalation risk
-- normally attached to DEFINER does not exist here: the function takes
-- NO ARGUMENTS. It cannot be pointed at another row; it resolves
-- auth.uid() and nothing else. search_path is pinned, which was missing
-- and is what actually makes a DEFINER function safe. The table is
-- schema-qualified so resolution never depends on the caller's path.
--
-- This is the same reasoning that already made
-- public_memorial_publication_state() a DEFINER in Mission 002.

create or replace function current_owner_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.owners where auth_user_id = auth.uid();
$$;

comment on function current_owner_id() is
  'HERITAGE owner id for the current session, resolved via owners.auth_user_id = auth.uid(). NULL if none. SECURITY DEFINER (Mission 013C): it is a policy helper taking no arguments, so client roles need no privilege on `owners` for owner-scoped policies to evaluate.';

-- Only `authenticated` calls it. Established from the policies
-- themselves: every policy whose expression contains current_owner_id()
-- is declared `TO authenticated`. The two policies that also target
-- `anon` (memorial_published_snapshots_select_public,
-- messages_insert_public) call public_memorial_publication_state()
-- instead. service_role carries BYPASSRLS, so policies are never
-- evaluated for it at all.
revoke all on function current_owner_id() from public;
grant execute on function current_owner_id() to authenticated;

-- create_memorial_draft() -> SECURITY DEFINER
--
-- "every memorial has exactly one draft" is a schema invariant, and an
-- invariant must not depend on the privileges of whoever happens to
-- perform the INSERT. As INVOKER it did: measured, the redemption failed
-- with `permission denied for table memorial_drafts` until the calling
-- role was granted INSERT on a table no application code ever writes —
-- a privilege whose reason was invisible in the codebase.
--
-- As DEFINER the invariant holds for any caller, and no role needs that
-- grant. The function takes no caller-controlled input beyond `new.id`,
-- the row being inserted, and can only ever create the draft belonging
-- to it.

create or replace function create_memorial_draft()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.memorial_drafts (memorial_id) values (new.id);
  return new;
end;
$$;

comment on function create_memorial_draft() is
  'Creates the one draft row every memorial must have. SECURITY DEFINER (Mission 013C) so the invariant does not depend on the inserting role holding INSERT on memorial_drafts.';

-- A trigger function is invoked by the executor, not by a caller, so it
-- needs no EXECUTE grant at all.
revoke all on function create_memorial_draft() from public;

-- set_updated_at() stays SECURITY INVOKER: it touches no table, only the
-- NEW record, so it needs no privilege of its own. Its search_path is
-- pinned anyway — a function reached from five triggers should resolve
-- the same objects regardless of who fires it.

create or replace function set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function set_updated_at() from public;

-- public_memorial_publication_state() is deliberately untouched: it is
-- already SECURITY DEFINER with a pinned search_path, and its EXECUTE
-- grants to anon/authenticated are what let the two public policies
-- evaluate. Re-granting them here would only duplicate Mission 002.
--
-- redeem_entitlement() likewise stays SECURITY INVOKER. That is the
-- whole point: its underlying privileges are now explicit above rather
-- than ambient, which is exactly what an INVOKER function should rely
-- on. Its EXECUTE grant lives beside its definition in Mission 011A's
-- migration, as does the activation-key wrapper's in Mission 013's.
