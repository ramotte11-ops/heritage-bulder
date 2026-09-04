-- =====================================================================
-- MISSION 015B — POSTFLIGHT (LECTURE SEULE)
-- =====================================================================
--
-- À exécuter dans le SQL Editor Supabase APRÈS avoir appliqué :
--
--   supabase/migrations/20260904100000_admin_audit_and_mutations.sql
--
-- Cette requête ne modifie RIEN. Elle renvoie UN SEUL tableau où chaque
-- ligne porte sa propre conclusion dans la colonne `verdict` :
--
--   OK       -> conforme
--   ECHEC    -> non conforme, ne pas continuer, renvoyer le tableau
--
-- Compagnon de supabase/checks/013c_postflight.sql — ne le remplace pas.
-- Le bloc H ci-dessous re-vérifie un sous-ensemble du modèle 013C
-- (le priver de vérification serait la façon la plus probable dont une
-- migration 015B mal écrite l'affaiblirait sans le dire), mais le
-- contrôle 013C complet reste 013c_postflight.sql.
-- =====================================================================

with client_roles(r) as (values ('anon'), ('authenticated')),
all_roles(r) as (values ('anon'), ('authenticated'), ('service_role'))

-- A. admin_audit_events : service_role a exactement SELECT + INSERT
select 'A. service_role sur admin_audit_events' as bloc,
       'admin_audit_events ' || p as controle,
       (case when expected then 'doit avoir' else 'ne doit PAS avoir' end) as attendu,
       has_table_privilege('service_role','public.admin_audit_events', p)::text as constate,
       case when has_table_privilege('service_role','public.admin_audit_events', p) = expected
            then 'OK' else 'ECHEC' end as verdict
from (values ('SELECT', true), ('INSERT', true), ('UPDATE', false), ('DELETE', false),
             ('TRUNCATE', false), ('REFERENCES', false), ('TRIGGER', false)) as e(p, expected)

union all

-- B. anon/authenticated n'ont AUCUN privilège sur admin_audit_events
select 'B. anon/authenticated sur admin_audit_events', r || ' ' || p, 'ne doit PAS avoir',
       has_table_privilege(r, 'public.admin_audit_events', p)::text,
       case when has_table_privilege(r, 'public.admin_audit_events', p) then 'ECHEC' else 'OK' end
from client_roles
cross join lateral unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) as p

union all

-- C. PUBLIC ne détient rien sur admin_audit_events, ni table ni colonne
select 'C. PUBLIC sur admin_audit_events', 'table', 'aucun privilege',
       coalesce((select string_agg(a.privilege_type, ',')
                   from aclexplode((select relacl from pg_class where oid = 'public.admin_audit_events'::regclass)) a
                  where a.grantee = 0), '(rien)'),
       case when exists (select 1
                           from aclexplode((select relacl from pg_class where oid = 'public.admin_audit_events'::regclass)) a
                          where a.grantee = 0)
            then 'ECHEC' else 'OK' end

union all

select 'C. PUBLIC sur admin_audit_events', 'colonnes', 'aucun privilege',
       (select count(*)::text from pg_attribute att
          join lateral aclexplode(att.attacl) a on true
         where att.attrelid = 'public.admin_audit_events'::regclass and a.grantee = 0),
       case when (select count(*) from pg_attribute att
                    join lateral aclexplode(att.attacl) a on true
                   where att.attrelid = 'public.admin_audit_events'::regclass and a.grantee = 0) > 0
            then 'ECHEC' else 'OK' end

union all

-- D. RLS active sur admin_audit_events
select 'D. RLS', 'admin_audit_events relrowsecurity', 'true',
       relrowsecurity::text,
       case when relrowsecurity then 'OK' else 'ECHEC' end
from pg_class where oid = 'public.admin_audit_events'::regclass

union all

-- E. Zéro policy sur admin_audit_events (aucune n'est nécessaire :
--    service_role bypass RLS, et personne d'autre n'a de privilège)
select 'E. RLS', 'nombre de policies sur admin_audit_events', '0', count(*)::text,
       case when count(*) = 0 then 'OK' else 'ECHEC' end
from pg_policies where schemaname = 'public' and tablename = 'admin_audit_events'

union all

