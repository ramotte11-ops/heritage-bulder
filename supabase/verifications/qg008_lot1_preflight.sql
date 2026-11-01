-- =====================================================================
-- HERITAGE HOMMAGE — QG 008, LOT 1 — PRÉFLIGHT (LECTURE SEULE)
-- =====================================================================
--
-- À exécuter AVANT d'appliquer
-- supabase/migrations/20261031120000_qg008_free_offer_v8_alignment.sql.
--
-- Ne modifie RIEN. Ne lit aucune donnée personnelle : uniquement des
-- catalogues et des comptes. UN SEUL tableau ; verdicts OK, INFO ou
-- ECHEC. Un seul ECHEC = ne pas appliquer.
--
-- Établit :
--   1. que les trois migrations M1-A sont appliquées (prérequis) ;
--   2. que QG 008 ne l'est pas encore ;
--   3. la photographie « avant » des avis existants (INFO), à comparer
--      avec le postflight.
-- =====================================================================

select '1. prerequis M1-A' as bloc,
       'entitlements.access_level NOT NULL (correctif 2)' as controle,
       'true' as attendu,
       coalesce((select attnotnull::text from pg_attribute
                  where attrelid = 'public.entitlements'::regclass
                    and attname = 'access_level' and not attisdropped), 'absente') as constate,
       case when coalesce((select attnotnull from pg_attribute
                            where attrelid = 'public.entitlements'::regclass
                              and attname = 'access_level' and not attisdropped), false)
            then 'OK' else 'ECHEC — appliquer d''abord les migrations M1-A' end as verdict

union all

select '1. prerequis M1-A', 'fonction ' || f || ' presente', 'presente',
       case when to_regprocedure(f) is null then 'absente' else 'presente' end,
       case when to_regprocedure(f) is null then 'ECHEC — M1-A incomplete' else 'OK' end
from (values ('public.free_access_window_v1(uuid,timestamptz)'),
             ('public.create_free_memorial_v1(uuid,text,text)'),
             ('public.anchor_free_memorial_v1(uuid,uuid)'),
             ('public.guard_free_draft_gallery_v1()'),
             ('public.commit_memorial_publication_v1(uuid,uuid,bigint,text,timestamptz,text,text,text,text,jsonb)'),
             ('public.record_symbolic_offering_v1(text,text,uuid)')) as fns(f)

union all

select '2. non appliquee', 'colonne memorial_access_settings.free_window_cycle absente', 'absente',
       case when exists (select 1 from pg_attribute
                          where attrelid = 'public.memorial_access_settings'::regclass
                            and attname = 'free_window_cycle' and not attisdropped)
            then 'presente' else 'absente' end,
       case when exists (select 1 from pg_attribute
                          where attrelid = 'public.memorial_access_settings'::regclass
                            and attname = 'free_window_cycle' and not attisdropped)
            then 'ECHEC — QG 008 semble deja appliquee' else 'OK' end

union all

select '2. non appliquee', 'table free_publication_waivers absente', 'absente',
       case when to_regclass('public.free_publication_waivers') is null then 'absente' else 'presente' end,
       case when to_regclass('public.free_publication_waivers') is null then 'OK' else 'ECHEC — QG 008 semble deja appliquee' end

union all

select '2. non appliquee', 'fonction commit_memorial_publication_v2 absente', 'absente',
       case when to_regproc('public.commit_memorial_publication_v2') is null then 'absente' else 'presente' end,
       case when to_regproc('public.commit_memorial_publication_v2') is null then 'OK' else 'ECHEC — QG 008 semble deja appliquee' end

union all

select '3. photographie avant', 'brouillons avis (non publies, non archives)', 'INFO',
       (select count(*)::text from public.memorials
         where access_level = 'avis' and first_published_at is null and status <> 'archived'),
       'INFO'

union all

select '3. photographie avant', 'brouillons avis dont la galerie depasse 6 photos', 'INFO',
       (select count(*)::text from public.memorial_drafts d join public.memorials m on m.id = d.memorial_id
         where m.access_level = 'avis'
           and jsonb_typeof(d.content #> '{gallery,items}') = 'array'
           and jsonb_array_length(d.content #> '{gallery,items}') > 6),
       'INFO'

union all

select '3. photographie avant', 'avis publies', 'INFO',
       (select count(*)::text from public.memorials where access_level = 'avis' and first_published_at is not null),
       'INFO'

union all

-- Une copie publiée d'avis non conforme aux règles V8 ne serait pas
-- refusée rétroactivement (le garde-fou ne vérifie que les écritures),
-- mais doit être connue avant d'appliquer.
select '3. photographie avant', 'copies publiees d''avis hors regles V8 (rubriques ou > 6 photos)', '0',
       (select count(*)::text from public.memorial_published_snapshots s join public.memorials m on m.id = s.memorial_id
         where m.access_level = 'avis'
           and (exists (select 1 from jsonb_object_keys(s.content) k
                         where k <> all (array['hero','deathNotice','ceremony','traditions','personWords',
                                               'lovedThings','legacy','gallery','guidedFlow','presentation']))
                or (jsonb_typeof(s.content #> '{gallery,items}') = 'array'
                    and jsonb_array_length(s.content #> '{gallery,items}') > 6))),
       case when (select count(*) from public.memorial_published_snapshots s join public.memorials m on m.id = s.memorial_id
                   where m.access_level = 'avis'
                     and (exists (select 1 from jsonb_object_keys(s.content) k
                                   where k <> all (array['hero','deathNotice','ceremony','traditions','personWords',
                                                         'lovedThings','legacy','gallery','guidedFlow','presentation']))
                          or (jsonb_typeof(s.content #> '{gallery,items}') = 'array'
                              and jsonb_array_length(s.content #> '{gallery,items}') > 6))) = 0
            then 'OK' else 'ECHEC — arbitrage QG avant application' end

union all

select '3. photographie avant', 'messages existants', 'INFO',
       (select count(*)::text from public.messages), 'INFO'

order by 1, 2, 3;
