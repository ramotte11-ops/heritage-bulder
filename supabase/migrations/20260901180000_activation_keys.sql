-- Mission 013: activation keys.
--
-- An Entitlement is the product right. An activation key is a temporary
-- secret that lets someone FIND that right before activating it. The key
-- is never an identity, a password, a session, or entitlement.id, and it
-- grants nothing once the right is redeemed — normal access is then
-- Supabase Auth -> Owner -> Memorial.
--
-- Four things, no more:
--   A. entitlements.activation_key_hash (+ CHECK, + partial UNIQUE)
--   B. the hash becomes server-only, by privilege
--   C. redeem_entitlement_with_activation_key(), additive
--   D. nothing else
--
-- No new table, no new RLS policy, no policy weakened, and
-- redeem_entitlement(uuid, uuid, text, text) from Mission 011A is left
-- exactly as it is.
--
-- ---------------------------------------------------------------------
-- A. THE COLUMN
-- ---------------------------------------------------------------------
--
-- Only the hash is ever stored: sha256 of a canonical input that
-- includes the key's format version (see lib/entitlement/activation-key.ts),
-- so the same 32 characters under a future HH2 can never resolve to the
-- right a HH1 key opens. The raw key exists only in memory, and only
-- twice: when it is generated, and when someone presents it.
--
-- Nullable on purpose: an Entitlement may legitimately have no key —
-- either because it was granted directly by HERITAGE, or because its key
-- was invalidated (see Mission 013's invalidate primitive). Nullable
-- also means this migration cannot fail on existing rows.
--
-- The hash lives HERE rather than in a side table for one specific
-- reason: replacement and activation must serialize. An UPDATE of this
-- column takes the row lock on exactly the row `redeem_entitlement`
-- locks with FOR UPDATE, so "the key was replaced while an activation
-- was in flight" is settled by PostgreSQL rather than by convention. A
-- side table would not contend on that lock at all.

alter table entitlements add column activation_key_hash text;

alter table entitlements
  add constraint entitlements_activation_key_hash_check
    check (activation_key_hash ~ '^[0-9a-f]{64}$');

-- Partial UNIQUE: makes a collision impossible to commit AND gives the
-- exact indexed lookup the resolution path needs. Partial because many
-- entitlements legitimately have no key — same shape as
-- owners_auth_user_id_key.
create unique index entitlements_activation_key_hash_key
  on entitlements (activation_key_hash)
  where activation_key_hash is not null;

comment on column entitlements.activation_key_hash is
  'sha256(hex) of the canonical activation key ("HH1:<payload>"). Never the raw key. NULL when the right has no key. Server-only: see the privilege changes in this migration — Mission 013.';

-- ---------------------------------------------------------------------
-- B. THE HASH IS SERVER-ONLY — SEE 20260901190000_privilege_model.sql
-- ---------------------------------------------------------------------
--
-- An earlier version of this migration revoked SELECT on `entitlements`
-- from anon/authenticated and granted the non-secret columns back to
-- `authenticated`. Mission 013B's diagnostic of the real project made
-- that wrong on both halves:
--
--   * the revoke was too narrow. anon and authenticated also held
--     TRUNCATE, TRIGGER, REFERENCES and MAINTAIN — inherited, never
--     granted by HERITAGE — and TRUNCATE ignores row-level security
--     entirely;
--   * the grant was premature. Nothing reads `entitlements` as a client
--     role, so `entitlements_select_own` has no consumer and the column
--     allowlist protected a door nobody could reach.
--
-- The whole table privilege model therefore moved to
-- 20260901190000_privilege_model.sql, which revokes everything from
-- every application role on all seven tables and grants only what a
-- wired path needs. `authenticated` ends up with NO privilege on
-- `entitlements` at all, which protects activation_key_hash more
-- strongly than a column-level revoke ever did — and keeps protecting
-- any column added later.
--
-- Nothing about the hash's storage changes: still sha256 of a canonical
-- input carrying the format version, still never the raw key.

-- ---------------------------------------------------------------------
-- C. redeem_entitlement_with_activation_key()
-- ---------------------------------------------------------------------
--
-- Closes the one race Mission 013's security review refused to accept:
-- resolving a key to an entitlement id happens BEFORE any lock, so
-- without this a key that support had already replaced could still be
-- used to redeem, because redeem_entitlement() has no idea which key
-- brought the request.
--
-- This wrapper re-checks the key UNDER THE SAME ROW LOCK the redemption
-- itself takes, then delegates. It contains no business logic at all:
-- no available/redeemed/revoked, no ownership, no idempotence, no
-- memorial creation, no draft trigger, no offer/skin rule. Those live in
-- redeem_entitlement() (Mission 011A) and are simply called. The only
-- question this function answers is:
--
--     "is the key that got us here still the current key, now that the
--      right is locked?"
--
-- Linearisation, both orders:
--   activation wins  -> right becomes redeemed; a later replacement
--                       fails its own `status = 'available'` guard.
--   replacement wins -> its UPDATE held this row lock; the activation
--                       waits, re-reads the committed hash under READ
--                       COMMITTED, no longer matches, and refuses. No
--                       memorial, no state change.
--
-- SECURITY INVOKER for the same reason as Mission 011A: the caller is
-- the service role, which already carries BYPASSRLS and the DML grants,
-- so this function needs no ambient privilege — and holding none, it can
-- never become a privilege-escalation vector.

create or replace function redeem_entitlement_with_activation_key(
  p_entitlement_id    uuid,
  p_expected_key_hash text,
  p_owner_id          uuid,
  p_memorial_type     text,
  p_skin_id           text
)
returns table (memorial_id uuid, outcome text)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_current_hash text;
begin
  select e.activation_key_hash
    into v_current_hash
    from entitlements e
   where e.id = p_entitlement_id
     for update;

  if not found then
    raise exception 'entitlement_not_found' using errcode = 'HH404';
  end if;

  -- A right whose key was invalidated cannot be activated by any key,
  -- and a caller presenting nothing cannot be holding the current one.
  -- Both are the same refusal as a superseded key: never a NULL = NULL
  -- accident.
  if v_current_hash is null
     or p_expected_key_hash is null
     or v_current_hash <> p_expected_key_hash then
    raise exception 'activation_key_superseded' using errcode = 'HH410';
  end if;

  return query
    select * from redeem_entitlement(p_entitlement_id, p_owner_id, p_memorial_type, p_skin_id);
end;
$$;

comment on function redeem_entitlement_with_activation_key(uuid, text, uuid, text, text) is
  'Mission 013. Re-verifies, under the entitlement row lock, that the presented activation key is still the current one, then delegates entirely to redeem_entitlement(). Holds no business logic of its own. SECURITY INVOKER — server-side privileged caller only.';

revoke all on function redeem_entitlement_with_activation_key(uuid, text, uuid, text, text) from public;
grant execute on function redeem_entitlement_with_activation_key(uuid, text, uuid, text, text) to service_role;