-- F. Les deux RPC : SECURITY INVOKER, search_path épinglé
select 'F. fonctions', fn.name || ' security_definer', 'false',
       coalesce((select p.prosecdef::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='public' and p.proname = fn.name), 'FONCTION ABSENTE'),
       case when (select p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                   where n.nspname='public' and p.proname = fn.name) = false
            then 'OK' else 'ECHEC' end
from (values ('admin_mutate_activation_key'), ('admin_revoke_entitlement')) as fn(name)

union all

select 'F. fonctions', fn.name || ' search_path', 'search_path=public',
       coalesce((select array_to_string(p.proconfig, ',') from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='public' and p.proname = fn.name), '(non epingle)'),
       case when (select array_to_string(p.proconfig, ',') from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                   where n.nspname='public' and p.proname = fn.name) = 'search_path=public'
            then 'OK' else 'ECHEC' end
from (values ('admin_mutate_activation_key'), ('admin_revoke_entitlement')) as fn(name)

union all

-- G. EXECUTE : service_role seulement, jamais PUBLIC/anon/authenticated
select 'G. EXECUTE', g.fn || ' ' || g.role_name, (case when g.want then 'doit' else 'ne doit PAS' end),
       coalesce((select has_function_privilege(g.role_name, p.oid, 'EXECUTE')::text
                   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='public' and p.proname = g.fn limit 1), 'FONCTION ABSENTE'),
       case when (select has_function_privilege(g.role_name, p.oid, 'EXECUTE')
                    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                   where n.nspname='public' and p.proname = g.fn limit 1) = g.want
            then 'OK' else 'ECHEC' end
from (values
  ('admin_mutate_activation_key','service_role',true),
  ('admin_mutate_activation_key','anon',false),
  ('admin_mutate_activation_key','authenticated',false),
  ('admin_revoke_entitlement','service_role',true),
  ('admin_revoke_entitlement','anon',false),
  ('admin_revoke_entitlement','authenticated',false)
) as g(fn, role_name, want)

union all

select 'G. EXECUTE', 'PUBLIC ' || p.proname, 'aucun EXECUTE',
       coalesce((select true from aclexplode(p.proacl) a where a.grantee = 0 limit 1), false)::text,
       case when coalesce((select true from aclexplode(p.proacl) a where a.grantee = 0 limit 1), false)
            then 'ECHEC' else 'OK' end
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('admin_mutate_activation_key','admin_revoke_entitlement')

union all

-- G bis. L'ACL de chaque RPC ne contient RIEN d'autre, en dehors du
-- propriétaire de la fonction lui-même (dont les privilèges viennent de
-- l'ownership, jamais d'une entrée ACL, et qui apparaît toujours dès
-- que l'ACL cesse d'être le NULL implicite du catalogue — GRANT/REVOKE
-- le matérialise), qu'un unique grantee, service_role, en EXECUTE seul
-- — la preuve, au niveau de l'état effectif, que le REVOKE nommé
-- explicitement (public, anon, authenticated, service_role) dans la
-- migration n'a laissé aucun privilège hérité ou résiduel ailleurs.
select 'G bis. ACL minimal', fn || ' nombre de grantees (hors owner)', '1',
       coalesce((select count(distinct a.grantee)::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                   cross join lateral aclexplode(p.proacl) a
                  where n.nspname='public' and p.proname = fn and a.grantee <> p.proowner), '0'),
       case when (select count(distinct a.grantee) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                    cross join lateral aclexplode(p.proacl) a
                   where n.nspname='public' and p.proname = fn and a.grantee <> p.proowner) = 1
            then 'OK' else 'ECHEC' end
from (values ('admin_mutate_activation_key'), ('admin_revoke_entitlement')) as fn(fn)

union all

select 'G bis. ACL minimal', fn || ' seul grantee (hors owner) = service_role, seul privilege = EXECUTE', 'service_role,EXECUTE',
       coalesce((select string_agg(distinct a.grantee::regrole::text, ',') || ',' || string_agg(distinct a.privilege_type, ',')
                   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                   cross join lateral aclexplode(p.proacl) a
                  where n.nspname='public' and p.proname = fn and a.grantee <> p.proowner), '(aucun)'),
       case when (select string_agg(distinct a.grantee::regrole::text, ',') from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                    cross join lateral aclexplode(p.proacl) a
                   where n.nspname='public' and p.proname = fn and a.grantee <> p.proowner) = 'service_role'
             and (select string_agg(distinct a.privilege_type, ',') from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                    cross join lateral aclexplode(p.proacl) a
                   where n.nspname='public' and p.proname = fn and a.grantee <> p.proowner) = 'EXECUTE'
            then 'OK' else 'ECHEC' end
