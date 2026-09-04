-- Mission 015B: audited Admin mutations.
--
-- Mission 015A gave HERITAGE staff read-only support lookups. This
-- mission gives them exactly three mutations — replace an activation
-- key, invalidate one, revoke an AVAILABLE entitlement — and the one
-- thing 015A's audit deliberately parked: a permanent, append-only
-- record of every one of them.
--
-- Four things, no more:
--   A. admin_audit_events — the append-only ledger
--   B. admin_mutate_activation_key() — replace/invalidate, one RPC
--   C. admin_revoke_entitlement() — available -> revoked, one RPC
--   D. privileges: service_role gets SELECT + INSERT on the ledger and
--      EXECUTE on both RPCs; nothing else changes anywhere
--
-- No column is renamed, no existing constraint loosened, no existing
-- RLS policy touched. `entitlements.status` already accepts 'revoked'
-- (Mission 002) and `activation_key_hash` already exists (Mission 013)
-- — this migration adds no new column to that table at all.
--
-- ---------------------------------------------------------------------
-- A. admin_audit_events — THE APPEND-ONLY LEDGER
-- ---------------------------------------------------------------------
--
-- "Append-only" is enforced the same way Mission 013C enforces every
-- other privilege boundary: in Git, as an explicit REVOKE/GRANT, not as
-- a trigger or a convention. service_role — the only role that will
-- ever touch this table — receives SELECT and INSERT and nothing else.
-- No UPDATE, no DELETE, no TRUNCATE. A row, once written, cannot be
-- changed or removed by any code path this schema allows, including a
-- future bug: the privilege model itself is the guarantee, not the
-- application's discipline.
--
-- `action` and `target_type` are free text under a FORMAT constraint,
-- not a closed SQL enum. A `check (action in (...))` would need a
-- migration every time a future mission adds a mutation, and Mission
-- 015B is deliberately not the mission that enumerates every action
-- HERITAGE support will ever take. The format constraint below still
-- rejects the empty string and anything that is not a lowercase
-- dot-namespaced identifier — good enough to keep the ledger legible
-- and to stop a blank or garbage value, without hard-coding today's
-- three actions as the only ones that will ever exist.
--
-- No foreign key to auth.users: that table is Supabase Auth's, not
-- HERITAGE's, and a FK across schema ownership boundaries is exactly
-- the kind of coupling Mission 013's activation-key design already
-- avoided elsewhere. `admin_auth_user_id` is trusted because of WHERE
-- it comes from (Mission 014's `requireHeritageAdmin`, resolved from a
-- validated session — see lib/admin/admin-session.ts), never because a
-- constraint enforces it.

