-- =====================================================================
-- HERITAGE HOMMAGE — M8-E1 — PRÉFLIGHT (LECTURE SEULE)
-- =====================================================================
-- À exécuter JUSTE AVANT supabase/migrations/20261119090000_m8_e1_contributions.sql
-- (application en E6, sous GO distinct). Cible UNIQUE : nudqzbdfnjzlnyffllgs.
-- INTERDIT : pbgzyyqdbdrhgnkzmxyn.
--
-- Reprend les contrôles bloquants de M8-E0 et vérifie que la migration
-- n'est pas déjà appliquée. Transaction READ ONLY ; aucun contenu ni
-- donnée personnelle lus : comptages et métadonnées seulement.
-- Chaque ligne : bloc | contrôle | OK ou ECHEC. Un seul ECHEC = ne pas
-- appliquer ; rendre compte au QG.
-- =====================================================================

begin transaction read only;

select bloc, controle, case when ok then 'OK' else 'ECHEC' end as verdict
from (values
  -- 0. Identité et mode
  ('0. identite', 'sentinelle QG 017 owner_free_publication_status_v1(uuid) presente',
   to_regprocedure('public.owner_free_publication_status_v1(uuid)') is not null),
  ('0. identite', 'sentinelle QG 017 owner_free_storage_bytes_v1(uuid) presente',
   to_regprocedure('public.owner_free_storage_bytes_v1(uuid)') is not null),
  ('0. identite', 'transaction en lecture seule',
   current_setting('transaction_read_only') = 'on'),

  -- 1. Moteur
  ('1. moteur', 'encodage UTF8 (IS NFC NORMALIZED)',
   (select pg_encoding_to_char(d.encoding) = 'UTF8' from pg_database d where d.datname = current_database())),
  ('1. moteur', 'PostgreSQL >= 13',
   current_setting('server_version_num')::int >= 130000),
  ('1. moteur', 'normalize NFC operationnel',
   char_length(normalize(U&'e\0301', NFC)) = 1 and not (U&'e\0301' is nfc normalized)),

  -- 2. messages : structure attendue et données compatibles
  ('2. messages', 'colonnes historiques exactes (7)',
   (select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns
     where table_schema = 'public' and table_name = 'messages')
   = 'id,memorial_id,message_type,author_name,content,visible,created_at'),
  ('2. messages', 'visible par defaut false (QG 008)',
   (select pg_get_expr(adbin, adrelid) = 'false' from pg_attrdef d join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
     where d.adrelid = 'public.messages'::regclass and a.attname = 'visible')),
  ('2. messages', 'aucun nom de plus de 600 points de code, non NFC ou avec \r (hors memory_message)',
   not exists (select 1 from public.messages where message_type <> 'memory_message'
                and (char_length(author_name) > 600 or not (author_name is nfc normalized) or strpos(author_name, chr(13)) > 0))),
  ('2. messages', 'aucune condoleance > 5000 ni recit > 20000 points de code, non NFC ou avec \r',
   not exists (select 1 from public.messages where message_type in ('condolence', 'testimonial')
                and (char_length(content) > case message_type when 'condolence' then 5000 else 20000 end
                     or not (content is nfc normalized) or strpos(content, chr(13)) > 0))),
  ('2. messages', 'aucun client ne peut ecrire (anon, authenticated : INSERT, UPDATE, DELETE)',
   not (has_table_privilege('anon', 'public.messages', 'INSERT') or has_table_privilege('authenticated', 'public.messages', 'INSERT')
        or has_table_privilege('anon', 'public.messages', 'UPDATE') or has_table_privilege('authenticated', 'public.messages', 'UPDATE')
        or has_table_privilege('anon', 'public.messages', 'DELETE') or has_table_privilege('authenticated', 'public.messages', 'DELETE'))),
  ('2. messages', 'aucune lecture client (aucune colonne)',
   not (has_any_column_privilege('anon', 'public.messages', 'SELECT') or has_any_column_privilege('authenticated', 'public.messages', 'SELECT'))),

  -- 3. media et réglages
  ('3. media', 'media_purpose_check = hero, gallery exactement',
   (select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.media'::regclass and conname = 'media_purpose_check')
   = 'CHECK ((purpose = ANY (ARRAY[''hero''::text, ''gallery''::text])))'),
  ('3. media', 'aucun media contribution',
   not exists (select 1 from public.media where purpose not in ('hero', 'gallery'))),
  ('3. reglages', 'avis_snapshot_keys sans contributions',
   (select not ('contributions' = any (avis_snapshot_keys)) from public.memorial_access_settings where id)),
  ('3. reglages', 'budget gratuit 300 Mo inchange',
   (select free_storage_bytes_per_owner = 314572800 from public.memorial_access_settings where id)),

  -- 4. Fonctions remplacées par la migration : version QG 017 en place
  ('4. QG 017', 'owner_free_storage_bytes_v1 : version QG 017 (sans exclusion contribution)',
   (select prosrc not like '%contribution%' from pg_proc where oid = 'public.owner_free_storage_bytes_v1(uuid)'::regprocedure)),
  ('4. QG 017', 'guard_free_storage_budget_v1 : version QG 017',
   (select prosrc not like '%contribution%' from pg_proc where oid = 'public.guard_free_storage_budget_v1()'::regprocedure)),
  ('4. QG 017', 'owner_free_storage_bytes_v1 et guard : executables par aucun role',
   not (has_function_privilege('anon', 'public.owner_free_storage_bytes_v1(uuid)', 'EXECUTE')
        or has_function_privilege('authenticated', 'public.owner_free_storage_bytes_v1(uuid)', 'EXECUTE')
        or has_function_privilege('service_role', 'public.owner_free_storage_bytes_v1(uuid)', 'EXECUTE'))),

  -- 5. Publication : déclencheurs existants (Q1)
  ('5. publication', 'declencheurs guard_avis, require_verified_email, open_offerings presents',
   (select count(*) = 3 from pg_trigger where tgrelid = 'public.memorial_published_snapshots'::regclass
     and tgname in ('memorial_published_snapshots_guard_avis', 'memorial_published_snapshots_require_verified_email',
                    'memorial_published_snapshots_open_offerings') and tgenabled = 'O')),
  ('5. publication', 'pending_media_cleanup_claims present (retrait des photos)',
   to_regclass('public.pending_media_cleanup_claims') is not null),

  -- 6. Migration non appliquée
  ('6. objets M8', 'aucune table M8',
   to_regclass('public.contribution_settings') is null and to_regclass('public.contribution_limits_override') is null
   and to_regclass('public.contribution_rate_limits') is null and to_regclass('public.memorial_contribution_categories') is null
   and to_regclass('public.owner_notification_preferences') is null and to_regclass('public.contributions_digest_log') is null),
  ('6. objets M8', 'aucune fonction M8',
   not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
                and p.proname in ('submit_contribution_v1', 'reserve_contribution_photo_v1', 'finalize_contribution_photo_v1',
                                  'read_public_contributions_v1', 'public_memorial_message_allowed_v2',
                                  'set_contribution_categories_v1', 'claim_contributions_digests_v1'))),
  ('6. objets M8', 'aucun declencheur sync_contribution_categories',
   not exists (select 1 from pg_trigger where tgname = 'memorial_published_snapshots_sync_contribution_categories'))
) as v(bloc, controle, ok)
order by bloc, controle;

rollback;
