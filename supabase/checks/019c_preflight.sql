-- =====================================================================
-- MISSION 019C — PRÉFLIGHT (LECTURE SEULE)
-- =====================================================================
--
-- À exécuter dans le SQL Editor Supabase AVANT d'appliquer
-- supabase/migrations/20260905100000_activation_rate_limit.sql.
-- Cette requête ne modifie RIEN : aucun GRANT, aucun REVOKE, aucun
-- CREATE, aucun UPDATE. Elle lit uniquement les catalogues.
--
-- Compagnon de supabase/checks/013c_preflight.sql et
-- supabase/checks/015b_preflight.sql — ne les remplace pas.
--
-- Elle renvoie UN SEUL tableau de résultats, à copier tel quel et à
-- renvoyer pour relecture. Aucune interprétation n'est demandée à qui
-- l'exécute.
-- =====================================================================

select
  '1. table_activation_rate_limits' as section,
  'existe deja ?' as objet,
  case when to_regclass('public.activation_rate_limits') is not null
       then 'OUI -> STOP et signaler avant toute migration'
       else 'NON -> attendu' end as detail

union all

select '2. fonction', 'record_heritage_activation_attempt',
       case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                          where n.nspname = 'public' and p.proname = 'record_heritage_activation_attempt')
            then 'EXISTE DEJA -> STOP et signaler'
            else 'ABSENTE -> attendu' end

union all

-- Prérequis : le modèle de privilèges 013C doit déjà être en place et
-- service_role doit exister avec BYPASSRLS (comme partout ailleurs dans
-- ce schéma).
select '3. prerequis', 'service_role existe avec BYPASSRLS',
       coalesce((select rolbypassrls::text from pg_roles where rolname = 'service_role'), 'ROLE ABSENT')

union all

select '3. prerequis', 'roles anon/authenticated existent',
       (exists (select 1 from pg_roles where rolname = 'anon'))::text || ',' ||
       (exists (select 1 from pg_roles where rolname = 'authenticated'))::text
       || ' (anon,authenticated)'

union all

-- Volume : aucune table existante n'est affectée par cette migration ;
-- consigné quand même par cohérence avec 013C/015B.
select '4. donnees', 'owners', count(*)::text from owners
union all select '4. donnees', 'entitlements', count(*)::text from entitlements

union all

select '5. version', 'server_version', version()

order by 1, 2;
