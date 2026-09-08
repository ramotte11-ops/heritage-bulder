-- V1 segmentation correction — QG/PO doctrine, superseding the
-- wedding-project-derived split Mission 006 originally shipped
-- (occidental/arabe/maghreb/indien/africain/juif).
--
-- New V1 segmentation, config/offers.ts + config/skins.ts:
--   occidental        -> intemporel
--   arabe / maghreb   -> musulman
--   indien            -> hindou
--   juif              -> juif (unchanged)
--   africain          -> retired from V1 (never exercised by any real
--                        row — no Etsy listing mapping, no seed, no
--                        fixture outside tests; see the audit that
--                        preceded this migration)
--
-- This migration touches EXACTLY the two CHECK constraints introduced
-- by 20260831160000_entitlement_offer_model.sql
-- (`entitlements_offer_id_check`, `memorials_skin_id_check`). That
-- migration is left untouched, as history — it correctly describes the
-- schema at the time it ran. No RLS, no GRANT, no function, no other
-- table is touched here.
--
-- SAFETY: the QG verified the real Supabase project read-only
-- immediately before this migration was authored —
-- `entitlements: 0 rows`, `memorials: 0 rows` — so there is no legacy
-- offer_id/skin_id data to convert. The guard below re-proves that at
-- migration time rather than trusting a point-in-time report: it
-- refuses to narrow either CHECK if any row still carries a pre-V1
-- value, so a stale verification (or a row inserted between the audit
-- and this migration actually running) fails loudly instead of being
-- silently locked out by the new constraint.

do $$
declare
  legacy_entitlements int;
  legacy_memorials int;
begin
  select count(*) into legacy_entitlements
    from entitlements
    where offer_id not in ('intemporel', 'musulman', 'juif', 'hindou');

  select count(*) into legacy_memorials
    from memorials
    where skin_id not in ('intemporel', 'musulman', 'juif', 'hindou');

  if legacy_entitlements > 0 or legacy_memorials > 0 then
    raise exception
      'V1 segmentation correction blocked: % entitlements and % memorials still carry a pre-V1 offer_id/skin_id (occidental/arabe/maghreb/indien/africain). Resolve or backfill those rows before narrowing the CHECK constraints — do not run this migration as-is against a project that still holds them.',
      legacy_entitlements, legacy_memorials;
  end if;
end $$;

alter table entitlements drop constraint if exists entitlements_offer_id_check;
alter table entitlements
  add constraint entitlements_offer_id_check
    check (offer_id in ('intemporel', 'musulman', 'juif', 'hindou'));

alter table memorials drop constraint if exists memorials_skin_id_check;
alter table memorials
  add constraint memorials_skin_id_check
    check (skin_id in ('intemporel', 'musulman', 'juif', 'hindou'));
