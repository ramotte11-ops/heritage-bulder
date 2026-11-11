-- =====================================================================
-- HERITAGE DIRECT M1-A — PRÉFLIGHT (LECTURE SEULE)
-- =====================================================================
--
-- À exécuter dans le SQL Editor Supabase AVANT d'appliquer
-- supabase/migrations/20261024180000_heritage_direct_access_foundation.sql.
--
-- Cette requête ne modifie RIEN : aucun GRANT, aucun REVOKE, aucun
-- CREATE, aucun INSERT, aucun UPDATE. Elle lit uniquement les
-- catalogues et compte des lignes. Elle ne lit aucune donnée
-- personnelle : uniquement des comptes et des empreintes de code.
--
-- Elle renvoie UN SEUL tableau de résultats, à copier tel quel et à
-- renvoyer pour relecture. Chaque ligne porte son verdict : OK, INFO ou
-- ECHEC. Un seul ECHEC = ne pas appliquer.
--
-- CE QUE CE PRÉFLIGHT ÉTABLIT :
--   1. la migration n'est pas déjà appliquée (aucun objet M1-A présent) ;
--   2. C1 est bien la dernière migration attendue avant M1-A ;
--   3. les deux triggers updated_at que la migration suspend pendant la
--      reprise existent bien (sinon la migration échouerait) ;
--   4. la photographie « avant » : comptes par canal et par statut, et
--      l'empreinte des fonctions que M1-A ne doit PAS modifier, à
--      comparer avec le postflight.
-- =====================================================================

select '1. non appliquee' as bloc,
       'colonne entitlements.access_level absente' as controle,
       'absente' as attendu,
       case when exists (select 1 from pg_attribute
                          where attrelid = 'public.entitlements'::regclass
                            and attname = 'access_level' and not attisdropped)
            then 'presente' else 'absente' end as constate,
       case when exists (select 1 from pg_attribute
                          where attrelid = 'public.entitlements'::regclass
                            and attname = 'access_level' and not attisdropped)
            then 'ECHEC — M1-A semble deja appliquee' else 'OK' end as verdict

union all

select '1. non appliquee', 'colonne memorials.access_level absente', 'absente',
       case when exists (select 1 from pg_attribute
                          where attrelid = 'public.memorials'::regclass
                            and attname = 'access_level' and not attisdropped)
            then 'presente' else 'absente' end,
       case when exists (select 1 from pg_attribute
                          where attrelid = 'public.memorials'::regclass
                            and attname = 'access_level' and not attisdropped)
            then 'ECHEC — M1-A semble deja appliquee' else 'OK' end

union all

select '1. non appliquee', 'table ' || t || ' absente', 'absente',
       case when to_regclass('public.' || t) is null then 'absente' else 'presente' end,
       case when to_regclass('public.' || t) is null then 'OK' else 'ECHEC — objet M1-A deja present' end
from (values ('memorial_access_settings'), ('memorial_access_events')) as tables(t)

union all

select '1. non appliquee', 'fonction ' || f || ' absente', 'absente',
       (select count(*)::text from pg_proc
         where pronamespace = 'public'::regnamespace and proname = f),
       case when exists (select 1 from pg_proc
                          where pronamespace = 'public'::regnamespace and proname = f)
            then 'ECHEC — objet M1-A deja present' else 'OK' end
from (values ('create_free_memorial_v1'), ('anchor_free_memorial_v1'),
             ('upgrade_memorial_access_v1'), ('memorials_inherit_access_level_v1'),
             ('guard_free_first_publication_v1'), ('guard_free_gallery_quota_v1'),
             ('guard_free_draft_gallery_v1')) as functions(f)

union all

-- ---------------------------------------------------------------------
-- 2. PRÉREQUIS
-- ---------------------------------------------------------------------
select '2. prerequis', 'C1 (offrandes) appliquee', 'table symbolic_offerings presente',
       case when to_regclass('public.symbolic_offerings') is null then 'absente' else 'presente' end,
       case when to_regclass('public.symbolic_offerings') is null
            then 'ECHEC — appliquer C1 d''abord' else 'OK' end

union all

select '2. prerequis', 'trigger ' || tg || ' present', 'present',
       (select count(*)::text from pg_trigger
         where tgname = tg and tgrelid = ('public.' || tb)::regclass and not tgisinternal),
       case when exists (select 1 from pg_trigger
                          where tgname = tg and tgrelid = ('public.' || tb)::regclass and not tgisinternal)
            then 'OK' else 'ECHEC — la migration le suspend pendant la reprise' end
from (values ('entitlements_set_updated_at', 'entitlements'),
             ('memorials_set_updated_at', 'memorials')) as triggers(tg, tb)

union all

select '2. prerequis', 'version PostgreSQL', 'informatif',
       current_setting('server_version'), 'INFO'

union all

-- ---------------------------------------------------------------------
-- 3. PHOTOGRAPHIE AVANT (à comparer avec le postflight)
-- ---------------------------------------------------------------------
select '3. avant', 'droits ' || source || ' / ' || status, 'informatif',
       count(*)::text, 'INFO'
from public.entitlements
group by source, status

union all

select '3. avant', 'memoriaux ' || status, 'informatif', count(*)::text, 'INFO'
from public.memorials
group by status

union all

-- Empreinte du code des fonctions que M1-A ne remplace pas. Le postflight
-- doit afficher exactement les mêmes valeurs.
select '3. avant', 'empreinte ' || p.proname, 'identique au postflight',
       md5(pg_get_functiondef(p.oid)), 'INFO'
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.proname in ('redeem_entitlement', 'redeem_entitlement_with_activation_key',
                    'admin_mutate_activation_key', 'admin_revoke_entitlement',
                    'commit_memorial_publication_v1')

order by 1, 2, 3;
