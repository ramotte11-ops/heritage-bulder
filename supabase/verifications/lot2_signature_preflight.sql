-- =====================================================================
-- HERITAGE HOMMAGE — Lot 2 / Signature des offrandes — PRÉFLIGHT (LECTURE SEULE)
-- =====================================================================
-- À exécuter AVANT d'appliquer
-- supabase/migrations/20261116120000_lot2_offering_signature.sql.
-- Ne modifie RIEN, ne lit aucune donnée personnelle (seulement des
-- comptages et le catalogue). Un seul ECHEC = ne pas appliquer.
-- =====================================================================

select '1. prerequis' as bloc,
       'fonction ' || f || ' presente' as controle,
       'presente' as attendu,
       case when to_regprocedure(f) is null then 'absente' else 'presente' end as constate,
       case when to_regprocedure(f) is null then 'ECHEC — prerequis absent (' || m || ')' else 'OK' end as verdict
from (values ('public.record_symbolic_offering_v1(text,text,uuid)', 'Offrandes C1'),
             ('public.current_owner_id()', 'socle')) as fns(f, m)

union all

select '1. prerequis', 'politique symbolic_offerings_select_own presente', 'presente',
       case when exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'symbolic_offerings' and policyname = 'symbolic_offerings_select_own') then 'presente' else 'absente' end,
       case when exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'symbolic_offerings' and policyname = 'symbolic_offerings_select_own') then 'OK' else 'ECHEC' end

union all

select '1. prerequis', 'evenement C3 de fermeture des fonctions present', 'present',
       case when exists (select 1 from pg_event_trigger where evtname = 'heritage_c3_close_public_function_acl') then 'present' else 'absent' end,
       case when exists (select 1 from pg_event_trigger where evtname = 'heritage_c3_close_public_function_acl') then 'OK' else 'ECHEC — C3 non appliquee' end

union all

select '2. pas encore applique', 'colonnes signature / signed_at absentes', '0',
       (select count(*)::text from information_schema.columns
         where table_schema = 'public' and table_name = 'symbolic_offerings' and column_name in ('signature', 'signed_at')),
       case when exists (select 1 from information_schema.columns
                          where table_schema = 'public' and table_name = 'symbolic_offerings' and column_name in ('signature', 'signed_at'))
            then 'ECHEC — deja appliquee' else 'OK' end

union all

select '2. pas encore applique', 'fonction sign_symbolic_offering_v1 absente', 'absente',
       case when to_regprocedure('public.sign_symbolic_offering_v1(text,uuid,text)') is null then 'absente' else 'presente' end,
       case when to_regprocedure('public.sign_symbolic_offering_v1(text,uuid,text)') is null then 'OK' else 'ECHEC — deja appliquee' end

union all

select '3. droits actuels', 'authenticated lit symbolic_offerings (niveau table, C1)', 'true',
       has_table_privilege('authenticated', 'public.symbolic_offerings', 'SELECT')::text,
       case when has_table_privilege('authenticated', 'public.symbolic_offerings', 'SELECT') then 'OK' else 'ECHEC — droits inattendus' end

union all

select '3. droits actuels', 'anon ne lit pas symbolic_offerings', 'false',
       has_table_privilege('anon', 'public.symbolic_offerings', 'SELECT')::text,
       case when has_table_privilege('anon', 'public.symbolic_offerings', 'SELECT') then 'ECHEC' else 'OK' end

union all

select '4. information', 'gestes conserves', '-',
       (select count(*)::text from public.symbolic_offerings),
       'OK'

order by 1, 2, 3;
