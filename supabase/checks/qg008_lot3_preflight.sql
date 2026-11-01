-- =====================================================================
-- HERITAGE HOMMAGE — QG 008, LOT 3 — PRÉFLIGHT (LECTURE SEULE)
-- =====================================================================
-- À exécuter AVANT d'appliquer
-- supabase/migrations/20261102090000_qg008_lot3_publication_from_preview.sql.
-- Ne modifie RIEN, ne lit aucune donnée personnelle. Un seul ECHEC = ne
-- pas appliquer.
-- =====================================================================

select '1. prerequis' as bloc,
       'fonction ' || f || ' presente' as controle,
       'presente' as attendu,
       case when to_regprocedure(f) is null then 'absente' else 'presente' end as constate,
       case when to_regprocedure(f) is null then 'ECHEC — appliquer d''abord ' || m else 'OK' end as verdict
from (values ('public.commit_memorial_publication_v2(uuid,uuid,bigint,text,timestamptz,text,text,text,text,text,jsonb,jsonb)', 'le Lot 1 (V8)'),
             ('public.begin_guest_draft_transfer_v1(uuid,text,bigint,text,text)', 'le Lot 2')) as fns(f, m)

union all

select '1. prerequis', 'trigger de copie avis (rubriques, 6 photos) present', 'present',
       case when exists (select 1 from pg_trigger where tgname = 'memorial_published_snapshots_guard_avis' and not tgisinternal) then 'present' else 'absent' end,
       case when exists (select 1 from pg_trigger where tgname = 'memorial_published_snapshots_guard_avis' and not tgisinternal) then 'OK' else 'ECHEC — V8 requis' end

union all

select '1. prerequis', 'aucun droit client sur la colonne status de memorials', 'aucun',
       case when has_column_privilege('authenticated', 'public.memorials', 'status', 'UPDATE')
              or has_column_privilege('anon', 'public.memorials', 'status', 'UPDATE')
            then 'droit present' else 'aucun' end,
       case when has_column_privilege('authenticated', 'public.memorials', 'status', 'UPDATE')
              or has_column_privilege('anon', 'public.memorials', 'status', 'UPDATE')
            then 'ECHEC' else 'OK' end

union all

select '2. non appliquee', 'fonction commit_memorial_publication_v3 absente', 'absente',
       case when to_regprocedure('public.commit_memorial_publication_v3(uuid,uuid,bigint,text,text,text,text,text,jsonb,jsonb)') is null then 'absente' else 'presente' end,
       case when to_regprocedure('public.commit_memorial_publication_v3(uuid,uuid,bigint,text,text,text,text,text,jsonb,jsonb)') is null then 'OK' else 'ECHEC — Lot 3 semble deja applique' end

order by 1, 2, 3;
