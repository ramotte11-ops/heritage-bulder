-- =====================================================================
-- MISSION 019C — POSTFLIGHT (LECTURE SEULE)
-- =====================================================================
--
-- À exécuter dans le SQL Editor Supabase APRÈS avoir appliqué :
--
--   supabase/migrations/20260905100000_activation_rate_limit.sql
--
-- Cette requête ne modifie RIEN. Elle renvoie UN SEUL tableau où chaque
-- ligne porte sa propre conclusion dans la colonne `verdict` :
--
--   OK       -> conforme
--   ECHEC    -> non conforme, ne pas continuer, renvoyer le tableau
--
-- Compagnon de supabase/checks/013c_postflight.sql et
-- supabase/checks/015b_postflight.sql — ne les remplace pas.
-- =====================================================================

with client_roles(r) as (values ('anon'), ('authenticated')),
all_roles(r) as (values ('anon'), ('authenticated'), ('service_role')),
maintain_supported(v) as (
  select current_setting('server_version_num')::int >= 170000
)

-- A. service_role a exactement SELECT + INSERT + UPDATE sur
--    activation_rate_limits, jamais DELETE
select 'A. service_role sur activation_rate_limits' as bloc,
       'activation_rate_limits ' || p as controle,
       (case when expected then 'doit avoir' else 'ne doit PAS avoir' end) as attendu,
       has_table_privilege('service_role','public.activation_rate_limits', p)::text as constate,
       case when has_table_privilege('service_role','public.activation_rate_limits', p) = expected
            then 'OK' else 'ECHEC' end as verdict
from (values ('SELECT', true), ('INSERT', true), ('UPDATE', true), ('DELETE', false),
             ('TRUNCATE', false), ('REFERENCES', false), ('TRIGGER', false)) as e(p, expected)

union all

-- A bis. MAINTAIN (PG17+ uniquement) — jamais accordé, à aucun rôle.
select 'A bis. MAINTAIN (PG17+)', 'activation_rate_limits ' || r || ' MAINTAIN', 'ne doit PAS avoir',
       case when (select v from maintain_supported)
            then has_table_privilege(r, 'public.activation_rate_limits', 'MAINTAIN')::text
            else '(MAINTAIN indisponible avant PG17 sur ce serveur)' end,
       case when not (select v from maintain_supported) then 'INFO — non applicable sur ce serveur'
            when has_table_privilege(r, 'public.activation_rate_limits', 'MAINTAIN') then 'ECHEC'
            else 'OK' end
from all_roles

union all

-- B. anon/authenticated n'ont AUCUN privilège sur activation_rate_limits
select 'B. anon/authenticated sur activation_rate_limits', r || ' ' || p, 'ne doit PAS avoir',
       has_table_privilege(r, 'public.activation_rate_limits', p)::text,
       case when has_table_privilege(r, 'public.activation_rate_limits', p) then 'ECHEC' else 'OK' end
from client_roles
cross join lateral unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) as p

union all

-- C. PUBLIC ne détient rien sur activation_rate_limits, ni table ni colonne
select 'C. PUBLIC sur activation_rate_limits', 'table', 'aucun privilege',
       coalesce((select string_agg(a.privilege_type, ',')
                   from aclexplode((select relacl from pg_class where oid = 'public.activation_rate_limits'::regclass)) a
                  where a.grantee = 0), '(rien)'),
       case when exists (select 1
                           from aclexplode((select relacl from pg_class where oid = 'public.activation_rate_limits'::regclass)) a
                          where a.grantee = 0)
            then 'ECHEC' else 'OK' end

union all

select 'C. PUBLIC sur activation_rate_limits', 'colonnes', 'aucun privilege',
       (select count(*)::text from pg_attribute att
          join lateral aclexplode(att.attacl) a on true
         where att.attrelid = 'public.activation_rate_limits'::regclass and a.grantee = 0),
       case when (select count(*) from pg_attribute att
                    join lateral aclexplode(att.attacl) a on true
                   where att.attrelid = 'public.activation_rate_limits'::regclass and a.grantee = 0) > 0
            then 'ECHEC' else 'OK' end

union all

-- D. RLS active sur activation_rate_limits
select 'D. RLS', 'activation_rate_limits relrowsecurity', 'true',
       relrowsecurity::text,
       case when relrowsecurity then 'OK' else 'ECHEC' end
from pg_class where oid = 'public.activation_rate_limits'::regclass

union all

-- E. Zéro policy sur activation_rate_limits
select 'E. RLS', 'nombre de policies sur activation_rate_limits', '0', count(*)::text,
       case when count(*) = 0 then 'OK' else 'ECHEC' end
from pg_policies where schemaname = 'public' and tablename = 'activation_rate_limits'

union all

-- F. La fonction : SECURITY INVOKER, search_path épinglé
select 'F. fonction', 'record_heritage_activation_attempt security_definer', 'false',
       coalesce((select p.prosecdef::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='public' and p.proname = 'record_heritage_activation_attempt'), 'FONCTION ABSENTE'),
       case when (select p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                   where n.nspname='public' and p.proname = 'record_heritage_activation_attempt') = false
            then 'OK' else 'ECHEC' end

union all

