-- =====================================================================
-- HERITAGE HOMMAGE — Lot 2 / Signature des offrandes — POSTFLIGHT (LECTURE SEULE)
-- =====================================================================
-- À exécuter APRÈS
-- supabase/migrations/20261116120000_lot2_offering_signature.sql.
-- Ne modifie RIEN, ne lit aucune signature (seulement des comptages et le
-- catalogue). Attendu : aucun ECHEC.
-- =====================================================================

select '1. colonnes' as bloc,
       'colonnes signature (text) et signed_at (timestamptz) presentes, facultatives' as controle,
       'text|YES|timestamp with time zone|YES' as attendu,
       coalesce((select string_agg(data_type || '|' || is_nullable, '|' order by column_name)
                   from information_schema.columns
                  where table_schema = 'public' and table_name = 'symbolic_offerings' and column_name in ('signature', 'signed_at')), 'absentes') as constate,
       case when (select string_agg(data_type || '|' || is_nullable, '|' order by column_name)
                    from information_schema.columns
                   where table_schema = 'public' and table_name = 'symbolic_offerings' and column_name in ('signature', 'signed_at'))
                 = 'text|YES|timestamp with time zone|YES'
            then 'OK' else 'ECHEC' end as verdict

union all

select '1. colonnes', 'trois contraintes de forme presentes et validees', '3',
       (select count(*)::text from pg_constraint
         where conrelid = 'public.symbolic_offerings'::regclass and convalidated
           and conname in ('symbolic_offerings_signature_shape', 'symbolic_offerings_signature_signed_at', 'symbolic_offerings_signed_after_created')),
       case when (select count(*) from pg_constraint
                   where conrelid = 'public.symbolic_offerings'::regclass and convalidated
                     and conname in ('symbolic_offerings_signature_shape', 'symbolic_offerings_signature_signed_at', 'symbolic_offerings_signed_after_created')) = 3
            then 'OK' else 'ECHEC' end

union all

select '2. confidentialite', 'anon ne lit ni la table ni la signature', 'false|false',
       has_table_privilege('anon', 'public.symbolic_offerings', 'SELECT')::text || '|'
         || has_column_privilege('anon', 'public.symbolic_offerings', 'signature', 'SELECT')::text,
       case when has_table_privilege('anon', 'public.symbolic_offerings', 'SELECT')
              or has_column_privilege('anon', 'public.symbolic_offerings', 'signature', 'SELECT') then 'ECHEC' else 'OK' end

union all

select '2. confidentialite', 'la famille lit la signature (RLS) mais plus la cle d''idempotence', 'true|false',
       has_column_privilege('authenticated', 'public.symbolic_offerings', 'signature', 'SELECT')::text || '|'
         || has_column_privilege('authenticated', 'public.symbolic_offerings', 'idempotency_key', 'SELECT')::text,
       case when has_column_privilege('authenticated', 'public.symbolic_offerings', 'signature', 'SELECT')
             and not has_column_privilege('authenticated', 'public.symbolic_offerings', 'idempotency_key', 'SELECT')
            then 'OK' else 'ECHEC' end

union all

select '2. confidentialite', 'aucun role client n''ecrit la table', 'false',
       (has_table_privilege('anon', 'public.symbolic_offerings', 'INSERT,UPDATE,DELETE')
        or has_table_privilege('authenticated', 'public.symbolic_offerings', 'INSERT,UPDATE,DELETE')
        or has_column_privilege('authenticated', 'public.symbolic_offerings', 'signature', 'UPDATE'))::text,
       case when has_table_privilege('anon', 'public.symbolic_offerings', 'INSERT,UPDATE,DELETE')
              or has_table_privilege('authenticated', 'public.symbolic_offerings', 'INSERT,UPDATE,DELETE')
              or has_column_privilege('authenticated', 'public.symbolic_offerings', 'signature', 'UPDATE')
            then 'ECHEC' else 'OK' end

union all

select '2. confidentialite', 'politique RLS symbolic_offerings_select_own toujours presente', 'presente',
       case when exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'symbolic_offerings' and policyname = 'symbolic_offerings_select_own') then 'presente' else 'absente' end,
       case when exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'symbolic_offerings' and policyname = 'symbolic_offerings_select_own') then 'OK' else 'ECHEC' end

union all

select '3. fonction', 'sign_symbolic_offering_v1 : service_role seul', 'false|false|true',
       coalesce(has_function_privilege('anon', 'public.sign_symbolic_offering_v1(text,uuid,text)', 'EXECUTE')::text || '|'
         || has_function_privilege('authenticated', 'public.sign_symbolic_offering_v1(text,uuid,text)', 'EXECUTE')::text || '|'
         || has_function_privilege('service_role', 'public.sign_symbolic_offering_v1(text,uuid,text)', 'EXECUTE')::text, 'absente'),
       case when to_regprocedure('public.sign_symbolic_offering_v1(text,uuid,text)') is not null
             and not has_function_privilege('anon', 'public.sign_symbolic_offering_v1(text,uuid,text)', 'EXECUTE')
             and not has_function_privilege('authenticated', 'public.sign_symbolic_offering_v1(text,uuid,text)', 'EXECUTE')
             and has_function_privilege('service_role', 'public.sign_symbolic_offering_v1(text,uuid,text)', 'EXECUTE')
            then 'OK' else 'ECHEC' end

union all

select '3. fonction', 'sign_symbolic_offering_v1 : SECURITY DEFINER, search_path vide', 'true|true',
       coalesce((select prosecdef::text || '|' || (proconfig @> array['search_path=""'])::text
                   from pg_proc where oid = to_regprocedure('public.sign_symbolic_offering_v1(text,uuid,text)')), 'absente'),
       case when (select prosecdef and proconfig @> array['search_path=""']
                    from pg_proc where oid = to_regprocedure('public.sign_symbolic_offering_v1(text,uuid,text)')) then 'OK' else 'ECHEC' end

union all

select '3. fonction', 'record_symbolic_offering_v1 toujours presente et reservee a service_role', 'true|false',
       coalesce(has_function_privilege('service_role', 'public.record_symbolic_offering_v1(text,text,uuid)', 'EXECUTE')::text || '|'
         || has_function_privilege('anon', 'public.record_symbolic_offering_v1(text,text,uuid)', 'EXECUTE')::text, 'absente'),
       case when to_regprocedure('public.record_symbolic_offering_v1(text,text,uuid)') is not null
             and has_function_privilege('service_role', 'public.record_symbolic_offering_v1(text,text,uuid)', 'EXECUTE')
             and not has_function_privilege('anon', 'public.record_symbolic_offering_v1(text,text,uuid)', 'EXECUTE')
            then 'OK' else 'ECHEC' end

union all

select '4. information', 'gestes / gestes signes', '-',
       (select count(*)::text || ' / ' || count(signature)::text from public.symbolic_offerings),
       'OK'

order by 1, 2, 3;
