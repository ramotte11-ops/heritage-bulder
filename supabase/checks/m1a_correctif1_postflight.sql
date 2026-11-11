-- =====================================================================
-- HERITAGE DIRECT M1-A, CORRECTIF 1 — POSTFLIGHT COMPLÉMENTAIRE
-- (LECTURE SEULE)
-- =====================================================================
--
-- À exécuter dans le SQL Editor Supabase APRÈS avoir appliqué, dans cet
-- ordre :
--   1. supabase/migrations/20261024180000_heritage_direct_access_foundation.sql
--   2. supabase/migrations/20261024190000_heritage_direct_free_window_per_email.sql
-- et APRÈS supabase/checks/m1a_postflight.sql, qu'il complète sans le
-- remplacer.
--
-- Cette requête ne modifie RIEN. Elle lit les catalogues et compte des
-- lignes ; elle ne lit aucune donnée personnelle.
--
-- UN SEUL tableau. Verdicts OK, INFO ou ECHEC. Un seul ECHEC = le
-- correctif déployé n'est pas celui que décrit ce dépôt.
-- =====================================================================

select 'A. journal' as bloc,
       'evenement free.window_opened autorise' as controle,
       'present dans la contrainte' as attendu,
       coalesce((select case when pg_get_constraintdef(c.oid) like '%free.window_opened%'
                             then 'present' else 'absent' end
                   from pg_constraint c
                  where c.conrelid = 'public.memorial_access_events'::regclass
                    and c.conname = 'memorial_access_events_event_check'), 'CONTRAINTE ABSENTE') as constate,
       case when (select pg_get_constraintdef(c.oid) like '%free.window_opened%'
                    from pg_constraint c
                   where c.conrelid = 'public.memorial_access_events'::regclass
                     and c.conname = 'memorial_access_events_event_check')
            then 'OK' else 'ECHEC' end as verdict

union all

-- La version corrigée des deux fonctions est bien celle en place.
select 'B. fonctions', p.proname || ' : version corrigee', 'appelle free_access_window_v1',
       case when p.prosrc like '%free_access_window_v1%' and p.prosrc like '%free_unavailable%'
            then 'corrigee' else 'version initiale' end,
       case when p.prosrc like '%free_access_window_v1%' and p.prosrc like '%free_unavailable%'
            then 'OK' else 'ECHEC — appliquer 20261024190000' end
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.proname in ('create_free_memorial_v1', 'anchor_free_memorial_v1')

union all

select 'C. privileges', f || ' : executable par personne', 'false / false / false',
       has_function_privilege('anon', 'public.' || f, 'EXECUTE')::text || ' / '
         || has_function_privilege('authenticated', 'public.' || f, 'EXECUTE')::text || ' / '
         || has_function_privilege('service_role', 'public.' || f, 'EXECUTE')::text,
       case when has_function_privilege('anon', 'public.' || f, 'EXECUTE')
              or has_function_privilege('authenticated', 'public.' || f, 'EXECUTE')
              or has_function_privilege('service_role', 'public.' || f, 'EXECUTE')
            then 'ECHEC' else 'OK' end
from (values ('free_access_window_v1(uuid,timestamptz)'),
             ('owners_guard_free_email_v1()')) as functions(f)

union all

select 'C. privileges', p.proname || ' : SECURITY DEFINER, search_path vide', 'definer / search_path=""',
       case when p.prosecdef then 'definer' else 'invoker' end || ' / '
         || coalesce(array_to_string(p.proconfig, ','), 'aucun'),
       case when p.prosecdef and p.proconfig @> array['search_path=""'] then 'OK' else 'ECHEC' end
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.proname in ('free_access_window_v1', 'owners_guard_free_email_v1')

union all

-- L'adresse d'un propriétaire n'est modifiable par aucun rôle applicatif.
select 'C. privileges', r || ' ne peut pas modifier owners.email', 'false',
       has_column_privilege(r, 'public.owners', 'email', 'UPDATE')::text,
       case when has_column_privilege(r, 'public.owners', 'email', 'UPDATE') then 'ECHEC' else 'OK' end
from (values ('anon'), ('authenticated'), ('service_role')) as roles(r)

union all

select 'D. triggers', 'trigger owners_guard_free_email actif', 'O',
       coalesce((select tgenabled::text from pg_trigger
                  where tgname = 'owners_guard_free_email'
                    and tgrelid = 'public.owners'::regclass and not tgisinternal), 'ABSENT'),
       case when (select tgenabled from pg_trigger
                   where tgname = 'owners_guard_free_email'
                     and tgrelid = 'public.owners'::regclass and not tgisinternal) = 'O'
            then 'OK' else 'ECHEC' end

union all

-- ---------------------------------------------------------------------
-- E. DONNÉES
-- ---------------------------------------------------------------------
select 'E. donnees', 'adresses avec deux fenetres gratuites en moins de 12 mois', '0',
       (select count(*)::text from (
          select a.owner_id
            from public.memorial_access_events a
            join public.memorial_access_events b
              on b.owner_id = a.owner_id
             and b.event = 'free.window_opened'
             and b.id <> a.id
             and b.created_at >= a.created_at
             and b.created_at < a.created_at + (select free_publication_quota_window
                                                  from public.memorial_access_settings where id)
           where a.event = 'free.window_opened'
           group by a.owner_id) x),
       case when (select count(*) from (
          select a.owner_id
            from public.memorial_access_events a
            join public.memorial_access_events b
              on b.owner_id = a.owner_id
             and b.event = 'free.window_opened'
             and b.id <> a.id
             and b.created_at >= a.created_at
             and b.created_at < a.created_at + (select free_publication_quota_window
                                                  from public.memorial_access_settings where id)
           where a.event = 'free.window_opened'
           group by a.owner_id) x) = 0
            then 'OK' else 'ECHEC' end

union all

select 'E. donnees', 'fenetres gratuites ouvertes', 'informatif',
       (select count(*)::text from public.memorial_access_events where event = 'free.window_opened'),
       'INFO'

order by 1, 2, 3;
