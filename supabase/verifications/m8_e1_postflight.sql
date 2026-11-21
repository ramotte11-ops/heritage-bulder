-- =====================================================================
-- HERITAGE HOMMAGE — M8-E1 — POSTFLIGHT (LECTURE SEULE)
-- =====================================================================
-- À exécuter JUSTE APRÈS supabase/migrations/20261119090000_m8_e1_contributions.sql.
-- Cible UNIQUE : nudqzbdfnjzlnyffllgs. INTERDIT : pbgzyyqdbdrhgnkzmxyn.
-- Transaction READ ONLY ; métadonnées et comptages seulement.
-- Chaque ligne : bloc | contrôle | OK ou ECHEC. Attendu : zéro ECHEC.
-- =====================================================================

begin transaction read only;

with
rpc(sig) as (values
  ('public.submit_contribution_v1(text,text,text,text,uuid)'),
  ('public.reserve_contribution_photo_v1(text,uuid,text,text)'),
  ('public.finalize_contribution_photo_v1(text,uuid,text,text,uuid,text,bigint,integer,integer)'),
  ('public.read_public_contributions_v1(text,integer,timestamptz,uuid)'),
  ('public.moderate_contribution_v1(uuid,uuid,text)'),
  ('public.remove_contribution_v1(uuid,uuid)'),
  ('public.count_pending_contributions_v1(uuid,uuid)'),
  ('public.set_contribution_categories_v1(uuid,uuid,boolean,boolean,boolean,bigint)'),
  ('public.set_contributions_digest_preference_v1(uuid,boolean)'),
  ('public.claim_contributions_digests_v1(timestamptz,integer)'),
  ('public.mark_contributions_digest_v1(uuid,text,text)')
),
internal(sig) as (values
  ('public.messages_align_visible_v1()'),
  ('public.contribution_features_v1(jsonb)'),
  ('public.sync_contribution_categories_on_publication_v1()'),
  ('public.contributions_rubric_public_v1(uuid,timestamptz)'),
  ('public.contribution_categories_in_effect_v1(uuid)'),
  ('public.public_memorial_message_allowed_v2(uuid,text)'),
  ('public.contribution_text_valid_v1(text,integer)'),
  ('public.contribution_limits_v1(uuid,text)'),
  ('public.contribution_rate_open_v1(uuid,text,timestamptz)'),
  ('public.contribution_rate_count_v1(uuid,text)'),
  ('public.contribution_pending_photos_v1(uuid,timestamptz)'),
  ('public.owner_free_storage_bytes_v1(uuid)'),
  ('public.guard_free_storage_budget_v1()')
),
new_table(t) as (values
  ('public.contribution_settings'), ('public.contribution_limits_override'), ('public.contribution_rate_limits'),
  ('public.memorial_contribution_categories'), ('public.owner_notification_preferences'), ('public.contributions_digest_log')
),
msg_constraints(c) as (values
  ('messages_status_check'), ('messages_message_type_check'), ('messages_shape_check'),
  ('messages_visible_matches_status'), ('messages_published_at_required'), ('messages_author_name_q2'),
  ('messages_content_q2'), ('messages_caption_q2'), ('messages_memorial_idempotency_key'), ('messages_media_id_key'),
  ('messages_content_check'), ('messages_author_name_check')
)
select bloc, controle, case when ok then 'OK' else 'ECHEC' end as verdict
from (
  -- 1. messages
  select '1. messages' as bloc, 'colonnes ajoutees (status, caption, media_id, idempotency_key, published_at, moderated_at)' as controle,
         (select count(*) = 6 from information_schema.columns where table_schema = 'public' and table_name = 'messages'
           and column_name in ('status', 'caption', 'media_id', 'idempotency_key', 'published_at', 'moderated_at')) as ok
  union all
  select '1. messages', 'content facultatif (photo), autres colonnes historiques intactes',
         (select is_nullable = 'YES' from information_schema.columns where table_schema = 'public' and table_name = 'messages' and column_name = 'content')
         and (select count(*) = 6 from information_schema.columns where table_schema = 'public' and table_name = 'messages'
               and column_name in ('id', 'memorial_id', 'message_type', 'author_name', 'visible', 'created_at') and is_nullable = 'NO')
  union all
  select '1. messages', 'les 12 contraintes attendues presentes',
         (select count(*) = 12 from pg_constraint where conrelid = 'public.messages'::regclass and conname in (select c from msg_constraints))
  union all
  select '1. messages', 'type photo admis',
         (select pg_get_constraintdef(oid) like '%''photo''%' from pg_constraint where conrelid = 'public.messages'::regclass and conname = 'messages_message_type_check')
  union all
  select '1. messages', 'filets Q2 : 600 / 5000 / 20000 / 1500 et NFC',
         (select bool_and(pg_get_constraintdef(oid) like '%NFC%') from pg_constraint where conrelid = 'public.messages'::regclass
           and conname in ('messages_author_name_q2', 'messages_content_q2', 'messages_caption_q2'))
         and (select pg_get_constraintdef(oid) like '%600%' from pg_constraint where conrelid = 'public.messages'::regclass and conname = 'messages_author_name_q2')
         and (select pg_get_constraintdef(oid) like '%5000%' and pg_get_constraintdef(oid) like '%20000%' from pg_constraint where conrelid = 'public.messages'::regclass and conname = 'messages_content_q2')
         and (select pg_get_constraintdef(oid) like '%1500%' from pg_constraint where conrelid = 'public.messages'::regclass and conname = 'messages_caption_q2')
  union all
  select '1. messages', 'index P1 (memorial_id, status, published_at desc, id desc)',
         to_regclass('public.messages_memorial_status_published_idx') is not null
  union all
  select '1. messages', 'declencheur messages_align_visible actif',
         exists (select 1 from pg_trigger where tgrelid = 'public.messages'::regclass and tgname = 'messages_align_visible' and tgenabled = 'O')
  union all
  select '1. messages', 'toutes les lignes coherentes (visible = status published)',
         not exists (select 1 from public.messages where visible <> (status = 'published'))
  union all
  select '1. messages', 'politiques historiques conservees (4), inertes',
         (select count(*) = 4 from pg_policies where schemaname = 'public' and tablename = 'messages')
  union all
  -- 2. media
  select '2. media', 'purpose accepte contribution',
         (select pg_get_constraintdef(oid) like '%''contribution''%' from pg_constraint where conrelid = 'public.media'::regclass and conname = 'media_purpose_check')
  union all
  -- 3. plafonds
  select '3. plafonds', 'contribution_settings : une ligne aux valeurs R2/R3 decidees',
         (select count(*) = 1 from public.contribution_settings)
         and exists (select 1 from public.contribution_settings where id
                      and condolences_per_hour = 120 and condolences_per_day = 1000
                      and stories_per_hour = 60 and stories_per_day = 400
                      and photo_reservations_per_hour = 30 and photo_reservations_per_day = 200
                      and max_pending_photos = 200 and duplicate_window = interval '10 minutes')
  union all
  -- 4. catégories
  select '4. O9', 'declencheur de publication sync_contribution_categories (AFTER INSERT OR UPDATE OF content)',
         exists (select 1 from pg_trigger where tgrelid = 'public.memorial_published_snapshots'::regclass
                  and tgname = 'memorial_published_snapshots_sync_contribution_categories' and tgenabled = 'O'
                  and pg_get_triggerdef(oid) like '%AFTER INSERT OR UPDATE OF content%')
  union all
  select '4. O9', 'declencheurs historiques de publication intacts (3)',
         (select count(*) = 3 from pg_trigger where tgrelid = 'public.memorial_published_snapshots'::regclass and tgenabled = 'O'
           and tgname in ('memorial_published_snapshots_guard_avis', 'memorial_published_snapshots_require_verified_email',
                          'memorial_published_snapshots_open_offerings'))
  union all
  -- 5. Q7-B
  select '5. Q7-B', 'owner_free_storage_bytes_v1 et guard_free_storage_budget_v1 ignorent contribution',
         (select prosrc like '%md.purpose <> ''contribution''%' from pg_proc where oid = 'public.owner_free_storage_bytes_v1(uuid)'::regprocedure)
         and (select prosrc like '%new.purpose = ''contribution''%' from pg_proc where oid = 'public.guard_free_storage_budget_v1()'::regprocedure)
  union all
  select '5. Q7-B', 'budget gratuit 300 Mo inchange',
         (select free_storage_bytes_per_owner = 314572800 from public.memorial_access_settings where id)
  union all
  -- 6. offre gratuite
  select '6. D1', 'avis_snapshot_keys contient contributions, sans cle premium',
         (select 'contributions' = any (avis_snapshot_keys)
                 and avis_snapshot_keys @> array['hero', 'deathNotice', 'gallery']
                 and not (avis_snapshot_keys && array['video', 'videos', 'testimonials', 'memoryMessage', 'condolences', 'symbolicOfferings'])
            from public.memorial_access_settings where id)
  union all
  -- 7. autorisation
  select '7. autorisation', 'public_memorial_message_allowed_v1 inchangee (politique historique)',
         (select prosrc not like '%contribution%' from pg_proc where oid = 'public.public_memorial_message_allowed_v1(uuid,text)'::regprocedure)
  union all
  -- 8. privilèges
  select '8. privileges', 'RPC executables par service_role seul (11)',
         (select bool_and(has_function_privilege('service_role', to_regprocedure(sig), 'EXECUTE')
                          and not has_function_privilege('anon', to_regprocedure(sig), 'EXECUTE')
                          and not has_function_privilege('authenticated', to_regprocedure(sig), 'EXECUTE'))
                 and count(to_regprocedure(sig)) = 11 from rpc)
  union all
  select '8. privileges', 'fonctions internes executables par aucun role (13)',
         (select bool_and(not has_function_privilege('service_role', to_regprocedure(sig), 'EXECUTE')
                          and not has_function_privilege('anon', to_regprocedure(sig), 'EXECUTE')
                          and not has_function_privilege('authenticated', to_regprocedure(sig), 'EXECUTE'))
                 and count(to_regprocedure(sig)) = 13 from internal)
  union all
  select '8. privileges', 'toutes les fonctions M8 : SECURITY DEFINER, search_path vide',
         (select bool_and(p.prosecdef and p.proconfig @> array['search_path=""']::text[])
            from pg_proc p where p.oid in (select to_regprocedure(sig) from rpc union all select to_regprocedure(sig) from internal))
  union all
  select '8. privileges', 'aucune fonction executable par PUBLIC',
         not exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                      where p.oid in (select to_regprocedure(sig) from rpc union all select to_regprocedure(sig) from internal)
                        and a.grantee = 0)
  union all
  select '8. privileges', 'tables M8 : aucun privilege pour anon, authenticated, service_role',
         (select bool_and(not has_table_privilege(r, t, p))
            from new_table, unnest(array['anon', 'authenticated', 'service_role']) r,
                 unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) p)
  union all
  select '8. privileges', 'tables M8 : RLS activee',
         (select bool_and(c.relrowsecurity) from pg_class c where c.oid in (select to_regclass(t) from new_table))
  union all
  select '8. privileges', 'messages : aucune ecriture client, aucun privilege de table',
         not (has_table_privilege('anon', 'public.messages', 'SELECT') or has_table_privilege('authenticated', 'public.messages', 'SELECT')
              or has_table_privilege('anon', 'public.messages', 'INSERT') or has_table_privilege('authenticated', 'public.messages', 'INSERT')
              or has_table_privilege('anon', 'public.messages', 'UPDATE') or has_table_privilege('authenticated', 'public.messages', 'UPDATE')
              or has_table_privilege('anon', 'public.messages', 'DELETE') or has_table_privilege('authenticated', 'public.messages', 'DELETE'))
  union all
  select '8. privileges', 'messages : authenticated lit 12 colonnes, jamais idempotency_key ; anon rien',
         has_column_privilege('authenticated', 'public.messages', 'status', 'SELECT')
         and has_column_privilege('authenticated', 'public.messages', 'content', 'SELECT')
         and not has_column_privilege('authenticated', 'public.messages', 'idempotency_key', 'SELECT')
         and not has_any_column_privilege('anon', 'public.messages', 'SELECT')
         and (select count(*) = 12 from information_schema.column_privileges
               where table_schema = 'public' and table_name = 'messages' and grantee = 'authenticated' and privilege_type = 'SELECT')
  union all
  select '8. privileges', 'O12 : aucun recapitulatif reserve ni envoye a l''application',
         (select count(*) = 0 from public.contributions_digest_log)
) checks
order by bloc, controle;

rollback;
