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

-- Mission 011A stand-in for Supabase's real `service_role`: the
-- server-side privileged role the redemption RPC is called with. The two
-- properties that matter for what is under test here are BYPASSRLS and
-- ordinary DML grants — exactly what the real one has. Like the anon /
-- authenticated stand-ins above, it is defined only in this script,
-- never in supabase/migrations/, because a real Supabase project already
-- provides it.
create role service_role nologin bypassrls;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated, service_role;
SQL

echo "== Applying migrations =="
for f in "$MIGRATIONS_DIR"/*.sql; do
  echo "  -> $(basename "$f")"
  $DB -f "$f"
done

# Mission 013 removed the blanket
#   grant select, insert, update, delete on all tables in schema public
# that used to run here. It was redundant — ALTER DEFAULT PRIVILEGES
# above already covers every table these migrations create — and it was
# actively harmful: running AFTER the migrations, it silently re-granted
# the table-wide SELECT that 20260901180000_activation_keys.sql revokes
# to keep entitlements.activation_key_hash server-only. A blanket grant
# must never be able to undo a deliberate restriction. The checks below
# assert both halves: ordinary tables are still readable, and the hash is
# not.

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

ENT_A=$($DB -t -A -c "insert into entitlements (source, offer_id) values ('etsy', 'occidental') returning id;")
ENT_B=$($DB -t -A -c "insert into entitlements (source, offer_id) values ('etsy', 'occidental') returning id;")

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

expect_error "invalid offer_id is rejected" \
  "insert into entitlements (source, offer_id) values ('etsy', 'not-a-real-offer');"

expect_error "entitlements.skin_id no longer exists (Mission 006: skin lives on memorials only)" \
  "select skin_id from entitlements limit 1;"

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
echo "== Mission 011A: progressive memorial + atomic redemption =="

# The redemption RPC is only ever called by the server-side privileged
# role, never by a browser. Every call below therefore goes through
# `set role service_role` — the superuser connection this script runs on
# would bypass the very privilege model under test.
svc() {
  $DB -t -A -c "set role service_role; $*"
}

# Expects the statement to fail, AND to fail for the stated reason.
# "it errored" alone would pass even if the function were broken.
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

OWNER_C=$($DB -t -A -c "insert into owners (auth_user_id, email) values (gen_random_uuid(), 'owner-c@example.test') returning id;")
OWNER_D=$($DB -t -A -c "insert into owners (auth_user_id, email) values (gen_random_uuid(), 'owner-d@example.test') returning id;")

new_entitlement() {
  $DB -t -A -c "insert into entitlements (source, offer_id, status) values ('direct', 'occidental', '$1') returning id;"
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
$DB -c "insert into memorials (owner_id, entitlement_id, memorial_type, skin_id) values ('$OWNER_C', '$ENT_NULLS', 'person', 'intemporel');" >/dev/null
NULL_SHAPE=$($DB -t -A -c "select (editorial_context is null) || ',' || (language is null) || ',' || (slug is null) || ',' || status from memorials where entitlement_id = '$ENT_NULLS';")
check "A: a memorial is creatable with editorial_context/language/slug all NULL, status 'draft'" "true,true,true,draft" "$NULL_SHAPE"

# The CHECK constraints must survive the NOT NULL relaxation: NULL is
# allowed, but a bogus non-null value is still rejected.
expect_error "A: a non-null but invalid language is still rejected (CHECK survives DROP NOT NULL)" \
  "update memorials set language = 'zz' where entitlement_id = '$ENT_NULLS';"

expect_error "A: a non-null but invalid editorial_context is still rejected" \
  "update memorials set editorial_context = 'not-a-context' where entitlement_id = '$ENT_NULLS';"

# --- B: UNIQUE slug is NULLS DISTINCT -------------------------------
$DB -c "insert into memorials (owner_id, entitlement_id, memorial_type, skin_id) values ('$OWNER_C', '$ENT_NULLS2', 'person', 'intemporel');" >/dev/null
NULL_SLUGS=$($DB -t -A -c "select count(*) from memorials where slug is null;")
check "B: several memorials coexist with slug NULL (PostgreSQL UNIQUE is NULLS DISTINCT)" "2" "$NULL_SLUGS"

NULLS_NOT_DISTINCT=$($DB -t -A -c "select indnullsnotdistinct from pg_index where indrelid = 'memorials'::regclass and indisunique and indexrelid::regclass::text like '%slug%';")
check "B: memorials' slug unique index is NULLS DISTINCT (not NULLS NOT DISTINCT)" "f" "$NULLS_NOT_DISTINCT"

$DB -c "update memorials set slug = 'real-slug-once-generated' where entitlement_id = '$ENT_NULLS';" >/dev/null
expect_error "B: two identical non-null slugs are still rejected" \
  "update memorials set slug = 'real-slug-once-generated' where entitlement_id = '$ENT_NULLS2';"

# --- privileges: who may call the primitive at all ------------------
expect_error "redeem_entitlement is NOT executable by 'authenticated'" \
  "set role authenticated; select * from redeem_entitlement('$ENT_OK', '$OWNER_C', 'person', 'intemporel');"

expect_error "redeem_entitlement is NOT executable by 'anon'" \
  "set role anon; select * from redeem_entitlement('$ENT_OK', '$OWNER_C', 'person', 'intemporel');"

# --- C: a normal redemption ----------------------------------------
REDEEM=$(svc "select outcome from redeem_entitlement('$ENT_OK', '$OWNER_C', 'person', 'intemporel');")
check "C: redeeming an available entitlement reports 'redeemed'" "redeemed" "$REDEEM"

MEM_OK=$($DB -t -A -c "select id from memorials where entitlement_id = '$ENT_OK';")
ENT_STATE=$($DB -t -A -c "select status || ',' || (owner_id = '$OWNER_C') || ',' || (redeemed_at is not null) from entitlements where id = '$ENT_OK';")
check "C: the entitlement is now redeemed, attached to the right owner, with redeemed_at set" "redeemed,true,true" "$ENT_STATE"

MEM_COUNT=$($DB -t -A -c "select count(*) from memorials where entitlement_id = '$ENT_OK';")
check "C: exactly one memorial exists for that entitlement" "1" "$MEM_COUNT"

MEM_SHAPE=$($DB -t -A -c "select memorial_type || ',' || skin_id || ',' || (owner_id = '$OWNER_C') || ',' || (editorial_context is null) || ',' || (language is null) || ',' || (slug is null) from memorials where id = '$MEM_OK';")
check "C: the created memorial carries type/skin/owner and leaves the family's choices NULL" "person,intemporel,true,true,true,true" "$MEM_SHAPE"

# --- I: the existing draft trigger ran inside the same transaction --
DRAFT_OK=$($DB -t -A -c "select count(*) from memorial_drafts where memorial_id = '$MEM_OK';")
check "I: exactly one draft row was created by the existing trigger" "1" "$DRAFT_OK"

# --- F: idempotence — same owner retrying a lost response -----------
REDEEM2=$(svc "select outcome from redeem_entitlement('$ENT_OK', '$OWNER_C', 'person', 'intemporel');")
check "F: the same owner retrying gets 'already_redeemed' instead of an error" "already_redeemed" "$REDEEM2"

MEM_AGAIN=$(svc "select memorial_id from redeem_entitlement('$ENT_OK', '$OWNER_C', 'person', 'intemporel');")
check "F: the retry returns the very same memorial_id" "$MEM_OK" "$MEM_AGAIN"

MEM_COUNT=$($DB -t -A -c "select count(*) from memorials where entitlement_id = '$ENT_OK';")
check "F: retrying never created a second memorial" "1" "$MEM_COUNT"

# --- G: a different owner may never claim a consumed right ----------
svc_expect_error "G: another owner claiming the already-redeemed entitlement is refused" \
  "select * from redeem_entitlement('$ENT_OK', '$OWNER_D', 'person', 'intemporel');" \
  "entitlement_owned_by_another_owner"

MEM_COUNT=$($DB -t -A -c "select count(*) from memorials where entitlement_id = '$ENT_OK';")
OWNER_STILL=$($DB -t -A -c "select (owner_id = '$OWNER_C') from entitlements where id = '$ENT_OK';")
check "G: the refusal created no memorial and did not move the entitlement" "1,t" "$MEM_COUNT,$OWNER_STILL"

# --- E: revoked ------------------------------------------------------
svc_expect_error "E: a revoked entitlement is refused" \
  "select * from redeem_entitlement('$ENT_REVOKED', '$OWNER_C', 'person', 'intemporel');" \
  "entitlement_not_available:revoked"

REVOKED_STATE=$($DB -t -A -c "select status || ',' || coalesce(owner_id::text, 'null') || ',' || (select count(*) from memorials where entitlement_id = '$ENT_REVOKED') from entitlements where id = '$ENT_REVOKED';")
check "E: the revoked entitlement is untouched and has no memorial" "revoked,null,0" "$REVOKED_STATE"

svc_expect_error "an unknown entitlement id is refused" \
  "select * from redeem_entitlement('00000000-0000-0000-0000-000000000000', '$OWNER_C', 'person', 'intemporel');" \
  "entitlement_not_found"

# --- D + J: atomicity — a failure mid-transaction rolls back all of it
# An invalid memorial_type passes the function's own checks and reaches
# the INSERT, which the table's CHECK rejects. Because the entitlement
# was ALREADY updated to 'redeemed' at that point, this proves a real
# rollback of a write that had genuinely executed — not merely that a
# later statement never ran.
DRAFTS_BEFORE=$($DB -t -A -c "select count(*) from memorial_drafts;")
svc_expect_error "D: a memorial INSERT failing mid-transaction aborts the whole redemption" \
  "select * from redeem_entitlement('$ENT_ROLLBACK', '$OWNER_C', 'not-a-real-type', 'intemporel');" \
  "memorials_memorial_type_check"

ROLLBACK_STATE=$($DB -t -A -c "select status || ',' || coalesce(owner_id::text,'null') || ',' || coalesce(redeemed_at::text,'null') from entitlements where id = '$ENT_ROLLBACK';")
check "D: after rollback the entitlement is still available, unowned, never redeemed" "available,null,null" "$ROLLBACK_STATE"

ROLLBACK_MEM=$($DB -t -A -c "select count(*) from memorials where entitlement_id = '$ENT_ROLLBACK';")
check "D: after rollback no memorial exists" "0" "$ROLLBACK_MEM"

DRAFTS_AFTER=$($DB -t -A -c "select count(*) from memorial_drafts;")
check "J: after rollback no phantom draft row survives" "$DRAFTS_BEFORE" "$DRAFTS_AFTER"

# The same entitlement is still perfectly usable afterwards — the failed
# attempt left no trace that would block a legitimate retry.
RETRY_AFTER_ROLLBACK=$(svc "select outcome from redeem_entitlement('$ENT_ROLLBACK', '$OWNER_C', 'person', 'intemporel');")
check "D: the entitlement is still redeemable after the failed attempt" "redeemed" "$RETRY_AFTER_ROLLBACK"

# --- H1: the row lock genuinely serializes --------------------------
# A separate session holds FOR UPDATE on the entitlement for 3s. The
# redemption must BLOCK on it (hitting its 1s statement_timeout), not
# read past it. This proves the FOR UPDATE in the function is doing real
# work, deterministically — not inferred from a lucky race.
( $DB -c "begin; select id from entitlements where id = '$ENT_LOCK' for update; select pg_sleep(3); rollback;" >/dev/null 2>&1 ) &
LOCKER_PID=$!
sleep 0.5
if $DB -c "set role service_role; set local statement_timeout = '1000ms'; select * from redeem_entitlement('$ENT_LOCK', '$OWNER_C', 'person', 'intemporel');" >/dev/null 2>&1; then
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
    $DB -t -A -c "set role service_role; select pg_sleep(0.7); select outcome from redeem_entitlement('$ENT_CONC', '$CONC_OWNER', 'person', 'intemporel');" \
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
B_ENT=$($DB -t -A -c "insert into entitlements (source, offer_id) values ('direct', 'juif') returning id;")
B_OUTCOME=$(svc "select outcome from redeem_entitlement('$B_ENT', '$B_OWNER', 'person', 'juif');")
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
K_ENT=$($DB -t -A -c "insert into entitlements (source, offer_id, activation_key_hash) values ('direct','occidental','$K_HASH') returning id;")
# Give this owner a redeemed right too: that is the only state in which
# entitlements_select_own matches a row at all, so it is the only state
# where a leak could actually happen.
K_ENT_MINE=$($DB -t -A -c "insert into entitlements (source, offer_id, status, owner_id, redeemed_at, activation_key_hash) values ('direct','juif','redeemed','$K_OWNER',now(),'$(printf 'b%.0s' $(seq 1 64))') returning id;")

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
  "set role authenticated; set local request.jwt.claim.sub = '$K_AUTH'; insert into entitlements (source, offer_id) values ('direct','juif');"

expect_error "authenticated CANNOT update its own entitlement" \
  "set role authenticated; set local request.jwt.claim.sub = '$K_AUTH'; update entitlements set status = 'available' where id = '$K_ENT_MINE';"

expect_error "authenticated CANNOT write activation_key_hash" \
  "set role authenticated; set local request.jwt.claim.sub = '$K_AUTH'; update entitlements set activation_key_hash = null where id = '$K_ENT_MINE';"

expect_error "authenticated CANNOT delete an entitlement" \
  "set role authenticated; set local request.jwt.claim.sub = '$K_AUTH'; delete from entitlements where id = '$K_ENT_MINE';"

expect_error "anon CANNOT insert an entitlement" \
  "set role anon; insert into entitlements (source, offer_id) values ('direct','juif');"

# --- PUBLIC must hold nothing, directly or by column grant ------------
PUBLIC_TABLE=$($DB -t -A -c "select coalesce((select true from aclexplode((select relacl from pg_class where oid='public.entitlements'::regclass)) a where a.grantee = 0 limit 1), false);")
check "PUBLIC has no table privilege on entitlements" "f" "$PUBLIC_TABLE"

PUBLIC_COLUMNS=$($DB -t -A -c "select count(*) from pg_attribute att join lateral aclexplode(att.attacl) a on true where att.attrelid = 'public.entitlements'::regclass and a.grantee = 0;")
check "PUBLIC has no column privilege on entitlements either" "0" "$PUBLIC_COLUMNS"

# --- service_role keeps everything the engine needs -------------------
for privilege in SELECT INSERT UPDATE DELETE; do
  HAS=$($DB -t -A -c "select has_table_privilege('service_role','public.entitlements','$privilege');")
  check "service_role keeps $privilege on entitlements" "t" "$HAS"
done

# The column allowlist means any column added later is invisible until
# somebody deliberately grants it — secure by default, not by vigilance.
$DB -c "alter table entitlements add column future_column text;" >/dev/null
expect_error "a column added later is NOT automatically exposed to authenticated" \
  "set role authenticated; set local request.jwt.claim.sub = '$K_AUTH'; select future_column from entitlements;"
$DB -c "alter table entitlements drop column future_column;" >/dev/null

# --- the hash column's own integrity ---
expect_error "a non-sha256 activation_key_hash is rejected" \
  "insert into entitlements (source, offer_id, activation_key_hash) values ('direct','occidental','not-a-hash');"

expect_error "an uppercase hex activation_key_hash is rejected" \
  "insert into entitlements (source, offer_id, activation_key_hash) values ('direct','occidental','$(printf 'A%.0s' $(seq 1 64))');"

expect_error "two rights cannot share one activation key hash" \
  "insert into entitlements (source, offer_id, activation_key_hash) values ('direct','occidental','$K_HASH');"

NULL_KEYS=$($DB -t -A -c "insert into entitlements (source, offer_id) values ('direct','occidental'),('direct','arabe') returning 1;" | wc -l)
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

ELEVENA_UNCHANGED=$($DB -t -A -c "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='redeem_entitlement' and pg_get_function_identity_arguments(p.oid)='p_entitlement_id uuid, p_owner_id uuid, p_memorial_type text, p_skin_id text';")
check "Mission 011A's redeem_entitlement is untouched (keyless path preserved)" "1" "$ELEVENA_UNCHANGED"

# --- concurrency / linearisation, scenarios A-F ---
new_keyed_entitlement() {
  $DB -t -A -c "insert into entitlements (source, offer_id, activation_key_hash) values ('direct','occidental','$1') returning id;"
}
HASH_A=$(printf '1%.0s' $(seq 1 64)); HASH_B=$(printf '2%.0s' $(seq 1 64))
HASH_C=$(printf '3%.0s' $(seq 1 64)); HASH_D=$(printf '4%.0s' $(seq 1 64))
HASH_E=$(printf '5%.0s' $(seq 1 64)); HASH_F=$(printf '6%.0s' $(seq 1 64))

# A: activation wins, then replacement must fail (right no longer available)
ENT_A=$(new_keyed_entitlement "$HASH_A")
OUT_A=$(svc "select outcome from redeem_entitlement_with_activation_key('$ENT_A','$HASH_A','$K_OWNER','person','intemporel');")
check "A: activation with the current key succeeds" "redeemed" "$OUT_A"
SWAPPED_A=$($DB -t -A -c "with u as (update entitlements set activation_key_hash='$HASH_B' where id='$ENT_A' and status='available' and activation_key_hash='$HASH_A' returning 1) select count(*) from u;")
check "A: replacing the key of an already-redeemed right matches 0 rows" "0" "$SWAPPED_A"

# B: replacement wins, then the OLD key must be refused
ENT_B=$(new_keyed_entitlement "$HASH_B")
$DB -c "update entitlements set activation_key_hash='$HASH_C' where id='$ENT_B';" >/dev/null
svc_expect_error "B: the superseded key is refused under the row lock" \
  "select * from redeem_entitlement_with_activation_key('$ENT_B','$HASH_B','$K_OWNER','person','intemporel');" \
  "activation_key_superseded"
B_STATE=$($DB -t -A -c "select status || ',' || (select count(*) from memorials where entitlement_id='$ENT_B') from entitlements where id='$ENT_B';")
check "B: the refusal created no memorial and left the right available" "available,0" "$B_STATE"
OUT_B=$(svc "select outcome from redeem_entitlement_with_activation_key('$ENT_B','$HASH_C','$K_OWNER','person','intemporel');")
check "B: the NEW key still works" "redeemed" "$OUT_B"

# C: invalidation wins before activation
ENT_C=$(new_keyed_entitlement "$HASH_D")
$DB -c "update entitlements set activation_key_hash=null where id='$ENT_C' and status='available' and activation_key_hash='$HASH_D';" >/dev/null
svc_expect_error "C: an invalidated key can no longer redeem" \
  "select * from redeem_entitlement_with_activation_key('$ENT_C','$HASH_D','$K_OWNER','person','intemporel');" \
  "activation_key_superseded"
C_MEM=$($DB -t -A -c "select count(*) from memorials where entitlement_id='$ENT_C';")
check "C: invalidation created no memorial, and the right itself is untouched" "0" "$C_MEM"
C_STATUS=$($DB -t -A -c "select status from entitlements where id='$ENT_C';")
check "C: invalidating a KEY did not revoke the RIGHT" "available" "$C_STATUS"

# D: revoked right
ENT_D=$(new_keyed_entitlement "$HASH_E")
$DB -c "update entitlements set status='revoked' where id='$ENT_D';" >/dev/null
svc_expect_error "D: a revoked right is refused by Mission 011A even with the current key" \
  "select * from redeem_entitlement_with_activation_key('$ENT_D','$HASH_E','$K_OWNER','person','intemporel');" \
  "entitlement_not_available:revoked"

# E: idempotent retry by the same owner, same current key
ENT_E=$(new_keyed_entitlement "$HASH_F")
MEM_E=$(svc "select memorial_id from redeem_entitlement_with_activation_key('$ENT_E','$HASH_F','$K_OWNER','person','intemporel');")
MEM_E2=$(svc "select memorial_id from redeem_entitlement_with_activation_key('$ENT_E','$HASH_F','$K_OWNER','person','intemporel');")
check "E: retrying with the same key returns the same memorial (011A idempotence preserved)" "$MEM_E" "$MEM_E2"
E_COUNT=$($DB -t -A -c "select count(*) from memorials where entitlement_id='$ENT_E';")
check "E: the retry created no second memorial" "1" "$E_COUNT"

# F: a different owner holding the same key
OTHER_OWNER=$($DB -t -A -c "insert into owners (auth_user_id, email) values (gen_random_uuid(), 'other-keys@example.test') returning id;")
svc_expect_error "F: another owner presenting the same key is refused" \
  "select * from redeem_entitlement_with_activation_key('$ENT_E','$HASH_F','$OTHER_OWNER','person','intemporel');" \
  "entitlement_owned_by_another_owner"
F_COUNT=$($DB -t -A -c "select count(*) from memorials where entitlement_id='$ENT_E';")
check "F: still exactly one memorial for that right" "1" "$F_COUNT"

# The lock is real, not inferred: hold the row and show the wrapper waits.
ENT_LOCK=$(new_keyed_entitlement "$(printf '7%.0s' $(seq 1 64))")
( $DB -c "begin; select activation_key_hash from entitlements where id='$ENT_LOCK' for update; select pg_sleep(3); rollback;" >/dev/null 2>&1 ) &
LOCKER=$!
sleep 0.5
if $DB -c "set role service_role; set local statement_timeout='1000ms'; select * from redeem_entitlement_with_activation_key('$ENT_LOCK','$(printf '7%.0s' $(seq 1 64))','$K_OWNER','person','intemporel');" >/dev/null 2>&1; then
  echo "  [FAIL] the key-checked redemption did NOT block on the row lock"
  FAIL=$((FAIL + 1))
else
  echo "  [PASS] the key check happens under the same row lock as the redemption"
  PASS=$((PASS + 1))
fi
wait $LOCKER

echo ""
echo "== Results: $PASS passed, $FAIL failed =="
if [ "$FAIL" -ne 0 ]; then
  exit 1
fi
