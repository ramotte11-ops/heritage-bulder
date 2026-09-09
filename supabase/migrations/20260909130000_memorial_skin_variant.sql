-- Mission 029B: light/dark skin variant foundation.
--
-- HERITAGE V1 keeps exactly the four skins Mission 006/029 already
-- defined (intemporel/musulman/juif/hindou). This migration adds a
-- SECOND, INDEPENDENT dimension — `skin_variant` — never a fifth
-- through eleventh skin id. `skin` still says which cultural identity a
-- memorial uses; `skin_variant` says whether that identity renders
-- light or dark. The pair determines the final ambiance
-- (AGENTS.md Mission 029B sections 1-4).
--
-- `skin_variant` is NOT `prefers-color-scheme`, a device or browser dark
-- mode, or anything derived from a visitor's own settings — it is a
-- HERITAGE artistic choice persisted on the Memorial, exactly like
-- `skin` itself (section 3/5). Nothing in this migration, and nothing
-- reachable from it, reads or writes anything OS/browser-related — it
-- is one text column on one table.
--
-- WHERE IT LIVES. On `memorials`, next to `skin_id`, and nowhere else:
-- not on `entitlements` (a right names an offer, never a skin — Mission
-- 006's doctrine, unchanged), not on `owners`, not on any Etsy mapping
-- table (there is none for skin/variant to begin with). Section 5's
-- doctrine, applied.
--
-- MIGRATION STRATEGY (QG doctrine, section 6) — in this exact order,
-- and audited to leave no permanent DEFAULT:
--
--   1. add the column, NULLABLE (no DEFAULT clause at all — nothing to
--      later "remove" because nothing is ever added);
--   2. backfill: any historical row is explicitly set to 'light', since
--      until this mission the light identity was the only one that ever
--      really existed in HERITAGE (there is no dark design yet — see
--      section 12);
--   3. add the CHECK constraint (`light` | `dark`);
--   4. set the column NOT NULL.
--
-- After this migration, any INSERT that omits `skin_variant` fails
-- outright (NOT NULL, no DEFAULT) — an application oversight can never
-- become a silent `light` at the database layer. The only place `light`
-- is ever chosen is the explicit, documented, TEMPORARY assignment in
-- lib/entitlement/redeem-authenticated-entitlement.ts
-- (`TEMPORARY_SKIN_VARIANT`), at the moment a memorial is actually
-- created — never here, never implicitly.
--
-- SAFETY: as with 20260908100000_v1_segmentation_correction.sql, no RLS
-- policy, no GRANT, no role, no other table is touched. The two
-- `redeem_entitlement*` functions are recreated (their signature grows
-- by one required parameter) so that every real INSERT path is forced
-- to supply `skin_variant` explicitly — see part B below.

-- ---------------------------------------------------------------------
-- A. THE COLUMN
-- ---------------------------------------------------------------------

alter table memorials add column skin_variant text;

-- Backfill BEFORE the CHECK/NOT NULL exist, so this UPDATE can never be
-- blocked by either. Idempotent (`where skin_variant is null`) so this
-- migration is safe to reason about even if it were ever re-run against
-- a database that already ran it (it would simply update zero rows the
-- second time).
update memorials set skin_variant = 'light' where skin_variant is null;

alter table memorials
  add constraint memorials_skin_variant_check
    check (skin_variant in ('light', 'dark'));

alter table memorials
  alter column skin_variant set not null;

comment on column memorials.skin_variant is
  'Mission 029B. The skin''s light/dark declination — independent from skin_id, never a device/browser preference. NOT NULL, no DEFAULT: every INSERT must supply it explicitly. Historical rows (there were none in the real project at migration time — reconfirm before applying) were backfilled to ''light''.';

-- ---------------------------------------------------------------------
-- B. redeem_entitlement() / redeem_entitlement_with_activation_key() —
--    widened to require p_skin_variant
-- ---------------------------------------------------------------------
--
-- Both functions are DROPped and recreated with an added, required
-- `p_skin_variant text` parameter — not `create or replace`, which
-- would only add a new overload and leave the old, variant-less
-- signature (and its grants) callable. Dropping first means there is
-- exactly one `redeem_entitlement` and one
-- `redeem_entitlement_with_activation_key` after this migration, and
-- neither can be called without a variant.
--
-- `redeem_entitlement_with_activation_key` calls `redeem_entitlement`
-- internally, so the dependent function is dropped first and the base
-- function is created before its dependent is recreated.
--
-- Neither function validates `p_skin_variant` beyond what the column's
-- own CHECK constraint already enforces (part A) — exactly the same
-- posture Mission 011A already takes for `p_skin_id` and
-- `p_memorial_type`: the structural constraint is the database's job,
-- product-level derivation is TypeScript's (see
-- lib/entitlement/redeem-authenticated-entitlement.ts). A bad value
-- raises a generic Postgres check_violation, which the adapter
-- (lib/adapters/supabase/entitlement-repository.ts) does not map to a
-- business outcome — it rejects loudly, exactly as an unrecognised
-- `p_skin_id` already does today, never a decided refusal a caller
-- could mistake for a normal answer.

