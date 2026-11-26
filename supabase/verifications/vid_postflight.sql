-- =====================================================================
-- HERITAGE HOMMAGE — VID-07 à VID-09 — POSTFLIGHT (LECTURE SEULE)
-- =====================================================================
-- À exécuter JUSTE APRÈS supabase/installation/vid-sql-editor/03_* .
-- Cible UNIQUE : nudqzbdfnjzlnyffllgs. INTERDIT : pbgzyyqdbdrhgnkzmxyn.
--
-- Vérifie les objets créés, leur sécurité (RLS, droits, SECURITY DEFINER,
-- search_path vide) et que rien n'a été ouvert aux clients. Transaction
-- READ ONLY ; aucune donnée personnelle lue.
-- Chaque ligne : bloc | contrôle | OK ou ECHEC. Un seul ECHEC : prévenir
-- le QG (le retour arrière est dans le même dossier, R3 → R1).
-- =====================================================================

begin transaction read only;

with rpc(sig) as (values
  ('public.reserve_memorial_video_upload_v1(uuid,uuid,text,integer)'),
  ('public.attach_memorial_video_upload_v1(uuid,text,timestamp with time zone)'),
  ('public.fail_memorial_video_upload_v1(uuid,text)'),
  ('public.cancel_memorial_video_upload_v1(uuid,uuid,uuid)'),
  ('public.apply_memorial_video_event_v1(text,text,uuid,text,text,text,integer)'),
  ('public.list_memorial_videos_to_reconcile_v1(timestamp with time zone,integer)'),
  ('public.request_memorial_video_removal_v1(uuid,uuid,text)'),
  ('public.confirm_memorial_video_deleted_v1(uuid)'),
  ('public.list_memorial_videos_v1(uuid,uuid)'),
  ('public.read_public_memorial_videos_v1(text)'),
  ('public.claim_memorial_videos_for_reconcile_v1(uuid,timestamp with time zone,integer,integer)'),
  ('public.finish_memorial_video_reconcile_v1(uuid,uuid,text)'),
  ('public.memorial_video_known_assets_v1(text[])'),
  ('public.release_superseded_memorial_videos_v1(uuid,integer)'),
  ('public.memorial_video_superseded_stats_v1()')
), internal(sig) as (values
  ('public.memorial_video_guard_v1(uuid,uuid)'),
  ('public.memorial_video_status_rank_v1(text)'),
  ('public.memorial_video_version_published_v1(uuid,text,timestamp with time zone)'),
  ('public.memorial_videos_stamp_ready_v1()')
)
select bloc, controle, case when ok then 'OK' else 'ECHEC' end as verdict
from (
  select '0. identite' as bloc, 'transaction en lecture seule' as controle,
         current_setting('transaction_read_only') = 'on' as ok
  union all
  select '0. identite', 'trois versions video enregistrees, dans l''ordre',
         (select count(*) = 3 from supabase_migrations.schema_migrations
           where version in ('20261125090000', '20261125100000', '20261126090000'))
         and (select max(version) from supabase_migrations.schema_migrations) = '20261126090000'
  union all
  select '1. tables', 'memorial_videos et memorial_video_events presentes, RLS active sur les deux',
         to_regclass('public.memorial_videos') is not null and to_regclass('public.memorial_video_events') is not null
         and (select relrowsecurity from pg_class where oid = 'public.memorial_videos'::regclass)
         and (select relrowsecurity from pg_class where oid = 'public.memorial_video_events'::regclass)
  union all
  select '1. tables', 'aucune video au depart (installation neuve)',
         (select count(*) = 0 from public.memorial_videos)
  union all
  select '1. tables', 'statut superseded admis (VID-09), colonnes ready_at et reconcile_* (VID-08)',
         (select pg_get_constraintdef(oid) like '%superseded%' from pg_constraint where conname = 'memorial_videos_status_check')
         and (select count(*) = 5 from information_schema.columns where table_schema = 'public' and table_name = 'memorial_videos'
               and column_name in ('ready_at', 'reconcile_claimed_by', 'reconcile_claimed_until', 'reconcile_attempts', 'reconcile_next_at'))
  union all
  select '1. tables', 'declencheur memorial_videos_stamp_ready present et actif',
         exists (select 1 from pg_trigger where tgname = 'memorial_videos_stamp_ready' and tgenabled = 'O')
  union all
  select '1. tables', 'suppression d''un hommage portant des videos refusee (ON DELETE RESTRICT)',
         exists (select 1 from pg_constraint where conrelid = 'public.memorial_videos'::regclass
                  and confrelid = 'public.memorials'::regclass and confdeltype = 'r')
  union all
  select '2. droits', 'anon : aucun droit sur les deux tables',
         not (has_table_privilege('anon', 'public.memorial_videos', 'SELECT')
              or has_table_privilege('anon', 'public.memorial_videos', 'INSERT')
              or has_table_privilege('anon', 'public.memorial_video_events', 'SELECT'))
  union all
  select '2. droits', 'authenticated : SELECT seul sur memorial_videos (ses lignes, par RLS), rien sur les evenements',
         has_table_privilege('authenticated', 'public.memorial_videos', 'SELECT')
         and not (has_table_privilege('authenticated', 'public.memorial_videos', 'INSERT')
                  or has_table_privilege('authenticated', 'public.memorial_videos', 'UPDATE')
                  or has_table_privilege('authenticated', 'public.memorial_videos', 'DELETE')
                  or has_table_privilege('authenticated', 'public.memorial_video_events', 'SELECT'))
  union all
  select '2. droits', 'service_role : aucune ecriture directe (RPC seulement)',
         not (has_table_privilege('service_role', 'public.memorial_videos', 'INSERT')
              or has_table_privilege('service_role', 'public.memorial_videos', 'UPDATE')
              or has_table_privilege('service_role', 'public.memorial_videos', 'DELETE'))
  union all
  select '3. fonctions', 'RPC ' || sig || ' : service_role seul, SECURITY DEFINER, search_path vide',
         to_regprocedure(sig) is not null
         and not has_function_privilege('anon', sig, 'EXECUTE')
         and not has_function_privilege('authenticated', sig, 'EXECUTE')
         and has_function_privilege('service_role', sig, 'EXECUTE')
         and (select p.prosecdef and p.proconfig @> array['search_path=""'] from pg_proc p where p.oid = to_regprocedure(sig))
    from rpc
  union all
  select '3. fonctions', 'interne ' || sig || ' : executable par aucun role client ni service_role',
         to_regprocedure(sig) is not null
         and not has_function_privilege('anon', sig, 'EXECUTE')
         and not has_function_privilege('authenticated', sig, 'EXECUTE')
         and not has_function_privilege('service_role', sig, 'EXECUTE')
    from internal
  union all
  select '4. existant', 'memorials : RLS toujours active',
         (select relrowsecurity from pg_class where oid = 'public.memorials'::regclass)
  union all
  select '4. existant', 'aucun hommage hors offre avis/complet (separation des offres intacte)',
         not exists (select 1 from public.memorials where access_level is not null and access_level not in ('avis', 'complet'))
) t
order by bloc, controle;

rollback;
