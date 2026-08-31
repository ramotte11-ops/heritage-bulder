-- Mission 006: Entitlement -> Offer model.
--
-- Offer -> MemorialType + AllowedSkins is pure application configuration
-- (config/offers.ts), never a database table — the same reasoning
-- already applied to Skin/MemorialType/Language (see this file's own
-- comments in earlier migrations). An entitlement now records WHICH
-- OFFER was purchased (offer_id); the skin actually used lives
-- exclusively on memorials.skin_id, validated at Memorial
-- creation/update time against OFFERS[offer_id].allowedSkins in
-- application code (lib/entitlement/offer-skin.ts), never in SQL — see
-- this mission's report for the full rationale, in particular why
-- entitlements.skin_id does not survive this model: it assumed the skin
-- was always resolved by the time the entitlement exists, an assumption
-- HERITAGE explicitly does not want to lock in (a future offer may let
-- the customer choose their skin after purchase, e.g. at activation).
--
-- SAFETY: this migration assumes entitlements currently holds either
-- zero rows or only rows whose skin_id can be discarded without loss —
-- see this mission's report for the exact verification query to run
-- against the real Supabase project BEFORE applying this migration
-- there. `alter column offer_id set not null` fails loudly (refuses to
-- apply) if any existing row would be left with a null offer_id — it
-- does not silently guess a default. If that happens, STOP and decide
-- the backfill with real data in hand rather than running this as-is.
-- No RLS/policy change: existing entitlements policies reference
-- neither skin_id nor offer_id, only owner_id.

alter table entitlements add column offer_id text;

alter table entitlements
  alter column offer_id set not null,
  add constraint entitlements_offer_id_check
    check (offer_id in ('occidental', 'arabe', 'africain', 'indien', 'juif'));

-- The skin actually used is Memorial's responsibility alone (see above)
-- — dropping this column is the point of this migration, not a side
-- effect. Confirm the constraint name below still matches
-- `\d entitlements` before applying remotely (Postgres's default name
-- for an unnamed inline column CHECK); this migration was authored and
-- tested only against a freshly-initialized local cluster where that
-- name is guaranteed.
alter table entitlements drop constraint if exists entitlements_skin_id_check;
alter table entitlements drop column skin_id;

-- Mission 006's product decision: 5 skins for V1 (one per cultural
-- offer today; config/offers.ts's allowedSkins may grow per offer
-- without ever requiring a further migration to this same constraint
-- shape — only its value list changes, additively, the day a literally
-- new skin id is introduced). Additive: widens what's accepted, changes
-- no existing row. Same caveat on the constraint name as above.
alter table memorials drop constraint if exists memorials_skin_id_check;
alter table memorials
  add constraint memorials_skin_id_check
    check (skin_id in ('intemporel', 'maghreb', 'africain', 'indien', 'juif'));
