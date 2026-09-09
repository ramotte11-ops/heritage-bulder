-- =====================================================================
-- MISSION 029B — POSTFLIGHT (LECTURE SEULE)
-- =====================================================================
--
-- À exécuter dans le SQL Editor Supabase APRÈS avoir appliqué :
--
--   supabase/migrations/20260909130000_memorial_skin_variant.sql
--
-- Cette requête ne modifie RIEN. Elle renvoie UN SEUL tableau où chaque
-- ligne porte sa propre conclusion dans la colonne `verdict` :
--
--   OK       -> conforme
--   ECHEC    -> non conforme, ne pas continuer, renvoyer le tableau
--   INFO     -> non applicable / purement informatif
--
-- Compagnon de supabase/checks/013c_postflight.sql, 015b_postflight.sql,
-- 019c_postflight.sql et 030_postflight.sql — ne les remplace pas.
-- =====================================================================

-- pg_get_function_identity_arguments() reconstructs each parameter with
-- its declared name, not merely its type (verified against this exact
-- migration's functions) — the expected strings below match that.
with fn(name, args, arity) as (
  values
    ('redeem_entitlement',
     'p_entitlement_id uuid, p_owner_id uuid, p_memorial_type text, p_skin_id text, p_skin_variant text',
     5),
    ('redeem_entitlement_with_activation_key',
     'p_entitlement_id uuid, p_expected_key_hash text, p_owner_id uuid, p_memorial_type text, p_skin_id text, p_skin_variant text',
     6)
)

-- ---------------------------------------------------------------------
-- A. LA COLONNE — l'assertion la plus importante
-- ---------------------------------------------------------------------
select 'A. colonne' as bloc, 'memorials.skin_variant existe' as controle,
       'doit exister' as attendu,
       case when exists (select 1 from information_schema.columns
                          where table_schema = 'public' and table_name = 'memorials'
                            and column_name = 'skin_variant')
            then 'presente' else 'ABSENTE' end as constate,
       case when exists (select 1 from information_schema.columns
                          where table_schema = 'public' and table_name = 'memorials'
                            and column_name = 'skin_variant')
            then 'OK' else 'ECHEC' end as verdict

union all

select 'A. colonne', 'memorials.skin_variant est NOT NULL', 'NO',
       coalesce((select is_nullable from information_schema.columns
                  where table_schema = 'public' and table_name = 'memorials'
                    and column_name = 'skin_variant'), 'COLONNE ABSENTE'),
       case when (select is_nullable from information_schema.columns
                   where table_schema = 'public' and table_name = 'memorials'
                     and column_name = 'skin_variant') = 'NO'
            then 'OK' else 'ECHEC' end

union all

select 'A. colonne', 'memorials.skin_variant a une colonne DEFAULT', 'aucun (NULL)',
       coalesce((select column_default from information_schema.columns
                  where table_schema = 'public' and table_name = 'memorials'
                    and column_name = 'skin_variant'), '(aucun)'),
       case when (select column_default from information_schema.columns
                   where table_schema = 'public' and table_name = 'memorials'
                     and column_name = 'skin_variant') is null
            then 'OK' else 'ECHEC — un DEFAULT permanent existe, contraire a la doctrine QG section 6' end

union all

-- ---------------------------------------------------------------------
-- B. LA CONTRAINTE
-- ---------------------------------------------------------------------
select 'B. contrainte', 'memorials_skin_variant_check presente', '1',
       coalesce((select count(*)::text from pg_constraint
                  where conrelid = 'public.memorials'::regclass
                    and conname = 'memorials_skin_variant_check'), '0'),
       case when (select count(*) from pg_constraint
                   where conrelid = 'public.memorials'::regclass
                     and conname = 'memorials_skin_variant_check') = 1
            then 'OK' else 'ECHEC' end

union all

select 'B. contrainte', 'definition exacte de memorials_skin_variant_check',
       'CHECK ((skin_variant = ANY (ARRAY[''light''::text, ''dark''::text])))',
       coalesce((select pg_get_constraintdef(oid) from pg_constraint
                  where conrelid = 'public.memorials'::regclass
                    and conname = 'memorials_skin_variant_check'), 'CONTRAINTE ABSENTE'),
       case when (select pg_get_constraintdef(oid) from pg_constraint
                   where conrelid = 'public.memorials'::regclass
                     and conname = 'memorials_skin_variant_check')
                 = 'CHECK ((skin_variant = ANY (ARRAY[''light''::text, ''dark''::text])))'
            then 'OK' else 'ECHEC' end

union all

-- Défense en profondeur : même si la contrainte ci-dessus est absente ou
-- mal formée, cette ligne relit directement les données.
select 'B. contrainte', 'lignes memorials avec une valeur hors light/dark', '0',
       (select count(*)::text from memorials where skin_variant not in ('light', 'dark')),
       case when (select count(*) from memorials where skin_variant not in ('light', 'dark')) = 0
            then 'OK' else 'ECHEC' end

union all

-- ---------------------------------------------------------------------
-- C. LE BACKFILL — informatif, jamais bloquant en soi
-- ---------------------------------------------------------------------
select 'C. backfill', 'repartition light/dark actuelle', 'n/a (informatif)',
       coalesce((select string_agg(skin_variant || '=' || cnt::text, ', ' order by skin_variant)
                   from (select skin_variant, count(*) as cnt from memorials
                          group by skin_variant) t), '(table memorials vide)'),
       'INFO'

union all

-- ---------------------------------------------------------------------
-- D. LES DEUX FONCTIONS — signature, arité, une seule surcharge chacune
-- ---------------------------------------------------------------------
select 'D. fonctions', fn.name || ' : exactement une surcharge', '1',
       (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = fn.name),
       case when (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'public' and p.proname = fn.name) = 1
            then 'OK' else 'ECHEC' end
from fn

union all

select 'D. fonctions', fn.name || ' : signature widened avec p_skin_variant', fn.args,
       coalesce((select pg_get_function_identity_arguments(p.oid)
                   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = fn.name), 'FONCTION ABSENTE'),
       case when (select pg_get_function_identity_arguments(p.oid)
                    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'public' and p.proname = fn.name) = fn.args
            then 'OK' else 'ECHEC' end
from fn

union all

-- L'ancienne forme (sans variant) ne doit plus exister du tout — ni en
-- 4/5-arguments, ni conserver ses anciens privilèges par accident.
select 'D. fonctions', 'redeem_entitlement : ancienne forme (4 arguments) absente', '0',
       (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'redeem_entitlement'
           and pg_get_function_identity_arguments(p.oid)
             = 'p_entitlement_id uuid, p_owner_id uuid, p_memorial_type text, p_skin_id text'),
       case when (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'public' and p.proname = 'redeem_entitlement'
                     and pg_get_function_identity_arguments(p.oid)
                       = 'p_entitlement_id uuid, p_owner_id uuid, p_memorial_type text, p_skin_id text') = 0
            then 'OK' else 'ECHEC' end

union all

select 'D. fonctions', 'redeem_entitlement_with_activation_key : ancienne forme (5 arguments) absente', '0',
       (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'redeem_entitlement_with_activation_key'
           and pg_get_function_identity_arguments(p.oid)
             = 'p_entitlement_id uuid, p_expected_key_hash text, p_owner_id uuid, p_memorial_type text, p_skin_id text'),
       case when (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'public' and p.proname = 'redeem_entitlement_with_activation_key'
                     and pg_get_function_identity_arguments(p.oid)
                       = 'p_entitlement_id uuid, p_expected_key_hash text, p_owner_id uuid, p_memorial_type text, p_skin_id text') = 0
            then 'OK' else 'ECHEC' end

union all

-- ---------------------------------------------------------------------
-- E. SECURITY INVOKER (jamais DEFINER) et search_path epingle
-- ---------------------------------------------------------------------
select 'E. fonctions', fn.name || ' security_definer', 'false',
       coalesce((select p.prosecdef::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = fn.name), 'FONCTION ABSENTE'),
       case when (select p.prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'public' and p.proname = fn.name) = false
            then 'OK' else 'ECHEC' end
from fn

union all

select 'E. fonctions', fn.name || ' search_path', 'search_path=public',
       coalesce((select array_to_string(p.proconfig, ',') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = fn.name), '(non epingle)'),
       case when (select array_to_string(p.proconfig, ',') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'public' and p.proname = fn.name) = 'search_path=public'
            then 'OK' else 'ECHEC' end
from fn

union all

-- ---------------------------------------------------------------------
-- F. EXECUTE : service_role seulement, jamais PUBLIC/anon/authenticated
-- ---------------------------------------------------------------------
select 'F. EXECUTE', g.fn || ' ' || g.role_name, (case when g.want then 'doit' else 'ne doit PAS' end),
       coalesce((select has_function_privilege(g.role_name, p.oid, 'EXECUTE')::text
                   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = g.fn limit 1), 'FONCTION ABSENTE'),
       case when (select has_function_privilege(g.role_name, p.oid, 'EXECUTE')
                    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'public' and p.proname = g.fn limit 1) = g.want
            then 'OK' else 'ECHEC' end
from (values
  ('redeem_entitlement','service_role',true),
  ('redeem_entitlement','anon',false),
  ('redeem_entitlement','authenticated',false),
  ('redeem_entitlement_with_activation_key','service_role',true),
  ('redeem_entitlement_with_activation_key','anon',false),
  ('redeem_entitlement_with_activation_key','authenticated',false)
) as g(fn, role_name, want)

union all

select 'F. EXECUTE', 'PUBLIC ' || fn.name, 'aucun EXECUTE',
       coalesce((select true from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   cross join lateral aclexplode(p.proacl) a
                  where n.nspname = 'public' and p.proname = fn.name and a.grantee = 0 limit 1), false)::text,
       case when coalesce((select true from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                             cross join lateral aclexplode(p.proacl) a
                            where n.nspname = 'public' and p.proname = fn.name and a.grantee = 0 limit 1), false)
            then 'ECHEC' else 'OK' end
from fn

union all

-- ---------------------------------------------------------------------
-- G. AUCUNE RLS / POLICY / GRANT TOUCHÉE AILLEURS — section 16
-- ---------------------------------------------------------------------
-- Le nombre de policies sur memorials doit rester exactement celui de
-- Mission 002/021B (select own + update own) : cette migration n'en
-- ajoute, n'en modifie et n'en retire aucune.
select 'G. non-consequence', 'nombre de policies sur memorials', '2',
       (select count(*)::text from pg_policies
         where schemaname = 'public' and tablename = 'memorials'),
       case when (select count(*) from pg_policies
                   where schemaname = 'public' and tablename = 'memorials') = 2
            then 'OK' else 'ECHEC' end

union all

-- NOTE: `has_table_privilege(..., 'UPDATE')` alone is NOT the right test
-- here — Missions 023/024 already granted `authenticated` a genuine,
-- narrow column-level UPDATE on `language` and `editorial_context`
-- (builder_language_access.sql / builder_context_access.sql), and
-- has_table_privilege('UPDATE') reads true whenever ANY column grant
-- exists, by design (see its own documentation). That is correct,
-- pre-existing behaviour this migration must NOT disturb — the actual
-- Mission 029B assertion (section 15/16: no UI, so no write grant was
-- opened for skin_variant) has to be column-scoped instead.
select 'G. non-consequence', 'authenticated keeps SELECT on memorials, no INSERT/DELETE', 'true,false,false',
       has_table_privilege('authenticated', 'public.memorials', 'SELECT')::text || ','
       || has_table_privilege('authenticated', 'public.memorials', 'INSERT')::text || ','
       || has_table_privilege('authenticated', 'public.memorials', 'DELETE')::text,
       case when has_table_privilege('authenticated', 'public.memorials', 'SELECT')
                and not has_table_privilege('authenticated', 'public.memorials', 'INSERT')
                and not has_table_privilege('authenticated', 'public.memorials', 'DELETE')
            then 'OK' else 'ECHEC' end

union all

select 'G. non-consequence', 'authenticated has no UPDATE on skin_variant specifically (no UI — section 15)', 'false',
       has_column_privilege('authenticated', 'public.memorials', 'skin_variant', 'UPDATE')::text,
       case when not has_column_privilege('authenticated', 'public.memorials', 'skin_variant', 'UPDATE')
            then 'OK' else 'ECHEC' end

union all

-- The two genuinely-open column grants (Missions 023/024) are exactly
-- language and editorial_context — proof this migration widened neither
-- of them, and skin_variant is not a silent third member of that set.
select 'G. non-consequence', 'authenticated UPDATE is scoped to exactly {language, editorial_context}',
       'language,editorial_context',
       coalesce((select string_agg(column_name, ',' order by column_name)
                   from information_schema.column_privileges
                  where grantee = 'authenticated' and table_schema = 'public'
                    and table_name = 'memorials' and privilege_type = 'UPDATE'), '(aucune)'),
       case when (select string_agg(column_name, ',' order by column_name)
                    from information_schema.column_privileges
                   where grantee = 'authenticated' and table_schema = 'public'
                     and table_name = 'memorials' and privilege_type = 'UPDATE')
                 = 'editorial_context,language'
            then 'OK' else 'ECHEC' end

union all

select 'G. non-consequence', 'service_role garde exactement SELECT+INSERT sur memorials', 'true,true,false,false',
       has_table_privilege('service_role', 'public.memorials', 'SELECT')::text || ','
       || has_table_privilege('service_role', 'public.memorials', 'INSERT')::text || ','
       || has_table_privilege('service_role', 'public.memorials', 'UPDATE')::text || ','
       || has_table_privilege('service_role', 'public.memorials', 'DELETE')::text,
       case when has_table_privilege('service_role', 'public.memorials', 'SELECT')
                and has_table_privilege('service_role', 'public.memorials', 'INSERT')
                and not has_table_privilege('service_role', 'public.memorials', 'UPDATE')
                and not has_table_privilege('service_role', 'public.memorials', 'DELETE')
            then 'OK' else 'ECHEC' end

union all

select '9. version', 'server_version', version(), version(), 'INFO'

order by 1, 2, 3;