from (values ('admin_mutate_activation_key'), ('admin_revoke_entitlement')) as fn(fn)

union all

-- H. Le modèle 013C n'a pas bougé (contrôle partiel — voir l'en-tête)
select 'H. 013C intact', 'service_role UPDATE sur entitlements', 'true',
       has_table_privilege('service_role','public.entitlements','UPDATE')::text,
       case when has_table_privilege('service_role','public.entitlements','UPDATE') then 'OK' else 'ECHEC' end

union all

select 'H. 013C intact', r || ' aucun privilege sur entitlements', 'aucun',
       (has_table_privilege(r,'public.entitlements','SELECT') or
        has_table_privilege(r,'public.entitlements','INSERT') or
        has_table_privilege(r,'public.entitlements','UPDATE') or
        has_table_privilege(r,'public.entitlements','DELETE'))::text,
       case when has_table_privilege(r,'public.entitlements','SELECT')
              or has_table_privilege(r,'public.entitlements','INSERT')
              or has_table_privilege(r,'public.entitlements','UPDATE')
              or has_table_privilege(r,'public.entitlements','DELETE')
            then 'ECHEC' else 'OK' end
from client_roles

union all

select 'H. 013C intact', 'redeem_entitlement executable par service_role', 'true',
       coalesce((select has_function_privilege('service_role', p.oid, 'EXECUTE')::text
                   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='public' and p.proname='redeem_entitlement' limit 1), 'FONCTION ABSENTE'),
       case when (select has_function_privilege('service_role', p.oid, 'EXECUTE')
                    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                   where n.nspname='public' and p.proname='redeem_entitlement' limit 1)
            then 'OK' else 'ECHEC' end

union all

-- I. entitlements.status accepte toujours 'revoked' — aucune migration
--    015B ne devait toucher cette contrainte (elle existe depuis
--    Mission 002)
select 'I. contrainte inchangee', 'entitlements_status_check autorise revoked', 'succes insertion test (ROLLBACK)',
       'voir note', 'INFO — non testable en lecture seule ; vérifié par le harness local (scripts/db/test-local.sh)'

union all

-- J. Index minimal sur admin_audit_events
select 'J. index', 'admin_audit_events_target_idx existe', 'true',
       (to_regclass('public.admin_audit_events_target_idx') is not null)::text,
       case when to_regclass('public.admin_audit_events_target_idx') is not null then 'OK' else 'ECHEC' end

union all

-- K. context est contraint à un OBJET JSON (jamais un tableau, un
--    scalaire ou null) — la contrainte existe et porte le bon nom
select 'K. context = objet JSON', 'contrainte admin_audit_events_context_is_object existe', 'true',
       exists (select 1 from pg_constraint c join pg_class t on t.oid = c.conrelid
                where t.relname = 'admin_audit_events' and c.conname = 'admin_audit_events_context_is_object')::text,
       case when exists (select 1 from pg_constraint c join pg_class t on t.oid = c.conrelid
                           where t.relname = 'admin_audit_events' and c.conname = 'admin_audit_events_context_is_object')
            then 'OK' else 'ECHEC' end

union all

select 'K. context = objet JSON', 'la contrainte est bien CHECK (jsonb_typeof(context) = ''object'')', 'true',
       coalesce((select pg_get_constraintdef(c.oid) from pg_constraint c join pg_class t on t.oid = c.conrelid
                  where t.relname = 'admin_audit_events' and c.conname = 'admin_audit_events_context_is_object'),
                '(absente)'),
       case when (select pg_get_constraintdef(c.oid) from pg_constraint c join pg_class t on t.oid = c.conrelid
                    where t.relname = 'admin_audit_events' and c.conname = 'admin_audit_events_context_is_object')
                 ilike '%jsonb_typeof(context)%object%'
            then 'OK' else 'ECHEC' end

order by 1, 2;
