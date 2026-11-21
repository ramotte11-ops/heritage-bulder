-- =====================================================================
-- HERITAGE HOMMAGE — M8-E0 — PRÉFLIGHT CONTRIBUTIONS (LECTURE SEULE)
-- =====================================================================
-- Contrat : M8-P final, § 10 (GO E0 du QG central).
-- Cible UNIQUE : nudqzbdfnjzlnyffllgs (HERITAGE HOMMAGE - PRODUCTION).
-- INTERDIT : pbgzyyqdbdrhgnkzmxyn (projet historique).
--
-- AVANT d'exécuter : l'opérateur vérifie dans le tableau de bord Supabase
-- que la référence du projet ouvert est exactement nudqzbdfnjzlnyffllgs.
-- En cas de doute : ne rien exécuter (STOP).
--
-- Ce script :
--   * s'exécute dans une transaction READ ONLY (aucune écriture possible) ;
--   * ne lit AUCUN contenu, nom, adresse ni donnée personnelle : seulement
--     des comptages agrégés et des métadonnées de schéma ;
--   * ne crée, ne modifie et ne supprime rien.
-- Chaque ligne : bloc, contrôle, attendu, constaté, verdict (OK / ECHEC /
-- STOP). Un seul ECHEC ou STOP = pas de GO E1 ; rendre compte au QG.
-- =====================================================================

begin transaction read only;

select '0. identite' as bloc,
       'sentinelle QG 017 : owner_free_publication_status_v1(uuid)' as controle,
       'presente' as attendu,
       case when to_regprocedure('public.owner_free_publication_status_v1(uuid)') is null then 'absente' else 'presente' end as constate,
       case when to_regprocedure('public.owner_free_publication_status_v1(uuid)') is null
            then 'STOP — mauvais projet ou base en retard' else 'OK' end as verdict

union all
select '0. identite', 'sentinelle QG 017 : owner_free_storage_bytes_v1(uuid)', 'presente',
       case when to_regprocedure('public.owner_free_storage_bytes_v1(uuid)') is null then 'absente' else 'presente' end,
       case when to_regprocedure('public.owner_free_storage_bytes_v1(uuid)') is null
            then 'STOP — mauvais projet ou base en retard' else 'OK' end

union all
select '0. identite', 'transaction en lecture seule', 'on',
       current_setting('transaction_read_only'),
       case when current_setting('transaction_read_only') = 'on' then 'OK' else 'STOP' end

-- ---------------------------------------------------------------------
-- 1. Encodage, version, normalisation
-- ---------------------------------------------------------------------
union all
select '1. moteur', 'encodage de la base', 'UTF8',
       pg_encoding_to_char(d.encoding),
       case when pg_encoding_to_char(d.encoding) = 'UTF8' then 'OK' else 'STOP — encodage incompatible (IS NFC NORMALIZED)' end
  from pg_database d where d.datname = current_database()

union all
select '1. moteur', 'version PostgreSQL >= 13 (normalize, IS NFC NORMALIZED)', '>= 130000',
       current_setting('server_version_num'),
       case when current_setting('server_version_num')::int >= 130000 then 'OK' else 'STOP' end

union all
select '1. moteur', 'normalize() NFC disponible', 'e+accent -> 1 caractere',
       char_length(normalize(U&'e\0301', NFC))::text,
       case when char_length(normalize(U&'e\0301', NFC)) = 1 then 'OK' else 'ECHEC' end

union all
select '1. moteur', 'char_length compte des points de code (emoji famille)', '7',
       char_length(U&'\+01F468\200D\+01F469\200D\+01F467\200D\+01F466')::text,
       case when char_length(U&'\+01F468\200D\+01F469\200D\+01F467\200D\+01F466') = 7 then 'OK' else 'ECHEC' end

-- ---------------------------------------------------------------------
-- 2. Structure existante de messages (état attendu du dépôt @ 8844d80)
-- ---------------------------------------------------------------------
union all
select '2. messages', 'colonne ' || c, 'presente',
       case when exists (select 1 from information_schema.columns
                          where table_schema = 'public' and table_name = 'messages' and column_name = c)
            then 'presente' else 'absente' end,
       case when exists (select 1 from information_schema.columns
                          where table_schema = 'public' and table_name = 'messages' and column_name = c)
            then 'OK' else 'ECHEC' end
  from unnest(array['id', 'memorial_id', 'message_type', 'author_name', 'content', 'visible', 'created_at']) as c

union all
select '2. messages', 'valeur par defaut de visible (QG 008)', 'false',
       coalesce((select column_default from information_schema.columns
                  where table_schema = 'public' and table_name = 'messages' and column_name = 'visible'), 'aucune'),
       case when (select column_default from information_schema.columns
                   where table_schema = 'public' and table_name = 'messages' and column_name = 'visible') = 'false'
            then 'OK' else 'ECHEC' end

