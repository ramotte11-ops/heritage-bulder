-- =====================================================================
-- MISSION 021A — PRÉFLIGHT PRIVILÈGES BUILDER (LECTURE SEULE)
-- =====================================================================
--
-- À exécuter dans le SQL Editor Supabase du VRAI projet, AVANT toute
-- migration. Cette requête ne modifie RIEN : aucun GRANT, aucun REVOKE,
-- aucun CREATE, ALTER, DROP, INSERT, UPDATE ni DELETE. Elle ne lit que
-- les catalogues système (+ un COUNT sur quatre tables).
--
-- Elle renvoie UN SEUL tableau, à copier tel quel et à renvoyer au QG.
-- Aucune interprétation n'est demandée à qui l'exécute.
--
-- CE QU'ELLE DOIT ÉTABLIR
-- -----------------------
-- Le parcours Mission 021 (app/builder/[memorialId]/page.tsx) lit et
-- écrit le vrai draft avec le client lié au cookie de session
-- (lib/supabase/server-client.ts, clé anon + JWT utilisateur), donc en
-- rôle PostgreSQL `authenticated`. Il touche TROIS tables en lecture,
-- pas deux :
--
--   memorials                     SupabaseMemorialRepository.findById()
--   memorial_drafts               findById() + getDraftContent()
--                                 + saveDraftContent() (UPDATE)
--   memorial_published_snapshots  findById(), 3e lecture, souvent oubliée
--
-- et, par la clause USING des policies de memorial_drafts
-- (`memorial_id in (select id from memorials ...)`), la lecture du
-- draft exige EN PLUS le privilège SELECT sur `memorials` : une
-- sous-requête de policy s'exécute avec les droits de l'appelant.
--
-- Les sections 9 et 10 ci-dessous rendent ce verdict lisible
-- directement, sans reconstituer la chaîne à la main.
-- =====================================================================

