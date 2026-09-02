-- =====================================================================
-- MISSION 013C — POSTFLIGHT (LECTURE SEULE)
-- =====================================================================
--
-- À exécuter dans le SQL Editor Supabase APRÈS avoir appliqué les
-- migrations, dans cet ordre :
--
--   1. supabase/migrations/20260901180000_activation_keys.sql
--   2. supabase/migrations/20260901190000_privilege_model.sql
--
-- Cette requête ne modifie RIEN. Elle renvoie UN SEUL tableau où chaque
-- ligne porte sa propre conclusion dans la colonne `verdict` :
--
--   OK       -> conforme
--   ECHEC    -> non conforme, ne pas continuer, renvoyer le tableau
--
-- Il n'y a rien à interpréter : s'il existe UNE SEULE ligne `ECHEC`,
-- le modèle de privilèges n'est pas celui que le dépôt décrit.
--
-- Ce postflight vérifie ce que le harness local NE PEUT PAS vérifier,
-- en particulier le privilège MAINTAIN, qui n'existe qu'à partir de
-- PostgreSQL 17 et donc pas sur le cluster de test local (16).
-- =====================================================================

with expected(table_name, role_name, privilege, should_have) as (
  values
    -- service_role : le strict minimum mesuré
    ('owners','service_role','SELECT',true),
    ('owners','service_role','INSERT',true),
    ('owners','service_role','UPDATE',false),
    ('owners','service_role','DELETE',false),
    ('entitlements','service_role','SELECT',true),
    ('entitlements','service_role','INSERT',true),
    ('entitlements','service_role','UPDATE',true),
    ('entitlements','service_role','DELETE',false),
    ('memorials','service_role','SELECT',true),
    ('memorials','service_role','INSERT',true),
    ('memorials','service_role','UPDATE',false),
    ('memorials','service_role','DELETE',false),
    ('memorial_drafts','service_role','SELECT',false),
    ('memorial_drafts','service_role','INSERT',false),
    ('memorial_drafts','service_role','UPDATE',false),
    ('memorial_drafts','service_role','DELETE',false),
    ('memorial_published_snapshots','service_role','SELECT',false),
    ('memorial_published_snapshots','service_role','INSERT',false),
    ('memorial_published_snapshots','service_role','UPDATE',false),
    ('memorial_published_snapshots','service_role','DELETE',false),
    ('media','service_role','SELECT',false),
    ('media','service_role','INSERT',false),
    ('media','service_role','UPDATE',false),
    ('media','service_role','DELETE',false),
    ('messages','service_role','SELECT',false),
    ('messages','service_role','INSERT',false),
    ('messages','service_role','UPDATE',false),
    ('messages','service_role','DELETE',false)
),
tables_of_interest(t) as (
  values ('owners'), ('entitlements'), ('memorials'), ('memorial_drafts'),
         ('memorial_published_snapshots'), ('media'), ('messages')
),
client_roles(r) as (values ('anon'), ('authenticated')),
all_roles(r)   as (values ('anon'), ('authenticated'), ('service_role')),
-- MAINTAIN n'existe qu'à partir de PostgreSQL 17. Sur le projet réel il
-- existe ; cette forme garde la requête exécutable partout.
non_dml(list) as (
  select case when current_setting('server_version_num')::int >= 170000
              then array['TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']
              else array['TRUNCATE','REFERENCES','TRIGGER']
         end
)

-- A. service_role détient exactement le minimum, et rien de plus
select 'A. service_role' as bloc,
       table_name || ' ' || privilege as controle,
       (case when should_have then 'doit avoir' else 'ne doit PAS avoir' end) as attendu,
       has_table_privilege(role_name, 'public.' || table_name, privilege)::text as constate,
       case when has_table_privilege(role_name, 'public.' || table_name, privilege) = should_have
            then 'OK' else 'ECHEC' end as verdict
from expected

union all

