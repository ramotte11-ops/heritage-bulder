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
-- B. THE HASH IS SERVER-ONLY, BY PRIVILEGE
-- ---------------------------------------------------------------------
--
-- entitlements_select_own is a ROW-level policy, so it would happily let
-- an authenticated owner read this column on their own row. Verified
-- during Mission 013's audit against a real cluster.
--
-- Also verified there: `REVOKE SELECT (activation_key_hash)` ALONE DOES
-- NOTHING while the role still holds table-wide SELECT — in PostgreSQL a
-- table-level grant covers every column and a column-level revoke cannot
-- subtract from it. The table grant has to go first, then the legitimate
-- columns are granted back explicitly.
--
-- This is a restriction, never a relaxation: no policy is created,
-- dropped or modified, and entitlements_select_own is untouched. A
-- pleasant side effect is that the column list is now the allowlist —
-- any column added to this table in future is invisible to client roles
-- until someone deliberately grants it.
--
-- Consequence to know: `select *` on entitlements now fails for client
-- roles (PostgREST's default), so a future owner-facing read must name
-- its columns. Nothing reads this table as anon/authenticated today.
--
-- REVOKE ALL, not just SELECT — defence in depth for the writes too.
-- Supabase's default privileges hand anon and authenticated INSERT,
-- UPDATE and DELETE on every public-schema table, entitlements
-- included. Measured on a cluster built from these migrations:
-- has_column_privilege('authenticated', 'entitlements',
-- 'activation_key_hash', 'UPDATE') was TRUE, and a client INSERT failed
-- with "row-level security policy" rather than "permission denied" —
-- i.e. the ONLY thing standing between a browser and rewriting a
-- commercial right was the absence of a policy.
--
-- That is one accidental `create policy` away from being a hole. An
-- entitlement is a purchase record: no browser has any business
-- inserting, updating or deleting one, ever. After this, adding a
-- policy by mistake grants nothing on its own — an explicit GRANT would
-- also be required, which is a far more deliberate act.
--
-- PUBLIC is named explicitly. It holds nothing today (verified: no
-- grantee-0 entry in relacl and no column grants), and this migration
-- must not quietly depend on that staying true.
--
-- service_role is deliberately absent from the revoke: it is the
-- redemption engine and needs its access intact.

revoke all privileges on entitlements from public, anon, authenticated;

grant select (
  id, source, external_order_id, offer_id, status,
  owner_id, created_at, redeemed_at, updated_at
) on entitlements to authenticated;

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
