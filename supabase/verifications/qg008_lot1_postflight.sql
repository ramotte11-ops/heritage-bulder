-- =====================================================================
-- HERITAGE HOMMAGE — QG 008, LOT 1 — POSTFLIGHT (LECTURE SEULE)
-- =====================================================================
--
-- À exécuter APRÈS avoir appliqué
-- supabase/migrations/20261031120000_qg008_free_offer_v8_alignment.sql.
-- Remplace, pour l'état final, les contrôles de durées de
-- m1a_postflight.sql (qui grade l'état M1-A seul et signale donc, à
-- raison, les valeurs changées par QG 008).
--
-- Ne modifie RIEN. Ne lit aucune donnée personnelle. UN SEUL tableau ;
-- verdicts OK ou ECHEC.
-- =====================================================================

with s as (select * from public.memorial_access_settings where id)
select 'A. reglages V8' as bloc,
       'fenetre gratuite / preparation / visibilite / recuperation' as controle,
       '240:00:00|1080:00:00|1080:00:00|168:00:00' as attendu,
       (select free_publish_window || '|' || free_draft_retention || '|' || free_public_duration || '|' || free_private_extension from s) as constate,
       case when (select free_publish_window = interval '240 hours'
                         and free_draft_retention = interval '1080 hours'
                         and free_public_duration = interval '1080 hours'
                         and free_private_extension = interval '168 hours' from s)
            then 'OK' else 'ECHEC' end as verdict

union all

select 'A. reglages V8', 'quota 1 publication / 12 mois, cycle 12 mois, 1 brouillon actif',
       '1|1 year|1 year|1',
       (select free_publications_per_owner || '|' || free_publication_quota_window || '|' || free_window_cycle || '|' || free_active_drafts_per_owner
          from public.memorial_access_settings where id),
       case when (select free_publications_per_owner = 1 and free_publication_quota_window = interval '12 months'
                         and free_window_cycle = interval '12 months' and free_active_drafts_per_owner = 1
                    from public.memorial_access_settings where id)
            then 'OK' else 'ECHEC' end

union all

select 'A. reglages V8', 'aucune fenetre de correction (L06), aucun plafond galerie avis (L09), 6 photos publiees',
       'null|null|6',
       (select coalesce(free_correction_window::text, 'null') || '|' || coalesce(avis_gallery_rows_cap::text, 'null') || '|' || avis_gallery_limit
          from public.memorial_access_settings where id),
       case when (select free_correction_window is null and avis_gallery_rows_cap is null and avis_gallery_limit = 6
                    from public.memorial_access_settings where id)
            then 'OK' else 'ECHEC' end

union all

select 'A. reglages V8', 'rubriques publiables en avis', '10 cles, sans video ni contributions',
       (select array_to_string(avis_snapshot_keys, ',') from public.memorial_access_settings where id),
       case when (select avis_snapshot_keys @> array['hero','deathNotice','gallery']
                         and not (avis_snapshot_keys && array['video','videos','testimonials','memoryMessage','condolences','symbolicOfferings'])
                    from public.memorial_access_settings where id)
            then 'OK' else 'ECHEC' end

union all

select 'B. structure', 'objet ' || o || ' present', 'present',
       case when ok then 'present' else 'absent' end,
       case when ok then 'OK' else 'ECHEC' end
from (values
  ('table free_publication_waivers', to_regclass('public.free_publication_waivers') is not null),
  ('colonne memorials.free_draft_recovery_until', exists (select 1 from pg_attribute where attrelid = 'public.memorials'::regclass and attname = 'free_draft_recovery_until' and not attisdropped)),
  ('trigger memorials_derive_free_recovery', exists (select 1 from pg_trigger where tgname = 'memorials_derive_free_recovery' and tgrelid = 'public.memorials'::regclass)),
  ('trigger memorial_published_snapshots_guard_avis', exists (select 1 from pg_trigger where tgname = 'memorial_published_snapshots_guard_avis' and tgrelid = 'public.memorial_published_snapshots'::regclass)),
  ('fonction commit_memorial_publication_v2', to_regprocedure('public.commit_memorial_publication_v2(uuid,uuid,bigint,text,timestamptz,text,text,text,text,text,jsonb,jsonb)') is not null),
  ('fonction free_window_status_v1', to_regprocedure('public.free_window_status_v1(uuid,timestamptz)') is not null),
  ('visibilite bornee dans public_memorial_publication_state', coalesce((select prosrc like '%memorial_publicly_visible_v1%' from pg_proc where oid = to_regprocedure('public.public_memorial_publication_state(uuid)')), false)),
  ('visibilite bornee dans record_symbolic_offering_v1', coalesce((select prosrc like '%memorial_publicly_visible_v1%' from pg_proc where oid = to_regprocedure('public.record_symbolic_offering_v1(text,text,uuid)')), false)),
  ('messages moderes par defaut (visible = false)', coalesce((select pg_get_expr(adbin, adrelid) = 'false' from pg_attrdef d join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum where d.adrelid = 'public.messages'::regclass and a.attname = 'visible'), false))
) as objs(o, ok)