with tables_of_interest(t) as (
  values ('owners'), ('entitlements'), ('memorials'), ('memorial_drafts'),
         ('memorial_published_snapshots'), ('media'), ('messages')
),
builder_tables(t) as (
  values ('memorials'), ('memorial_drafts'), ('memorial_published_snapshots')
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

-- 1. Privilèges de table réellement détenus aujourd'hui, par rôle.
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

-- 1b. Les couples table/rôle sans AUCUN privilège : la ligne manquerait
--     ci-dessus, donc on la rend explicite plutôt qu'absente.
select '1. privileges', t || ' / ' || r, '(aucun)'
from tables_of_interest cross join roles_of_interest cross join privileges_of_interest
where to_regclass('public.' || t) is not null
  and not exists (
    select 1 from unnest(privileges_of_interest.list) p
    where has_table_privilege(r, 'public.' || t, p)
  )

union all

-- 1c. Une table attendue est-elle carrément absente du projet ?
select '1. privileges', t || ' / (table)', 'ABSENTE DU SCHEMA public'
from tables_of_interest
where to_regclass('public.' || t) is null

union all

-- 2. PUBLIC détient-il quelque chose ? (PUBLIC se propage à tous les
--    rôles ; un privilège ici invaliderait la lecture de la section 1.)
select '2. PUBLIC', t, coalesce(
  (select string_agg(a.privilege_type, ', ' order by a.privilege_type)
     from aclexplode((select relacl from pg_class where oid = ('public.' || t)::regclass)) a
    where a.grantee = 0),
  '(rien)')
from tables_of_interest
where to_regclass('public.' || t) is not null

union all

-- 3. Propriétaire de chaque table (détermine quelle entrée
--    pg_default_acl s'applique aux objets créés).
select '3. owner', t, pg_get_userbyid(relowner)
from tables_of_interest join pg_class c on c.oid = ('public.' || t)::regclass
where to_regclass('public.' || t) is not null

union all

-- 4. RLS : activée ? forcée ? (rlsforced s'applique aussi au
--    propriétaire ; son absence est normale ici.)
select '4. rls', t,
       'enabled=' || c.relrowsecurity || ' / forced=' || c.relforcerowsecurity
from tables_of_interest join pg_class c on c.oid = ('public.' || t)::regclass
where to_regclass('public.' || t) is not null

union all

-- 5. Policies existantes : commande, rôles ciblés, et les expressions
--    USING/WITH CHECK telles qu'elles sont réellement stockées.
select '5. policies', pol.tablename || ' / ' || pol.policyname,
       'cmd=' || pol.cmd
       || ' / roles=' || array_to_string(pol.roles, ',')
       || ' / permissive=' || pol.permissive
       || ' / using=' || coalesce(pol.qual, '(aucun)')
       || ' / check=' || coalesce(pol.with_check, '(aucun)')
from pg_policies pol
where pol.schemaname = 'public'
  and pol.tablename in ('owners','entitlements','memorials','memorial_drafts',
                        'memorial_published_snapshots','media','messages')

union all

-- 5b. Une table du parcours Builder sans aucune policy du tout : RLS
--     activée + zéro policy = tout est refusé, quels que soient les GRANT.
select '5. policies', t || ' / (aucune policy)', 'RLS active mais AUCUNE policy'
from builder_tables
join pg_class c on c.oid = ('public.' || t)::regclass
where to_regclass('public.' || t) is not null
  and c.relrowsecurity
  and not exists (select 1 from pg_policies p
                   where p.schemaname='public' and p.tablename = builder_tables.t)

union all

-- 6. Privilèges de COLONNE PROPRES — c'est-à-dire accordés sur une
--    colonne alors que le rôle ne détient PAS le même privilège au
--    niveau table. C'est la seule forme qui constituerait une voie
--    d'accès invisible dans la section 1.
--
--    information_schema.column_privileges liste aussi, colonne par
--    colonne, tout ce qui découle d'un GRANT de table ; ces lignes-là
--    sont écartées ici, sinon la section noierait le signal.
select '6. column_grants',
       x.table_name || '.' || x.column_name || ' / ' || x.grantee,
       string_agg(x.privilege_type, ', ' order by x.privilege_type)
       || '  [PRIVILEGE DE COLONNE PROPRE]'
from information_schema.column_privileges x
where x.table_schema = 'public'
  and x.table_name in ('owners','entitlements','memorials','memorial_drafts',
                       'memorial_published_snapshots','media','messages')
  and x.grantee in ('PUBLIC','anon','authenticated','service_role')
  and not has_table_privilege(
        case when x.grantee = 'PUBLIC' then 'public' else x.grantee end,
        ('public.' || x.table_name)::regclass, x.privilege_type)
group by x.table_name, x.column_name, x.grantee

union all

select '6. column_grants', '(aucun)',
       'aucun privilege de colonne propre : rien qui n echappe a la section 1'
where not exists (
  select 1 from information_schema.column_privileges x
  where x.table_schema='public'
    and x.table_name in ('owners','entitlements','memorials','memorial_drafts',
                         'memorial_published_snapshots','media','messages')
    and x.grantee in ('PUBLIC','anon','authenticated','service_role')
    and not has_table_privilege(
          case when x.grantee = 'PUBLIC' then 'public' else x.grantee end,
          ('public.' || x.table_name)::regclass, x.privilege_type)
)

union all

-- 7. Fonctions impliquées : mode de sécurité, search_path épinglé ou
--    non, propriétaire (ce que DEFINER exécute réellement), et EXECUTE.
--
--    current_owner_id() est la pièce maîtresse : en SECURITY DEFINER
--    (Mission 013C) les policies owner-scoped n'exigent AUCUN privilège
--    sur `owners`. Si le projet réel porte encore la version INVOKER de
--    Mission 002, la recommandation change.
select '7. functions', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
       'secdef=' || p.prosecdef
       || ' / owner=' || pg_get_userbyid(p.proowner)
       || ' / ' || coalesce(array_to_string(p.proconfig, ','), 'search_path=(NON EPINGLE)')
       || ' / PUBLIC=' || coalesce((select true from aclexplode(p.proacl) a where a.grantee = 0 limit 1), false)
       || ' / anon=' || has_function_privilege('anon', p.oid, 'EXECUTE')
       || ' / authenticated=' || has_function_privilege('authenticated', p.oid, 'EXECUTE')
       || ' / service_role=' || has_function_privilege('service_role', p.oid, 'EXECUTE')
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('current_owner_id','create_memorial_draft','set_updated_at',
                    'public_memorial_publication_state','redeem_entitlement',
                    'redeem_entitlement_with_activation_key',
                    'admin_mutate_activation_key','admin_revoke_entitlement',
                    'record_heritage_activation_attempt')

union all

-- 7b. Une fonction attendue est-elle absente ? (dit quelles migrations
--     manquent, sans rien supposer.)
select '7. functions', f.name || '()', 'ABSENTE'
from (values ('current_owner_id'),('create_memorial_draft'),('set_updated_at'),
             ('public_memorial_publication_state'),('redeem_entitlement'),
             ('redeem_entitlement_with_activation_key')) as f(name)
where not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                   where n.nspname='public' and p.proname = f.name)

union all

-- 7c. Le trigger qui garantit « un memorial => un draft ». S'il manque,
--     un memorial peut exister sans ligne de draft, et le parcours
--     Builder tombe sur `draftAnomaly` — pas sur un problème de droits.
select '7. functions', 'trigger memorials_create_draft',
       case when exists (select 1 from pg_trigger tg
                          where tg.tgrelid = 'public.memorials'::regclass
                            and tg.tgname = 'memorials_create_draft'
                            and not tg.tgisinternal)
            then 'PRESENT' else 'ABSENT -> draft non garanti' end
where to_regclass('public.memorials') is not null

union all

-- 8. Objets exposés par PostgREST autres que ces tables (vue ou RPC qui
--    constituerait une seconde voie d'accès au draft, déjà existante).
select '8. autres_acces', c.relkind::text || ' ' || c.relname,
       'authenticated: '
       || case when has_table_privilege('authenticated', c.oid, 'SELECT') then 'SELECT ' else '' end
       || case when has_table_privilege('authenticated', c.oid, 'UPDATE') then 'UPDATE' else '' end
       || case when not has_table_privilege('authenticated', c.oid, 'SELECT')
                and not has_table_privilege('authenticated', c.oid, 'UPDATE') then '(aucun)' else '' end
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('v','m','f','p')

union all

select '8. autres_acces', '(aucune vue)', 'aucune vue/vue materialisee dans public'
where not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
                   where n.nspname='public' and c.relkind in ('v','m','f','p'))

union all

-- =====================================================================
-- 9. VERDICT PAR PRIVILÈGE — la chaîne exacte du parcours Builder
-- =====================================================================
-- Chaque ligne = un privilège dont le parcours dépend réellement, avec
-- l'opération applicative qui le consomme. « MANQUANT » ici est
-- exactement ce que la migration de suivi devra ouvrir, ni plus ni moins.
select '9. verdict_builder', v.besoin,
       case when has_table_privilege('authenticated', 'public.' || v.tbl, v.priv)
            then 'OK (deja detenu)' else 'MANQUANT' end
from (values
  ('memorials',                    'SELECT', 'authenticated SELECT memorials  -> findById() + sous-requete des policies de memorial_drafts'),
  ('memorial_drafts',              'SELECT', 'authenticated SELECT memorial_drafts -> getDraftContent() + le WHERE et le RETURNING de saveDraftContent()'),
  ('memorial_drafts',              'UPDATE', 'authenticated UPDATE memorial_drafts -> saveDraftContent() (autosave)'),
  ('memorial_published_snapshots', 'SELECT', 'authenticated SELECT memorial_published_snapshots -> 3e lecture de findById() (souvent oubliee)')
) as v(tbl, priv, besoin)
where to_regclass('public.' || v.tbl) is not null

union all

-- 9b. Ce qui NE DOIT PAS être ouvert : contrôles de non-élargissement.
--     Ces lignes doivent toutes dire « OK » avant ET après la migration.
select '9. verdict_builder', c.libelle,
       case when c.ouvert then 'ELARGISSEMENT A EXPLIQUER' else 'OK (ferme)' end
from (values
  (has_table_privilege('authenticated','public.memorial_drafts','INSERT'),
   'authenticated INSERT memorial_drafts -> NON requis (trigger create_memorial_draft SECURITY DEFINER)'),
  (has_table_privilege('authenticated','public.memorial_drafts','DELETE'),
   'authenticated DELETE memorial_drafts -> NON requis'),
  (has_table_privilege('authenticated','public.memorials','UPDATE'),
   'authenticated UPDATE memorials -> NON requis par le parcours 021'),
  (has_table_privilege('authenticated','public.entitlements','SELECT'),
   'authenticated SELECT entitlements -> NON requis (protege activation_key_hash)'),
  (has_table_privilege('anon','public.memorial_drafts','SELECT'),
   'anon SELECT memorial_drafts -> JAMAIS'),
  (has_table_privilege('anon','public.memorials','SELECT'),
   'anon SELECT memorials -> JAMAIS'),
  (has_table_privilege('anon','public.memorial_published_snapshots','SELECT'),
   'anon SELECT memorial_published_snapshots -> pas encore (mission moderation/publication)')
) as c(ouvert, libelle)

union all

-- 9c. Effet de bord à arbitrer explicitement : accorder SELECT sur
--     memorial_published_snapshots à `authenticated` active aussi la
--     policy memorial_published_snapshots_select_public pour tout compte
--     connecte (lecture du contenu DEJA PUBLIE de n'importe quel
--     memorial). anon reste ferme. A valider par le QG.
select '9. verdict_builder', 'effet de bord: policy _select_public sur memorial_published_snapshots',
       case when exists (select 1 from pg_policies p
                          where p.schemaname='public'
                            and p.tablename='memorial_published_snapshots'
                            and p.policyname='memorial_published_snapshots_select_public')
            then 'POLICY PRESENTE -> le GRANT a authenticated l ACTIVERA (contenu publie uniquement ; anon reste ferme)'
            else 'policy absente -> aucun effet de bord' end

union all

-- 10. Quel état de migration porte réellement le projet ?
select '10. migrations', 'modele de privileges 20260901190000 (013C)',
       case when has_table_privilege('service_role','public.entitlements','UPDATE')
                 and not has_table_privilege('anon','public.entitlements','TRUNCATE')
            then 'APPLIQUEE (ou equivalent)'
            else 'PAS APPLIQUEE -> l audit 021A repose sur elle, signaler au QG' end

union all

select '10. migrations', 'current_owner_id() SECURITY DEFINER (013C)',
       coalesce((select case when p.prosecdef then 'DEFINER -> aucun GRANT sur owners necessaire'
                             else 'INVOKER -> authenticated exigerait AUSSI SELECT sur owners' end
                   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='public' and p.proname='current_owner_id'),
                'FONCTION ABSENTE')

union all

select '10. migrations', 'create_memorial_draft() SECURITY DEFINER (013C)',
       coalesce((select case when p.prosecdef then 'DEFINER -> aucun INSERT sur memorial_drafts necessaire'
                             else 'INVOKER -> la creation du draft depend des droits de l inserteur' end
                   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='public' and p.proname='create_memorial_draft'),
                'FONCTION ABSENTE')

union all

select '10. migrations', 'admin_audit_events (015B)',
       case when to_regclass('public.admin_audit_events') is not null then 'PRESENTE' else 'ABSENTE' end

union all

select '10. migrations', 'activation_rate_limits (019C)',
       case when to_regclass('public.activation_rate_limits') is not null then 'PRESENTE' else 'ABSENTE' end

union all

-- 11. Volumes : y a-t-il des données réelles derrière ces droits ?
select '11. donnees', 'owners',       count(*)::text from owners
union all select '11. donnees', 'entitlements', count(*)::text from entitlements
union all select '11. donnees', 'memorials',    count(*)::text from memorials
union all select '11. donnees', 'memorial_drafts', count(*)::text from memorial_drafts

union all

-- 11b. Invariant « un memorial => un draft » : un écart ici expliquerait
--      un `draftAnomaly` qui n'a rien à voir avec les privilèges.
select '11. donnees', 'memorials SANS ligne memorial_drafts', count(*)::text
from memorials m
where not exists (select 1 from memorial_drafts d where d.memorial_id = m.id)

union all

-- 12. Version du serveur (MAINTAIN n'existe qu'à partir de 17).
select '12. version', 'server_version', version()

order by 1, 2;
