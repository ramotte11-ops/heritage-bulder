-- =====================================================================
-- HERITAGE HOMMAGE — QG 008, LOT 2 — PRÉFLIGHT (LECTURE SEULE)
-- =====================================================================
-- À exécuter AVANT d'appliquer
-- supabase/migrations/20261101090000_qg008_lot2_guest_draft_transfer.sql.
-- Ne modifie RIEN, ne lit aucune donnée personnelle. Un seul ECHEC = ne
-- pas appliquer.
-- =====================================================================

select '1. prerequis Lot 1' as bloc,
       'fonction ' || f || ' presente' as controle,
       'presente' as attendu,
       case when to_regprocedure(f) is null then 'absente' else 'presente' end as constate,
       case when to_regprocedure(f) is null then 'ECHEC — appliquer d''abord le Lot 1' else 'OK' end as verdict
from (values ('public.create_free_memorial_v1(uuid,text,text)'),
             ('public.anchor_free_memorial_v1(uuid,uuid)'),
             ('public.free_window_status_v1(uuid,timestamptz)')) as fns(f)

union all

select '1. prerequis Lot 1', 'ancrage sans publication gratuite disponible (correction QG)', 'present',
       case when coalesce((select prosrc like '%anchored_without_free_publication%' from pg_proc
                            where oid = to_regprocedure('public.anchor_free_memorial_v1(uuid,uuid)')), false)
            then 'present' else 'absent' end,
       case when coalesce((select prosrc like '%anchored_without_free_publication%' from pg_proc
                            where oid = to_regprocedure('public.anchor_free_memorial_v1(uuid,uuid)')), false)
            then 'OK' else 'ECHEC — Lot 1 corrige requis' end

union all

select '2. non appliquee', 'table guest_draft_transfers absente', 'absente',
       case when to_regclass('public.guest_draft_transfers') is null then 'absente' else 'presente' end,
       case when to_regclass('public.guest_draft_transfers') is null then 'OK' else 'ECHEC — Lot 2 semble deja applique' end

order by 1, 2, 3;