-- B. Les rôles client ne détiennent aucun DML
select 'B. anon/authenticated', t || ' ' || r || ' ' || p, 'ne doit PAS avoir',
       has_table_privilege(r, 'public.' || t, p)::text,
       case when has_table_privilege(r, 'public.' || t, p) then 'ECHEC' else 'OK' end
from tables_of_interest cross join client_roles
cross join lateral unnest(array['SELECT','INSERT','UPDATE','DELETE']) as p

union all

-- C. Aucun rôle ne détient les privilèges non-DML hérités de la
--    plateforme. TRUNCATE est le plus important : il n'est PAS filtré
--    par RLS.
select 'C. non-DML herites', t || ' ' || r || ' ' || p, 'ne doit PAS avoir',
       has_table_privilege(r, 'public.' || t, p)::text,
       case when has_table_privilege(r, 'public.' || t, p) then 'ECHEC' else 'OK' end
from tables_of_interest cross join all_roles cross join non_dml
cross join lateral unnest(non_dml.list) as p

union all

-- D. PUBLIC ne détient rien, ni au niveau table ni au niveau colonne
select 'D. PUBLIC', t || ' (table)', 'aucun privilege',
       coalesce((select string_agg(a.privilege_type, ',')
                   from aclexplode((select relacl from pg_class where oid = ('public.' || t)::regclass)) a
                  where a.grantee = 0), '(rien)'),
       case when exists (select 1
                           from aclexplode((select relacl from pg_class where oid = ('public.' || t)::regclass)) a
                          where a.grantee = 0)
            then 'ECHEC' else 'OK' end
from tables_of_interest

union all

select 'D. PUBLIC', t || ' (colonnes)', 'aucun privilege',
       (select count(*)::text from pg_attribute att
          join lateral aclexplode(att.attacl) a on true
         where att.attrelid = ('public.' || t)::regclass and a.grantee = 0),
       case when (select count(*) from pg_attribute att
                    join lateral aclexplode(att.attacl) a on true
                   where att.attrelid = ('public.' || t)::regclass and a.grantee = 0) > 0
            then 'ECHEC' else 'OK' end
from tables_of_interest

union all

-- E. activation_key_hash : inaccessible aux rôles client, lisible par
--    le moteur
select 'E. activation_key_hash',
       r || ' ' || p, 'ne doit PAS avoir',
       has_column_privilege(r, 'public.entitlements', 'activation_key_hash', p)::text,
       case when has_column_privilege(r, 'public.entitlements', 'activation_key_hash', p)
            then 'ECHEC' else 'OK' end
from client_roles cross join lateral unnest(array['SELECT','UPDATE']) as p
where exists (select 1 from information_schema.columns
               where table_schema='public' and table_name='entitlements'
                 and column_name='activation_key_hash')

union all

select 'E. activation_key_hash', 'service_role SELECT', 'doit avoir',
       has_column_privilege('service_role','public.entitlements','activation_key_hash','SELECT')::text,
       case when has_column_privilege('service_role','public.entitlements','activation_key_hash','SELECT')
            then 'OK' else 'ECHEC' end
where exists (select 1 from information_schema.columns
               where table_schema='public' and table_name='entitlements'
                 and column_name='activation_key_hash')

union all

-- F. Fonctions : mode de sécurité et search_path épinglé
select 'F. fonctions', f.fn || ' security_definer', f.want_secdef::text,
       coalesce((select p.prosecdef::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='public' and p.proname = f.fn), 'FONCTION ABSENTE'),
       case when (select p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                   where n.nspname='public' and p.proname = f.fn) = f.want_secdef
            then 'OK' else 'ECHEC' end
from (values ('current_owner_id', true), ('create_memorial_draft', true),
             ('set_updated_at', false), ('public_memorial_publication_state', true),
             ('redeem_entitlement', false)) as f(fn, want_secdef)

union all

