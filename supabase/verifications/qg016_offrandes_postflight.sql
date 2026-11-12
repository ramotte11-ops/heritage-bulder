-- =====================================================================
-- HERITAGE HOMMAGE — QG 016 / Offrandes publiques — POSTFLIGHT (LECTURE SEULE)
-- =====================================================================
-- À exécuter APRÈS
-- supabase/migrations/20261105090000_qg016_offerings_open_at_publication.sql.
-- Ne modifie RIEN, aucune donnée personnelle. Attendu : aucun ECHEC.
-- =====================================================================

select '1. declencheur' as bloc,
       'declencheur AFTER INSERT present et actif sur memorial_published_snapshots' as controle,
       'present|O' as attendu,
       coalesce((select 'present|' || tgenabled::text from pg_trigger
                  where tgname = 'memorial_published_snapshots_open_offerings'
                    and tgrelid = 'public.memorial_published_snapshots'::regclass and not tgisinternal), 'absent') as constate,
       case when exists (select 1 from pg_trigger
                          where tgname = 'memorial_published_snapshots_open_offerings'
                            and tgrelid = 'public.memorial_published_snapshots'::regclass
                            and not tgisinternal and tgenabled = 'O'
                            and (tgtype & 1) = 1      -- FOR EACH ROW
                            and (tgtype & 4) = 4      -- INSERT
                            and (tgtype & 2) = 0)     -- AFTER
            then 'OK' else 'ECHEC' end as verdict

union all

select '1. declencheur', 'fonction SECURITY DEFINER, search_path vide', 'true|true',
       (select prosecdef || '|' || (proconfig @> array['search_path=""']) from pg_proc
         where oid = to_regprocedure('public.open_symbolic_offerings_on_publication_v1()')),
       case when (select prosecdef and proconfig @> array['search_path=""'] from pg_proc
                   where oid = to_regprocedure('public.open_symbolic_offerings_on_publication_v1()')) then 'OK' else 'ECHEC' end

union all

select '1. declencheur', 'fonction du declencheur executable par aucun role client', 'false|false|false',
       has_function_privilege('anon', 'public.open_symbolic_offerings_on_publication_v1()', 'EXECUTE') || '|'
       || has_function_privilege('authenticated', 'public.open_symbolic_offerings_on_publication_v1()', 'EXECUTE') || '|'
       || has_function_privilege('service_role', 'public.open_symbolic_offerings_on_publication_v1()', 'EXECUTE'),
       case when not has_function_privilege('anon', 'public.open_symbolic_offerings_on_publication_v1()', 'EXECUTE')
                 and not has_function_privilege('authenticated', 'public.open_symbolic_offerings_on_publication_v1()', 'EXECUTE')
                 and not has_function_privilege('service_role', 'public.open_symbolic_offerings_on_publication_v1()', 'EXECUTE')
            then 'OK' else 'ECHEC' end

union all

select '2. socle C1 intact', 'eligibilite non inscriptible par anon, authenticated, service_role', 'false|false|false',
       has_table_privilege('anon', 'public.symbolic_offering_eligibility', 'INSERT') || '|'
       || has_table_privilege('authenticated', 'public.symbolic_offering_eligibility', 'INSERT') || '|'
       || has_table_privilege('service_role', 'public.symbolic_offering_eligibility', 'INSERT'),
       case when not has_table_privilege('anon', 'public.symbolic_offering_eligibility', 'INSERT')
                 and not has_table_privilege('authenticated', 'public.symbolic_offering_eligibility', 'INSERT')
                 and not has_table_privilege('service_role', 'public.symbolic_offering_eligibility', 'INSERT')
            then 'OK' else 'ECHEC' end

union all

select '2. socle C1 intact', 'record_symbolic_offering_v1 executable par service_role seul', 'false|false|true',
       has_function_privilege('anon', 'public.record_symbolic_offering_v1(text,text,uuid)', 'EXECUTE') || '|'
       || has_function_privilege('authenticated', 'public.record_symbolic_offering_v1(text,text,uuid)', 'EXECUTE') || '|'
       || has_function_privilege('service_role', 'public.record_symbolic_offering_v1(text,text,uuid)', 'EXECUTE'),
       case when not has_function_privilege('anon', 'public.record_symbolic_offering_v1(text,text,uuid)', 'EXECUTE')
                 and not has_function_privilege('authenticated', 'public.record_symbolic_offering_v1(text,text,uuid)', 'EXECUTE')
                 and has_function_privilege('service_role', 'public.record_symbolic_offering_v1(text,text,uuid)', 'EXECUTE')
            then 'OK' else 'ECHEC' end

union all

select '3. rattrapage', 'chaque memorial publie, Intemporel, visible a une eligibilite', '0 manquant',
       (select count(*)::text || ' manquant'
          from public.memorials m join public.memorial_published_snapshots s on s.memorial_id = m.id
         where m.status = 'published' and m.skin_id = 'intemporel' and public.memorial_publicly_visible_v1(m.id, now())
           and not exists (select 1 from public.symbolic_offering_eligibility e where e.memorial_id = m.id)),
       case when exists (select 1
                           from public.memorials m join public.memorial_published_snapshots s on s.memorial_id = m.id
                          where m.status = 'published' and m.skin_id = 'intemporel' and public.memorial_publicly_visible_v1(m.id, now())
                            and not exists (select 1 from public.symbolic_offering_eligibility e where e.memorial_id = m.id))
            then 'ECHEC' else 'OK' end

union all

select '3. rattrapage', 'aucune eligibilite pour un memorial sans instantane publie', '0',
       (select count(*)::text from public.symbolic_offering_eligibility e
         where not exists (select 1 from public.memorial_published_snapshots s where s.memorial_id = e.memorial_id)),
       case when exists (select 1 from public.symbolic_offering_eligibility e
                          where not exists (select 1 from public.memorial_published_snapshots s where s.memorial_id = e.memorial_id))
            then 'ECHEC' else 'OK' end

union all

select '4. information', 'eligibilites ouvertes / suspendues / gestes conserves', '-',
       (select count(*) filter (where closes_at is null or closes_at > now())::text || ' / '
               || count(*) filter (where closes_at is not null and closes_at <= now())::text
          from public.symbolic_offering_eligibility) || ' / ' || (select count(*)::text from public.symbolic_offerings),
       'OK'

order by 1, 2, 3;
