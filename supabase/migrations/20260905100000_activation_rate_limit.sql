-- Mission 019C: rate limiting for the generic HERITAGE activation surface
-- (/activate).
--
-- Mission 013 already requires that any human-facing surface accepting an
-- activation key be rate-limited. Mission 019C is that surface, so this
-- migration is the one that closes the gap before /activate is exposed.
--
-- Two things, no more:
--   A. activation_rate_limits — one counter row per Supabase Auth user
--   B. record_heritage_activation_attempt() — the one RPC that reads and
--      advances it atomically
--
-- No column added to any existing table, no existing policy touched, no
-- existing grant widened. This migration is purely additive.
--
-- ---------------------------------------------------------------------
-- WHY THIS SHAPE
-- ---------------------------------------------------------------------
--
-- The surface requires authentication before a key can even be submitted
-- (Mission 019C's own rule), so the identity to limit on already exists
-- and is already verified: Supabase Auth's own `auth.users.id`, resolved
-- server-side by lib/supabase/session.ts exactly like every other
-- HERITAGE authorization decision. Limiting on that — rather than on an
-- IP address, which a serverless deployment cannot reliably observe
-- behind Netlify's edge, and which this migration therefore does not
-- attempt — is what Mission 019C's brief calls "au minimum sur
-- l'identité Auth vérifiée", and V1 does exactly that minimum: one row
-- keyed by `auth_user_id`, nothing else.
--
-- The row deliberately carries NO activation key, no hash of one, no
-- email, no IP, no user-agent — counting attempts never needs to know
-- WHAT was attempted, only WHO attempted and WHEN. This is the strongest
-- possible answer to "no raw key persisted": the table cannot leak what
-- it never receives as an argument in the first place (see the function
-- below — it takes no key-shaped parameter at all).
--
-- A fixed window (not a sliding log) is deliberately the simplest correct
-- choice for V1: one row, one UPSERT, no per-attempt history to store or
-- prune. `admin_audit_events` (Mission 015B) is the append-only ledger
-- HERITAGE already has for one-row-per-event history; this is not that,
-- because retaining a history of activation attempts is not a
-- requirement here and would be more personal data than this mission's
-- "conservation minimale" rule calls for.
--
-- ---------------------------------------------------------------------
-- A. activation_rate_limits
-- ---------------------------------------------------------------------
--
-- `auth_user_id` is the PRIMARY KEY, not a column with a separate
-- surrogate id: there is exactly one counter per identity, ever, and a
-- primary key is also the unique index the UPSERT below needs — no
-- separate index to add or keep in sync.
--
-- No foreign key to auth.users, for the same reason admin_audit_events
-- has none (Mission 015B): that table belongs to Supabase Auth, not
-- HERITAGE, and a cross-schema FK is exactly the coupling this codebase
-- has avoided everywhere else this value appears. Trust in this column
-- comes from where it is populated (the server's own validated session),
-- never from a constraint.

create table activation_rate_limits (
  auth_user_id uuid primary key,
  -- Start of the CURRENT fixed window. Reset forward whenever a request
  -- arrives after the window has fully elapsed.
  window_started_at timestamptz not null default now(),
  -- Attempts recorded inside the current window, including the one that
  -- triggered a refusal — bounded in practice because the window resets
  -- on the very next attempt made after it elapses.
  attempt_count integer not null default 0,
  updated_at timestamptz not null default now(),

  constraint activation_rate_limits_attempt_count_check check (attempt_count >= 0)
);

comment on table activation_rate_limits is
  'Mission 019C. One row per Supabase Auth user id: a fixed-window attempt counter for the generic HERITAGE activation surface (/activate). Carries no activation key, hash, email, IP or user-agent — see record_heritage_activation_attempt(). Written and read exclusively by that function, called only by service_role.';
comment on column activation_rate_limits.auth_user_id is
  'Supabase Auth user id, resolved server-side from a validated session — never supplied by a browser. No FK to auth.users on purpose (cross-schema; same reasoning as admin_audit_events.admin_auth_user_id).';
comment on column activation_rate_limits.window_started_at is
  'Start of the current fixed window. A request arriving at or after window_started_at + the function''s fixed window length starts a fresh window instead of accumulating onto the old one.';
comment on column activation_rate_limits.attempt_count is
  'Attempts recorded in the current window. Reset to 1 whenever a new window starts.';

alter table activation_rate_limits enable row level security;

-- No policy, for any role — same doctrine as admin_audit_events
-- (Mission 015B). service_role carries BYPASSRLS and is the only role
-- with any table privilege at all (granted below), so for every other
-- role RLS is a second, redundant lock on a door the grants already keep
-- shut.

revoke all privileges on table activation_rate_limits from public, anon, authenticated, service_role;

-- SELECT/INSERT/UPDATE only: the function below reads and advances the
-- counter with a single INSERT ... ON CONFLICT DO UPDATE statement, so it
-- needs exactly those three, never DELETE. Rows are not pruned in V1 —
-- see the function's own comment for why an unbounded row count here is
-- acceptable (bounded by distinct authenticated users, not by requests).
grant select, insert, update on table activation_rate_limits to service_role;

-- ---------------------------------------------------------------------
-- B. record_heritage_activation_attempt()
-- ---------------------------------------------------------------------
--
-- Called once per submission, BEFORE the presented key is even looked at
-- (see lib/entitlement/activate-heritage-access.ts) — a blocked caller
-- must never reach the activation-key lookup at all, so the two cannot be
-- distinguished by timing or by a different refusal message.
--
-- The limit and window are fixed constants inside the function body, not
-- caller-supplied parameters: the policy is a HERITAGE security decision,
-- not something the calling application layer should be able to loosen
-- by passing different arguments — the same reasoning that keeps
-- admin_mutate_activation_key's compare-and-swap value server-computed
-- rather than caller-chosen.
--
-- Concurrency: the whole decision — read current state, decide whether
-- the window has elapsed, advance the counter, decide whether the result
-- is still within budget — happens inside ONE `insert ... on conflict do
-- update ... returning` statement. PostgreSQL takes the row's lock for
-- the duration of that single statement, so two concurrent submissions
-- from the same auth_user_id serialize on it exactly like
-- admin_mutate_activation_key's compare-and-swap serializes on
-- entitlements' row lock — one completes, the other's UPDATE branch of
-- the same statement then runs against what the first just committed.
-- There is no separate SELECT-then-UPDATE for a race to land between.
--
-- SECURITY INVOKER: service_role already holds the three table privileges
-- above, explicitly, so the function needs no privilege of its own — same
-- reasoning as redeem_entitlement() and admin_mutate_activation_key().

create or replace function record_heritage_activation_attempt(
  p_auth_user_id uuid
)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
security invoker
set search_path = public
as $$
declare
  -- HERITAGE's fixed policy for this surface: at most 5 attempts per
  -- 15-minute window per authenticated identity. Chosen generously
  -- enough that a family mistyping a printed key is never the reported
  -- failure mode, and tight enough to make guessing a 160-bit key
  -- computationally irrelevant either way (activation-key.ts already
  -- makes that infeasible on its own; this bounds concurrent load and
  -- abuse, not brute force of the key space itself).
  v_max_attempts   constant integer := 5;
  v_window_seconds constant integer := 900;
  v_window_started_at timestamptz;
  v_attempt_count      integer;
  v_elapsed_seconds    integer;
begin
  -- A defensive invariant, not a business refusal: every caller is
  -- lib/entitlement/activation-session.ts, which never calls this without
  -- a session-resolved auth user id. Reaching this with NULL means the
  -- server-side wiring itself is broken and must abort loudly rather than
  -- silently rate-limit "nobody".
  if p_auth_user_id is null then
    raise exception 'auth_user_id_required' using errcode = 'HH400';
  end if;

  insert into activation_rate_limits (auth_user_id, window_started_at, attempt_count, updated_at)
  values (p_auth_user_id, now(), 1, now())
  on conflict (auth_user_id) do update
    set attempt_count = case
          when activation_rate_limits.window_started_at <= now() - make_interval(secs => v_window_seconds)
            then 1
          else activation_rate_limits.attempt_count + 1
        end,
        window_started_at = case
          when activation_rate_limits.window_started_at <= now() - make_interval(secs => v_window_seconds)
            then now()
          else activation_rate_limits.window_started_at
        end,
        updated_at = now()
  returning activation_rate_limits.window_started_at, activation_rate_limits.attempt_count
    into v_window_started_at, v_attempt_count;

  v_elapsed_seconds := greatest(0, extract(epoch from (now() - v_window_started_at))::integer);

  return query select
    (v_attempt_count <= v_max_attempts) as allowed,
    (case when v_attempt_count <= v_max_attempts
          then 0
          else greatest(0, v_window_seconds - v_elapsed_seconds)
     end) as retry_after_seconds;
end;
$$;

comment on function record_heritage_activation_attempt(uuid) is
  'Mission 019C. Atomically records one activation attempt for p_auth_user_id in a fixed window (5 per 900s, hardcoded) and reports whether it is still within budget. One INSERT ... ON CONFLICT DO UPDATE ... RETURNING statement: the row lock it takes serializes concurrent attempts from the same identity, so the decision is never split across a separate read and write. SECURITY INVOKER, service_role only.';

revoke all on function record_heritage_activation_attempt(uuid)
  from public, anon, authenticated, service_role;
grant execute on function record_heritage_activation_attempt(uuid) to service_role;
