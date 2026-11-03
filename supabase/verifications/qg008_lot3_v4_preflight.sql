-- =====================================================================
-- HERITAGE HOMMAGE — QG 008, LOT 3 v4 — PRÉFLIGHT (LECTURE SEULE)
-- =====================================================================
-- À exécuter AVANT d'appliquer
-- supabase/migrations/20261103090000_qg008_lot3_v4_publication_slug.sql.
-- Ne modifie RIEN, ne lit aucune donnée personnelle (seulement des
-- comptages de slugs). Un seul ECHEC = ne pas appliquer.
-- =====================================================================

select '1. prerequis' as bloc,
       'fonction ' || f || ' presente' as controle,
       'presente' as attendu,
       case when to_regprocedure(f) is null then 'absente' else 'presente' end as constate,
       case when to_regprocedure(f) is null then 'ECHEC — appliquer d''abord ' || m else 'OK' end as verdict
from (values ('public.commit_memorial_publication_v3(uuid,uuid,bigint,text,text,text,text,text,jsonb,jsonb)', 'le Lot 3 (20261102090000 puis 20261102100000)'),
             ('public.commit_memorial_publication_v2(uuid,uuid,bigint,text,timestamptz,text,text,text,text,text,jsonb,jsonb)', 'le Lot 1 (V8)')) as fns(f, m)

union all

select '1. prerequis', 'v3 corrigee (identite du second appel, 20261102100000)', 'present',
       case when coalesce((select prosrc like '%v_memorial.slug is not distinct from p_expected_slug%' from pg_proc where oid = to_regprocedure('public.commit_memorial_publication_v3(uuid,uuid,bigint,text,text,text,text,text,jsonb,jsonb)')), false) then 'present' else 'absent' end,
       case when coalesce((select prosrc like '%v_memorial.slug is not distinct from p_expected_slug%' from pg_proc where oid = to_regprocedure('public.commit_memorial_publication_v3(uuid,uuid,bigint,text,text,text,text,text,jsonb,jsonb)')), false) then 'OK' else 'ECHEC — 20261102100000 requise' end

union all

select '1. prerequis', 'memorials.slug nullable et unique (NULLS DISTINCT)', 'nullable|unique',
       (select case when is_nullable = 'YES' then 'nullable' else 'not null' end from information_schema.columns where table_schema = 'public' and table_name = 'memorials' and column_name = 'slug')
       || '|' ||
       case when exists (select 1 from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
                         where i.indrelid = 'public.memorials'::regclass and i.indisunique and i.indnatts = 1 and a.attname = 'slug')
            then 'unique' else 'non unique' end,
       case when (select is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'memorials' and column_name = 'slug') = 'YES'
                 and exists (select 1 from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
                             where i.indrelid = 'public.memorials'::regclass and i.indisunique and i.indnatts = 1 and a.attname = 'slug')
            then 'OK' else 'ECHEC' end

union all

select '1. prerequis', 'aucun droit client d''ecriture sur memorials.slug', 'aucun',
       case when has_column_privilege('authenticated', 'public.memorials', 'slug', 'UPDATE')
              or has_column_privilege('anon', 'public.memorials', 'slug', 'UPDATE')
            then 'droit present' else 'aucun' end,
       case when has_column_privilege('authenticated', 'public.memorials', 'slug', 'UPDATE')
              or has_column_privilege('anon', 'public.memorials', 'slug', 'UPDATE')
            then 'ECHEC' else 'OK' end

union all

select '1. prerequis', 'SHA-256 disponible (pg_catalog.sha256)', 'present',
       case when to_regprocedure('pg_catalog.sha256(bytea)') is null then 'absent' else 'present' end,
       case when to_regprocedure('pg_catalog.sha256(bytea)') is null then 'ECHEC' else 'OK' end

union all

select '2. non appliquee', 'fonction commit_memorial_publication_v4 absente', 'absente',
       case when to_regprocedure('public.commit_memorial_publication_v4(uuid,uuid,bigint,text,text,text,text,text,jsonb,jsonb)') is null then 'absente' else 'presente' end,
       case when to_regprocedure('public.commit_memorial_publication_v4(uuid,uuid,bigint,text,text,text,text,text,jsonb,jsonb)') is null then 'OK' else 'ECHEC — v4 semble deja appliquee' end

union all

select '3. information', 'memoriaux publies sans slug (doit valoir 0)', '0',
       (select count(*)::text from public.memorials where status = 'published' and slug is null),
       case when (select count(*) from public.memorials where status = 'published' and slug is null) = 0 then 'OK' else 'ECHEC — publie sans slug' end

order by 1, 2, 3;
