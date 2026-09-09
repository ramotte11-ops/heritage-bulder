-- =====================================================================
-- MISSION 030 — PRÉFLIGHT (LECTURE SEULE)
-- =====================================================================
--
-- À exécuter dans le SQL Editor Supabase AVANT d'appliquer
-- supabase/migrations/20260909120000_media_storage.sql.
--
-- Cette requête ne modifie RIEN : aucun GRANT, aucun REVOKE, aucun
-- CREATE, aucun INSERT, aucun UPDATE. Elle lit uniquement les
-- catalogues et compte des lignes.
--
-- Compagnon de supabase/checks/013c_preflight.sql,
-- 015b_preflight.sql et 019c_preflight.sql — ne les remplace pas.
--
-- Elle renvoie UN SEUL tableau de résultats, à copier tel quel et à
-- renvoyer pour relecture. Aucune interprétation n'est demandée à qui
-- l'exécute.
--
-- CE QUE CE PRÉFLIGHT DOIT ÉTABLIR AVANT TOUTE APPLICATION :
--
--   1. l'état réel du bucket memorial-media (existe ? public ?) ;
--   2. l'inventaire COMPLET des policies déjà présentes sur
--      storage.objects — c'est le point de sécurité le plus important
--      de cette mission : les policies Storage sont écrites sur UNE
--      table partagée, donc une policy permissive créée par le
--      dashboard, un quickstart ou une autre fonctionnalité
--      s'appliquerait AUSSI à nos médias privés ;
--   3. la forme réelle de storage.buckets (les colonnes
--      file_size_limit / allowed_mime_types existent-elles sur cette
--      version de Storage ?) ;
--   4. l'état de la table media avant modification.
-- =====================================================================

with storage_present(v) as (
  select to_regclass('storage.buckets') is not null
     and to_regclass('storage.objects') is not null
)

-- ---------------------------------------------------------------------
-- 1. Le schéma Storage est-il présent et lisible ?
-- ---------------------------------------------------------------------
select
  '1. storage' as section,
  'schema storage accessible' as objet,
  case when (select v from storage_present)
       then 'OUI -> attendu'
       else 'NON -> STOP : Storage indisponible ou non lisible par ce role' end as detail

union all

-- ---------------------------------------------------------------------
-- 2. Le bucket memorial-media existe-t-il déjà, et est-il public ?
-- ---------------------------------------------------------------------
select '2. bucket', 'memorial-media existe deja ?',
       coalesce(
         (select case when public then 'OUI ET PUBLIC -> STOP et signaler avant migration'
                      else 'OUI, deja prive -> la migration le laissera prive' end
            from storage.buckets where id = 'memorial-media'),
         'NON -> attendu, la migration le creera prive')

union all

-- Inventaire de TOUS les buckets : un bucket public déjà présent dans le
-- projet n'est pas bloquant en soi, mais le QG doit le voir.
select '2. bucket', 'inventaire buckets (id/public)',
       coalesce(
         (select string_agg(id || '=' || case when public then 'PUBLIC' else 'prive' end, ', '
                            order by id)
            from storage.buckets),
         'aucun bucket')

union all

select '2. bucket', 'nombre de buckets publics',
       coalesce((select count(*)::text from storage.buckets where public), '0')
       || ' (chaque bucket public doit etre justifie ; les originaux HERITAGE ne doivent jamais y etre)'

union all

-- ---------------------------------------------------------------------
-- 3. Policies existantes sur storage.objects — LE POINT CRITIQUE
-- ---------------------------------------------------------------------
--
-- Mission 030 choisit le modèle B : AUCUNE policy, donc aucun accès
-- client. Ce modèle n'est valable que si aucune policy permissive
-- préexistante ne couvre déjà notre bucket.
select '3. policies storage', 'nombre de policies sur storage.objects',
       coalesce((select count(*)::text from pg_policies
                  where schemaname = 'storage' and tablename = 'objects'), '0')
       || ' (0 = attendu ; toute policy existante doit etre relue ci-dessous)'

union all

select '3. policies storage', 'detail policy: ' || policyname,
       'roles=' || array_to_string(roles, '/') || ' cmd=' || cmd
       || ' using=' || coalesce(replace(qual, E'\n', ' '), '(aucun)')
       || ' check=' || coalesce(replace(with_check, E'\n', ' '), '(aucun)')
from pg_policies
where schemaname = 'storage' and tablename = 'objects'

union all

-- Une policy sans restriction de bucket s'applique à TOUS les buckets,
-- donc au nôtre.
select '3. policies storage', 'policies ne filtrant AUCUN bucket',
       coalesce((select count(*)::text from pg_policies
                  where schemaname = 'storage' and tablename = 'objects'
                    and coalesce(qual, '') not like '%bucket_id%'
                    and coalesce(with_check, '') not like '%bucket_id%'), '0')
       || ' (>0 -> STOP : ces policies couvriraient aussi memorial-media)'

