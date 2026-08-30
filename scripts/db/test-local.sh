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

grant usage on schema public to anon, authenticated;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated;
SQL

echo "== Applying migrations =="
for f in "$MIGRATIONS_DIR"/*.sql; do
  echo "  -> $(basename "$f")"
  $DB -f "$f"
done

# Supabase's default public-schema grants apply to tables that already
# existed too (ALTER DEFAULT PRIVILEGES above only covers tables created
# AFTER it ran, which is every migration table here — but grant
# explicitly as well so this script keeps working if migrations are
# reordered).
$DB -c "grant select, insert, update, delete on all tables in schema public to anon, authenticated;" >/dev/null

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

echo "== Seeding local-only test fixtures (not real data, never used by the app) =="
OWNER_A=$($DB -t -A -c "insert into owners (auth_user_id, email) values (gen_random_uuid(), 'owner-a@example.test') returning id;")
OWNER_B=$($DB -t -A -c "insert into owners (auth_user_id, email) values (gen_random_uuid(), 'owner-b@example.test') returning id;")
AUTH_UID_A=$($DB -t -A -c "select auth_user_id from owners where id = '$OWNER_A';")
AUTH_UID_B=$($DB -t -A -c "select auth_user_id from owners where id = '$OWNER_B';")

ENT_A=$($DB -t -A -c "insert into entitlements (source, skin_id) values ('etsy', 'intemporel') returning id;")
ENT_B=$($DB -t -A -c "insert into entitlements (source, skin_id) values ('etsy', 'intemporel') returning id;")

MEM_A=$($DB -t -A -c "insert into memorials (owner_id, entitlement_id, memorial_type, editorial_context, skin_id, language, slug, status) values ('$OWNER_A', '$ENT_A', 'person', 'announcement', 'intemporel', 'en', 'test-memorial-a-1x2y3z', 'published') returning id;")
MEM_B=$($DB -t -A -c "insert into memorials (owner_id, entitlement_id, memorial_type, editorial_context, skin_id, language, slug, status) values ('$OWNER_B', '$ENT_B', 'person', 'remembrance', 'intemporel', 'en', 'test-memorial-b-4a5b6c', 'draft') returning id;")

$DB -c "insert into memorial_published_snapshots (memorial_id, content) values ('$MEM_A', '{\"hero\": {\"name\": \"Test\"}}');" >/dev/null

# Simulate a completed redemption for entitlement A (the future
# redemption flow's job, not built in Mission 002). No memorial_id to
# set on entitlements anymore (Mission 002 correction) — the link is
# memorials.entitlement_id alone.
$DB -c "update entitlements set status = 'redeemed', owner_id = '$OWNER_A', redeemed_at = now() where id = '$ENT_A';" >/dev/null

echo ""
echo "== Integrity constraint checks =="

expect_error "duplicate slug is rejected" \
  "insert into memorials (owner_id, entitlement_id, memorial_type, editorial_context, skin_id, language, slug) values ('$OWNER_A', '$ENT_A', 'person', 'announcement', 'intemporel', 'en', 'test-memorial-a-1x2y3z');"

expect_error "invalid status value is rejected" \
  "update memorials set status = 'not-a-real-status' where id = '$MEM_A';"

expect_error "invalid skin_id is rejected" \
  "update memorials set skin_id = 'not-a-real-skin' where id = '$MEM_A';"

expect_error "invalid enabled_sections value is rejected" \
  "update memorials set enabled_sections = array['not-a-real-section'] where id = '$MEM_A';"

expect_error "a second memorial cannot claim the same entitlement (single source of truth: memorials.entitlement_id)" \
  "insert into memorials (owner_id, entitlement_id, memorial_type, editorial_context, skin_id, language, slug) values ('$OWNER_A', '$ENT_A', 'person', 'announcement', 'intemporel', 'en', 'test-memorial-a-collision');"

expect_error "memorial without an owner is rejected" \
  "insert into memorials (entitlement_id, memorial_type, editorial_context, skin_id, language, slug) values ('$ENT_A', 'person', 'announcement', 'intemporel', 'en', 'test-memorial-no-owner');"

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

RESULT=$(as_owner "$AUTH_UID_A" "select count(*) from memorial_drafts;")
check "owner A sees exactly their own 1 draft (not owner B's)" "1" "$RESULT"

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

as_anon "insert into messages (memorial_id, message_type, author_name, content) values ('$MEM_B', 'condolence', 'A Visitor', 'Thinking of you.');" >/dev/null 2>"$PGDATA_DIR/last_error" || true
COND_COUNT=$($DB -t -A -c "select count(*) from messages where memorial_id = '$MEM_B';")
check "anonymous message is rejected on a non-published memorial" "0" "$COND_COUNT"

echo ""
echo "== Results: $PASS passed, $FAIL failed =="
if [ "$FAIL" -ne 0 ]; then
  exit 1
fi
