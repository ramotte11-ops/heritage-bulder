-- =====================================================================
-- MISSION 029B — PRÉFLIGHT (LECTURE SEULE)
-- =====================================================================
--
-- À exécuter dans le SQL Editor Supabase AVANT d'appliquer
-- supabase/migrations/20260909130000_memorial_skin_variant.sql.
--
-- Cette requête ne modifie RIEN : aucun GRANT, aucun REVOKE, aucun
-- CREATE, aucun INSERT, aucun UPDATE, aucun DROP. Elle lit uniquement
-- les catalogues et compte des lignes.
--
-- Compagnon de supabase/checks/013c_preflight.sql, 015b_preflight.sql,
-- 019c_preflight.sql et 030_preflight.sql — ne les remplace pas.
--
-- Elle renvoie UN SEUL tableau de résultats, à copier tel quel et à
-- renvoyer pour relecture. Aucune interprétation n'est demandée à qui
-- l'exécute.
--
-- CE QUE CE PRÉFLIGHT DOIT ÉTABLIR AVANT TOUTE APPLICATION :
--
--   1. la colonne memorials.skin_variant n'existe pas encore ;
--   2. combien de lignes memorials existent déjà (la doctrine QG —
--      section 6 — suppose 0 ligne historique ; toute ligne réelle
--      trouvée ici sera backfillée à 'light' par la migration, et doit
--      être relue par le QG avant application) ;
--   3. la forme EXACTE, aujourd'hui, de redeem_entitlement() et
--      redeem_entitlement_with_activation_key() (la migration les
--      DROP puis recrée avec un paramètre p_skin_variant supplémentaire
--      — ce préflight prouve qu'elles ont bien la forme à 4/5
--      arguments que la migration s'attend à trouver, jamais une forme
--      déjà élargie par une exécution précédente) ;
--   4. les privilèges EXECUTE actuels sur ces deux fonctions.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. La colonne skin_variant existe-t-elle déjà ?
-- ---------------------------------------------------------------------
select '1. colonne' as section, 'memorials.skin_variant existe deja ?' as objet,
       case when exists (select 1 from information_schema.columns
                          where table_schema = 'public' and table_name = 'memorials'
                            and column_name = 'skin_variant')
            then 'OUI -> STOP et signaler (la migration s''attend a l''ajouter)'
            else 'NON -> attendu' end as detail

union all

-- ---------------------------------------------------------------------
-- 2. État de la table memorials AVANT modification
-- ---------------------------------------------------------------------
select '2. table memorials', 'lignes existantes',
       coalesce((select count(*)::text from memorials), 'n/a')
       || ' (0 attendu selon la doctrine QG section 6 ; >0 -> ces lignes seront'
       || ' backfillees a ''light'' par la migration, a confirmer avant application)'

union all

-- ---------------------------------------------------------------------
-- 3. Forme actuelle des deux fonctions de redemption
-- ---------------------------------------------------------------------
select '3. fonctions', 'redeem_entitlement : nombre de surcharges',
       coalesce((select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'redeem_entitlement'), '0')
       || ' (1 attendu avant migration)'

union all

select '3. fonctions', 'redeem_entitlement : signature',
       coalesce((select pg_get_function_identity_arguments(p.oid)
                   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'redeem_entitlement'), 'FONCTION ABSENTE')
       || ' (attendu avant migration : uuid, uuid, text, text — 4 arguments, sans variant)'

union all

select '3. fonctions', 'redeem_entitlement_with_activation_key : nombre de surcharges',
       coalesce((select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'redeem_entitlement_with_activation_key'), '0')
       || ' (1 attendu avant migration)'

union all

select '3. fonctions', 'redeem_entitlement_with_activation_key : signature',
       coalesce((select pg_get_function_identity_arguments(p.oid)
                   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'redeem_entitlement_with_activation_key'), 'FONCTION ABSENTE')
       || ' (attendu avant migration : uuid, text, uuid, text, text — 5 arguments, sans variant)'

union all

-- ---------------------------------------------------------------------
-- 4. Privilèges EXECUTE actuels
-- ---------------------------------------------------------------------
select '4. privileges', 'redeem_entitlement : EXECUTE ' || r,
       coalesce((select has_function_privilege(r, p.oid, 'EXECUTE')::text
                   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'redeem_entitlement' limit 1), 'FONCTION ABSENTE')
       || case when r = 'service_role' then ' (true attendu)' else ' (false attendu)' end
from (values ('anon'), ('authenticated'), ('service_role')) as roles(r)

union all

select '4. privileges', 'redeem_entitlement_with_activation_key : EXECUTE ' || r,
       coalesce((select has_function_privilege(r, p.oid, 'EXECUTE')::text
                   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'redeem_entitlement_with_activation_key' limit 1), 'FONCTION ABSENTE')
       || case when r = 'service_role' then ' (true attendu)' else ' (false attendu)' end
from (values ('anon'), ('authenticated'), ('service_role')) as roles(r)

union all

-- ---------------------------------------------------------------------
-- 5. Prérequis
-- ---------------------------------------------------------------------
select '5. prerequis', 'table memorials presente',
       case when to_regclass('public.memorials') is not null
            then 'OUI -> attendu' else 'NON -> STOP' end

union all

select '6. version', 'server_version', version()

order by 1, 2, 3;
