-- =====================================================================
-- HERITAGE HOMMAGE — QG 008, LOT 2 — POSTFLIGHT (LECTURE SEULE)
-- =====================================================================
-- À exécuter APRÈS avoir appliqué
-- supabase/migrations/20261101090000_qg008_lot2_guest_draft_transfer.sql.
-- Ne modifie RIEN, ne lit aucune donnée personnelle. Verdicts OK/ECHEC.
-- =====================================================================

select 'A. structure' as bloc,
       'table guest_draft_transfers presente, RLS active' as controle,
       'presente|t' as attendu,
       case when to_regclass('public.guest_draft_transfers') is null then 'absente' else 'presente' end
       || '|' || coalesce((select relrowsecurity::text from pg_class where oid = to_regclass('public.guest_draft_transfers')), '-') as constate,
       case when coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.guest_draft_transfers')), false)
            then 'OK' else 'ECHEC' end as verdict

union all

select 'A. structure', 'cle unique (owner_id, transfer_key)', 'presente',
       case when exists (select 1 from pg_indexes where indexname = 'guest_draft_transfers_owner_key') then 'presente' else 'absente' end,
       case when exists (select 1 from pg_indexes where indexname = 'guest_draft_transfers_owner_key') then 'OK' else 'ECHEC' end

union all

select 'B. privileges', 'guest_draft_transfers : aucun privilege applicatif', 'aucun',
       case when has_table_privilege('anon', 'public.guest_draft_transfers', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
              or has_table_privilege('authenticated', 'public.guest_draft_transfers', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
              or has_table_privilege('service_role', 'public.guest_draft_transfers', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
            then 'privilege present' else 'aucun' end,
       case when has_table_privilege('anon', 'public.guest_draft_transfers', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
              or has_table_privilege('authenticated', 'public.guest_draft_transfers', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
              or has_table_privilege('service_role', 'public.guest_draft_transfers', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
            then 'ECHEC' else 'OK' end

union all

select 'B. privileges', f || ' : service_role seul, SECURITY DEFINER, search_path vide', 'false|false|true|t|t',
       has_function_privilege('anon', f, 'EXECUTE') || '|' || has_function_privilege('authenticated', f, 'EXECUTE') || '|'
       || has_function_privilege('service_role', f, 'EXECUTE') || '|'
       || coalesce((select prosecdef::text from pg_proc where oid = to_regprocedure(f)), '-') || '|'
       || coalesce((select (proconfig @> array['search_path=""'])::text from pg_proc where oid = to_regprocedure(f)), '-'),
       case when to_regprocedure(f) is not null
                 and not has_function_privilege('anon', f, 'EXECUTE')
                 and not has_function_privilege('authenticated', f, 'EXECUTE')
                 and has_function_privilege('service_role', f, 'EXECUTE')
                 and (select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid = to_regprocedure(f))
            then 'OK' else 'ECHEC' end
from (values ('public.begin_guest_draft_transfer_v1(uuid,text,bigint,text,text)'),
             ('public.record_guest_draft_transfer_media_v1(uuid,text,text,uuid,text)'),
             ('public.find_guest_draft_transfer_v1(uuid,text)'),
             ('public.complete_guest_draft_transfer_v1(uuid,text)')) as fns(f)

union all

select 'C. donnees', 'chaque transfert pointe vers un memorial de son proprietaire', '0',
       (select count(*)::text from public.guest_draft_transfers t join public.memorials m on m.id = t.memorial_id
         where m.owner_id is distinct from t.owner_id),
       case when (select count(*) from public.guest_draft_transfers t join public.memorials m on m.id = t.memorial_id
                   where m.owner_id is distinct from t.owner_id) = 0
            then 'OK' else 'ECHEC' end

order by 1, 2, 3;