create table admin_audit_events (
  id uuid primary key default gen_random_uuid(),
  -- The Supabase Auth user id of the HERITAGE staff member who performed
  -- the action, resolved server-side from a validated session. Never
  -- supplied by a browser — see lib/admin/admin-session.ts.
  admin_auth_user_id uuid not null,
  -- e.g. 'activation_key.replaced', 'entitlement.revoked'. Derived by
  -- the RPC from what actually happened, never received as a
  -- caller-supplied label — see B and C below.
  action text not null,
  -- e.g. 'entitlement'. The kind of thing `target_id` identifies.
  target_type text not null,
  target_id uuid not null,
  -- Structural facts observed under the same row lock as the mutation,
  -- e.g. {"had_activation_key": true, "from_status": "available",
  -- "to_status": "revoked"}. Never a raw key, a hash, an email, memorial
  -- content, a token, an IP or a user-agent — see the RPCs below, which
  -- are the only writers and construct this themselves.
  context jsonb not null default '{}',
  created_at timestamptz not null default now(),

  constraint admin_audit_events_action_format
    check (action ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$'),
  constraint admin_audit_events_target_type_format
    check (target_type ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$')
);

comment on table admin_audit_events is
  'Mission 015B. Append-only record of every HERITAGE staff mutation. service_role holds SELECT + INSERT only — no UPDATE, no DELETE, no TRUNCATE (see the privilege grants below). Written exclusively by admin_mutate_activation_key() and admin_revoke_entitlement(), inside the same transaction as the mutation it records.';
comment on column admin_audit_events.admin_auth_user_id is
  'auth.users.id of the staff member, resolved server-side from a validated session. No FK to auth.users on purpose — cross-schema, and trust comes from where this value is populated, not from a constraint.';
comment on column admin_audit_events.context is
  'Structural facts only (booleans, before/after status), built by the RPC from what it observed under lock. Never a raw activation key, a hash, an email, memorial content, a token, or a request IP/user-agent.';

-- Minimal index: every real use of this ledger is "the history for THIS
-- target, newest first" (a support ticket about one entitlement). No
-- index on admin_auth_user_id or action — nothing reads by those yet,
-- and an unused index is a write-time cost with no read benefit.
create index admin_audit_events_target_idx
  on admin_audit_events (target_type, target_id, created_at desc);

alter table admin_audit_events enable row level security;

-- No policy, for any role. service_role carries BYPASSRLS (Mission 013C
-- established this for the local harness stand-in; the real project's
-- service_role already has it), so it never evaluates a policy here
-- regardless. anon and authenticated get no privilege at all below, so
-- for them RLS is a second, redundant lock on a door the grants already
-- keep shut — same reasoning as every other HERITAGE table since
-- Mission 013C.

revoke all privileges on table admin_audit_events from public, anon, authenticated, service_role;
grant select, insert on table admin_audit_events to service_role;

-- ---------------------------------------------------------------------
-- B. admin_mutate_activation_key() — replace or invalidate, one RPC
-- ---------------------------------------------------------------------
--
-- Shares one predicate for both operations, exactly as the Opus audit
-- asked: the entitlement must exist and be `status = 'available'`. That
-- is the entire admission check. Deliberately NOT a compare-and-swap
-- against a caller-supplied "current hash" — Mission 013's own
-- swapActivationKey() needs that because an OWNER may be presenting a
-- key they still hold, but HERITAGE support does not and must not know
-- the raw key it once showed a family exactly once. Requiring it here
-- would make a lost response unrecoverable: support could never rotate
-- a key again without the very secret the rotation exists to replace.
-- FOR UPDATE still gives real serialisation — two concurrent callers on
-- the same row do not both read the same "before" state, and either
-- one can lose to a concurrent revoke (see C) because the second one's
-- re-read of `status`, taken after the lock is granted, no longer says
-- 'available'.
--
-- p_next_activation_key_hash is NULL for an invalidation and a 64-hex
-- sha256 for a replacement — generated in lib/entitlement/activation-key.ts,
-- never in SQL (Mission 015B's crypto boundary: see that file's own
-- docstring). Which of the two happened is read back from this same
-- parameter, under the same lock, to build the audit action — never
-- accepted as a separate caller-supplied label.
--
-- The raw key itself never appears here, is never a parameter, and is
-- never written to `context`. Only its hash travels, exactly like every
-- other Mission 013 write path.

create or replace function admin_mutate_activation_key(
  p_entitlement_id           uuid,
  p_admin_auth_user_id       uuid,
  p_next_activation_key_hash text
)
returns table (outcome text)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_status        text;
  v_current_hash  text;
  v_had_key       boolean;
  v_key_changed   boolean;
  v_action        text;
begin
  -- A defensive invariant, not a business refusal: every caller of this
  -- function is lib/admin/admin-session.ts, which never calls it without
  -- an admin identity the Mission 014 gate already granted. Reaching
  -- this with NULL means the server-side wiring itself is broken, which
  -- must abort loudly rather than write an unattributed audit row.
  if p_admin_auth_user_id is null then
    raise exception 'admin_auth_user_id_required' using errcode = 'HH400';
  end if;

  select e.status, e.activation_key_hash
    into v_status, v_current_hash
    from entitlements e
   where e.id = p_entitlement_id
     for update;

  if not found then
    return query select 'not_found'::text;
    return;
  end if;

  if v_status <> 'available' then
    return query select 'not_available'::text;
    return;
  end if;

  v_had_key := v_current_hash is not null;
  v_key_changed := v_current_hash is distinct from p_next_activation_key_hash;

  update entitlements
     set activation_key_hash = p_next_activation_key_hash
   where id = p_entitlement_id;

  v_action := case when p_next_activation_key_hash is null
                    then 'activation_key.invalidated'
                    else 'activation_key.replaced' end;

  insert into admin_audit_events
    (admin_auth_user_id, action, target_type, target_id, context)
  values (
    p_admin_auth_user_id,
    v_action,
    'entitlement',
    p_entitlement_id,
    jsonb_build_object('had_activation_key', v_had_key, 'key_changed', v_key_changed)
  );

  return query select
    (case when p_next_activation_key_hash is null then 'invalidated' else 'replaced' end)::text;
end;
$$;

comment on function admin_mutate_activation_key(uuid, uuid, text) is
  'Mission 015B. Replaces or invalidates the activation key of an AVAILABLE entitlement and writes its audit row, in one transaction. p_next_activation_key_hash NULL = invalidate, a hash = replace; the audited action is derived from that, never received as a label. SECURITY INVOKER, service_role only. Returns a value (never raises) for every business outcome: replaced | invalidated | not_found | not_available.';

revoke all on function admin_mutate_activation_key(uuid, uuid, text) from public;
grant execute on function admin_mutate_activation_key(uuid, uuid, text) to service_role;

-- ---------------------------------------------------------------------
-- C. admin_revoke_entitlement() — available -> revoked, one RPC
-- ---------------------------------------------------------------------
--
-- The only transition this function will ever perform is
-- available -> revoked. redeemed -> revoked is refused (a claimed right
-- is a family's, not support's, to take back) and revoked -> revoked is
-- refused too (never a second audit row for the same fact). Both
-- refusals return a value; neither raises.
--
-- The key hash is cleared in the SAME update as the status, in the SAME
-- transaction as the audit row. That is the point GPT's review made
-- explicit: a key from a revoked right must not keep resolving to it.
-- Once this commits, `entitlements_activation_key_hash_key`'s partial
-- unique index no longer reserves that hash either, so a future right
-- could not collide with a dead key by accident — though a fresh 160-bit
-- draw colliding with anything is not a real risk to begin with (see
-- activation-key.ts).

create or replace function admin_revoke_entitlement(
  p_entitlement_id     uuid,
  p_admin_auth_user_id uuid
)
returns table (outcome text, blocking_status text)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_status  text;
  v_had_key boolean;
begin
  if p_admin_auth_user_id is null then
    raise exception 'admin_auth_user_id_required' using errcode = 'HH400';
  end if;

  select e.status, (e.activation_key_hash is not null)
    into v_status, v_had_key
    from entitlements e
   where e.id = p_entitlement_id
     for update;

  if not found then
    return query select 'not_found'::text, null::text;
    return;
  end if;

  if v_status <> 'available' then
    return query select 'not_available'::text, v_status;
    return;
  end if;

  update entitlements
     set status = 'revoked',
         activation_key_hash = null
   where id = p_entitlement_id;

  insert into admin_audit_events
    (admin_auth_user_id, action, target_type, target_id, context)
  values (
    p_admin_auth_user_id,
    'entitlement.revoked',
    'entitlement',
    p_entitlement_id,
    jsonb_build_object(
      'had_activation_key', v_had_key,
      'from_status', 'available',
      'to_status', 'revoked'
    )
  );

  return query select 'revoked'::text, null::text;
end;
$$;

comment on function admin_revoke_entitlement(uuid, uuid) is
  'Mission 015B. available -> revoked only; redeemed -> revoked and revoked -> revoked are refused as values, never exceptions. Clears activation_key_hash in the same update and writes the audit row in the same transaction. SECURITY INVOKER, service_role only. Returns outcome in {revoked, not_found, not_available}, plus the blocking status when refused.';

revoke all on function admin_revoke_entitlement(uuid, uuid) from public;
grant execute on function admin_revoke_entitlement(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------
-- D. WHAT DOES NOT CHANGE
-- ---------------------------------------------------------------------
--
-- entitlements' own grants are untouched: service_role already holds
-- SELECT/INSERT/UPDATE from Mission 013C, which is exactly what these
-- two SECURITY INVOKER functions need and nothing more. Neither
-- function is granted anything of its own to hold, by design — same
-- reasoning as redeem_entitlement() in Mission 011A/013C.
--
-- lib/entitlement/activation-key-lifecycle.ts's replaceActivationKey()/
-- invalidateActivationKey() and the swapActivationKey() port method they
-- call are untouched too: still there, still unwired to any route. This
-- migration does not revoke service_role's table-level UPDATE on
-- entitlements — redeem_entitlement() genuinely needs it as a SECURITY
-- INVOKER function — so that direct PostgREST path remains callable in
-- principle. What makes it dead as an ADMIN path is that nothing in
-- app/admin or lib/admin ever calls it: the Admin surface is wired
-- exclusively to admin_mutate_activation_key() and
-- admin_revoke_entitlement() above, and
-- lib/admin/admin-entitlement-repository-boundary.test.ts asserts that
-- architecturally, so it cannot regress silently.
