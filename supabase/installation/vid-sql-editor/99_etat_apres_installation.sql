-- =====================================================================
-- HERITAGE HOMMAGE — ÉTAT APRÈS INSTALLATION (LECTURE SEULE)
-- =====================================================================
-- Ne modifie RIEN : une seule requête SELECT. Ne lit aucune donnée de
-- famille : seulement des numéros de version, des comptages et le catalogue.
-- Attendu : uniquement des lignes OK (après les 3 étapes).
-- Une seule ligne ECHEC : STOP, copier le tableau et prévenir le QG.
--
-- Cible UNIQUE : nudqzbdfnjzlnyffllgs (HERITAGE HOMMAGE - PRODUCTION).
-- INTERDIT : pbgzyyqdbdrhgnkzmxyn (projet historique « heritage hommage »).
-- AVANT de coller : l'adresse du navigateur doit contenir
--   supabase.com/dashboard/project/nudqzbdfnjzlnyffllgs/ . La référence prévaut sur le nom.
-- =====================================================================

with attendu(version, nom, statut, empreinte) as (values
    ('20260829150000', 'extensions', 'installee', null),
    ('20260829151000', 'helpers', 'installee', null),
    ('20260829152000', 'owners', 'installee', null),
    ('20260829153000', 'entitlements', 'installee', null),
    ('20260829154000', 'memorials', 'installee', null),
    ('20260829155000', 'memorial_content', 'installee', null),
    ('20260829156000', 'media', 'installee', null),
    ('20260829157000', 'messages', 'installee', null),
    ('20260831160000', 'entitlement_offer_model', 'installee', null),
    ('20260901120000', 'redeem_entitlement', 'installee', null),
    ('20260901180000', 'activation_keys', 'installee', null),
    ('20260901190000', 'privilege_model', 'installee', null),
    ('20260904100000', 'admin_audit_and_mutations', 'installee', null),
    ('20260905100000', 'activation_rate_limit', 'installee', null),
    ('20260905160000', 'builder_owner_access', 'installee', null),
    ('20260906120000', 'builder_language_access', 'installee', null),
    ('20260906130000', 'builder_context_access', 'installee', null),
    ('20260907120000', 'etsy_seller_credential', 'installee', null),
    ('20260908100000', 'v1_segmentation_correction', 'installee', null),
    ('20260909120000', 'media_storage', 'installee', null),
    ('20260909130000', 'memorial_skin_variant', 'installee', null),
    ('20260910100000', 'builder_skin_variant_access', 'installee', null),
    ('20261018140637', 'memorial_edit_persistence_v1', 'installee', null),
    ('20261019061847', 'security_v1_publication_foundation', 'installee', null),
    ('20261019120000', 'security_v1_media_operations', 'installee', null),
    ('20261019130000', 'security_v1_pending_media_cleanup_claims', 'installee', null),
    ('20261019140000', 'security_v1_deferred_media_cleanup', 'installee', null),
    ('20261022123332', 'grant_service_role_memorial_draft_revision_read', 'installee', null),
    ('20261023160000', 'symbolic_offerings_v1', 'installee', null),
    ('20261024180000', 'heritage_direct_access_foundation', 'installee', null),
    ('20261024190000', 'heritage_direct_free_window_per_email', 'installee', null),
    ('20261024200000', 'heritage_direct_access_level_required', 'installee', null),
    ('20261031120000', 'qg008_free_offer_v8_alignment', 'installee', null),
    ('20261101090000', 'qg008_lot2_guest_draft_transfer', 'installee', null),
    ('20261102090000', 'qg008_lot3_publication_from_preview', 'installee', null),
    ('20261102100000', 'qg008_lot3_v3_publication_identity', 'installee', null),
    ('20261103090000', 'qg008_lot3_v4_publication_slug', 'installee', null),
    ('20261104090000', 'qg016_m1_read_public_memorial', 'installee', null),
    ('20261105090000', 'qg016_offerings_open_at_publication', 'installee', null),
    ('20261111100000', 'c3_secure_public_acl', 'installee', null),
    ('20261114120000', 'qg004b_owner_email_verification', 'installee', null),
    ('20261114130000', 'qg004b_owner_email_correction', 'installee', null),
    ('20261116090000', 'qg017_multi_hommages', 'installee', null),
    ('20261116100000', 'qg017_a2_free_publication_status', 'installee', null),
    ('20261116120000', 'lot2_offering_signature', 'installee', null),
    ('20261119090000', 'm8_e1_contributions', 'installee', null),
    ('20261120090000', 'm8_e2_owner_contribution_settings', 'installee', null),
    ('20261121090000', 'm8_e3_public_contributions_overview', 'installee', null),
    ('20261122090000', 'm8_e4_public_contributions_reads', 'installee', null),
    ('20261125090000', 'vid07_memorial_videos', 'installee', '03732bbb9f5f276ec70caa397630e458e411b2808f5917ccb3d6f94e262c9030'),
    ('20261125100000', 'vid08_video_publication_reconcile', 'installee', '7b5d177743c6cab100dce01bd0c64e1dee7574fa65c3d16356b7b0daf5d8c1ef'),
    ('20261126090000', 'vid09_published_replacement', 'installee', '7b61c0ae6b35125779b410bc92216c78c7c58ae4785d66f6f7c74a5f8cee5a9e')
),
enregistre as (select version::text as version, name::text as name, statements from supabase_migrations.schema_migrations)
select controle, attendu, constate, verdict from (
  select 'A. droits du rôle courant sur l''historique' as controle, 'insert et delete' as attendu,
         current_user || ' : insert=' || has_table_privilege('supabase_migrations.schema_migrations', 'INSERT')
           || ' delete=' || has_table_privilege('supabase_migrations.schema_migrations', 'DELETE') as constate,
         case when has_table_privilege('supabase_migrations.schema_migrations', 'INSERT')
               and has_table_privilege('supabase_migrations.schema_migrations', 'DELETE') then 'OK' else 'ECHEC' end as verdict
  union all
  select 'D. info : versions dont le nom enregistré diffère du dépôt', 'information',
         (select count(*)::text from enregistre e join attendu a using (version)
           where e.name is not null and e.name <> a.nom)
           || ' (sans nom : ' || (select count(*) from enregistre where name is null) || ')', 'INFO'
  union all
  select 'D. info : versions enregistrées sans texte (statements vide)', 'information',
         (select count(*)::text from enregistre where statements is null or cardinality(statements) = 0), 'INFO'
  union all
  select 'E. info : hommages (nombre)', 'information',
         (select count(*)::text from public.memorials), 'INFO'
  union all
  select 'E. info : hommages publiés en offre complète (nombre)', 'information',
         (select count(*)::text from public.memorials where status = 'published' and access_level = 'complet'), 'INFO'
  union all
  select 'E. info : copies publiées (nombre)', 'information',
         (select count(*)::text from public.memorial_published_snapshots), 'INFO'
  union all
  select 'E. info : vidéos hébergées (nombre, 0 avant l''étape 1)', 'information',
         (select case when to_regclass('public.memorial_videos') is null then 'table absente' else (xpath('/row/n/text()', query_to_xml('select count(*) as n from public.memorial_videos', false, true, '')))[1]::text end), 'INFO'
  union all
  select 'E. info : avis_snapshot_keys (réglage de l''offre gratuite)', 'information',
         (select coalesce(array_to_string(avis_snapshot_keys, ','), '(vide)') from public.memorial_access_settings limit 1), 'INFO'
  union all
  select 'A. version ' || a.version || ' ' || a.nom as controle, a.statut as attendu,
         case when e.version is null then 'absente' else 'installee' end as constate,
         case when (a.statut = 'installee') = (e.version is not null) then 'OK' else 'ECHEC' end as verdict
    from attendu a left join enregistre e using (version)
  union all
  select 'A. version inconnue du dépôt ' || e.version, 'aucune', 'installee', 'ECHEC'
    from enregistre e where e.version not in (select version from attendu)
  union all
  select 'B. texte enregistré ' || a.version, 'empreinte du fichier GitHub',
         coalesce(encode(sha256(convert_to(h.statements[1], 'UTF8')), 'hex'), 'absente'),
         case when encode(sha256(convert_to(h.statements[1], 'UTF8')), 'hex') = a.empreinte then 'OK' else 'ECHEC' end
    from attendu a join supabase_migrations.schema_migrations h using (version)
   where a.empreinte is not null
  union all
  select 'A. nombre de versions', '52', (select count(*)::text from enregistre),
         case when (select count(*) from enregistre) = 52 then 'OK' else 'ECHEC' end
  union all
  select 'A. colonnes de l''historique', 'version text, name text, statements text[]',
         (select string_agg(column_name || ' ' || data_type, ', ' order by column_name)
            from information_schema.columns
           where table_schema = 'supabase_migrations' and table_name = 'schema_migrations'
             and column_name in ('version', 'name', 'statements')),
         case when (select count(*) from information_schema.columns
                     where table_schema = 'supabase_migrations' and table_name = 'schema_migrations'
                       and ((column_name = 'version' and data_type = 'text')
                         or (column_name = 'name' and data_type = 'text')
                         or (column_name = 'statements' and data_type = 'ARRAY'))) = 3
              then 'OK' else 'ECHEC' end
  union all
  select 'C. objet ' || 'table public.memorial_videos', 'present',
         case when to_regclass('public.memorial_videos') is not null then 'present' else 'absent' end,
         case when (to_regclass('public.memorial_videos') is not null) = true then 'OK' else 'ECHEC' end
  union all
  select 'C. objet ' || 'table public.memorial_video_events', 'present',
         case when to_regclass('public.memorial_video_events') is not null then 'present' else 'absent' end,
         case when (to_regclass('public.memorial_video_events') is not null) = true then 'OK' else 'ECHEC' end
  union all
  select 'C. objet ' || 'fonction public.reserve_memorial_video_upload_v1(uuid,uuid,text,integer)', 'present',
         case when to_regprocedure('public.reserve_memorial_video_upload_v1(uuid,uuid,text,integer)') is not null then 'present' else 'absent' end,
         case when (to_regprocedure('public.reserve_memorial_video_upload_v1(uuid,uuid,text,integer)') is not null) = true then 'OK' else 'ECHEC' end
  union all
  select 'C. objet ' || 'colonne public.memorial_videos.ready_at', 'present',
         case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'memorial_videos' and column_name = 'ready_at') then 'present' else 'absent' end,
         case when (exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'memorial_videos' and column_name = 'ready_at')) = true then 'OK' else 'ECHEC' end
  union all
  select 'C. objet ' || 'fonction public.claim_memorial_videos_for_reconcile_v1(uuid,timestamptz,integer,integer)', 'present',
         case when to_regprocedure('public.claim_memorial_videos_for_reconcile_v1(uuid,timestamp with time zone,integer,integer)') is not null then 'present' else 'absent' end,
         case when (to_regprocedure('public.claim_memorial_videos_for_reconcile_v1(uuid,timestamp with time zone,integer,integer)') is not null) = true then 'OK' else 'ECHEC' end
  union all
  select 'C. objet ' || 'fonction public.release_superseded_memorial_videos_v1(uuid,integer)', 'present',
         case when to_regprocedure('public.release_superseded_memorial_videos_v1(uuid,integer)') is not null then 'present' else 'absent' end,
         case when (to_regprocedure('public.release_superseded_memorial_videos_v1(uuid,integer)') is not null) = true then 'OK' else 'ECHEC' end
) t
order by controle;
