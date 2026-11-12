-- =====================================================================
-- HERITAGE HOMMAGE — QG 016 / M1 — PRÉFLIGHT (LECTURE SEULE)
-- =====================================================================
-- À exécuter AVANT d'appliquer
-- supabase/migrations/20261104090000_qg016_m1_read_public_memorial.sql.
-- Ne modifie RIEN, ne lit aucune donnée personnelle (seulement des
-- comptages). Un seul ECHEC = ne pas appliquer.
-- =====================================================================

select '1. prerequis' as bloc,
       'fonction ' || f || ' presente' as controle,
       'presente' as attendu,
       case when to_regprocedure(f) is null then 'absente' else 'presente' end as constate,
       case when to_regprocedure(f) is null then 'ECHEC — appliquer d''abord ' || m else 'OK' end as verdict
from (values ('public.memorial_publicly_visible_v1(uuid,timestamptz)', 'le Lot 1 (V8, 20261031120000)'),
             ('public.commit_memorial_publication_v4(uuid,uuid,bigint,text,text,text,text,text,jsonb,jsonb)', 'V4 (20261103090000)')) as fns(f, m)

union all

select '1. prerequis', 'colonnes lues presentes (memorials, snapshots, media)', '17',
       (select count(*)::text from information_schema.columns
         where table_schema = 'public'
           and ((table_name = 'memorials' and column_name in ('id', 'slug', 'skin_id', 'skin_variant', 'language', 'access_level', 'first_published_at', 'status'))
             or (table_name = 'memorial_published_snapshots' and column_name in ('memorial_id', 'content', 'published_at'))
             or (table_name = 'media' and column_name in ('id', 'memorial_id', 'purpose', 'status', 'storage_path', 'width'))))
       ,
       case when (select count(*) from information_schema.columns
                   where table_schema = 'public'
                     and ((table_name = 'memorials' and column_name in ('id', 'slug', 'skin_id', 'skin_variant', 'language', 'access_level', 'first_published_at', 'status'))
                       or (table_name = 'memorial_published_snapshots' and column_name in ('memorial_id', 'content', 'published_at'))
                       or (table_name = 'media' and column_name in ('id', 'memorial_id', 'purpose', 'status', 'storage_path', 'width')))) = 17
            then 'OK' else 'ECHEC' end

union all

select '1. prerequis', 'instantanes publies illisibles par les roles (013C)', 'false|false|false',
       has_table_privilege('anon', 'public.memorial_published_snapshots', 'SELECT') || '|'
       || has_table_privilege('authenticated', 'public.memorial_published_snapshots', 'SELECT') || '|'
       || has_table_privilege('service_role', 'public.memorial_published_snapshots', 'SELECT'),
       case when not has_table_privilege('anon', 'public.memorial_published_snapshots', 'SELECT')
                 and not has_table_privilege('authenticated', 'public.memorial_published_snapshots', 'SELECT')
                 and not has_table_privilege('service_role', 'public.memorial_published_snapshots', 'SELECT')
            then 'OK' else 'ECHEC — privileges differents de 013C' end

union all

select '2. non appliquee', 'fonction read_public_memorial_v1 absente', 'absente',
       case when to_regprocedure('public.read_public_memorial_v1(text)') is null then 'absente' else 'presente' end,
       case when to_regprocedure('public.read_public_memorial_v1(text)') is null then 'OK' else 'ECHEC — M1 semble deja appliquee' end

union all

select '3. information', 'memoriaux publies sans slug (doit valoir 0)', '0',
       (select count(*)::text from public.memorials where status = 'published' and slug is null),
       case when (select count(*) from public.memorials where status = 'published' and slug is null) = 0 then 'OK' else 'ECHEC — publie sans slug' end

order by 1, 2, 3;