union all
select '2. messages', 'RLS activee', 'oui',
       case when (select relrowsecurity from pg_class where oid = 'public.messages'::regclass) then 'oui' else 'non' end,
       case when (select relrowsecurity from pg_class where oid = 'public.messages'::regclass) then 'OK' else 'ECHEC' end

union all
select '2. messages', 'politiques RLS (nombre et noms)', 'messages_delete_own, messages_insert_public, messages_moderate_own, messages_select_own',
       coalesce((select string_agg(policyname, ', ' order by policyname) from pg_policies
                  where schemaname = 'public' and tablename = 'messages'), 'aucune'),
       case when (select string_agg(policyname, ', ' order by policyname) from pg_policies
                   where schemaname = 'public' and tablename = 'messages')
                 = 'messages_delete_own, messages_insert_public, messages_moderate_own, messages_select_own'
            then 'OK' else 'ECHEC — politiques differentes du depot' end

-- ---------------------------------------------------------------------
-- 3. Privilèges (attendus : aucun sur messages ; service_role seul sur media)
-- ---------------------------------------------------------------------
union all
select '3. privileges', r || ' ' || p || ' sur messages', 'non',
       case when has_table_privilege(r, 'public.messages', p) then 'oui' else 'non' end,
       case when has_table_privilege(r, 'public.messages', p) then 'STOP — privilege divergent' else 'OK' end
  from unnest(array['anon', 'authenticated', 'service_role']) as r,
       unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) as p

union all
select '3. privileges', r || ' ' || p || ' sur media', 'non',
       case when has_table_privilege(r, 'public.media', p) then 'oui' else 'non' end,
       case when has_table_privilege(r, 'public.media', p) then 'STOP — privilege divergent' else 'OK' end
  from unnest(array['anon', 'authenticated']) as r,
       unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) as p

union all
select '3. privileges', 'service_role ' || p || ' sur media', 'oui',
       case when has_table_privilege('service_role', 'public.media', p) then 'oui' else 'non' end,
       case when has_table_privilege('service_role', 'public.media', p) then 'OK' else 'STOP — privilege divergent' end
  from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) as p

union all
select '3. privileges', 'RLS activee sur media', 'oui',
       case when (select relrowsecurity from pg_class where oid = 'public.media'::regclass) then 'oui' else 'non' end,
       case when (select relrowsecurity from pg_class where oid = 'public.media'::regclass) then 'OK' else 'STOP' end

-- ---------------------------------------------------------------------
-- 4. Fonctions et contraintes existantes réutilisées par M8
-- ---------------------------------------------------------------------
union all
select '4. existant', 'fonction ' || f, 'presente',
       case when to_regprocedure(f) is null then 'absente' else 'presente' end,
       case when to_regprocedure(f) is null then 'ECHEC' else 'OK' end
  from unnest(array[
         'public.public_memorial_message_allowed_v1(uuid,text)',
         'public.memorial_publicly_visible_v1(uuid,timestamptz)',
         'public.record_symbolic_offering_v1(text,text,uuid)',
         'public.read_public_memorial_v1(text)',
         'public.reserve_memorial_media_upload_v1(uuid,uuid,uuid,text,text,text)',
         'public.finalize_memorial_media_upload_v1(uuid,uuid,uuid,text,text,bigint,integer,integer)',
         'public.guard_free_storage_budget_v1()',
         'public.current_owner_id()'
       ]) as f

union all
select '4. existant', 'contrainte media_purpose_check', 'hero, gallery',
       coalesce((select pg_get_constraintdef(oid) from pg_constraint
                  where conname = 'media_purpose_check' and conrelid = 'public.media'::regclass), 'absente'),
       case when (select pg_get_constraintdef(oid) from pg_constraint
                   where conname = 'media_purpose_check' and conrelid = 'public.media'::regclass)
                 like '%hero%gallery%'
             and (select pg_get_constraintdef(oid) from pg_constraint
                   where conname = 'media_purpose_check' and conrelid = 'public.media'::regclass)
                 not like '%contribution%'
            then 'OK' else 'ECHEC' end

union all
select '4. existant', 'contrainte message_type', 'condolence, memory_message, testimonial',
       coalesce((select string_agg(pg_get_constraintdef(oid), ' | ') from pg_constraint
                  where conrelid = 'public.messages'::regclass and contype = 'c'
                    and pg_get_constraintdef(oid) like '%message_type%'), 'absente'),
       case when (select string_agg(pg_get_constraintdef(oid), ' | ') from pg_constraint
                   where conrelid = 'public.messages'::regclass and contype = 'c'
                     and pg_get_constraintdef(oid) like '%message_type%') like '%condolence%memory_message%testimonial%'
            then 'OK' else 'ECHEC' end

