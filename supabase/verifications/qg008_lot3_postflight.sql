-- =====================================================================
-- HERITAGE HOMMAGE — QG 008, LOT 3 — POSTFLIGHT (LECTURE SEULE)
-- =====================================================================
-- À exécuter APRÈS avoir appliqué
-- supabase/migrations/20261102090000_qg008_lot3_publication_from_preview.sql
-- puis 20261102100000_qg008_lot3_v3_publication_identity.sql.
-- Ne modifie RIEN, ne lit aucune donnée personnelle. Verdicts OK/ECHEC.
-- =====================================================================

select 'A. fonction' as bloc,
       f || ' : service_role seul, SECURITY DEFINER, search_path vide' as controle,
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
from (values ('public.commit_memorial_publication_v3(uuid,uuid,bigint,text,text,text,text,text,jsonb,jsonb)'),
             ('public.commit_memorial_publication_v2(uuid,uuid,bigint,text,timestamptz,text,text,text,text,text,jsonb,jsonb)')) as fns(f)

union all

select 'A. fonction', 'v3 exige la photo principale (HD422) et appelle v2', 'present|present',
       case when coalesce((select prosrc like '%HD422%' from pg_proc where oid = to_regprocedure('public.commit_memorial_publication_v3(uuid,uuid,bigint,text,text,text,text,text,jsonb,jsonb)')), false) then 'present' else 'absent' end
       || '|' ||
       case when coalesce((select prosrc like '%public.commit_memorial_publication_v2(%' from pg_proc where oid = to_regprocedure('public.commit_memorial_publication_v3(uuid,uuid,bigint,text,text,text,text,text,jsonb,jsonb)')), false) then 'present' else 'absent' end,
       case when coalesce((select prosrc like '%HD422%' and prosrc like '%public.commit_memorial_publication_v2(%' from pg_proc where oid = to_regprocedure('public.commit_memorial_publication_v3(uuid,uuid,bigint,text,text,text,text,text,jsonb,jsonb)')), false)
            then 'OK' else 'ECHEC' end

union all

select 'B. droits', 'aucun droit client sur la colonne status de memorials', 'aucun',
       case when has_column_privilege('authenticated', 'public.memorials', 'status', 'UPDATE')
              or has_column_privilege('anon', 'public.memorials', 'status', 'UPDATE')
            then 'droit present' else 'aucun' end,
       case when has_column_privilege('authenticated', 'public.memorials', 'status', 'UPDATE')
              or has_column_privilege('anon', 'public.memorials', 'status', 'UPDATE')
            then 'ECHEC' else 'OK' end

union all

select 'C. identite', 'second appel : langue, skin, variante et slug compares (20261102100000)', 'present',
       case when coalesce((select prosrc like '%v_memorial.language is not distinct from p_expected_language%'
                         and prosrc like '%v_memorial.skin_id is not distinct from p_expected_skin%'
                         and prosrc like '%v_memorial.skin_variant is not distinct from p_expected_skin_variant%'
                         and prosrc like '%v_memorial.slug is not distinct from p_expected_slug%'
                    from pg_proc where oid = to_regprocedure('public.commit_memorial_publication_v3(uuid,uuid,bigint,text,text,text,text,text,jsonb,jsonb)')), false) then 'present' else 'absent' end,
       case when coalesce((select prosrc like '%v_memorial.language is not distinct from p_expected_language%'
                         and prosrc like '%v_memorial.skin_id is not distinct from p_expected_skin%'
                         and prosrc like '%v_memorial.skin_variant is not distinct from p_expected_skin_variant%'
                         and prosrc like '%v_memorial.slug is not distinct from p_expected_slug%'
                    from pg_proc where oid = to_regprocedure('public.commit_memorial_publication_v3(uuid,uuid,bigint,text,text,text,text,text,jsonb,jsonb)')), false) then 'OK' else 'ECHEC' end

order by 1, 2, 3;