drop function if exists redeem_entitlement_with_activation_key(uuid, text, uuid, text, text);
drop function if exists redeem_entitlement(uuid, uuid, text, text);

create function redeem_entitlement(
  p_entitlement_id uuid,
  p_owner_id       uuid,
  p_memorial_type  text,
  p_skin_id        text,
  p_skin_variant   text
)
returns table (memorial_id uuid, outcome text)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_status   text;
  v_owner_id uuid;
  v_memorial uuid;
begin
  select e.status, e.owner_id
    into v_status, v_owner_id
    from entitlements e
   where e.id = p_entitlement_id
     for update;

  if not found then
    raise exception 'entitlement_not_found' using errcode = 'HH404';
  end if;

  if v_status = 'redeemed' then
    if v_owner_id is distinct from p_owner_id then
      raise exception 'entitlement_owned_by_another_owner' using errcode = 'HH403';
    end if;

    select m.id into v_memorial
      from memorials m
     where m.entitlement_id = p_entitlement_id;

    if v_memorial is null then
      raise exception 'entitlement_redeemed_without_memorial' using errcode = 'HH500';
    end if;

    return query select v_memorial, 'already_redeemed'::text;
    return;
  end if;

  if v_status <> 'available' then
    raise exception 'entitlement_not_available:%', v_status using errcode = 'HH409';
  end if;

  update entitlements
     set status      = 'redeemed',
         owner_id    = p_owner_id,
         redeemed_at = now()
   where id = p_entitlement_id;

  -- Mission 029B: skin_variant is now supplied on every INSERT, exactly
  -- like memorial_type/skin_id above it — never left to a DEFAULT.
  -- editorial_context, language and slug stay absent: still genuinely
  -- deferred family choices, unaffected by this mission (section 14).
  insert into memorials (owner_id, entitlement_id, memorial_type, skin_id, skin_variant)
  values (p_owner_id, p_entitlement_id, p_memorial_type, p_skin_id, p_skin_variant)
  returning id into v_memorial;

  return query select v_memorial, 'redeemed'::text;
end;
$$;

comment on function redeem_entitlement(uuid, uuid, text, text, text) is
  'Mission 011A, widened by Mission 029B with a required p_skin_variant. Atomically consumes an available entitlement and creates its one memorial, or returns the existing one when the same owner retries. Integrity envelope only: receives memorial_type/skin_id/skin_variant already decided by the TypeScript domain, knows nothing about offers, skins, variants or sales channels. SECURITY INVOKER — server-side privileged caller only.';

revoke all on function redeem_entitlement(uuid, uuid, text, text, text) from public;
grant execute on function redeem_entitlement(uuid, uuid, text, text, text) to service_role;

create function redeem_entitlement_with_activation_key(
  p_entitlement_id    uuid,
  p_expected_key_hash text,
  p_owner_id          uuid,
  p_memorial_type     text,
  p_skin_id           text,
  p_skin_variant      text
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

  if v_current_hash is null
     or p_expected_key_hash is null
     or v_current_hash <> p_expected_key_hash then
    raise exception 'activation_key_superseded' using errcode = 'HH410';
  end if;

  return query
    select * from redeem_entitlement(p_entitlement_id, p_owner_id, p_memorial_type, p_skin_id, p_skin_variant);
end;
$$;

comment on function redeem_entitlement_with_activation_key(uuid, text, uuid, text, text, text) is
  'Mission 013, widened by Mission 029B with a required p_skin_variant. Re-verifies, under the entitlement row lock, that the presented activation key is still the current one, then delegates entirely to redeem_entitlement(). Holds no business logic of its own. SECURITY INVOKER — server-side privileged caller only.';

revoke all on function redeem_entitlement_with_activation_key(uuid, text, uuid, text, text, text) from public;
grant execute on function redeem_entitlement_with_activation_key(uuid, text, uuid, text, text, text) to service_role;
