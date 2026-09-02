-- =====================================================================
-- MISSION 013C — PRÉFLIGHT (LECTURE SEULE)
-- =====================================================================
--
-- À exécuter dans le SQL Editor Supabase AVANT d'appliquer la moindre
-- migration. Cette requête ne modifie RIEN : aucun GRANT, aucun REVOKE,
-- aucun CREATE, aucun UPDATE. Elle lit uniquement les catalogues.
--
-- Elle renvoie UN SEUL tableau de résultats, à copier tel quel et à
-- renvoyer pour relecture. Aucune interprétation n'est demandée à qui
-- l'exécute.
--
-- Ce qu'elle établit :
--   1. l'état réel des privilèges avant correction (la photo « avant ») ;
--   2. lesquelles des deux migrations sont déjà appliquées, s'il y en a ;
--   3. si les données existantes rendent la correction risquée
--      (elles ne le sont pas si tout est à zéro).
-- =====================================================================

with tables_of_interest(t) as (
  values ('owners'), ('entitlements'), ('memorials'), ('memorial_drafts'),
         ('memorial_published_snapshots'), ('media'), ('messages')
),
roles_of_interest(r) as (
  values ('anon'), ('authenticated'), ('service_role')
),
-- MAINTAIN n'existe qu'à partir de PostgreSQL 17 : le nommer sur une
-- version antérieure ferait échouer la requête entière.
privileges_of_interest(list) as (
  select case when current_setting('server_version_num')::int >= 170000
              then array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']
              else array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']
         end
)

-- 1. Privilèges de table détenus aujourd'hui par chaque rôle
select
  '1. privileges' as section,
  t || ' / ' || r as objet,
  string_agg(p, ', ' order by p) as detail
from tables_of_interest
cross join roles_of_interest
cross join privileges_of_interest
cross join lateral (
  select p from unnest(privileges_of_interest.list) as p
  where to_regclass('public.' || t) is not null
    and has_table_privilege(r, 'public.' || t, p)
) held
where to_regclass('public.' || t) is not null
group by t, r

union all

-- 1b. Tables sans aucun privilège pour un rôle : la ligne manquerait
--     ci-dessus, donc on la rend explicite.
select '1. privileges', t || ' / ' || r, '(aucun)'
from tables_of_interest cross join roles_of_interest cross join privileges_of_interest
where to_regclass('public.' || t) is not null
  and not exists (
    select 1 from unnest(privileges_of_interest.list) p
    where has_table_privilege(r, 'public.' || t, p)
  )

union all

-- 2. PUBLIC détient-il quelque chose ?
select '2. PUBLIC', t, coalesce(
  (select string_agg(a.privilege_type, ', ')
     from aclexplode((select relacl from pg_class where oid = ('public.' || t)::regclass)) a
    where a.grantee = 0),
  '(rien)')
from tables_of_interest
where to_regclass('public.' || t) is not null

union all

-- 3. Propriétaire de chaque table (explique quelle entrée
--    pg_default_acl s'applique)
select '3. owner', t, pg_get_userbyid(relowner)
from tables_of_interest join pg_class c on c.oid = ('public.' || t)::regclass
where to_regclass('public.' || t) is not null

union all

-- 4. Default privileges du schéma public
select '4. default_acl',
       'FOR ROLE ' || pg_get_userbyid(d.defaclrole) || ' / ' || d.defaclobjtype::text,
       coalesce((select string_agg(a.grantee::regrole::text || '=' || a.privilege_type, ', ')
                   from aclexplode(d.defaclacl) a), '(vide)')
from pg_default_acl d
join pg_namespace n on n.oid = d.defaclnamespace
where n.nspname = 'public'

union all

-- 5. Fonctions : mode de sécurité, search_path, et qui peut EXECUTE
select '5. functions', p.proname,
       'secdef=' || p.prosecdef
       || ' / ' || coalesce(array_to_string(p.proconfig, ','), 'search_path=(non épinglé)')
       || ' / PUBLIC=' || coalesce((select true from aclexplode(p.proacl) a where a.grantee = 0 limit 1), false)
       || ' / anon=' || has_function_privilege('anon', p.oid, 'EXECUTE')
       || ' / authenticated=' || has_function_privilege('authenticated', p.oid, 'EXECUTE')
       || ' / service_role=' || has_function_privilege('service_role', p.oid, 'EXECUTE')
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('current_owner_id','create_memorial_draft','set_updated_at',
                    'public_memorial_publication_state','redeem_entitlement',
                    'redeem_entitlement_with_activation_key')

union all

-- 6. Quelles migrations sont déjà appliquées ?
select '6. migrations_appliquees', 'entitlements.activation_key_hash',
       case when exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='entitlements'
                            and column_name='activation_key_hash')
            then 'PRESENTE -> 20260901180000 deja appliquee'
            else 'ABSENTE -> 20260901180000 pas encore appliquee' end

union all

select '6. migrations_appliquees', 'redeem_entitlement_with_activation_key()',
       case when exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                          where n.nspname='public'
                            and p.proname='redeem_entitlement_with_activation_key')
            then 'PRESENTE' else 'ABSENTE' end

union all

select '6. migrations_appliquees', 'modele de privileges 20260901190000',
       case when has_table_privilege('service_role','public.entitlements','UPDATE')
                 and not has_table_privilege('anon','public.entitlements','TRUNCATE')
            then 'DEJA APPLIQUEE (ou equivalent) -> STOP et signaler'
            else 'PAS ENCORE APPLIQUEE' end

union all

-- 7. Volume de données : la correction est-elle risquée ?
select '7. donnees', 'owners',       count(*)::text from owners
union all select '7. donnees', 'entitlements', count(*)::text from entitlements
union all select '7. donnees', 'memorials',    count(*)::text from memorials
union all select '7. donnees', 'memorial_drafts', count(*)::text from memorial_drafts

union all

-- 8. Version du serveur (MAINTAIN n'existe qu'à partir de 17)
select '8. version', 'server_version', version()

order by 1, 2;
