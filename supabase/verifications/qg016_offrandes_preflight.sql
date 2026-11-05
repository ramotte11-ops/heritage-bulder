-- =====================================================================
-- HERITAGE HOMMAGE — QG 016 / Offrandes publiques — PRÉFLIGHT (LECTURE SEULE)
-- =====================================================================
-- À exécuter AVANT d'appliquer
-- supabase/migrations/20261105090000_qg016_offerings_open_at_publication.sql.
-- Ne modifie RIEN, ne lit aucune donnée personnelle (seulement des
-- comptages). Un seul ECHEC = ne pas appliquer.
-- =====================================================================

select '1. prerequis' as bloc,
       'fonction ' || f || ' presente' as controle,
       'presente' as attendu,
       case when to_regprocedure(f) is null then 'absente' else 'presente' end as constate,
       case when to_regprocedure(f) is null then 'ECHEC — prerequis absent (' || m || ')' else 'OK' end as verdict
from (values ('public.record_symbolic_offering_v1(text,text,uuid)', 'Offrandes C1 et Lot 1 V8'),
             ('public.memorial_publicly_visible_v1(uuid,timestamptz)', 'Lot 1 V8, 20261031120000'),
             ('public.commit_memorial_publication_v4(uuid,uuid,bigint,text,text,text,text,text,jsonb,jsonb)', 'V4, 20261103090000')) as fns(f, m)

union all

select '1. prerequis', 'plafonds de depot presents (une ligne de reglages)', '1',
       (select count(*)::text from public.symbolic_offering_settings),
       case when (select count(*) from public.symbolic_offering_settings) = 1 then 'OK' else 'ECHEC — reglages absents' end

union all

select '2. non appliquee', 'declencheur memorial_published_snapshots_open_offerings absent', 'absent',
       case when exists (select 1 from pg_trigger where tgname = 'memorial_published_snapshots_open_offerings' and not tgisinternal) then 'present' else 'absent' end,
       case when exists (select 1 from pg_trigger where tgname = 'memorial_published_snapshots_open_offerings' and not tgisinternal) then 'ECHEC — migration semble deja appliquee' else 'OK' end

union all

select '2. non appliquee', 'table d''eligibilite vide (aucune ouverture ni suspension anterieure)', '0',
       (select count(*)::text from public.symbolic_offering_eligibility),
       case when (select count(*) from public.symbolic_offering_eligibility) = 0 then 'OK' else 'ECHEC — lignes existantes : examiner avant d''appliquer' end

union all

select '3. information', 'memoriaux qui seront rattrapes (publies, Intemporel, instantane, visibles)', 'S1 et S2 sur TEST',
       (select count(*)::text
          from public.memorials m join public.memorial_published_snapshots s on s.memorial_id = m.id
         where m.status = 'published' and m.skin_id = 'intemporel' and public.memorial_publicly_visible_v1(m.id, now())),
       'OK'

union all

select '3. information', 'gestes deja enregistres (conserves tels quels)', '0 sur TEST',
       (select count(*)::text from public.symbolic_offerings),
       'OK'

order by 1, 2, 3;