union all

select '3. policies storage', 'RLS active sur storage.objects',
       coalesce((select relrowsecurity::text from pg_class
                  where oid = to_regclass('storage.objects')), 'TABLE ABSENTE')
       || ' (t = attendu ; f -> STOP, "aucune policy" ne voudrait plus dire "aucun acces")'

union all

-- ---------------------------------------------------------------------
-- 4. Forme réelle de storage.buckets sur CETTE version de Storage
-- ---------------------------------------------------------------------
--
-- La migration écrit file_size_limit et allowed_mime_types uniquement
-- si les colonnes existent. Ce bloc dit au QG ce qui sera réellement
-- appliqué.
select '4. schema storage.buckets', 'colonne ' || c,
       case when exists (select 1 from information_schema.columns
                          where table_schema = 'storage' and table_name = 'buckets'
                            and column_name = c)
            then 'PRESENTE -> la migration l''utilisera'
            else 'ABSENTE -> limite appliquee par l''application uniquement' end
from (values ('public'), ('file_size_limit'), ('allowed_mime_types')) as cols(c)

union all

-- ---------------------------------------------------------------------
-- 5. Objets déjà stockés
-- ---------------------------------------------------------------------
select '5. objets', 'objets deja presents dans memorial-media',
       coalesce((select count(*)::text from storage.objects
                  where bucket_id = 'memorial-media'), '0')
       || ' (0 attendu : aucun upload n''a jamais ete construit)'

union all

-- ---------------------------------------------------------------------
-- 6. État de la table media AVANT modification
-- ---------------------------------------------------------------------
select '6. table media', 'table media existe',
       case when to_regclass('public.media') is not null
            then 'OUI -> attendu (Mission 002), elle sera REUTILISEE et non remplacee'
            else 'NON -> STOP : la migration 20260829156000_media.sql n''est pas appliquee' end

union all

select '6. table media', 'lignes existantes',
       coalesce((select count(*)::text from media), 'n/a')
       || ' (0 attendu ; >0 -> les colonnes purpose/status prendront leurs valeurs par defaut'
       || ' gallery/pending, a relire avant application)'

union all

select '6. table media', 'colonne ' || c || ' deja presente ?',
       case when exists (select 1 from information_schema.columns
                          where table_schema = 'public' and table_name = 'media'
                            and column_name = c)
            then 'OUI -> STOP et signaler (la migration s''attend a l''ajouter)'
            else 'NON -> attendu' end
from (values ('purpose'), ('status'), ('updated_at')) as cols(c)

union all

select '6. table media', 'size_bytes actuellement NOT NULL ?',
       coalesce((select case when is_nullable = 'NO' then 'OUI -> attendu, la migration la rendra nullable'
                             else 'NON -> deja nullable, signaler' end
                   from information_schema.columns
                  where table_schema = 'public' and table_name = 'media'
                    and column_name = 'size_bytes'), 'COLONNE ABSENTE -> STOP')

union all

-- ---------------------------------------------------------------------
-- 7. Privilèges actuels sur media (état 013C attendu : tout fermé)
-- ---------------------------------------------------------------------
select '7. privileges media', r || ' ' || p,
       has_table_privilege(r, 'public.media', p)::text
       || case when r = 'service_role' then ' (f attendu avant migration ; la migration ouvre les 4)'
               else ' (f attendu AVANT ET APRES : aucun role client ne touche media)' end
from (values ('anon'), ('authenticated'), ('service_role')) as roles(r)
cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) as privs(p)

union all

select '7. privileges media', 'policy media_all_own presente',
       coalesce((select count(*)::text from pg_policies
                  where schemaname = 'public' and tablename = 'media'
                    and policyname = 'media_all_own'), '0')
       || ' (1 attendu, Mission 002 ; la migration 030 la laisse intacte)'

union all

-- ---------------------------------------------------------------------
-- 8. Prérequis de rôles et version
-- ---------------------------------------------------------------------
select '8. prerequis', 'service_role existe avec BYPASSRLS',
       coalesce((select rolbypassrls::text from pg_roles where rolname = 'service_role'),
                'ROLE ABSENT -> STOP')

union all

select '8. prerequis', 'fonction set_updated_at presente',
       case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                          where n.nspname = 'public' and p.proname = 'set_updated_at')
            then 'OUI -> attendu (le trigger media_set_updated_at en depend)'
            else 'NON -> STOP' end

union all

select '9. version', 'server_version', version()

order by 1, 2, 3;
