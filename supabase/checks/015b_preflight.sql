-- =====================================================================
-- MISSION 015B — PRÉFLIGHT (LECTURE SEULE)
-- =====================================================================
--
-- À exécuter dans le SQL Editor Supabase AVANT d'appliquer
-- supabase/migrations/20260904100000_admin_audit_and_mutations.sql.
-- Cette requête ne modifie RIEN : aucun GRANT, aucun REVOKE, aucun
-- CREATE, aucun UPDATE. Elle lit uniquement les catalogues.
--
-- Compagnon de supabase/checks/013c_preflight.sql — ne le remplace pas
-- et n'y ajoute rien : la 8e table (admin_audit_events) a son propre
-- contrôle, comme demandé.
--
-- Elle renvoie UN SEUL tableau de résultats, à copier tel quel et à
-- renvoyer pour relecture. Aucune interprétation n'est demandée à qui
-- l'exécute.
-- =====================================================================

select
  '1. table_admin_audit_events' as section,
  'existe deja ?' as objet,
  case when to_regclass('public.admin_audit_events') is not null
       then 'OUI -> STOP et signaler avant toute migration'
       else 'NON -> attendu' end as detail

union all

select '2. fonctions', fn,
       case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                          where n.nspname = 'public' and p.proname = fn)
            then 'EXISTE DEJA -> STOP et signaler'
            else 'ABSENTE -> attendu' end
from (values ('admin_mutate_activation_key'), ('admin_revoke_entitlement')) as f(fn)

union all

-- Le modèle 013C doit déjà être en place : ces deux RPC dépendent du
-- privilège UPDATE de service_role sur entitlements, déjà accordé par
-- 20260901190000_privilege_model.sql. Si ce n'est pas le cas, cette
-- mission n'est pas prête à être appliquée.
select '3. prerequis_013c', 'service_role UPDATE sur entitlements',
       case when has_table_privilege('service_role','public.entitlements','UPDATE')
            then 'OUI -> prerequis satisfait'
            else 'NON -> STOP, appliquer 013C d''abord' end

union all

select '3. prerequis_013c', 'service_role SELECT/INSERT/UPDATE sur entitlements uniquement',
       has_table_privilege('service_role','public.entitlements','SELECT')::text || ',' ||
       has_table_privilege('service_role','public.entitlements','INSERT')::text || ',' ||
       has_table_privilege('service_role','public.entitlements','UPDATE')::text || ',' ||
       has_table_privilege('service_role','public.entitlements','DELETE')::text
       || ' (select,insert,update,delete)'

union all

select '4. colonne_activation_key_hash', 'presente ?',
       case when exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='entitlements'
                            and column_name='activation_key_hash')
            then 'OUI -> prerequis 013 satisfait'
            else 'NON -> STOP, appliquer Mission 013 d''abord' end

union all

-- Volume de données : la mission n'ajoute aucune donnée risquée
-- (nouvelle table vide), mais on le consigne quand même par cohérence
-- avec le préflight 013C.
select '5. donnees', 'entitlements', count(*)::text from entitlements
union all select '5. donnees', 'entitlements status=available', count(*)::text from entitlements where status = 'available'
union all select '5. donnees', 'entitlements status=revoked', count(*)::text from entitlements where status = 'revoked'

union all

select '6. version', 'server_version', version()

order by 1, 2;