select 'F. fonction', 'record_heritage_activation_attempt search_path', 'search_path=public',
       coalesce((select array_to_string(p.proconfig, ',') from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='public' and p.proname = 'record_heritage_activation_attempt'), '(non epingle)'),
       case when (select array_to_string(p.proconfig, ',') from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                   where n.nspname='public' and p.proname = 'record_heritage_activation_attempt') = 'search_path=public'
            then 'OK' else 'ECHEC' end

union all

-- G. EXECUTE : service_role seulement, jamais PUBLIC/anon/authenticated
select 'G. EXECUTE', 'record_heritage_activation_attempt ' || g.role_name,
       (case when g.want then 'doit' else 'ne doit PAS' end),
       coalesce((select has_function_privilege(g.role_name, p.oid, 'EXECUTE')::text
                   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='public' and p.proname = 'record_heritage_activation_attempt' limit 1), 'FONCTION ABSENTE'),
       case when (select has_function_privilege(g.role_name, p.oid, 'EXECUTE')
                    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                   where n.nspname='public' and p.proname = 'record_heritage_activation_attempt' limit 1) = g.want
            then 'OK' else 'ECHEC' end
from (values
  ('service_role', true),
  ('anon', false),
  ('authenticated', false)
) as g(role_name, want)

union all

select 'G. EXECUTE', 'PUBLIC record_heritage_activation_attempt', 'aucun EXECUTE',
       coalesce((select true from aclexplode(p.proacl) a where a.grantee = 0 limit 1), false)::text,
       case when coalesce((select true from aclexplode(p.proacl) a where a.grantee = 0 limit 1), false)
            then 'ECHEC' else 'OK' end
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'record_heritage_activation_attempt'

union all

-- G bis. L'ACL de la fonction ne contient rien d'autre qu'un unique
-- grantee, service_role, en EXECUTE seul (hors propriétaire).
select 'G bis. ACL minimal', 'nombre de grantees (hors owner)', '1',
       coalesce((select count(distinct a.grantee)::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                   cross join lateral aclexplode(p.proacl) a
                  where n.nspname='public' and p.proname = 'record_heritage_activation_attempt' and a.grantee <> p.proowner), '0'),
       case when (select count(distinct a.grantee) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                    cross join lateral aclexplode(p.proacl) a
                   where n.nspname='public' and p.proname = 'record_heritage_activation_attempt' and a.grantee <> p.proowner) = 1
            then 'OK' else 'ECHEC' end

union all

select 'G bis. ACL minimal', 'seul grantee (hors owner) = service_role, seul privilege = EXECUTE', 'service_role,EXECUTE',
       coalesce((select string_agg(distinct a.grantee::regrole::text, ',') || ',' || string_agg(distinct a.privilege_type, ',')
                   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                   cross join lateral aclexplode(p.proacl) a
                  where n.nspname='public' and p.proname = 'record_heritage_activation_attempt' and a.grantee <> p.proowner), '(aucun)'),
       case when (select string_agg(distinct a.grantee::regrole::text, ',') from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                    cross join lateral aclexplode(p.proacl) a
                   where n.nspname='public' and p.proname = 'record_heritage_activation_attempt' and a.grantee <> p.proowner) = 'service_role'
             and (select string_agg(distinct a.privilege_type, ',') from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                    cross join lateral aclexplode(p.proacl) a
                   where n.nspname='public' and p.proname = 'record_heritage_activation_attempt' and a.grantee <> p.proowner) = 'EXECUTE'
            then 'OK' else 'ECHEC' end

union all

-- H. Aucune colonne pouvant porter une clé brute ou son hash sur
--    activation_rate_limits (la table ne doit connaître QUE l'identité et
--    les compteurs).
select 'H. aucune colonne de clé', 'colonnes interdites absentes', '0',
       (select count(*)::text from information_schema.columns
          where table_schema = 'public' and table_name = 'activation_rate_limits'
            and column_name in ('activation_key', 'raw_activation_key', 'activation_key_hash')),
       case when (select count(*) from information_schema.columns
                    where table_schema = 'public' and table_name = 'activation_rate_limits'
                      and column_name in ('activation_key', 'raw_activation_key', 'activation_key_hash')) = 0
            then 'OK' else 'ECHEC' end

union all

-- I. Les colonnes de la table sont exactement celles attendues (aucune
--    colonne de données personnelles superflue — email, IP, user-agent).
select 'I. colonnes exactes', 'ensemble des colonnes',
       'auth_user_id,window_started_at,attempt_count,updated_at',
       coalesce((select string_agg(column_name, ',' order by ordinal_position)
                   from information_schema.columns
                  where table_schema = 'public' and table_name = 'activation_rate_limits'), '(absente)'),
       case when (select string_agg(column_name, ',' order by ordinal_position)
                    from information_schema.columns
                   where table_schema = 'public' and table_name = 'activation_rate_limits')
                 in ('auth_user_id,window_started_at,attempt_count,updated_at')
            then 'OK' else 'ECHEC' end

union all

-- J. Le modèle 013C n'a pas bougé (contrôle partiel, comme dans 015B)
select 'J. 013C intact', 'service_role UPDATE sur entitlements', 'true',
       has_table_privilege('service_role','public.entitlements','UPDATE')::text,
       case when has_table_privilege('service_role','public.entitlements','UPDATE') then 'OK' else 'ECHEC' end

union all

select 'J. 013C intact', r || ' aucun privilege sur entitlements', 'aucun',
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

order by 1, 2;