select 'F. fonctions', f.fn || ' search_path', 'search_path=public',
       coalesce((select array_to_string(p.proconfig, ',') from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='public' and p.proname = f.fn), '(non epingle)'),
       case when (select array_to_string(p.proconfig, ',') from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                   where n.nspname='public' and p.proname = f.fn) = 'search_path=public'
            then 'OK' else 'ECHEC' end
from (values ('current_owner_id'), ('create_memorial_draft'), ('set_updated_at'),
             ('public_memorial_publication_state')) as f(fn)

union all

-- G. EXECUTE : qui peut appeler quoi
select 'G. EXECUTE', g.fn || ' ' || g.role_name, (case when g.want then 'doit' else 'ne doit PAS' end),
       coalesce((select has_function_privilege(g.role_name, p.oid, 'EXECUTE')::text
                   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='public' and p.proname = g.fn limit 1), 'FONCTION ABSENTE'),
       case when (select has_function_privilege(g.role_name, p.oid, 'EXECUTE')
                    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                   where n.nspname='public' and p.proname = g.fn limit 1) = g.want
            then 'OK' else 'ECHEC' end
from (values
  ('current_owner_id','authenticated',true),
  ('current_owner_id','anon',false),
  ('current_owner_id','service_role',false),
  ('create_memorial_draft','anon',false),
  ('create_memorial_draft','authenticated',false),
  ('create_memorial_draft','service_role',false),
  ('set_updated_at','anon',false),
  ('set_updated_at','authenticated',false),
  ('set_updated_at','service_role',false),
  ('redeem_entitlement','service_role',true),
  ('redeem_entitlement','anon',false),
  ('redeem_entitlement','authenticated',false),
  ('redeem_entitlement_with_activation_key','service_role',true),
  ('redeem_entitlement_with_activation_key','anon',false),
  ('redeem_entitlement_with_activation_key','authenticated',false),
  ('public_memorial_publication_state','anon',true),
  ('public_memorial_publication_state','authenticated',true)
) as g(fn, role_name, want)

union all

-- H. PUBLIC ne peut exécuter aucune de ces fonctions
select 'H. PUBLIC EXECUTE', p.proname, 'aucun EXECUTE',
       coalesce((select true from aclexplode(p.proacl) a where a.grantee = 0 limit 1), false)::text,
       case when coalesce((select true from aclexplode(p.proacl) a where a.grantee = 0 limit 1), false)
            then 'ECHEC' else 'OK' end
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('current_owner_id','create_memorial_draft','set_updated_at',
                    'public_memorial_publication_state','redeem_entitlement',
                    'redeem_entitlement_with_activation_key')

union all

-- I. Mission 011A intacte : la signature sans clé existe toujours
select 'I. 011A intacte', 'redeem_entitlement(uuid,uuid,text,text)', 'doit exister', count(*)::text,
       case when count(*) = 1 then 'OK' else 'ECHEC' end
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname='public' and p.proname='redeem_entitlement'
  and pg_get_function_identity_arguments(p.oid)
      = 'p_entitlement_id uuid, p_owner_id uuid, p_memorial_type text, p_skin_id text'

union all

-- J. Les policies RLS n'ont pas bougé (013C n'en crée, ne modifie ni
--    n'en supprime aucune)
select 'J. RLS', 'nombre de policies sur les 7 tables', '14', count(*)::text,
       case when count(*) = 14 then 'OK' else 'ECHEC' end
from pg_policies
where schemaname = 'public'
  and tablename in ('owners','entitlements','memorials','memorial_drafts',
                    'memorial_published_snapshots','media','messages')

union all

-- Chaque policy, nommée : informatif, pour comparer au dépôt si le
-- compte ci-dessus ne tombe pas juste.
select 'J. RLS', 'policy ' || tablename || '.' || policyname,
       '(informatif)', array_to_string(roles, ','), 'INFO'
from pg_policies
where schemaname = 'public'
  and tablename in ('owners','entitlements','memorials','memorial_drafts',
                    'memorial_published_snapshots','media','messages')

order by 1, 2;
