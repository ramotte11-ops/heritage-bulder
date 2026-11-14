#!/usr/bin/env bash
#
# Local, account-free validation of the Mission 002 schema.
#
# Spins up a throwaway, vanilla PostgreSQL cluster (no Docker, no
# Supabase project, no network), applies every migration in
# supabase/migrations/ in order, then:
#   1. checks that the core integrity constraints actually reject bad
#      data (unique slug, unique entitlement<->memorial, enum/check
#      values, ...);
#   2. simulates Row Level Security isolation between two owners, and
#      between an owner and an anonymous visitor.
#
# IMPORTANT: this script creates a minimal STAND-IN for pieces Supabase
# normally provides for free on a real project — an `auth.uid()`
# function and the `anon`/`authenticated` roles with their default
# privileges. That stand-in is defined only in this script, never in
# supabase/migrations/, so it can never ship to a real Supabase project
# (which already has the real versions of both). See supabase/README.md.
#
# Usage: scripts/db/test-local.sh
# Requires: initdb, pg_ctl, psql, createdb (PostgreSQL 13+ client+server
# binaries — no Docker, no network, no account of any kind).

set -euo pipefail

# initdb refuses to run as root (by design — a PostgreSQL server should
# never run as the superuser OS account). If this script is invoked as
# root, re-exec it as the unprivileged `postgres` OS user created by the
# postgresql package instead of asking the caller to remember to do that.
if [ "$(id -u)" -eq 0 ]; then
  exec su postgres -c "bash '$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")'"
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MIGRATIONS_DIR="$REPO_ROOT/supabase/migrations"

# Locate the PostgreSQL server binaries (initdb/pg_ctl are not always on
# PATH on Debian/Ubuntu, which keeps them under /usr/lib/postgresql/<ver>/bin).
PG_BINDIR="$(dirname "$(command -v initdb 2>/dev/null || true)")"
if [ -z "$PG_BINDIR" ] || [ "$PG_BINDIR" = "." ]; then
  for d in /usr/lib/postgresql/*/bin; do
    if [ -x "$d/initdb" ]; then PG_BINDIR="$d"; fi
  done
fi
if [ -z "${PG_BINDIR:-}" ] || [ ! -x "$PG_BINDIR/initdb" ]; then
  echo "initdb not found. Install PostgreSQL server binaries to run this test." >&2
  exit 1
fi

PGDATA_DIR="$(mktemp -d)"
SOCKET_DIR="$PGDATA_DIR/socket"
mkdir -p "$SOCKET_DIR"
DB_NAME="heritage_mission002_test"
PASS=0
FAIL=0

cleanup() {
  "$PG_BINDIR/pg_ctl" -D "$PGDATA_DIR/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$PGDATA_DIR"
}
trap cleanup EXIT

echo "== Initializing throwaway PostgreSQL cluster in $PGDATA_DIR =="
"$PG_BINDIR/initdb" -D "$PGDATA_DIR/data" -U postgres --auth=trust >/dev/null

"$PG_BINDIR/pg_ctl" -D "$PGDATA_DIR/data" -o "-c listen_addresses='' -k $SOCKET_DIR" -l "$PGDATA_DIR/log" -w start

PSQL="psql -h $SOCKET_DIR -U postgres -v ON_ERROR_STOP=1 -X -q"

$PSQL -d postgres -c "create database $DB_NAME;"
DB="$PSQL -d $DB_NAME"

echo "== Creating Supabase stand-ins (auth.uid(), anon/authenticated roles) =="
$DB <<'SQL'
create schema auth;

-- Stand-in for Supabase's real auth.uid(): reads a session-local setting
-- this test script sets per simulated request. The real Supabase
-- implementation reads it from the request's verified JWT instead — the
-- RLS policies under test only call auth.uid(), never anything else, so
-- they behave identically against the real function.
create or replace function auth.uid() returns uuid
language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create role anon nologin;
create role authenticated nologin;

-- Stand-in for Supabase's real `service_role`, the server-side
-- privileged role the redemption RPCs are called with. BYPASSRLS is the
-- property that matters and the real one has it. Defined only in this
-- script, never in supabase/migrations/, because a real project already
-- provides it.
create role service_role nologin bypassrls;

-- PostgREST connects as `authenticator` and SET ROLEs into one of the
-- three above, so it is a member of all three on a real project.
create role authenticator nologin;
grant anon, authenticated, service_role to authenticator;

-- C3 fidelity: a real Supabase project ships pgcrypto pre-installed in its
-- own `extensions` schema, so 20260829150000_extensions.sql
-- (`create extension if not exists pgcrypto`) is a no-op there. Without
-- this stand-in, a vanilla cluster would install pgcrypto INTO public and
-- every one of its functions would be callable by PUBLIC — a state that
-- exists on no real project and that the C3 client allowlist rightly
-- refuses. No migration and no check calls a pgcrypto function.
create schema extensions;
create extension pgcrypto with schema extensions;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;

-- Mission 013C — THE FIDELITY FIX.
--
-- This script used to run
--   alter default privileges ... grant select, insert, update, delete
--     on tables to anon, authenticated, service_role;
-- and, after the migrations, a blanket
--   grant select, insert, update, delete on all tables in schema public
--     to anon, authenticated, service_role;
--
-- Between them they MANUFACTURED every privilege the HERITAGE
-- migrations never granted. That is why this suite was green for eleven
-- missions while the real project could not execute redeem_entitlement
-- at all. A harness that hands itself the privileges under test cannot
-- prove anything about them.
--
-- What replaces them reproduces what a read-only diagnostic actually
-- found on the real Supabase project: tables are created by `postgres`,
-- and the pg_default_acl entry that applies to objects created by
-- `postgres` grants the application roles everything EXCEPT the four DML
-- privileges. So they inherit REFERENCES, TRIGGER and TRUNCATE (plus
-- MAINTAIN on PostgreSQL 17+, which does not exist here — see the
-- version note in the Mission 013C checks) and no SELECT/INSERT/UPDATE/
-- DELETE whatsoever.
--
-- Starting from that state means the migrations must grant what the
-- application needs, and must revoke what the platform handed over. If
-- either stops happening, this suite goes red instead of quietly
-- passing.
-- ---------------------------------------------------------------------
-- Mission 030 stand-in: Supabase Storage's `storage` schema.
-- ---------------------------------------------------------------------
--
-- Same discipline as the auth.uid() stand-in above: defined ONLY here,
-- never in supabase/migrations/, so it can never ship to a real project
-- (which already has the genuine article, owned by
-- `supabase_storage_admin`).
--
-- It reproduces the two things Mission 030's migration actually touches
-- and the ones its assertions read:
--
--   * storage.buckets, with the `public`, `file_size_limit` and
--     `allowed_mime_types` columns the migration writes. This lets the
--     harness prove the bucket is genuinely created PRIVATE, with the
--     right ceiling and the right allowlist, rather than trusting that
--     the INSERT would have worked;
--   * storage.objects with RLS ENABLED and the client roles holding
--     table privileges. That combination is the fidelity that matters:
--     it is exactly the state a real Supabase project is in, and it is
--     what makes "no policy means no access" a measurable claim instead
--     of an assumption. If Mission 030 ever created a permissive policy
--     here, the assertions below would go green on access they should
--     refuse — so the harness starts from the permissive-grant state
--     and proves the policies are what close it.
--
-- Deliberately NOT reproduced: signed URL generation, the storage API,
-- object upload. Those are HTTP-layer behaviour with no SQL surface;
-- they are covered by the TypeScript suite against the port
-- (lib/adapters/media-object-store.ts).
create schema storage;

create table storage.buckets (
  id text primary key,
  name text not null unique,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz not null default now()
);

create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text,
  owner uuid,
  metadata jsonb,
  created_at timestamptz not null default now()
);

alter table storage.objects enable row level security;

-- The platform's own grants. Supabase hands the client roles table
-- privileges on storage.objects and relies on RLS policies as the only
-- gate — unlike HERITAGE's own tables, where Mission 013C made the
-- grant itself the first lock. Reproduced faithfully so the Mission 030
-- assertions measure the real question: with these privileges present,
-- does the absence of a policy actually deny?
grant usage on schema storage to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to anon, authenticated;
grant select on storage.buckets to anon, authenticated;
grant all on storage.objects to service_role;
grant all on storage.buckets to service_role;

alter default privileges in schema public
  grant references, trigger, truncate on tables
  to anon, authenticated, service_role;
SQL

# QG 008: a second throwaway database, cloned from the stand-ins and
# stopped at the last HERITAGE Direct M1-A migration. The read-only M1-A
# pre/postflights (supabase/verifications/m1a_*) grade THAT state, exactly as
# they would right after applying M1-A to a real project; QG 008's own
# checks grade the final state below. No check file is edited.
STANDINS_DB="heritage_standins_template"
$PSQL -d postgres -c "create database $STANDINS_DB template $DB_NAME;"
M1A_STATE_DB="heritage_m1a_state_test"
M1A_LAST_MIGRATION="20261024200000_heritage_direct_access_level_required.sql"
$PSQL -d postgres -c "create database $M1A_STATE_DB template $DB_NAME;"
DB_M1A="$PSQL -d $M1A_STATE_DB"

echo "== Applying migrations =="
for f in "$MIGRATIONS_DIR"/*.sql; do
  echo "  -> $(basename "$f")"
  $DB -f "$f"
  if [[ ! "$(basename "$f")" > "$M1A_LAST_MIGRATION" ]]; then
    $DB_M1A -f "$f" >/dev/null
  fi
done

# Nothing is granted here. Everything a role can do from this point on
# was decided by supabase/migrations/ — which is the entire point of
# Mission 013C. The privilege assertions immediately below run before
# any test-only grant, so they measure the migrations and nothing else.

check() {
  local desc="$1"; local expect="$2"; local actual="$3"
  if [ "$expect" = "$actual" ]; then
    echo "  [PASS] $desc"
    PASS=$((PASS + 1))
  else
    echo "  [FAIL] $desc (expected $expect, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

expect_error() {
  local desc="$1"; local sql="$2"
  if $DB -c "$sql" >/dev/null 2>"$PGDATA_DIR/last_error"; then
    echo "  [FAIL] $desc (expected an error, statement succeeded)"
    FAIL=$((FAIL + 1))
  else
    echo "  [PASS] $desc"
    PASS=$((PASS + 1))
  fi
}

echo ""
echo "== Mission 013C: the privilege model the migrations actually define =="

# These checks run BEFORE any other statement in this script touches a
# privilege. They therefore measure supabase/migrations/ and nothing
# else — which is exactly what eleven missions of green runs failed to
# do, because the bootstrap used to grant everything itself.

svc() {
  $DB -t -A -c "set role service_role; $*"
}

svc_expect_error() {
  local desc="$1"; local sql="$2"; local needle="$3"
  local out
  if out=$($DB -t -A -c "set role service_role; $sql" 2>&1); then
    echo "  [FAIL] $desc (expected an error, statement succeeded: $out)"
    FAIL=$((FAIL + 1))
  elif printf '%s' "$out" | grep -q "$needle"; then
    echo "  [PASS] $desc"
    PASS=$((PASS + 1))
  else
    echo "  [FAIL] $desc (errored, but not with '$needle': $(printf '%s' "$out" | tr '\n' ' '))"
    FAIL=$((FAIL + 1))
  fi
}

# --- PUBLIC holds nothing, anywhere -----------------------------------
for t in owners entitlements memorials memorial_drafts memorial_published_snapshots media messages; do
  HAS=$($DB -t -A -c "select coalesce((select true from aclexplode((select relacl from pg_class where oid='public.$t'::regclass)) a where a.grantee = 0 limit 1), false);")
  check "PUBLIC has no privilege on $t" "f" "$HAS"
done

# --- the platform's inherited non-DML privileges are gone --------------
# These are the ones nobody granted and nobody needs. TRUNCATE matters
# most: it is not filtered by row-level security, so a role holding it
# can empty a table it cannot even read.
PG_MAJOR=$($DB -t -A -c "select current_setting('server_version_num')::int / 10000;")
NON_DML="TRUNCATE REFERENCES TRIGGER"
if [ "$PG_MAJOR" -ge 17 ]; then
  NON_DML="$NON_DML MAINTAIN"
else
  echo "  [note] PostgreSQL $PG_MAJOR here: MAINTAIN does not exist yet and is not asserted."
  echo "         The real project runs 17+, where it does. 'revoke all privileges'"
  echo "         in 20260901190000 removes it there without naming it — but only a"
  echo "         remote postflight can prove that. This harness cannot."
fi
for t in owners entitlements memorials memorial_drafts memorial_published_snapshots media messages; do
  for role in anon authenticated service_role; do
    for p in $NON_DML; do
      HAS=$($DB -t -A -c "select has_table_privilege('$role','public.$t','$p');")
      check "$role has no $p on $t" "f" "$HAS"
    done
  done
done

# --- service_role: exactly the measured minimum, and no more ----------
expect_service_role() {
  local table="$1"; local privilege="$2"; local expected="$3"
  local has
  has=$($DB -t -A -c "select has_table_privilege('service_role','public.$table','$privilege');")
  check "service_role $privilege on $table" "$expected" "$has"
}
expect_service_role owners SELECT t
expect_service_role owners INSERT t
expect_service_role owners UPDATE f
expect_service_role owners DELETE f
expect_service_role entitlements SELECT t
expect_service_role entitlements INSERT t
expect_service_role entitlements UPDATE t
expect_service_role entitlements DELETE f
expect_service_role memorials SELECT t
expect_service_role memorials INSERT t
expect_service_role memorials UPDATE f
expect_service_role memorials DELETE f
# Not needed once create_memorial_draft() is SECURITY DEFINER — the
# invariant no longer depends on the inserting role's privileges.
expect_service_role memorial_drafts INSERT f
expect_service_role memorial_drafts SELECT f
# Mission 030: the media engine is wired, so `media` opens the four
# privileges its four operations need — and this is the assertion that
# keeps them to four.
#
#   SELECT  the owner's own media, finalization re-reading its
#           reservation, the sweep finding expired ones
#   INSERT  reserveMediaUpload writing the pending row
#   UPDATE  finalizeMediaUpload flipping pending -> ready
#   DELETE  deleteMedia, and the sweep reclaiming an abandoned upload
#
# DELETE is the one that differs from every other table here, where it
# is granted nowhere: a purchase record is history and must not be
# removable, but a photograph is something a family may take back, and
# an abandoned reservation MUST be removable or "zero orphans by
# design" cannot hold.
expect_service_role media SELECT t
expect_service_role media INSERT t
expect_service_role media UPDATE t
expect_service_role media DELETE t

# Tables whose features are not built: nothing is opened early.
for t in memorial_published_snapshots messages; do
  for p in SELECT INSERT UPDATE DELETE; do
    expect_service_role "$t" "$p" f
  done
done

# --- client roles: exactly what Mission 021B opened, and nothing else --
#
# Until Mission 021B every one of these was `f`: no client-role table
# privilege existed anywhere, because no wired code read these tables as
# `anon` or `authenticated`. The real Builder
# (app/builder/[memorialId]/page.tsx) is that reader, and
# 20260905160000_builder_owner_access.sql opens exactly three privileges
# for it. This block is the harness half of that decision: it measures
# the migrations, BEFORE this script grants anything of its own, so a
# fourth privilege appearing anywhere fails here.
expect_client() {
  local role="$1"; local table="$2"; local privilege="$3"; local expected="$4"
  local has
  has=$($DB -t -A -c "select has_table_privilege('$role','public.$table','$privilege');")
  check "$role $privilege on $table" "$expected" "$has"
}

# The three Mission 021B opened. Each is scoped further by an RLS policy
# resolving the caller's own owner id (proved in the RLS section below).
expect_client authenticated memorials SELECT t
expect_client authenticated memorial_drafts SELECT t
expect_client authenticated memorial_drafts UPDATE t

# Everything else on those two tables stays shut: no client INSERT on
# memorial_drafts (the SECURITY DEFINER trigger owns that invariant), no
# client write to `memorials` (the family's own choices are a later
# mission's Guided Flow), no DELETE anywhere.
expect_client authenticated memorials INSERT f
expect_client authenticated memorials UPDATE f
expect_client authenticated memorials DELETE f
expect_client authenticated memorial_drafts INSERT f
expect_client authenticated memorial_drafts DELETE f

# `anon` gained nothing at all: a visitor edits nothing.
for p in SELECT INSERT UPDATE DELETE; do
  expect_client anon memorials "$p" f
  expect_client anon memorial_drafts "$p" f
done

# memorial_published_snapshots stays closed to BOTH client roles. This is
# the assertion that keeps the Builder's read path narrow: the moment
# somebody reintroduces a composed read of all three memorial tables,
# they need this privilege, and this fails.
for role in anon authenticated; do
  for p in SELECT INSERT UPDATE DELETE; do
    expect_client "$role" memorial_published_snapshots "$p" f
  done
done

# The tables no client-facing feature touches yet.
for t in owners entitlements media messages; do
  for role in anon authenticated; do
    for p in SELECT INSERT UPDATE DELETE; do
      expect_client "$role" "$t" "$p" f
    done
  done
done

# --- Mission 035: exactly ONE more column-level grant, nothing wider --
#
# 20260910100000_builder_skin_variant_access.sql opens
# `UPDATE (skin_variant)` on `memorials` for `authenticated`, mirroring
# Missions 023/024's own `language`/`editorial_context` grants exactly.
# `has_table_privilege` above already proved `authenticated` holds no
# TABLE-WIDE UPDATE on `memorials` (line ~370) — this measures the
# COLUMN grant itself, before this script's own TEST-ONLY blanket UPDATE
# (below) would mask it. `language`/`editorial_context` are re-asserted
# here too, so a regression on either of Mission 023/024's own grants
# fails exactly where this mission's own grant is proved.
expect_column() {
  local role="$1"; local table="$2"; local column="$3"; local privilege="$4"; local expected="$5"
  local has
  has=$($DB -t -A -c "select has_column_privilege('$role','public.$table','$column','$privilege');")
  check "$role $privilege on $table.$column" "$expected" "$has"
}

expect_column authenticated memorials skin_variant UPDATE t
expect_column anon memorials skin_variant UPDATE f
expect_column authenticated memorials language UPDATE t
expect_column authenticated memorials editorial_context UPDATE t
# No other column widened by this mission's migration.
for col in owner_id entitlement_id memorial_type skin_id status slug enabled_sections created_at updated_at; do
  expect_column authenticated memorials "$col" UPDATE f
done

# --- Mission 019B: the Etsy seller credential store -------------------
#
# The strongest statement this harness can make about that table is that
# no client role holds ANY privilege on it. That is stronger than an RLS
# policy or a column-level revoke, and — unlike either — it keeps holding
# for every column a future migration adds.
SELLER_TABLE=$($DB -t -A -c "select count(*) from information_schema.tables where table_schema='public' and table_name='etsy_seller_credentials';")
if [ "$SELLER_TABLE" = "1" ]; then
  for role in anon authenticated; do
    for p in SELECT INSERT UPDATE DELETE TRUNCATE REFERENCES TRIGGER; do
      expect_client "$role" etsy_seller_credentials "$p" f
    done
  done

  # service_role gets exactly what the refresh algorithm needs and no
  # more. DELETE in particular is granted to nobody: losing this row
  # means re-bootstrapping the channel by hand, so no code path may be
  # able to remove it, not even by accident.
  expect_service_role etsy_seller_credentials SELECT t
  expect_service_role etsy_seller_credentials INSERT t
  expect_service_role etsy_seller_credentials UPDATE t
  expect_service_role etsy_seller_credentials DELETE f

  # RLS enabled with no policy at all — the second lock on a door the
  # grants already keep shut.
  SELLER_RLS=$($DB -t -A -c "select relrowsecurity from pg_class where oid='public.etsy_seller_credentials'::regclass;")
  check "etsy_seller_credentials has RLS enabled" "t" "$SELLER_RLS"
  SELLER_POLICIES=$($DB -t -A -c "select count(*) from pg_policies where schemaname='public' and tablename='etsy_seller_credentials';")
  check "etsy_seller_credentials carries no policy" "0" "$SELLER_POLICIES"

  # The singleton is enforced by the schema, not by the application: a
  # second row cannot be committed.
  $DB -c "insert into etsy_seller_credentials (refresh_token) values ('harness-token-1');" >/dev/null 2>&1
  SECOND_ROW=$($DB -t -A -c "insert into etsy_seller_credentials (refresh_token) values ('harness-token-2') on conflict do nothing returning 1;" 2>/dev/null)
  check "a second credential row cannot be inserted" "" "$SECOND_ROW"
  ROW_COUNT=$($DB -t -A -c "select count(*) from etsy_seller_credentials;")
  check "etsy_seller_credentials holds exactly one row" "1" "$ROW_COUNT"
  KEPT=$($DB -t -A -c "select refresh_token from etsy_seller_credentials;")
  check "the bootstrap never overwrote the stored credential" "harness-token-1" "$KEPT"
  $DB -c "delete from etsy_seller_credentials;" >/dev/null 2>&1
fi

# activation_key_hash is unreachable because the whole table is — which
# survives any column added later, unlike a column-level revoke.
HASH_COL=$($DB -t -A -c "select count(*) from information_schema.columns where table_schema='public' and table_name='entitlements' and column_name='activation_key_hash';")
if [ "$HASH_COL" = "1" ]; then
  for role in anon authenticated; do
    for p in SELECT UPDATE; do
      HAS=$($DB -t -A -c "select has_column_privilege('$role','public.entitlements','activation_key_hash','$p');")
      check "$role cannot $p entitlements.activation_key_hash" "f" "$HAS"
    done
  done
  SVC_HASH_READ=$($DB -t -A -c "select has_column_privilege('service_role','public.entitlements','activation_key_hash','SELECT');")
  check "service_role can read activation_key_hash (the engine needs it)" "t" "$SVC_HASH_READ"
fi

# --- functions: security mode, search_path, and who may execute -------
expect_function() {
  local fn="$1"; local secdef="$2"; local path="$3"
  local row
  row=$($DB -t -A -c "select p.prosecdef || ',' || coalesce(array_to_string(p.proconfig, ','), '(unset)') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='$fn';")
  check "$fn is security_definer=${secdef}, ${path}" "$secdef,$path" "$row"
}
# prosecdef renders as true/false here because it is concatenated into
# text, unlike has_*_privilege() above which is compared as a bare bool.
expect_function current_owner_id true search_path=public
expect_function create_memorial_draft true search_path=public
expect_function set_updated_at false search_path=public
# C3 (20261111100000_c3_secure_public_acl.sql, applied on Supabase B) replaced
# this helper with an empty search_path — stricter than `public`, every
# reference inside is schema-qualified. The "C3" section below checks the rest.
expect_function public_memorial_publication_state true 'search_path=""'
expect_function redeem_entitlement false search_path=public

expect_execute() {
  local fn="$1"; local role="$2"; local expected="$3"
  local has
  has=$($DB -t -A -c "select has_function_privilege('$role', p.oid, 'EXECUTE') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='$fn';")
  check "$role EXECUTE on $fn" "$expected" "$has"
}
# Only `authenticated` calls current_owner_id(): every policy whose
# expression uses it is declared TO authenticated. The two policies that
# also target anon call public_memorial_publication_state() instead, and
# service_role carries BYPASSRLS so no policy is ever evaluated for it.
expect_execute current_owner_id authenticated t
expect_execute current_owner_id anon f
expect_execute current_owner_id service_role f
# Trigger functions are invoked by the executor, never by a caller.
for role in anon authenticated service_role; do
  expect_execute create_memorial_draft "$role" f
  expect_execute set_updated_at "$role" f
done
expect_execute redeem_entitlement service_role t
expect_execute redeem_entitlement anon f
expect_execute redeem_entitlement authenticated f
expect_execute public_memorial_publication_state anon t
expect_execute public_memorial_publication_state authenticated t

for fn in current_owner_id create_memorial_draft set_updated_at redeem_entitlement; do
  PUB=$($DB -t -A -c "select coalesce((select true from aclexplode(p.proacl) a where a.grantee = 0 limit 1), false) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='$fn';")
  check "PUBLIC has no EXECUTE on $fn" "f" "$PUB"
done

# --- QG 004-B bench fixture ---------------------------------------------
# Publication, the « complet » upgrade and Etsy redemption now require
# HERITAGE's e-mail proof (owner_email_verifications, written in production
# only by record_owner_email_verification_v1 after a Supabase code check).
# The bench predates that rule and publishes for ~40 owners: every LINKED
# owner it creates is therefore auto-verified for its current address by a
# fixture that lives OUTSIDE public (no effect on any public ACL/posture
# check). The QG 004-B section at the end removes proofs explicitly to test
# the refusals. Owners without an Auth account are never auto-verified.
$DB -q <<'SQL'
create schema bench_fixture;
create function bench_fixture.autoverify_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.auth_user_id is not null then
    insert into public.owner_email_verifications (owner_id, auth_user_id, email_normalized, method)
    values (new.id, new.auth_user_id, lower(btrim(new.email)), 'email_otp')
    on conflict (owner_id) do update
       set auth_user_id = excluded.auth_user_id, email_normalized = excluded.email_normalized;
  end if;
  return new;
end;
$$;
create trigger zz_bench_autoverify_owner after insert or update of auth_user_id on public.owners
  for each row execute function bench_fixture.autoverify_owner();
SQL

# --- the parcours actually works with exactly these privileges --------
PM_OWNER=$($DB -t -A -c "insert into owners (auth_user_id, email) values (gen_random_uuid(), 'privmodel@example.test') returning id;")
PM_ENT=$($DB -t -A -c "insert into entitlements (access_level, source, offer_id) values ('complet', 'direct','intemporel') returning id;")
PM_OUT=$(svc "select outcome from redeem_entitlement('$PM_ENT','$PM_OWNER','person','intemporel','light');")
check "redeem_entitlement succeeds as service_role with ONLY the granted privileges" "redeemed" "$PM_OUT"

PM_DRAFTS=$($DB -t -A -c "select count(*) from memorial_drafts d join memorials m on m.id = d.memorial_id where m.entitlement_id = '$PM_ENT';")
check "the SECURITY DEFINER trigger created exactly one draft, with no INSERT grant" "1" "$PM_DRAFTS"

PM_RETRY=$(svc "select outcome from redeem_entitlement('$PM_ENT','$PM_OWNER','person','intemporel','light');")
check "the idempotent retry works too (it needs SELECT on memorials)" "already_redeemed" "$PM_RETRY"

svc_expect_error "service_role still cannot DELETE an entitlement" \
  "delete from entitlements where id = '$PM_ENT';" "permission denied"

svc_expect_error "service_role still cannot TRUNCATE a table" \
  "truncate messages;" "permission denied"

$DB -c "delete from memorial_drafts where memorial_id in (select id from memorials where entitlement_id = '$PM_ENT'); delete from memorials where entitlement_id = '$PM_ENT'; delete from entitlements where id = '$PM_ENT'; delete from owners where id = '$PM_OWNER';" >/dev/null

# ----------------------------------------------------------------------
# TEST-ONLY GRANTS — never part of any migration
# ----------------------------------------------------------------------
# The migrations grant client roles nothing, because no wired code reads
# these tables as anon or authenticated yet. The RLS policies are in
# place regardless and their correctness still has to be proven, which
# needs the privilege they sit on top of.
#
# These grants exist ONLY in this script. Everything above has already
# asserted that no migration produced them, so they cannot mask a
# regression.
#
# Mission 021B: three of them are gone from this list because they are no
# longer test-only — `authenticated` now really holds SELECT on
# memorials and SELECT+UPDATE on memorial_drafts, from
# 20260905160000_builder_owner_access.sql, and the block above asserts
# exactly that. Re-granting them here would hide the day a migration
# stops granting them.
#
# memorial_published_snapshots is deliberately NOT granted to
# `authenticated` either, test-only or otherwise: nothing reads it as an
# owner (the Builder's read path never touches that table — Mission
# 021B), so a grant here would only manufacture a privilege the real
# system does not have.
$DB -c "grant select on table owners, media, messages to authenticated;" >/dev/null
$DB -c "grant update on table memorials, media, messages to authenticated;" >/dev/null
$DB -c "grant insert, delete on table media to authenticated;" >/dev/null
$DB -c "grant delete on table messages to authenticated;" >/dev/null
$DB -c "grant select on table memorial_published_snapshots to anon;" >/dev/null
$DB -c "grant insert on table messages to anon;" >/dev/null
# anon SELECT on memorials/memorial_drafts is granted here for one
# reason only: the RLS assertions further down prove that the POLICIES
# return zero rows to a visitor. Without the underlying privilege those
# assertions would degrade into "permission denied" — which proves the
# privilege model (already asserted above, before any grant) and stops
# proving the policies. Granting the privilege here keeps both proofs:
# the migrations grant nothing, AND the policies leak nothing if a
# future mission ever does grant it.
$DB -c "grant select on table memorials, memorial_drafts to anon;" >/dev/null
# Same reasoning for entitlements, with one addition: Mission 013's
# assertions prove that activation_key_hash stays unreachable even for a
# role that CAN read the row it belongs to. That is only a real test if
# the role can read the row. The grant below is the column allowlist a
# future owner-facing screen would need — deliberately NOT including
# activation_key_hash — so those assertions keep measuring the column
# boundary and the entitlements_select_own policy instead of collapsing
# into "permission denied".
$DB -c "grant select (id, source, offer_id, status, owner_id, redeemed_at, created_at, updated_at) on table entitlements to authenticated;" >/dev/null

echo "== Seeding local-only test fixtures (not real data, never used by the app) =="
OWNER_A=$($DB -t -A -c "insert into owners (auth_user_id, email) values (gen_random_uuid(), 'owner-a@example.test') returning id;")
OWNER_B=$($DB -t -A -c "insert into owners (auth_user_id, email) values (gen_random_uuid(), 'owner-b@example.test') returning id;")
AUTH_UID_A=$($DB -t -A -c "select auth_user_id from owners where id = '$OWNER_A';")
AUTH_UID_B=$($DB -t -A -c "select auth_user_id from owners where id = '$OWNER_B';")

ENT_A=$($DB -t -A -c "insert into entitlements (access_level, source, offer_id) values ('complet', 'etsy', 'intemporel') returning id;")
ENT_B=$($DB -t -A -c "insert into entitlements (access_level, source, offer_id) values ('complet', 'etsy', 'intemporel') returning id;")

MEM_A=$($DB -t -A -c "insert into memorials (owner_id, entitlement_id, memorial_type, editorial_context, skin_id, skin_variant, language, slug, status) values ('$OWNER_A', '$ENT_A', 'person', 'announcement', 'intemporel', 'light', 'en', 'test-memorial-a-1x2y3z', 'published') returning id;")
MEM_B=$($DB -t -A -c "insert into memorials (owner_id, entitlement_id, memorial_type, editorial_context, skin_id, skin_variant, language, slug, status) values ('$OWNER_B', '$ENT_B', 'person', 'remembrance', 'intemporel', 'light', 'en', 'test-memorial-b-4a5b6c', 'draft') returning id;")

$DB -c "insert into memorial_published_snapshots (memorial_id, content) values ('$MEM_A', '{\"hero\": {\"name\": \"Test\"}}');" >/dev/null

# Simulate a completed redemption for entitlement A (the future
# redemption flow's job, not built in Mission 002). No memorial_id to
# set on entitlements anymore (Mission 002 correction) — the link is
# memorials.entitlement_id alone.
$DB -c "update entitlements set status = 'redeemed', owner_id = '$OWNER_A', redeemed_at = now() where id = '$ENT_A';" >/dev/null

echo ""
echo "== Integrity constraint checks =="

expect_error "duplicate slug is rejected" \
  "insert into memorials (owner_id, entitlement_id, memorial_type, editorial_context, skin_id, skin_variant, language, slug) values ('$OWNER_A', '$ENT_A', 'person', 'announcement', 'intemporel', 'light', 'en', 'test-memorial-a-1x2y3z');"

expect_error "invalid status value is rejected" \
  "update memorials set status = 'not-a-real-status' where id = '$MEM_A';"

expect_error "invalid skin_id is rejected" \
  "update memorials set skin_id = 'not-a-real-skin' where id = '$MEM_A';"

expect_error "invalid offer_id is rejected" \
  "insert into entitlements (access_level, source, offer_id) values ('complet', 'etsy', 'not-a-real-offer');"

expect_error "entitlements.skin_id no longer exists (Mission 006: skin lives on memorials only)" \
  "select skin_id from entitlements limit 1;"

expect_error "invalid enabled_sections value is rejected" \
  "update memorials set enabled_sections = array['not-a-real-section'] where id = '$MEM_A';"

expect_error "a second memorial cannot claim the same entitlement (single source of truth: memorials.entitlement_id)" \
  "insert into memorials (owner_id, entitlement_id, memorial_type, editorial_context, skin_id, skin_variant, language, slug) values ('$OWNER_A', '$ENT_A', 'person', 'announcement', 'intemporel', 'light', 'en', 'test-memorial-a-collision');"

expect_error "memorial without an owner is rejected" \
  "insert into memorials (entitlement_id, memorial_type, editorial_context, skin_id, skin_variant, language, slug) values ('$ENT_A', 'person', 'announcement', 'intemporel', 'light', 'en', 'test-memorial-no-owner');"

expect_error "invalid skin_variant is rejected" \
  "update memorials set skin_variant = 'not-a-real-variant' where id = '$MEM_A';"

# A fresh, still-unclaimed entitlement so this test's error can only come
# from the missing skin_variant itself — never from the entitlement_id
# collision the two tests above are already exercising.
ENT_NO_VARIANT=$($DB -t -A -c "insert into entitlements (access_level, source, offer_id) values ('complet', 'etsy', 'intemporel') returning id;")
expect_error "missing skin_variant is rejected (NOT NULL, no DEFAULT — Mission 029B)" \
  "insert into memorials (owner_id, entitlement_id, memorial_type, editorial_context, skin_id, language, slug) values ('$OWNER_A', '$ENT_NO_VARIANT', 'person', 'announcement', 'intemporel', 'en', 'test-memorial-missing-variant');"

DRAFT_COUNT=$($DB -t -A -c "select count(*) from memorial_drafts where memorial_id in ('$MEM_A', '$MEM_B');")
check "a draft row was auto-created for every memorial" "2" "$DRAFT_COUNT"

# Mission 002 correction: entitlements no longer stores memorial_id at
# all — memorials.entitlement_id is the only pointer. Confirm the
# canonical lookup direction actually works.
FOUND_MEMORIAL=$($DB -t -A -c "select id from memorials where entitlement_id = '$ENT_A';")
check "entitlement A's memorial is found via memorials.entitlement_id (the single source of truth)" "$MEM_A" "$FOUND_MEMORIAL"

FOUND_MEMORIAL_B=$($DB -t -A -c "select id from memorials where entitlement_id = '$ENT_B';")
check "entitlement B's memorial is likewise found via memorials.entitlement_id" "$MEM_B" "$FOUND_MEMORIAL_B"

echo ""
echo "== Row Level Security checks =="

as_owner() {
  local auth_uid="$1"; shift
  $DB -t -A -c "set role authenticated; set local request.jwt.claim.sub = '$auth_uid'; $*"
}

as_anon() {
  $DB -t -A -c "set role anon; set local request.jwt.claim.sub = ''; $*"
}

RESULT=$(as_owner "$AUTH_UID_A" "select count(*) from memorials;")
check "owner A sees exactly their own 1 memorial (not owner B's)" "1" "$RESULT"

RESULT=$(as_owner "$AUTH_UID_A" "select id from memorials limit 1;")
check "owner A's visible memorial is their own" "$MEM_A" "$RESULT"

as_owner "$AUTH_UID_A" "update memorials set language = 'fr' where id = '$MEM_B';" >/dev/null
UPDATED=$($DB -t -A -c "select language from memorials where id = '$MEM_B';")
check "owner A's update to owner B's memorial silently affects 0 rows" "en" "$UPDATED"

# Mission 035 — the same `memorials_update_own` policy, exercised over
# `skin_variant` instead of `language`. Uses the same test-only blanket
# UPDATE grant as the block above (line ~545): the structural proof that
# ONLY `skin_variant` (plus the pre-existing `language`/
# `editorial_context`) is actually grantable already ran, before that
# blanket grant, in the "Mission 035" privilege block. This is the
# POLICY's own isolation, not the grant's shape.
$DB -c "update memorials set status = 'ready' where id = '$MEM_A';" >/dev/null
as_owner "$AUTH_UID_A" "update memorials set skin_variant = 'dark' where id = '$MEM_A';" >/dev/null
UPDATED_VARIANT_A=$($DB -t -A -c "select skin_variant from memorials where id = '$MEM_A';")
check "owner A can update their own memorial's skin_variant" "dark" "$UPDATED_VARIANT_A"

as_owner "$AUTH_UID_A" "update memorials set skin_variant = 'dark' where id = '$MEM_B';" >/dev/null
UPDATED_VARIANT_B=$($DB -t -A -c "select skin_variant from memorials where id = '$MEM_B';")
check "owner A's update to owner B's skin_variant silently affects 0 rows" "light" "$UPDATED_VARIANT_B"

# anon holds no UPDATE privilege on memorials at all (proved structurally
# above, before any grant) — confirmed here as an outright permission
# error, never a silent no-op, for the exact column T08 writes.
as_anon "update memorials set skin_variant = 'dark' where id = '$MEM_A';" >"$PGDATA_DIR/anon_skin_variant_out" 2>&1 && {
  echo "  [FAIL] anon cannot UPDATE memorials.skin_variant at all (statement unexpectedly succeeded)"
  FAIL=$((FAIL + 1))
} || {
  if grep -q "permission denied" "$PGDATA_DIR/anon_skin_variant_out"; then
    echo "  [PASS] anon cannot UPDATE memorials.skin_variant at all"
    PASS=$((PASS + 1))
  else
    echo "  [FAIL] anon cannot UPDATE memorials.skin_variant at all (errored, but not with 'permission denied': $(tr '\n' ' ' <"$PGDATA_DIR/anon_skin_variant_out"))"
    FAIL=$((FAIL + 1))
  fi
}
ANON_LEFT_VARIANT=$($DB -t -A -c "select skin_variant from memorials where id = '$MEM_A';")
check "anon's refused attempt left skin_variant untouched" "dark" "$ANON_LEFT_VARIANT"

# Reset MEM_A back to 'light' — later assertions in this script (e.g.
# the seeded-fixture shape checks) assume the original seeded value.
$DB -c "update memorials set skin_variant = 'light' where id = '$MEM_A';" >/dev/null

RESULT=$(as_owner "$AUTH_UID_A" "select count(*) from memorial_drafts;")
check "owner A sees exactly their own 1 draft (not owner B's)" "1" "$RESULT"

# Mission 007: prove the autosave foundation's actual write path — RLS
# already granted this (memorial_drafts_update_own), no migration
# needed, but nothing had exercised it as an UPDATE before this mission.
as_owner "$AUTH_UID_A" "update memorial_drafts set content = '{\"hero\": {\"title\": \"Autosaved\"}}' where memorial_id = '$MEM_A';" >/dev/null
DRAFT_CONTENT=$($DB -t -A -c "select content->'hero'->>'title' from memorial_drafts where memorial_id = '$MEM_A';")
check "owner A can autosave their own memorial's draft content" "Autosaved" "$DRAFT_CONTENT"

as_owner "$AUTH_UID_A" "update memorial_drafts set content = '{\"hero\": {\"title\": \"Hijacked\"}}' where memorial_id = '$MEM_B';" >/dev/null
DRAFT_CONTENT_B=$($DB -t -A -c "select content from memorial_drafts where memorial_id = '$MEM_B';")
check "owner A's attempt to autosave owner B's draft silently affects 0 rows" "{}" "$DRAFT_CONTENT_B"

# Mission 008: prove the read path (getDraftContent) at the RLS level,
# symmetrically to Mission 007's write-path proof above — RLS already
# granted this (memorial_drafts_select_own), no migration needed, but
# nothing had read draft *content* as the scoped owner role before now.
READ_OWN=$(as_owner "$AUTH_UID_A" "select content->'hero'->>'title' from memorial_drafts where memorial_id = '$MEM_A';")
check "owner A can read their own memorial's draft content" "Autosaved" "$READ_OWN"

READ_OTHERS=$(as_owner "$AUTH_UID_A" "select count(*) from memorial_drafts where memorial_id = '$MEM_B';")
check "owner A cannot read owner B's draft at all (0 rows, not an error)" "0" "$READ_OTHERS"

# The legacy RLS write checks above model prepublication. Restore the fixture's
# published status before exercising public snapshots and visitor messages.
$DB -c "update memorials set status = 'published' where id = '$MEM_A';" >/dev/null

RESULT=$(as_anon "select count(*) from memorial_published_snapshots;")
check "anonymous visitor sees the 1 published snapshot (memorial A)" "1" "$RESULT"

RESULT=$(as_anon "select count(*) from memorial_drafts;")
check "anonymous visitor never sees any draft row" "0" "$RESULT"

RESULT=$(as_anon "select count(*) from memorials;")
check "anonymous visitor sees no memorials rows directly (no public policy at all)" "0" "$RESULT"

RESULT=$(as_owner "$AUTH_UID_B" "select count(*) from owners;")
check "owner B sees exactly their own 1 owners row" "1" "$RESULT"

as_anon "insert into messages (memorial_id, message_type, author_name, content) values ('$MEM_A', 'condolence', 'A Visitor', 'Thinking of you.');" >/dev/null 2>"$PGDATA_DIR/last_error" || true
COND_COUNT=$($DB -t -A -c "select count(*) from messages where memorial_id = '$MEM_A';")
check "anonymous condolence is rejected while 'condolences' is not an enabled section" "0" "$COND_COUNT"

$DB -c "update memorials set enabled_sections = array['condolences'] where id = '$MEM_A';" >/dev/null
as_anon "insert into messages (memorial_id, message_type, author_name, content) values ('$MEM_A', 'condolence', 'A Visitor', 'Thinking of you.');" >/dev/null
COND_COUNT=$($DB -t -A -c "select count(*) from messages where memorial_id = '$MEM_A';")
check "anonymous condolence is accepted once 'condolences' is enabled on a published memorial" "1" "$COND_COUNT"
check "QG 008: the accepted condolence waits for moderation (visible = false)" "f" "$($DB -t -A -c "select bool_or(visible) from messages where memorial_id = '$MEM_A';")"

as_anon "insert into messages (memorial_id, message_type, author_name, content) values ('$MEM_B', 'condolence', 'A Visitor', 'Thinking of you.');" >/dev/null 2>"$PGDATA_DIR/last_error" || true
COND_COUNT=$($DB -t -A -c "select count(*) from messages where memorial_id = '$MEM_B';")
check "anonymous message is rejected on a non-published memorial" "0" "$COND_COUNT"

echo ""
echo "== Mission 011A: progressive memorial + atomic redemption =="

# The redemption RPC is only ever called by the server-side privileged
# role, never by a browser. Every call below therefore goes through
# `set role service_role` — the superuser connection this script runs on
# would bypass the very privilege model under test.
# svc() / svc_expect_error() are defined in the Mission 013C section above.

OWNER_C=$($DB -t -A -c "insert into owners (auth_user_id, email) values (gen_random_uuid(), 'owner-c@example.test') returning id;")
OWNER_D=$($DB -t -A -c "insert into owners (auth_user_id, email) values (gen_random_uuid(), 'owner-d@example.test') returning id;")

new_entitlement() {
  $DB -t -A -c "insert into entitlements (access_level, source, offer_id, status) values ('complet', 'direct', 'intemporel', '$1') returning id;"
}

ENT_NULLS=$(new_entitlement available)
ENT_NULLS2=$(new_entitlement available)
ENT_OK=$(new_entitlement available)
ENT_REVOKED=$(new_entitlement revoked)
ENT_ROLLBACK=$(new_entitlement available)
ENT_CONC=$(new_entitlement available)
ENT_LOCK=$(new_entitlement available)

# --- A: the minimal memorial a redemption creates -------------------
# editorial_context / language / slug are the family's decisions, made
# later in the Builder. The row must be creatable without them.
$DB -c "insert into memorials (owner_id, entitlement_id, memorial_type, skin_id, skin_variant) values ('$OWNER_C', '$ENT_NULLS', 'person', 'intemporel', 'light');" >/dev/null
NULL_SHAPE=$($DB -t -A -c "select (editorial_context is null) || ',' || (language is null) || ',' || (slug is null) || ',' || status from memorials where entitlement_id = '$ENT_NULLS';")
check "A: a memorial is creatable with editorial_context/language/slug all NULL, status 'draft'" "true,true,true,draft" "$NULL_SHAPE"

# The CHECK constraints must survive the NOT NULL relaxation: NULL is
# allowed, but a bogus non-null value is still rejected.
expect_error "A: a non-null but invalid language is still rejected (CHECK survives DROP NOT NULL)" \
  "update memorials set language = 'zz' where entitlement_id = '$ENT_NULLS';"

expect_error "A: a non-null but invalid editorial_context is still rejected" \
  "update memorials set editorial_context = 'not-a-context' where entitlement_id = '$ENT_NULLS';"

# --- B: UNIQUE slug is NULLS DISTINCT -------------------------------
$DB -c "insert into memorials (owner_id, entitlement_id, memorial_type, skin_id, skin_variant) values ('$OWNER_C', '$ENT_NULLS2', 'person', 'intemporel', 'light');" >/dev/null
NULL_SLUGS=$($DB -t -A -c "select count(*) from memorials where slug is null;")
check "B: several memorials coexist with slug NULL (PostgreSQL UNIQUE is NULLS DISTINCT)" "2" "$NULL_SLUGS"

NULLS_NOT_DISTINCT=$($DB -t -A -c "select indnullsnotdistinct from pg_index where indrelid = 'memorials'::regclass and indisunique and indexrelid::regclass::text like '%slug%';")
check "B: memorials' slug unique index is NULLS DISTINCT (not NULLS NOT DISTINCT)" "f" "$NULLS_NOT_DISTINCT"

$DB -c "update memorials set slug = 'real-slug-once-generated' where entitlement_id = '$ENT_NULLS';" >/dev/null
expect_error "B: two identical non-null slugs are still rejected" \
  "update memorials set slug = 'real-slug-once-generated' where entitlement_id = '$ENT_NULLS2';"

# --- privileges: who may call the primitive at all ------------------
expect_error "redeem_entitlement is NOT executable by 'authenticated'" \
  "set role authenticated; select * from redeem_entitlement('$ENT_OK', '$OWNER_C', 'person', 'intemporel', 'light');"

expect_error "redeem_entitlement is NOT executable by 'anon'" \
  "set role anon; select * from redeem_entitlement('$ENT_OK', '$OWNER_C', 'person', 'intemporel', 'light');"

# --- C: a normal redemption ----------------------------------------
REDEEM=$(svc "select outcome from redeem_entitlement('$ENT_OK', '$OWNER_C', 'person', 'intemporel', 'light');")
check "C: redeeming an available entitlement reports 'redeemed'" "redeemed" "$REDEEM"

MEM_OK=$($DB -t -A -c "select id from memorials where entitlement_id = '$ENT_OK';")
ENT_STATE=$($DB -t -A -c "select status || ',' || (owner_id = '$OWNER_C') || ',' || (redeemed_at is not null) from entitlements where id = '$ENT_OK';")
check "C: the entitlement is now redeemed, attached to the right owner, with redeemed_at set" "redeemed,true,true" "$ENT_STATE"

MEM_COUNT=$($DB -t -A -c "select count(*) from memorials where entitlement_id = '$ENT_OK';")
check "C: exactly one memorial exists for that entitlement" "1" "$MEM_COUNT"

MEM_SHAPE=$($DB -t -A -c "select memorial_type || ',' || skin_id || ',' || skin_variant || ',' || (owner_id = '$OWNER_C') || ',' || (editorial_context is null) || ',' || (language is null) || ',' || (slug is null) from memorials where id = '$MEM_OK';")
check "C: the created memorial carries type/skin/variant/owner and leaves the family's choices NULL" "person,intemporel,light,true,true,true,true" "$MEM_SHAPE"

# --- I: the existing draft trigger ran inside the same transaction --
DRAFT_OK=$($DB -t -A -c "select count(*) from memorial_drafts where memorial_id = '$MEM_OK';")
check "I: exactly one draft row was created by the existing trigger" "1" "$DRAFT_OK"

# --- F: idempotence — same owner retrying a lost response -----------
REDEEM2=$(svc "select outcome from redeem_entitlement('$ENT_OK', '$OWNER_C', 'person', 'intemporel', 'light');")
check "F: the same owner retrying gets 'already_redeemed' instead of an error" "already_redeemed" "$REDEEM2"

MEM_AGAIN=$(svc "select memorial_id from redeem_entitlement('$ENT_OK', '$OWNER_C', 'person', 'intemporel', 'light');")
check "F: the retry returns the very same memorial_id" "$MEM_OK" "$MEM_AGAIN"

MEM_COUNT=$($DB -t -A -c "select count(*) from memorials where entitlement_id = '$ENT_OK';")
check "F: retrying never created a second memorial" "1" "$MEM_COUNT"

# --- G: a different owner may never claim a consumed right ----------
svc_expect_error "G: another owner claiming the already-redeemed entitlement is refused" \
  "select * from redeem_entitlement('$ENT_OK', '$OWNER_D', 'person', 'intemporel', 'light');" \
  "entitlement_owned_by_another_owner"

MEM_COUNT=$($DB -t -A -c "select count(*) from memorials where entitlement_id = '$ENT_OK';")
OWNER_STILL=$($DB -t -A -c "select (owner_id = '$OWNER_C') from entitlements where id = '$ENT_OK';")
check "G: the refusal created no memorial and did not move the entitlement" "1,t" "$MEM_COUNT,$OWNER_STILL"

# --- E: revoked ------------------------------------------------------
svc_expect_error "E: a revoked entitlement is refused" \
  "select * from redeem_entitlement('$ENT_REVOKED', '$OWNER_C', 'person', 'intemporel', 'light');" \
  "entitlement_not_available:revoked"

REVOKED_STATE=$($DB -t -A -c "select status || ',' || coalesce(owner_id::text, 'null') || ',' || (select count(*) from memorials where entitlement_id = '$ENT_REVOKED') from entitlements where id = '$ENT_REVOKED';")
check "E: the revoked entitlement is untouched and has no memorial" "revoked,null,0" "$REVOKED_STATE"

svc_expect_error "an unknown entitlement id is refused" \
  "select * from redeem_entitlement('00000000-0000-0000-0000-000000000000', '$OWNER_C', 'person', 'intemporel', 'light');" \
  "entitlement_not_found"

# --- D + J: atomicity — a failure mid-transaction rolls back all of it
# An invalid memorial_type passes the function's own checks and reaches
# the INSERT, which the table's CHECK rejects. Because the entitlement
# was ALREADY updated to 'redeemed' at that point, this proves a real
# rollback of a write that had genuinely executed — not merely that a
# later statement never ran.
DRAFTS_BEFORE=$($DB -t -A -c "select count(*) from memorial_drafts;")
svc_expect_error "D: a memorial INSERT failing mid-transaction aborts the whole redemption" \
  "select * from redeem_entitlement('$ENT_ROLLBACK', '$OWNER_C', 'not-a-real-type', 'intemporel', 'light');" \
  "memorials_memorial_type_check"

ROLLBACK_STATE=$($DB -t -A -c "select status || ',' || coalesce(owner_id::text,'null') || ',' || coalesce(redeemed_at::text,'null') from entitlements where id = '$ENT_ROLLBACK';")
check "D: after rollback the entitlement is still available, unowned, never redeemed" "available,null,null" "$ROLLBACK_STATE"

ROLLBACK_MEM=$($DB -t -A -c "select count(*) from memorials where entitlement_id = '$ENT_ROLLBACK';")
check "D: after rollback no memorial exists" "0" "$ROLLBACK_MEM"

DRAFTS_AFTER=$($DB -t -A -c "select count(*) from memorial_drafts;")
check "J: after rollback no phantom draft row survives" "$DRAFTS_BEFORE" "$DRAFTS_AFTER"

# The same entitlement is still perfectly usable afterwards — the failed
# attempt left no trace that would block a legitimate retry.
RETRY_AFTER_ROLLBACK=$(svc "select outcome from redeem_entitlement('$ENT_ROLLBACK', '$OWNER_C', 'person', 'intemporel', 'light');")
check "D: the entitlement is still redeemable after the failed attempt" "redeemed" "$RETRY_AFTER_ROLLBACK"

# --- Mission 029B: an invalid skin_variant fails the SAME way, mid-
# transaction, through the SAME CHECK-constraint-on-INSERT mechanism as
# D above — never a decided business outcome, never a silent coercion.
ENT_BAD_VARIANT=$(new_entitlement available)
svc_expect_error "Mission 029B: an unknown skin_variant aborts the whole redemption" \
  "select * from redeem_entitlement('$ENT_BAD_VARIANT', '$OWNER_C', 'person', 'intemporel', 'sepia');" \
  "memorials_skin_variant_check"

BAD_VARIANT_STATE=$($DB -t -A -c "select status || ',' || coalesce(owner_id::text,'null') from entitlements where id = '$ENT_BAD_VARIANT';")
check "Mission 029B: after that rollback the entitlement is still available, unowned" "available,null" "$BAD_VARIANT_STATE"

BAD_VARIANT_MEM=$($DB -t -A -c "select count(*) from memorials where entitlement_id = '$ENT_BAD_VARIANT';")
check "Mission 029B: no memorial was created for the rejected variant" "0" "$BAD_VARIANT_MEM"

svc_expect_error "Mission 029B: a missing (NULL) skin_variant is likewise rejected, never silently 'light'" \
  "select * from redeem_entitlement('$ENT_BAD_VARIANT', '$OWNER_C', 'person', 'intemporel', null);" \
  "null value in column \"skin_variant\""

BAD_NULL_VARIANT_MEM=$($DB -t -A -c "select count(*) from memorials where entitlement_id = '$ENT_BAD_VARIANT';")
check "Mission 029B: no memorial was created for the missing variant either" "0" "$BAD_NULL_VARIANT_MEM"

# --- H1: the row lock genuinely serializes --------------------------
# A separate session holds FOR UPDATE on the entitlement for 3s. The
# redemption must BLOCK on it (hitting its 1s statement_timeout), not
# read past it. This proves the FOR UPDATE in the function is doing real
# work, deterministically — not inferred from a lucky race.
( $DB -c "begin; select id from entitlements where id = '$ENT_LOCK' for update; select pg_sleep(3); rollback;" >/dev/null 2>&1 ) &
LOCKER_PID=$!
sleep 0.5
if $DB -c "set role service_role; set local statement_timeout = '1000ms'; select * from redeem_entitlement('$ENT_LOCK', '$OWNER_C', 'person', 'intemporel', 'light');" >/dev/null 2>&1; then
  echo "  [FAIL] H1: redemption did NOT block on a concurrently held row lock"
  FAIL=$((FAIL + 1))
else
  echo "  [PASS] H1: redemption blocks on the entitlement's row lock (FOR UPDATE is real)"
  PASS=$((PASS + 1))
fi
wait $LOCKER_PID

LOCK_STATE=$($DB -t -A -c "select status || ',' || (select count(*) from memorials where entitlement_id = '$ENT_LOCK') from entitlements where id = '$ENT_LOCK';")
check "H1: the blocked attempt changed nothing (entitlement still available, no memorial)" "available,0" "$LOCK_STATE"

# --- H2: two genuinely concurrent redemptions -----------------------
# Two separate OS processes, two separate PostgreSQL backends, both
# racing for the same entitlement. The shared pg_sleep absorbs connection
# jitter so they reach the function within milliseconds of each other —
# this is a real race, not two sequential calls relabelled.
CONC_DIR="$PGDATA_DIR/concurrency"
mkdir -p "$CONC_DIR"
for i in 1 2; do
  CONC_OWNER=$([ "$i" = "1" ] && echo "$OWNER_C" || echo "$OWNER_D")
  (
    # `|| rc=$?` matters: under `set -e` the losing process would
    # otherwise abort on psql's non-zero exit and never record its
    # outcome, leaving the assertions below reading a missing file.
    rc=0
    $DB -t -A -c "set role service_role; select pg_sleep(0.7); select outcome from redeem_entitlement('$ENT_CONC', '$CONC_OWNER', 'person', 'intemporel', 'light');" \
      >"$CONC_DIR/$i.out" 2>"$CONC_DIR/$i.err" || rc=$?
    echo "$rc" >"$CONC_DIR/$i.rc"
  ) &
done
wait

CONC_WINNERS=$(cat "$CONC_DIR"/1.rc "$CONC_DIR"/2.rc | grep -c '^0$' || true)
check "H2: of two concurrent redemptions, exactly one succeeds" "1" "$CONC_WINNERS"

CONC_LOSER_REASON=$(cat "$CONC_DIR"/1.err "$CONC_DIR"/2.err | grep -c "entitlement_owned_by_another_owner" || true)
check "H2: the loser is refused as another owner's right, not by a crash" "1" "$CONC_LOSER_REASON"

CONC_MEMORIALS=$($DB -t -A -c "select count(*) from memorials where entitlement_id = '$ENT_CONC';")
check "H2: exactly one memorial exists after the race" "1" "$CONC_MEMORIALS"

CONC_COHERENT=$($DB -t -A -c "select e.status || ',' || (e.owner_id = m.owner_id) || ',' || (e.redeemed_at is not null) from entitlements e join memorials m on m.entitlement_id = e.id where e.id = '$ENT_CONC';")
check "H2: entitlement and memorial agree on the single winning owner" "redeemed,true,true" "$CONC_COHERENT"

CONC_DRAFTS=$($DB -t -A -c "select count(*) from memorial_drafts d join memorials m on m.id = d.memorial_id where m.entitlement_id = '$ENT_CONC';")
check "H2: exactly one draft row was created by the race" "1" "$CONC_DRAFTS"

# --- an owner may hold several entitlements and several memorials ----
# Excludes the raced entitlement on purpose: which owner wins it is
# genuinely non-deterministic, and this assertion is about the ownership
# model, not about the race.
OWNER_C_MEMORIALS=$($DB -t -A -c "select count(*) from memorials where owner_id = '$OWNER_C' and entitlement_id <> '$ENT_CONC';")
check "one owner legitimately holds several memorials (1 purchase = 1 right = 1 memorial, not 1 owner = 1 memorial)" "4" "$OWNER_C_MEMORIALS"

echo ""
echo "== Mission 029B: skin_variant is a memorials-only, offer/Etsy-free column =="

# Section 5/8/14/16 doctrine, proved structurally rather than merely
# argued: skin_variant exists on memorials alone, and touches no other
# table's shape, no RLS/policy, no grant.

SKIN_VARIANT_ELSEWHERE=$($DB -t -A -c "select count(*) from information_schema.columns where table_schema = 'public' and column_name = 'skin_variant' and table_name <> 'memorials';")
check "skin_variant exists on memorials only — never entitlements, owners, or any Etsy mapping" "0" "$SKIN_VARIANT_ELSEWHERE"

OFFER_ID_ON_MEMORIALS=$($DB -t -A -c "select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'memorials' and column_name in ('offer_id','listing_id','channel');")
check "memorials carries no offer_id/listing_id/channel column for skin_variant to depend on" "0" "$OFFER_ID_ON_MEMORIALS"

POLICY_COUNT_UNCHANGED=$($DB -t -A -c "select count(*) from pg_policies where schemaname = 'public' and tablename = 'memorials';")
check "still exactly the two Mission 002/021B policies on memorials (select_own, update_own) — none added" "2" "$POLICY_COUNT_UNCHANGED"

echo ""
echo "== Mission 011B: owner resolution guarantees (schema level) =="

# lib/entitlement/resolve-owner.ts relies entirely on `owners`' existing
# unique indexes for its Case B concurrency safety: it attempts the
# insert and treats a unique violation as "somebody or something got
# there first", then re-reads. Those checks assume the indexes really do
# refuse. Proven here against the real schema rather than assumed.

B_AUTH=$($DB -t -A -c "select gen_random_uuid();")
$DB -c "insert into owners (auth_user_id, email) values ('$B_AUTH', 'race@example.test');" >/dev/null

expect_error "a second owner for the same auth_user_id is rejected (Case B concurrency guard)" \
  "insert into owners (auth_user_id, email) values ('$B_AUTH', 'other-address@example.test');"

expect_error "a second owner at the same email is rejected" \
  "insert into owners (auth_user_id, email) values (gen_random_uuid(), 'race@example.test');"

# resolve-owner.ts lowercases before writing and looks up case-
# insensitively precisely because of this index. If it used a plain
# equality lookup it would miss the row this insert collides with.
expect_error "an email differing only in case is rejected (owners_email_key is lower(email))" \
  "insert into owners (auth_user_id, email) values (gen_random_uuid(), 'RACE@Example.TEST');"

# Case C is only safe because an unlinked owner can exist at all: the row
# a future direct-sale/admin flow could create, which redemption must
# never take over on an email match.
$DB -c "insert into owners (email) values ('unlinked@example.test');" >/dev/null
UNLINKED=$($DB -t -A -c "select coalesce(auth_user_id::text, 'null') from owners where email = 'unlinked@example.test';")
check "an owner can exist with no auth_user_id at all (the Case C row)" "null" "$UNLINKED"

expect_error "an authenticated user cannot insert over that unlinked owner's email (Case C stays a conflict)" \
  "insert into owners (auth_user_id, email) values (gen_random_uuid(), 'unlinked@example.test');"

# Several unlinked owners may coexist: the auth_user_id unique index is
# partial (where auth_user_id is not null), so NULL never collides.
$DB -c "insert into owners (email) values ('unlinked-two@example.test');" >/dev/null
UNLINKED_COUNT=$($DB -t -A -c "select count(*) from owners where auth_user_id is null;")
check "several owners may sit at auth_user_id NULL (the index is partial)" "2" "$UNLINKED_COUNT"

# Why lib/adapters/supabase/owner-repository.ts must not look owners up
# with a pattern operator. `%` and `_` are legal in an email's local part
# (RFC 5322 atext) AND are LIKE/ILIKE wildcards, so passing an address
# straight to ILIKE lets one person's address match another person's row
# — at an identity boundary. Demonstrated here against the real engine,
# so the reason for using exact equality is recorded where every other
# schema claim is proven.
$DB -c "insert into owners (email) values ('fooXbar@example.test');" >/dev/null

ILIKE_HITS=$($DB -t -A -c "select count(*) from owners where email ilike 'foo_bar@example.test';")
check "ILIKE would match a STRANGER's address (this is the risk, not the fix)" "1" "$ILIKE_HITS"

EXACT_HITS=$($DB -t -A -c "select count(*) from owners where lower(email) = lower('foo_bar@example.test');")
check "exact case-insensitive equality matches nobody, as it must" "0" "$EXACT_HITS"

CASE_HITS=$($DB -t -A -c "select count(*) from owners where lower(email) = lower('FOOXBAR@Example.TEST');")
check "exact case-insensitive equality still matches the same address in any case" "1" "$CASE_HITS"

# The redemption RPC is reached with an owner id the server resolved.
# Confirm end to end that a freshly created owner can redeem, so the
# 011B path (resolve owner -> redeem) is proven against the real schema.
B_OWNER=$($DB -t -A -c "select id from owners where auth_user_id = '$B_AUTH';")
B_ENT=$($DB -t -A -c "insert into entitlements (access_level, source, offer_id) values ('complet', 'direct', 'juif') returning id;")
B_OUTCOME=$(svc "select outcome from redeem_entitlement('$B_ENT', '$B_OWNER', 'person', 'juif', 'light');")
check "a newly created owner can redeem an entitlement (011B path, real schema)" "redeemed" "$B_OUTCOME"

B_MEM_SHAPE=$($DB -t -A -c "select memorial_type || ',' || skin_id || ',' || (owner_id = '$B_OWNER') from memorials where entitlement_id = '$B_ENT';")
check "the memorial carries the Offer-derived type and skin, owned by the resolved owner" "person,juif,true" "$B_MEM_SHAPE"

echo ""
echo "== Mission 013: activation keys =="

# The hash column is server-only BY PRIVILEGE. Mission 013's audit proved
# a column-level REVOKE alone is powerless while the role holds
# table-wide SELECT, so the migration revokes the table then grants the
# legitimate columns back. These checks are the permanent guard: if a
# future blanket GRANT (or an edited migration) ever hands the table back
# to client roles, this suite goes red instead of quietly leaking.

K_OWNER=$($DB -t -A -c "insert into owners (auth_user_id, email) values (gen_random_uuid(), 'keys@example.test') returning id;")
K_AUTH=$($DB -t -A -c "select auth_user_id from owners where id = '$K_OWNER';")
K_HASH=$(printf 'a%.0s' $(seq 1 64))
K_ENT=$($DB -t -A -c "insert into entitlements (access_level, source, offer_id, activation_key_hash) values ('complet', 'direct','intemporel','$K_HASH') returning id;")
# Give this owner a redeemed right too: that is the only state in which
# entitlements_select_own matches a row at all, so it is the only state
# where a leak could actually happen.
K_ENT_MINE=$($DB -t -A -c "insert into entitlements (access_level, source, offer_id, status, owner_id, redeemed_at, activation_key_hash) values ('complet', 'direct','juif','redeemed','$K_OWNER',now(),'$(printf 'b%.0s' $(seq 1 64))') returning id;")

expect_error "authenticated CANNOT read activation_key_hash on its own entitlement" \
  "set role authenticated; set local request.jwt.claim.sub = '$K_AUTH'; select activation_key_hash from entitlements where id = '$K_ENT_MINE';"

expect_error "authenticated CANNOT filter on activation_key_hash either" \
  "set role authenticated; set local request.jwt.claim.sub = '$K_AUTH'; select id from entitlements where activation_key_hash = '$K_HASH';"

expect_error "authenticated CANNOT 'select *' on entitlements (PostgREST's default is blocked)" \
  "set role authenticated; set local request.jwt.claim.sub = '$K_AUTH'; select * from entitlements;"

expect_error "anon CANNOT read entitlements at all" \
  "set role anon; select id from entitlements;"

LEGIT=$($DB -t -A -c "set role authenticated; set local request.jwt.claim.sub = '$K_AUTH'; select offer_id from entitlements where id = '$K_ENT_MINE';")
check "authenticated CAN still read a legitimate column of its own entitlement" "juif" "$LEGIT"

RLS_STILL=$($DB -t -A -c "set role authenticated; set local request.jwt.claim.sub = '$K_AUTH'; select count(*) from entitlements;")
check "RLS still scopes authenticated to its own rows (entitlements_select_own intact)" "1" "$RLS_STILL"

SVC_HASH=$(svc "select activation_key_hash from entitlements where id = '$K_ENT';")
check "service_role CAN read the hash (the redemption engine needs it)" "$K_HASH" "$SVC_HASH"

# --- defence in depth: no client role may WRITE a commercial right ----
# Today RLS already refuses these (no policy grants them), but that means
# one accidental `create policy` would open the table. After the REVOKE
# ALL these fail on privileges instead, so a policy alone grants nothing.
for role in anon authenticated; do
  for privilege in INSERT UPDATE DELETE TRUNCATE REFERENCES TRIGGER; do
    HAS=$($DB -t -A -c "select has_table_privilege('$role','public.entitlements','$privilege');")
    check "$role has no $privilege privilege on entitlements" "f" "$HAS"
  done
done

HASH_WRITABLE=$($DB -t -A -c "select has_column_privilege('authenticated','public.entitlements','activation_key_hash','UPDATE');")
check "authenticated cannot even be granted a write to activation_key_hash by a policy alone" "f" "$HASH_WRITABLE"

expect_error "authenticated CANNOT insert an entitlement (permission, not just RLS)" \
  "set role authenticated; set local request.jwt.claim.sub = '$K_AUTH'; insert into entitlements (access_level, source, offer_id) values ('complet', 'direct','juif');"

expect_error "authenticated CANNOT update its own entitlement" \
  "set role authenticated; set local request.jwt.claim.sub = '$K_AUTH'; update entitlements set status = 'available' where id = '$K_ENT_MINE';"

expect_error "authenticated CANNOT write activation_key_hash" \
  "set role authenticated; set local request.jwt.claim.sub = '$K_AUTH'; update entitlements set activation_key_hash = null where id = '$K_ENT_MINE';"

expect_error "authenticated CANNOT delete an entitlement" \
  "set role authenticated; set local request.jwt.claim.sub = '$K_AUTH'; delete from entitlements where id = '$K_ENT_MINE';"

expect_error "anon CANNOT insert an entitlement" \
  "set role anon; insert into entitlements (access_level, source, offer_id) values ('complet', 'direct','juif');"

# --- PUBLIC must hold nothing, directly or by column grant ------------
PUBLIC_TABLE=$($DB -t -A -c "select coalesce((select true from aclexplode((select relacl from pg_class where oid='public.entitlements'::regclass)) a where a.grantee = 0 limit 1), false);")
check "PUBLIC has no table privilege on entitlements" "f" "$PUBLIC_TABLE"

PUBLIC_COLUMNS=$($DB -t -A -c "select count(*) from pg_attribute att join lateral aclexplode(att.attacl) a on true where att.attrelid = 'public.entitlements'::regclass and a.grantee = 0;")
check "PUBLIC has no column privilege on entitlements either" "0" "$PUBLIC_COLUMNS"

# --- service_role keeps everything the engine needs -------------------
# Mission 013 originally asserted DELETE here too. That was written under
# the pre-013B assumption that service_role held blanket DML; it never
# did, and nothing in the redemption engine deletes a commercial right.
# Mission 013C grants the three privileges the code actually exercises
# and asserts the fourth stays refused.
for privilege in SELECT INSERT UPDATE; do
  HAS=$($DB -t -A -c "select has_table_privilege('service_role','public.entitlements','$privilege');")
  check "service_role keeps $privilege on entitlements" "t" "$HAS"
done
SVC_DELETE=$($DB -t -A -c "select has_table_privilege('service_role','public.entitlements','DELETE');")
check "service_role is refused DELETE on entitlements (a right is revoked, never erased)" "f" "$SVC_DELETE"

# The column allowlist means any column added later is invisible until
# somebody deliberately grants it — secure by default, not by vigilance.
$DB -c "alter table entitlements add column future_column text;" >/dev/null
expect_error "a column added later is NOT automatically exposed to authenticated" \
  "set role authenticated; set local request.jwt.claim.sub = '$K_AUTH'; select future_column from entitlements;"
$DB -c "alter table entitlements drop column future_column;" >/dev/null

# --- the hash column's own integrity ---
expect_error "a non-sha256 activation_key_hash is rejected" \
  "insert into entitlements (access_level, source, offer_id, activation_key_hash) values ('complet', 'direct','intemporel','not-a-hash');"

expect_error "an uppercase hex activation_key_hash is rejected" \
  "insert into entitlements (access_level, source, offer_id, activation_key_hash) values ('complet', 'direct','intemporel','$(printf 'A%.0s' $(seq 1 64))');"

expect_error "two rights cannot share one activation key hash" \
  "insert into entitlements (access_level, source, offer_id, activation_key_hash) values ('complet', 'direct','intemporel','$K_HASH');"

NULL_KEYS=$($DB -t -A -c "insert into entitlements (access_level, source, offer_id) values ('complet', 'direct','intemporel'),('complet', 'direct','musulman') returning 1;" | wc -l)
check "several rights may coexist with no activation key (partial unique index)" "2" "$NULL_KEYS"

# --- the wrapper's permissions ---
WRAPPER_SECDEF=$($DB -t -A -c "select prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='redeem_entitlement_with_activation_key';")
check "the wrapper is SECURITY INVOKER, not DEFINER" "f" "$WRAPPER_SECDEF"

WRAPPER_ACL=$($DB -t -A -c "select not exists (select 1 from aclexplode(proacl) a where a.grantee = 0) and proacl is not null from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='redeem_entitlement_with_activation_key';")
check "PUBLIC has no EXECUTE on the wrapper" "t" "$WRAPPER_ACL"

for role in anon authenticated; do
  HAS=$($DB -t -A -c "select has_function_privilege('$role', p.oid, 'EXECUTE') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='redeem_entitlement_with_activation_key';")
  check "$role has no EXECUTE on the wrapper" "f" "$HAS"
done
SVC_EXEC=$($DB -t -A -c "select has_function_privilege('service_role', p.oid, 'EXECUTE') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='redeem_entitlement_with_activation_key';")
check "service_role has EXECUTE on the wrapper" "t" "$SVC_EXEC"

# Mission 029B widened this signature by exactly one required parameter
# (p_skin_variant) — the keyless path itself (lock -> verify -> consume
# -> create -> commit) is otherwise untouched; see
# supabase/migrations/20260909130000_memorial_skin_variant.sql.
ELEVENA_WIDENED=$($DB -t -A -c "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='redeem_entitlement' and pg_get_function_identity_arguments(p.oid)='p_entitlement_id uuid, p_owner_id uuid, p_memorial_type text, p_skin_id text, p_skin_variant text';")
check "Mission 011A's redeem_entitlement carries Mission 029B's p_skin_variant, nothing else changed" "1" "$ELEVENA_WIDENED"

# --- concurrency / linearisation, scenarios A-F ---
new_keyed_entitlement() {
  $DB -t -A -c "insert into entitlements (access_level, source, offer_id, activation_key_hash) values ('complet', 'direct','intemporel','$1') returning id;"
}
HASH_A=$(printf '1%.0s' $(seq 1 64)); HASH_B=$(printf '2%.0s' $(seq 1 64))
HASH_C=$(printf '3%.0s' $(seq 1 64)); HASH_D=$(printf '4%.0s' $(seq 1 64))
HASH_E=$(printf '5%.0s' $(seq 1 64)); HASH_F=$(printf '6%.0s' $(seq 1 64))

# A: activation wins, then replacement must fail (right no longer available)
ENT_A=$(new_keyed_entitlement "$HASH_A")
OUT_A=$(svc "select outcome from redeem_entitlement_with_activation_key('$ENT_A','$HASH_A','$K_OWNER','person','intemporel','light');")
check "A: activation with the current key succeeds" "redeemed" "$OUT_A"
SWAPPED_A=$($DB -t -A -c "with u as (update entitlements set activation_key_hash='$HASH_B' where id='$ENT_A' and status='available' and activation_key_hash='$HASH_A' returning 1) select count(*) from u;")
check "A: replacing the key of an already-redeemed right matches 0 rows" "0" "$SWAPPED_A"

# B: replacement wins, then the OLD key must be refused
ENT_B=$(new_keyed_entitlement "$HASH_B")
$DB -c "update entitlements set activation_key_hash='$HASH_C' where id='$ENT_B';" >/dev/null
svc_expect_error "B: the superseded key is refused under the row lock" \
  "select * from redeem_entitlement_with_activation_key('$ENT_B','$HASH_B','$K_OWNER','person','intemporel','light');" \
  "activation_key_superseded"
B_STATE=$($DB -t -A -c "select status || ',' || (select count(*) from memorials where entitlement_id='$ENT_B') from entitlements where id='$ENT_B';")
check "B: the refusal created no memorial and left the right available" "available,0" "$B_STATE"
OUT_B=$(svc "select outcome from redeem_entitlement_with_activation_key('$ENT_B','$HASH_C','$K_OWNER','person','intemporel','light');")
check "B: the NEW key still works" "redeemed" "$OUT_B"

# C: invalidation wins before activation
ENT_C=$(new_keyed_entitlement "$HASH_D")
$DB -c "update entitlements set activation_key_hash=null where id='$ENT_C' and status='available' and activation_key_hash='$HASH_D';" >/dev/null
svc_expect_error "C: an invalidated key can no longer redeem" \
  "select * from redeem_entitlement_with_activation_key('$ENT_C','$HASH_D','$K_OWNER','person','intemporel','light');" \
  "activation_key_superseded"
C_MEM=$($DB -t -A -c "select count(*) from memorials where entitlement_id='$ENT_C';")
check "C: invalidation created no memorial, and the right itself is untouched" "0" "$C_MEM"
C_STATUS=$($DB -t -A -c "select status from entitlements where id='$ENT_C';")
check "C: invalidating a KEY did not revoke the RIGHT" "available" "$C_STATUS"

# D: revoked right
ENT_D=$(new_keyed_entitlement "$HASH_E")
$DB -c "update entitlements set status='revoked' where id='$ENT_D';" >/dev/null
svc_expect_error "D: a revoked right is refused by Mission 011A even with the current key" \
  "select * from redeem_entitlement_with_activation_key('$ENT_D','$HASH_E','$K_OWNER','person','intemporel','light');" \
  "entitlement_not_available:revoked"

# E: idempotent retry by the same owner, same current key
ENT_E=$(new_keyed_entitlement "$HASH_F")
MEM_E=$(svc "select memorial_id from redeem_entitlement_with_activation_key('$ENT_E','$HASH_F','$K_OWNER','person','intemporel','light');")
MEM_E2=$(svc "select memorial_id from redeem_entitlement_with_activation_key('$ENT_E','$HASH_F','$K_OWNER','person','intemporel','light');")
check "E: retrying with the same key returns the same memorial (011A idempotence preserved)" "$MEM_E" "$MEM_E2"
E_COUNT=$($DB -t -A -c "select count(*) from memorials where entitlement_id='$ENT_E';")
check "E: the retry created no second memorial" "1" "$E_COUNT"

# F: a different owner holding the same key
OTHER_OWNER=$($DB -t -A -c "insert into owners (auth_user_id, email) values (gen_random_uuid(), 'other-keys@example.test') returning id;")
svc_expect_error "F: another owner presenting the same key is refused" \
  "select * from redeem_entitlement_with_activation_key('$ENT_E','$HASH_F','$OTHER_OWNER','person','intemporel','light');" \
  "entitlement_owned_by_another_owner"
F_COUNT=$($DB -t -A -c "select count(*) from memorials where entitlement_id='$ENT_E';")
check "F: still exactly one memorial for that right" "1" "$F_COUNT"

# The lock is real, not inferred: hold the row and show the wrapper waits.
ENT_LOCK=$(new_keyed_entitlement "$(printf '7%.0s' $(seq 1 64))")
( $DB -c "begin; select activation_key_hash from entitlements where id='$ENT_LOCK' for update; select pg_sleep(3); rollback;" >/dev/null 2>&1 ) &
LOCKER=$!
sleep 0.5
if $DB -c "set role service_role; set local statement_timeout='1000ms'; select * from redeem_entitlement_with_activation_key('$ENT_LOCK','$(printf '7%.0s' $(seq 1 64))','$K_OWNER','person','intemporel','light');" >/dev/null 2>&1; then
  echo "  [FAIL] the key-checked redemption did NOT block on the row lock"
  FAIL=$((FAIL + 1))
else
  echo "  [PASS] the key check happens under the same row lock as the redemption"
  PASS=$((PASS + 1))
fi
wait $LOCKER

echo ""
echo "== Mission 015B: audited Admin mutations =="

# A fresh, essentially-collision-free 64-hex sha256-shaped value per
# call — sidesteps hand-tracking which literal hash strings earlier
# sections already persisted (entitlements_activation_key_hash_key is a
# real UNIQUE index; reusing one by accident would fail for the wrong
# reason).
random_hash() {
  $DB -t -A -c "select encode(sha256(gen_random_uuid()::text::bytea), 'hex');"
}

ADMIN_1=$($DB -t -A -c "select gen_random_uuid();")
ADMIN_2=$($DB -t -A -c "select gen_random_uuid();")

# --- admin_audit_events: privileges are exactly the append-only doctrine
expect_service_role admin_audit_events SELECT t
expect_service_role admin_audit_events INSERT t
expect_service_role admin_audit_events UPDATE f
expect_service_role admin_audit_events DELETE f

for role in anon authenticated; do
  for p in SELECT INSERT UPDATE DELETE TRUNCATE REFERENCES TRIGGER; do
    HAS=$($DB -t -A -c "select has_table_privilege('$role','public.admin_audit_events','$p');")
    check "$role has no $p on admin_audit_events" "f" "$HAS"
  done
done

PUBLIC_AUDIT=$($DB -t -A -c "select coalesce((select true from aclexplode((select relacl from pg_class where oid='public.admin_audit_events'::regclass)) a where a.grantee = 0 limit 1), false);")
check "PUBLIC has no privilege on admin_audit_events" "f" "$PUBLIC_AUDIT"

RLS_AUDIT=$($DB -t -A -c "select relrowsecurity from pg_class where oid='public.admin_audit_events'::regclass;")
check "RLS is enabled on admin_audit_events" "t" "$RLS_AUDIT"

POLICY_COUNT=$($DB -t -A -c "select count(*) from pg_policies where schemaname='public' and tablename='admin_audit_events';")
check "admin_audit_events has zero RLS policies (service_role bypasses RLS; nobody else holds a privilege to policy)" "0" "$POLICY_COUNT"

HASH_COL_AUDIT=$($DB -t -A -c "select count(*) from information_schema.columns where table_schema='public' and table_name='admin_audit_events' and column_name in ('activation_key_hash','raw_activation_key','activation_key');")
check "admin_audit_events has no column that could carry a key or its hash" "0" "$HASH_COL_AUDIT"

# --- the two RPCs: SECURITY INVOKER, search_path pinned, EXECUTE -------
expect_function admin_mutate_activation_key false search_path=public
expect_function admin_revoke_entitlement false search_path=public

expect_execute admin_mutate_activation_key service_role t
expect_execute admin_mutate_activation_key anon f
expect_execute admin_mutate_activation_key authenticated f
expect_execute admin_revoke_entitlement service_role t
expect_execute admin_revoke_entitlement anon f
expect_execute admin_revoke_entitlement authenticated f

for fn in admin_mutate_activation_key admin_revoke_entitlement; do
  PUB=$($DB -t -A -c "select coalesce((select true from aclexplode(p.proacl) a where a.grantee = 0 limit 1), false) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='$fn';")
  check "PUBLIC has no EXECUTE on $fn" "f" "$PUB"
done

# The effective privilege state above (service_role yes, everyone else
# no) is already reachable by a migration that only ever wrote
# `revoke ... from public` — PostgreSQL's own inheritance from PUBLIC
# makes the two forms behave identically at runtime, so has_function_
# privilege() cannot by itself distinguish "named explicitly" from
# "relied on PUBLIC membership". What CAN be proven at runtime is that
# the ACL is minimal: no grantee besides the function's own OWNER (whose
# privileges come from ownership, not from any ACL entry, and who is
# always present once an object's ACL is anything other than the
# catalog's implicit NULL default — REVOKE/GRANT materialises it) holds
# anything but service_role, EXECUTE only. That the migration's own SQL
# text names every role rather than leaning on PUBLIC inheritance
# (Mission 013C's doctrine, applied here after review) is a property of
# the migration file itself, checked directly against it below.
for fn in admin_mutate_activation_key admin_revoke_entitlement; do
  ACL_GRANTEES=$($DB -t -A -c "select count(distinct a.grantee) from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join lateral aclexplode(p.proacl) a where n.nspname='public' and p.proname='$fn' and a.grantee <> p.proowner;")
  check "$fn's ACL has exactly one grantee besides its owner" "1" "$ACL_GRANTEES"

  ACL_GRANTEE_NAME=$($DB -t -A -c "select a.grantee::regrole::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join lateral aclexplode(p.proacl) a where n.nspname='public' and p.proname='$fn' and a.grantee <> p.proowner;")
  check "$fn's sole non-owner grantee is service_role" "service_role" "$ACL_GRANTEE_NAME"

  ACL_PRIVS=$($DB -t -A -c "select string_agg(distinct a.privilege_type, ',') from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join lateral aclexplode(p.proacl) a where n.nspname='public' and p.proname='$fn' and a.grantee <> p.proowner;")
  check "$fn's sole non-owner grant is EXECUTE, nothing else" "EXECUTE" "$ACL_PRIVS"
done

MIGRATION_FILE="$MIGRATIONS_DIR/20260904100000_admin_audit_and_mutations.sql"
for fn in admin_mutate_activation_key admin_revoke_entitlement; do
  if grep -Pzoq "revoke all on function ${fn}\([^)]*\)\s*\n\s*from public, anon, authenticated, service_role;" "$MIGRATION_FILE"; then
    echo "  [PASS] the migration's own SQL text revokes $fn explicitly from public, anon, authenticated AND service_role by name"
    PASS=$((PASS + 1))
  else
    echo "  [FAIL] the migration's own SQL text does NOT explicitly name every role in $fn's REVOKE"
    FAIL=$((FAIL + 1))
  fi
done

# --- action/target_type: a FORMAT constraint, not a closed enum --------
expect_error "admin_audit_events rejects an empty action" \
  "insert into admin_audit_events (admin_auth_user_id, action, target_type, target_id) values ('$ADMIN_1', '', 'entitlement', gen_random_uuid());"

expect_error "admin_audit_events rejects an uppercase action" \
  "insert into admin_audit_events (admin_auth_user_id, action, target_type, target_id) values ('$ADMIN_1', 'Entitlement.Revoked', 'entitlement', gen_random_uuid());"

FORMAT_OK=$($DB -t -A -c "insert into admin_audit_events (admin_auth_user_id, action, target_type, target_id) values ('$ADMIN_1', 'a_future_action.taken', 'x', gen_random_uuid()) returning 1;")
check "admin_audit_events accepts a well-formed action/target_type it has never seen — no closed enum" "1" "$FORMAT_OK"
$DB -c "delete from admin_audit_events where action = 'a_future_action.taken';" >/dev/null

# --- context: must be a JSON OBJECT, never an array/scalar/null --------
expect_error "admin_audit_events rejects a context that is a JSON array" \
  "insert into admin_audit_events (admin_auth_user_id, action, target_type, target_id, context) values ('$ADMIN_1', 'a.b', 'x', gen_random_uuid(), '[1,2,3]');"

expect_error "admin_audit_events rejects a context that is a JSON scalar (string)" \
  "insert into admin_audit_events (admin_auth_user_id, action, target_type, target_id, context) values ('$ADMIN_1', 'a.b', 'x', gen_random_uuid(), '\"oops\"');"

expect_error "admin_audit_events rejects a context that is a JSON scalar (number)" \
  "insert into admin_audit_events (admin_auth_user_id, action, target_type, target_id, context) values ('$ADMIN_1', 'a.b', 'x', gen_random_uuid(), '42');"

expect_error "admin_audit_events rejects a context that is JSON null" \
  "insert into admin_audit_events (admin_auth_user_id, action, target_type, target_id, context) values ('$ADMIN_1', 'a.b', 'x', gen_random_uuid(), 'null');"

CONTEXT_DEFAULT=$($DB -t -A -c "insert into admin_audit_events (admin_auth_user_id, action, target_type, target_id) values ('$ADMIN_1', 'a.b', 'x', gen_random_uuid()) returning context::text;")
check "admin_audit_events' default context ('{}') satisfies the object constraint" "{}" "$CONTEXT_DEFAULT"

CONTEXT_OBJECT_OK=$($DB -t -A -c "insert into admin_audit_events (admin_auth_user_id, action, target_type, target_id, context) values ('$ADMIN_1', 'a.b', 'x', gen_random_uuid(), '{\"had_activation_key\": true}') returning 1;")
check "admin_audit_events accepts a genuine JSON object context" "1" "$CONTEXT_OBJECT_OK"
$DB -c "delete from admin_audit_events where action = 'a.b';" >/dev/null

# --- replace: an available, already-keyed right -------------------------
AA_HASH=$(random_hash)
AA_ENT=$(new_keyed_entitlement "$AA_HASH")
NEW_HASH_1=$(random_hash)
REPL_OUT=$(svc "select outcome from admin_mutate_activation_key('$AA_ENT','$ADMIN_1','$AA_HASH','$NEW_HASH_1');")
check "replace: outcome is 'replaced'" "replaced" "$REPL_OUT"
REPL_HASH=$($DB -t -A -c "select activation_key_hash from entitlements where id='$AA_ENT';")
check "replace: the new hash is actually persisted" "$NEW_HASH_1" "$REPL_HASH"
REPL_AUDIT=$($DB -t -A -c "select count(*) from admin_audit_events where target_id='$AA_ENT' and action='activation_key.replaced';")
check "replace: exactly one audit row" "1" "$REPL_AUDIT"
REPL_ATTR=$($DB -t -A -c "select admin_auth_user_id::text from admin_audit_events where target_id='$AA_ENT' and action='activation_key.replaced';")
check "replace: the audit row is attributed to the calling admin" "$ADMIN_1" "$REPL_ATTR"
REPL_CTX=$($DB -t -A -c "select context->>'had_activation_key' from admin_audit_events where target_id='$AA_ENT' and action='activation_key.replaced';")
check "replace: context records had_activation_key=true (it already had one)" "true" "$REPL_CTX"
REPL_CTX_TEXT=$($DB -t -A -c "select context::text from admin_audit_events where target_id='$AA_ENT' and action='activation_key.replaced';")
if printf '%s' "$REPL_CTX_TEXT" | grep -qF "$NEW_HASH_1"; then
  echo "  [FAIL] replace: the new hash leaked into the audit context"
  FAIL=$((FAIL + 1))
else
  echo "  [PASS] replace: the new hash never appears in the audit context"
  PASS=$((PASS + 1))
fi

# --- a "replacement" by the SAME hash the right already holds is refused,
# not silently accepted as a no-op success. AA_ENT currently holds
# NEW_HASH_1 (the successful replace just above).
AA_UPDATED_AT_BEFORE=$($DB -t -A -c "select updated_at from entitlements where id='$AA_ENT';")
AA_AUDIT_BEFORE=$($DB -t -A -c "select count(*) from admin_audit_events where target_id='$AA_ENT';")
SAME_OUT=$(svc "select outcome from admin_mutate_activation_key('$AA_ENT','$ADMIN_1','$NEW_HASH_1','$NEW_HASH_1');")
check "replace by the same hash it already holds is refused as same_activation_key" "same_activation_key" "$SAME_OUT"
AA_HASH_AFTER=$($DB -t -A -c "select activation_key_hash from entitlements where id='$AA_ENT';")
check "same_activation_key refusal: the hash is unchanged" "$NEW_HASH_1" "$AA_HASH_AFTER"
AA_UPDATED_AT_AFTER=$($DB -t -A -c "select updated_at from entitlements where id='$AA_ENT';")
check "same_activation_key refusal: updated_at is untouched (no UPDATE statement ran at all)" "$AA_UPDATED_AT_BEFORE" "$AA_UPDATED_AT_AFTER"
AA_AUDIT_AFTER=$($DB -t -A -c "select count(*) from admin_audit_events where target_id='$AA_ENT';")
check "same_activation_key refusal: no new audit row" "$AA_AUDIT_BEFORE" "$AA_AUDIT_AFTER"

# --- invalidate: an available, already-keyed right -----------------------
AB_HASH=$(random_hash)
AB_ENT=$(new_keyed_entitlement "$AB_HASH")
INV_OUT=$(svc "select outcome from admin_mutate_activation_key('$AB_ENT','$ADMIN_1','$AB_HASH', null);")
check "invalidate: outcome is 'invalidated'" "invalidated" "$INV_OUT"
INV_HASH=$($DB -t -A -c "select coalesce(activation_key_hash, 'NULL') from entitlements where id='$AB_ENT';")
check "invalidate: the hash is now NULL" "NULL" "$INV_HASH"
INV_AUDIT=$($DB -t -A -c "select count(*) from admin_audit_events where target_id='$AB_ENT' and action='activation_key.invalidated';")
check "invalidate: exactly one audit row" "1" "$INV_AUDIT"

# --- replace works even on a right that never had a key -----------------
AC_ENT=$(new_entitlement available)
NOKEY_HASH=$(random_hash)
NOKEY_OUT=$(svc "select outcome from admin_mutate_activation_key('$AC_ENT','$ADMIN_1', null,'$NOKEY_HASH');")
check "replace succeeds even when the right never had a key" "replaced" "$NOKEY_OUT"
NOKEY_CTX=$($DB -t -A -c "select context->>'had_activation_key' from admin_audit_events where target_id='$AC_ENT' and action='activation_key.replaced';")
check "context correctly records had_activation_key=false" "false" "$NOKEY_CTX"

# --- invalidate is REFUSED (never a no-op success) when there is no key
# already to invalidate. Without this check, NULL-current vs NULL-expected
# passes the compare-and-swap trivially and the RPC would UPDATE NULL to
# NULL, fire entitlements_set_updated_at for nothing, and write a SUCCESS
# audit row for an action that never actually happened.
AM_ENT=$(new_entitlement available)
AM_BEFORE_UPDATED_AT=$($DB -t -A -c "select updated_at from entitlements where id='$AM_ENT';")
AM_OUT=$(svc "select outcome from admin_mutate_activation_key('$AM_ENT','$ADMIN_1', null, null);")
check "invalidate on a right with no key is refused as no_activation_key" "no_activation_key" "$AM_OUT"
AM_HASH=$($DB -t -A -c "select coalesce(activation_key_hash,'NULL') from entitlements where id='$AM_ENT';")
check "invalidate refusal: the hash stays NULL" "NULL" "$AM_HASH"
AM_UPDATED_AT=$($DB -t -A -c "select updated_at from entitlements where id='$AM_ENT';")
check "invalidate refusal: updated_at is untouched (no UPDATE statement ran at all)" "$AM_BEFORE_UPDATED_AT" "$AM_UPDATED_AT"
AM_AUDIT=$($DB -t -A -c "select count(*) from admin_audit_events where target_id='$AM_ENT';")
check "invalidate refusal: zero audit rows" "0" "$AM_AUDIT"

# --- recovery: a lost response must never block a second rotation -------
# Each rotation here reads the CURRENT state for itself as its expected
# hash — exactly what SupabaseAdminEntitlementRepository.mutateActivationKey
# does — which is precisely why a lost first response never blocks a
# second, SEQUENTIAL attempt: it is not a concurrent race, so the second
# call's own fresh read always matches what the first call just wrote.
AJ_ENT=$(new_entitlement available)
AJ_HASH_1=$(random_hash)
AJ_HASH_2=$(random_hash)
AJ_OUT_1=$(svc "select outcome from admin_mutate_activation_key('$AJ_ENT','$ADMIN_1', null,'$AJ_HASH_1');")
check "recovery: a first rotation succeeds" "replaced" "$AJ_OUT_1"
AJ_OUT_2=$(svc "select outcome from admin_mutate_activation_key('$AJ_ENT','$ADMIN_1','$AJ_HASH_1','$AJ_HASH_2');")
check "recovery: a SECOND rotation succeeds too — support never needs the lost raw key to try again" "replaced" "$AJ_OUT_2"
AJ_FINAL=$($DB -t -A -c "select activation_key_hash from entitlements where id='$AJ_ENT';")
check "recovery: the entitlement carries only the LATEST hash" "$AJ_HASH_2" "$AJ_FINAL"

# --- a REDEEMED right refuses both key mutation and revocation ----------
AD_OWNER=$($DB -t -A -c "insert into owners (auth_user_id, email) values (gen_random_uuid(), 'admin015b-redeemed@example.test') returning id;")
AD_ENT=$(new_entitlement available)
svc "select outcome from redeem_entitlement('$AD_ENT','$AD_OWNER','person','intemporel','light');" >/dev/null

AD_REPL=$(svc "select outcome from admin_mutate_activation_key('$AD_ENT','$ADMIN_1', null,'$(random_hash)');")
check "replace on a REDEEMED right is refused as not_available" "not_available" "$AD_REPL"
AD_REPL_AUDIT=$($DB -t -A -c "select count(*) from admin_audit_events where target_id='$AD_ENT';")
check "the refused replace on a redeemed right writes zero audit rows" "0" "$AD_REPL_AUDIT"

AD_REV=$(svc "select outcome || ',' || blocking_status from admin_revoke_entitlement('$AD_ENT','$ADMIN_1');")
check "revoke on a REDEEMED right is refused; blocking_status=redeemed" "not_available,redeemed" "$AD_REV"
AD_REV_AUDIT=$($DB -t -A -c "select count(*) from admin_audit_events where target_id='$AD_ENT' and action='entitlement.revoked';")
check "the refused revoke on a redeemed right writes zero audit rows" "0" "$AD_REV_AUDIT"
AD_STATUS=$($DB -t -A -c "select status from entitlements where id='$AD_ENT';")
check "the redeemed right's status is untouched by the refused revoke" "redeemed" "$AD_STATUS"

# --- revoke: available -> revoked, key cleared, one audit row -----------
AE_HASH=$(random_hash)
AE_ENT=$(new_keyed_entitlement "$AE_HASH")
AE_REV=$(svc "select outcome from admin_revoke_entitlement('$AE_ENT','$ADMIN_1');")
check "revoke: outcome is 'revoked'" "revoked" "$AE_REV"
AE_STATE=$($DB -t -A -c "select status || ',' || coalesce(activation_key_hash,'NULL') from entitlements where id='$AE_ENT';")
check "revoke: status becomes revoked AND the key hash becomes NULL, together" "revoked,NULL" "$AE_STATE"
AE_AUDIT=$($DB -t -A -c "select count(*) from admin_audit_events where target_id='$AE_ENT' and action='entitlement.revoked';")
check "revoke: exactly one audit row" "1" "$AE_AUDIT"
AE_CTX=$($DB -t -A -c "select (context->>'had_activation_key') || ',' || (context->>'from_status') || ',' || (context->>'to_status') from admin_audit_events where target_id='$AE_ENT' and action='entitlement.revoked';")
check "revoke: context records had_activation_key=true, from_status=available, to_status=revoked" "true,available,revoked" "$AE_CTX"
AE_LOOKUP=$($DB -t -A -c "select count(*) from entitlements where activation_key_hash = '$AE_HASH';")
check "revoke: the dead key hash resolves to nothing at all afterwards" "0" "$AE_LOOKUP"

# --- revoked -> revoked is refused, never a second audit row -----------
AE_REV2=$(svc "select outcome || ',' || blocking_status from admin_revoke_entitlement('$AE_ENT','$ADMIN_2');")
check "revoke: a second revoke on an already-revoked right is refused; blocking_status=revoked" "not_available,revoked" "$AE_REV2"
AE_AUDIT2=$($DB -t -A -c "select count(*) from admin_audit_events where target_id='$AE_ENT' and action='entitlement.revoked';")
check "revoke: the refused second attempt writes no second audit row" "1" "$AE_AUDIT2"

# --- not_found, both RPCs, zero audit rows ------------------------------
UNKNOWN_ENT_ID="00000000-0000-0000-0000-000000000000"
NF_MUT=$(svc "select outcome from admin_mutate_activation_key('$UNKNOWN_ENT_ID','$ADMIN_1', null,'$(random_hash)');")
check "mutate: unknown entitlement id -> not_found" "not_found" "$NF_MUT"
NF_REV=$(svc "select outcome from admin_revoke_entitlement('$UNKNOWN_ENT_ID','$ADMIN_1');")
check "revoke: unknown entitlement id -> not_found" "not_found" "$NF_REV"
NF_AUDIT=$($DB -t -A -c "select count(*) from admin_audit_events where target_id='$UNKNOWN_ENT_ID';")
check "not_found writes zero audit rows on either RPC" "0" "$NF_AUDIT"

# --- a NULL admin identity is an invariant failure, never silently audited
svc_expect_error "a NULL admin_auth_user_id is refused by admin_mutate_activation_key" \
  "select * from admin_mutate_activation_key('$AC_ENT', null, null, '$(random_hash)');" \
  "admin_auth_user_id_required"
svc_expect_error "a NULL admin_auth_user_id is refused by admin_revoke_entitlement" \
  "select * from admin_revoke_entitlement('$AC_ENT', null);" \
  "admin_auth_user_id_required"

# --- atomicity: if the audit INSERT cannot happen, the mutation aborts --
AF_HASH=$(random_hash)
AF_ENT=$(new_keyed_entitlement "$AF_HASH")
$DB -c "revoke insert on admin_audit_events from service_role;" >/dev/null
svc_expect_error "atomicity: mutate — if the audit INSERT cannot happen, the whole mutation aborts" \
  "select * from admin_mutate_activation_key('$AF_ENT','$ADMIN_1','$AF_HASH','$(random_hash)');" \
  "permission denied"
AF_STATE=$($DB -t -A -c "select activation_key_hash from entitlements where id='$AF_ENT';")
check "atomicity: mutate — the entitlement's key is UNCHANGED after the aborted mutation" "$AF_HASH" "$AF_STATE"

AG_HASH=$(random_hash)
AG_ENT=$(new_keyed_entitlement "$AG_HASH")
svc_expect_error "atomicity: revoke — if the audit INSERT cannot happen, the revoke aborts too" \
  "select * from admin_revoke_entitlement('$AG_ENT','$ADMIN_1');" \
  "permission denied"
AG_STATE=$($DB -t -A -c "select status || ',' || activation_key_hash from entitlements where id='$AG_ENT';")
check "atomicity: revoke — the entitlement's status AND key are unchanged after the aborted revoke" "available,$AG_HASH" "$AG_STATE"

$DB -c "grant insert on admin_audit_events to service_role;" >/dev/null

# The privilege model doctrine still holds once restored: not a
# permanent, accidental lockout — the exact grant Mission 015B's own
# migration establishes.
AF_RETRY_HASH=$(random_hash)
AF_RETRY=$(svc "select outcome from admin_mutate_activation_key('$AF_ENT','$ADMIN_1','$AF_HASH','$AF_RETRY_HASH');")
check "atomicity: the entitlement is normally mutable again once the privilege is restored" "replaced" "$AF_RETRY"

# --- concurrency: two racing revokes on the same right, one winner -----
AH_ENT=$(new_entitlement available)
CONC_DIR_015B="$PGDATA_DIR/concurrency-015b"
mkdir -p "$CONC_DIR_015B"
for i in 1 2; do
  ADMIN_RACE=$([ "$i" = "1" ] && echo "$ADMIN_1" || echo "$ADMIN_2")
  (
    rc=0
    $DB -t -A -c "set role service_role; select pg_sleep(0.7); select outcome from admin_revoke_entitlement('$AH_ENT','$ADMIN_RACE');" \
      >"$CONC_DIR_015B/$i.out" 2>"$CONC_DIR_015B/$i.err" || rc=$?
    echo "$rc" >"$CONC_DIR_015B/$i.rc"
  ) &
done
wait

CONC_OUTS="$(cat "$CONC_DIR_015B/1.out" "$CONC_DIR_015B/2.out")"
REVOKED_COUNT=$(printf '%s\n' "$CONC_OUTS" | grep -c '^revoked$' || true)
check "concurrency: exactly one of two racing revokes succeeds" "1" "$REVOKED_COUNT"
NOTAVAIL_COUNT=$(printf '%s\n' "$CONC_OUTS" | grep -c '^not_available$' || true)
check "concurrency: the loser is refused as not_available, not by a crash" "1" "$NOTAVAIL_COUNT"
AH_AUDIT=$($DB -t -A -c "select count(*) from admin_audit_events where target_id='$AH_ENT' and action='entitlement.revoked';")
check "concurrency: exactly one audit row survives the race" "1" "$AH_AUDIT"

# --- CAS concurrency: two rotations that captured the SAME expected hash
#
# This is the correction the Opus/GPT review asked for: `status =
# 'available'` alone is not enough, because neither replace nor
# invalidate changes status, so a second caller re-reading after the
# first commits would still see 'available' and could overwrite the
# first's fresh hash. p_expected_activation_key_hash closes that: both
# processes below believe (correctly, at the moment they read it) that
# AK_HASH is current; only whichever actually holds the row lock when it
# checks may proceed, and the other's re-read under the lock no longer
# matches.
AK_HASH=$(random_hash)
AK_ENT=$(new_keyed_entitlement "$AK_HASH")
AK_NEXT_1=$(random_hash)
AK_NEXT_2=$(random_hash)
CONC_DIR_CAS="$PGDATA_DIR/concurrency-015b-cas"
mkdir -p "$CONC_DIR_CAS"
for i in 1 2; do
  CAS_NEXT=$([ "$i" = "1" ] && echo "$AK_NEXT_1" || echo "$AK_NEXT_2")
  (
    rc=0
    $DB -t -A -c "set role service_role; select pg_sleep(0.7); select outcome from admin_mutate_activation_key('$AK_ENT','$ADMIN_1','$AK_HASH','$CAS_NEXT');" \
      >"$CONC_DIR_CAS/$i.out" 2>"$CONC_DIR_CAS/$i.err" || rc=$?
    echo "$rc" >"$CONC_DIR_CAS/$i.rc"
  ) &
done
wait

CAS_OUTS="$(cat "$CONC_DIR_CAS/1.out" "$CONC_DIR_CAS/2.out")"
CAS_REPLACED_COUNT=$(printf '%s\n' "$CAS_OUTS" | grep -c '^replaced$' || true)
check "CAS concurrency: of two rotations sharing the same expected hash, exactly one succeeds" "1" "$CAS_REPLACED_COUNT"
CAS_MISMATCH_COUNT=$(printf '%s\n' "$CAS_OUTS" | grep -c '^key_mismatch$' || true)
check "CAS concurrency: the loser is refused as key_mismatch, not by a crash" "1" "$CAS_MISMATCH_COUNT"

AK_FINAL=$($DB -t -A -c "select activation_key_hash from entitlements where id='$AK_ENT';")
if [ "$AK_FINAL" = "$AK_NEXT_1" ] || [ "$AK_FINAL" = "$AK_NEXT_2" ]; then
  echo "  [PASS] CAS concurrency: the final hash is exactly one of the two candidates, never a corrupted mix"
  PASS=$((PASS + 1))
else
  echo "  [FAIL] CAS concurrency: final hash '$AK_FINAL' matches neither candidate"
  FAIL=$((FAIL + 1))
fi

AK_AUDIT=$($DB -t -A -c "select count(*) from admin_audit_events where target_id='$AK_ENT' and action='activation_key.replaced';")
check "CAS concurrency: exactly one audit row for the race" "1" "$AK_AUDIT"

# --- CAS concurrency: a replace racing an invalidate, same expected hash
AL_HASH=$(random_hash)
AL_ENT=$(new_keyed_entitlement "$AL_HASH")
AL_NEXT=$(random_hash)
CONC_DIR_CAS2="$PGDATA_DIR/concurrency-015b-cas2"
mkdir -p "$CONC_DIR_CAS2"
(
  rc=0
  $DB -t -A -c "set role service_role; select pg_sleep(0.7); select outcome from admin_mutate_activation_key('$AL_ENT','$ADMIN_1','$AL_HASH','$AL_NEXT');" \
    >"$CONC_DIR_CAS2/1.out" 2>"$CONC_DIR_CAS2/1.err" || rc=$?
  echo "$rc" >"$CONC_DIR_CAS2/1.rc"
) &
(
  rc=0
  $DB -t -A -c "set role service_role; select pg_sleep(0.7); select outcome from admin_mutate_activation_key('$AL_ENT','$ADMIN_2','$AL_HASH', null);" \
    >"$CONC_DIR_CAS2/2.out" 2>"$CONC_DIR_CAS2/2.err" || rc=$?
  echo "$rc" >"$CONC_DIR_CAS2/2.rc"
) &
wait

CAS2_OUTS="$(cat "$CONC_DIR_CAS2/1.out" "$CONC_DIR_CAS2/2.out")"
CAS2_WIN_COUNT=$(printf '%s\n' "$CAS2_OUTS" | grep -cE '^(replaced|invalidated)$' || true)
check "CAS concurrency (replace vs invalidate): exactly one of the two succeeds" "1" "$CAS2_WIN_COUNT"
CAS2_MISMATCH_COUNT=$(printf '%s\n' "$CAS2_OUTS" | grep -c '^key_mismatch$' || true)
check "CAS concurrency (replace vs invalidate): the loser is refused as key_mismatch" "1" "$CAS2_MISMATCH_COUNT"

AL_AUDIT_TOTAL=$($DB -t -A -c "select count(*) from admin_audit_events where target_id='$AL_ENT';")
check "CAS concurrency (replace vs invalidate): exactly one audit row total" "1" "$AL_AUDIT_TOTAL"

# --- the row lock is real, not inferred -------------------------------
AI_ENT=$(new_entitlement available)
( $DB -c "begin; select status from entitlements where id='$AI_ENT' for update; select pg_sleep(3); rollback;" >/dev/null 2>&1 ) &
LOCKER_015B=$!
sleep 0.5
if $DB -c "set role service_role; set local statement_timeout='1000ms'; select * from admin_mutate_activation_key('$AI_ENT','$ADMIN_1', null,'$(random_hash)');" >/dev/null 2>&1; then
  echo "  [FAIL] admin_mutate_activation_key did NOT block on a concurrently held row lock"
  FAIL=$((FAIL + 1))
else
  echo "  [PASS] admin_mutate_activation_key blocks on the entitlement's row lock (FOR UPDATE is real)"
  PASS=$((PASS + 1))
fi
wait $LOCKER_015B
AI_STATE=$($DB -t -A -c "select coalesce(activation_key_hash,'NULL') from entitlements where id='$AI_ENT';")
check "the blocked mutate attempt changed nothing" "NULL" "$AI_STATE"

# --- no raw key material anywhere in the ledger -------------------------
RAW_LEAK=$($DB -t -A -c "select count(*) from admin_audit_events where context::text like '%HH1-%' or action like '%HH1-%';")
check "no raw HH1- key material ever appears in the audit ledger" "0" "$RAW_LEAK"

echo ""
echo "== Mission 018: one Etsy purchase can only ever become one right =="

# lib/integration/etsy/provision-purchase.ts is idempotent by
# construction, not by inspection: it never asks "does this order exist?"
# before writing. Its whole safety argument rests on
# entitlements_external_order_unique (source, external_order_id) actually
# refusing the second row — including when both attempts are in flight at
# once, which is precisely the case a SELECT-then-INSERT cannot cover.
# Proven here against the real engine rather than assumed by the unit
# tests' in-memory stand-in.

ET_ORDER="etsy-receipt-$(date +%s%N)"
ET_HASH=$(random_hash)
ET_FIRST=$($DB -t -A -c "insert into entitlements (access_level, source, offer_id, external_order_id, activation_key_hash) values ('complet', 'etsy','intemporel','$ET_ORDER','$ET_HASH') returning id;")
check "a first Etsy provisioning inserts one right" "1" "$($DB -t -A -c "select count(*) from entitlements where source='etsy' and external_order_id='$ET_ORDER';")"

expect_error "a replay of the same receipt is refused by the unique index (no second right)" \
  "insert into entitlements (access_level, source, offer_id, external_order_id, activation_key_hash) values ('complet', 'etsy','intemporel','$ET_ORDER','$(random_hash)');"

expect_error "a replay is refused even when it resolves to a DIFFERENT offer" \
  "insert into entitlements (access_level, source, offer_id, external_order_id, activation_key_hash) values ('complet', 'etsy','juif','$ET_ORDER','$(random_hash)');"

# The constraint is on the PAIR, not on the order reference alone: the
# same string arriving through a different sales channel is a different
# order and must still be provisionable.
$DB -c "insert into entitlements (access_level, source, offer_id, external_order_id) values ('complet', 'direct','intemporel','$ET_ORDER');" >/dev/null
check "the same reference under another source is a different order (the key is the PAIR)" "1" \
  "$($DB -t -A -c "select count(*) from entitlements where source='direct' and external_order_id='$ET_ORDER';")"

# --- two genuinely concurrent deliveries of one receipt ---------------
# Two OS processes, two backends, the same receipt. The shared pg_sleep
# absorbs connection jitter so both reach the INSERT within milliseconds
# of each other — a real race, not two sequential inserts relabelled.
ET_RACE_ORDER="etsy-receipt-race-$(date +%s%N)"
CONC_DIR_018="$PGDATA_DIR/concurrency-018"
mkdir -p "$CONC_DIR_018"
for i in 1 2; do
  (
    rc=0
    $DB -t -A -c "set role service_role; select pg_sleep(0.7); insert into entitlements (access_level, source, offer_id, external_order_id, activation_key_hash) values ('complet', 'etsy','intemporel','$ET_RACE_ORDER','$(random_hash)') returning id;" \
      >"$CONC_DIR_018/$i.out" 2>"$CONC_DIR_018/$i.err" || rc=$?
    echo "$rc" >"$CONC_DIR_018/$i.rc"
  ) &
done
wait

ET_WINNERS=$(cat "$CONC_DIR_018"/1.rc "$CONC_DIR_018"/2.rc | grep -c '^0$' || true)
check "of two concurrent provisionings of one receipt, exactly one succeeds" "1" "$ET_WINNERS"

ET_LOSER_REASON=$(cat "$CONC_DIR_018"/1.err "$CONC_DIR_018"/2.err | grep -c "entitlements_external_order_unique" || true)
check "the loser is refused by entitlements_external_order_unique, not by a crash" "1" "$ET_LOSER_REASON"

ET_RACE_ROWS=$($DB -t -A -c "select count(*) from entitlements where source='etsy' and external_order_id='$ET_RACE_ORDER';")
check "exactly one right exists after the race" "1" "$ET_RACE_ROWS"

# The unit tests assert the adapter recognises a duplicate by SQLSTATE
# 23505, never by parsing a message. That code is what PostgreSQL really
# raises here.
ET_SQLSTATE=$($DB -t -A -c "do \$\$ begin insert into entitlements (access_level, source, offer_id, external_order_id) values ('complet', 'etsy','intemporel','$ET_RACE_ORDER'); exception when others then raise notice 'SQLSTATE=%', sqlstate; end \$\$;" 2>&1 | grep -c "SQLSTATE=23505" || true)
check "a duplicate order raises SQLSTATE 23505 (what the adapter branches on)" "1" "$ET_SQLSTATE"

# Mission 018 provisions a right and stops: no owner, no memorial, no
# redemption. The schema must allow exactly that resting state.
ET_RESTING=$($DB -t -A -c "select status || ',' || coalesce(owner_id::text,'null') || ',' || coalesce(redeemed_at::text,'null') from entitlements where id='$ET_FIRST';")
check "a freshly provisioned Etsy right rests available, unowned, unredeemed" "available,null,null" "$ET_RESTING"

ET_NO_MEMORIAL=$($DB -t -A -c "select count(*) from memorials where entitlement_id='$ET_FIRST';")
check "provisioning creates no memorial (Mission 018 stops at the right)" "0" "$ET_NO_MEMORIAL"

ET_RAW_LEAK=$($DB -t -A -c "select count(*) from entitlements where activation_key_hash like 'HH1-%';")
check "no raw HH1- key material is ever stored on a right" "0" "$ET_RAW_LEAK"

echo ""
echo "== Mission 019C: activation rate limiting =="

# --- privileges: exactly SELECT/INSERT/UPDATE for service_role, nothing
#     for anyone else, same doctrine as every other table since 013C ----
expect_service_role activation_rate_limits SELECT t
expect_service_role activation_rate_limits INSERT t
expect_service_role activation_rate_limits UPDATE t
expect_service_role activation_rate_limits DELETE f

for role in anon authenticated; do
  for p in SELECT INSERT UPDATE DELETE TRUNCATE REFERENCES TRIGGER; do
    HAS=$($DB -t -A -c "select has_table_privilege('$role','public.activation_rate_limits','$p');")
    check "$role has no $p on activation_rate_limits" "f" "$HAS"
  done
done

PUBLIC_RATE_LIMIT=$($DB -t -A -c "select coalesce((select true from aclexplode((select relacl from pg_class where oid='public.activation_rate_limits'::regclass)) a where a.grantee = 0 limit 1), false);")
check "PUBLIC has no privilege on activation_rate_limits" "f" "$PUBLIC_RATE_LIMIT"

RLS_RATE_LIMIT=$($DB -t -A -c "select relrowsecurity from pg_class where oid='public.activation_rate_limits'::regclass;")
check "RLS is enabled on activation_rate_limits" "t" "$RLS_RATE_LIMIT"

RATE_LIMIT_POLICIES=$($DB -t -A -c "select count(*) from pg_policies where schemaname='public' and tablename='activation_rate_limits';")
check "activation_rate_limits has zero RLS policies (service_role bypasses RLS; nobody else holds a privilege to policy)" "0" "$RATE_LIMIT_POLICIES"

RATE_LIMIT_KEY_COLUMNS=$($DB -t -A -c "select count(*) from information_schema.columns where table_schema='public' and table_name='activation_rate_limits' and column_name in ('activation_key','raw_activation_key','activation_key_hash');")
check "activation_rate_limits has no column that could carry a key or its hash" "0" "$RATE_LIMIT_KEY_COLUMNS"

RATE_LIMIT_COLUMNS=$($DB -t -A -c "select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns where table_schema='public' and table_name='activation_rate_limits';")
check "activation_rate_limits carries only identity + counters, no email/IP/user-agent" "auth_user_id,window_started_at,attempt_count,updated_at" "$RATE_LIMIT_COLUMNS"

expect_function record_heritage_activation_attempt false search_path=public
expect_execute record_heritage_activation_attempt service_role t
expect_execute record_heritage_activation_attempt anon f
expect_execute record_heritage_activation_attempt authenticated f

RATE_LIMIT_FN_PUBLIC=$($DB -t -A -c "select coalesce((select true from aclexplode(p.proacl) a where a.grantee = 0 limit 1), false) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='record_heritage_activation_attempt';")
check "PUBLIC has no EXECUTE on record_heritage_activation_attempt" "f" "$RATE_LIMIT_FN_PUBLIC"

RL_AUTH_1=$($DB -t -A -c "select gen_random_uuid();")
RL_AUTH_2=$($DB -t -A -c "select gen_random_uuid();")

# --- a NULL identity is an invariant failure, never silently counted ----
svc_expect_error "a NULL auth_user_id is refused by record_heritage_activation_attempt" \
  "select * from record_heritage_activation_attempt(null);" \
  "auth_user_id_required"
NULL_ID_ROWS=$($DB -t -A -c "select count(*) from activation_rate_limits where auth_user_id is null;")
check "no row is ever written for a NULL identity" "0" "$NULL_ID_ROWS"

# --- the first five attempts in a window are allowed, the sixth is not -
for i in 1 2 3 4 5; do
  OUT=$(svc "select allowed from record_heritage_activation_attempt('$RL_AUTH_1');")
  check "attempt $i of 5 is allowed" "t" "$OUT"
done
SIXTH=$(svc "select allowed from record_heritage_activation_attempt('$RL_AUTH_1');")
check "the 6th attempt within the window is refused" "f" "$SIXTH"
SIXTH_RETRY=$(svc "select (retry_after_seconds > 0) from record_heritage_activation_attempt('$RL_AUTH_1');")
check "a refused attempt reports a positive retry_after_seconds" "t" "$SIXTH_RETRY"

RL_COUNT_1=$($DB -t -A -c "select attempt_count from activation_rate_limits where auth_user_id='$RL_AUTH_1';")
check "the counter reflects every attempt made, including the refused ones" "7" "$RL_COUNT_1"

# --- limiting is per-identity: a second auth user has an independent
#     budget, unaffected by the first user's exhausted window -----------
OTHER_FIRST=$(svc "select allowed from record_heritage_activation_attempt('$RL_AUTH_2');")
check "a second identity's first attempt is allowed even though another identity is blocked" "t" "$OTHER_FIRST"

# --- a fresh window is granted once the old one has fully elapsed ------
$DB -c "update activation_rate_limits set window_started_at = now() - interval '901 seconds' where auth_user_id = '$RL_AUTH_1';" >/dev/null
AFTER_WINDOW=$(svc "select allowed from record_heritage_activation_attempt('$RL_AUTH_1');")
check "an attempt after the window has elapsed is allowed again" "t" "$AFTER_WINDOW"
RL_COUNT_1_RESET=$($DB -t -A -c "select attempt_count from activation_rate_limits where auth_user_id='$RL_AUTH_1';")
check "a fresh window resets the counter to 1, not to a running total" "1" "$RL_COUNT_1_RESET"

# --- concurrency: many simultaneous attempts from ONE identity must not
#     let more than the configured budget through. Real OS processes,
#     real backends racing the same row — proves the single
#     INSERT ... ON CONFLICT ... RETURNING statement really does
#     serialize on the row, the same property Mission 011A/015B already
#     proved for their own row locks. -----------------------------------
RL_AUTH_RACE=$($DB -t -A -c "select gen_random_uuid();")
CONC_DIR_019C="$PGDATA_DIR/concurrency-019c"
mkdir -p "$CONC_DIR_019C"
for i in $(seq 1 8); do
  (
    rc=0
    $DB -t -A -c "set role service_role; select pg_sleep(0.3); select allowed from record_heritage_activation_attempt('$RL_AUTH_RACE');" \
      >"$CONC_DIR_019C/$i.out" 2>"$CONC_DIR_019C/$i.err" || rc=$?
    echo "$rc" >"$CONC_DIR_019C/$i.rc"
  ) &
done
wait

RACE_ALLOWED=$(cat "$CONC_DIR_019C"/*.out | grep -c '^t$' || true)
check "concurrency: of 8 simultaneous attempts from one identity, at most 5 are allowed" "5" "$RACE_ALLOWED"
RACE_TOTAL_COUNT=$($DB -t -A -c "select attempt_count from activation_rate_limits where auth_user_id='$RL_AUTH_RACE';")
check "concurrency: the counter reflects exactly the 8 racing attempts (no lost update, no double count)" "8" "$RACE_TOTAL_COUNT"


# ======================================================================
# MISSION 030 — the secure media storage foundation
# ======================================================================
#
# What is proved here is the half of Mission 030 that lives in
# PostgreSQL and Storage: the bucket's privacy, the policy surface, the
# privileges, the constraints, and the ownership/lifecycle behaviour of
# the `media` table. The TypeScript suite proves the domain half
# (validation, paths, replacement ordering) — neither substitutes for
# the other, which is exactly why both exist.

echo ""
echo "== Mission 030: the media storage foundation =="

# --- the bucket: exactly one, and PRIVATE ----------------------------
#
# The single most important assertion in this mission. A `true` here
# would mean every family's original photographs are readable by anyone
# with a URL.
BUCKET_PUBLIC=$($DB -t -A -c "select public from storage.buckets where id = 'memorial-media';")
check "the memorial-media bucket exists" "f" "${BUCKET_PUBLIC:-MISSING}"

BUCKET_COUNT=$($DB -t -A -c "select count(*) from storage.buckets;")
check "exactly one bucket is created (no forest of buckets)" "1" "$BUCKET_COUNT"

# No bucket anywhere in the project is public. Written over the whole
# table rather than over our own row so that a public bucket introduced
# by any other means also fails here.
PUBLIC_BUCKETS=$($DB -t -A -c "select count(*) from storage.buckets where public;")
check "no public bucket exists at all" "0" "$PUBLIC_BUCKETS"

# The ceiling Storage itself enforces, in bytes. Must equal
# MAX_MEDIA_BYTES in config/media.ts (15 MiB) — config/media.test.ts
# asserts the other direction, against this migration's text.
BUCKET_LIMIT=$($DB -t -A -c "select file_size_limit from storage.buckets where id = 'memorial-media';")
check "the bucket enforces a 15 MiB ceiling of its own" "15728640" "$BUCKET_LIMIT"

# The allowlist Storage applies to the declared content-type. A filter,
# never proof — but it is the layer that refuses an unacceptable type
# while the transfer is still in flight.
BUCKET_MIMES=$($DB -t -A -c "select array_to_string(allowed_mime_types, ',') from storage.buckets where id = 'memorial-media';")
check "the bucket admits exactly JPEG, PNG and WebP" "image/jpeg,image/png,image/webp" "$BUCKET_MIMES"

# The formats that must never be accepted, each named individually so a
# regression says WHICH one came back.
for forbidden in image/svg+xml image/heic image/heif image/avif image/gif video/mp4 video/quicktime application/pdf; do
  HAS_FORBIDDEN=$($DB -t -A -c "select '$forbidden' = any(allowed_mime_types) from storage.buckets where id = 'memorial-media';")
  check "the bucket refuses $forbidden" "f" "$HAS_FORBIDDEN"
done

# --- Storage policies: none, which IS the model -----------------------
#
# Mission 030 chose model B: no client-role access to storage.objects at
# all, every operation through a server primitive that proves ownership
# first. Under RLS, a bucket named by no policy is a bucket no client
# role can touch — so the assertion is that the policy count is zero.
#
# This also catches the genuine risk that model B carries: storage
# policies are written against ONE shared table, so a permissive policy
# added by the dashboard, a quickstart or another feature would apply to
# this bucket too. Here that would show up as a non-zero count.
STORAGE_POLICIES=$($DB -t -A -c "select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects';")
check "no policy exists on storage.objects (model B: nothing for client roles)" "0" "$STORAGE_POLICIES"

# RLS is enabled on storage.objects. Without this, "no policy" would
# mean "no restriction" rather than "no access" — the assertion above
# would be measuring nothing.
STORAGE_RLS=$($DB -t -A -c "select relrowsecurity from pg_class where oid = 'storage.objects'::regclass;")
check "row-level security is enabled on storage.objects" "t" "$STORAGE_RLS"

# The proof that the two facts above combine into actual denial.
#
# The client roles DO hold table privileges on storage.objects here (the
# harness grants them, reproducing what Supabase does), so this is not
# testing a missing grant — it is testing that RLS with no policy denies
# a role that is otherwise fully privileged. That is the entire security
# argument of model B, executed rather than asserted.
$DB -c "insert into storage.buckets (id, name, public) values ('probe-bucket','probe-bucket',false) on conflict do nothing;" >/dev/null
$DB -c "insert into storage.objects (bucket_id, name) values ('memorial-media','probe/seed.jpg');" >/dev/null

for role in anon authenticated; do
  READ_COUNT=$($DB -t -A -c "set role $role; select count(*) from storage.objects;")
  check "$role can read no object at all (RLS, no policy)" "0" "$READ_COUNT"

  expect_error "$role cannot write an object" \
    "set role $role; insert into storage.objects (bucket_id, name) values ('memorial-media','$role/forged.jpg');"

  DELETED=$($DB -t -A -c "set role $role; with d as (delete from storage.objects returning 1) select count(*) from d;")
  check "$role can delete no object" "0" "$DELETED"
done

# service_role is the only role that reaches objects, and only ever
# behind lib/auth/memorial-access.ts.
SVC_OBJECTS=$($DB -t -A -c "set role service_role; select count(*) from storage.objects;")
check "service_role reaches objects (it is the engine's only route)" "1" "$SVC_OBJECTS"

$DB -c "delete from storage.objects;" >/dev/null
$DB -c "delete from storage.buckets where id = 'probe-bucket';" >/dev/null

# --- the media table: client roles still hold nothing -----------------
#
# Mission 030 opened service_role's four privileges (asserted in the
# Mission 013C block above, which runs before this script grants
# anything of its own) and opened NOTHING for a browser session.
#
# Earlier sections of this harness granted themselves test-only
# privileges on `media` to simulate RLS, so the production state has to
# be restored before it can be asserted again here. That revoke is what
# the migrations leave behind; everything this section grants below is
# taken away again at its end.
$DB -c "revoke all privileges on table media from anon, authenticated;" >/dev/null

for role in anon authenticated; do
  for p in SELECT INSERT UPDATE DELETE; do
    expect_client "$role" media "$p" f
  done
done

# PUBLIC too — a privilege granted to PUBLIC is held by every role,
# including future ones nobody remembers to check.
for p in SELECT INSERT UPDATE DELETE TRUNCATE REFERENCES TRIGGER; do
  PUB_MEDIA=$($DB -t -A -c "select has_table_privilege('public','public.media','$p');")
  check "PUBLIC has no $p on media" "f" "$PUB_MEDIA"
done

# RLS is on, and the Mission 002 owner policy is still there — inert
# while no client grant exists, and a genuine second lock the day one
# is opened.
MEDIA_RLS=$($DB -t -A -c "select relrowsecurity from pg_class where oid = 'public.media'::regclass;")
check "row-level security is enabled on media" "t" "$MEDIA_RLS"

MEDIA_POLICY=$($DB -t -A -c "select count(*) from pg_policies where schemaname='public' and tablename='media' and policyname='media_all_own';")
check "the Mission 002 owner policy on media is preserved" "1" "$MEDIA_POLICY"

# --- the lifecycle columns and their constraints ----------------------
#
# Fixtures: two owners, two memorials. Owner A must never be able to
# reach Owner B's media, and the RLS simulation below is where that is
# proved against PostgreSQL rather than against a mock.
M030_AUTH_A=$($DB -t -A -c "select gen_random_uuid();")
M030_AUTH_B=$($DB -t -A -c "select gen_random_uuid();")
M030_OWNER_A=$($DB -t -A -c "insert into owners (email, auth_user_id) values ('m030-a@heritage.test','$M030_AUTH_A') returning id;")
M030_OWNER_B=$($DB -t -A -c "insert into owners (email, auth_user_id) values ('m030-b@heritage.test','$M030_AUTH_B') returning id;")
M030_ENT_A=$($DB -t -A -c "insert into entitlements (access_level, source, offer_id) values ('complet', 'direct','intemporel') returning id;")
M030_ENT_B=$($DB -t -A -c "insert into entitlements (access_level, source, offer_id) values ('complet', 'direct','intemporel') returning id;")
M030_MEM_A=$($DB -t -A -c "insert into memorials (owner_id, entitlement_id, memorial_type, editorial_context, skin_id, skin_variant, language, slug) values ('$M030_OWNER_A','$M030_ENT_A','person','remembrance','intemporel','light','fr','m030-memorial-a') returning id;")
M030_MEM_B=$($DB -t -A -c "insert into memorials (owner_id, entitlement_id, memorial_type, editorial_context, skin_id, skin_variant, language, slug) values ('$M030_OWNER_B','$M030_ENT_B','person','remembrance','intemporel','light','fr','m030-memorial-b') returning id;")

# A reservation: pending, and size genuinely unknown because the file
# does not exist yet. This is the row that makes an abandoned upload a
# known object rather than an orphan.
M030_MEDIA_A=$($DB -t -A -c "insert into media (memorial_id, owner_id, storage_path, media_type, mime_type, purpose, status) values ('$M030_MEM_A','$M030_OWNER_A','$M030_MEM_A/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/original.jpg','photo','image/jpeg','hero','pending') returning id;")
check "a reservation may be recorded with no size yet (pending)" "1" "$($DB -t -A -c "select count(*) from media where id='$M030_MEDIA_A' and size_bytes is null;")"

# The constraint that makes the NULL above safe: a media may not become
# usable while its size is unknown.
expect_error "a media cannot become ready while its size is unknown" \
  "update media set status='ready' where id='$M030_MEDIA_A';"

$DB -c "update media set status='ready', size_bytes=2048 where id='$M030_MEDIA_A';" >/dev/null
check "a media becomes ready once its measured size is recorded" "ready" "$($DB -t -A -c "select status from media where id='$M030_MEDIA_A';")"

# updated_at moves on finalization, via the same helper every other
# HERITAGE table uses.
check "updated_at is maintained by the shared trigger" "t" "$($DB -t -A -c "select updated_at > created_at from media where id='$M030_MEDIA_A';")"

# The closed vocabularies. Both are CHECK constraints rather than
# conventions, so a typo or an unreviewed new value fails at write time.
expect_error "an unknown purpose is refused" \
  "insert into media (memorial_id, owner_id, storage_path, media_type, mime_type, purpose, status, size_bytes) values ('$M030_MEM_A','$M030_OWNER_A','$M030_MEM_A/x/original.jpg','photo','image/jpeg','banner','ready',10);"

expect_error "an unknown status is refused" \
  "insert into media (memorial_id, owner_id, storage_path, media_type, mime_type, purpose, status, size_bytes) values ('$M030_MEM_A','$M030_OWNER_A','$M030_MEM_A/y/original.jpg','photo','image/jpeg','hero','published',10);"

# No video reaches this foundation at the schema level either. The
# allowlist in the bucket is one layer; media_type is another, and it
# has admitted exactly one value since Mission 002.
expect_error "no video may be recorded in this foundation" \
  "insert into media (memorial_id, owner_id, storage_path, media_type, mime_type, purpose, status, size_bytes) values ('$M030_MEM_A','$M030_OWNER_A','$M030_MEM_A/v/original.mp4','video','video/mp4','gallery','ready',10);"

# A path is unique across the whole table, so two media can never
# resolve to the same object — the property that lets replacement work
# without locking.
expect_error "two media cannot share one object path" \
  "insert into media (memorial_id, owner_id, storage_path, media_type, mime_type, purpose, status, size_bytes) values ('$M030_MEM_B','$M030_OWNER_B','$M030_MEM_A/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/original.jpg','photo','image/jpeg','hero','ready',10);"

# A media cannot exist without a memorial to belong to.
expect_error "a media must belong to a real memorial" \
  "insert into media (memorial_id, owner_id, storage_path, media_type, mime_type, purpose, status, size_bytes) values (gen_random_uuid(),'$M030_OWNER_A','$M030_MEM_A/z/original.jpg','photo','image/jpeg','hero','ready',10);"

# --- Hero and Gallery are ONE engine ----------------------------------
#
# Same table, same constraints, same policy, same bucket, same path
# shape — the only difference is the value in `purpose`. Proved by
# storing both and observing they differ in nothing else.
M030_GALLERY=$($DB -t -A -c "insert into media (memorial_id, owner_id, storage_path, media_type, mime_type, purpose, status, size_bytes) values ('$M030_MEM_A','$M030_OWNER_A','$M030_MEM_A/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/original.webp','photo','image/webp','gallery','ready',4096) returning id;")
check "hero and gallery media live in the same table" "2" "$($DB -t -A -c "select count(*) from media where memorial_id='$M030_MEM_A';")"
check "hero and gallery media share one memorial and one owner" "1" "$($DB -t -A -c "select count(distinct owner_id) from media where memorial_id='$M030_MEM_A';")"
check "purpose is the only thing that distinguishes them" "2" "$($DB -t -A -c "select count(distinct purpose) from media where memorial_id='$M030_MEM_A';")"

# Replacement requires two ready hero media to coexist for an instant —
# so the schema must NOT forbid it. This asserts the deliberate absence
# of a "one ready hero" unique index: forbidding the overlap would make
# it impossible to keep the old photograph until the new one is proven.
M030_HERO_2=$($DB -t -A -c "insert into media (memorial_id, owner_id, storage_path, media_type, mime_type, purpose, status, size_bytes) values ('$M030_MEM_A','$M030_OWNER_A','$M030_MEM_A/cccccccc-cccc-4ccc-8ccc-cccccccccccc/original.jpg','photo','image/jpeg','hero','ready',3072) returning id;")
check "two ready heroes may coexist, so replacement never loses the old one" "2" "$($DB -t -A -c "select count(*) from media where memorial_id='$M030_MEM_A' and purpose='hero' and status='ready';")"
$DB -c "delete from media where id='$M030_HERO_2';" >/dev/null

# --- cross-owner isolation, proved against PostgreSQL -----------------
#
# The Mission 002 policy is inert in production because `authenticated`
# holds no grant on media — which is a stronger guarantee than the
# policy, not a weaker one. But the policy is the second lock, and a
# second lock that has never been tested is a decoration. This block
# grants the client role a temporary SELECT so the policy can actually
# be exercised, then takes it away again.
#
# The grant is made HERE, in the test, and never in a migration —
# nothing about the production privilege model changes.
M030_MEDIA_B=$($DB -t -A -c "insert into media (memorial_id, owner_id, storage_path, media_type, mime_type, purpose, status, size_bytes) values ('$M030_MEM_B','$M030_OWNER_B','$M030_MEM_B/dddddddd-dddd-4ddd-8ddd-dddddddddddd/original.png','photo','image/png','hero','ready',1024) returning id;")

$DB -c "grant select, update, delete on media to authenticated;" >/dev/null

as_owner() {
  local auth_uid="$1"; shift
  $DB -t -A -c "set role authenticated; set local request.jwt.claim.sub = '$auth_uid'; $*"
}

check "Owner A sees exactly their own media" "2" "$(as_owner "$M030_AUTH_A" "select count(*) from media;")"
check "Owner B sees exactly their own media" "1" "$(as_owner "$M030_AUTH_B" "select count(*) from media;")"
check "Owner A cannot see Owner B's media by its id" "0" "$(as_owner "$M030_AUTH_A" "select count(*) from media where id='$M030_MEDIA_B';")"
check "Owner B cannot see Owner A's media by its id" "0" "$(as_owner "$M030_AUTH_B" "select count(*) from media where id='$M030_MEDIA_A';")"

# Reading is not the interesting half. These are the ones that would
# let one family vandalise another's memorial.
check "Owner A cannot overwrite Owner B's media" "0" "$(as_owner "$M030_AUTH_A" "with u as (update media set storage_path='hijacked' where id='$M030_MEDIA_B' returning 1) select count(*) from u;")"
check "Owner A cannot delete Owner B's media" "0" "$(as_owner "$M030_AUTH_A" "with d as (delete from media where id='$M030_MEDIA_B' returning 1) select count(*) from d;")"
check "Owner B's media is intact after Owner A's attempts" "1" "$($DB -t -A -c "select count(*) from media where id='$M030_MEDIA_B' and storage_path <> 'hijacked';")"

# The path is the thing an attacker would forge, so the policy must not
# be fooled by one that merely LOOKS like it belongs elsewhere.
check "Owner A cannot reach Owner B's media by guessing its path" "0" "$(as_owner "$M030_AUTH_A" "select count(*) from media where storage_path like '$M030_MEM_B/%';")"

# --- anon: nothing, at any layer --------------------------------------
#
# A visitor has no session, so current_owner_id() is NULL and the owner
# policy matches nothing. Asserted even though anon also holds no grant,
# because these are two independent locks and the mission requires both.
$DB -c "grant select on media to anon;" >/dev/null
ANON_MEDIA=$($DB -t -A -c "set role anon; select count(*) from media;")
check "anon can read no media at all" "0" "$ANON_MEDIA"
ANON_PENDING=$($DB -t -A -c "set role anon; select count(*) from media where status='pending';")
check "anon can read no reservation either" "0" "$ANON_PENDING"
$DB -c "revoke select on media from anon;" >/dev/null

$DB -c "revoke all privileges on table media from anon, authenticated;" >/dev/null

# The temporary grants are gone; the production model is back exactly
# where the migrations left it. Re-asserted so a future edit to this
# block cannot silently leave a privilege open.
for role in anon authenticated; do
  for p in SELECT INSERT UPDATE DELETE; do
    expect_client "$role" media "$p" f
  done
done

# --- the sweep's view of an abandoned upload --------------------------
#
# The sweep looks for pending rows older than MEDIA_PENDING_TTL_MS,
# which is THREE HOURS (config/media.ts). That number is derived, not
# chosen: Supabase keeps a signed upload permission valid for two hours
# and offers no way to shorten it, so reclaiming sooner would delete a
# row and its object while the browser could still complete its upload
# — producing an object no row records. The queries below use the same
# three-hour window the application does.
#
# What must also be impossible is for the sweep to see a `ready` row —
# a finalized photograph reclaimed as garbage would be the worst bug
# this foundation could have.

# Older than the TTL: genuinely abandoned.
$DB -c "insert into media (memorial_id, owner_id, storage_path, media_type, mime_type, purpose, status, created_at) values ('$M030_MEM_A','$M030_OWNER_A','$M030_MEM_A/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee/original.jpg','photo','image/jpeg','gallery','pending', now() - interval '4 hours');" >/dev/null

SWEEPABLE=$($DB -t -A -c "select count(*) from media where status='pending' and created_at < now() - interval '3 hours';")
check "a reservation older than 3h is visible to the sweep" "1" "$SWEEPABLE"

SWEEPABLE_READY=$($DB -t -A -c "select count(*) from media where status='ready' and created_at < now() - interval '3 hours';")
check "no ready media is ever sweepable, however old" "0" "$SWEEPABLE_READY"

# THE regression fixture for the bug the QG caught: 2h30 old, so the
# upload permission may well still be valid. Under the old one-hour TTL
# this row was sweepable, and completing its upload afterwards would
# have left an orphan.
$DB -c "insert into media (memorial_id, owner_id, storage_path, media_type, mime_type, purpose, status, created_at) values ('$M030_MEM_A','$M030_OWNER_A','$M030_MEM_A/11111111-2222-4333-8444-555555555555/original.jpg','photo','image/jpeg','gallery','pending', now() - interval '2 hours 30 minutes');" >/dev/null

STILL_PERMITTED=$($DB -t -A -c "select count(*) from media where status='pending' and created_at < now() - interval '3 hours';")
check "a 2h30 reservation is NOT sweepable (its upload permission may still be valid)" "1" "$STILL_PERMITTED"

OLD_TTL_WOULD_HAVE_TAKEN=$($DB -t -A -c "select count(*) from media where status='pending' and created_at < now() - interval '1 hour';")
check "the abandoned 1h window would have taken 2 rows — which is exactly the bug" "2" "$OLD_TTL_WOULD_HAVE_TAKEN"

# A fresh reservation is protected: reclaiming a path while its upload
# is still in flight would turn a slow success into a mystery failure.
$DB -c "insert into media (memorial_id, owner_id, storage_path, media_type, mime_type, purpose, status) values ('$M030_MEM_A','$M030_OWNER_A','$M030_MEM_A/ffffffff-ffff-4fff-8fff-ffffffffffff/original.jpg','photo','image/jpeg','gallery','pending');" >/dev/null
FRESH_SWEEPABLE=$($DB -t -A -c "select count(*) from media where status='pending' and created_at < now() - interval '3 hours';")
check "a reservation younger than the TTL is left alone" "1" "$FRESH_SWEEPABLE"

# The partial index the sweep reads, and the fact that it covers only
# pending rows.
SWEEP_INDEX=$($DB -t -A -c "select count(*) from pg_indexes where tablename='media' and indexname='media_pending_created_at_idx';")
check "the sweep has a partial index over pending rows" "1" "$SWEEP_INDEX"

# --- deleting a memorial takes its media with it ----------------------
#
# ON DELETE CASCADE from Mission 002. Worth asserting in this mission
# because it is now load-bearing for orphans: a memorial removed
# without its media rows would leave objects in the bucket that nothing
# references and nobody can attribute.
$DB -c "delete from memorials where id='$M030_MEM_B';" >/dev/null
check "removing a memorial removes its media rows with it" "0" "$($DB -t -A -c "select count(*) from media where memorial_id='$M030_MEM_B';")"

$DB -c "delete from media where memorial_id='$M030_MEM_A';" >/dev/null
$DB -c "delete from memorials where id='$M030_MEM_A';" >/dev/null
$DB -c "delete from entitlements where id in ('$M030_ENT_A','$M030_ENT_B');" >/dev/null
$DB -c "delete from owners where id in ('$M030_OWNER_A','$M030_OWNER_B');" >/dev/null



# --- Security V1 lot 2: atomic memorial edit persistence ---------------

echo ""
echo "== Security V1 lot 2: CAS, publication race and append-only audit =="

S2_OWNER=$($DB -t -A -c "insert into owners (auth_user_id, email) values (gen_random_uuid(), 'security-v1-lot2@example.test') returning id;")
S2_OTHER_OWNER=$($DB -t -A -c "insert into owners (auth_user_id, email) values (gen_random_uuid(), 'security-v1-lot2-other@example.test') returning id;")
S2_ENT=$($DB -t -A -c "insert into entitlements (access_level, source, offer_id) values ('complet', 'direct','intemporel') returning id;")
S2_MEM=$($DB -t -A -c "insert into memorials (owner_id, entitlement_id, memorial_type, editorial_context, skin_id, skin_variant, language, slug, status, first_published_at) values ('$S2_OWNER','$S2_ENT','person','announcement','intemporel','light','fr','security-v1-lot2','editing',now() - interval '1 day') returning id;")

S2_RESULT=$(svc "select updated_at is not null, revision from commit_memorial_draft_edit_v1('$S2_MEM','$S2_OWNER',0,'editing',(select first_published_at from memorials where id='$S2_MEM'),'{\"personWords\":{\"text\":\"Correction\"}}','content.saved',array['content.personWords.text']);")
check "atomic content save increments revision exactly once" "t|1" "$S2_RESULT"
check "post-publication save appends one audit event" "1" "$($DB -t -A -c "select count(*) from memorial_edit_audit_events where memorial_id='$S2_MEM' and operation='content.saved' and mutation_targets=array['content.personWords.text'];")"
check "audit stores structural paths, not memorial text" "0" "$($DB -t -A -c "select count(*) from memorial_edit_audit_events where memorial_id='$S2_MEM' and array_to_string(mutation_targets,',') like '%Correction%';")"

svc_expect_error \
  "a stale autosave revision is rejected" \
  "select * from commit_memorial_draft_edit_v1('$S2_MEM','$S2_OWNER',0,'editing',(select first_published_at from memorials where id='$S2_MEM'),'{\"personWords\":{\"text\":\"Stale\"}}','content.saved',array['content.personWords.text']);" \
  "memorial draft changed"
check "the stale autosave did not overwrite the winner" "Correction" "$($DB -t -A -c "select content->'personWords'->>'text' from memorial_drafts where memorial_id='$S2_MEM';")"

svc_expect_error \
  "the RPC repeats ownership instead of trusting the Server Action" \
  "select * from commit_memorial_draft_edit_v1('$S2_MEM','$S2_OTHER_OWNER',1,'editing',(select first_published_at from memorials where id='$S2_MEM'),'{\"personWords\":{\"text\":\"Hijacked\"}}','content.saved',array['content.personWords.text']);" \
  "memorial edit refused"

S2_VIS_RESULT=$(svc "select revision from commit_memorial_draft_edit_v1('$S2_MEM','$S2_OWNER',1,'editing',(select first_published_at from memorials where id='$S2_MEM'),'{\"personWords\":{\"text\":\"Correction\"},\"presentation\":{\"hiddenSections\":[\"gallery\"]}}','visibility.changed',array['visibility.gallery']);")
check "a visibility save wins with the same draft CAS" "2" "$S2_VIS_RESULT"
svc_expect_error \
  "an autosave based on the pre-visibility revision cannot revert visibility" \
  "select * from commit_memorial_draft_edit_v1('$S2_MEM','$S2_OWNER',1,'editing',(select first_published_at from memorials where id='$S2_MEM'),'{\"personWords\":{\"text\":\"Late autosave\"}}','content.saved',array['content.personWords.text']);" \
  "memorial draft changed"
check "the visibility winner remains stored" "gallery" "$($DB -t -A -c "select content->'presentation'->'hiddenSections'->>0 from memorial_drafts where memorial_id='$S2_MEM';")"

S2_PREPUB_ENT=$($DB -t -A -c "insert into entitlements (access_level, source, offer_id) values ('complet', 'direct','intemporel') returning id;")
S2_PREPUB_MEM=$($DB -t -A -c "insert into memorials (owner_id, entitlement_id, memorial_type, editorial_context, skin_id, skin_variant, language, slug, status) values ('$S2_OWNER','$S2_PREPUB_ENT','person','announcement','intemporel','light','fr','security-v1-lot2-prepub','ready') returning id;")
svc "select commit_memorial_configuration_edit_v1('$S2_PREPUB_MEM','$S2_OWNER','ready',null,'language','fr','en',array['configuration.language']);" >/dev/null
check "a configuration edit persists its checked value" "en" "$($DB -t -A -c "select language from memorials where id='$S2_PREPUB_MEM';")"
svc_expect_error \
  "a stale configuration value is rejected" \
  "select commit_memorial_configuration_edit_v1('$S2_PREPUB_MEM','$S2_OWNER','ready',null,'language','fr','es',array['configuration.language']);" \
  "memorial configuration changed"
check "the stale configuration edit did not overwrite the winner" "en" "$($DB -t -A -c "select language from memorials where id='$S2_PREPUB_MEM';")"
$DB -c "update memorials set status='published', first_published_at=now() where id='$S2_PREPUB_MEM';" >/dev/null
svc_expect_error \
  "a save authorized before publication cannot commit after publication" \
  "select * from commit_memorial_draft_edit_v1('$S2_PREPUB_MEM','$S2_OWNER',0,'ready',null,'{\"hero\":{\"displayName\":\"Too late\"}}','content.saved',array['content.hero.displayName']);" \
  "memorial lifecycle changed"
check "the publication-race loser leaves Hero untouched" "{}" "$($DB -t -A -c "select content::text from memorial_drafts where memorial_id='$S2_PREPUB_MEM';")"

S2_REVISION_BEFORE=$($DB -t -A -c "select revision from memorial_drafts where memorial_id='$S2_MEM';")
svc_expect_error \
  "an invalid/auditless request cannot mutate the draft" \
  "select * from commit_memorial_draft_edit_v1('$S2_MEM','$S2_OWNER',$S2_REVISION_BEFORE,'editing',(select first_published_at from memorials where id='$S2_MEM'),'{\"personWords\":{\"text\":\"No audit\"}}','content.saved',array[]::text[]);" \
  "invalid memorial edit request"
check "a failed atomic request leaves the revision unchanged" "$S2_REVISION_BEFORE" "$($DB -t -A -c "select revision from memorial_drafts where memorial_id='$S2_MEM';")"

for role in anon authenticated; do
  CAN_DRAFT_RPC=$($DB -t -A -c "select has_function_privilege('$role','public.commit_memorial_draft_edit_v1(uuid,uuid,bigint,text,timestamptz,jsonb,text,text[])','EXECUTE');")
  check "$role cannot execute the privileged draft RPC" "f" "$CAN_DRAFT_RPC"
done
PUBLIC_DRAFT_RPC=$($DB -t -A -c "select exists (select 1 from aclexplode((select proacl from pg_proc where oid='public.commit_memorial_draft_edit_v1(uuid,uuid,bigint,text,timestamptz,jsonb,text,text[])'::regprocedure)) where grantee=0 and privilege_type='EXECUTE');")
check "PUBLIC cannot execute the privileged draft RPC" "f" "$PUBLIC_DRAFT_RPC"
check "service_role can execute the privileged draft RPC" "t" "$($DB -t -A -c "select has_function_privilege('service_role','public.commit_memorial_draft_edit_v1(uuid,uuid,bigint,text,timestamptz,jsonb,text,text[])','EXECUTE');")"
for role in anon authenticated; do
  CAN_CONFIG_RPC=$($DB -t -A -c "select has_function_privilege('$role','public.commit_memorial_configuration_edit_v1(uuid,uuid,text,timestamptz,text,text,text,text[])','EXECUTE');")
  check "$role cannot execute the privileged configuration RPC" "f" "$CAN_CONFIG_RPC"
done
PUBLIC_CONFIG_RPC=$($DB -t -A -c "select exists (select 1 from aclexplode((select proacl from pg_proc where oid='public.commit_memorial_configuration_edit_v1(uuid,uuid,text,timestamptz,text,text,text,text[])'::regprocedure)) where grantee=0 and privilege_type='EXECUTE');")
check "PUBLIC cannot execute the privileged configuration RPC" "f" "$PUBLIC_CONFIG_RPC"
check "service_role can execute the privileged configuration RPC" "t" "$($DB -t -A -c "select has_function_privilege('service_role','public.commit_memorial_configuration_edit_v1(uuid,uuid,text,timestamptz,text,text,text,text[])','EXECUTE');")"
for role in anon authenticated service_role; do
  for privilege in SELECT INSERT UPDATE DELETE TRUNCATE; do
    check "$role has no direct $privilege on memorial_edit_audit_events" "f" "$($DB -t -A -c "select has_table_privilege('$role','public.memorial_edit_audit_events','$privilege');")"
  done
done
PUBLIC_AUDIT_ACL=$($DB -t -A -c "select exists (select 1 from aclexplode((select relacl from pg_class where oid='public.memorial_edit_audit_events'::regclass)) where grantee=0);")
check "PUBLIC has no privilege on memorial_edit_audit_events" "f" "$PUBLIC_AUDIT_ACL"

# --- Security V1 publication foundation -------------------------------

echo ""
echo "== Security V1 publication: atomic snapshot and Hero-retirement lease =="

PUB_OWNER=$($DB -t -A -c "insert into owners (auth_user_id, email) values (gen_random_uuid(), 'publication-owner@example.test') returning id;")
PUB_OTHER=$($DB -t -A -c "insert into owners (auth_user_id, email) values (gen_random_uuid(), 'publication-other@example.test') returning id;")
PUB_ENT=$($DB -t -A -c "insert into entitlements (access_level, source, offer_id) values ('complet', 'direct','intemporel') returning id;")
PUB_MEM=$($DB -t -A -c "insert into memorials (owner_id, entitlement_id, memorial_type, editorial_context, skin_id, skin_variant, language, slug, status) values ('$PUB_OWNER','$PUB_ENT','person','announcement','intemporel','light','fr','publication-foundation','ready') returning id;")
$DB -c "update memorial_drafts set content='{\"hero\":{\"displayName\":\"Jeanne\",\"photo\":null}}' where memorial_id='$PUB_MEM';" >/dev/null

svc_expect_error \
  "a foreign owner cannot publish the memorial" \
  "select * from commit_memorial_publication_v1('$PUB_MEM','$PUB_OTHER',0,'ready',null,'fr','intemporel','light','publication-foundation','{\"hero\":{\"displayName\":\"Jeanne\",\"photo\":null}}');" \
  "memorial publication refused"
check "the foreign attempt creates no public snapshot" "0" "$($DB -t -A -c "select count(*) from memorial_published_snapshots where memorial_id='$PUB_MEM';")"

PUB_MEDIA=$($DB -t -A -c "insert into media (memorial_id, owner_id, storage_path, media_type, mime_type, purpose, status, size_bytes) values ('$PUB_MEM','$PUB_OWNER','$PUB_MEM/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/original.jpg','photo','image/jpeg','hero','ready',1024) returning id;")
PUB_LEASE=$(svc "select lease_id from reserve_hero_media_retirement_v1('$PUB_MEM','$PUB_OWNER','$PUB_MEDIA',0);")
svc_expect_error \
  "publication is refused while a Hero retirement lease is active" \
  "select * from commit_memorial_publication_v1('$PUB_MEM','$PUB_OWNER',0,'ready',null,'fr','intemporel','light','publication-foundation','{\"hero\":{\"displayName\":\"Jeanne\",\"photo\":null}}');" \
  "hero media retirement in progress"
check "the blocked publication changes neither status nor first date" "ready|null" "$($DB -t -A -c "select status || '|' || coalesce(first_published_at::text,'null') from memorials where id='$PUB_MEM';")"
svc "select finish_hero_media_retirement_v1('$PUB_MEM','$PUB_OWNER','$PUB_LEASE','cancelled');" >/dev/null

PUB_FIRST=$(svc "select published_at || '|' || first_published_at || '|' || revision from commit_memorial_publication_v1('$PUB_MEM','$PUB_OWNER',0,'ready',null,'fr','intemporel','light','publication-foundation','{\"hero\":{\"displayName\":\"Jeanne\",\"photo\":null}}');")
PUB_FIRST_AT=$(echo "$PUB_FIRST" | cut -d'|' -f2)
check "first publication atomically stores status and first date" "published|$PUB_FIRST_AT" "$($DB -t -A -c "select status || '|' || first_published_at from memorials where id='$PUB_MEM';")"
check "first publication snapshots the exact draft" "Jeanne" "$($DB -t -A -c "select content->'hero'->>'displayName' from memorial_published_snapshots where memorial_id='$PUB_MEM';")"
svc_expect_error \
  "a save that started before publication cannot write after publication wins" \
  "select * from commit_memorial_draft_edit_v1('$PUB_MEM','$PUB_OWNER',0,'ready',null,'{\"hero\":{\"displayName\":\"Stale overwrite\"}}','content.saved',array['content.hero.displayName']);" \
  "memorial lifecycle changed"
check "publication winning the race preserves its exact snapshot" "Jeanne" "$($DB -t -A -c "select content->'hero'->>'displayName' from memorial_published_snapshots where memorial_id='$PUB_MEM';")"

$DB -c "update memorials set status='editing' where id='$PUB_MEM'; update memorial_drafts set content='{\"hero\":{\"displayName\":\"Jeanne Martin\",\"photo\":null}}', revision=1 where memorial_id='$PUB_MEM';" >/dev/null
PUB_REPUBLISHED=$(svc "select first_published_at from commit_memorial_publication_v1('$PUB_MEM','$PUB_OWNER',1,'editing','$PUB_FIRST_AT','fr','intemporel','light','publication-foundation','{\"hero\":{\"displayName\":\"Jeanne Martin\",\"photo\":null}}');")
check "republication preserves the immutable first publication date" "$PUB_FIRST_AT" "$PUB_REPUBLISHED"
check "republication replaces the live snapshot with the exact new draft" "Jeanne Martin" "$($DB -t -A -c "select content->'hero'->>'displayName' from memorial_published_snapshots where memorial_id='$PUB_MEM';")"

PUB_STALE_ENT=$($DB -t -A -c "insert into entitlements (access_level, source, offer_id) values ('complet', 'direct','intemporel') returning id;")
PUB_STALE=$($DB -t -A -c "insert into memorials (owner_id, entitlement_id, memorial_type, editorial_context, skin_id, skin_variant, language, slug, status) values ('$PUB_OWNER','$PUB_STALE_ENT','person','announcement','intemporel','light','fr','publication-stale','ready') returning id;")
svc "select * from commit_memorial_draft_edit_v1('$PUB_STALE','$PUB_OWNER',0,'ready',null,'{\"hero\":{\"displayName\":\"Fresh save\"}}','content.saved',array['content.hero.displayName']);" >/dev/null
svc_expect_error \
  "a publication based on the pre-save revision is rejected" \
  "select * from commit_memorial_publication_v1('$PUB_STALE','$PUB_OWNER',0,'ready',null,'fr','intemporel','light','publication-stale','{}');" \
  "memorial draft changed"
check "the stale publication leaves the memorial unpublished" "ready|0" "$($DB -t -A -c "select status || '|' || (select count(*) from memorial_published_snapshots where memorial_id='$PUB_STALE') from memorials where id='$PUB_STALE';")"

PUB_CONFIG_ENT=$($DB -t -A -c "insert into entitlements (access_level, source, offer_id) values ('complet', 'direct','intemporel') returning id;")
PUB_CONFIG=$($DB -t -A -c "insert into memorials (owner_id, entitlement_id, memorial_type, editorial_context, skin_id, skin_variant, language, slug, status) values ('$PUB_OWNER','$PUB_CONFIG_ENT','person','announcement','intemporel','light','fr','publication-config-race','ready') returning id;")
$DB -c "update memorial_drafts set content='{\"hero\":{\"displayName\":\"Configuration race\",\"photo\":null}}' where memorial_id='$PUB_CONFIG'; update memorials set skin_variant='dark' where id='$PUB_CONFIG';" >/dev/null
svc_expect_error \
  "publication refuses a skin variant changed after validation" \
  "select * from commit_memorial_publication_v1('$PUB_CONFIG','$PUB_OWNER',0,'ready',null,'fr','intemporel','light','publication-config-race','{\"hero\":{\"displayName\":\"Configuration race\",\"photo\":null}}');" \
  "memorial publication configuration changed"
check "the configuration conflict creates no false publication" "ready|dark|0" "$($DB -t -A -c "select status || '|' || skin_variant || '|' || (select count(*) from memorial_published_snapshots where memorial_id='$PUB_CONFIG') from memorials where id='$PUB_CONFIG';")"

PUB_EXPIRED_ENT=$($DB -t -A -c "insert into entitlements (access_level, source, offer_id) values ('complet', 'direct','intemporel') returning id;")
PUB_EXPIRED_MEM=$($DB -t -A -c "insert into memorials (owner_id, entitlement_id, memorial_type, editorial_context, skin_id, skin_variant, language, slug, status) values ('$PUB_OWNER','$PUB_EXPIRED_ENT','person','announcement','intemporel','light','fr','publication-expired-lease','ready') returning id;")
$DB -c "update memorial_drafts set content='{\"hero\":{\"displayName\":\"Lease recovery\",\"photo\":null}}' where memorial_id='$PUB_EXPIRED_MEM';" >/dev/null
PUB_EXPIRED_MEDIA=$($DB -t -A -c "insert into media (memorial_id, owner_id, storage_path, media_type, mime_type, purpose, status, size_bytes) values ('$PUB_EXPIRED_MEM','$PUB_OWNER','$PUB_EXPIRED_MEM/bbbbbbbb-cccc-4ddd-8eee-ffffffffffff/original.jpg','photo','image/jpeg','hero','ready',1024) returning id;")
PUB_EXPIRED_LEASE=$(svc "select lease_id from reserve_hero_media_retirement_v1('$PUB_EXPIRED_MEM','$PUB_OWNER','$PUB_EXPIRED_MEDIA',0);")
$DB -c "update hero_media_retirement_leases set reserved_at=clock_timestamp() - interval '2 seconds', expires_at=clock_timestamp() - interval '1 second' where id='$PUB_EXPIRED_LEASE';" >/dev/null
svc_expect_error \
  "an expired retirement cannot be silently replaced by a new reservation" \
  "select * from reserve_hero_media_retirement_v1('$PUB_EXPIRED_MEM','$PUB_OWNER','$PUB_EXPIRED_MEDIA',0);" \
  "hero retirement reconciliation required"
svc_expect_error \
  "an interrupted expired retirement cannot later confirm Storage deletion" \
  "select finish_hero_media_retirement_v1('$PUB_EXPIRED_MEM','$PUB_OWNER','$PUB_EXPIRED_LEASE','completed');" \
  "hero retirement lease expired"
svc_expect_error \
  "an expired unfinished retirement remains a durable publication block" \
  "select * from commit_memorial_publication_v1('$PUB_EXPIRED_MEM','$PUB_OWNER',0,'ready',null,'fr','intemporel','light','publication-expired-lease','{\"hero\":{\"displayName\":\"Lease recovery\",\"photo\":null}}');" \
  "hero media retirement in progress"
svc "select finish_hero_media_retirement_v1('$PUB_EXPIRED_MEM','$PUB_OWNER','$PUB_EXPIRED_LEASE','cancelled');" >/dev/null
svc "select * from commit_memorial_publication_v1('$PUB_EXPIRED_MEM','$PUB_OWNER',0,'ready',null,'fr','intemporel','light','publication-expired-lease','{\"hero\":{\"displayName\":\"Lease recovery\",\"photo\":null}}');" >/dev/null
check "explicit reconciliation releases an interrupted retirement" "published" "$($DB -t -A -c "select status from memorials where id='$PUB_EXPIRED_MEM';")"

for forbidden_status in draft published archived; do
  PUB_BAD_ENT=$($DB -t -A -c "insert into entitlements (access_level, source, offer_id) values ('complet', 'direct','intemporel') returning id;")
  PUB_BAD=$($DB -t -A -c "insert into memorials (owner_id, entitlement_id, memorial_type, editorial_context, skin_id, skin_variant, language, slug, status, first_published_at) values ('$PUB_OWNER','$PUB_BAD_ENT','person','announcement','intemporel','light','fr','publication-$forbidden_status','$forbidden_status',case when '$forbidden_status' in ('published','archived') then now() else null end) returning id;")
  svc_expect_error \
    "publication refuses the forbidden $forbidden_status transition" \
    "select * from commit_memorial_publication_v1('$PUB_BAD','$PUB_OWNER',0,'$forbidden_status',(select first_published_at from memorials where id='$PUB_BAD'),'fr','intemporel','light','publication-$forbidden_status','{}');" \
    "memorial publication transition refused"
done

PUB_FAIL_ENT=$($DB -t -A -c "insert into entitlements (access_level, source, offer_id) values ('complet', 'direct','intemporel') returning id;")
PUB_FAIL=$($DB -t -A -c "insert into memorials (owner_id, entitlement_id, memorial_type, editorial_context, skin_id, skin_variant, language, slug, status) values ('$PUB_OWNER','$PUB_FAIL_ENT','person','announcement','intemporel','light','fr','publication-rollback','ready') returning id;")
$DB -c "create function test_fail_publication_snapshot() returns trigger language plpgsql as \$\$ begin if new.memorial_id='$PUB_FAIL' then raise exception 'forced snapshot failure'; end if; return new; end; \$\$; create trigger test_fail_publication_snapshot before insert or update on memorial_published_snapshots for each row execute function test_fail_publication_snapshot();" >/dev/null
svc_expect_error \
  "a snapshot failure rolls the complete publication back" \
  "select * from commit_memorial_publication_v1('$PUB_FAIL','$PUB_OWNER',0,'ready',null,'fr','intemporel','light','publication-rollback','{}');" \
  "forced snapshot failure"
check "snapshot failure leaves status, first date and snapshot untouched" "ready|null|0" "$($DB -t -A -c "select status || '|' || coalesce(first_published_at::text,'null') || '|' || (select count(*) from memorial_published_snapshots where memorial_id='$PUB_FAIL') from memorials where id='$PUB_FAIL';")"
$DB -c "drop trigger test_fail_publication_snapshot on memorial_published_snapshots; drop function test_fail_publication_snapshot();" >/dev/null

for role in anon authenticated; do
  check "$role cannot execute publication" "f" "$($DB -t -A -c "select has_function_privilege('$role','public.commit_memorial_publication_v1(uuid,uuid,bigint,text,timestamptz,text,text,text,text,jsonb)','EXECUTE');")"
  check "$role cannot reserve Hero retirement" "f" "$($DB -t -A -c "select has_function_privilege('$role','public.reserve_hero_media_retirement_v1(uuid,uuid,uuid,bigint)','EXECUTE');")"
  check "$role cannot finish Hero retirement" "f" "$($DB -t -A -c "select has_function_privilege('$role','public.finish_hero_media_retirement_v1(uuid,uuid,uuid,text)','EXECUTE');")"
done
check "service_role alone can execute publication" "t" "$($DB -t -A -c "select has_function_privilege('service_role','public.commit_memorial_publication_v1(uuid,uuid,bigint,text,timestamptz,text,text,text,text,jsonb)','EXECUTE');")"
check "service_role alone can reserve Hero retirement" "t" "$($DB -t -A -c "select has_function_privilege('service_role','public.reserve_hero_media_retirement_v1(uuid,uuid,uuid,bigint)','EXECUTE');")"
check "service_role alone can finish Hero retirement" "t" "$($DB -t -A -c "select has_function_privilege('service_role','public.finish_hero_media_retirement_v1(uuid,uuid,uuid,text)','EXECUTE');")"
PUBLIC_PUBLICATION_ACL=$($DB -t -A -c "select exists (select 1 from pg_proc p cross join lateral aclexplode(p.proacl) a join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('commit_memorial_publication_v1','reserve_hero_media_retirement_v1','finish_hero_media_retirement_v1') and a.grantee=0 and a.privilege_type='EXECUTE');")
check "PUBLIC has no execute privilege on publication functions" "f" "$PUBLIC_PUBLICATION_ACL"
for role in anon authenticated service_role; do
  for privilege in SELECT INSERT UPDATE DELETE TRUNCATE; do
    check "$role has no direct $privilege on hero_media_retirement_leases" "f" "$($DB -t -A -c "select has_table_privilege('$role','public.hero_media_retirement_leases','$privilege');")"
  done
done
PUBLIC_RETIREMENT_ACL=$($DB -t -A -c "select exists (select 1 from aclexplode((select relacl from pg_class where oid='public.hero_media_retirement_leases'::regclass)) where grantee=0);")
check "PUBLIC has no privilege on hero_media_retirement_leases" "f" "$PUBLIC_RETIREMENT_ACL"

# --- Security V1 media operations ------------------------------------

echo ""
echo "== Security V1 media: locked upload lifecycle and durable retirement =="

M3_ENT=$($DB -t -A -c "insert into entitlements (access_level, source, offer_id) values ('complet', 'direct','intemporel') returning id;")
M3_MEM=$($DB -t -A -c "insert into memorials (owner_id, entitlement_id, memorial_type, editorial_context, skin_id, skin_variant, language, slug, status) values ('$PUB_OWNER','$M3_ENT','person','announcement','intemporel','light','fr','media-security-v1','ready') returning id;")
M3_HERO=$(svc "select gen_random_uuid();")
M3_GALLERY=$(svc "select gen_random_uuid();")
M3_FOREIGN=$(svc "select gen_random_uuid();")
M3_POST_HERO=$(svc "select gen_random_uuid();")
check "owner can reserve Hero before publication" "$M3_HERO" "$(svc "select id from reserve_memorial_media_upload_v1('$M3_MEM','$PUB_OWNER','$M3_HERO','$M3_MEM/$M3_HERO/original.jpg','hero','image/jpeg');")"
check "owner can reserve Gallery before publication" "$M3_GALLERY" "$(svc "select id from reserve_memorial_media_upload_v1('$M3_MEM','$PUB_OWNER','$M3_GALLERY','$M3_MEM/$M3_GALLERY/original.jpg','gallery','image/jpeg');")"
svc_expect_error \
  "foreign owner cannot reserve media" \
  "select * from reserve_memorial_media_upload_v1('$M3_MEM','$PUB_OTHER','$M3_FOREIGN','$M3_MEM/$M3_FOREIGN/original.jpg','gallery','image/jpeg');" \
  "media reservation refused"
check "owner can finalize Gallery before publication" "ready|gallery" "$(svc "select status || '|' || purpose from finalize_memorial_media_upload_v1('$M3_MEM','$PUB_OWNER','$M3_GALLERY','gallery','image/jpeg',100,1200,1600);")"

M3_CLEANUP_FIRST=$(svc "select gen_random_uuid();")
svc "select id from reserve_memorial_media_upload_v1('$M3_MEM','$PUB_OWNER','$M3_CLEANUP_FIRST','$M3_MEM/$M3_CLEANUP_FIRST/original.jpg','gallery','image/jpeg');" >/dev/null
M3_CLEANUP_CLAIM=$(svc "select claim_id from reserve_pending_media_cleanup_v1('$M3_MEM','$PUB_OWNER','$M3_CLEANUP_FIRST',null);")
check "a repeated pending cleanup reuses its durable claim" "$M3_CLEANUP_CLAIM" "$(svc "select claim_id from reserve_pending_media_cleanup_v1('$M3_MEM','$PUB_OWNER','$M3_CLEANUP_FIRST',null);")"
svc_expect_error \
  "a cleanup claim blocks pending media finalization" \
  "select * from finalize_memorial_media_upload_v1('$M3_MEM','$PUB_OWNER','$M3_CLEANUP_FIRST','gallery','image/jpeg',100,1200,1600);" \
  "pending media cleanup already reserved"
svc "select finish_pending_media_cleanup_v1('$M3_MEM','$PUB_OWNER','$M3_CLEANUP_CLAIM');" >/dev/null
check "confirmed pending cleanup removes only the pending row and closes its claim" "0|1" "$($DB -t -A -c "select (select count(*) from media where id='$M3_CLEANUP_FIRST') || '|' || (select count(*) from pending_media_cleanup_claims where id='$M3_CLEANUP_CLAIM' and completed_at is not null);")"

M3_FINALIZE_FIRST=$(svc "select gen_random_uuid();")
svc "select id from reserve_memorial_media_upload_v1('$M3_MEM','$PUB_OWNER','$M3_FINALIZE_FIRST','$M3_MEM/$M3_FINALIZE_FIRST/original.jpg','gallery','image/jpeg');" >/dev/null
svc "select status from finalize_memorial_media_upload_v1('$M3_MEM','$PUB_OWNER','$M3_FINALIZE_FIRST','gallery','image/jpeg',100,1200,1600);" >/dev/null
svc_expect_error \
  "a completed finalization prevents a stale pending cleanup claim" \
  "select * from reserve_pending_media_cleanup_v1('$M3_MEM','$PUB_OWNER','$M3_FINALIZE_FIRST',null);" \
  "pending media cleanup conflict"
check "the finalization winner remains ready" "ready" "$($DB -t -A -c "select status from media where id='$M3_FINALIZE_FIRST';")"

M3_PENDING_HERO=$(svc "select gen_random_uuid();")
svc "select id from reserve_memorial_media_upload_v1('$M3_MEM','$PUB_OWNER','$M3_PENDING_HERO','$M3_MEM/$M3_PENDING_HERO/original.jpg','hero','image/jpeg');" >/dev/null
M3_PENDING_HERO_CLAIM=$(svc "select claim_id from reserve_pending_media_cleanup_v1('$M3_MEM','$PUB_OWNER','$M3_PENDING_HERO',null);")
svc_expect_error \
  "an active pending Hero cleanup claim blocks publication" \
  "select * from commit_memorial_publication_v1('$M3_MEM','$PUB_OWNER',0,'ready',null,'fr','intemporel','light','media-security-v1','{}');" \
  "pending Hero cleanup in progress"
svc "select finish_pending_media_cleanup_v1('$M3_MEM','$PUB_OWNER','$M3_PENDING_HERO_CLAIM');" >/dev/null

svc "select * from commit_memorial_publication_v1('$M3_MEM','$PUB_OWNER',0,'ready',null,'fr','intemporel','light','media-security-v1','{}');" >/dev/null
svc_expect_error \
  "Hero reserved before publication cannot finalize after publication" \
  "select * from finalize_memorial_media_upload_v1('$M3_MEM','$PUB_OWNER','$M3_HERO','hero','image/jpeg',100,1200,1600);" \
  "media finalization lifecycle refused"
svc_expect_error \
  "Hero cannot reserve after first publication" \
  "select * from reserve_memorial_media_upload_v1('$M3_MEM','$PUB_OWNER','$M3_POST_HERO','$M3_MEM/$M3_POST_HERO/original.jpg','hero','image/jpeg');" \
  "media reservation lifecycle refused"
M3_POST_GALLERY=$(svc "select gen_random_uuid();")
check "Gallery remains reservable after publication" "$M3_POST_GALLERY" "$(svc "select id from reserve_memorial_media_upload_v1('$M3_MEM','$PUB_OWNER','$M3_POST_GALLERY','$M3_MEM/$M3_POST_GALLERY/original.jpg','gallery','image/jpeg');")"
check "Gallery remains finalizable after publication" "ready" "$(svc "select status from finalize_memorial_media_upload_v1('$M3_MEM','$PUB_OWNER','$M3_POST_GALLERY','gallery','image/jpeg',100,1200,1600);")"

$DB -c "update memorial_published_snapshots set content=jsonb_build_object('gallery',jsonb_build_object('items',jsonb_build_array(jsonb_build_object('mediaId','$M3_POST_GALLERY','caption',null)))) where memorial_id='$M3_MEM';" >/dev/null
svc_expect_error \
  "Gallery media referenced by the published snapshot is physically retained" \
  "select * from reserve_gallery_media_retirement_v1('$M3_MEM','$PUB_OWNER','$M3_POST_GALLERY',0);" \
  "gallery media retained for published snapshot"
check "retained published Gallery media row remains present" "1" "$($DB -t -A -c "select count(*) from media where id='$M3_POST_GALLERY';")"

M3_RET_ENT=$($DB -t -A -c "insert into entitlements (access_level, source, offer_id) values ('complet', 'direct','intemporel') returning id;")
M3_RET_MEM=$($DB -t -A -c "insert into memorials (owner_id, entitlement_id, memorial_type, editorial_context, skin_id, skin_variant, language, slug, status) values ('$PUB_OWNER','$M3_RET_ENT','person','announcement','intemporel','light','fr','media-retirement-v1','ready') returning id;")
M3_RET_MEDIA=$($DB -t -A -c "insert into media (memorial_id,owner_id,storage_path,media_type,mime_type,purpose,status,size_bytes) values ('$M3_RET_MEM','$PUB_OWNER','$M3_RET_MEM/cccccccc-cccc-4ccc-8ccc-cccccccccccc/original.jpg','photo','image/jpeg','hero','ready',100) returning id;")
M3_LEASE_ONE=$(svc "select lease_id from reserve_hero_media_retirement_v1('$M3_RET_MEM','$PUB_OWNER','$M3_RET_MEDIA',0);")
M3_LEASE_TWO=$(svc "select lease_id from reserve_hero_media_retirement_v1('$M3_RET_MEM','$PUB_OWNER','$M3_RET_MEDIA',0);")
check "double Hero retirement request reuses the active durable lease" "$M3_LEASE_ONE" "$M3_LEASE_TWO"
svc "select finish_hero_media_retirement_v1('$M3_RET_MEM','$PUB_OWNER','$M3_LEASE_ONE','completed');" >/dev/null
M3_RET_CLEANUP=$(svc "select claim_id from reserve_pending_media_cleanup_v1('$M3_RET_MEM','$PUB_OWNER','$M3_RET_MEDIA',null);")
check "logical Hero retirement hides the row and transfers the durable block" "pending|1|1" "$($DB -t -A -c "select (select status from media where id='$M3_RET_MEDIA') || '|' || (select count(*) from hero_media_retirement_leases where id='$M3_LEASE_ONE' and completed_at is not null) || '|' || (select count(*) from pending_media_cleanup_claims where id='$M3_RET_CLEANUP' and completed_at is null);")"
expect_error \
  "a logically retired media cannot be referenced again while its upload token ages out" \
  "update memorial_drafts set content=jsonb_build_object('hero',jsonb_build_object('photo',jsonb_build_object('mediaId','$M3_RET_MEDIA'))) where memorial_id='$M3_RET_MEM';"
svc "select finish_pending_media_cleanup_v1('$M3_RET_MEM','$PUB_OWNER','$M3_RET_CLEANUP');" >/dev/null
check "confirmed post-expiry cleanup removes the traceable row and closes its claim" "0|1" "$($DB -t -A -c "select (select count(*) from media where id='$M3_RET_MEDIA') || '|' || (select count(*) from pending_media_cleanup_claims where id='$M3_RET_CLEANUP' and completed_at is not null);")"

for role in public anon authenticated; do
  check "$role cannot reserve a media upload RPC" "f" "$($DB -t -A -c "select has_function_privilege('$role','public.reserve_memorial_media_upload_v1(uuid,uuid,uuid,text,text,text)','EXECUTE');")"
  check "$role cannot finalize a media upload RPC" "f" "$($DB -t -A -c "select has_function_privilege('$role','public.finalize_memorial_media_upload_v1(uuid,uuid,uuid,text,text,bigint,integer,integer)','EXECUTE');")"
  check "$role cannot reserve Gallery retirement" "f" "$($DB -t -A -c "select has_function_privilege('$role','public.reserve_gallery_media_retirement_v1(uuid,uuid,uuid,bigint)','EXECUTE');")"
  check "$role cannot reserve pending media cleanup" "f" "$($DB -t -A -c "select has_function_privilege('$role','public.reserve_pending_media_cleanup_v1(uuid,uuid,uuid,timestamptz)','EXECUTE');")"
  check "$role cannot finish pending media cleanup" "f" "$($DB -t -A -c "select has_function_privilege('$role','public.finish_pending_media_cleanup_v1(uuid,uuid,uuid)','EXECUTE');")"
done
check "service_role can reserve media only through the protected RPC" "t" "$($DB -t -A -c "select has_function_privilege('service_role','public.reserve_memorial_media_upload_v1(uuid,uuid,uuid,text,text,text)','EXECUTE');")"
check "service_role can reserve pending media cleanup through the protected RPC" "t" "$($DB -t -A -c "select has_function_privilege('service_role','public.reserve_pending_media_cleanup_v1(uuid,uuid,uuid,timestamptz)','EXECUTE');")"
for role in anon authenticated service_role; do
  for privilege in SELECT INSERT UPDATE DELETE TRUNCATE; do
    check "$role has no direct $privilege on gallery_media_retirement_leases" "f" "$($DB -t -A -c "select has_table_privilege('$role','public.gallery_media_retirement_leases','$privilege');")"
  done
  for privilege in SELECT INSERT UPDATE DELETE TRUNCATE; do
    check "$role has no direct $privilege on pending_media_cleanup_claims" "f" "$($DB -t -A -c "select has_table_privilege('$role','public.pending_media_cleanup_claims','$privilege');")"
  done
done

# --- the preflight/postflight the QG will hand to the PO ---------------
#
# supabase/checks/*.sql is SQL a human pastes into the Supabase SQL
# Editor on the real project. Until now nothing executed those files at
# all, so a typo in one would only be discovered by the person running
# it against production — the worst possible place to find it.
#
# Both are read-only, so running them here costs nothing and proves two
# things: that they parse and execute, and — for the postflight — that
# the migration this harness just applied actually satisfies every
# assertion the QG will be reading.

if $DB -f "$REPO_ROOT/supabase/checks/030_preflight.sql" >/dev/null 2>"$PGDATA_DIR/preflight_error"; then
  echo "  [PASS] 030_preflight.sql parses and executes"
  PASS=$((PASS + 1))
else
  echo "  [FAIL] 030_preflight.sql failed: $(tr '\n' ' ' <"$PGDATA_DIR/preflight_error")"
  FAIL=$((FAIL + 1))
fi

if $DB -f "$REPO_ROOT/supabase/checks/030_postflight.sql" >/dev/null 2>"$PGDATA_DIR/postflight_error"; then
  echo "  [PASS] 030_postflight.sql parses and executes"
  PASS=$((PASS + 1))
else
  echo "  [FAIL] 030_postflight.sql failed: $(tr '\n' ' ' <"$PGDATA_DIR/postflight_error")"
  FAIL=$((FAIL + 1))
fi

# The postflight grades itself. Every row carries OK / ECHEC / INFO, so
# the strongest possible assertion is simply that it reports no ECHEC
# against a database built from these migrations.
POSTFLIGHT_FAILURES=$($DB -t -A -f "$REPO_ROOT/supabase/checks/030_postflight.sql" 2>/dev/null | grep -c "ECHEC" || true)
check "030_postflight.sql reports zero ECHEC against these migrations" "0" "$POSTFLIGHT_FAILURES"

# --- Mission 029B's own preflight/postflight, same doctrine -----------
#
# The postflight asserts real, migration-only privileges on `memorials`
# — but this harness granted `memorials` a test-only, table-wide UPDATE
# to `authenticated` (and SELECT to `anon`) way back in the "TEST-ONLY
# GRANTS" section, to exercise RLS deeper in this script, and never
# revoked it (unlike `media`, which Mission 030's own block already
# resets — see its two `revoke all privileges on table media` calls
# above). Reset `memorials` the same way, back to exactly what the real
# migrations grant, before the postflight reads it.
$DB -c "revoke all privileges on table memorials from anon, authenticated;" >/dev/null
$DB -c "grant select on table memorials to authenticated;" >/dev/null
$DB -c "grant update (language) on table memorials to authenticated;" >/dev/null
$DB -c "grant update (editorial_context) on table memorials to authenticated;" >/dev/null

if $DB -f "$REPO_ROOT/supabase/checks/029b_preflight.sql" >/dev/null 2>"$PGDATA_DIR/preflight_error"; then
  echo "  [PASS] 029b_preflight.sql parses and executes"
  PASS=$((PASS + 1))
else
  echo "  [FAIL] 029b_preflight.sql failed: $(tr '\n' ' ' <"$PGDATA_DIR/preflight_error")"
  FAIL=$((FAIL + 1))
fi

if $DB -f "$REPO_ROOT/supabase/checks/029b_postflight.sql" >/dev/null 2>"$PGDATA_DIR/postflight_error"; then
  echo "  [PASS] 029b_postflight.sql parses and executes"
  PASS=$((PASS + 1))
else
  echo "  [FAIL] 029b_postflight.sql failed: $(tr '\n' ' ' <"$PGDATA_DIR/postflight_error")"
  FAIL=$((FAIL + 1))
fi

POSTFLIGHT_029B_FAILURES=$($DB -t -A -f "$REPO_ROOT/supabase/checks/029b_postflight.sql" 2>/dev/null | grep -c "ECHEC" || true)
check "029b_postflight.sql reports zero ECHEC against these migrations" "0" "$POSTFLIGHT_029B_FAILURES"


# --- Offrandes symboliques V1 — C1 -----------------------------------

echo ""
echo "== Offrandes symboliques C1: anonymous gestures, closed-by-default lock, ceilings =="

SO_FN='public.record_symbolic_offering_v1(text,text,uuid)'
SO_TABLES="symbolic_offerings symbolic_offering_eligibility symbolic_offering_settings symbolic_offering_rate_limits"

# Privileges: nothing for anyone, except the owner's RLS-filtered read.
for t in $SO_TABLES; do
  check "RLS is enabled on $t" "t" "$($DB -t -A -c "select relrowsecurity from pg_class where oid='public.$t'::regclass;")"
  check "PUBLIC has no privilege on $t" "f" "$($DB -t -A -c "select exists (select 1 from aclexplode((select relacl from pg_class where oid='public.$t'::regclass)) where grantee=0);")"
  for role in anon authenticated service_role; do
    for privilege in SELECT INSERT UPDATE DELETE TRUNCATE REFERENCES TRIGGER; do
      expected="f"
      if [ "$t" = "symbolic_offerings" ] && [ "$role" = "authenticated" ] && [ "$privilege" = "SELECT" ]; then expected="t"; fi
      check "$role $privilege on $t" "$expected" "$($DB -t -A -c "select has_table_privilege('$role','public.$t','$privilege');")"
    done
  done
done
for role in anon authenticated; do
  check "$role cannot execute record_symbolic_offering_v1" "f" "$($DB -t -A -c "select has_function_privilege('$role','$SO_FN','EXECUTE');")"
done
check "service_role alone can execute record_symbolic_offering_v1" "t" "$($DB -t -A -c "select has_function_privilege('service_role','$SO_FN','EXECUTE');")"
check "PUBLIC has no execute privilege on record_symbolic_offering_v1" "f" "$($DB -t -A -c "select exists (select 1 from pg_proc p cross join lateral aclexplode(p.proacl) a where p.oid='$SO_FN'::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE');")"
check "record_symbolic_offering_v1 is SECURITY DEFINER with an empty search_path" "true|search_path=\"\"" "$($DB -t -A -c "select prosecdef || '|' || array_to_string(proconfig, ',') from pg_proc where oid='$SO_FN'::regprocedure;")"

# Anonymity by construction: the exact column set, nothing about a visitor.
check "symbolic_offerings carries no visitor data (exact column set)" "created_at,id,idempotency_key,kind,memorial_id,read_at" "$($DB -t -A -c "select string_agg(column_name, ',' order by column_name) from information_schema.columns where table_schema='public' and table_name='symbolic_offerings';")"

# Configurable, provisional ceilings.
check "provisional ceilings are seeded (30 per hour, 200 per day)" "30|200" "$($DB -t -A -c "select max_per_hour || '|' || max_per_day from symbolic_offering_settings;")"
expect_error "a second settings row is rejected" "insert into symbolic_offering_settings (id, max_per_hour, max_per_day) values (false, 1, 1);"
expect_error "an hourly ceiling above the daily one is rejected" "update symbolic_offering_settings set max_per_hour = 300;"
expect_error "a zero ceiling is rejected" "update symbolic_offering_settings set max_per_day = 0;"

# Fixtures: one owner with a published Intemporel memorial, one stranger.
SO_OWNER=$($DB -t -A -c "insert into owners (auth_user_id, email) values (gen_random_uuid(), 'offrandes-owner@example.test') returning id;")
SO_OTHER=$($DB -t -A -c "insert into owners (auth_user_id, email) values (gen_random_uuid(), 'offrandes-other@example.test') returning id;")
SO_AUTH=$($DB -t -A -c "select auth_user_id from owners where id='$SO_OWNER';")
SO_OTHER_AUTH=$($DB -t -A -c "select auth_user_id from owners where id='$SO_OTHER';")

so_memorial() {
  # $1 slug, $2 status, $3 snapshot content (empty = no snapshot)
  local ent mem
  ent=$($DB -t -A -c "insert into entitlements (access_level, source, offer_id) values ('complet', 'direct','intemporel') returning id;")
  mem=$($DB -t -A -c "insert into memorials (owner_id, entitlement_id, memorial_type, editorial_context, skin_id, skin_variant, language, slug, status, first_published_at) values ('$SO_OWNER','$ent','person','announcement','intemporel','light','fr','$1','$2',case when '$2' in ('published','editing','archived') then now() else null end) returning id;")
  if [ -n "$3" ]; then
    $DB -c "insert into memorial_published_snapshots (memorial_id, content) values ('$mem', '$3');" >/dev/null
  fi
  echo "$mem"
}
so_open() {
  # QG 016: a first published snapshot already opens the lock (trigger) — open or re-open it explicitly here.
  $DB -c "insert into symbolic_offering_eligibility (memorial_id, opens_at) values ('$1', now() - interval '1 minute') on conflict (memorial_id) do update set opens_at = excluded.opens_at, closes_at = null;" >/dev/null
}
so_record() {
  # $1 slug, $2 kind, $3 idempotency key
  svc "select outcome from record_symbolic_offering_v1('$1','$2','$3');"
}
so_count() {
  $DB -t -A -c "select count(*) from symbolic_offerings where memorial_id='$1';"
}
SNAP='{"hero":{"displayName":"Jeanne"}}'

SO_MEM=$(so_memorial offrandes-c1 published "$SNAP")

# QG 016: the first published snapshot opens the lock; WITHOUT an eligibility row, refusal stays the default.
check "QG 016: the eligibility lock holds rows only for published snapshots" "0" "$($DB -t -A -c "select count(*) from symbolic_offering_eligibility e where not exists (select 1 from memorial_published_snapshots s where s.memorial_id = e.memorial_id);")"
check "QG 016: the first published snapshot opened this memorial (open-ended)" "1|true" "$($DB -t -A -c "select count(*) || '|' || bool_and(closes_at is null) from symbolic_offering_eligibility where memorial_id='$SO_MEM';")"
$DB -c "delete from symbolic_offering_eligibility where memorial_id='$SO_MEM';" >/dev/null
check "a published memorial with no eligibility row refuses a gesture" "refused" "$(so_record offrandes-c1 bougie "$(svc "select gen_random_uuid();")")"
check "the closed refusal stores no gesture" "0" "$(so_count "$SO_MEM")"
check "the closed refusal never charges the memorial's counter" "0" "$($DB -t -A -c "select count(*) from symbolic_offering_rate_limits where memorial_id='$SO_MEM';")"

# Opened: recorded once, idempotently.
so_open "$SO_MEM"
SO_KEY=$(svc "select gen_random_uuid();")
check "an eligible published memorial records a gesture" "recorded" "$(so_record offrandes-c1 bougie "$SO_KEY")"
check "the gesture is stored anonymous, unread, with its kind" "bougie|true" "$($DB -t -A -c "select kind || '|' || (read_at is null) from symbolic_offerings where memorial_id='$SO_MEM';")"
check "the same idempotency key is reported as a duplicate" "duplicate" "$(so_record offrandes-c1 bougie "$SO_KEY")"
check "a duplicate stores nothing new" "1" "$(so_count "$SO_MEM")"
check "a duplicate is not counted against the ceilings" "1|1" "$($DB -t -A -c "select hour_count || '|' || day_count from symbolic_offering_rate_limits where memorial_id='$SO_MEM';")"
check "each kind is accepted (lys)" "recorded" "$(so_record offrandes-c1 lys "$(svc "select gen_random_uuid();")")"
check "each kind is accepted (coeur)" "recorded" "$(so_record offrandes-c1 coeur "$(svc "select gen_random_uuid();")")"

# Concurrent retries of one gesture: exactly one row.
SO_RACE_KEY=$(svc "select gen_random_uuid();")
for i in 1 2 3 4 5; do
  (so_record offrandes-c1 coeur "$SO_RACE_KEY" > "$PGDATA_DIR/so_race_$i") &
done
wait
SO_RACE_OUTCOMES=$(cat "$PGDATA_DIR"/so_race_* | sort | uniq -c | awk '{print $2 "=" $1}' | tr '\n' ' ' | sed 's/ $//')
check "five concurrent retries of one gesture: one recorded, four duplicates" "duplicate=4 recorded=1" "$SO_RACE_OUTCOMES"
check "five concurrent retries store exactly one gesture" "1" "$($DB -t -A -c "select count(*) from symbolic_offerings where idempotency_key='$SO_RACE_KEY';")"

# Malformed calls raise (a server wiring bug, never a visitor answer).
svc_expect_error "an unknown kind is rejected" "select * from record_symbolic_offering_v1('offrandes-c1','rose',gen_random_uuid());" "invalid symbolic offering request"
svc_expect_error "a missing idempotency key is rejected" "select * from record_symbolic_offering_v1('offrandes-c1','lys',null);" "invalid symbolic offering request"
svc_expect_error "a blank slug is rejected" "select * from record_symbolic_offering_v1('  ','lys',gen_random_uuid());" "invalid symbolic offering request"
check "an unknown slug is refused" "refused" "$(so_record offrandes-inconnu lys "$(svc "select gen_random_uuid();")")"

# Only a published memorial, only what the live snapshot shows.
for st in draft ready editing archived; do
  m=$(so_memorial "offrandes-c1-$st" "$st" "$SNAP")
  so_open "$m"
  check "a $st memorial refuses a gesture even when eligible" "refused" "$(so_record "offrandes-c1-$st" lys "$(svc "select gen_random_uuid();")")"
  check "the $st refusal stores nothing" "0" "$(so_count "$m")"
done
SO_NOSNAP=$(so_memorial offrandes-c1-sans-instantane published "")
so_open "$SO_NOSNAP"
check "a published memorial without a live snapshot refuses" "refused" "$(so_record offrandes-c1-sans-instantane lys "$(svc "select gen_random_uuid();")")"
SO_HIDDEN=$(so_memorial offrandes-c1-masquees published '{"hero":{"displayName":"Jeanne"},"presentation":{"hiddenSections":["story","symbolicOfferings"]}}')
so_open "$SO_HIDDEN"
check "Offrandes hidden in the published snapshot refuse a gesture" "refused" "$(so_record offrandes-c1-masquees lys "$(svc "select gen_random_uuid();")")"
$DB -c "update memorial_drafts set content='{\"presentation\":{\"hiddenSections\":[\"symbolicOfferings\"]}}' where memorial_id='$SO_MEM';" >/dev/null
check "hiding them in the draft only does not close the published memorial" "recorded" "$(so_record offrandes-c1 lys "$(svc "select gen_random_uuid();")")"
SO_MALFORMED=$(so_memorial offrandes-c1-malformee published '{"hero":{"displayName":"Jeanne"},"presentation":{"hiddenSections":"symbolicOfferings"}}')
so_open "$SO_MALFORMED"
check "a malformed hiddenSections counts as nothing hidden (same rule as the app)" "recorded" "$(so_record offrandes-c1-malformee lys "$(svc "select gen_random_uuid();")")"
SO_OTHER_SKIN_ENT=$($DB -t -A -c "insert into entitlements (access_level, source, offer_id) values ('complet', 'direct','juif') returning id;")
SO_OTHER_SKIN=$($DB -t -A -c "insert into memorials (owner_id, entitlement_id, memorial_type, editorial_context, skin_id, skin_variant, language, slug, status, first_published_at) values ('$SO_OWNER','$SO_OTHER_SKIN_ENT','person','announcement','juif','light','fr','offrandes-c1-juif','published',now()) returning id;")
$DB -c "insert into memorial_published_snapshots (memorial_id, content) values ('$SO_OTHER_SKIN', '$SNAP');" >/dev/null
so_open "$SO_OTHER_SKIN"
check "a memorial of another skin refuses (the rubrique exists for Intemporel only)" "refused" "$(so_record offrandes-c1-juif lys "$(svc "select gen_random_uuid();")")"

# Eligibility window.
SO_FUTURE=$(so_memorial offrandes-c1-futur published "$SNAP")
$DB -c "update symbolic_offering_eligibility set opens_at = now() + interval '1 day', closes_at = null where memorial_id='$SO_FUTURE';" >/dev/null
check "an eligibility that has not opened yet refuses" "refused" "$(so_record offrandes-c1-futur lys "$(svc "select gen_random_uuid();")")"
expect_error "an eligibility closing before it opens is rejected" "update symbolic_offering_eligibility set closes_at = opens_at - interval '1 second' where memorial_id='$SO_FUTURE';"

# The end of the right: no new gesture, nothing received is deleted.
SO_BEFORE_END=$(so_count "$SO_MEM")
$DB -c "update symbolic_offering_eligibility set opens_at = now() - interval '2 days', closes_at = now() - interval '1 second' where memorial_id='$SO_MEM';" >/dev/null
check "after the right has ended, a new gesture is refused" "refused" "$(so_record offrandes-c1 coeur "$(svc "select gen_random_uuid();")")"
check "after the right has ended, every gesture received is kept" "$SO_BEFORE_END" "$(so_count "$SO_MEM")"
check "after the right has ended, the owner still reads every gesture" "$SO_BEFORE_END" "$(as_owner "$SO_AUTH" "select count(*) from symbolic_offerings where memorial_id='$SO_MEM';")"
check "no trigger exists on the Offrandes tables (nothing deletes on expiry)" "0" "$($DB -t -A -c "select count(*) from pg_trigger where not tgisinternal and tgrelid in ('public.symbolic_offerings'::regclass,'public.symbolic_offering_eligibility'::regclass,'public.symbolic_offering_settings'::regclass,'public.symbolic_offering_rate_limits'::regclass);")"

# Owner-only reads.
check "the owner reads the gestures of their memorials" "t" "$(as_owner "$SO_AUTH" "select count(*) > 0 from symbolic_offerings;")"
check "another owner reads none of them" "0" "$(as_owner "$SO_OTHER_AUTH" "select count(*) from symbolic_offerings;")"
expect_error "a visitor cannot read gestures" "set role anon; select count(*) from symbolic_offerings;"
expect_error "a visitor cannot insert a gesture directly" "set role anon; insert into symbolic_offerings (memorial_id, kind, idempotency_key) values ('$SO_MEM','bougie',gen_random_uuid());"
expect_error "a visitor cannot call the recording function" "set role anon; select * from record_symbolic_offering_v1('offrandes-c1','bougie',gen_random_uuid());"
expect_error "the owner cannot insert a gesture directly" "set role authenticated; set local request.jwt.claim.sub = '$SO_AUTH'; insert into symbolic_offerings (memorial_id, kind, idempotency_key) values ('$SO_MEM','bougie',gen_random_uuid());"
expect_error "the owner cannot mark a gesture read in C1" "set role authenticated; set local request.jwt.claim.sub = '$SO_AUTH'; update symbolic_offerings set read_at = now() where memorial_id='$SO_MEM';"
expect_error "the owner cannot delete a gesture" "set role authenticated; set local request.jwt.claim.sub = '$SO_AUTH'; delete from symbolic_offerings where memorial_id='$SO_MEM';"
expect_error "the owner cannot open eligibility" "set role authenticated; set local request.jwt.claim.sub = '$SO_AUTH'; insert into symbolic_offering_eligibility (memorial_id) values ('$SO_FUTURE');"
expect_error "service_role cannot open eligibility directly" "set role service_role; insert into symbolic_offering_eligibility (memorial_id) values ('$SO_NOSNAP');"
expect_error "service_role cannot loosen the ceilings" "set role service_role; update symbolic_offering_settings set max_per_hour = 1000, max_per_day = 1000;"

# Table-level integrity.
expect_error "an unknown kind cannot be stored" "insert into symbolic_offerings (memorial_id, kind, idempotency_key) values ('$SO_MEM','rose',gen_random_uuid());"
expect_error "one idempotency key cannot be stored twice for a memorial" "insert into symbolic_offerings (memorial_id, kind, idempotency_key) values ('$SO_MEM','lys','$SO_KEY');"
expect_error "read_at cannot precede created_at" "insert into symbolic_offerings (memorial_id, kind, idempotency_key, created_at, read_at) values ('$SO_MEM','lys',gen_random_uuid(), now(), now() - interval '1 day');"

# Ceilings: configurable, per memorial, refusals never counted.
$DB -c "update symbolic_offering_settings set max_per_hour = 2, max_per_day = 3;" >/dev/null
SO_RATE=$(so_memorial offrandes-c1-plafond published "$SNAP")
so_open "$SO_RATE"
check "ceiling: 1st gesture of the hour" "recorded" "$(so_record offrandes-c1-plafond bougie "$(svc "select gen_random_uuid();")")"
check "ceiling: 2nd gesture of the hour" "recorded" "$(so_record offrandes-c1-plafond lys "$(svc "select gen_random_uuid();")")"
check "ceiling: the hourly ceiling refuses the 3rd" "rate_limited" "$(so_record offrandes-c1-plafond coeur "$(svc "select gen_random_uuid();")")"
check "ceiling: the refusal stores nothing and is not counted" "2|2|2" "$($DB -t -A -c "select (select count(*) from symbolic_offerings where memorial_id='$SO_RATE') || '|' || hour_count || '|' || day_count from symbolic_offering_rate_limits where memorial_id='$SO_RATE';")"
check "ceiling: another memorial keeps its own budget" "recorded" "$(so_record offrandes-c1-malformee coeur "$(svc "select gen_random_uuid();")")"
$DB -c "update symbolic_offering_rate_limits set hour_window_started_at = now() - interval '61 minutes' where memorial_id='$SO_RATE';" >/dev/null
check "ceiling: a new hour reopens the hourly budget" "recorded" "$(so_record offrandes-c1-plafond coeur "$(svc "select gen_random_uuid();")")"
$DB -c "update symbolic_offering_rate_limits set hour_window_started_at = now() - interval '61 minutes' where memorial_id='$SO_RATE';" >/dev/null
check "ceiling: the daily ceiling still refuses in a fresh hour" "rate_limited" "$(so_record offrandes-c1-plafond coeur "$(svc "select gen_random_uuid();")")"
$DB -c "update symbolic_offering_rate_limits set day_window_started_at = now() - interval '25 hours' where memorial_id='$SO_RATE';" >/dev/null
check "ceiling: a new day reopens the daily budget" "recorded" "$(so_record offrandes-c1-plafond coeur "$(svc "select gen_random_uuid();")")"
$DB -c "delete from symbolic_offering_settings;" >/dev/null
check "without a settings row every gesture is refused (fail closed)" "refused" "$(so_record offrandes-c1-plafond lys "$(svc "select gen_random_uuid();")")"
$DB -c "insert into symbolic_offering_settings (max_per_hour, max_per_day) values (30, 200);" >/dev/null
check "the provisional ceilings are restored for the rest of the suite" "30|200" "$($DB -t -A -c "select max_per_hour || '|' || max_per_day from symbolic_offering_settings;")"

# =====================================================================
# HERITAGE Direct M1-A — free / complete access foundation
# =====================================================================
echo ""
echo "== HERITAGE Direct M1-A: free / complete access foundation =="

# --- A. Backfill, settings, D12 (no implicit level) ---
check "every existing memorial carries an explicit access level" "0" "$($DB -t -A -c "select count(*) from memorials where access_level is null;")"
check "every fixture right declares its level explicitly" "0" "$($DB -t -A -c "select count(*) from entitlements where access_level is null;")"
# QG 008: the V8 values (10 d, 45 d, no correction window, 45 d, 7 d
# recovery, 12-month quota and cycle, 6 published photos, no avis cap).
check "settings hold the V8 durations (240 h, 1080 h, none, 1080 h, 168 h) and quotas" \
  "240:00:00|1080:00:00|-|1080:00:00|168:00:00|1 year|1 year|1|1|6|-" \
  "$($DB -t -A -c "select free_publish_window || '|' || free_draft_retention || '|' || coalesce(free_correction_window::text, '-') || '|' || free_public_duration || '|' || free_private_extension || '|' || free_publication_quota_window || '|' || free_window_cycle || '|' || free_publications_per_owner || '|' || free_active_drafts_per_owner || '|' || avis_gallery_limit || '|' || coalesce(avis_gallery_rows_cap::text, '-') from memorial_access_settings;")"

M1A_OWNER=$($DB -t -A -c "insert into owners (auth_user_id, email) values (gen_random_uuid(), 'm1a-owner@example.test') returning id;")
M1A_OTHER=$($DB -t -A -c "insert into owners (auth_user_id, email) values (gen_random_uuid(), 'm1a-other@example.test') returning id;")

M1A_RIGHTS_BEFORE=$($DB -t -A -c "select count(*) from entitlements;")
check "a right cannot even be written without a level (D12, NOT NULL — correctif 2)" "23502" \
  "$($DB -v VERBOSITY=verbose -c "set role service_role; insert into entitlements (source, offer_id, external_order_id) values ('etsy','intemporel','m1a-nolevel');" 2>&1 | grep -o 'ERROR:  [0-9A-Z]\{5\}' | head -1 | sed 's/ERROR:  //' || true)"
check "that refusal writes nothing" "$M1A_RIGHTS_BEFORE" "$($DB -t -A -c "select count(*) from entitlements;")"
check "entitlements.access_level is NOT NULL" "t" "$($DB -t -A -c "select attnotnull from pg_attribute where attrelid='public.entitlements'::regclass and attname='access_level';")"
# Backstop kept: even with NOT NULL lifted inside a rolled-back
# transaction, a right without a level creates no memorial (HD500).
M1A_NOLEVEL_ENT=$($DB -t -A -c "select gen_random_uuid();")
check "redeem_entitlement refuses a right without a level, nothing implicit (HD500 backstop)" "1" \
  "$($DB -c "begin; alter table entitlements alter column access_level drop not null; insert into entitlements (id, source, offer_id) values ('$M1A_NOLEVEL_ENT','direct','intemporel'); set role service_role; select * from redeem_entitlement('$M1A_NOLEVEL_ENT','$M1A_OWNER','person','intemporel','light');" 2>&1 | grep -c 'memorial access level missing' || true)"
check "and nothing of it survives" "0|t" "$($DB -t -A -c "select count(*) from entitlements where id='$M1A_NOLEVEL_ENT';")|$($DB -t -A -c "select attnotnull from pg_attribute where attrelid='public.entitlements'::regclass and attname='access_level';")"

expect_error "an Etsy right can never be a free one" \
  "insert into entitlements (access_level, source, offer_id) values ('avis','etsy','intemporel');"
expect_error "a free right carries no activation key" \
  "insert into entitlements (access_level, source, offer_id, activation_key_hash) values ('avis','direct','intemporel','$(printf 'c%.0s' $(seq 1 64))');"
expect_error "a free right carries no order reference" \
  "insert into entitlements (access_level, source, offer_id, external_order_id) values ('avis','direct','intemporel','order-1');"
expect_error "an unknown level is refused" \
  "insert into entitlements (access_level, source, offer_id) values ('premium','direct','intemporel');"

M1A_COMPLETE_ENT=$($DB -t -A -c "insert into entitlements (access_level, source, offer_id) values ('complet','direct','intemporel') returning id;")
expect_error "a memorial cannot claim a level different from its right" \
  "insert into memorials (owner_id, entitlement_id, memorial_type, skin_id, skin_variant, access_level) values ('$M1A_OWNER','$M1A_COMPLETE_ENT','person','intemporel','light','avis');"
M1A_FORCED=$($DB -t -A -c "insert into memorials (owner_id, entitlement_id, memorial_type, skin_id, skin_variant, free_anchor_at, free_publish_until, free_draft_until) values ('$M1A_OWNER','$M1A_COMPLETE_ENT','person','intemporel','light', now(), now() + interval '1 day', now() + interval '2 days') returning id;")
check "free deadlines can never be supplied at insertion" "complet|true" "$($DB -t -A -c "select access_level || '|' || (free_anchor_at is null and free_publish_until is null and free_draft_until is null) from memorials where id='$M1A_FORCED';")"

# --- B. Etsy non-regression through the unchanged redemption ---
M1A_ETSY_ENT=$($DB -t -A -c "insert into entitlements (access_level, source, offer_id, external_order_id) values ('complet','etsy','intemporel','m1a-etsy-order') returning id;")
M1A_ETSY_MEM=$(svc "select memorial_id from redeem_entitlement('$M1A_ETSY_ENT','$M1A_OWNER','person','intemporel','light');")
check "an Etsy redemption creates a complete memorial, with no free deadline" "complet|true|redeemed" \
  "$($DB -t -A -c "select m.access_level || '|' || (m.free_anchor_at is null and m.free_public_until is null) || '|' || e.status from memorials m join entitlements e on e.id = m.entitlement_id where m.id='$M1A_ETSY_MEM';")"

# --- C. create_free_memorial_v1 and B6 (one active free draft) ---
svc_expect_error "a free memorial is Intemporel only at launch (D8)" \
  "select * from create_free_memorial_v1('$M1A_OWNER','juif','light');" "invalid free memorial request"
check "an unknown owner is refused, as a value" "refused" "$(svc "select outcome from create_free_memorial_v1(gen_random_uuid(),'intemporel','light');")"
M1A_FREE=$(svc "select outcome || '|' || memorial_id from create_free_memorial_v1('$M1A_OWNER','intemporel','light');")
M1A_FREE_MEM=$(echo "$M1A_FREE" | cut -d'|' -f2)
check "a free draft is created" "created" "$(echo "$M1A_FREE" | cut -d'|' -f1)"
check "the free memorial is an unanchored draft at level avis" "avis|draft|true" "$($DB -t -A -c "select access_level || '|' || status || '|' || (free_anchor_at is null) from memorials where id='$M1A_FREE_MEM';")"
check "its right is a redeemed, keyless, direct free right" "avis|direct|redeemed|true" "$($DB -t -A -c "select e.access_level || '|' || e.source || '|' || e.status || '|' || (e.activation_key_hash is null and e.external_order_id is null) from entitlements e join memorials m on m.entitlement_id = e.id where m.id='$M1A_FREE_MEM';")"
check "its draft row exists, like every memorial" "1" "$($DB -t -A -c "select count(*) from memorial_drafts where memorial_id='$M1A_FREE_MEM';")"
check "the creation is journaled" "free.created" "$($DB -t -A -c "select string_agg(event, ',') from memorial_access_events where memorial_id='$M1A_FREE_MEM';")"
M1A_RIGHTS_BEFORE=$($DB -t -A -c "select count(*) from entitlements;")
check "B6: a second active free draft is refused" "free_draft_limit" "$(svc "select outcome from create_free_memorial_v1('$M1A_OWNER','intemporel','light');")"
check "B6: the refusal writes nothing" "$M1A_RIGHTS_BEFORE" "$($DB -t -A -c "select count(*) from entitlements;")"

# --- D. anchor_free_memorial_v1 (B1, B14) ---
check "a foreign owner cannot anchor the draft" "refused" "$(svc "select outcome from anchor_free_memorial_v1('$M1A_FREE_MEM','$M1A_OTHER');")"
check "a complete memorial has no free anchor" "not_free" "$(svc "select outcome from anchor_free_memorial_v1('$M1A_ETSY_MEM','$M1A_OWNER');")"
check "the first confirmation anchors the draft" "anchored" "$(svc "select outcome from anchor_free_memorial_v1('$M1A_FREE_MEM','$M1A_OWNER');")"
check "B14: real durations from the anchor (10 days, 45 days, +7 days recovery), never rounded" "240|1080|1248" \
  "$($DB -t -A -c "select extract(epoch from (free_publish_until - free_anchor_at))::bigint / 3600 || '|' || extract(epoch from (free_draft_until - free_anchor_at))::bigint / 3600 || '|' || extract(epoch from (free_draft_recovery_until - free_anchor_at))::bigint / 3600 from memorials where id='$M1A_FREE_MEM';")"
M1A_ANCHOR=$($DB -t -A -c "select free_anchor_at || '|' || free_publish_until || '|' || free_draft_until from memorials where id='$M1A_FREE_MEM';")
check "a second confirmation never moves the anchor" "already_anchored" "$(svc "select outcome from anchor_free_memorial_v1('$M1A_FREE_MEM','$M1A_OWNER');")"
check "the deadlines are unchanged after the second confirmation" "$M1A_ANCHOR" "$($DB -t -A -c "select free_anchor_at || '|' || free_publish_until || '|' || free_draft_until from memorials where id='$M1A_FREE_MEM';")"
check "anchoring is journaled once" "1" "$($DB -t -A -c "select count(*) from memorial_access_events where memorial_id='$M1A_FREE_MEM' and event='free.anchored';")"

# --- E. Privileges ---
for col in access_level access_level_changed_at free_anchor_at free_publish_until free_draft_until free_corrections_until free_public_until free_private_until; do
  check "authenticated cannot write memorials.$col" "f" "$($DB -t -A -c "select has_column_privilege('authenticated','memorials','$col','UPDATE');")"
done
check "service_role cannot update memorials directly (only through functions)" "f" "$($DB -t -A -c "select has_table_privilege('service_role','memorials','UPDATE');")"
for t in memorial_access_settings memorial_access_events; do
  for r in anon authenticated service_role; do
    check "$r has no privilege on $t" "f" "$($DB -t -A -c "select has_table_privilege('$r','$t','SELECT') or has_table_privilege('$r','$t','INSERT') or has_table_privilege('$r','$t','UPDATE') or has_table_privilege('$r','$t','DELETE') or has_table_privilege('$r','$t','TRUNCATE');")"
  done
  check "$t has RLS enabled" "t" "$($DB -t -A -c "select relrowsecurity from pg_class where oid='public.$t'::regclass;")"
done
for f in "create_free_memorial_v1(uuid,text,text)" "anchor_free_memorial_v1(uuid,uuid)" "upgrade_memorial_access_v1(uuid,uuid,text,text)"; do
  check "$f executable by service_role only" "false|false|true" "$($DB -t -A -c "select has_function_privilege('anon','public.$f','EXECUTE') || '|' || has_function_privilege('authenticated','public.$f','EXECUTE') || '|' || has_function_privilege('service_role','public.$f','EXECUTE');")"
done

# --- F. First free publication guard ---
m1a_ready() {
  # $1 memorial, $2 slug
  $DB -c "update memorials set language='fr', slug='$2', status='ready' where id='$1'; update memorial_drafts set content='{\"hero\":{\"displayName\":\"Avis\",\"photo\":null}}' where memorial_id='$1';" >/dev/null
}
m1a_publish() {
  # $1 memorial, $2 owner, $3 slug — returns the outcome on stdout, errors on stderr
  svc "select first_published_at from commit_memorial_publication_v1('$1','$2',0,'ready',null,'fr','intemporel','light','$3','{\"hero\":{\"displayName\":\"Avis\",\"photo\":null}}');"
}
m1a_publish_sql() {
  echo "select * from commit_memorial_publication_v1('$1','$2',0,'ready',null,'fr','intemporel','light','$3','{\"hero\":{\"displayName\":\"Avis\",\"photo\":null}}');"
}

# F1. No confirmed e-mail: no free publication.
M1A_NOANCHOR_OWNER=$($DB -t -A -c "insert into owners (auth_user_id, email) values (gen_random_uuid(), 'm1a-noanchor@example.test') returning id;")
M1A_NOANCHOR_MEM=$(svc "select memorial_id from create_free_memorial_v1('$M1A_NOANCHOR_OWNER','intemporel','light');")
m1a_ready "$M1A_NOANCHOR_MEM" "m1a-no-anchor"
svc_expect_error "a free publication requires a confirmed e-mail (anchor)" "$(m1a_publish_sql "$M1A_NOANCHOR_MEM" "$M1A_NOANCHOR_OWNER" m1a-no-anchor)" "requires a confirmed e-mail"
check "the refused publication leaves no snapshot and no first date" "0|ready|true" "$($DB -t -A -c "select (select count(*) from memorial_published_snapshots where memorial_id='$M1A_NOANCHOR_MEM') || '|' || status || '|' || (first_published_at is null) from memorials where id='$M1A_NOANCHOR_MEM';")"

# F2. Window closed: no free publication, even never published.
M1A_LATE_OWNER=$($DB -t -A -c "insert into owners (auth_user_id, email) values (gen_random_uuid(), 'm1a-late@example.test') returning id;")
M1A_LATE_MEM=$(svc "select memorial_id from create_free_memorial_v1('$M1A_LATE_OWNER','intemporel','light');")
svc "select outcome from anchor_free_memorial_v1('$M1A_LATE_MEM','$M1A_LATE_OWNER');" >/dev/null
$DB -c "update memorials set free_anchor_at = now() - interval '11 days', free_publish_until = now() - interval '1 day', free_draft_until = now() + interval '34 days' where id='$M1A_LATE_MEM';" >/dev/null
m1a_ready "$M1A_LATE_MEM" "m1a-late"
svc_expect_error "after the 10-day window the free publication is refused" "$(m1a_publish_sql "$M1A_LATE_MEM" "$M1A_LATE_OWNER" m1a-late)" "free publication window closed"
check "the draft stays editable-state draft/ready and unpublished" "ready|true" "$($DB -t -A -c "select status || '|' || (first_published_at is null) from memorials where id='$M1A_LATE_MEM';")"

# F3. Within the window: published, deadlines posed from the real first publication.
m1a_ready "$M1A_FREE_MEM" "m1a-free"
M1A_FIRST=$(m1a_publish "$M1A_FREE_MEM" "$M1A_OWNER" m1a-free)
check "a free publication inside the window succeeds" "published" "$($DB -t -A -c "select status from memorials where id='$M1A_FREE_MEM';")"
check "B14: no correction window (L06), 45 days public, 7 days recovery, real durations from the first publication" "-|1080|168" \
  "$($DB -t -A -c "select coalesce(free_corrections_until::text, '-') || '|' || extract(epoch from (free_public_until - first_published_at))::bigint / 3600 || '|' || extract(epoch from (free_private_until - free_public_until))::bigint / 3600 from memorials where id='$M1A_FREE_MEM';")"
check "the deadlines start at the exact first publication" "$M1A_FIRST" "$($DB -t -A -c "select first_published_at from memorials where id='$M1A_FREE_MEM';")"
check "the first free publication is journaled" "1" "$($DB -t -A -c "select count(*) from memorial_access_events where memorial_id='$M1A_FREE_MEM' and event='free.first_published';")"

# F4. B6: one free publication per owner (e-mail) over 12 months.
# QG 008 correction: the quota limits FREE PUBLICATION only, never the Builder.
M1A_F4=$(svc "select outcome || '|' || memorial_id from create_free_memorial_v1('$M1A_OWNER','intemporel','light');")
check "after a free publication, the Builder is never blocked: a new draft is created" "created" "$(echo "$M1A_F4" | cut -d'|' -f1)"
check "... but its anchoring opens no free window for 12 months (quota used)" "anchored_without_free_publication" \
  "$(svc "select outcome from anchor_free_memorial_v1('$(echo "$M1A_F4" | cut -d'|' -f2)','$M1A_OWNER');")"
$DB -c "update memorials set status='archived' where id='$(echo "$M1A_F4" | cut -d'|' -f2)';" >/dev/null
# Backstop: the publication guard refuses a second free publication by
# itself, whatever path produced an anchored avis draft.
M1A_SECOND_ENT=$($DB -t -A -c "insert into entitlements (access_level, source, offer_id, status, owner_id, redeemed_at) values ('avis','direct','intemporel','redeemed','$M1A_OWNER', now()) returning id;")
M1A_SECOND_MEM=$($DB -t -A -c "insert into memorials (owner_id, entitlement_id, memorial_type, skin_id, skin_variant) values ('$M1A_OWNER','$M1A_SECOND_ENT','person','intemporel','light') returning id;")
$DB -c "update memorials set free_anchor_at = now(), free_publish_until = now() + interval '7 days', free_draft_until = now() + interval '45 days' where id='$M1A_SECOND_MEM';" >/dev/null
m1a_ready "$M1A_SECOND_MEM" "m1a-second"
svc_expect_error "B6: a second free publication within 12 months is refused" "$(m1a_publish_sql "$M1A_SECOND_MEM" "$M1A_OWNER" m1a-second)" "free publication quota reached"
check "the refused second publication changes nothing" "ready|true|0" "$($DB -t -A -c "select status || '|' || (first_published_at is null) || '|' || (select count(*) from memorial_published_snapshots where memorial_id='$M1A_SECOND_MEM') from memorials where id='$M1A_SECOND_MEM';")"
$DB -c "update memorial_access_events set created_at = created_at - interval '13 months' where owner_id='$M1A_OWNER' and event='free.first_published';" >/dev/null
M1A_SECOND_FIRST=$(m1a_publish "$M1A_SECOND_MEM" "$M1A_OWNER" m1a-second)
check "B6: after 12 months a new free publication is allowed" "published" "$($DB -t -A -c "select status from memorials where id='$M1A_SECOND_MEM';")"

# F5. A complete memorial is untouched by the free guard.
M1A_COMPLETE_MEM=$($DB -t -A -c "insert into memorials (owner_id, entitlement_id, memorial_type, skin_id, skin_variant, language, slug, status) values ('$M1A_OTHER', (select id from entitlements where id='$M1A_COMPLETE_ENT' and not exists (select 1 from memorials where entitlement_id='$M1A_COMPLETE_ENT')), 'person','intemporel','light','fr','m1a-complete','ready') returning id;" 2>/dev/null || true)
if [ -z "$M1A_COMPLETE_MEM" ]; then
  M1A_COMPLETE_ENT2=$($DB -t -A -c "insert into entitlements (access_level, source, offer_id) values ('complet','direct','intemporel') returning id;")
  M1A_COMPLETE_MEM=$($DB -t -A -c "insert into memorials (owner_id, entitlement_id, memorial_type, skin_id, skin_variant, language, slug, status) values ('$M1A_OTHER','$M1A_COMPLETE_ENT2','person','intemporel','light','fr','m1a-complete','ready') returning id;")
fi
$DB -c "update memorial_drafts set content='{\"hero\":{\"displayName\":\"Avis\",\"photo\":null}}' where memorial_id='$M1A_COMPLETE_MEM';" >/dev/null
m1a_publish "$M1A_COMPLETE_MEM" "$M1A_OTHER" m1a-complete >/dev/null
check "a complete memorial publishes without anchor nor free deadline" "published|true|0" "$($DB -t -A -c "select status || '|' || (free_public_until is null) || '|' || (select count(*) from memorial_access_events where memorial_id='$M1A_COMPLETE_MEM') from memorials where id='$M1A_COMPLETE_MEM';")"

# F6. Concurrency: two free first publications of one owner, at once.
M1A_RACE_OWNER=$($DB -t -A -c "insert into owners (auth_user_id, email) values (gen_random_uuid(), 'm1a-race@example.test') returning id;")
M1A_RACE_A=$(svc "select memorial_id from create_free_memorial_v1('$M1A_RACE_OWNER','intemporel','light');")
M1A_RACE_B_ENT=$($DB -t -A -c "insert into entitlements (access_level, source, offer_id, status, owner_id, redeemed_at) values ('avis','direct','intemporel','redeemed','$M1A_RACE_OWNER', now()) returning id;")
M1A_RACE_B=$($DB -t -A -c "insert into memorials (owner_id, entitlement_id, memorial_type, skin_id, skin_variant) values ('$M1A_RACE_OWNER','$M1A_RACE_B_ENT','person','intemporel','light') returning id;")
for m in "$M1A_RACE_A" "$M1A_RACE_B"; do
  svc "select outcome from anchor_free_memorial_v1('$m','$M1A_RACE_OWNER');" >/dev/null
done
m1a_ready "$M1A_RACE_A" "m1a-race-a"; m1a_ready "$M1A_RACE_B" "m1a-race-b"
M1A_CONC="$PGDATA_DIR/concurrency-m1a-publication"; mkdir -p "$M1A_CONC"
i=0
for pair in "$M1A_RACE_A:m1a-race-a" "$M1A_RACE_B:m1a-race-b"; do
  i=$((i + 1)); mem=${pair%%:*}; slug=${pair##*:}
  (
    rc=0
    $DB -t -A -c "set role service_role; select pg_sleep(0.7); $(m1a_publish_sql "$mem" "$M1A_RACE_OWNER" "$slug")" >"$M1A_CONC/$i.out" 2>"$M1A_CONC/$i.err" || rc=$?
    echo "$rc" >"$M1A_CONC/$i.rc"
  ) &
done
wait
check "B6 under concurrency: exactly one of two simultaneous free publications succeeds" "1" "$(cat "$M1A_CONC"/1.rc "$M1A_CONC"/2.rc | grep -c '^0$' || true)"
check "the loser is refused by the quota, not by a crash" "1" "$(cat "$M1A_CONC"/1.err "$M1A_CONC"/2.err | grep -c 'free publication quota reached' || true)"
check "exactly one free publication is journaled for the owner" "1" "$($DB -t -A -c "select count(*) from memorial_access_events where owner_id='$M1A_RACE_OWNER' and event='free.first_published';")"
check "the second draft inherited the address's anchor and deadlines" "1|1" "$($DB -t -A -c "select count(distinct (free_anchor_at, free_publish_until, free_draft_until)) || '|' || (select count(*) from memorial_access_events where owner_id='$M1A_RACE_OWNER' and event='free.window_opened') from memorials where id in ('$M1A_RACE_A','$M1A_RACE_B');")"

# F7. One free window per verified e-mail address (correctif 1).
m1a_age() {
  # $1 owner, $2 interval — moves the owner's whole free history back in time
  $DB -c "update memorial_access_events set created_at = created_at - interval '$2' where owner_id='$1'; update memorials set free_anchor_at = free_anchor_at - interval '$2', free_publish_until = free_publish_until - interval '$2', free_draft_until = free_draft_until - interval '$2', free_draft_recovery_until = free_draft_recovery_until - interval '$2', first_published_at = first_published_at - interval '$2', free_corrections_until = free_corrections_until - interval '$2', free_public_until = free_public_until - interval '$2', free_private_until = free_private_until - interval '$2' where owner_id='$1';" >/dev/null
}
m1a_avis_draft() {
  # $1 owner — an avis draft made outside create_free_memorial_v1
  local ent
  ent=$($DB -t -A -c "insert into entitlements (access_level, source, offer_id, status, owner_id, redeemed_at) values ('avis','direct','intemporel','redeemed','$1', now()) returning id;")
  $DB -t -A -c "insert into memorials (owner_id, entitlement_id, memorial_type, skin_id, skin_variant) values ('$1','$ent','person','intemporel','light') returning id;"
}
M1A_BYP_OWNER=$($DB -t -A -c "insert into owners (auth_user_id, email) values (gen_random_uuid(), 'm1a-bypass@example.test') returning id;")
M1A_BYP_D1=$(svc "select memorial_id from create_free_memorial_v1('$M1A_BYP_OWNER','intemporel','light');")
check "the first confirmation opens the address's free window" "anchored|1" "$(svc "select outcome from anchor_free_memorial_v1('$M1A_BYP_D1','$M1A_BYP_OWNER');")|$($DB -t -A -c "select count(*) from memorial_access_events where owner_id='$M1A_BYP_OWNER' and event='free.window_opened';")"
$DB -c "update memorials set status='archived' where id='$M1A_BYP_D1';" >/dev/null
M1A_BYP_D2=$(svc "select outcome || '|' || memorial_id from create_free_memorial_v1('$M1A_BYP_OWNER','intemporel','light');")
check "inside the window, an abandoned draft may be replaced" "created" "$(echo "$M1A_BYP_D2" | cut -d'|' -f1)"
M1A_BYP_D2=$(echo "$M1A_BYP_D2" | cut -d'|' -f2)
check "the replacement inherits the address's anchor: no new 10 days" "anchored|t" "$(svc "select outcome from anchor_free_memorial_v1('$M1A_BYP_D2','$M1A_BYP_OWNER');")|$($DB -t -A -c "select (a.free_anchor_at = b.free_anchor_at and a.free_publish_until = b.free_publish_until and a.free_draft_until = b.free_draft_until) from memorials a, memorials b where a.id='$M1A_BYP_D1' and b.id='$M1A_BYP_D2';")"
check "the window is opened once per cycle" "1" "$($DB -t -A -c "select count(*) from memorial_access_events where owner_id='$M1A_BYP_OWNER' and event='free.window_opened';")"

m1a_age "$M1A_BYP_OWNER" '10 days'
$DB -c "update memorials set status='archived' where id='$M1A_BYP_D2';" >/dev/null
M1A_BYP_D3=$(svc "select outcome || '|' || memorial_id from create_free_memorial_v1('$M1A_BYP_OWNER','intemporel','light');")
check "after the 10 days, the Builder is never blocked: a new draft is created" "created" "$(echo "$M1A_BYP_D3" | cut -d'|' -f1)"
M1A_BYP_D3=$(echo "$M1A_BYP_D3" | cut -d'|' -f2)
check "outside the window, it is anchored with NO free window and no new window is opened" "anchored_without_free_publication|1|t" \
  "$(svc "select outcome from anchor_free_memorial_v1('$M1A_BYP_D3','$M1A_BYP_OWNER');")|$($DB -t -A -c "select count(*) from memorial_access_events where owner_id='$M1A_BYP_OWNER' and event='free.window_opened';")|$($DB -t -A -c "select free_publish_until = free_anchor_at from memorials where id='$M1A_BYP_D3';")"
check "re-anchoring it does not open a window either" "already_anchored" "$(svc "select outcome from anchor_free_memorial_v1('$M1A_BYP_D3','$M1A_BYP_OWNER');")"
m1a_ready "$M1A_BYP_D3" "m1a-bypass-3"
svc_expect_error "and it cannot be published for free" "$(m1a_publish_sql "$M1A_BYP_D3" "$M1A_BYP_OWNER" m1a-bypass-3)" "free publication window closed"
$DB -c "update memorials set status='archived' where id='$M1A_BYP_D3';" >/dev/null

m1a_age "$M1A_BYP_OWNER" '12 months'
M1A_BYP_D4=$(svc "select outcome || '|' || memorial_id from create_free_memorial_v1('$M1A_BYP_OWNER','intemporel','light');")
check "renewal: 12 months later, without free publication, a new draft may be created" "created" "$(echo "$M1A_BYP_D4" | cut -d'|' -f1)"
M1A_BYP_D4=$(echo "$M1A_BYP_D4" | cut -d'|' -f2)
check "renewal: the new confirmation opens a new window, now" "anchored|2|t" "$(svc "select outcome from anchor_free_memorial_v1('$M1A_BYP_D4','$M1A_BYP_OWNER');")|$($DB -t -A -c "select count(*) from memorial_access_events where owner_id='$M1A_BYP_OWNER' and event='free.window_opened';")|$($DB -t -A -c "select free_anchor_at > now() - interval '1 minute' from memorials where id='$M1A_BYP_D4';")"
m1a_ready "$M1A_BYP_D4" "m1a-bypass-4"
m1a_publish "$M1A_BYP_D4" "$M1A_BYP_OWNER" m1a-bypass-4 >/dev/null
check "renewal: the new cycle's free publication succeeds" "published" "$($DB -t -A -c "select status from memorials where id='$M1A_BYP_D4';")"

# A cycle older than 12 months does not reopen while the last free
# publication is younger than 12 months: never two free publications
# less than 12 months apart.
M1A_PUB_OWNER=$($DB -t -A -c "insert into owners (auth_user_id, email) values (gen_random_uuid(), 'm1a-publisher@example.test') returning id;")
M1A_PUB_D1=$(svc "select memorial_id from create_free_memorial_v1('$M1A_PUB_OWNER','intemporel','light');")
svc "select outcome from anchor_free_memorial_v1('$M1A_PUB_D1','$M1A_PUB_OWNER');" >/dev/null
m1a_ready "$M1A_PUB_D1" "m1a-publisher-1"
m1a_publish "$M1A_PUB_D1" "$M1A_PUB_OWNER" m1a-publisher-1 >/dev/null
m1a_age "$M1A_PUB_OWNER" '12 months 1 day'
$DB -c "update memorial_access_events set created_at = created_at + interval '6 days' where owner_id='$M1A_PUB_OWNER' and event='free.first_published';" >/dev/null
M1A_PUB_D2=$(svc "select outcome || '|' || memorial_id from create_free_memorial_v1('$M1A_PUB_OWNER','intemporel','light');")
check "renewal waits until the last free publication is 12 months old (draft created, no free window)" "created|anchored_without_free_publication" \
  "$(echo "$M1A_PUB_D2" | cut -d'|' -f1)|$(svc "select outcome from anchor_free_memorial_v1('$(echo "$M1A_PUB_D2" | cut -d'|' -f2)','$M1A_PUB_OWNER');")"
M1A_PUB_D2=$(echo "$M1A_PUB_D2" | cut -d'|' -f2)
$DB -c "update memorial_access_events set created_at = created_at - interval '6 days' where owner_id='$M1A_PUB_OWNER' and event='free.first_published';" >/dev/null
check "then the SAME draft receives the new cycle's 10-day window, its preparation unchanged" "free_window_opened|240|t" \
  "$(svc "select outcome from anchor_free_memorial_v1('$M1A_PUB_D2','$M1A_PUB_OWNER');")|$($DB -t -A -c "select round(extract(epoch from (free_publish_until - now())) / 3600) from memorials where id='$M1A_PUB_D2';")|$($DB -t -A -c "select free_draft_until = free_anchor_at + interval '1080 hours' from memorials where id='$M1A_PUB_D2';")"

# Concurrency: two drafts confirmed at the same instant open ONE window.
M1A_RACE2_OWNER=$($DB -t -A -c "insert into owners (auth_user_id, email) values (gen_random_uuid(), 'm1a-race2@example.test') returning id;")
M1A_RACE2_A=$(m1a_avis_draft "$M1A_RACE2_OWNER")
M1A_RACE2_B=$(m1a_avis_draft "$M1A_RACE2_OWNER")
M1A_CONC_A="$PGDATA_DIR/concurrency-m1a-anchor"; mkdir -p "$M1A_CONC_A"
i=0
for mem in "$M1A_RACE2_A" "$M1A_RACE2_B"; do
  i=$((i + 1))
  (
    rc=0
    $DB -t -A -c "set role service_role; select pg_sleep(0.7); select outcome from anchor_free_memorial_v1('$mem','$M1A_RACE2_OWNER');" >"$M1A_CONC_A/$i.out" 2>"$M1A_CONC_A/$i.err" || rc=$?
    echo "$rc" >"$M1A_CONC_A/$i.rc"
  ) &
done
wait
check "two simultaneous confirmations: both anchored, no error" "anchored anchored|0 0" "$(cat "$M1A_CONC_A"/1.out "$M1A_CONC_A"/2.out | grep -v '^$' | tr '\n' ' ' | sed 's/ $//')|$(cat "$M1A_CONC_A"/1.rc "$M1A_CONC_A"/2.rc | tr '\n' ' ' | sed 's/ $//')"
check "two simultaneous confirmations open exactly one window, shared" "1|1" "$($DB -t -A -c "select (select count(*) from memorial_access_events where owner_id='$M1A_RACE2_OWNER' and event='free.window_opened') || '|' || count(distinct free_anchor_at) from memorials where id in ('$M1A_RACE2_A','$M1A_RACE2_B');")"

# Owner = verified e-mail address.
expect_error "a second account cannot take the same e-mail address, whatever its case" \
  "insert into owners (auth_user_id, email) values (gen_random_uuid(), 'M1A-Bypass@Example.TEST');"
check "no application role can change an owner's e-mail" "false|false|false" "$($DB -t -A -c "select has_column_privilege('anon','owners','email','UPDATE') || '|' || has_column_privilege('authenticated','owners','email','UPDATE') || '|' || has_column_privilege('service_role','owners','email','UPDATE');")"
check "even the database owner cannot change the e-mail of an owner with a free history (HD423)" "1" \
  "$($DB -c "update owners set email = 'm1a-bypass-new@example.test' where id='$M1A_BYP_OWNER';" 2>&1 | grep -c 'bound to its free access history' || true)"
M1A_PLAIN_OWNER=$($DB -t -A -c "insert into owners (auth_user_id, email) values (gen_random_uuid(), 'm1a-plain@example.test') returning id;")
$DB -c "update owners set email = 'm1a-plain-2@example.test' where id='$M1A_PLAIN_OWNER';" >/dev/null
check "an owner without free history is unaffected" "m1a-plain-2@example.test" "$($DB -t -A -c "select email from owners where id='$M1A_PLAIN_OWNER';")"
check "the window helper is executable by no role" "false|false|false" "$($DB -t -A -c "select has_function_privilege('anon','public.free_access_window_v1(uuid,timestamptz)','EXECUTE') || '|' || has_function_privilege('authenticated','public.free_access_window_v1(uuid,timestamptz)','EXECUTE') || '|' || has_function_privilege('service_role','public.free_access_window_v1(uuid,timestamptz)','EXECUTE');")"

# --- G. Gallery in avis: preparation is free, the PUBLISHED copy holds six (QG 008) ---
M1A_GAL_OWNER=$($DB -t -A -c "insert into owners (auth_user_id, email) values (gen_random_uuid(), 'm1a-gallery@example.test') returning id;")
M1A_GAL_MEM=$(svc "select memorial_id from create_free_memorial_v1('$M1A_GAL_OWNER','intemporel','light');")
m1a_reserve() {
  # $1 memorial, $2 owner -> media id or error
  local id
  id=$(svc "select gen_random_uuid();")
  svc "select id from reserve_memorial_media_upload_v1('$1','$2','$id','$1/$id/original.jpg','gallery','image/jpeg');"
}
M1A_GAL_OK=0
for n in 1 2 3 4 5 6 7 8 9 10 11 12 13; do
  if m1a_reserve "$M1A_GAL_MEM" "$M1A_GAL_OWNER" >/dev/null 2>&1; then M1A_GAL_OK=$((M1A_GAL_OK + 1)); fi
done
check "V8 §3.2: an avis draft may prepare more than six gallery photos (13 uploads accepted)" "13" "$M1A_GAL_OK"
M1A_DIRECT=$(svc "select gen_random_uuid();")
check "a direct service_role insert is not blocked either (no avis cap by default)" "1" \
  "$(svc "insert into media (id, memorial_id, owner_id, storage_path, media_type, mime_type, purpose, status) values ('$M1A_DIRECT','$M1A_GAL_MEM','$M1A_GAL_OWNER','$M1A_GAL_MEM/$M1A_DIRECT/original.jpg','photo','image/jpeg','gallery','pending');" >/dev/null 2>&1 && echo 1 || echo 0)"
M1A_HERO=$(svc "select gen_random_uuid();")
check "the Hero photograph is reserved as before" "$M1A_HERO" "$(svc "select id from reserve_memorial_media_upload_v1('$M1A_GAL_MEM','$M1A_GAL_OWNER','$M1A_HERO','$M1A_GAL_MEM/$M1A_HERO/original.jpg','hero','image/jpeg');")"

# The optional storage cap (L09 / QG 017) still works when set in data.
$DB -c "update memorial_access_settings set avis_gallery_rows_cap = 14 where id;" >/dev/null
M1A_CAP=$(svc "select gen_random_uuid();")
svc_expect_error "with an avis cap set in data (14), the 15th gallery row is refused" \
  "select * from reserve_memorial_media_upload_v1('$M1A_GAL_MEM','$M1A_GAL_OWNER','$M1A_CAP','$M1A_GAL_MEM/$M1A_CAP/original.jpg','gallery','image/jpeg');" \
  "free gallery storage cap reached"

# Concurrency on that optional cap: two uploads for the last place.
$DB -c "update memorial_access_settings set avis_gallery_rows_cap = 6 where id;" >/dev/null
M1A_LAST_OWNER=$($DB -t -A -c "insert into owners (auth_user_id, email) values (gen_random_uuid(), 'm1a-last@example.test') returning id;")
M1A_LAST_MEM=$(svc "select memorial_id from create_free_memorial_v1('$M1A_LAST_OWNER','intemporel','light');")
for n in 1 2 3 4 5; do m1a_reserve "$M1A_LAST_MEM" "$M1A_LAST_OWNER" >/dev/null; done
M1A_CONC_G="$PGDATA_DIR/concurrency-m1a-gallery"; mkdir -p "$M1A_CONC_G"
for i in 1 2; do
  (
    rc=0
    id=$(svc "select gen_random_uuid();")
    $DB -t -A -c "set role service_role; select pg_sleep(0.7); select id from reserve_memorial_media_upload_v1('$M1A_LAST_MEM','$M1A_LAST_OWNER','$id','$M1A_LAST_MEM/$id/original.jpg','gallery','image/jpeg');" >"$M1A_CONC_G/$i.out" 2>"$M1A_CONC_G/$i.err" || rc=$?
    echo "$rc" >"$M1A_CONC_G/$i.rc"
  ) &
done
wait
check "optional cap under concurrency: exactly one of two uploads for the last place wins" "1" "$(cat "$M1A_CONC_G"/1.rc "$M1A_CONC_G"/2.rc | grep -c '^0$' || true)"
check "the memorial holds exactly the capped six gallery rows" "6" "$($DB -t -A -c "select count(*) from media where memorial_id='$M1A_LAST_MEM' and purpose='gallery';")"
$DB -c "update memorial_access_settings set avis_gallery_rows_cap = null where id;" >/dev/null

# The draft of an avis may reference more than six photos; the published copy may not.
M1A_SEVEN_ITEMS=$(for n in 1 2 3 4 5 6 7; do printf '{"mediaId":"%s"},' "$(svc "select gen_random_uuid();")"; done | sed 's/,$//')
$DB -c "update memorial_drafts set content='{\"gallery\":{\"items\":[$M1A_SEVEN_ITEMS]}}' where memorial_id='$M1A_GAL_MEM';" >/dev/null
check "an avis draft may reference seven gallery photos (preparation)" "7" "$($DB -t -A -c "select jsonb_array_length(content->'gallery'->'items') from memorial_drafts where memorial_id='$M1A_GAL_MEM';")"
$DB -c "update memorial_drafts set content='{\"gallery\":{\"items\":[$M1A_SEVEN_ITEMS]}}' where memorial_id='$M1A_COMPLETE_MEM';" >/dev/null
check "a complete draft is not limited to six" "7" "$($DB -t -A -c "select jsonb_array_length(content->'gallery'->'items') from memorial_drafts where memorial_id='$M1A_COMPLETE_MEM';")"

# F8. QG guarantee: an existing free draft stays editable until A+45,
# even once free publication ended at A+10 — the replacement draft too.
M1A_KEEP_OWNER=$($DB -t -A -c "insert into owners (auth_user_id, email) values (gen_random_uuid(), 'm1a-keep@example.test') returning id;")
M1A_KEEP_D1=$(svc "select memorial_id from create_free_memorial_v1('$M1A_KEEP_OWNER','intemporel','light');")
svc "select outcome from anchor_free_memorial_v1('$M1A_KEEP_D1','$M1A_KEEP_OWNER');" >/dev/null
$DB -c "update memorials set status='archived' where id='$M1A_KEEP_D1';" >/dev/null
M1A_KEEP=$(svc "select memorial_id from create_free_memorial_v1('$M1A_KEEP_OWNER','intemporel','light');")
svc "select outcome from anchor_free_memorial_v1('$M1A_KEEP','$M1A_KEEP_OWNER');" >/dev/null
m1a_ready "$M1A_KEEP" "m1a-keep"
m1a_publish_current_sql() {
  # $1 memorial, $2 owner, $3 slug — publishes the draft as it stands now
  # (read as the database owner: service_role has no read on drafts)
  local rev content
  rev=$($DB -t -A -c "select revision from memorial_drafts where memorial_id='$1';")
  content=$($DB -t -A -c "select content::text from memorial_drafts where memorial_id='$1';")
  echo "select * from commit_memorial_publication_v1('$1','$2',$rev,'ready',null,'fr','intemporel','light','$3','$content');"
}
m1a_edit() {
  # $1 memorial, $2 owner, $3 text -> new revision
  svc "select revision from commit_memorial_draft_edit_v1('$1','$2',(select revision from memorial_drafts where memorial_id='$1'),'ready',null,'{\"hero\":{\"displayName\":\"Avis\",\"photo\":null},\"personWords\":{\"text\":\"$3\"}}','content.saved',array['content.personWords.text']);"
}
for age in '11 days' '33 days'; do
  m1a_age "$M1A_KEEP_OWNER" "$age"
  M1A_KEEP_T=$($DB -t -A -c "select round(extract(epoch from (now() - free_anchor_at)) / 86400) from memorials where id='$M1A_KEEP';")
  M1A_KEEP_REV=$($DB -t -A -c "select revision from memorial_drafts where memorial_id='$M1A_KEEP';")
  check "A+$M1A_KEEP_T: the replacement draft (inherited anchor) still saves its content" "$((M1A_KEEP_REV + 1))" "$(m1a_edit "$M1A_KEEP" "$M1A_KEEP_OWNER" "Jour $M1A_KEEP_T")"
  check "A+$M1A_KEEP_T: its configuration is still editable" "en" "$(svc "select commit_memorial_configuration_edit_v1('$M1A_KEEP','$M1A_KEEP_OWNER','ready',null,'language',(select language from memorials where id='$M1A_KEEP'),'en',array['configuration.language']);" >/dev/null; $DB -t -A -c "select language from memorials where id='$M1A_KEEP';")"
  $DB -c "update memorials set language='fr' where id='$M1A_KEEP';" >/dev/null
  check "A+$M1A_KEEP_T: a gallery photo can still be added" "1" "$(m1a_reserve "$M1A_KEEP" "$M1A_KEEP_OWNER" >/dev/null 2>&1 && echo 1 || echo 0)"
  check "A+$M1A_KEEP_T: the draft stays the owner's one active free draft (B6)" "free_draft_limit" "$(svc "select outcome from create_free_memorial_v1('$M1A_KEEP_OWNER','intemporel','light');")"
  svc_expect_error "A+$M1A_KEEP_T: only the free publication is closed" "$(m1a_publish_current_sql "$M1A_KEEP" "$M1A_KEEP_OWNER" m1a-keep)" "free publication window closed"
done
check "A+44: its deadlines are still the original ones (A+10, A+45)" "240|1080" "$($DB -t -A -c "select extract(epoch from (free_publish_until - free_anchor_at))::bigint / 3600 || '|' || extract(epoch from (free_draft_until - free_anchor_at))::bigint / 3600 from memorials where id='$M1A_KEEP';")"
check "A+44: the draft can still be upgraded to complete and published" "upgraded|published" "$(svc "select outcome from upgrade_memorial_access_v1('$M1A_KEEP','$M1A_KEEP_OWNER','direct_payment','pay-m1a-keep');")|$(svc "$(m1a_publish_current_sql "$M1A_KEEP" "$M1A_KEEP_OWNER" m1a-keep)" >/dev/null; $DB -t -A -c "select status from memorials where id='$M1A_KEEP';")"

# --- H. upgrade_memorial_access_v1: same memorial, nothing lost ---
M1A_UP_BEFORE=$($DB -t -A -c "select d.revision || '|' || md5(d.content::text) || '|' || coalesce(md5(s.content::text),'-') || '|' || m.status || '|' || coalesce(m.slug,'-') || '|' || (select count(*) from media where memorial_id=m.id) || '|' || m.first_published_at from memorials m join memorial_drafts d on d.memorial_id=m.id left join memorial_published_snapshots s on s.memorial_id=m.id where m.id='$M1A_FREE_MEM';")
svc_expect_error "an unknown upgrade source is refused" "select * from upgrade_memorial_access_v1('$M1A_FREE_MEM','$M1A_OWNER','gift','ref-1');" "invalid memorial upgrade request"
check "a foreign owner cannot upgrade" "refused" "$(svc "select outcome from upgrade_memorial_access_v1('$M1A_FREE_MEM','$M1A_OTHER','direct_payment','pay-m1a-1');")"
check "the free memorial is upgraded" "upgraded" "$(svc "select outcome from upgrade_memorial_access_v1('$M1A_FREE_MEM','$M1A_OWNER','direct_payment','pay-m1a-1');")"
check "the same memorial is now complete, with its change time" "complet|true" "$($DB -t -A -c "select access_level || '|' || (access_level_changed_at is not null) from memorials where id='$M1A_FREE_MEM';")"
check "the upgrade changes no content, copy, media, status, slug nor first date" "$M1A_UP_BEFORE" "$($DB -t -A -c "select d.revision || '|' || md5(d.content::text) || '|' || coalesce(md5(s.content::text),'-') || '|' || m.status || '|' || coalesce(m.slug,'-') || '|' || (select count(*) from media where memorial_id=m.id) || '|' || m.first_published_at from memorials m join memorial_drafts d on d.memorial_id=m.id left join memorial_published_snapshots s on s.memorial_id=m.id where m.id='$M1A_FREE_MEM';")"
check "replaying the same payment reference is idempotent" "already_complete" "$(svc "select outcome from upgrade_memorial_access_v1('$M1A_FREE_MEM','$M1A_OWNER','direct_payment','pay-m1a-1');")"
check "one payment reference upgrades one memorial only" "refused" "$(svc "select outcome from upgrade_memorial_access_v1('$M1A_GAL_MEM','$M1A_GAL_OWNER','direct_payment','pay-m1a-1');")"
check "the upgrade is journaled once, with its reference" "1|direct_payment|pay-m1a-1" "$($DB -t -A -c "select count(*) || '|' || max(source) || '|' || max(external_reference) from memorial_access_events where memorial_id='$M1A_FREE_MEM' and event='access.upgraded';")"
check "the gallery memorial is still limited until upgraded" "avis" "$($DB -t -A -c "select access_level from memorials where id='$M1A_GAL_MEM';")"
$DB -c "update memorial_access_settings set avis_gallery_rows_cap = 6 where id;" >/dev/null
check "after upgrade even an optional avis cap no longer applies" "upgraded|1" "$(svc "select outcome from upgrade_memorial_access_v1('$M1A_LAST_MEM','$M1A_LAST_OWNER','direct_payment','pay-m1a-2');")|$(m1a_reserve "$M1A_LAST_MEM" "$M1A_LAST_OWNER" >/dev/null 2>&1 && echo 1 || echo 0)"
$DB -c "update memorial_access_settings set avis_gallery_rows_cap = null where id;" >/dev/null

# --- I. M1-A preflight / postflight, same doctrine as Mission 030 ---
# QG 008: graded against $DB_M1A, the database stopped at M1-A.
# Both read-only. Against a database that already carries M1-A, the
# preflight must flag every "already applied" row; the postflight must
# report no ECHEC once the one right this section deliberately left
# without a level (the D12 refusal test above) is gone.
if $DB_M1A -f "$REPO_ROOT/supabase/verifications/m1a_preflight.sql" >/dev/null 2>"$PGDATA_DIR/preflight_error"; then
  echo "  [PASS] m1a_preflight.sql parses and executes"
  PASS=$((PASS + 1))
else
  echo "  [FAIL] m1a_preflight.sql failed: $(tr '\n' ' ' <"$PGDATA_DIR/preflight_error")"
  FAIL=$((FAIL + 1))
fi
check "m1a_preflight.sql detects that M1-A is already applied (11 rows)" "11" \
  "$($DB_M1A -t -A -f "$REPO_ROOT/supabase/verifications/m1a_preflight.sql" 2>/dev/null | grep -c "ECHEC — .*M1-A" || true)"
check "m1a_preflight.sql finds its prerequisites" "0" \
  "$($DB_M1A -t -A -f "$REPO_ROOT/supabase/verifications/m1a_preflight.sql" 2>/dev/null | grep "^2\. prerequis" | grep -c "ECHEC" || true)"

check "m1a_postflight.sql flags a right without a level" "1" \
  "$($DB_M1A -t -A -c "begin;" -c "alter table entitlements alter column access_level drop not null;" -c "insert into entitlements (source, offer_id) values ('direct','intemporel');" -f "$REPO_ROOT/supabase/verifications/m1a_postflight.sql" -c "rollback;" 2>/dev/null | grep "droits sans niveau" | grep -c "ECHEC" || true)"
if $DB_M1A -f "$REPO_ROOT/supabase/verifications/m1a_postflight.sql" >/dev/null 2>"$PGDATA_DIR/postflight_error"; then
  echo "  [PASS] m1a_postflight.sql parses and executes"
  PASS=$((PASS + 1))
else
  echo "  [FAIL] m1a_postflight.sql failed: $(tr '\n' ' ' <"$PGDATA_DIR/postflight_error")"
  FAIL=$((FAIL + 1))
fi
M1A_POSTFLIGHT=$($DB_M1A -t -A -f "$REPO_ROOT/supabase/verifications/m1a_postflight.sql" 2>/dev/null)
check "m1a_postflight.sql reports zero ECHEC against these migrations" "0" "$(echo "$M1A_POSTFLIGHT" | grep -c "ECHEC" || true)"
check "m1a_postflight.sql grades every expected control (42 OK)" "42" "$(echo "$M1A_POSTFLIGHT" | grep -c "|OK$" || true)"
# Negative proofs, each rolled back: the postflight must turn red.
check "m1a_postflight.sql turns red if the updated_at trigger stays suspended" "1" \
  "$($DB_M1A -t -A -c "begin;" -c "alter table memorials disable trigger memorials_set_updated_at;" -f "$REPO_ROOT/supabase/verifications/m1a_postflight.sql" -c "rollback;" 2>/dev/null | grep -c "ECHEC" || true)"
check "m1a_postflight.sql turns red on a client grant on the journal" "1" \
  "$($DB_M1A -t -A -c "begin;" -c "grant select on memorial_access_events to authenticated;" -f "$REPO_ROOT/supabase/verifications/m1a_postflight.sql" -c "rollback;" 2>/dev/null | grep -c "ECHEC" || true)"
check "m1a_postflight.sql turns red on a changed duration" "1" \
  "$($DB_M1A -t -A -c "begin;" -c "update memorial_access_settings set free_publish_window = interval '7 days 23 hours 59 minutes';" -f "$REPO_ROOT/supabase/verifications/m1a_postflight.sql" -c "rollback;" 2>/dev/null | grep -c "ECHEC" || true)"

# Correctif 1's complementary postflight, same doctrine.
if $DB_M1A -f "$REPO_ROOT/supabase/verifications/m1a_correctif1_postflight.sql" >/dev/null 2>"$PGDATA_DIR/postflight_error"; then
  echo "  [PASS] m1a_correctif1_postflight.sql parses and executes"
  PASS=$((PASS + 1))
else
  echo "  [FAIL] m1a_correctif1_postflight.sql failed: $(tr '\n' ' ' <"$PGDATA_DIR/postflight_error")"
  FAIL=$((FAIL + 1))
fi
M1A_C1_POSTFLIGHT=$($DB_M1A -t -A -f "$REPO_ROOT/supabase/verifications/m1a_correctif1_postflight.sql" 2>/dev/null)
check "m1a_correctif1_postflight.sql reports zero ECHEC" "0" "$(echo "$M1A_C1_POSTFLIGHT" | grep -c "ECHEC" || true)"
check "m1a_correctif1_postflight.sql grades every expected control (12 OK)" "12" "$(echo "$M1A_C1_POSTFLIGHT" | grep -c "|OK$" || true)"
check "m1a_correctif1_postflight.sql turns red on a grant of the window helper" "1" \
  "$($DB_M1A -t -A -c "begin;" -c "grant execute on function free_access_window_v1(uuid,timestamptz) to service_role;" -f "$REPO_ROOT/supabase/verifications/m1a_correctif1_postflight.sql" -c "rollback;" 2>/dev/null | grep -c "ECHEC" || true)"
check "m1a_correctif1_postflight.sql turns red if the initial anchor function is back" "1" \
  "$($DB_M1A -t -A -c "begin;" -c "create or replace function anchor_free_memorial_v1(p_memorial_id uuid, p_owner_id uuid) returns table (outcome text, free_anchor_at timestamptz, free_publish_until timestamptz, free_draft_until timestamptz) language sql security definer set search_path = '' as \$\$ select 'refused'::text, null::timestamptz, null::timestamptz, null::timestamptz \$\$;" -f "$REPO_ROOT/supabase/verifications/m1a_correctif1_postflight.sql" -c "rollback;" 2>/dev/null | grep -c "ECHEC" || true)"

# Correctif 2's complementary postflight.
if $DB_M1A -f "$REPO_ROOT/supabase/verifications/m1a_correctif2_postflight.sql" >/dev/null 2>"$PGDATA_DIR/postflight_error"; then
  echo "  [PASS] m1a_correctif2_postflight.sql parses and executes"
  PASS=$((PASS + 1))
else
  echo "  [FAIL] m1a_correctif2_postflight.sql failed: $(tr '\n' ' ' <"$PGDATA_DIR/postflight_error")"
  FAIL=$((FAIL + 1))
fi
M1A_C2_POSTFLIGHT=$($DB_M1A -t -A -f "$REPO_ROOT/supabase/verifications/m1a_correctif2_postflight.sql" 2>/dev/null)
check "m1a_correctif2_postflight.sql reports 2 OK, zero ECHEC" "2|0" "$(echo "$M1A_C2_POSTFLIGHT" | grep -c "|OK$" || true)|$(echo "$M1A_C2_POSTFLIGHT" | grep -c "ECHEC" || true)"
check "m1a_correctif2_postflight.sql turns red if the level becomes optional again" "1" \
  "$($DB_M1A -t -A -c "begin;" -c "alter table entitlements alter column access_level drop not null;" -f "$REPO_ROOT/supabase/verifications/m1a_correctif2_postflight.sql" -c "rollback;" 2>/dev/null | grep -c "ECHEC" || true)"

echo ""
# =====================================================================
# QG 008 — Lot 1 : droits gratuit / complet alignés sur la V8
# =====================================================================
# Time is simulated only by moving an owner's stored history back
# (m1a_age), in this throwaway database: no clock is faked and no
# function is changed for testing.
echo ""
echo "== QG 008 Lot 1: free / complete rights aligned on V8 =="

q8_owner() {
  $DB -t -A -c "insert into owners (auth_user_id, email) values (gen_random_uuid(), '$1@example.test') returning id;"
}
q8_draft() {
  svc "select memorial_id from create_free_memorial_v1('$1','intemporel','light');"
}
q8_anchor() {
  svc "select outcome from anchor_free_memorial_v1('$1','$2');"
}
q8_ready() {
  # $1 memorial, $2 slug, $3 draft content (JSON)
  $DB -c "update memorials set language='fr', slug='$2', status='ready' where id='$1'; update memorial_drafts set content='$3' where memorial_id='$1';" >/dev/null
}
q8_v2_sql() {
  # $1 memorial, $2 owner, $3 slug, $4 expected level, $5 published content (JSON)
  local rev content
  rev=$($DB -t -A -c "select revision from memorial_drafts where memorial_id='$1';")
  content=$($DB -t -A -c "select content::text from memorial_drafts where memorial_id='$1';")
  echo "select * from commit_memorial_publication_v2('$1','$2',$rev,'ready',null,'fr','intemporel','light','$3','$4','$content','$5');"
}
q8_status() {
  $DB -t -A -c "select status from memorials where id='$1';"
}
q8_published_count() {
  $DB -t -A -c "select count(*) from memorial_access_events where owner_id='$1' and event='free.first_published';"
}
Q8_HERO='{"hero":{"displayName":"Avis","photo":null}}'
ADMIN_Q8=$($DB -t -A -c "select gen_random_uuid();")

# --- Q1. J10: the free publication window, at its exact boundary ---
Q8_J10A_OWNER=$(q8_owner q8-j10-before)
Q8_J10A=$(q8_draft "$Q8_J10A_OWNER"); q8_anchor "$Q8_J10A" "$Q8_J10A_OWNER" >/dev/null
q8_ready "$Q8_J10A" q8-j10-before "$Q8_HERO"
m1a_age "$Q8_J10A_OWNER" '239 hours 59 minutes'
svc "$(q8_v2_sql "$Q8_J10A" "$Q8_J10A_OWNER" q8-j10-before avis "$Q8_HERO")" >/dev/null
check "J10 - 1 min: the free publication succeeds" "published" "$(q8_status "$Q8_J10A")"

Q8_J10B_OWNER=$(q8_owner q8-j10-at)
Q8_J10B=$(q8_draft "$Q8_J10B_OWNER"); q8_anchor "$Q8_J10B" "$Q8_J10B_OWNER" >/dev/null
q8_ready "$Q8_J10B" q8-j10-at "$Q8_HERO"
m1a_age "$Q8_J10B_OWNER" '240 hours'
svc_expect_error "J10 exactly: the free publication is refused by the server" \
  "$(q8_v2_sql "$Q8_J10B" "$Q8_J10B_OWNER" q8-j10-at avis "$Q8_HERO")" "free publication window closed"
check "J10: the refusal leaves the draft unpublished and consumes no quota" "ready|0|0" \
  "$(q8_status "$Q8_J10B")|$(q8_published_count "$Q8_J10B_OWNER")|$($DB -t -A -c "select count(*) from memorial_published_snapshots where memorial_id='$Q8_J10B';")"
Q8_J10B_REV=$($DB -t -A -c "select revision from memorial_drafts where memorial_id='$Q8_J10B';")
check "J10: the draft itself is still saved after the window (45-day preparation)" "$((Q8_J10B_REV + 1))" \
  "$(m1a_edit "$Q8_J10B" "$Q8_J10B_OWNER" "Apres J10")"
check "J10: the complete offer remains reachable on the same draft" "upgraded" \
  "$(svc "select outcome from upgrade_memorial_access_v1('$Q8_J10B','$Q8_J10B_OWNER','direct_payment','pay-q8-j10');")"

# --- Q2. J45: preparation, recovery, and no reset by a new draft ---
Q8_J45_OWNER=$(q8_owner q8-j45)
Q8_J45=$(q8_draft "$Q8_J45_OWNER"); q8_anchor "$Q8_J45" "$Q8_J45_OWNER" >/dev/null
check "J45: preparation ends 1080 h after the anchor, recovery 168 h later" "1080|168" \
  "$($DB -t -A -c "select extract(epoch from (free_draft_until - free_anchor_at))::bigint / 3600 || '|' || extract(epoch from (free_draft_recovery_until - free_draft_until))::bigint / 3600 from memorials where id='$Q8_J45';")"
m1a_age "$Q8_J45_OWNER" '1079 hours 59 minutes'
check "J45 - 1 min: the draft is still the owner's one active free draft" "free_draft_limit" \
  "$(svc "select outcome from create_free_memorial_v1('$Q8_J45_OWNER','intemporel','light');")"
m1a_age "$Q8_J45_OWNER" '1 minute'
check "J45: preparation over, recovery still open, never published" "true|true|true" \
  "$($DB -t -A -c "select (now() >= free_draft_until) || '|' || (now() < free_draft_recovery_until) || '|' || (first_published_at is null) from memorials where id='$Q8_J45';")"
Q8_J45_NEW=$(svc "select outcome || '|' || memorial_id from create_free_memorial_v1('$Q8_J45_OWNER','intemporel','light');")
check "J45: a new draft is created (Builder never blocked) but reopens no free window (no reset)" "created|anchored_without_free_publication|1" \
  "$(echo "$Q8_J45_NEW" | cut -d'|' -f1)|$(svc "select outcome from anchor_free_memorial_v1('$(echo "$Q8_J45_NEW" | cut -d'|' -f2)','$Q8_J45_OWNER');")|$($DB -t -A -c "select count(*) from memorial_access_events where owner_id='$Q8_J45_OWNER' and event='free.window_opened';")"
$DB -c "update memorials set status='archived' where id='$(echo "$Q8_J45_NEW" | cut -d'|' -f2)';" >/dev/null
check "J45: and no quota was consumed by the unpublished draft" "0" "$(q8_published_count "$Q8_J45_OWNER")"
m1a_age "$Q8_J45_OWNER" '168 hours'
check "J52: the recovery period is over (deadline recorded, no rule invented)" "t" \
  "$($DB -t -A -c "select now() >= free_draft_recovery_until from memorials where id='$Q8_J45';")"
Q8_REC_BEFORE=$($DB -t -A -c "select free_draft_recovery_until from memorials where id='$Q8_J45';")
$DB -c "update memorials set language='es' where id='$Q8_J45';" >/dev/null
check "the recovery deadline is derived: an unrelated update never moves it" "$Q8_REC_BEFORE" \
  "$($DB -t -A -c "select free_draft_recovery_until from memorials where id='$Q8_J45';")"
expect_error "the recovery deadline cannot contradict the preparation deadline" \
  "alter table memorials disable trigger memorials_derive_free_recovery; update memorials set free_draft_recovery_until = free_draft_until where id='$Q8_J45';"
$DB -c "alter table memorials enable trigger memorials_derive_free_recovery;" >/dev/null

# Replacing a draft inside the window inherits everything, recovery included.
Q8_REPL_OWNER=$(q8_owner q8-replace)
Q8_REPL_1=$(q8_draft "$Q8_REPL_OWNER"); q8_anchor "$Q8_REPL_1" "$Q8_REPL_OWNER" >/dev/null
m1a_age "$Q8_REPL_OWNER" '5 days'
$DB -c "update memorials set status='archived' where id='$Q8_REPL_1';" >/dev/null
Q8_REPL_2=$(q8_draft "$Q8_REPL_OWNER"); q8_anchor "$Q8_REPL_2" "$Q8_REPL_OWNER" >/dev/null
check "a replacement draft at J5 keeps the original J10 / J45 / J52 deadlines" "t" \
  "$($DB -t -A -c "select a.free_anchor_at = b.free_anchor_at and a.free_publish_until = b.free_publish_until and a.free_draft_until = b.free_draft_until and a.free_draft_recovery_until = b.free_draft_recovery_until from memorials a, memorials b where a.id='$Q8_REPL_1' and b.id='$Q8_REPL_2';")"
check "the replacement did not consume the quota" "0" "$(q8_published_count "$Q8_REPL_OWNER")"

# --- Q3. 45 days of public visibility, then 7 days of recovery ---
Q8_PUB_OWNER=$(q8_owner q8-public)
Q8_PUB=$(q8_draft "$Q8_PUB_OWNER"); q8_anchor "$Q8_PUB" "$Q8_PUB_OWNER" >/dev/null
q8_ready "$Q8_PUB" q8-public "$Q8_HERO"
svc "$(q8_v2_sql "$Q8_PUB" "$Q8_PUB_OWNER" q8-public avis "$Q8_HERO")" >/dev/null
$DB -c "update memorials set enabled_sections = array['condolences','testimonials'] where id='$Q8_PUB'; insert into symbolic_offering_eligibility (memorial_id) values ('$Q8_PUB') on conflict (memorial_id) do nothing;" >/dev/null
q8_anon_state() {
  $DB -t -A -c "set role anon; select count(*) || '|' || coalesce(max(status), '-') from public_memorial_publication_state('$1');"
}
q8_anon_msg() {
  $DB -t -A -c "set role anon; select public_memorial_message_allowed_v1('$1','$2');"
}
check "published avis: public for the visitor" "1|published" "$(q8_anon_state "$Q8_PUB")"
check "avis: short condolences allowed once the family enabled them" "t" "$(q8_anon_msg "$Q8_PUB" condolence)"
check "avis: enriched contributions refused even if enabled (complete only)" "f|f" "$(q8_anon_msg "$Q8_PUB" testimonial)|$(q8_anon_msg "$Q8_PUB" memory_message)"
check "avis: symbolic gestures are accepted (V8 §6, free and complete)" "recorded" \
  "$(svc "select outcome from record_symbolic_offering_v1('q8-public','bougie',gen_random_uuid());")"
check "visibility is 45 days from the effective publication, recovery 7 days after" "1080|168" \
  "$($DB -t -A -c "select extract(epoch from (free_public_until - first_published_at))::bigint / 3600 || '|' || extract(epoch from (free_private_until - free_public_until))::bigint / 3600 from memorials where id='$Q8_PUB';")"
as_anon "insert into messages (memorial_id, message_type, author_name, content, visible) values ('$Q8_PUB','condolence','Un proche','Pensees.', true);" >/dev/null 2>&1 || true
as_anon "insert into messages (memorial_id, message_type, author_name, content) values ('$Q8_PUB','testimonial','Un proche','Souvenir.');" >/dev/null 2>&1 || true
as_anon "insert into messages (memorial_id, message_type, author_name, content) values ('$Q8_PUB','condolence','Un proche','Pensees.');" >/dev/null 2>&1 || true
check "avis: a condolence is stored unpublished; a self-published one and a contribution are refused" "1|condolence|false" \
  "$($DB -t -A -c "select count(*) || '|' || max(message_type) || '|' || bool_or(visible) from messages where memorial_id='$Q8_PUB';")"
m1a_age "$Q8_PUB_OWNER" '1079 hours 59 minutes'
check "J45 - 1 min after publication: still public" "1|published" "$(q8_anon_state "$Q8_PUB")"
m1a_age "$Q8_PUB_OWNER" '1 minute'
check "J45 after publication: no longer public" "0|-" "$(q8_anon_state "$Q8_PUB")"
check "J45: no condolence can be submitted any more" "f" "$(q8_anon_msg "$Q8_PUB" condolence)"
as_anon "insert into messages (memorial_id, message_type, author_name, content) values ('$Q8_PUB','condolence','Un proche','Trop tard.');" >/dev/null 2>&1 || true
check "J45: the visitor's insert is refused by the policy itself" "1" "$($DB -t -A -c "select count(*) from messages where memorial_id='$Q8_PUB';")"
check "J45: no gesture is accepted any more" "refused" \
  "$(svc "select outcome from record_symbolic_offering_v1('q8-public','lys',gen_random_uuid());")"
check "J45: the memorial, its copy and its gestures are kept (recovery window open)" "published|1|1|t" \
  "$(q8_status "$Q8_PUB")|$($DB -t -A -c "select count(*) from memorial_published_snapshots where memorial_id='$Q8_PUB';")|$($DB -t -A -c "select count(*) from symbolic_offerings where memorial_id='$Q8_PUB';")|$($DB -t -A -c "select now() < free_private_until from memorials where id='$Q8_PUB';")"
check "messages are moderated by default (visible = false)" "false" \
  "$($DB -t -A -c "select pg_get_expr(adbin, adrelid) from pg_attrdef d join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum where d.adrelid = 'public.messages'::regclass and a.attname = 'visible';")"
# (messages privileges are asserted by the Mission 013C section, before
# this script's own TEST-ONLY grants; the postflight re-checks them.)
check "the message policy demands an unpublished (moderated) message" "1" \
  "$($DB -t -A -c "select count(*) from pg_policies where tablename='messages' and policyname='messages_insert_public' and with_check like '%visible = false%';")"

# --- Q4. The quota: consumed only by a successful free publication ---
Q8_QUOTA_OWNER=$(q8_owner q8-quota)
Q8_QUOTA=$(q8_draft "$Q8_QUOTA_OWNER"); q8_anchor "$Q8_QUOTA" "$Q8_QUOTA_OWNER" >/dev/null
q8_ready "$Q8_QUOTA" q8-quota '{"hero":{"displayName":"Avis","photo":null},"video":{"items":[]}}'
svc_expect_error "a refused publication (premium content) ..." \
  "$(m1a_publish_current_sql "$Q8_QUOTA" "$Q8_QUOTA_OWNER" q8-quota)" "free publication cannot include video"
check "... consumes no quota" "0" "$(q8_published_count "$Q8_QUOTA_OWNER")"
q8_ready "$Q8_QUOTA" q8-quota "$Q8_HERO"
svc "$(q8_v2_sql "$Q8_QUOTA" "$Q8_QUOTA_OWNER" q8-quota avis "$Q8_HERO")" >/dev/null
check "a successful free publication consumes the quota exactly once" "published|1" "$(q8_status "$Q8_QUOTA")|$(q8_published_count "$Q8_QUOTA_OWNER")"
m1a_age "$Q8_QUOTA_OWNER" '11 months 29 days'
Q8_QUOTA_EARLY=$(svc "select outcome || '|' || memorial_id from create_free_memorial_v1('$Q8_QUOTA_OWNER','intemporel','light');")
check "12 months - 1 day: a draft can be prepared, but without free publication" "created|anchored_without_free_publication" \
  "$(echo "$Q8_QUOTA_EARLY" | cut -d'|' -f1)|$(svc "select outcome from anchor_free_memorial_v1('$(echo "$Q8_QUOTA_EARLY" | cut -d'|' -f2)','$Q8_QUOTA_OWNER');")"
$DB -c "update memorials set status='archived' where id='$(echo "$Q8_QUOTA_EARLY" | cut -d'|' -f2)';" >/dev/null
m1a_age "$Q8_QUOTA_OWNER" '2 days'
Q8_QUOTA_2=$(svc "select outcome || '|' || memorial_id from create_free_memorial_v1('$Q8_QUOTA_OWNER','intemporel','light');")
check "12 months + 1 day (rolling): a new free draft is possible" "created" "$(echo "$Q8_QUOTA_2" | cut -d'|' -f1)"
check "and it opens a fresh 10-day window" "anchored|240" \
  "$(q8_anchor "$(echo "$Q8_QUOTA_2" | cut -d'|' -f2)" "$Q8_QUOTA_OWNER")|$($DB -t -A -c "select extract(epoch from (free_publish_until - free_anchor_at))::bigint / 3600 from memorials where id='$(echo "$Q8_QUOTA_2" | cut -d'|' -f2)' and free_anchor_at > now() - interval '1 minute';")"

# --- Q5. Premium content can be prepared, never published for free ---
Q8_PREM_OWNER=$(q8_owner q8-premium)
Q8_PREM=$(q8_draft "$Q8_PREM_OWNER"); q8_anchor "$Q8_PREM" "$Q8_PREM_OWNER" >/dev/null
Q8_IDS=""; for n in 1 2 3 4 5 6 7 8; do Q8_IDS="$Q8_IDS $(svc "select gen_random_uuid();")"; done
q8_items() { for id in "$@"; do printf '{"mediaId":"%s"},' "$id"; done | sed 's/,$//'; }
Q8_ALL8=$(q8_items $Q8_IDS)
Q8_FIRST6=$(q8_items $(echo $Q8_IDS | cut -d' ' -f1-6))
Q8_FIRST7=$(q8_items $(echo $Q8_IDS | cut -d' ' -f1-7))
Q8_PREM_DRAFT="{\"hero\":{\"displayName\":\"Avis\",\"photo\":null},\"gallery\":{\"items\":[$Q8_ALL8]},\"video\":{\"items\":[{\"url\":\"https://vimeo.com/1\"}]},\"testimonials\":{\"enabled\":true}}"
q8_ready "$Q8_PREM" q8-premium "$Q8_PREM_DRAFT"
check "the avis draft holds prepared premium content (8 photos, video, contributions)" "8|true|true" \
  "$($DB -t -A -c "select jsonb_array_length(content->'gallery'->'items') || '|' || (content ? 'video') || '|' || (content ? 'testimonials') from memorial_drafts where memorial_id='$Q8_PREM';")"
svc_expect_error "v1 cannot publish the raw draft of an avis (video)" \
  "$(m1a_publish_current_sql "$Q8_PREM" "$Q8_PREM_OWNER" q8-premium)" "free publication cannot include"
svc_expect_error "v2 refuses premium sections in a free copy" \
  "$(q8_v2_sql "$Q8_PREM" "$Q8_PREM_OWNER" q8-premium avis "$Q8_PREM_DRAFT")" "free publication cannot include"
svc_expect_error "v2 refuses a seventh published photograph" \
  "$(q8_v2_sql "$Q8_PREM" "$Q8_PREM_OWNER" q8-premium avis "{\"hero\":{\"displayName\":\"Avis\",\"photo\":null},\"gallery\":{\"items\":[$Q8_FIRST7]}}")" "free gallery limit reached"
svc_expect_error "v2 refuses a published photograph absent from the draft" \
  "$(q8_v2_sql "$Q8_PREM" "$Q8_PREM_OWNER" q8-premium avis "{\"gallery\":{\"items\":[{\"mediaId\":\"$(svc "select gen_random_uuid();")\"}]}}")" "must come from the draft"
svc_expect_error "v2 refuses a projection computed for another access level" \
  "$(q8_v2_sql "$Q8_PREM" "$Q8_PREM_OWNER" q8-premium complet "$Q8_PREM_DRAFT")" "memorial access level changed"
check "none of these refusals published or consumed anything" "ready|0|0" \
  "$(q8_status "$Q8_PREM")|$(q8_published_count "$Q8_PREM_OWNER")|$($DB -t -A -c "select count(*) from memorial_published_snapshots where memorial_id='$Q8_PREM';")"
Q8_PREM_PUBLIC="{\"hero\":{\"displayName\":\"Avis\",\"photo\":null},\"gallery\":{\"items\":[$Q8_FIRST6]}}"
svc "$(q8_v2_sql "$Q8_PREM" "$Q8_PREM_OWNER" q8-premium avis "$Q8_PREM_PUBLIC")" >/dev/null
check "the server projection (6 chosen photos, no premium) is published" "published|gallery,hero|6" \
  "$(q8_status "$Q8_PREM")|$($DB -t -A -c "select string_agg(k, ',' order by k) from memorial_published_snapshots s, jsonb_object_keys(s.content) k where s.memorial_id='$Q8_PREM';")|$($DB -t -A -c "select jsonb_array_length(content->'gallery'->'items') from memorial_published_snapshots where memorial_id='$Q8_PREM';")"
check "the private draft keeps everything that was prepared" "8|true|true" \
  "$($DB -t -A -c "select jsonb_array_length(content->'gallery'->'items') || '|' || (content ? 'video') || '|' || (content ? 'testimonials') from memorial_drafts where memorial_id='$Q8_PREM';")"
expect_error "even the database owner cannot slip a video into a free copy afterwards" \
  "update memorial_published_snapshots set content = content || '{\"video\":{\"items\":[]}}' where memorial_id='$Q8_PREM';"
expect_error "nor a seventh photograph" \
  "update memorial_published_snapshots set content = jsonb_set(content, '{gallery,items}', '[$Q8_FIRST7]') where memorial_id='$Q8_PREM';"
check "after the upgrade, the same memorial can publish its prepared premium content" "upgraded|published|t" \
  "$(svc "select outcome from upgrade_memorial_access_v1('$Q8_PREM','$Q8_PREM_OWNER','direct_payment','pay-q8-prem');")|$($DB -c "update memorials set status='editing' where id='$Q8_PREM';" >/dev/null; rev=$($DB -t -A -c "select revision from memorial_drafts where memorial_id='$Q8_PREM';"); fp=$($DB -t -A -c "select first_published_at from memorials where id='$Q8_PREM';"); svc "select 1 from commit_memorial_publication_v2('$Q8_PREM','$Q8_PREM_OWNER',$rev,'editing','$fp','fr','intemporel','light','q8-premium','complet','$Q8_PREM_DRAFT','$Q8_PREM_DRAFT');" >/dev/null; q8_status "$Q8_PREM")|$($DB -t -A -c "select content ? 'video' from memorial_published_snapshots where memorial_id='$Q8_PREM';")"

# --- Q6. Etsy and complete rights are untouched ---
Q8_ETSY_OWNER=$(q8_owner q8-etsy)
Q8_ETSY_ENT=$($DB -t -A -c "insert into entitlements (access_level, source, offer_id, external_order_id) values ('complet','etsy','intemporel','q8-etsy-order') returning id;")
Q8_ETSY=$(svc "select memorial_id from redeem_entitlement('$Q8_ETSY_ENT','$Q8_ETSY_OWNER','person','intemporel','light');")
q8_ready "$Q8_ETSY" q8-etsy "$Q8_PREM_DRAFT"
svc "$(q8_v2_sql "$Q8_ETSY" "$Q8_ETSY_OWNER" q8-etsy complet "$Q8_PREM_DRAFT")" >/dev/null
check "Etsy (complet): full content with video and 8 photos is published" "published|true|8" \
  "$(q8_status "$Q8_ETSY")|$($DB -t -A -c "select (content ? 'video') || '|' || jsonb_array_length(content->'gallery'->'items') from memorial_published_snapshots where memorial_id='$Q8_ETSY';")"
check "Etsy: no free deadline, no free event, no quota" "t|0" \
  "$($DB -t -A -c "select (free_anchor_at is null and free_public_until is null and free_draft_recovery_until is null) from memorials where id='$Q8_ETSY';")|$($DB -t -A -c "select count(*) from memorial_access_events where memorial_id='$Q8_ETSY';")"
$DB -c "update memorials set enabled_sections = array['testimonials'] where id='$Q8_ETSY';" >/dev/null
check "Etsy: public without a 45-day bound, enriched contributions allowed when enabled" "1|published|t" \
  "$(q8_anon_state "$Q8_ETSY")|$(q8_anon_msg "$Q8_ETSY" testimonial)"
check "Etsy: an owner with an Etsy memorial keeps a full free right of their own" "created" \
  "$(svc "select outcome from create_free_memorial_v1('$Q8_ETSY_OWNER','intemporel','light');")"

# --- Q7. Administrative waiver (one extra free publication, traced) ---
q8_grant() {
  svc "select outcome from grant_free_publication_waiver_v1('$1','$ADMIN_Q8','$2','Deuxieme deces dans la famille');"
}
svc_expect_error "a waiver needs an administrator, a reference and a reason" \
  "select * from grant_free_publication_waiver_v1('$Q8_QUOTA_OWNER',null,'ref','motif');" "invalid free publication waiver request"
check "a waiver for an unknown owner is refused" "refused" "$(q8_grant "$(svc "select gen_random_uuid();")" q8-w-unknown)"

# W1. Quota already consumed: the waiver allows one more, with a new window.
Q8_W_OWNER=$(q8_owner q8-waiver)
Q8_W1=$(q8_draft "$Q8_W_OWNER"); q8_anchor "$Q8_W1" "$Q8_W_OWNER" >/dev/null
q8_ready "$Q8_W1" q8-waiver-1 "$Q8_HERO"
svc "$(q8_v2_sql "$Q8_W1" "$Q8_W_OWNER" q8-waiver-1 avis "$Q8_HERO")" >/dev/null
m1a_age "$Q8_W_OWNER" '60 days'
Q8_W2=$(svc "select outcome || '|' || memorial_id from create_free_memorial_v1('$Q8_W_OWNER','intemporel','light');")
check "W1: without a waiver, a draft is created but anchored without free publication" "created|anchored_without_free_publication" \
  "$(echo "$Q8_W2" | cut -d'|' -f1)|$(svc "select outcome from anchor_free_memorial_v1('$(echo "$Q8_W2" | cut -d'|' -f2)','$Q8_W_OWNER');")"
Q8_W2=$(echo "$Q8_W2" | cut -d'|' -f2)
check "W1: the waiver is granted" "granted" "$(q8_grant "$Q8_W_OWNER" q8-w-ref-1)"
check "W1: granting is idempotent on its reference" "already_granted" "$(q8_grant "$Q8_W_OWNER" q8-w-ref-1)"
check "W1: one active waiver per address" "active_waiver_exists" "$(q8_grant "$Q8_W_OWNER" q8-w-ref-2)"
check "W1: a reference cannot serve two addresses" "reference_conflict" "$(q8_grant "$Q8_QUOTA_OWNER" q8-w-ref-1)"
check "W1: the grant is audited once, without personal data" "1|free_publication_waiver.granted|owner" \
  "$($DB -t -A -c "select count(*) || '|' || max(action) || '|' || max(target_type) from admin_audit_events where target_id='$Q8_W_OWNER';")"
check "W1: with the waiver, the SAME draft receives a new 10-day window, now" "free_window_opened|240" \
  "$(q8_anchor "$Q8_W2" "$Q8_W_OWNER")|$($DB -t -A -c "select round(extract(epoch from (free_publish_until - now())) / 3600) from memorials where id='$Q8_W2';")"
check "W1: anchoring does not consume the waiver" "true|false" \
  "$($DB -t -A -c "select (window_opened_at is not null) || '|' || (consumed_at is not null) from free_publication_waivers where reference='q8-w-ref-1';")"
q8_ready "$Q8_W2" q8-waiver-2 "$Q8_HERO"
svc "$(q8_v2_sql "$Q8_W2" "$Q8_W_OWNER" q8-waiver-2 avis "$Q8_HERO")" >/dev/null
check "W1: the second free publication succeeds and consumes the waiver" "published|true|$Q8_W2" \
  "$(q8_status "$Q8_W2")|$($DB -t -A -c "select (consumed_at is not null) || '|' || consumed_memorial_id from free_publication_waivers where reference='q8-w-ref-1';")"
check "W1: the use is journaled once, with the waiver as its unique reference" "1|admin_waiver" \
  "$($DB -t -A -c "select count(*) || '|' || max(source) from memorial_access_events where owner_id='$Q8_W_OWNER' and event='free.waiver_used';")"
Q8_W3=$(svc "select outcome || '|' || memorial_id from create_free_memorial_v1('$Q8_W_OWNER','intemporel','light');")
check "W1: once used, the address is limited again (draft yes, free publication no)" "created|anchored_without_free_publication" \
  "$(echo "$Q8_W3" | cut -d'|' -f1)|$(svc "select outcome from anchor_free_memorial_v1('$(echo "$Q8_W3" | cut -d'|' -f2)','$Q8_W_OWNER');")"

# W2. Window closed without publication: the waiver reopens one window.
Q8_V_OWNER=$(q8_owner q8-waiver-window)
Q8_V1=$(q8_draft "$Q8_V_OWNER"); q8_anchor "$Q8_V1" "$Q8_V_OWNER" >/dev/null
m1a_age "$Q8_V_OWNER" '20 days'
$DB -c "update memorials set status='archived' where id='$Q8_V1';" >/dev/null
Q8_V2=$(q8_draft "$Q8_V_OWNER")
check "W2: the closed window is not reopened by a new draft" "anchored_without_free_publication|1" \
  "$(q8_anchor "$Q8_V2" "$Q8_V_OWNER")|$($DB -t -A -c "select count(*) from memorial_access_events where owner_id='$Q8_V_OWNER' and event='free.window_opened';")"
q8_grant "$Q8_V_OWNER" q8-v-ref >/dev/null
check "W2: the waiver opens one window on that same draft" "free_window_opened" "$(q8_anchor "$Q8_V2" "$Q8_V_OWNER")"
q8_ready "$Q8_V2" q8-waiver-window "$Q8_HERO"
svc "$(q8_v2_sql "$Q8_V2" "$Q8_V_OWNER" q8-waiver-window avis "$Q8_HERO")" >/dev/null
check "W2: published within the waiver's window; the waiver is consumed" "published|t" \
  "$(q8_status "$Q8_V2")|$($DB -t -A -c "select consumed_at is not null from free_publication_waivers where reference='q8-v-ref';")"

# W3. Revocation.
Q8_R_OWNER=$(q8_owner q8-waiver-revoke)
Q8_R1=$(q8_draft "$Q8_R_OWNER"); q8_anchor "$Q8_R1" "$Q8_R_OWNER" >/dev/null
q8_ready "$Q8_R1" q8-revoke-1 "$Q8_HERO"
svc "$(q8_v2_sql "$Q8_R1" "$Q8_R_OWNER" q8-revoke-1 avis "$Q8_HERO")" >/dev/null
q8_grant "$Q8_R_OWNER" q8-r-ref >/dev/null
Q8_R_WAIVER=$($DB -t -A -c "select id from free_publication_waivers where reference='q8-r-ref';")
check "W3: an unused waiver can be revoked, audited" "revoked|1" \
  "$(svc "select outcome from revoke_free_publication_waiver_v1('$Q8_R_WAIVER','$ADMIN_Q8');")|$($DB -t -A -c "select count(*) from admin_audit_events where target_id='$Q8_R_OWNER' and action='free_publication_waiver.revoked';")"
Q8_R3=$(q8_draft "$Q8_R_OWNER")
check "W3: a revoked waiver opens nothing" "anchored_without_free_publication|already_anchored" \
  "$(q8_anchor "$Q8_R3" "$Q8_R_OWNER")|$(q8_anchor "$Q8_R3" "$Q8_R_OWNER")"
$DB -c "update memorials set status='archived' where id='$Q8_R3';" >/dev/null
Q8_W_USED=$($DB -t -A -c "select id from free_publication_waivers where reference='q8-w-ref-1';")
check "W3: revoking twice is harmless; a used waiver cannot be revoked" "already_revoked|already_consumed" \
  "$(svc "select outcome from revoke_free_publication_waiver_v1('$Q8_R_WAIVER','$ADMIN_Q8');")|$(svc "select outcome from revoke_free_publication_waiver_v1('$Q8_W_USED','$ADMIN_Q8');")"
# The publication guard does not trust the creation path: an anchored avis
# draft made by hand, beyond the quota and without waiver, is refused.
Q8_R2=$(m1a_avis_draft "$Q8_R_OWNER")
$DB -c "update memorials set free_anchor_at = now(), free_publish_until = now() + interval '10 days', free_draft_until = now() + interval '45 days' where id='$Q8_R2';" >/dev/null
q8_ready "$Q8_R2" q8-revoke-2 "$Q8_HERO"
svc_expect_error "W3: without an active waiver the guard refuses beyond the quota" \
  "$(q8_v2_sql "$Q8_R2" "$Q8_R_OWNER" q8-revoke-2 avis "$Q8_HERO")" "free publication quota reached"

# --- Q7b. QG 008 correction: the quota never blocks the Builder nor the complete offer ---
Q8_CPL_OWNER=$(q8_owner q8-complete-path)
Q8_CPL_1=$(q8_draft "$Q8_CPL_OWNER"); q8_anchor "$Q8_CPL_1" "$Q8_CPL_OWNER" >/dev/null
q8_ready "$Q8_CPL_1" q8-complete-path-1 "$Q8_HERO"
svc "$(q8_v2_sql "$Q8_CPL_1" "$Q8_CPL_OWNER" q8-complete-path-1 avis "$Q8_HERO")" >/dev/null
m1a_age "$Q8_CPL_OWNER" '20 days'
Q8_CPL_EVENTS=$($DB -t -A -c "select count(*) from memorial_access_events where owner_id='$Q8_CPL_OWNER' and event in ('free.window_opened','free.first_published');")
Q8_CPL_2=$(svc "select outcome || '|' || memorial_id from create_free_memorial_v1('$Q8_CPL_OWNER','intemporel','light');")
check "quota consumed: the Builder still opens a draft immediately" "created" "$(echo "$Q8_CPL_2" | cut -d'|' -f1)"
Q8_CPL_2=$(echo "$Q8_CPL_2" | cut -d'|' -f2)
check "its durable save anchors it without free publication: zero free window, its own 45-day preparation" "anchored_without_free_publication|t|1080|168" \
  "$(q8_anchor "$Q8_CPL_2" "$Q8_CPL_OWNER")|$($DB -t -A -c "select free_publish_until = free_anchor_at and free_anchor_at > now() - interval '1 minute' from memorials where id='$Q8_CPL_2';")|$($DB -t -A -c "select extract(epoch from (free_draft_until - free_anchor_at))::bigint / 3600 || '|' || extract(epoch from (free_draft_recovery_until - free_draft_until))::bigint / 3600 from memorials where id='$Q8_CPL_2';")"
check "the anchoring is journaled as such, and opens no window nor consumes anything" "1|$Q8_CPL_EVENTS" \
  "$($DB -t -A -c "select count(*) from memorial_access_events where memorial_id='$Q8_CPL_2' and event='free.anchored_without_window';")|$($DB -t -A -c "select count(*) from memorial_access_events where owner_id='$Q8_CPL_OWNER' and event in ('free.window_opened','free.first_published');")"
check "it is the owner's single active draft (Builder unique, not a quota refusal)" "free_draft_limit" \
  "$(svc "select outcome from create_free_memorial_v1('$Q8_CPL_OWNER','intemporel','light');")"
Q8_CPL_REV=$($DB -t -A -c "select revision from memorial_drafts where memorial_id='$Q8_CPL_2';")
$DB -c "update memorials set status='ready' where id='$Q8_CPL_2';" >/dev/null
check "the family prepares it like any draft" "$((Q8_CPL_REV + 1))" "$(m1a_edit "$Q8_CPL_2" "$Q8_CPL_OWNER" "Preparation complete")"
q8_ready "$Q8_CPL_2" q8-complete-path-2 "$Q8_PREM_DRAFT"
svc_expect_error "a free publication of it is refused by the server (window closed)" \
  "$(q8_v2_sql "$Q8_CPL_2" "$Q8_CPL_OWNER" q8-complete-path-2 avis "$Q8_HERO")" "free publication window closed"
check "the refusal consumes no quota" "$Q8_CPL_EVENTS" \
  "$($DB -t -A -c "select count(*) from memorial_access_events where owner_id='$Q8_CPL_OWNER' and event in ('free.window_opened','free.first_published');")"
check "no 12-month wait: the same draft is upgraded and published complete right away" "upgraded|published|true" \
  "$(svc "select outcome from upgrade_memorial_access_v1('$Q8_CPL_2','$Q8_CPL_OWNER','direct_payment','pay-q8-complete-path');")|$(svc "$(q8_v2_sql "$Q8_CPL_2" "$Q8_CPL_OWNER" q8-complete-path-2 complet "$Q8_PREM_DRAFT")" >/dev/null; q8_status "$Q8_CPL_2")|$($DB -t -A -c "select (content ? 'video')::text from memorial_published_snapshots where memorial_id='$Q8_CPL_2';")"
check "the complete publication touches no free counter" "$Q8_CPL_EVENTS|0" \
  "$($DB -t -A -c "select count(*) from memorial_access_events where owner_id='$Q8_CPL_OWNER' and event in ('free.window_opened','free.first_published');")|$($DB -t -A -c "select count(*) from memorial_access_events where memorial_id='$Q8_CPL_2' and event='free.first_published';")"
# Final review (QG 008): replacing an IN-PROGRESS draft after the free
# window closed never extends its preparation; a draft created after the
# previous one EXPIRED gets its own 45 days (QG decision).
Q8_RPL_OWNER=$(q8_owner q8-replace-in-progress)
Q8_RPL_1=$(q8_draft "$Q8_RPL_OWNER"); q8_anchor "$Q8_RPL_1" "$Q8_RPL_OWNER" >/dev/null
m1a_age "$Q8_RPL_OWNER" '20 days'
$DB -c "update memorials set status='archived' where id='$Q8_RPL_1';" >/dev/null
Q8_RPL_2=$(q8_draft "$Q8_RPL_OWNER")
check "J20: replacing the in-progress draft gives no free window and keeps its J45 (no reset)" "anchored_without_free_publication|t" \
  "$(q8_anchor "$Q8_RPL_2" "$Q8_RPL_OWNER")|$($DB -t -A -c "select a.free_draft_until = b.free_draft_until and a.free_draft_recovery_until = b.free_draft_recovery_until from memorials a, memorials b where a.id='$Q8_RPL_1' and b.id='$Q8_RPL_2';")"
m1a_age "$Q8_RPL_OWNER" '26 days'
$DB -c "update memorials set status='archived' where id='$Q8_RPL_2';" >/dev/null
Q8_RPL_3=$(q8_draft "$Q8_RPL_OWNER")
check "after the previous draft expired, a new draft gets its own 45 days, still without free window" "anchored_without_free_publication|1080|t" \
  "$(q8_anchor "$Q8_RPL_3" "$Q8_RPL_OWNER")|$($DB -t -A -c "select extract(epoch from (free_draft_until - free_anchor_at))::bigint / 3600 from memorials where id='$Q8_RPL_3';")|$($DB -t -A -c "select free_publish_until = free_anchor_at from memorials where id='$Q8_RPL_3';")"

# A draft anchored inside an OPEN window keeps the address's anchor (no
# reset), even though zero-window anchoring exists.
Q8_OPEN_OWNER=$(q8_owner q8-open-window)
Q8_OPEN_1=$(q8_draft "$Q8_OPEN_OWNER"); q8_anchor "$Q8_OPEN_1" "$Q8_OPEN_OWNER" >/dev/null
m1a_age "$Q8_OPEN_OWNER" '3 days'
$DB -c "update memorials set status='archived' where id='$Q8_OPEN_1';" >/dev/null
Q8_OPEN_2=$(q8_draft "$Q8_OPEN_OWNER")
check "inside an open window a replacement still inherits the original J10 (no reset)" "anchored|t" \
  "$(q8_anchor "$Q8_OPEN_2" "$Q8_OPEN_OWNER")|$($DB -t -A -c "select a.free_publish_until = b.free_publish_until and a.free_draft_until = b.free_draft_until from memorials a, memorials b where a.id='$Q8_OPEN_1' and b.id='$Q8_OPEN_2';")"

# --- Q8. No privilege leak, no direct-call bypass ---
for f in "commit_memorial_publication_v2(uuid,uuid,bigint,text,timestamptz,text,text,text,text,text,jsonb,jsonb)" "grant_free_publication_waiver_v1(uuid,uuid,text,text)" "revoke_free_publication_waiver_v1(uuid,uuid)"; do
  check "$f executable by service_role only" "false|false|true" "$($DB -t -A -c "select has_function_privilege('anon','public.$f','EXECUTE') || '|' || has_function_privilege('authenticated','public.$f','EXECUTE') || '|' || has_function_privilege('service_role','public.$f','EXECUTE');")"
done
for f in "free_window_status_v1(uuid,timestamptz)" "memorial_publicly_visible_v1(uuid,timestamptz)" "guard_avis_published_snapshot_v1()" "memorials_derive_free_recovery_v1()"; do
  check "$f executable by no role" "false|false|false" "$($DB -t -A -c "select has_function_privilege('anon','public.$f','EXECUTE') || '|' || has_function_privilege('authenticated','public.$f','EXECUTE') || '|' || has_function_privilege('service_role','public.$f','EXECUTE');")"
done
check "public_memorial_message_allowed_v1 is a boolean for the message policy (anon, authenticated)" "true|true" \
  "$($DB -t -A -c "select has_function_privilege('anon','public.public_memorial_message_allowed_v1(uuid,text)','EXECUTE') || '|' || has_function_privilege('authenticated','public.public_memorial_message_allowed_v1(uuid,text)','EXECUTE');")"
for r in anon authenticated service_role; do
  check "$r has no privilege on free_publication_waivers" "f" "$($DB -t -A -c "select has_table_privilege('$r','free_publication_waivers','SELECT') or has_table_privilege('$r','free_publication_waivers','INSERT') or has_table_privilege('$r','free_publication_waivers','UPDATE') or has_table_privilege('$r','free_publication_waivers','DELETE') or has_table_privilege('$r','free_publication_waivers','TRUNCATE');")"
done
check "free_publication_waivers has RLS enabled" "t" "$($DB -t -A -c "select relrowsecurity from pg_class where oid='public.free_publication_waivers'::regclass;")"
check "authenticated cannot write memorials.free_draft_recovery_until" "f" "$($DB -t -A -c "select has_column_privilege('authenticated','memorials','free_draft_recovery_until','UPDATE');")"
check "an authenticated family cannot call the publication transaction directly" "1" \
  "$($DB -c "set role authenticated; select * from commit_memorial_publication_v2('$Q8_PUB','$Q8_PUB_OWNER',0,'ready',null,'fr','intemporel','light','x','complet','{}','{}');" 2>&1 | grep -c 'permission denied' || true)"
check "an authenticated user cannot grant themselves a waiver" "1" \
  "$($DB -c "set role authenticated; select * from grant_free_publication_waiver_v1('$Q8_PUB_OWNER','$ADMIN_Q8','self','self');" 2>&1 | grep -c 'permission denied' || true)"
check "service_role still cannot write memorials directly (deadlines only via functions)" "f" \
  "$($DB -t -A -c "select has_table_privilege('service_role','memorials','UPDATE');")"

# --- Q9. QG 008 preflight / postflight (read-only) ---
Q8_PRE_FINAL=$($DB -t -A -f "$REPO_ROOT/supabase/verifications/qg008_lot1_preflight.sql" 2>&1)
check "qg008 preflight, run after the migration, refuses to proceed (3 'already applied' ECHEC)" "3" \
  "$(echo "$Q8_PRE_FINAL" | grep -c "ECHEC — QG 008 semble deja appliquee" || true)"
Q8_PRE_M1A=$($DB_M1A -t -A -f "$REPO_ROOT/supabase/verifications/qg008_lot1_preflight.sql" 2>&1)
check "qg008 preflight on the M1-A state: zero ECHEC" "0|t" \
  "$(echo "$Q8_PRE_M1A" | grep -c "ECHEC" || true)|$(echo "$Q8_PRE_M1A" | grep -q '|OK$' && echo t || echo f)"
# The postflight measures the migrations: this script's own TEST-ONLY
# grant (insert on messages to anon, Mission 002 RLS tests) is lifted
# inside a rolled-back transaction while it runs.
q8_postflight() {
  $DB -t -A -c "begin;" -c "revoke insert on table messages from anon;" "$@" -f "$REPO_ROOT/supabase/verifications/qg008_lot1_postflight.sql" -c "rollback;" 2>&1
}
Q8_POST=$(q8_postflight)
check "qg008 postflight: zero ECHEC on the final state" "0" "$(echo "$Q8_POST" | grep -c "ECHEC" || true)"
check "qg008 postflight grades every control (31 OK)" "31" "$(echo "$Q8_POST" | grep -c "|OK$" || true)"
check "qg008 postflight turns red on a 7-day window" "1" \
  "$(q8_postflight -c "update memorial_access_settings set free_publish_window = interval '168 hours';" | grep -c "ECHEC" || true)"
check "qg008 postflight turns red if the draft gallery block comes back" "1" \
  "$(q8_postflight -c "create trigger memorial_drafts_guard_free_gallery before update on memorial_drafts for each row execute function set_updated_at();" | grep -c "ECHEC" || true)"
check "qg008 postflight turns red on a client grant on the waivers" "1" \
  "$(q8_postflight -c "grant select on free_publication_waivers to authenticated;" | grep -c "ECHEC" || true)"

# --- Q10. Reversibility (supabase/rollbacks/, never applied automatically) ---
Q8_DOWN="$REPO_ROOT/supabase/rollbacks/20261031120000_qg008_free_offer_v8_alignment.down.sql"
$PSQL -d postgres -c "create database qg008_down_refused template $DB_NAME;" >/dev/null
check "the rollback refuses while waivers exist, and changes nothing" "1|t" \
  "$($PSQL -d qg008_down_refused -f "$Q8_DOWN" 2>&1 | grep -c 'rollback refused' || true)|$($PSQL -d qg008_down_refused -t -A -c "select to_regclass('public.free_publication_waivers') is not null and exists (select 1 from pg_attribute where attrelid='public.memorials'::regclass and attname='free_draft_recovery_until');")"
$PSQL -d postgres -c "drop database qg008_down_refused;" >/dev/null
$PSQL -d postgres -c "create database qg008_down_clean template $STANDINS_DB;" >/dev/null
# Up to the Lot 1 migration only: a later lot is rolled back first.
for f in "$MIGRATIONS_DIR"/*.sql; do
  $PSQL -d qg008_down_clean -f "$f" >/dev/null
  [ "$(basename "$f")" = "20261031120000_qg008_free_offer_v8_alignment.sql" ] && break
done
check "on a database without waivers, the rollback applies" "0" "$($PSQL -d qg008_down_clean -f "$Q8_DOWN" >/dev/null 2>&1; echo $?)"
Q8_BACK=$($PSQL -d qg008_down_clean -t -A -f "$REPO_ROOT/supabase/verifications/m1a_postflight.sql" 2>&1)
check "after rollback, m1a_postflight grades the exact M1-A state (42 OK, zero ECHEC)" "42|0" \
  "$(echo "$Q8_BACK" | grep -c '|OK$' || true)|$(echo "$Q8_BACK" | grep -c 'ECHEC' || true)"
Q8_BACK1=$($PSQL -d qg008_down_clean -t -A -f "$REPO_ROOT/supabase/verifications/m1a_correctif1_postflight.sql" 2>&1)
check "after rollback, m1a_correctif1_postflight: 12 OK, zero ECHEC" "12|0" \
  "$(echo "$Q8_BACK1" | grep -c '|OK$' || true)|$(echo "$Q8_BACK1" | grep -c 'ECHEC' || true)"
check "after rollback, the QG 008 migration applies again cleanly" "0|0" \
  "$($PSQL -d qg008_down_clean -f "$MIGRATIONS_DIR/20261031120000_qg008_free_offer_v8_alignment.sql" >/dev/null 2>&1; echo $?)|$($PSQL -d qg008_down_clean -t -A -f "$REPO_ROOT/supabase/verifications/qg008_lot1_postflight.sql" 2>&1 | grep -c 'ECHEC' || true)"
$PSQL -d postgres -c "drop database qg008_down_clean;" >/dev/null


# =====================================================================
# QG 008 — Lot 2 : Builder invité → brouillon durable
# =====================================================================
echo ""
echo "== QG 008 Lot 2: guest draft → durable draft =="

L2_KEY_A="3f1c9a52-7d4e-4b8a-9c21-5e6f7a8b9c0d"
L2_KEY_B="7a6b5c4d-3e2f-4a1b-8c9d-0e1f2a3b4c5d"
l2_begin() {
  # $1 owner, $2 key, $3 skin, $4 language (or null) -> "outcome|memorial|status|anchor"
  svc "select outcome || '|' || coalesce(memorial_id::text, '-') || '|' || coalesce(transfer_status, '-') || '|' || coalesce(anchor_outcome, '-') from begin_guest_draft_transfer_v1('$1','$2',3,'$3',$4);"
}
l2_media() {
  # $1 memorial, $2 owner, $3 purpose, $4 status -> media id
  $DB -t -A -c "insert into media (memorial_id, owner_id, storage_path, media_type, mime_type, purpose, status, size_bytes) select '$1','$2','$1/' || g || '/original.jpg','photo','image/jpeg','$3','$4',100 from (select gen_random_uuid() g) x returning id;"
}
l2_record() {
  # $1 owner, $2 key, $3 local id, $4 media, $5 purpose
  svc "select outcome from record_guest_draft_transfer_media_v1('$1','$2','$3','$4','$5');"
}

# --- T1. Privileges ---
for f in "begin_guest_draft_transfer_v1(uuid,text,bigint,text,text)" "record_guest_draft_transfer_media_v1(uuid,text,text,uuid,text)" "find_guest_draft_transfer_v1(uuid,text)" "complete_guest_draft_transfer_v1(uuid,text)"; do
  check "Lot 2: $f executable by service_role only" "false|false|true" "$($DB -t -A -c "select has_function_privilege('anon','public.$f','EXECUTE') || '|' || has_function_privilege('authenticated','public.$f','EXECUTE') || '|' || has_function_privilege('service_role','public.$f','EXECUTE');")"
done
for r in anon authenticated service_role; do
  check "Lot 2: $r has no privilege on guest_draft_transfers" "f" "$($DB -t -A -c "select has_table_privilege('$r','guest_draft_transfers','SELECT') or has_table_privilege('$r','guest_draft_transfers','INSERT') or has_table_privilege('$r','guest_draft_transfers','UPDATE') or has_table_privilege('$r','guest_draft_transfers','DELETE') or has_table_privilege('$r','guest_draft_transfers','TRUNCATE');")"
done
check "Lot 2: guest_draft_transfers has RLS enabled" "t" "$($DB -t -A -c "select relrowsecurity from pg_class where oid='public.guest_draft_transfers'::regclass;")"
check "Lot 2: an authenticated family cannot start a transfer directly" "1" \
  "$($DB -c "set role authenticated; select * from begin_guest_draft_transfer_v1(gen_random_uuid(),'$L2_KEY_A',0,'light',null);" 2>&1 | grep -c 'permission denied' || true)"

# --- T2. First durable save: one draft, anchored NOW, language kept ---
L2_OWNER=$(q8_owner l2-family)
check "Lot 2: an unknown owner is refused" "refused|-|-|-" "$(l2_begin "$(svc "select gen_random_uuid();")" "$L2_KEY_A" dark "'fr'")"
svc_expect_error "Lot 2: a malformed transfer key is refused" \
  "select * from begin_guest_draft_transfer_v1('$L2_OWNER','not-a-key',0,'dark','fr');" "invalid guest draft transfer request"
svc_expect_error "Lot 2: an unknown language is refused" \
  "select * from begin_guest_draft_transfer_v1('$L2_OWNER','$L2_KEY_A',0,'dark','de');" "invalid guest draft transfer request"
L2_FIRST=$(l2_begin "$L2_OWNER" "$L2_KEY_A" dark "'es'")
L2_MEM=$(echo "$L2_FIRST" | cut -d'|' -f2)
check "Lot 2: the first durable save creates and anchors ONE draft" "created|started|anchored" \
  "$(echo "$L2_FIRST" | cut -d'|' -f1)|$(echo "$L2_FIRST" | cut -d'|' -f3)|$(echo "$L2_FIRST" | cut -d'|' -f4)"
check "Lot 2: the 45 days start at this durable save (anchor = now), 10 days for free publication only" "t|1080|240" \
  "$($DB -t -A -c "select free_anchor_at > now() - interval '1 minute' from memorials where id='$L2_MEM';")|$($DB -t -A -c "select extract(epoch from (free_draft_until - free_anchor_at))::bigint / 3600 || '|' || extract(epoch from (free_publish_until - free_anchor_at))::bigint / 3600 from memorials where id='$L2_MEM';")"
check "Lot 2: the draft belongs to the verified owner, at level avis, in the family's language and ambiance" "avis|draft|es|dark|true" \
  "$($DB -t -A -c "select access_level || '|' || status || '|' || language || '|' || skin_variant || '|' || (owner_id='$L2_OWNER') from memorials where id='$L2_MEM';")"

# --- T3. Reconnection / retry / second tab: same draft, no reset ---
L2_DEADLINES=$($DB -t -A -c "select free_anchor_at || '|' || free_publish_until || '|' || free_draft_until || '|' || free_draft_recovery_until from memorials where id='$L2_MEM';")
L2_EVENTS=$($DB -t -A -c "select count(*) from memorial_access_events where owner_id='$L2_OWNER';")
m1a_age "$L2_OWNER" '3 days'
L2_DEADLINES=$($DB -t -A -c "select free_anchor_at || '|' || free_publish_until || '|' || free_draft_until || '|' || free_draft_recovery_until from memorials where id='$L2_MEM';")
check "Lot 2: reconnecting 3 days later resumes the SAME draft" "resumed|$L2_MEM|started" "$(l2_begin "$L2_OWNER" "$L2_KEY_A" light "'fr'" | cut -d'|' -f1-3)"
check "Lot 2: ... and never recomputes a deadline nor writes an event" "$L2_DEADLINES|$L2_EVENTS" \
  "$($DB -t -A -c "select free_anchor_at || '|' || free_publish_until || '|' || free_draft_until || '|' || free_draft_recovery_until from memorials where id='$L2_MEM';")|$($DB -t -A -c "select count(*) from memorial_access_events where owner_id='$L2_OWNER';")"
check "Lot 2: ... nor overwrites the language or ambiance already saved" "es|dark" "$($DB -t -A -c "select language || '|' || skin_variant from memorials where id='$L2_MEM';")"
check "Lot 2: one draft per owner: another guest draft is told about the existing one, nothing is created" "active_draft_exists|$L2_MEM|1" \
  "$(l2_begin "$L2_OWNER" "$L2_KEY_B" dark null | cut -d'|' -f1-2)|$($DB -t -A -c "select count(*) from memorials where owner_id='$L2_OWNER';")"

# --- T4. Photo map: only ready media of this memorial and this owner ---
L2_HERO=$(l2_media "$L2_MEM" "$L2_OWNER" hero ready)
L2_G1=$(l2_media "$L2_MEM" "$L2_OWNER" gallery ready)
L2_PENDING=$(l2_media "$L2_MEM" "$L2_OWNER" gallery pending)
L2_OTHER_OWNER=$(q8_owner l2-other)
L2_OTHER=$(l2_begin "$L2_OTHER_OWNER" "$L2_KEY_A" light null)
L2_OTHER_MEM=$(echo "$L2_OTHER" | cut -d'|' -f2)
check "Lot 2: the same transfer key under another owner is ANOTHER transfer (no cross-owner access)" "created|t" \
  "$(echo "$L2_OTHER" | cut -d'|' -f1)|$([ "$L2_OTHER_MEM" != "$L2_MEM" ] && echo t || echo f)"
L2_FOREIGN=$(l2_media "$L2_OTHER_MEM" "$L2_OTHER_OWNER" gallery ready)
check "Lot 2: a ready Hero media of the draft is recorded, idempotently" "recorded|already_recorded" \
  "$(l2_record "$L2_OWNER" "$L2_KEY_A" hero-local "$L2_HERO" hero)|$(l2_record "$L2_OWNER" "$L2_KEY_A" hero-local "$L2_HERO" hero)"
check "Lot 2: refused — wrong purpose, pending media, another owner's media" "refused|refused|refused" \
  "$(l2_record "$L2_OWNER" "$L2_KEY_A" g-local-1 "$L2_HERO" gallery)|$(l2_record "$L2_OWNER" "$L2_KEY_A" g-local-1 "$L2_PENDING" gallery)|$(l2_record "$L2_OWNER" "$L2_KEY_A" g-local-1 "$L2_FOREIGN" gallery)"
check "Lot 2: conflict — one local photo, one media; one media, one local photo" "recorded|conflict|conflict" \
  "$(l2_record "$L2_OWNER" "$L2_KEY_A" g-local-1 "$L2_G1" gallery)|$(l2_record "$L2_OWNER" "$L2_KEY_A" g-local-1 "$(l2_media "$L2_MEM" "$L2_OWNER" gallery ready)" gallery)|$(l2_record "$L2_OWNER" "$L2_KEY_A" g-local-2 "$L2_G1" gallery)"
svc_expect_error "Lot 2: a malformed local photo id is refused" \
  "select * from record_guest_draft_transfer_media_v1('$L2_OWNER','$L2_KEY_A','../etc','$L2_G1','gallery');" "invalid guest draft transfer media"
check "Lot 2: a resumed transfer returns the recorded map" "2" \
  "$(svc "select (select count(*) from jsonb_object_keys(media_map)) from begin_guest_draft_transfer_v1('$L2_OWNER','$L2_KEY_A',3,'dark','fr');")"

# --- T5. Completion ---
check "Lot 2: find reads the transfer without creating anything" "$L2_MEM|started|0" \
  "$(svc "select memorial_id || '|' || transfer_status || '|' || base_draft_revision from find_guest_draft_transfer_v1('$L2_OWNER','$L2_KEY_A');")"
check "Lot 2: find for an unknown key returns nothing" "0" "$(svc "select count(*) from find_guest_draft_transfer_v1('$L2_OWNER','$L2_KEY_B');")"
check "Lot 2: completion is idempotent" "completed|already_completed" \
  "$(svc "select outcome from complete_guest_draft_transfer_v1('$L2_OWNER','$L2_KEY_A');")|$(svc "select outcome from complete_guest_draft_transfer_v1('$L2_OWNER','$L2_KEY_A');")"
check "Lot 2: nothing more can be recorded on a completed transfer" "refused" \
  "$(l2_record "$L2_OWNER" "$L2_KEY_A" g-local-9 "$(l2_media "$L2_MEM" "$L2_OWNER" gallery ready)" gallery)"
check "Lot 2: after completion, the same guest draft lands on the same durable draft" "resumed|$L2_MEM|completed" "$(l2_begin "$L2_OWNER" "$L2_KEY_A" dark "'fr'" | cut -d'|' -f1-3)"

# --- T6. The free quota never blocks the durable save ---
L2_Q_OWNER=$(q8_owner l2-quota-used)
L2_Q1=$(q8_draft "$L2_Q_OWNER"); q8_anchor "$L2_Q1" "$L2_Q_OWNER" >/dev/null
q8_ready "$L2_Q1" l2-quota-used-1 "$Q8_HERO"
svc "$(q8_v2_sql "$L2_Q1" "$L2_Q_OWNER" l2-quota-used-1 avis "$Q8_HERO")" >/dev/null
m1a_age "$L2_Q_OWNER" '30 days'
L2_Q=$(l2_begin "$L2_Q_OWNER" "$L2_KEY_A" light "'fr'")
check "Lot 2: quota used — the durable save still succeeds, without free publication" "created|started|anchored_without_free_publication" \
  "$(echo "$L2_Q" | cut -d'|' -f1)|$(echo "$L2_Q" | cut -d'|' -f3)|$(echo "$L2_Q" | cut -d'|' -f4)"
check "Lot 2: ... with its own 45 days of preparation and no quota consumed" "1080|true|1" \
  "$($DB -t -A -c "select extract(epoch from (free_draft_until - free_anchor_at))::bigint / 3600 || '|' || (free_publish_until = free_anchor_at) from memorials where id='$(echo "$L2_Q" | cut -d'|' -f2)';")|$($DB -t -A -c "select count(*) from memorial_access_events where owner_id='$L2_Q_OWNER' and event='free.first_published';")"

# --- T7. Concurrency: two tabs following the link at once → one draft ---
L2_RACE_OWNER=$(q8_owner l2-race)
L2_CONC="$PGDATA_DIR/concurrency-l2-begin"; mkdir -p "$L2_CONC"
for i in 1 2; do
  (
    rc=0
    $DB -t -A -c "set role service_role; select pg_sleep(0.7); select outcome from begin_guest_draft_transfer_v1('$L2_RACE_OWNER','$L2_KEY_A',3,'light','fr');" >"$L2_CONC/$i.out" 2>"$L2_CONC/$i.err" || rc=$?
    echo "$rc" >"$L2_CONC/$i.rc"
  ) &
done
wait
check "Lot 2: two simultaneous first saves: one created, one resumed, no error" "created resumed|0 0" \
  "$(cat "$L2_CONC"/1.out "$L2_CONC"/2.out | grep -v '^$' | sort | tr '\n' ' ' | sed 's/ $//')|$(cat "$L2_CONC"/1.rc "$L2_CONC"/2.rc | tr '\n' ' ' | sed 's/ $//')"
check "Lot 2: ... and exactly one durable draft exists" "1|1" \
  "$($DB -t -A -c "select count(*) from memorials where owner_id='$L2_RACE_OWNER';")|$($DB -t -A -c "select count(*) from guest_draft_transfers where owner_id='$L2_RACE_OWNER';")"

# --- T8. Etsy untouched ---
L2_ETSY_OWNER=$(q8_owner l2-etsy)
L2_ETSY_ENT=$($DB -t -A -c "insert into entitlements (access_level, source, offer_id, external_order_id) values ('complet','etsy','intemporel','l2-etsy-order') returning id;")
L2_ETSY_MEM=$(svc "select memorial_id from redeem_entitlement('$L2_ETSY_ENT','$L2_ETSY_OWNER','person','intemporel','light');")
check "Lot 2: an owner with an Etsy (complete) memorial can still save a guest draft (separate avis draft)" "created" \
  "$(l2_begin "$L2_ETSY_OWNER" "$L2_KEY_A" dark null | cut -d'|' -f1)"
check "Lot 2: ... and the Etsy memorial is untouched" "complet|true" \
  "$($DB -t -A -c "select access_level || '|' || (free_anchor_at is null) from memorials where id='$L2_ETSY_MEM';")"

# --- T9. Pre/postflight and rollback (never applied automatically) ---
L2_POST=$($DB -t -A -f "$REPO_ROOT/supabase/verifications/qg008_lot2_postflight.sql" 2>&1)
check "Lot 2 postflight: zero ECHEC, every control OK (8)" "0|8" "$(echo "$L2_POST" | grep -c 'ECHEC' || true)|$(echo "$L2_POST" | grep -c '|OK$' || true)"
check "Lot 2 postflight turns red on a client grant" "1" \
  "$($DB -t -A -c "begin;" -c "grant select on guest_draft_transfers to authenticated;" -f "$REPO_ROOT/supabase/verifications/qg008_lot2_postflight.sql" -c "rollback;" 2>/dev/null | grep -c "ECHEC" || true)"
L2_PRE=$($DB -t -A -f "$REPO_ROOT/supabase/verifications/qg008_lot2_preflight.sql" 2>&1)
check "Lot 2 preflight after application: refuses (already applied), prerequisites OK" "1|4" \
  "$(echo "$L2_PRE" | grep -c 'ECHEC' || true)|$(echo "$L2_PRE" | grep -c '|OK$' || true)"
L2_DOWN="$REPO_ROOT/supabase/rollbacks/20261101090000_qg008_lot2_guest_draft_transfer.down.sql"
$PSQL -d postgres -c "create database l2_down_refused template $DB_NAME;" >/dev/null
check "Lot 2 rollback refuses while transfers exist, and changes nothing" "1|t" \
  "$($PSQL -d l2_down_refused -f "$L2_DOWN" 2>&1 | grep -c 'rollback refused' || true)|$($PSQL -d l2_down_refused -t -A -c "select to_regclass('public.guest_draft_transfers') is not null;")"
$PSQL -d postgres -c "drop database l2_down_refused;" >/dev/null
$PSQL -d postgres -c "create database l2_down_clean template $STANDINS_DB;" >/dev/null
for f in "$MIGRATIONS_DIR"/*.sql; do $PSQL -d l2_down_clean -f "$f" >/dev/null; done
L2_PRE_CLEAN=$($PSQL -d l2_down_clean -t -A -c "select 1;" >/dev/null; $PSQL -d l2_down_clean -f "$L2_DOWN" >/dev/null 2>&1; echo $?)
check "Lot 2 rollback applies on a database without transfers" "0" "$L2_PRE_CLEAN"
L2_PRE_AFTER=$($PSQL -d l2_down_clean -t -A -f "$REPO_ROOT/supabase/verifications/qg008_lot2_preflight.sql" 2>&1)
check "Lot 2: after rollback the preflight is green again (5 OK, zero ECHEC), then the migration re-applies" "0|5|0|0" \
  "$(echo "$L2_PRE_AFTER" | grep -c 'ECHEC' || true)|$(echo "$L2_PRE_AFTER" | grep -c '|OK$' || true)|$($PSQL -d l2_down_clean -f "$MIGRATIONS_DIR/20261101090000_qg008_lot2_guest_draft_transfer.sql" >/dev/null 2>&1; echo $?)|$($PSQL -d l2_down_clean -t -A -f "$REPO_ROOT/supabase/verifications/qg008_lot2_postflight.sql" 2>&1 | grep -c 'ECHEC' || true)"
$PSQL -d postgres -c "drop database l2_down_clean;" >/dev/null

# =====================================================================
# QG 008 — Lot 3 : publication depuis l'aperçu (commit_memorial_publication_v3)
# =====================================================================
echo ""
echo "== QG 008 Lot 3: publication from the private preview =="

L3_V3="commit_memorial_publication_v3(uuid,uuid,bigint,text,text,text,text,text,jsonb,jsonb)"
l3_avis() {
  # $1 owner label -> "owner|memorial" : an anchored avis draft, language and slug set, status draft
  local owner mem
  owner=$(q8_owner "$1")
  mem=$(q8_draft "$owner"); q8_anchor "$mem" "$owner" >/dev/null
  $DB -c "update memorials set language='fr', slug='$1' where id='$mem';" >/dev/null
  echo "$owner|$mem"
}
l3_set_draft() {
  # $1 memorial, $2 draft content (JSON)
  $DB -c "update memorial_drafts set content='$2' where memorial_id='$1';" >/dev/null
}
l3_hero() {
  # $1 media id (or null) -> a draft/published content with a Hero
  if [ "$1" = "null" ]; then echo '{"hero":{"displayName":"Lot 3","photo":null}}';
  else echo "{\"hero\":{\"displayName\":\"Lot 3\",\"photo\":{\"mediaId\":\"$1\",\"crop\":{\"zoom\":1,\"focalX\":0.5,\"focalY\":0.5}}}}"; fi
}
l3_v3_sql() {
  # $1 memorial, $2 owner, $3 slug, $4 published content (JSON) — expected = current stored draft
  local rev content
  rev=$($DB -t -A -c "select revision from memorial_drafts where memorial_id='$1';")
  content=$($DB -t -A -c "select content::text from memorial_drafts where memorial_id='$1';")
  echo "select outcome from commit_memorial_publication_v3('$1','$2',$rev,'fr','intemporel','light','$3','avis','$content','$4');"
}
l3_state() {
  # $1 memorial -> "status|first_published_at null?|snapshot count"
  $DB -t -A -c "select m.status || '|' || (m.first_published_at is null) || '|' || (select count(*) from memorial_published_snapshots s where s.memorial_id = m.id) from memorials m where m.id='$1';"
}

# --- L3-1. Privileges ---
check "Lot 3: v3 executable by service_role only" "false|false|true" \
  "$($DB -t -A -c "select has_function_privilege('anon','public.$L3_V3','EXECUTE') || '|' || has_function_privilege('authenticated','public.$L3_V3','EXECUTE') || '|' || has_function_privilege('service_role','public.$L3_V3','EXECUTE');")"
check "Lot 3: v3 is SECURITY DEFINER with an empty search_path" "true|true" \
  "$($DB -t -A -c "select prosecdef || '|' || (proconfig @> array['search_path=\"\"']) from pg_proc where oid=to_regprocedure('public.$L3_V3');")"
check "Lot 3: an authenticated family cannot call v3 directly" "1" \
  "$($DB -c "set role authenticated; select * from commit_memorial_publication_v3(gen_random_uuid(),gen_random_uuid(),0,'fr','intemporel','light','x','avis','{}','{}');" 2>&1 | grep -c 'permission denied' || true)"
check "Lot 3: still no client privilege on memorials.status" "false|false" \
  "$($DB -t -A -c "select has_column_privilege('authenticated','public.memorials','status','UPDATE') || '|' || has_column_privilege('anon','public.memorials','status','UPDATE');")"

# --- L3-2. Happy path: draft -> published in one call ---
IFS='|' read -r L3_OK_OWNER L3_OK <<<"$(l3_avis l3-ok)"
L3_OK_HERO=$(l2_media "$L3_OK" "$L3_OK_OWNER" hero ready)
l3_set_draft "$L3_OK" "$(l3_hero "$L3_OK_HERO")"
check "Lot 3: a draft with a ready Hero photo is published by v3" "published" \
  "$(svc "$(l3_v3_sql "$L3_OK" "$L3_OK_OWNER" l3-ok "$(l3_hero "$L3_OK_HERO")")")"
check "Lot 3: ... status published, first publication stamped, one snapshot" "published|false|1" "$(l3_state "$L3_OK")"
check "Lot 3: ... the free first publication is recorded once (V8 trigger ran)" "1" "$(q8_published_count "$L3_OK_OWNER")"
L3_OK_AT=$($DB -t -A -c "select published_at from memorial_published_snapshots where memorial_id='$L3_OK';")
check "Lot 3: the same call again (double click) is recognised as already published — identity proven under lock" "already_published" \
  "$(svc "$(l3_v3_sql "$L3_OK" "$L3_OK_OWNER" l3-ok "$(l3_hero "$L3_OK_HERO")")")"
check "Lot 3: ... and nothing was rewritten (same snapshot time, one snapshot, one free publication)" "published|false|1|1|$L3_OK_AT" \
  "$(l3_state "$L3_OK")|$(q8_published_count "$L3_OK_OWNER")|$($DB -t -A -c "select published_at from memorial_published_snapshots where memorial_id='$L3_OK';")"
svc_expect_error "Lot 3: a second call with a DIFFERENT published content is a conflict, never a success" \
  "$(l3_v3_sql "$L3_OK" "$L3_OK_OWNER" l3-ok '{"hero":{"displayName":"Autre","photo":null}}')" "memorial lifecycle changed"
svc_expect_error "Lot 3: a second call with a stale revision is a conflict, never a success" \
  "select 1 from commit_memorial_publication_v3('$L3_OK','$L3_OK_OWNER',999,'fr','intemporel','light','l3-ok','avis','$(l3_hero "$L3_OK_HERO")','$(l3_hero "$L3_OK_HERO")');" "memorial lifecycle changed"

# --- L3-3. Hero photo required (HD422), and no ready left behind ---
IFS='|' read -r L3_NP_OWNER L3_NP <<<"$(l3_avis l3-no-photo)"
l3_set_draft "$L3_NP" "$(l3_hero null)"
svc_expect_error "Lot 3: no Hero photo -> HD422" "$(l3_v3_sql "$L3_NP" "$L3_NP_OWNER" l3-no-photo "$(l3_hero null)")" "hero photo required"
check "Lot 3: ... the memorial stays draft, never ready, no snapshot" "draft|true|0" "$(l3_state "$L3_NP")"
L3_PENDING=$(l2_media "$L3_NP" "$L3_NP_OWNER" hero pending)
l3_set_draft "$L3_NP" "$(l3_hero "$L3_PENDING")"
svc_expect_error "Lot 3: a pending Hero photo -> HD422" "$(l3_v3_sql "$L3_NP" "$L3_NP_OWNER" l3-no-photo "$(l3_hero "$L3_PENDING")")" "hero photo required"
L3_GALLERY_AS_HERO=$(l2_media "$L3_NP" "$L3_NP_OWNER" gallery ready)
l3_set_draft "$L3_NP" "$(l3_hero "$L3_GALLERY_AS_HERO")"
svc_expect_error "Lot 3: a gallery media used as Hero -> HD422" "$(l3_v3_sql "$L3_NP" "$L3_NP_OWNER" l3-no-photo "$(l3_hero "$L3_GALLERY_AS_HERO")")" "hero photo required"
L3_FOREIGN_HERO=$(l2_media "$L3_OK" "$L3_OK_OWNER" hero ready)
l3_set_draft "$L3_NP" "$(l3_hero "$L3_FOREIGN_HERO")"
svc_expect_error "Lot 3: another memorial's Hero photo -> HD422" "$(l3_v3_sql "$L3_NP" "$L3_NP_OWNER" l3-no-photo "$(l3_hero "$L3_FOREIGN_HERO")")" "hero photo required"
L3_NP_HERO=$(l2_media "$L3_NP" "$L3_NP_OWNER" hero ready)
l3_set_draft "$L3_NP" "$(l3_hero "$L3_NP_HERO")"
svc_expect_error "Lot 3: a published Hero that differs from the draft's -> HD422" "$(l3_v3_sql "$L3_NP" "$L3_NP_OWNER" l3-no-photo "$(l3_hero "$L3_FOREIGN_HERO")")" "hero photo required"
svc_expect_error "Lot 3: a malformed Hero media id -> HD422" "$(l3_v3_sql "$L3_NP" "$L3_NP_OWNER" l3-no-photo '{"hero":{"displayName":"Lot 3","photo":{"mediaId":"not-a-uuid","crop":null}}}')" "hero photo required"
check "Lot 3: ... after every refusal the memorial is still draft with no snapshot" "draft|true|0" "$(l3_state "$L3_NP")"

# --- L3-4. Atomic rollback on the V8 guards (window, gallery) ---
IFS='|' read -r L3_LATE_OWNER L3_LATE <<<"$(l3_avis l3-late)"
L3_LATE_HERO=$(l2_media "$L3_LATE" "$L3_LATE_OWNER" hero ready)
l3_set_draft "$L3_LATE" "$(l3_hero "$L3_LATE_HERO")"
m1a_age "$L3_LATE_OWNER" '240 hours 1 minute'
svc_expect_error "Lot 3: window closed -> HD410 from the V8 trigger" "$(l3_v3_sql "$L3_LATE" "$L3_LATE_OWNER" l3-late "$(l3_hero "$L3_LATE_HERO")")" "free publication window closed"
check "Lot 3: ... rolled back entirely: still draft (never ready), no snapshot" "draft|true|0" "$(l3_state "$L3_LATE")"
IFS='|' read -r L3_G7_OWNER L3_G7 <<<"$(l3_avis l3-g7)"
L3_G7_HERO=$(l2_media "$L3_G7" "$L3_G7_OWNER" hero ready)
L3_G7_IDS=(); for i in 1 2 3 4 5 6 7; do L3_G7_IDS+=("$(l2_media "$L3_G7" "$L3_G7_OWNER" gallery ready)"); done
L3_G7_CONTENT="{\"hero\":{\"displayName\":\"Lot 3\",\"photo\":{\"mediaId\":\"$L3_G7_HERO\",\"crop\":null}},\"gallery\":{\"items\":[$(q8_items "${L3_G7_IDS[@]}")]}}"
l3_set_draft "$L3_G7" "$L3_G7_CONTENT"
check "Lot 3: an avis draft keeps 7 gallery photos (V8 §3.2)" "7" "$($DB -t -A -c "select jsonb_array_length(content #> '{gallery,items}') from memorial_drafts where memorial_id='$L3_G7';")"
svc_expect_error "Lot 3: publishing 7 gallery photos of an avis -> HD413" "$(l3_v3_sql "$L3_G7" "$L3_G7_OWNER" l3-g7 "$L3_G7_CONTENT")" "free gallery limit reached"
check "Lot 3: ... rolled back entirely: still draft, no snapshot" "draft|true|0" "$(l3_state "$L3_G7")"
L3_G6_PUBLISHED="{\"hero\":{\"displayName\":\"Lot 3\",\"photo\":{\"mediaId\":\"$L3_G7_HERO\",\"crop\":null}},\"gallery\":{\"items\":[$(q8_items "${L3_G7_IDS[@]:0:6}")]}}"
check "Lot 3: publishing 6 of the 7 (the selection) succeeds" "published" "$(svc "$(l3_v3_sql "$L3_G7" "$L3_G7_OWNER" l3-g7 "$L3_G6_PUBLISHED")")"
check "Lot 3: ... the copy holds 6, the draft still holds 7, the 7th media is kept" "6|7|ready" \
  "$($DB -t -A -c "select jsonb_array_length(content #> '{gallery,items}') from memorial_published_snapshots where memorial_id='$L3_G7';")|$($DB -t -A -c "select jsonb_array_length(content #> '{gallery,items}') from memorial_drafts where memorial_id='$L3_G7';")|$($DB -t -A -c "select status from media where id='${L3_G7_IDS[6]}';")"

# --- L3-5. Ownership, lifecycle, compare-and-set ---
IFS='|' read -r L3_CAS_OWNER L3_CAS <<<"$(l3_avis l3-cas)"
L3_CAS_HERO=$(l2_media "$L3_CAS" "$L3_CAS_OWNER" hero ready)
l3_set_draft "$L3_CAS" "$(l3_hero "$L3_CAS_HERO")"
svc_expect_error "Lot 3: another owner is refused (opaque 42501)" "$(l3_v3_sql "$L3_CAS" "$L3_OK_OWNER" l3-cas "$(l3_hero "$L3_CAS_HERO")")" "memorial publication refused"
svc_expect_error "Lot 3: a stale revision is refused by v2's compare-and-set" \
  "select 1 from commit_memorial_publication_v3('$L3_CAS','$L3_CAS_OWNER',999,'fr','intemporel','light','l3-cas','avis','$(l3_hero "$L3_CAS_HERO")','$(l3_hero "$L3_CAS_HERO")');" "memorial draft changed"
svc_expect_error "Lot 3: a wrong expected access level is refused" \
  "$(l3_v3_sql "$L3_CAS" "$L3_CAS_OWNER" l3-cas "$(l3_hero "$L3_CAS_HERO")" | sed "s/'avis'/'complet'/")" "memorial access level changed"
$DB -c "update memorials set status='ready' where id='$L3_CAS';" >/dev/null
svc_expect_error "Lot 3: a memorial already in ready is refused by v3 (v2 remains its path)" "$(l3_v3_sql "$L3_CAS" "$L3_CAS_OWNER" l3-cas "$(l3_hero "$L3_CAS_HERO")")" "memorial lifecycle changed"
$DB -c "update memorials set status='draft' where id='$L3_CAS';" >/dev/null
check "Lot 3: ... after those refusals, still draft with no snapshot" "draft|true|0" "$(l3_state "$L3_CAS")"

# --- L3-6. Concurrency: two simultaneous publications, one wins, no false success ---
IFS='|' read -r L3_RACE_OWNER L3_RACE <<<"$(l3_avis l3-race)"
L3_RACE_HERO=$(l2_media "$L3_RACE" "$L3_RACE_OWNER" hero ready)
l3_set_draft "$L3_RACE" "$(l3_hero "$L3_RACE_HERO")"
L3_RACE_SQL="$(l3_v3_sql "$L3_RACE" "$L3_RACE_OWNER" l3-race "$(l3_hero "$L3_RACE_HERO")")"
L3_CONC="$PGDATA_DIR/concurrency-l3-publish"; mkdir -p "$L3_CONC"
for i in 1 2; do
  (
    rc=0
    $DB -t -A -c "set role service_role; select pg_sleep(0.7); $L3_RACE_SQL" >"$L3_CONC/$i.out" 2>"$L3_CONC/$i.err" || rc=$?
    echo "$rc" >"$L3_CONC/$i.rc"
  ) &
done
wait
check "Lot 3: two simultaneous identical publications: one published, the other proven already_published, no error" "already_published published|0 0" \
  "$(cat "$L3_CONC"/1.out "$L3_CONC"/2.out | grep -v '^$' | sort | tr '\n' ' ' | sed 's/ $//')|$(cat "$L3_CONC"/1.rc "$L3_CONC"/2.rc | tr '\n' ' ' | sed 's/ $//')"
check "Lot 3: ... one snapshot, one free publication" "published|false|1|1" "$(l3_state "$L3_RACE")|$(q8_published_count "$L3_RACE_OWNER")"

# --- L3-6b. Revue finale QG : identité complète du second appel (20261102100000) ---
l3_id_sql() {
  # $1 langue, $2 skin, $3 variante, $4 slug (littéraux SQL), $5 propriétaire, $6 niveau d'accès
  local rev content owner="${5:-$L3_OK_OWNER}" lvl="${6:-avis}"
  rev=$($DB -t -A -c "select revision from memorial_drafts where memorial_id='$L3_OK';")
  content=$($DB -t -A -c "select content::text from memorial_drafts where memorial_id='$L3_OK';")
  echo "select outcome from commit_memorial_publication_v3('$L3_OK','$owner',$rev,$1,$2,$3,$4,'$lvl','$content','$(l3_hero "$L3_OK_HERO")');"
}
L3_SNAP_BEFORE=$($DB -t -A -c "select published_at || '|' || md5(content::text) from memorial_published_snapshots where memorial_id='$L3_OK';")
check "Lot 3 identity: the exact same parameters -> already_published" "already_published" "$(svc "$(l3_id_sql "'fr'" "'intemporel'" "'light'" "'l3-ok'")")"
svc_expect_error "Lot 3 identity: a different language -> conflict, never already_published" "$(l3_id_sql "'en'" "'intemporel'" "'light'" "'l3-ok'")" "memorial lifecycle changed"
svc_expect_error "Lot 3 identity: a different skin -> conflict" "$(l3_id_sql "'fr'" "'musulman'" "'light'" "'l3-ok'")" "memorial lifecycle changed"
svc_expect_error "Lot 3 identity: a different variant -> conflict" "$(l3_id_sql "'fr'" "'intemporel'" "'dark'" "'l3-ok'")" "memorial lifecycle changed"
svc_expect_error "Lot 3 identity: a different slug -> conflict" "$(l3_id_sql "'fr'" "'intemporel'" "'light'" "'autre-slug'")" "memorial lifecycle changed"
svc_expect_error "Lot 3 identity: a NULL language -> refused at the entry (22023)" "$(l3_id_sql "null" "'intemporel'" "'light'" "'l3-ok'")" "invalid memorial publication request"
svc_expect_error "Lot 3 identity: a blank slug -> refused at the entry (22023)" "$(l3_id_sql "'fr'" "'intemporel'" "'light'" "'  '")" "invalid memorial publication request"
svc_expect_error "Lot 3 identity: a different access level -> conflict" "$(l3_id_sql "'fr'" "'intemporel'" "'light'" "'l3-ok'" "$L3_OK_OWNER" complet)" "memorial lifecycle changed"
L3_INTRUDER=$(q8_owner l3-identity-intruder)
svc_expect_error "Lot 3 identity: another owner -> 42501 before the already_published branch" "$(l3_id_sql "'fr'" "'intemporel'" "'light'" "'l3-ok'" "$L3_INTRUDER")" "memorial publication refused"
check "Lot 3 identity: none of these calls rewrote the published copy or added an event" "$L3_SNAP_BEFORE|1" \
  "$($DB -t -A -c "select published_at || '|' || md5(content::text) from memorial_published_snapshots where memorial_id='$L3_OK';")|$(q8_published_count "$L3_OK_OWNER")"

# --- L3-7. v2 untouched ---
check "Lot 3: commit_memorial_publication_v2 keeps its own privileges (service_role only)" "false|false|true" \
  "$($DB -t -A -c "select has_function_privilege('anon','public.commit_memorial_publication_v2(uuid,uuid,bigint,text,timestamptz,text,text,text,text,text,jsonb,jsonb)','EXECUTE') || '|' || has_function_privilege('authenticated','public.commit_memorial_publication_v2(uuid,uuid,bigint,text,timestamptz,text,text,text,text,text,jsonb,jsonb)','EXECUTE') || '|' || has_function_privilege('service_role','public.commit_memorial_publication_v2(uuid,uuid,bigint,text,timestamptz,text,text,text,text,text,jsonb,jsonb)','EXECUTE');")"

# --- L3-8. Pre/postflight and rollback (never applied automatically) ---
L3_POST=$($DB -t -A -f "$REPO_ROOT/supabase/verifications/qg008_lot3_postflight.sql" 2>&1)
check "Lot 3 postflight: zero ECHEC, every control OK (5)" "0|5" "$(echo "$L3_POST" | grep -c 'ECHEC' || true)|$(echo "$L3_POST" | grep -c '|OK$' || true)"
check "Lot 3 postflight turns red on a client grant of v3" "1" \
  "$($DB -t -A -c "begin;" -c "grant execute on function public.$L3_V3 to authenticated;" -f "$REPO_ROOT/supabase/verifications/qg008_lot3_postflight.sql" -c "rollback;" 2>/dev/null | grep -c "ECHEC" || true)"
L3_PRE=$($DB -t -A -f "$REPO_ROOT/supabase/verifications/qg008_lot3_preflight.sql" 2>&1)
check "Lot 3 preflight after application: refuses (already applied), prerequisites OK" "1|4" \
  "$(echo "$L3_PRE" | grep -c 'ECHEC' || true)|$(echo "$L3_PRE" | grep -c '|OK$' || true)"
L3_DOWN="$REPO_ROOT/supabase/rollbacks/20261102090000_qg008_lot3_publication_from_preview.down.sql"
$PSQL -d postgres -c "create database l3_down template $DB_NAME;" >/dev/null
L3_PUBLISHED_BEFORE=$($PSQL -d l3_down -t -A -c "select count(*) || '/' || (select count(*) from memorial_published_snapshots) from memorials where status='published';")
check "Lot 3 rollback applies, keeps every publication and snapshot, and the preflight is green again (5 OK)" "0|$L3_PUBLISHED_BEFORE|5" \
  "$($PSQL -d l3_down -f "$L3_DOWN" >/dev/null 2>&1; echo $?)|$($PSQL -d l3_down -t -A -c "select count(*) || '/' || (select count(*) from memorial_published_snapshots) from memorials where status='published';")|$($PSQL -d l3_down -t -A -f "$REPO_ROOT/supabase/verifications/qg008_lot3_preflight.sql" 2>&1 | grep -c '|OK$' || true)"
check "Lot 3: ... then 20261102090000 alone re-applies, and the postflight flags the missing identity correction" "0|1" \
  "$($PSQL -d l3_down -f "$MIGRATIONS_DIR/20261102090000_qg008_lot3_publication_from_preview.sql" >/dev/null 2>&1; echo $?)|$($PSQL -d l3_down -t -A -f "$REPO_ROOT/supabase/verifications/qg008_lot3_postflight.sql" 2>&1 | grep -c 'ECHEC' || true)"
check "Lot 3: ... and with 20261102100000 the postflight is green again (5 OK)" "0|0|5" \
  "$($PSQL -d l3_down -f "$MIGRATIONS_DIR/20261102100000_qg008_lot3_v3_publication_identity.sql" >/dev/null 2>&1; echo $?)|$($PSQL -d l3_down -t -A -f "$REPO_ROOT/supabase/verifications/qg008_lot3_postflight.sql" 2>&1 | grep -c 'ECHEC' || true)|$($PSQL -d l3_down -t -A -f "$REPO_ROOT/supabase/verifications/qg008_lot3_postflight.sql" 2>&1 | grep -c '|OK$' || true)"
L3_ID_DOWN="$REPO_ROOT/supabase/rollbacks/20261102100000_qg008_lot3_v3_publication_identity.down.sql"
L3_BODY_0900=$($PSQL -d l3_down -t -A -c "begin;" -f "$MIGRATIONS_DIR/20261102090000_qg008_lot3_publication_from_preview.sql" -c "select md5(prosrc) from pg_proc where oid = to_regprocedure('public.$L3_V3');" -c "rollback;" 2>/dev/null | tail -1)
check "Lot 3 identity rollback restores exactly the 20261102090000 body, and the identity correction re-applies" "0|$L3_BODY_0900|0" \
  "$($PSQL -d l3_down -f "$L3_ID_DOWN" >/dev/null 2>&1; echo $?)|$($PSQL -d l3_down -t -A -c "select md5(prosrc) from pg_proc where oid = to_regprocedure('public.$L3_V3');")|$($PSQL -d l3_down -f "$MIGRATIONS_DIR/20261102100000_qg008_lot3_v3_publication_identity.sql" >/dev/null 2>&1; echo $?)"
$PSQL -d postgres -c "drop database l3_down;" >/dev/null

# =====================================================================
# QG 008 — Lot 3 v4 : slug public opaque généré à la première publication
# =====================================================================
echo ""
echo "== QG 008 Lot 3 v4: public slug generated at first publication =="

L4_V4="commit_memorial_publication_v4(uuid,uuid,bigint,text,text,text,text,text,jsonb,jsonb)"
L4_SLUGFN="memorial_public_slug_v1(uuid,integer)"
l4_draft() {
  # $1 owner label -> "owner|memorial" : an anchored avis draft, language set, slug NULL (the real S1 shape)
  local owner mem
  owner=$(q8_owner "$1")
  mem=$(q8_draft "$owner"); q8_anchor "$mem" "$owner" >/dev/null
  $DB -c "update memorials set language='fr' where id='$mem';" >/dev/null
  echo "$owner|$mem"
}
l4_sql() {
  # $1 memorial, $2 owner, $3 expected slug (SQL literal: null or 'x'), $4 published content — expected = stored draft
  local rev content
  rev=$($DB -t -A -c "select revision from memorial_drafts where memorial_id='$1';")
  content=$($DB -t -A -c "select content::text from memorial_drafts where memorial_id='$1';")
  echo "select outcome || '|' || slug from commit_memorial_publication_v4('$1','$2',$rev,'fr','intemporel','light',$3,'avis','$content','$4');"
}
l4_slug() { $DB -t -A -c "select coalesce(slug,'NULL') from memorials where id='$1';"; }
l4_expected() { $DB -t -A -c "select public.memorial_public_slug_v1('$1', ${2:-12});"; }

# --- L4-1. Privileges and the pure slug function ---
check "Lot 3 v4: v4 executable by service_role only" "false|false|true" \
  "$($DB -t -A -c "select has_function_privilege('anon','public.$L4_V4','EXECUTE') || '|' || has_function_privilege('authenticated','public.$L4_V4','EXECUTE') || '|' || has_function_privilege('service_role','public.$L4_V4','EXECUTE');")"
check "Lot 3 v4: v4 is SECURITY DEFINER with an empty search_path" "true|true" \
  "$($DB -t -A -c "select prosecdef || '|' || (proconfig @> array['search_path=\"\"']) from pg_proc where oid=to_regprocedure('public.$L4_V4');")"
check "Lot 3 v4: an authenticated family cannot call v4 directly" "1" \
  "$($DB -c "set role authenticated; select * from commit_memorial_publication_v4(gen_random_uuid(),gen_random_uuid(),0,'fr','intemporel','light',null,'avis','{}','{}');" 2>&1 | grep -c 'permission denied' || true)"
check "Lot 3 v4: the slug function is callable by no client role, immutable, empty search_path" "false|false|false|i|true" \
  "$($DB -t -A -c "select has_function_privilege('anon','public.$L4_SLUGFN','EXECUTE') || '|' || has_function_privilege('authenticated','public.$L4_SLUGFN','EXECUTE') || '|' || has_function_privilege('service_role','public.$L4_SLUGFN','EXECUTE') || '|' || provolatile::text || '|' || (proconfig @> array['search_path=\"\"']) from pg_proc where oid=to_regprocedure('public.$L4_SLUGFN');")"
check "Lot 3 v4: slug = SHA-256 prefix, matches an independent computation (fixed vector)" "10d63bbb38ba" \
  "$($DB -t -A -c "select public.memorial_public_slug_v1('00000000-0000-4000-8000-000000000000', 12);")"
check "Lot 3 v4: slug is opaque hex, deterministic, and grows by length; out of bounds -> NULL" "true|true|16|NULL|NULL" \
  "$($DB -t -A -c "with s as (select gen_random_uuid() as id) select (public.memorial_public_slug_v1(id,12) ~ '^[0-9a-f]{12}$')::text || '|' || (public.memorial_public_slug_v1(id,12) = public.memorial_public_slug_v1(id,12))::text || '|' || length(public.memorial_public_slug_v1(id,16)) || '|' || coalesce(public.memorial_public_slug_v1(id,8),'NULL') || '|' || coalesce(public.memorial_public_slug_v1(id,68),'NULL') from s;")"
check "Lot 3 v4: still no client privilege on memorials.slug" "false|false" \
  "$($DB -t -A -c "select has_column_privilege('authenticated','public.memorials','slug','UPDATE') || '|' || has_column_privilege('anon','public.memorials','slug','UPDATE');")"

# --- L4-2. First publication of a memorial WITHOUT slug (the S1 case) ---
IFS='|' read -r L4_OK_OWNER L4_OK <<<"$(l4_draft l4-ok)"
L4_OK_HERO=$(l2_media "$L4_OK" "$L4_OK_OWNER" hero ready)
l3_set_draft "$L4_OK" "$(l3_hero "$L4_OK_HERO")"
check "Lot 3 v4: a draft without slug is refused by v3 (the S1 failure, reproduced)" "1" \
  "$($DB -c "set role service_role; $(l3_v3_sql "$L4_OK" "$L4_OK_OWNER" "" "$(l3_hero "$L4_OK_HERO")")" 2>&1 | grep -c 'invalid memorial publication request' || true)"
L4_OK_SLUG=$(l4_expected "$L4_OK")
check "Lot 3 v4: v4 publishes it and returns the generated opaque slug" "published|$L4_OK_SLUG" \
  "$(svc "$(l4_sql "$L4_OK" "$L4_OK_OWNER" null "$(l3_hero "$L4_OK_HERO")")")"
check "Lot 3 v4: ... slug stored = deterministic slug of the id, status published, one snapshot, one free publication" "$L4_OK_SLUG|published|false|1|1" \
  "$(l4_slug "$L4_OK")|$(l3_state "$L4_OK")|$(q8_published_count "$L4_OK_OWNER")"
L4_OK_AT=$($DB -t -A -c "select published_at from memorial_published_snapshots where memorial_id='$L4_OK';")
check "Lot 3 v4: double click prepared before the slug existed (expected NULL) -> already_published, same slug" "already_published|$L4_OK_SLUG" \
  "$(svc "$(l4_sql "$L4_OK" "$L4_OK_OWNER" null "$(l3_hero "$L4_OK_HERO")")")"
check "Lot 3 v4: second call with the stored slug expected -> already_published" "already_published|$L4_OK_SLUG" \
  "$(svc "$(l4_sql "$L4_OK" "$L4_OK_OWNER" "'$L4_OK_SLUG'" "$(l3_hero "$L4_OK_HERO")")")"
svc_expect_error "Lot 3 v4: second call expecting ANOTHER slug -> conflict, never a success" \
  "$(l4_sql "$L4_OK" "$L4_OK_OWNER" "'autre-slug'" "$(l3_hero "$L4_OK_HERO")")" "memorial lifecycle changed"
svc_expect_error "Lot 3 v4: second call with a different published content -> conflict" \
  "$(l4_sql "$L4_OK" "$L4_OK_OWNER" null '{"hero":{"displayName":"Autre","photo":null}}')" "memorial lifecycle changed"
check "Lot 3 v4: ... nothing rewritten: same slug, same snapshot time, one snapshot, one free publication" "$L4_OK_SLUG|published|false|1|1|$L4_OK_AT" \
  "$(l4_slug "$L4_OK")|$(l3_state "$L4_OK")|$(q8_published_count "$L4_OK_OWNER")|$($DB -t -A -c "select published_at from memorial_published_snapshots where memorial_id='$L4_OK';")"

# --- L4-3. Refusals: the slug is rolled back with everything, and the NEXT attempt yields the SAME slug ---
IFS='|' read -r L4_R_OWNER L4_R <<<"$(l4_draft l4-refus)"
l3_set_draft "$L4_R" "$(l3_hero null)"
L4_R_SLUG=$(l4_expected "$L4_R")
svc_expect_error "Lot 3 v4: no Hero photo -> HD422 (v3 unchanged)" "$(l4_sql "$L4_R" "$L4_R_OWNER" null "$(l3_hero null)")" "hero photo required"
check "Lot 3 v4: ... rolled back entirely: slug still NULL, draft, no snapshot" "NULL|draft|true|0" "$(l4_slug "$L4_R")|$(l3_state "$L4_R")"
m1a_age "$L4_R_OWNER" '240 hours 1 minute'
L4_R_HERO=$(l2_media "$L4_R" "$L4_R_OWNER" hero ready)
l3_set_draft "$L4_R" "$(l3_hero "$L4_R_HERO")"
svc_expect_error "Lot 3 v4: free window closed -> HD410, refused" "$(l4_sql "$L4_R" "$L4_R_OWNER" null "$(l3_hero "$L4_R_HERO")")" "free publication window closed"
check "Lot 3 v4: ... rolled back entirely again: slug still NULL, draft, no snapshot" "NULL|draft|true|0" "$(l4_slug "$L4_R")|$(l3_state "$L4_R")"
svc_expect_error "Lot 3 v4: another owner -> 42501 before any slug is written" "$(l4_sql "$L4_R" "$L4_OK_OWNER" null "$(l3_hero "$L4_R_HERO")")" "memorial publication refused"
svc_expect_error "Lot 3 v4: a stale revision -> refused (v2 compare-and-set)" \
  "select 1 from commit_memorial_publication_v4('$L4_R','$L4_R_OWNER',999,'fr','intemporel','light',null,'avis','$(l3_hero "$L4_R_HERO")','$(l3_hero "$L4_R_HERO")');" "memorial draft changed"
svc_expect_error "Lot 3 v4: expecting a slug that does not exist yet -> conflict" "$(l4_sql "$L4_R" "$L4_R_OWNER" "'$L4_R_SLUG'" "$(l3_hero "$L4_R_HERO")")" "memorial lifecycle changed"
svc_expect_error "Lot 3 v4: a blank expected slug -> 22023" "$(l4_sql "$L4_R" "$L4_R_OWNER" "'  '" "$(l3_hero "$L4_R_HERO")")" "invalid memorial publication request"
check "Lot 3 v4: ... after every refusal: slug NULL, draft, no snapshot, no free publication" "NULL|draft|true|0|0" "$(l4_slug "$L4_R")|$(l3_state "$L4_R")|$(q8_published_count "$L4_R_OWNER")"
m1a_age "$L4_R_OWNER" '-241 hours'   # the free window is open again (history moved back to now)
check "Lot 3 v4: once allowed, the publication succeeds with EXACTLY the slug computed before the refusals" "published|$L4_R_SLUG" \
  "$(svc "$(l4_sql "$L4_R" "$L4_R_OWNER" null "$(l3_hero "$L4_R_HERO")")")"

# --- L4-4. Collision: the 12-char candidate already taken by ANOTHER memorial -> the 16-char one ---
IFS='|' read -r L4_C_OWNER L4_C <<<"$(l4_draft l4-collision)"
L4_C_HERO=$(l2_media "$L4_C" "$L4_C_OWNER" hero ready)
l3_set_draft "$L4_C" "$(l3_hero "$L4_C_HERO")"
IFS='|' read -r L4_X_OWNER L4_X <<<"$(l4_draft l4-occupant)"
$DB -c "update memorials set slug = public.memorial_public_slug_v1('$L4_C', 12) where id='$L4_X';" >/dev/null
L4_C_16=$(l4_expected "$L4_C" 16)
check "Lot 3 v4: collision on the 12-char candidate -> the 16-char candidate, published" "published|$L4_C_16" \
  "$(svc "$(l4_sql "$L4_C" "$L4_C_OWNER" null "$(l3_hero "$L4_C_HERO")")")"
check "Lot 3 v4: ... the occupant keeps its slug, both unique" "$(l4_expected "$L4_C" 12)|$L4_C_16|0" \
  "$(l4_slug "$L4_X")|$(l4_slug "$L4_C")|$($DB -t -A -c "select count(*) from (select slug from memorials where slug is not null group by slug having count(*) > 1) d;")"

# --- L4-5. Lifecycle: a memorial already past draft without slug is never given one by v4 ---
IFS='|' read -r L4_L_OWNER L4_L <<<"$(l4_draft l4-lifecycle)"
L4_L_HERO=$(l2_media "$L4_L" "$L4_L_OWNER" hero ready)
l3_set_draft "$L4_L" "$(l3_hero "$L4_L_HERO")"
$DB -c "update memorials set status='ready' where id='$L4_L';" >/dev/null
svc_expect_error "Lot 3 v4: a ready memorial without slug -> conflict, no slug generated" "$(l4_sql "$L4_L" "$L4_L_OWNER" null "$(l3_hero "$L4_L_HERO")")" "memorial lifecycle changed"
check "Lot 3 v4: ... slug still NULL" "NULL" "$(l4_slug "$L4_L")"
$DB -c "update memorials set status='draft' where id='$L4_L';" >/dev/null

# --- L4-6. Concurrency: two simultaneous first publications, one published, the other already_published, ONE slug ---
IFS='|' read -r L4_RACE_OWNER L4_RACE <<<"$(l4_draft l4-race)"
L4_RACE_HERO=$(l2_media "$L4_RACE" "$L4_RACE_OWNER" hero ready)
l3_set_draft "$L4_RACE" "$(l3_hero "$L4_RACE_HERO")"
L4_RACE_SQL="$(l4_sql "$L4_RACE" "$L4_RACE_OWNER" null "$(l3_hero "$L4_RACE_HERO")")"
L4_RACE_SLUG=$(l4_expected "$L4_RACE")
L4_CONC="$PGDATA_DIR/concurrency-l4-publish"; mkdir -p "$L4_CONC"
for i in 1 2; do
  (
    rc=0
    $DB -t -A -c "set role service_role; select pg_sleep(0.7); $L4_RACE_SQL" >"$L4_CONC/$i.out" 2>"$L4_CONC/$i.err" || rc=$?
    echo "$rc" >"$L4_CONC/$i.rc"
  ) &
done
wait
check "Lot 3 v4: two simultaneous first publications: published + already_published, same slug, no error" "already_published|$L4_RACE_SLUG published|$L4_RACE_SLUG|0 0" \
  "$(cat "$L4_CONC"/1.out "$L4_CONC"/2.out | grep -v '^$' | sort | tr '\n' ' ' | sed 's/ $//')|$(cat "$L4_CONC"/1.rc "$L4_CONC"/2.rc | tr '\n' ' ' | sed 's/ $//')"
check "Lot 3 v4: ... one snapshot, one free publication, the slug stored once" "published|false|1|1|$L4_RACE_SLUG" "$(l3_state "$L4_RACE")|$(q8_published_count "$L4_RACE_OWNER")|$(l4_slug "$L4_RACE")"

# --- L4-7. v3 and v2 untouched by v4 ---
L3_V3_MD5_BEFORE_V4=$($DB -t -A -c "begin;" -f "$MIGRATIONS_DIR/20261102100000_qg008_lot3_v3_publication_identity.sql" -c "select md5(prosrc) from pg_proc where oid = to_regprocedure('public.$L3_V3');" -c "rollback;" 2>/dev/null | tail -1)
check "Lot 3 v4: v3 body unchanged by v4 (same md5 as after 20261102100000)" "$L3_V3_MD5_BEFORE_V4" \
  "$($DB -t -A -c "select md5(prosrc) from pg_proc where oid=to_regprocedure('public.$L3_V3');")"

# --- L4-8. Pre/postflight and rollback (never applied automatically) ---
L4_POST=$($DB -t -A -f "$REPO_ROOT/supabase/verifications/qg008_lot3_v4_postflight.sql" 2>&1)
check "Lot 3 v4 postflight: zero ECHEC, every control OK (6)" "0|6" "$(echo "$L4_POST" | grep -c 'ECHEC' || true)|$(echo "$L4_POST" | grep -c '|OK$' || true)"
check "Lot 3 v4 postflight turns red on a client grant of v4" "1" \
  "$($DB -t -A -c "begin;" -c "grant execute on function public.$L4_V4 to authenticated;" -f "$REPO_ROOT/supabase/verifications/qg008_lot3_v4_postflight.sql" -c "rollback;" 2>/dev/null | grep -c "ECHEC" || true)"
check "Lot 3 v4 postflight turns red on a published memorial without slug" "1" \
  "$($DB -t -A -c "begin;" -c "update memorials set slug = null where id='$L4_OK';" -f "$REPO_ROOT/supabase/verifications/qg008_lot3_v4_postflight.sql" -c "rollback;" 2>/dev/null | grep -c "ECHEC" || true)"
L4_PRE=$($DB -t -A -f "$REPO_ROOT/supabase/verifications/qg008_lot3_v4_preflight.sql" 2>&1)
check "Lot 3 v4 preflight after application: refuses (already applied), the other controls OK" "1|7" \
  "$(echo "$L4_PRE" | grep -c 'ECHEC' || true)|$(echo "$L4_PRE" | grep -c '|OK$' || true)"
L4_DOWN="$REPO_ROOT/supabase/rollbacks/20261103090000_qg008_lot3_v4_publication_slug.down.sql"
$PSQL -d postgres -c "create database l4_down template $DB_NAME;" >/dev/null
L4_SLUGS_BEFORE=$($PSQL -d l4_down -t -A -c "select count(*) || '/' || (select count(*) from memorials where status='published') from memorials where slug is not null;")
check "Lot 3 v4 rollback applies, keeps every slug and publication, v3 still there, the preflight is green again (8 OK)" "0|$L4_SLUGS_BEFORE|present|8" \
  "$($PSQL -d l4_down -f "$L4_DOWN" >/dev/null 2>&1; echo $?)|$($PSQL -d l4_down -t -A -c "select count(*) || '/' || (select count(*) from memorials where status='published') from memorials where slug is not null;")|$($PSQL -d l4_down -t -A -c "select case when to_regprocedure('public.$L3_V3') is null then 'absent' else 'present' end;")|$($PSQL -d l4_down -t -A -f "$REPO_ROOT/supabase/verifications/qg008_lot3_v4_preflight.sql" 2>&1 | grep -c '|OK$' || true)"
check "Lot 3 v4: ... then the migration re-applies and the postflight is green again (6 OK)" "0|0|6" \
  "$($PSQL -d l4_down -f "$MIGRATIONS_DIR/20261103090000_qg008_lot3_v4_publication_slug.sql" >/dev/null 2>&1; echo $?)|$($PSQL -d l4_down -t -A -f "$REPO_ROOT/supabase/verifications/qg008_lot3_v4_postflight.sql" 2>&1 | grep -c 'ECHEC' || true)|$($PSQL -d l4_down -t -A -f "$REPO_ROOT/supabase/verifications/qg008_lot3_v4_postflight.sql" 2>&1 | grep -c '|OK$' || true)"
$PSQL -d postgres -c "drop database l4_down;" >/dev/null


# =====================================================================
# QG 016 / M1 — lecture publique sécurisée : read_public_memorial_v1(p_slug)
# =====================================================================
echo ""
echo "== QG 016 M1: secure public read of a published memorial =="

M1_FN="read_public_memorial_v1(text)"
# The harness itself grants anon SELECT on memorial_published_snapshots, memorials and memorial_drafts
# (test-only, for the RLS assertions above). M1_REAL removes exactly those test-only grants inside a
# rolled-back transaction, reproducing the privilege state the MIGRATIONS alone produce (013C).
M1_REAL="revoke select on table public.memorial_published_snapshots, public.memorials, public.memorial_drafts from anon;"
m1_count() { svc "select count(*) from public.read_public_memorial_v1($1);"; }
m1_in_tx() {
  # $1 SQL run as superuser under replica role inside a transaction, $2 SQL literal slug -> row count as service_role; always rolled back
  $DB -t -A -c "begin;" -c "set session_replication_role = replica;" -c "$1" -c "set session_replication_role = origin;" \
    -c "set role service_role; select count(*) from public.read_public_memorial_v1($2);" -c "rollback;" 2>&1 | tail -1
}

# --- M1-1. Privileges and function properties ---
check "M1: read_public_memorial_v1 executable by service_role only" "false|false|true" \
  "$($DB -t -A -c "select has_function_privilege('anon','public.$M1_FN','EXECUTE') || '|' || has_function_privilege('authenticated','public.$M1_FN','EXECUTE') || '|' || has_function_privilege('service_role','public.$M1_FN','EXECUTE');")"
check "M1: SECURITY DEFINER, STABLE, empty search_path" "true|s|true" \
  "$($DB -t -A -c "select prosecdef || '|' || provolatile::text || '|' || (proconfig @> array['search_path=\"\"']) from pg_proc where oid=to_regprocedure('public.$M1_FN');")"
check "M1: anon cannot call it" "1" \
  "$($DB -c "set role anon; select * from public.read_public_memorial_v1('x');" 2>&1 | grep -c 'permission denied' || true)"
check "M1: authenticated cannot call it" "1" \
  "$($DB -c "set role authenticated; select * from public.read_public_memorial_v1('x');" 2>&1 | grep -c 'permission denied' || true)"
check "M1: 013C kept — published snapshots unreadable by anon, authenticated and service_role (migrations-only privileges)" "false|false|false" \
  "$($DB -t -A -c "begin;" -c "$M1_REAL" -c "select has_table_privilege('anon','public.memorial_published_snapshots','SELECT') || '|' || has_table_privilege('authenticated','public.memorial_published_snapshots','SELECT') || '|' || has_table_privilege('service_role','public.memorial_published_snapshots','SELECT');" -c "rollback;" | tail -1)"
check "M1: 013C kept — service_role still cannot read the snapshot table directly" "1" \
  "$($DB -c "set role service_role; select count(*) from public.memorial_published_snapshots;" 2>&1 | grep -c 'permission denied' || true)"
check "M1: the function body never reads the draft table" "f" \
  "$($DB -t -A -c "select prosrc like '%memorial_drafts%' from pg_proc where oid=to_regprocedure('public.$M1_FN');")"

# --- M1-2. A published avis with Hero + 2 gallery photos, and media that must NOT be returned ---
IFS='|' read -r M1_OWNER M1_MEM <<<"$(l4_draft m1-pub)"
M1_HERO=$(l2_media "$M1_MEM" "$M1_OWNER" hero ready)
M1_G1=$(l2_media "$M1_MEM" "$M1_OWNER" gallery ready)
M1_G2=$(l2_media "$M1_MEM" "$M1_OWNER" gallery ready)
M1_G_UNREF=$(l2_media "$M1_MEM" "$M1_OWNER" gallery ready)
M1_G_PENDING=$($DB -t -A -c "insert into media (memorial_id, owner_id, storage_path, media_type, mime_type, purpose, status, size_bytes) values ('$M1_MEM','$M1_OWNER','$M1_MEM/' || gen_random_uuid() || '/original.jpg','photo','image/jpeg','gallery','pending',100) returning id;")
M1_CONTENT="{\"hero\":{\"displayName\":\"M1\",\"photo\":{\"mediaId\":\"$M1_HERO\",\"crop\":{\"zoom\":1,\"focalX\":0.5,\"focalY\":0.5}}},\"gallery\":{\"items\":[{\"mediaId\":\"$M1_G1\"},{\"mediaId\":\"$M1_G2\"}]}}"
l3_set_draft "$M1_MEM" "$M1_CONTENT"
M1_SLUG=$(l4_expected "$M1_MEM")
check "M1 setup: the avis is published by the real v4 with its opaque slug" "published|$M1_SLUG" \
  "$(svc "$(l4_sql "$M1_MEM" "$M1_OWNER" null "$M1_CONTENT")")"

check "M1: published and visible -> exactly one row" "1" "$(m1_count "'$M1_SLUG'")"
check "M1: identity columns (id, slug, skin, variant, language, level)" "$M1_MEM|$M1_SLUG|intemporel|light|fr|avis" \
  "$(svc "select memorial_id || '|' || slug || '|' || skin || '|' || coalesce(skin_variant,'NULL') || '|' || language || '|' || access_level from public.read_public_memorial_v1('$M1_SLUG');")"
check "M1: content = the published snapshot, published_at and first_published_at = the stored ones" "true|true|true" \
  "$($DB -t -A -c "select (r.content = s.content) || '|' || (r.published_at = s.published_at) || '|' || (r.first_published_at = m.first_published_at) from public.read_public_memorial_v1('$M1_SLUG') r join memorial_published_snapshots s on s.memorial_id = r.memorial_id join memorials m on m.id = r.memorial_id;")"
check "M1: media = exactly the Hero + the 2 referenced gallery photos (unreferenced and pending excluded)" "$(printf '%s\n' "$M1_HERO" "$M1_G1" "$M1_G2" | sort | tr '\n' ',')" \
  "$(svc "select string_agg(e->>'media_id', ',' order by e->>'media_id') || ',' from public.read_public_memorial_v1('$M1_SLUG') r, jsonb_array_elements(r.media) e;")"
check "M1: each media carries purpose, storage path and dimensions keys (server-side only)" "3|3|3" \
  "$(svc "select count(*) filter (where e ? 'purpose') || '|' || count(*) filter (where e ? 'storage_path') || '|' || count(*) filter (where e ? 'width' and e ? 'height') from public.read_public_memorial_v1('$M1_SLUG') r, jsonb_array_elements(r.media) e;")"
check "M1: purposes as referenced (1 hero, 2 gallery)" "1|2" \
  "$(svc "select count(*) filter (where e->>'purpose' = 'hero') || '|' || count(*) filter (where e->>'purpose' = 'gallery') from public.read_public_memorial_v1('$M1_SLUG') r, jsonb_array_elements(r.media) e;")"
check "M1: the unreferenced and pending photos never appear" "0" \
  "$(svc "select count(*) from public.read_public_memorial_v1('$M1_SLUG') r, jsonb_array_elements(r.media) e where e->>'media_id' in ('$M1_G_UNREF','$M1_G_PENDING');")"

# --- M1-3. The draft is never the source ---
$DB -c "update memorial_drafts set content = jsonb_set(content, '{hero,displayName}', '\"BROUILLON-MODIFIE\"') where memorial_id = '$M1_MEM';" >/dev/null
check "M1: after a post-publication draft edit, the public read still returns the published snapshot" "M1|true" \
  "$($DB -t -A -c "select (r.content #>> '{hero,displayName}') || '|' || (r.content = s.content) from public.read_public_memorial_v1('$M1_SLUG') r join memorial_published_snapshots s on s.memorial_id = r.memorial_id;")"
check "M1: ... and the draft really differs (sanity)" "BROUILLON-MODIFIE" \
  "$($DB -t -A -c "select content #>> '{hero,displayName}' from memorial_drafts where memorial_id = '$M1_MEM';")"

# --- M1-4. Zero rows: bad slugs ---
check "M1: NULL slug -> 0 rows, no error" "0" "$(m1_count "null")"
check "M1: empty slug -> 0 rows" "0" "$(m1_count "''")"
check "M1: unknown slug -> 0 rows" "0" "$(m1_count "'ffffffffffff'")"
check "M1: exact match only — upper case -> 0 rows" "0" "$(m1_count "upper('$M1_SLUG')")"
check "M1: exact match only — surrounding spaces -> 0 rows" "0" "$(m1_count "' $M1_SLUG '")"
check "M1: exact match only — prefix of the slug -> 0 rows" "0" "$(m1_count "left('$M1_SLUG', 8)")"
check "M1: exact match only — LIKE wildcard is not a pattern -> 0 rows" "0" "$(m1_count "'%'")"

# --- M1-5. Zero rows: lifecycle and visibility (each in a rolled-back transaction) ---
check "M1: status editing -> 0 rows (masked, as the existing public policy; PO D3 pending)" "0" \
  "$(m1_in_tx "update memorials set status = 'editing' where id = '$M1_MEM';" "'$M1_SLUG'")"
check "M1: status archived (withdrawn) -> 0 rows" "0" \
  "$(m1_in_tx "update memorials set status = 'archived' where id = '$M1_MEM';" "'$M1_SLUG'")"
check "M1: avis past free_public_until (expired) -> 0 rows" "0" \
  "$(m1_in_tx "update memorials set first_published_at = now() - interval '50 days', free_public_until = now() - interval '5 days', free_private_until = now() + interval '25 days' where id = '$M1_MEM';" "'$M1_SLUG'")"
check "M1: avis one minute before free_public_until -> still 1 row" "1" \
  "$(m1_in_tx "update memorials set first_published_at = now() - interval '44 days', free_public_until = now() + interval '1 minute', free_private_until = now() + interval '30 days' where id = '$M1_MEM';" "'$M1_SLUG'")"
check "M1: complet, published -> 1 row (no public time limit here)" "1" \
  "$(m1_in_tx "update memorials set access_level = 'complet', free_public_until = null, free_private_until = null, free_corrections_until = null where id = '$M1_MEM';" "'$M1_SLUG'")"
check "M1: published but snapshot missing -> 0 rows" "0" \
  "$(m1_in_tx "delete from memorial_published_snapshots where memorial_id = '$M1_MEM';" "'$M1_SLUG'")"

# A draft / ready memorial carrying a slug (forced) is never public
IFS='|' read -r M1_D_OWNER M1_D <<<"$(l4_draft m1-draft)"
check "M1: draft with a (forced) slug -> 0 rows" "0" \
  "$(m1_in_tx "update memorials set slug = 'aaaaaaaaaaa1' where id = '$M1_D';" "'aaaaaaaaaaa1'")"
check "M1: ready with a (forced) slug -> 0 rows" "0" \
  "$(m1_in_tx "update memorials set slug = 'aaaaaaaaaaa2', status = 'ready' where id = '$M1_D';" "'aaaaaaaaaaa2'")"
check "M1: draft with a forced slug AND a stray snapshot row -> 0 rows (status rules)" "0" \
  "$(m1_in_tx "update memorials set slug = 'aaaaaaaaaaa3' where id = '$M1_D'; insert into memorial_published_snapshots (memorial_id, content) values ('$M1_D', '{}');" "'aaaaaaaaaaa3'")"

# --- M1-6. Media limited to what the snapshot references, of the right purpose, ready, of this memorial ---
IFS='|' read -r M1_O_OWNER M1_O <<<"$(l4_draft m1-other)"
M1_FOREIGN=$(l2_media "$M1_O" "$M1_O_OWNER" gallery ready)
m1_media_in_tx() {
  $DB -t -A -c "begin;" -c "set session_replication_role = replica;" -c "$1" -c "set session_replication_role = origin;" \
    -c "set role service_role; select coalesce(string_agg(e->>'media_id', ',' order by e->>'media_id'), '') from public.read_public_memorial_v1('$M1_SLUG') r, jsonb_array_elements(r.media) e where e->>'media_id' = '$2';" -c "rollback;" 2>&1 | tail -1
}
check "M1: a snapshot citing ANOTHER memorial's photo never returns it" "" \
  "$(m1_media_in_tx "update memorial_published_snapshots set content = jsonb_set(content, '{gallery,items}', content #> '{gallery,items}' || '[{\"mediaId\":\"$M1_FOREIGN\"}]') where memorial_id = '$M1_MEM';" "$M1_FOREIGN")"
check "M1: a hero-purpose photo cited in the gallery is not returned as gallery (purpose must match)" "1" \
  "$($DB -t -A -c "begin;" -c "set session_replication_role = replica;" -c "update memorial_published_snapshots set content = jsonb_set(content, '{gallery,items}', '[{\"mediaId\":\"$M1_HERO\"}]') where memorial_id = '$M1_MEM';" -c "set session_replication_role = origin;" -c "set role service_role; select count(*) from public.read_public_memorial_v1('$M1_SLUG') r, jsonb_array_elements(r.media) e;" -c "rollback;" 2>&1 | tail -1)"
check "M1: a referenced photo that is pending is not returned" "" \
  "$(m1_media_in_tx "update media set status = 'pending' where id = '$M1_G1';" "$M1_G1")"
check "M1: malformed gallery (not an array) -> only the Hero is returned, no error" "1" \
  "$($DB -t -A -c "begin;" -c "set session_replication_role = replica;" -c "update memorial_published_snapshots set content = jsonb_set(content, '{gallery,items}', '\"x\"') where memorial_id = '$M1_MEM';" -c "set session_replication_role = origin;" -c "set role service_role; select count(*) from public.read_public_memorial_v1('$M1_SLUG') r, jsonb_array_elements(r.media) e;" -c "rollback;" 2>&1 | tail -1)"
check "M1: a published memorial without media reference -> empty media array, not NULL" "[]" \
  "$($DB -t -A -c "begin;" -c "set session_replication_role = replica;" -c "update memorial_published_snapshots set content = '{\"hero\":{\"displayName\":\"M1\",\"photo\":null}}' where memorial_id = '$M1_MEM';" -c "set session_replication_role = origin;" -c "set role service_role; select media::text from public.read_public_memorial_v1('$M1_SLUG');" -c "rollback;" 2>&1 | tail -1)"

# --- M1-7. Read-only: calling the function writes nothing ---
M1_BEFORE=$($DB -t -A -c "select (select count(*) from memorials) || '|' || (select count(*) from memorial_published_snapshots) || '|' || (select count(*) from media) || '|' || (select count(*) from memorial_access_events) || '|' || (select coalesce(sum(revision),0) from memorial_drafts);")
svc "select count(*) from public.read_public_memorial_v1('$M1_SLUG');" >/dev/null
check "M1: the read writes nothing (same counts, same revisions)" "$M1_BEFORE" \
  "$($DB -t -A -c "select (select count(*) from memorials) || '|' || (select count(*) from memorial_published_snapshots) || '|' || (select count(*) from media) || '|' || (select count(*) from memorial_access_events) || '|' || (select coalesce(sum(revision),0) from memorial_drafts);")"

# --- M1-8. Pre/postflight and rollback (never applied automatically) ---
M1_POST=$($DB -t -A -c "begin;" -c "$M1_REAL" -f "$REPO_ROOT/supabase/verifications/qg016_m1_postflight.sql" -c "rollback;" 2>&1)
check "M1 postflight: zero ECHEC, every control OK (8)" "0|8" "$(echo "$M1_POST" | grep -c 'ECHEC' || true)|$(echo "$M1_POST" | grep -c '|OK$' || true)"
check "M1 postflight turns red on a client grant of the function" "1" \
  "$($DB -t -A -c "begin;" -c "$M1_REAL" -c "grant execute on function public.$M1_FN to anon;" -f "$REPO_ROOT/supabase/verifications/qg016_m1_postflight.sql" -c "rollback;" 2>/dev/null | grep -c "ECHEC" || true)"
check "M1 postflight turns red if the snapshot table is opened to anon" "1" \
  "$($DB -t -A -c "begin;" -c "$M1_REAL" -c "grant select on public.memorial_published_snapshots to anon;" -f "$REPO_ROOT/supabase/verifications/qg016_m1_postflight.sql" -c "rollback;" 2>/dev/null | grep -c "ECHEC" || true)"
M1_PRE=$($DB -t -A -c "begin;" -c "$M1_REAL" -f "$REPO_ROOT/supabase/verifications/qg016_m1_preflight.sql" -c "rollback;" 2>&1)
check "M1 preflight after application: refuses (already applied), the other controls OK" "1|5" \
  "$(echo "$M1_PRE" | grep -c 'ECHEC' || true)|$(echo "$M1_PRE" | grep -c '|OK$' || true)"
M1_DOWN="$REPO_ROOT/supabase/rollbacks/20261104090000_qg016_m1_read_public_memorial.down.sql"
$PSQL -d postgres -c "create database m1_down template $DB_NAME;" >/dev/null
$PSQL -d m1_down -c "$M1_REAL" >/dev/null  # throwaway copy: migrations-only privileges
check "M1 rollback applies, function gone, data untouched, the preflight is green again (6 OK)" "0|absent|$($DB -t -A -c "select (select count(*) from memorials where status='published') || '/' || (select count(*) from media);")|6" \
  "$($PSQL -d m1_down -f "$M1_DOWN" >/dev/null 2>&1; echo $?)|$($PSQL -d m1_down -t -A -c "select case when to_regprocedure('public.$M1_FN') is null then 'absent' else 'present' end;")|$($PSQL -d m1_down -t -A -c "select (select count(*) from memorials where status='published') || '/' || (select count(*) from media);")|$($PSQL -d m1_down -t -A -f "$REPO_ROOT/supabase/verifications/qg016_m1_preflight.sql" 2>&1 | grep -c '|OK$' || true)"
check "M1: ... then the migration re-applies and the postflight is green again (8 OK)" "0|0|8" \
  "$($PSQL -d m1_down -f "$MIGRATIONS_DIR/20261104090000_qg016_m1_read_public_memorial.sql" >/dev/null 2>&1; echo $?)|$($PSQL -d m1_down -t -A -f "$REPO_ROOT/supabase/verifications/qg016_m1_postflight.sql" 2>&1 | grep -c 'ECHEC' || true)|$($PSQL -d m1_down -t -A -f "$REPO_ROOT/supabase/verifications/qg016_m1_postflight.sql" 2>&1 | grep -c '|OK$' || true)"
$PSQL -d postgres -c "drop database m1_down;" >/dev/null

# =====================================================================
# QG 016 — Offrandes symboliques : ouverture automatique à la publication
# =====================================================================
echo ""
echo "== QG 016 Offrandes: eligibility opened at the first publication =="

OF_FN="public.open_symbolic_offerings_on_publication_v1()"
OF_TRG="memorial_published_snapshots_open_offerings"
of_elig() { $DB -t -A -c "select coalesce((select 'open' || case when closes_at is null then '' else '|closes' end from symbolic_offering_eligibility where memorial_id='$1'),'none');"; }
of_rec() { svc "select outcome from record_symbolic_offering_v1('$1','$2',gen_random_uuid());"; }
of_cnt() { $DB -t -A -c "select count(*) from symbolic_offerings where memorial_id='$1';"; }
of_upsert_snapshot() {
  # The exact shape of commit_memorial_publication_v2's snapshot write (republication): insert ... on conflict do update.
  $DB -c "insert into memorial_published_snapshots (memorial_id, content, published_at) values ('$1', '$2', now()) on conflict (memorial_id) do update set content = excluded.content, published_at = excluded.published_at;" >/dev/null
}

# --- O1. Trigger and function properties ---
check "QG 016: AFTER INSERT FOR EACH ROW trigger on memorial_published_snapshots, enabled" "1" \
  "$($DB -t -A -c "select count(*) from pg_trigger where tgname='$OF_TRG' and tgrelid='public.memorial_published_snapshots'::regclass and not tgisinternal and tgenabled='O' and (tgtype & 1)=1 and (tgtype & 4)=4 and (tgtype & 2)=0;")"
check "QG 016: trigger function is SECURITY DEFINER with an empty search_path" "true|true" \
  "$($DB -t -A -c "select prosecdef || '|' || (proconfig @> array['search_path=\"\"']) from pg_proc where oid=to_regprocedure('$OF_FN');")"
check "QG 016: no client role (nor service_role) can execute the trigger function" "false|false|false" \
  "$($DB -t -A -c "select has_function_privilege('anon','$OF_FN','EXECUTE') || '|' || has_function_privilege('authenticated','$OF_FN','EXECUTE') || '|' || has_function_privilege('service_role','$OF_FN','EXECUTE');")"
check "QG 016: record_symbolic_offering_v1 is untouched (still service_role only)" "false|false|true" \
  "$($DB -t -A -c "select has_function_privilege('anon','$SO_FN','EXECUTE') || '|' || has_function_privilege('authenticated','$SO_FN','EXECUTE') || '|' || has_function_privilege('service_role','$SO_FN','EXECUTE');")"

# --- O2. Free (avis) memorial: refused before publication, opened by the REAL v4 publication, three gestures ---
IFS='|' read -r OF_OWNER OF_MEM <<<"$(l4_draft of-avis)"
OF_HERO=$(l2_media "$OF_MEM" "$OF_OWNER" hero ready)
OF_CONTENT=$(l3_hero "$OF_HERO")
l3_set_draft "$OF_MEM" "$OF_CONTENT"
OF_SLUG=$(l4_expected "$OF_MEM")
check "QG 016 avis: a never-published draft has no eligibility" "none" "$(of_elig "$OF_MEM")"
check "QG 016 avis: the real v4 publication succeeds" "published|$OF_SLUG" "$(svc "$(l4_sql "$OF_MEM" "$OF_OWNER" null "$OF_CONTENT")")"
check "QG 016 avis: the publication opened the Offrandes (open-ended)" "open" "$(of_elig "$OF_MEM")"
check "QG 016 avis: bougie recorded" "recorded" "$(of_rec "$OF_SLUG" bougie)"
check "QG 016 avis: lys recorded" "recorded" "$(of_rec "$OF_SLUG" lys)"
check "QG 016 avis: coeur recorded" "recorded" "$(of_rec "$OF_SLUG" coeur)"
check "QG 016 avis: three gestures stored, counters 3|3 (ceilings untouched)" "3|3|3" \
  "$($DB -t -A -c "select (select count(*) from symbolic_offerings where memorial_id='$OF_MEM') || '|' || hour_count || '|' || day_count from symbolic_offering_rate_limits where memorial_id='$OF_MEM';")"
OF_KEY=$(svc "select gen_random_uuid();")
check "QG 016 avis: a gesture with a new key is recorded" "recorded" "$(svc "select outcome from record_symbolic_offering_v1('$OF_SLUG','lys','$OF_KEY');")"
check "QG 016 avis: the same key again is a duplicate, nothing stored twice" "duplicate|4" \
  "$(svc "select outcome from record_symbolic_offering_v1('$OF_SLUG','lys','$OF_KEY');")|$(of_cnt "$OF_MEM")"

# --- O3. Repeated publication: one row, opens_at unchanged ---
OF_OPENS=$($DB -t -A -c "select opens_at from symbolic_offering_eligibility where memorial_id='$OF_MEM';")
check "QG 016: a second v4 call is already_published (no new snapshot insert)" "already_published|$OF_SLUG" "$(svc "$(l4_sql "$OF_MEM" "$OF_OWNER" "'$OF_SLUG'" "$OF_CONTENT")")"
of_upsert_snapshot "$OF_MEM" "$OF_CONTENT"
check "QG 016: republication (v2 snapshot upsert) keeps ONE row with the same opens_at" "1|true" \
  "$($DB -t -A -c "select count(*) || '|' || bool_and(opens_at = '$OF_OPENS') from symbolic_offering_eligibility where memorial_id='$OF_MEM';")"

# --- O4. Administrative suspension: refused, never reopened by a republication ---
$DB -c "update symbolic_offering_eligibility set opens_at = now() - interval '2 days', closes_at = now() - interval '1 second' where memorial_id='$OF_MEM';" >/dev/null
OF_BEFORE=$(of_cnt "$OF_MEM")
check "QG 016 suspension: a suspended memorial refuses" "refused" "$(of_rec "$OF_SLUG" bougie)"
of_upsert_snapshot "$OF_MEM" "$OF_CONTENT"
check "QG 016 suspension: a republication does NOT reopen it" "open|closes|refused" "$(of_elig "$OF_MEM")|$(of_rec "$OF_SLUG" coeur)"
check "QG 016 suspension: every gesture received is kept" "$OF_BEFORE" "$(of_cnt "$OF_MEM")"

# --- O5. « Désactiver » kept in the published copy: open lock, but refused ---
IFS='|' read -r OF_H_OWNER OF_H_MEM <<<"$(l4_draft of-hidden)"
OF_H_HERO=$(l2_media "$OF_H_MEM" "$OF_H_OWNER" hero ready)
OF_H_CONTENT="{\"hero\":{\"displayName\":\"Lot 3\",\"photo\":{\"mediaId\":\"$OF_H_HERO\",\"crop\":{\"zoom\":1,\"focalX\":0.5,\"focalY\":0.5}}},\"presentation\":{\"hiddenSections\":[\"symbolicOfferings\"]}}"
l3_set_draft "$OF_H_MEM" "$OF_H_CONTENT"
OF_H_SLUG=$(l4_expected "$OF_H_MEM")
check "QG 016 disabled: published by v4 with the family's choice" "published|$OF_H_SLUG" "$(svc "$(l4_sql "$OF_H_MEM" "$OF_H_OWNER" null "$OF_H_CONTENT")")"
check "QG 016 disabled: the lock is open but the published choice refuses, nothing stored, no counter" "open|refused|0|0" \
  "$(of_elig "$OF_H_MEM")|$(of_rec "$OF_H_SLUG" bougie)|$(of_cnt "$OF_H_MEM")|$($DB -t -A -c "select count(*) from symbolic_offering_rate_limits where memorial_id='$OF_H_MEM';")"
of_upsert_snapshot "$OF_H_MEM" "$(l3_hero "$OF_H_HERO")"
check "QG 016 disabled: re-enabled by a republication, gestures are accepted (no reopening needed)" "recorded" "$(of_rec "$OF_H_SLUG" lys)"

# --- O6. Expired free notice (45 days): refused although the lock is open (rolled back) ---
check "QG 016 expired avis: past free_public_until -> refused" "refused" \
  "$($DB -t -A -c "begin;" -c "set session_replication_role = replica;" -c "update memorials set first_published_at = now() - interval '50 days', free_public_until = now() - interval '5 days', free_private_until = now() + interval '25 days' where id = '$OF_H_MEM';" -c "set session_replication_role = origin;" -c "set role service_role; select outcome from record_symbolic_offering_v1('$OF_H_SLUG','bougie',gen_random_uuid());" -c "rollback;" 2>&1 | tail -1)"
check "QG 016 expired avis: one minute before the end -> still recorded (rolled back)" "recorded" \
  "$($DB -t -A -c "begin;" -c "set session_replication_role = replica;" -c "update memorials set first_published_at = now() - interval '44 days', free_public_until = now() + interval '1 minute', free_private_until = now() + interval '30 days' where id = '$OF_H_MEM';" -c "set session_replication_role = origin;" -c "set role service_role; select outcome from record_symbolic_offering_v1('$OF_H_SLUG','bougie',gen_random_uuid());" -c "rollback;" 2>&1 | tail -1)"

# --- O7. Complete memorial: opened on its first snapshot, recorded ---
OF_C_MEM=$(so_memorial offrandes-qg016-complet published "")
check "QG 016 complet: no eligibility before its first snapshot" "none" "$(of_elig "$OF_C_MEM")"
$DB -c "insert into memorial_published_snapshots (memorial_id, content) values ('$OF_C_MEM', '$SNAP');" >/dev/null
check "QG 016 complet: the first snapshot opened the Offrandes, a gesture is recorded" "open|recorded" "$(of_elig "$OF_C_MEM")|$(of_rec offrandes-qg016-complet coeur)"

# --- O8. Transactional: a publication that rolls back opens nothing ---
OF_T_MEM=$(so_memorial offrandes-qg016-rollback published "")
$DB -c "begin;" -c "insert into memorial_published_snapshots (memorial_id, content) values ('$OF_T_MEM', '$SNAP');" -c "rollback;" >/dev/null
check "QG 016: a rolled-back snapshot insert leaves no eligibility (same transaction)" "none" "$(of_elig "$OF_T_MEM")"

# --- O9. Catch-up: only memorials eligible when the migration runs ---
$DB -c "alter table memorial_published_snapshots disable trigger $OF_TRG;" >/dev/null
IFS='|' read -r OF_B_OWNER OF_B_VIS <<<"$(l4_draft of-backfill-visible)"
OF_B_HERO=$(l2_media "$OF_B_VIS" "$OF_B_OWNER" hero ready); l3_set_draft "$OF_B_VIS" "$(l3_hero "$OF_B_HERO")"
svc "$(l4_sql "$OF_B_VIS" "$OF_B_OWNER" null "$(l3_hero "$OF_B_HERO")")" >/dev/null
IFS='|' read -r OF_B_OWNER2 OF_B_EXP <<<"$(l4_draft of-backfill-expired)"
OF_B_HERO2=$(l2_media "$OF_B_EXP" "$OF_B_OWNER2" hero ready); l3_set_draft "$OF_B_EXP" "$(l3_hero "$OF_B_HERO2")"
svc "$(l4_sql "$OF_B_EXP" "$OF_B_OWNER2" null "$(l3_hero "$OF_B_HERO2")")" >/dev/null
$DB -c "set session_replication_role = replica;" -c "update memorials set first_published_at = now() - interval '50 days', free_public_until = now() - interval '5 days', free_private_until = now() + interval '25 days' where id = '$OF_B_EXP';" >/dev/null
OF_B_SKIN_ENT=$($DB -t -A -c "insert into entitlements (access_level, source, offer_id) values ('complet', 'direct','juif') returning id;")
OF_B_SKIN=$($DB -t -A -c "insert into memorials (owner_id, entitlement_id, memorial_type, editorial_context, skin_id, skin_variant, language, slug, status, first_published_at) values ('$SO_OWNER','$OF_B_SKIN_ENT','person','announcement','juif','light','fr','offrandes-qg016-juif','published',now()) returning id;")
$DB -c "insert into memorial_published_snapshots (memorial_id, content) values ('$OF_B_SKIN', '$SNAP');" >/dev/null
OF_B_DRAFT=$(so_memorial offrandes-qg016-brouillon draft "")
OF_B_SUSP=$(so_memorial offrandes-qg016-suspendu published "$SNAP")
$DB -c "insert into symbolic_offering_eligibility (memorial_id, opens_at, closes_at) values ('$OF_B_SUSP', now() - interval '2 days', now() - interval '1 hour');" >/dev/null
$DB -c "alter table memorial_published_snapshots enable trigger $OF_TRG;" >/dev/null
check "QG 016 catch-up setup: none of the five is open yet" "none|none|none|none|open|closes" \
  "$(of_elig "$OF_B_VIS")|$(of_elig "$OF_B_EXP")|$(of_elig "$OF_B_SKIN")|$(of_elig "$OF_B_DRAFT")|$(of_elig "$OF_B_SUSP")"
check "QG 016: the migration re-applies cleanly (idempotent)" "0" "$($DB -f "$MIGRATIONS_DIR/20261105090000_qg016_offerings_open_at_publication.sql" >/dev/null 2>&1; echo $?)"
check "QG 016 catch-up: published+visible opened; expired avis, other skin and draft NOT opened; suspension NOT reopened" "open|none|none|none|open|closes" \
  "$(of_elig "$OF_B_VIS")|$(of_elig "$OF_B_EXP")|$(of_elig "$OF_B_SKIN")|$(of_elig "$OF_B_DRAFT")|$(of_elig "$OF_B_SUSP")"
check "QG 016: one trigger only after re-application" "1" "$($DB -t -A -c "select count(*) from pg_trigger where tgname='$OF_TRG';")"

# --- O10. Client roles still cannot open or close anything ---
expect_error "QG 016: service_role cannot write the lock directly" "set role service_role; update symbolic_offering_eligibility set closes_at = null where memorial_id='$OF_MEM';"
expect_error "QG 016: an owner cannot write the lock" "set role authenticated; set local request.jwt.claim.sub = '$SO_AUTH'; insert into symbolic_offering_eligibility (memorial_id) values ('$OF_B_DRAFT');"

# --- O11. Pre/postflight and rollback (never applied automatically) ---
# Bench artefact only: C1 opened a memorial that has NO snapshot by hand (to prove the refusal); no code
# path can produce that row, and the postflight rightly flags it — removed before grading the state.
$DB -c "delete from symbolic_offering_eligibility e where not exists (select 1 from memorial_published_snapshots s where s.memorial_id = e.memorial_id);" >/dev/null
OF_POST=$($DB -t -A -f "$REPO_ROOT/supabase/verifications/qg016_offrandes_postflight.sql" 2>&1)
check "QG 016 postflight: zero ECHEC, every control OK (8)" "0|8" "$(echo "$OF_POST" | grep -c 'ECHEC' || true)|$(echo "$OF_POST" | grep -c '|OK$' || true)"
check "QG 016 postflight turns red if the trigger is disabled" "1" \
  "$($DB -t -A -c "begin;" -c "alter table memorial_published_snapshots disable trigger $OF_TRG;" -f "$REPO_ROOT/supabase/verifications/qg016_offrandes_postflight.sql" -c "rollback;" 2>/dev/null | grep -c 'ECHEC' || true)"
OF_PRE=$($DB -t -A -f "$REPO_ROOT/supabase/verifications/qg016_offrandes_preflight.sql" 2>&1)
check "QG 016 preflight after application: refuses (already applied, lock not empty), the other controls OK" "2|6" \
  "$(echo "$OF_PRE" | grep -c 'ECHEC' || true)|$(echo "$OF_PRE" | grep -c '|OK$' || true)"
OF_DOWN="$REPO_ROOT/supabase/rollbacks/20261105090000_qg016_offerings_open_at_publication.down.sql"
$PSQL -d postgres -c "create database of_down template $DB_NAME;" >/dev/null
OF_KEEP="$($PSQL -d of_down -t -A -c "select (select count(*) from symbolic_offerings) || '/' || (select count(*) from symbolic_offering_eligibility where closes_at is not null);")"
check "QG 016 rollback: trigger and function gone, open-ended openings removed, suspensions and every gesture kept" "0|absent|absent|0|$OF_KEEP" \
  "$($PSQL -d of_down -f "$OF_DOWN" >/dev/null 2>&1; echo $?)|$($PSQL -d of_down -t -A -c "select case when exists (select 1 from pg_trigger where tgname='$OF_TRG') then 'present' else 'absent' end;")|$($PSQL -d of_down -t -A -c "select case when to_regprocedure('$OF_FN') is null then 'absent' else 'present' end;")|$($PSQL -d of_down -t -A -c "select count(*) from symbolic_offering_eligibility where closes_at is null;")|$($PSQL -d of_down -t -A -c "select (select count(*) from symbolic_offerings) || '/' || (select count(*) from symbolic_offering_eligibility where closes_at is not null);")"
check "QG 016: ... then the migration re-applies and the postflight is green again (8 OK)" "0|0|8" \
  "$($PSQL -d of_down -f "$MIGRATIONS_DIR/20261105090000_qg016_offerings_open_at_publication.sql" >/dev/null 2>&1; echo $?)|$($PSQL -d of_down -t -A -f "$REPO_ROOT/supabase/verifications/qg016_offrandes_postflight.sql" 2>&1 | grep -c 'ECHEC' || true)|$($PSQL -d of_down -t -A -f "$REPO_ROOT/supabase/verifications/qg016_offrandes_postflight.sql" 2>&1 | grep -c '|OK$' || true)"
$PSQL -d postgres -c "drop database of_down;" >/dev/null

echo ""
echo "== C3: public ACL hardening (20261111100000, applied on Supabase B) =="

# supabase/verifications/c3_security_postflight.sql is a photograph of
# Supabase B: on top of the posture controls it pins B's exact catalog and
# row counts (22 tables, 82 rows...), which a throwaway bench seeded with
# fixtures can never match. The bench therefore re-asserts each POSTURE
# control of that postflight, one by one and without loosening any, and
# leaves the B-specific counts to the postflight itself. It also proves the
# privileges the existing parcours need are still in place after C3.

# --- C1. The event trigger that closes every new public function -------
check "C3: event trigger present, enabled, hardened, on ddl_command_end for CREATE FUNCTION" "1" \
  "$($DB -t -A -c "select count(*) from pg_event_trigger e join pg_proc p on p.oid = e.evtfoid join pg_namespace n on n.oid = p.pronamespace where e.evtname = 'heritage_c3_close_public_function_acl' and e.evtevent = 'ddl_command_end' and e.evtenabled = 'O' and e.evttags @> array['CREATE FUNCTION']::text[] and n.nspname = 'heritage_c3' and p.proname = 'close_public_postgres_function_acl' and p.prosecdef and p.proconfig @> array['search_path=pg_catalog']::text[] and pg_get_functiondef(p.oid) like '%n.nspname = ''public''%' and pg_get_functiondef(p.oid) like '%p.proowner = ''postgres''::regrole%';")"
for role in anon authenticated service_role; do
  check "C3: $role has no USAGE on the private schema heritage_c3" "f" \
    "$($DB -t -A -c "select has_schema_privilege('$role', 'heritage_c3', 'USAGE');")"
done

# --- C2. A function created in public starts CLOSED (rolled back) -------
# acl_set guards against a NULL proacl, which means "PUBLIC may execute".
C3_PROBE=$($DB -t -A \
  -c "begin;" \
  -c "create function public.c3_bench_probe() returns integer language sql as 'select 1';" \
  -c "select (p.proacl is not null) || '|' || has_function_privilege('anon', p.oid, 'EXECUTE') || '|' || has_function_privilege('authenticated', p.oid, 'EXECUTE') || '|' || has_function_privilege('service_role', p.oid, 'EXECUTE') || '|' || exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0) from pg_proc p where p.oid = 'public.c3_bench_probe()'::regprocedure;" \
  -c "rollback;")
check "C3: a new public function grants EXECUTE to nobody (acl_set|anon|authenticated|service_role|PUBLIC)" "true|false|false|false|false" "$C3_PROBE"

# The rule every migration written after C3 must follow: CREATE OR REPLACE
# re-closes an EXISTING grant, so the grant must be re-issued after it.
C3_REPLACE=$($DB -t -A \
  -c "begin;" \
  -c "create function public.c3_bench_probe() returns integer language sql as 'select 1';" \
  -c "grant execute on function public.c3_bench_probe() to service_role;" \
  -c "select has_function_privilege('service_role', 'public.c3_bench_probe()', 'EXECUTE');" \
  -c "create or replace function public.c3_bench_probe() returns integer language sql as 'select 2';" \
  -c "select has_function_privilege('service_role', 'public.c3_bench_probe()', 'EXECUTE');" \
  -c "grant execute on function public.c3_bench_probe() to service_role;" \
  -c "select has_function_privilege('service_role', 'public.c3_bench_probe()', 'EXECUTE');" \
  -c "rollback;" | tr '\n' '|')
check "C3: CREATE OR REPLACE re-closes an existing grant; only an explicit re-grant restores it" "t|f|t|" "$C3_REPLACE"

# --- C3. New tables and sequences start closed (default privileges) -----
# The stand-ins above reproduce the platform defaults (REFERENCES, TRIGGER,
# TRUNCATE to every client role); C3 must have removed them for postgres.
check "C3: no default ACL left for postgres-owned public tables/sequences" "0" \
  "$($DB -t -A -c "select count(*) from pg_default_acl d join pg_roles o on o.oid = d.defaclrole join pg_namespace n on n.oid = d.defaclnamespace cross join lateral aclexplode(d.defaclacl) x left join pg_roles g on g.oid = x.grantee where o.rolname = 'postgres' and n.nspname = 'public' and d.defaclobjtype in ('r', 'S') and (x.grantee = 0 or g.rolname in ('anon', 'authenticated', 'service_role'));")"
C3_TABLE=$($DB -t -A \
  -c "begin;" \
  -c "create table public.c3_bench_table (id bigint generated always as identity primary key);" \
  -c "select string_agg(r || ':' || (has_table_privilege(r, 'public.c3_bench_table', 'SELECT') or has_table_privilege(r, 'public.c3_bench_table', 'INSERT') or has_table_privilege(r, 'public.c3_bench_table', 'UPDATE') or has_table_privilege(r, 'public.c3_bench_table', 'DELETE') or has_table_privilege(r, 'public.c3_bench_table', 'TRUNCATE') or has_table_privilege(r, 'public.c3_bench_table', 'REFERENCES') or has_table_privilege(r, 'public.c3_bench_table', 'TRIGGER') or has_sequence_privilege(r, pg_get_serial_sequence('public.c3_bench_table', 'id'), 'USAGE')), ',' order by r) from unnest(array['anon', 'authenticated', 'service_role']) r;" \
  -c "rollback;")
check "C3: a new public table and its sequence grant nothing to any client role" "anon:false,authenticated:false,service_role:false" "$C3_TABLE"

# --- C4. The ten targeted ACLs (same matrix as the postflight) ----------
c3_acl() {
  local sig="$1"; local expected="$2"
  check "C3: EXECUTE on $sig (anon|authenticated|service_role)" "$expected" \
    "$($DB -t -A -c "select has_function_privilege('anon', p.oid, 'EXECUTE') || '|' || has_function_privilege('authenticated', p.oid, 'EXECUTE') || '|' || has_function_privilege('service_role', p.oid, 'EXECUTE') from pg_proc p where p.oid = to_regprocedure('$sig');")"
}
c3_acl 'public.create_memorial_draft()' 'false|false|false'
c3_acl 'public.current_owner_id()' 'false|true|false'
c3_acl 'public.guard_publishing_pending_hero_cleanup_v1()' 'false|false|false'
c3_acl 'public.guard_retiring_media_references_v1()' 'false|false|false'
c3_acl 'public.memorial_content_references_media_v1(jsonb,uuid)' 'false|false|false'
c3_acl 'public.public_memorial_message_allowed_v1(uuid,text)' 'true|true|false'
c3_acl 'public.public_memorial_publication_state(uuid)' 'true|true|false'
c3_acl 'public.redeem_entitlement(uuid,uuid,text,text,text)' 'false|false|true'
c3_acl 'public.redeem_entitlement_with_activation_key(uuid,text,uuid,text,text,text)' 'false|false|true'
c3_acl 'public.set_updated_at()' 'false|false|false'

# --- C5. Complete client allowlist: nothing else in public is callable --
check "C3: anon/authenticated may execute ONLY the three allowlisted public functions" "" \
  "$($DB -t -A -c "select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE')) and p.oid not in ('public.current_owner_id()'::regprocedure, 'public.public_memorial_message_allowed_v1(uuid,text)'::regprocedure, 'public.public_memorial_publication_state(uuid)'::regprocedure);")"

# --- C6. The public state helper discloses nothing about a non-public memorial
check "C3: public_memorial_publication_state is SECURITY DEFINER, search_path=\"\", published+visible only" "1" \
  "$($DB -t -A -c "select count(*) from pg_proc p where p.oid = 'public.public_memorial_publication_state(uuid)'::regprocedure and p.prosecdef and p.proconfig @> array['search_path=\"\"']::text[] and pg_get_functiondef(p.oid) like '%m.status = ''published''%' and pg_get_functiondef(p.oid) like '%public.memorial_publicly_visible_v1%';")"
# Graded AS anon, over every memorial the earlier sections left behind. The
# expectation is computed as superuser (anon cannot read memorials); the
# three populations must all be present or the check proves nothing.
C3_POP=$($DB -t -A -c "select count(*) filter (where status = 'published' and memorial_publicly_visible_v1(id, now())) || '|' || count(*) filter (where status = 'published' and not memorial_publicly_visible_v1(id, now())) || '|' || count(*) filter (where status <> 'published') from memorials;")
IFS='|' read -r C3_POP_VISIBLE C3_POP_HIDDEN C3_POP_NONPUB <<<"$C3_POP"
check "C3: bench holds published-visible, published-hidden and non-published memorials" "true|true|true" \
  "$([ "${C3_POP_VISIBLE:-0}" -gt 0 ] && echo true || echo false)|$([ "${C3_POP_HIDDEN:-0}" -gt 0 ] && echo true || echo false)|$([ "${C3_POP_NONPUB:-0}" -gt 0 ] && echo true || echo false)"
C3_VALUES=$($DB -t -A -c "select string_agg(format('(%L::uuid, %s)', id, (status = 'published' and memorial_publicly_visible_v1(id, now()))::int), ',') from memorials;")
check "C3: as anon, one row for each published+visible memorial, ZERO for every other one" "0" \
  "$($DB -t -A -c "set role anon; select count(*) from (values $C3_VALUES) v(id, expected) where (select count(*) from public.public_memorial_publication_state(v.id)) <> v.expected;")"
check "C3: as anon, an unknown memorial id returns zero rows" "0" \
  "$($DB -t -A -c "set role anon; select count(*) from public.public_memorial_publication_state(gen_random_uuid());")"

# --- C7. The parcours still holds the privileges it calls --------------
# Every RPC the application calls (grep '.rpc("' in app/ lib/ components/),
# all through the server-side service_role client. Each must stay callable
# by service_role and by no client role.
for fn in \
  admin_mutate_activation_key admin_revoke_entitlement \
  anchor_free_memorial_v1 create_free_memorial_v1 upgrade_memorial_access_v1 \
  redeem_entitlement redeem_entitlement_with_activation_key record_heritage_activation_attempt \
  commit_memorial_draft_edit_v1 commit_memorial_configuration_edit_v1 \
  reserve_memorial_media_upload_v1 finalize_memorial_media_upload_v1 \
  reserve_pending_media_cleanup_v1 finish_pending_media_cleanup_v1 \
  begin_guest_draft_transfer_v1 find_guest_draft_transfer_v1 \
  record_guest_draft_transfer_media_v1 complete_guest_draft_transfer_v1 \
  commit_memorial_publication_v2 commit_memorial_publication_v4 \
  read_public_memorial_v1 record_symbolic_offering_v1; do
  check "C3 parcours: $fn callable by service_role only (anon|authenticated|service_role)" "false|false|true" \
    "$($DB -t -A -c "select string_agg(has_function_privilege('anon', p.oid, 'EXECUTE') || '|' || has_function_privilege('authenticated', p.oid, 'EXECUTE') || '|' || has_function_privilege('service_role', p.oid, 'EXECUTE'), ' / ') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = '$fn';")"
done
# The internal helpers those RPCs reach run as their SECURITY DEFINER owner:
# prove the two public paths end to end as service_role after C3.
C3_SLUG=$($DB -t -A -c "select m.slug from memorials m where m.status = 'published' and m.slug is not null and memorial_publicly_visible_v1(m.id, now()) and exists (select 1 from memorial_published_snapshots s where s.memorial_id = m.id) limit 1;")
check "C3 parcours: the bench holds a published, visible memorial with a slug" "true" "$([ -n "$C3_SLUG" ] && echo true || echo false)"
check "C3 parcours: read_public_memorial_v1 returns it to service_role" "1" \
  "$(svc "select count(*) from public.read_public_memorial_v1('$C3_SLUG');")"
expect_error "C3 parcours: read_public_memorial_v1 stays refused to anon" \
  "set role anon; select * from public.read_public_memorial_v1('$C3_SLUG');"

# ----------------------------------------------------------------------
echo "== QG 004-B: HERITAGE e-mail proof, required by the database =="
# ----------------------------------------------------------------------
# Refusal with the expected SQLSTATE message, never just "some error".
expect_refused() {
  local desc="$1"; local sql="$2"; local needle="$3"
  local out
  if out=$($DB -t -A -c "$sql" 2>&1); then
    echo "  [FAIL] $desc (expected a refusal, statement succeeded: $out)"
    FAIL=$((FAIL + 1))
  elif printf '%s' "$out" | grep -q "$needle"; then
    echo "  [PASS] $desc"
    PASS=$((PASS + 1))
  else
    echo "  [FAIL] $desc (refused for another reason: $out)"
    FAIL=$((FAIL + 1))
  fi
}

check "QG 004-B: owner_email_verifications has RLS on" "t" \
  "$($DB -t -A -c "select relrowsecurity from pg_class where oid = 'public.owner_email_verifications'::regclass;")"
check "QG 004-B: no role holds any privilege on owner_email_verifications (anon|authenticated|service_role)" "false|false|false" \
  "$($DB -t -A -c "select has_table_privilege('anon','public.owner_email_verifications','SELECT,INSERT,UPDATE,DELETE') || '|' || has_table_privilege('authenticated','public.owner_email_verifications','SELECT,INSERT,UPDATE,DELETE') || '|' || has_table_privilege('service_role','public.owner_email_verifications','SELECT,INSERT,UPDATE,DELETE');")"
for fn in owner_email_verified_v1 record_owner_email_verification_v1 apply_owner_email_change_v1 owner_email_change_allowed_v1; do
  check "QG 004-B: $fn callable by service_role only (anon|authenticated|service_role)" "false|false|true" \
    "$($DB -t -A -c "select string_agg(has_function_privilege('anon', p.oid, 'EXECUTE') || '|' || has_function_privilege('authenticated', p.oid, 'EXECUTE') || '|' || has_function_privilege('service_role', p.oid, 'EXECUTE'), ' / ') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = '$fn';")"
  check "QG 004-B: $fn is SECURITY DEFINER with an empty search_path" "t|{search_path=\"\"}" \
    "$($DB -t -A -c "select p.prosecdef || '|' || coalesce(p.proconfig::text, '') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = '$fn';")"
done
check "QG 004-B: the guard trigger function is executable by no application role" "false|false|false" \
  "$($DB -t -A -c "select has_function_privilege('anon', 'public.require_owner_email_verified_v1()', 'EXECUTE') || '|' || has_function_privilege('authenticated', 'public.require_owner_email_verified_v1()', 'EXECUTE') || '|' || has_function_privilege('service_role', 'public.require_owner_email_verified_v1()', 'EXECUTE');")"
expect_error "QG 004-B: authenticated cannot write a proof directly" \
  "set role authenticated; insert into public.owner_email_verifications (owner_id, auth_user_id, email_normalized, method) select id, auth_user_id, lower(email), 'email_otp' from public.owners limit 1;"
expect_error "QG 004-B: service_role cannot write a proof directly either (RPC only)" \
  "set role service_role; insert into public.owner_email_verifications (owner_id, auth_user_id, email_normalized, method) select id, auth_user_id, lower(email), 'email_otp' from public.owners limit 1;"

# A published memorial and its (fixture-verified) owner.
Q4_PUB=$($DB -t -A -c "select m.id || '|' || m.owner_id from memorials m join memorial_published_snapshots s on s.memorial_id = m.id join owners o on o.id = m.owner_id where o.auth_user_id is not null limit 1;")
IFS='|' read -r Q4_PUB_MEM Q4_PUB_OWNER <<<"$Q4_PUB"
check "QG 004-B: the bench holds a published memorial of a linked owner" "true" "$([ -n "$Q4_PUB_MEM" ] && echo true || echo false)"
check "QG 004-B: a verified owner may republish (snapshot write accepted)" "UPDATE 1" \
  "$($DB -c "begin;" -c "update memorial_published_snapshots set content = content where memorial_id = '$Q4_PUB_MEM';" -c "rollback;" 2>&1 | grep -o 'UPDATE 1' | head -1)"
expect_refused "QG 004-B: without a proof, publication is refused by the database (HV403)" \
  "begin; delete from owner_email_verifications where owner_id = '$Q4_PUB_OWNER'; update memorial_published_snapshots set content = content where memorial_id = '$Q4_PUB_MEM'; rollback;" \
  "owner email address not verified"
expect_refused "QG 004-B: a proof for a previous address no longer counts (address changed)" \
  "begin; alter table owners disable trigger user; update owners set email = 'qg004b-moved-' || email where id = '$Q4_PUB_OWNER'; alter table owners enable trigger user; update memorial_published_snapshots set content = content where memorial_id = '$Q4_PUB_MEM'; rollback;" \
  "owner email address not verified"
expect_refused "QG 004-B: a proof bound to another Auth account does not count" \
  "begin; update owner_email_verifications set auth_user_id = gen_random_uuid() where owner_id = '$Q4_PUB_OWNER'; update memorial_published_snapshots set content = content where memorial_id = '$Q4_PUB_MEM'; rollback;" \
  "owner email address not verified"
check "QG 004-B: email_confirmed_at plays no part — owner_email_verified_v1 reads only HERITAGE's proof" "0" \
  "$($DB -t -A -c "select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('owner_email_verified_v1','require_owner_email_verified_v1','record_owner_email_verification_v1') and p.prosrc ilike '%email_confirmed_at%';")"

# record_owner_email_verification_v1: by Auth account only, current address only.
Q4_AUTH=$($DB -t -A -c "select gen_random_uuid();")
Q4_OWNER=$($DB -t -A -c "insert into owners (auth_user_id, email) values ('$Q4_AUTH', 'qg004b-owner@example.test') returning id;")
$DB -c "delete from owner_email_verifications where owner_id = '$Q4_OWNER';" >/dev/null
check "QG 004-B: a new unverified owner is not verified" "f" "$(svc "select public.owner_email_verified_v1('$Q4_OWNER');")"
check "QG 004-B: an unknown Auth account records nothing (no_owner)" "no_owner" \
  "$(svc "select outcome from public.record_owner_email_verification_v1(gen_random_uuid(), 'qg004b-owner@example.test', 'email_otp');")"
check "QG 004-B: a code checked for ANOTHER address records nothing (email_mismatch)" "email_mismatch" \
  "$(svc "select outcome from public.record_owner_email_verification_v1('$Q4_AUTH', 'someone-else@example.test', 'email_otp');")"
check "QG 004-B: email_change is not accepted as a plain verification method" "true" \
  "$($DB -t -A -c "set role service_role; select * from public.record_owner_email_verification_v1('$Q4_AUTH', 'qg004b-owner@example.test', 'email_change');" >/dev/null 2>&1 && echo false || echo true)"
check "QG 004-B: the right account and current address record the proof (case-insensitive)" "recorded" \
  "$(svc "select outcome from public.record_owner_email_verification_v1('$Q4_AUTH', ' QG004B-Owner@Example.test ', 'email_otp');")"
check "QG 004-B: the owner is now verified" "t" "$(svc "select public.owner_email_verified_v1('$Q4_OWNER');")"
check "QG 004-B: recording again keeps a single proof" "1" \
  "$(svc "select outcome from public.record_owner_email_verification_v1('$Q4_AUTH', 'qg004b-owner@example.test', 'password_recovery');" >/dev/null; $DB -t -A -c "select count(*) from owner_email_verifications where owner_id = '$Q4_OWNER';")"

# Address change: only without free history; never onto a taken address.
check "QG 004-B: an owner without free history may change address" "t" "$(svc "select public.owner_email_change_allowed_v1('$Q4_AUTH');")"
check "QG 004-B: a taken address is refused (email_taken)" "email_taken" \
  "$(svc "select outcome from public.apply_owner_email_change_v1('$Q4_AUTH', (select email from owners where id = '$Q4_PUB_OWNER'));")"
check "QG 004-B: the address change moves owners.email and the proof together" "changed|qg004b-new@example.test|t" \
  "$(svc "select outcome from public.apply_owner_email_change_v1('$Q4_AUTH', 'QG004B-New@example.test');")|$($DB -t -A -c "select email from owners where id = '$Q4_OWNER';")|$(svc "select public.owner_email_verified_v1('$Q4_OWNER');")"
Q4_HIST_AUTH=$($DB -t -A -c "select o.auth_user_id from owners o where o.auth_user_id is not null and exists (select 1 from memorial_access_events ev where ev.owner_id = o.id) limit 1;")
check "QG 004-B: the bench holds a linked owner with free history" "true" "$([ -n "$Q4_HIST_AUTH" ] && echo true || echo false)"
check "QG 004-B: with free history, the address stays locked (allowed=false, HD423 kept → email_locked)" "f|email_locked" \
  "$(svc "select public.owner_email_change_allowed_v1('$Q4_HIST_AUTH');")|$(svc "select outcome from public.apply_owner_email_change_v1('$Q4_HIST_AUTH', 'qg004b-locked@example.test');")"

# Commercial rights.
Q4_AVIS=$($DB -t -A -c "select m.id || '|' || m.owner_id from memorials m join owners o on o.id = m.owner_id where m.access_level = 'avis' and o.auth_user_id is not null limit 1;")
IFS='|' read -r Q4_AVIS_MEM Q4_AVIS_OWNER <<<"$Q4_AVIS"
check "QG 004-B: the bench holds a free memorial of a linked owner" "true" "$([ -n "$Q4_AVIS_MEM" ] && echo true || echo false)"
expect_refused "QG 004-B: without a proof, the « complet » upgrade is refused (HV403)" \
  "begin; delete from owner_email_verifications where owner_id = '$Q4_AVIS_OWNER'; update memorials set access_level = 'complet' where id = '$Q4_AVIS_MEM'; rollback;" \
  "owner email address not verified"
expect_refused "QG 004-B: without a proof, an Etsy right cannot be linked to the owner (HV403)" \
  "begin; delete from owner_email_verifications where owner_id = '$Q4_OWNER'; insert into entitlements (access_level, source, offer_id, external_order_id) values ('complet', 'etsy', 'intemporel', 'qg004b-etsy'); update entitlements set owner_id = '$Q4_OWNER' where external_order_id = 'qg004b-etsy'; rollback;" \
  "owner email address not verified"
check "QG 004-B: a direct « avis » right still links without a proof (free save stays immediate)" "UPDATE 1" \
  "$($DB -c "begin;" -c "delete from owner_email_verifications where owner_id = '$Q4_OWNER';" -c "insert into entitlements (access_level, source, offer_id, external_order_id) values ('avis', 'direct', 'intemporel', 'qg004b-direct');" -c "update entitlements set owner_id = '$Q4_OWNER' where external_order_id = 'qg004b-direct';" -c "rollback;" 2>&1 | grep -o 'UPDATE 1' | head -1)"

echo "== Results: $PASS passed, $FAIL failed =="
if [ "$FAIL" -ne 0 ]; then
  exit 1
fi
