-- =====================================================================
-- HERITAGE HOMMAGE — QG 008, LOT 3 v4 — POSTFLIGHT (LECTURE SEULE)
-- =====================================================================
-- À exécuter APRÈS avoir appliqué
-- supabase/migrations/20261103090000_qg008_lot3_v4_publication_slug.sql.
-- Ne modifie RIEN, ne lit aucune donnée personnelle. Verdicts OK/ECHEC.
-- =====================================================================

select 'A. fonction' as bloc,
       'commit_memorial_publication_v4 : service_role seul, SECURITY DEFINER, search_path vide' as controle,
       'false|false|true|t|t' as attendu,
       has_function_privilege('anon', f, 'EXECUTE') || '|' || has_function_privilege('authenticated', f, 'EXECUTE') || '|'
       || has_function_privilege('service_role', f, 'EXECUTE') || '|'
       || coalesce((select prosecdef::text from pg_proc where oid = to_regprocedure(f)), '-') || '|'
       || coalesce((select (proconfig @> array['search_path=""'])::text from pg_proc where oid = to_regprocedure(f)), '-') as constate,
       case when to_regprocedure(f) is not null
                 and not has_function_privilege('anon', f, 'EXECUTE')
                 and not has_function_privilege('authenticated', f, 'EXECUTE')
                 and has_function_privilege('service_role', f, 'EXECUTE')
                 and (select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid = to_regprocedure(f))
            then 'OK' else 'ECHEC' end as verdict
from (values ('public.commit_memorial_publication_v4(uuid,uuid,bigint,text,text,text,text,text,jsonb,jsonb)')) as fns(f)

union all

select 'A. fonction', 'memorial_public_slug_v1 : aucun role client, immuable, search_path vide', 'false|false|false|i|t',
       has_function_privilege('anon', f, 'EXECUTE') || '|' || has_function_privilege('authenticated', f, 'EXECUTE') || '|'
       || has_function_privilege('service_role', f, 'EXECUTE') || '|'
       || coalesce((select provolatile::text from pg_proc where oid = to_regprocedure(f)), '-') || '|'
       || coalesce((select (proconfig @> array['search_path=""'])::text from pg_proc where oid = to_regprocedure(f)), '-'),
       case when to_regprocedure(f) is not null
                 and not has_function_privilege('anon', f, 'EXECUTE')
                 and not has_function_privilege('authenticated', f, 'EXECUTE')
                 and not has_function_privilege('service_role', f, 'EXECUTE')
                 and (select provolatile = 'i' and proconfig @> array['search_path=""'] from pg_proc where oid = to_regprocedure(f))
            then 'OK' else 'ECHEC' end
from (values ('public.memorial_public_slug_v1(uuid,integer)')) as fns(f)

union all

select 'A. fonction', 'v4 delegue a v3 et verrouille le memorial avant le slug', 'present|present',
       case when coalesce((select prosrc like '%public.commit_memorial_publication_v3(%' from pg_proc where oid = to_regprocedure('public.commit_memorial_publication_v4(uuid,uuid,bigint,text,text,text,text,text,jsonb,jsonb)')), false) then 'present' else 'absent' end
       || '|' ||
       case when coalesce((select prosrc like '%for update%' and prosrc like '%memorial_public_slug_v1%' from pg_proc where oid = to_regprocedure('public.commit_memorial_publication_v4(uuid,uuid,bigint,text,text,text,text,text,jsonb,jsonb)')), false) then 'present' else 'absent' end,
       case when coalesce((select prosrc like '%public.commit_memorial_publication_v3(%' and prosrc like '%for update%' and prosrc like '%memorial_public_slug_v1%' from pg_proc where oid = to_regprocedure('public.commit_memorial_publication_v4(uuid,uuid,bigint,text,text,text,text,text,jsonb,jsonb)')), false) then 'OK' else 'ECHEC' end

union all

select 'A. fonction', 'slug opaque deterministe (vecteur fixe)', '10d63bbb38ba',
       coalesce(public.memorial_public_slug_v1('00000000-0000-4000-8000-000000000000', 12), '-'),
       case when public.memorial_public_slug_v1('00000000-0000-4000-8000-000000000000', 12) = '10d63bbb38ba' then 'OK' else 'ECHEC' end

union all

select 'B. droits', 'aucun droit client d''ecriture sur memorials.slug ni memorials.status', 'aucun',
       case when has_column_privilege('authenticated', 'public.memorials', 'slug', 'UPDATE')
              or has_column_privilege('anon', 'public.memorials', 'slug', 'UPDATE')
              or has_column_privilege('authenticated', 'public.memorials', 'status', 'UPDATE')
              or has_column_privilege('anon', 'public.memorials', 'status', 'UPDATE')
            then 'droit present' else 'aucun' end,
       case when has_column_privilege('authenticated', 'public.memorials', 'slug', 'UPDATE')
              or has_column_privilege('anon', 'public.memorials', 'slug', 'UPDATE')
              or has_column_privilege('authenticated', 'public.memorials', 'status', 'UPDATE')
              or has_column_privilege('anon', 'public.memorials', 'status', 'UPDATE')
            then 'ECHEC' else 'OK' end

union all

select 'C. donnees', 'memoriaux publies sans slug (doit valoir 0)', '0',
       (select count(*)::text from public.memorials where status = 'published' and slug is null),
       case when (select count(*) from public.memorials where status = 'published' and slug is null) = 0 then 'OK' else 'ECHEC' end

order by 1, 2, 3;