union all

select 'B. structure', 'trigger memorial_drafts_guard_free_gallery retire (preparation libre)', 'absent',
       case when exists (select 1 from pg_trigger where tgname = 'memorial_drafts_guard_free_gallery') then 'present' else 'absent' end,
       case when exists (select 1 from pg_trigger where tgname = 'memorial_drafts_guard_free_gallery') then 'ECHEC' else 'OK' end

union all

select 'C. privileges', 'free_publication_waivers : aucun privilege applicatif, RLS active', 'aucun|t',
       case when has_table_privilege('anon', 'public.free_publication_waivers', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
              or has_table_privilege('authenticated', 'public.free_publication_waivers', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
              or has_table_privilege('service_role', 'public.free_publication_waivers', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
            then 'privilege present' else 'aucun' end
       || '|' || (select relrowsecurity::text from pg_class where oid = 'public.free_publication_waivers'::regclass),
       case when not (has_table_privilege('anon', 'public.free_publication_waivers', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
                      or has_table_privilege('authenticated', 'public.free_publication_waivers', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
                      or has_table_privilege('service_role', 'public.free_publication_waivers', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'))
                 and (select relrowsecurity from pg_class where oid = 'public.free_publication_waivers'::regclass)
            then 'OK' else 'ECHEC' end

union all

select 'C. privileges', f || ' : service_role seul', 'false|false|true',
       has_function_privilege('anon', f, 'EXECUTE') || '|' || has_function_privilege('authenticated', f, 'EXECUTE') || '|' || has_function_privilege('service_role', f, 'EXECUTE'),
       case when not has_function_privilege('anon', f, 'EXECUTE') and not has_function_privilege('authenticated', f, 'EXECUTE')
                 and has_function_privilege('service_role', f, 'EXECUTE')
            then 'OK' else 'ECHEC' end
from (values ('public.commit_memorial_publication_v2(uuid,uuid,bigint,text,timestamptz,text,text,text,text,text,jsonb,jsonb)'),
             ('public.grant_free_publication_waiver_v1(uuid,uuid,text,text)'),
             ('public.revoke_free_publication_waiver_v1(uuid,uuid)'),
             ('public.create_free_memorial_v1(uuid,text,text)'),
             ('public.anchor_free_memorial_v1(uuid,uuid)'),
             ('public.record_symbolic_offering_v1(text,text,uuid)')) as fns(f)

union all

select 'C. privileges', f || ' : aucun role', 'false|false|false',
       has_function_privilege('anon', f, 'EXECUTE') || '|' || has_function_privilege('authenticated', f, 'EXECUTE') || '|' || has_function_privilege('service_role', f, 'EXECUTE'),
       case when not has_function_privilege('anon', f, 'EXECUTE') and not has_function_privilege('authenticated', f, 'EXECUTE')
                 and not has_function_privilege('service_role', f, 'EXECUTE')
            then 'OK' else 'ECHEC' end
from (values ('public.free_window_status_v1(uuid,timestamptz)'),
             ('public.free_access_window_v1(uuid,timestamptz)'),
             ('public.memorial_publicly_visible_v1(uuid,timestamptz)'),
             ('public.guard_avis_published_snapshot_v1()'),
             ('public.memorials_derive_free_recovery_v1()'),
             ('public.guard_free_first_publication_v1()'),
             ('public.guard_free_gallery_quota_v1()')) as fns(f)

union all

select 'C. privileges', 'aucun role client ne peut ecrire memorials.free_draft_recovery_until', 'false|false',
       has_column_privilege('anon', 'public.memorials', 'free_draft_recovery_until', 'UPDATE') || '|' || has_column_privilege('authenticated', 'public.memorials', 'free_draft_recovery_until', 'UPDATE'),
       case when not has_column_privilege('anon', 'public.memorials', 'free_draft_recovery_until', 'UPDATE')
                 and not has_column_privilege('authenticated', 'public.memorials', 'free_draft_recovery_until', 'UPDATE')
            then 'OK' else 'ECHEC' end

union all

select 'C. privileges', 'messages : toujours aucun INSERT client (contributions = QG 013/014)', 'false|false',
       has_table_privilege('anon', 'public.messages', 'INSERT') || '|' || has_table_privilege('authenticated', 'public.messages', 'INSERT'),
       case when not has_table_privilege('anon', 'public.messages', 'INSERT') and not has_table_privilege('authenticated', 'public.messages', 'INSERT')
            then 'OK' else 'ECHEC' end

union all

select 'D. donnees', 'brouillons ancres dont la recuperation = preparation + 7 j', 'toutes',
       (select count(*) filter (where free_draft_recovery_until = free_draft_until + interval '168 hours') || '/' || count(*)
          from public.memorials where free_draft_until is not null),
       case when (select count(*) filter (where free_draft_recovery_until is distinct from free_draft_until + interval '168 hours')
                    from public.memorials where free_draft_until is not null) = 0
            then 'OK' else 'ECHEC' end

order by 1, 2, 3;