-- ---------------------------------------------------------------------
-- 5. Paramètres commerciaux de l'offre gratuite (valeurs, aucune donnée personnelle)
-- ---------------------------------------------------------------------
union all
select '5. offre gratuite', 'avis_snapshot_keys (sans contributions)', 'liste QG 008, sans contributions',
       coalesce((select array_to_string(avis_snapshot_keys, ', ') from public.memorial_access_settings where id), 'absente'),
       case when (select avis_snapshot_keys from public.memorial_access_settings where id) is not null
             and not ((select avis_snapshot_keys from public.memorial_access_settings where id) @> array['contributions']::text[])
            then 'OK' else 'ECHEC' end

union all
select '5. offre gratuite', 'avis_gallery_rows_cap', 'NULL (QG 008)',
       coalesce((select avis_gallery_rows_cap::text from public.memorial_access_settings where id), 'NULL'),
       case when (select avis_gallery_rows_cap from public.memorial_access_settings where id) is null then 'OK' else 'ECHEC — a documenter' end

union all
select '5. offre gratuite', 'free_storage_bytes_per_owner', '314572800 (300 Mo, QG 017)',
       coalesce((select free_storage_bytes_per_owner::text from public.memorial_access_settings where id), 'NULL'),
       case when (select free_storage_bytes_per_owner from public.memorial_access_settings where id) = 314572800
            then 'OK' else 'ECHEC — a documenter' end

-- ---------------------------------------------------------------------
-- 6. Données historiques de messages (comptages agrégés uniquement)
-- ---------------------------------------------------------------------
union all
select '6. historique', 'nombre total de messages', '0',
       (select count(*) from public.messages)::text,
       case when (select count(*) from public.messages) = 0 then 'OK'
            else 'STOP — messages existants : strategie de reprise a valider' end

union all
select '6. historique', 'messages par type et visibilite', 'aucun',
       coalesce((select string_agg(message_type || '/' || visible::text || '=' || n::text, ', ' order by message_type, visible)
                   from (select message_type, visible, count(*) as n from public.messages group by 1, 2) t), 'aucun'),
       case when (select count(*) from public.messages) = 0 then 'OK' else 'STOP — voir ligne precedente' end

union all
select '6. historique', 'textes au-dela du filet 10 N (condolence > 5000, autres > 20000 points de code)', '0',
       (select count(*) from public.messages
         where (message_type = 'condolence' and char_length(content) > 5000)
            or (message_type <> 'condolence' and char_length(content) > 20000))::text,
       case when (select count(*) from public.messages
                   where (message_type = 'condolence' and char_length(content) > 5000)
                      or (message_type <> 'condolence' and char_length(content) > 20000)) = 0
            then 'OK' else 'STOP' end

union all
select '6. historique', 'noms au-dela du filet (600 points de code)', '0',
       (select count(*) from public.messages where char_length(author_name) > 600)::text,
       case when (select count(*) from public.messages where char_length(author_name) > 600) = 0 then 'OK' else 'STOP' end

union all
select '6. historique', 'textes non NFC ou contenant un retour chariot', '0',
       (select count(*) from public.messages
         where not (content is nfc normalized) or not (author_name is nfc normalized)
            or position(E'\r' in content) > 0 or position(E'\r' in author_name) > 0)::text,
       case when (select count(*) from public.messages
                   where not (content is nfc normalized) or not (author_name is nfc normalized)
                      or position(E'\r' in content) > 0 or position(E'\r' in author_name) > 0) = 0
            then 'OK' else 'STOP' end

-- ---------------------------------------------------------------------
-- 7. Objets M8 : aucun ne doit déjà exister
-- ---------------------------------------------------------------------
union all
select '7. objets M8', 'table ' || t, 'absente',
       case when to_regclass(t) is null then 'absente' else 'presente' end,
       case when to_regclass(t) is null then 'OK' else 'STOP — objet M8 deja present' end
  from unnest(array[
         'public.contribution_settings',
         'public.contribution_rate_limits',
         'public.contribution_limits_override',
         'public.memorial_contribution_categories',
         'public.owner_notification_preferences',
         'public.contributions_digest_log'
       ]) as t

union all
select '7. objets M8', 'colonne messages.status', 'absente',
       case when exists (select 1 from information_schema.columns
                          where table_schema = 'public' and table_name = 'messages' and column_name = 'status')
            then 'presente' else 'absente' end,
       case when exists (select 1 from information_schema.columns
                          where table_schema = 'public' and table_name = 'messages' and column_name = 'status')
            then 'STOP — objet M8 deja present' else 'OK' end

union all
select '7. objets M8', 'fonction submit_contribution_v1', 'absente',
       case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                          where n.nspname = 'public' and p.proname = 'submit_contribution_v1') then 'presente' else 'absente' end,
       case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                          where n.nspname = 'public' and p.proname = 'submit_contribution_v1') then 'STOP — objet M8 deja present' else 'OK' end

order by 1, 2;

rollback;
