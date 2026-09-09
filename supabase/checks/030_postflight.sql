-- =====================================================================
-- MISSION 030 — POSTFLIGHT (LECTURE SEULE)
-- =====================================================================
--
-- À exécuter dans le SQL Editor Supabase APRÈS avoir appliqué :
--
--   supabase/migrations/20260909120000_media_storage.sql
--
-- Cette requête ne modifie RIEN. Elle renvoie UN SEUL tableau où chaque
-- ligne porte sa propre conclusion dans la colonne `verdict` :
--
--   OK       -> conforme
--   ECHEC    -> non conforme, ne pas continuer, renvoyer le tableau
--   INFO     -> non applicable sur ce serveur / cette version
--
-- Compagnon de supabase/checks/013c_postflight.sql,
-- 015b_postflight.sql et 019c_postflight.sql — ne les remplace pas.
-- =====================================================================

with all_roles(r) as (values ('anon'), ('authenticated'), ('service_role')),
client_roles(r) as (values ('anon'), ('authenticated')),
maintain_supported(v) as (
  select current_setting('server_version_num')::int >= 170000
),
bucket as (
  select * from storage.buckets where id = 'memorial-media'
),
has_size_limit(v) as (
  select exists (select 1 from information_schema.columns
                  where table_schema = 'storage' and table_name = 'buckets'
                    and column_name = 'file_size_limit')
),
has_mime_types(v) as (
  select exists (select 1 from information_schema.columns
                  where table_schema = 'storage' and table_name = 'buckets'
                    and column_name = 'allowed_mime_types')
)

-- ---------------------------------------------------------------------
-- A. LE BUCKET EXISTE ET EST PRIVÉ — l'assertion la plus importante
-- ---------------------------------------------------------------------
select 'A. bucket' as bloc,
       'memorial-media existe' as controle,
       'doit exister' as attendu,
       (select count(*)::text from bucket) as constate,
       case when (select count(*) from bucket) = 1 then 'OK' else 'ECHEC' end as verdict

union all

select 'A. bucket', 'memorial-media est PRIVE', 'public = false',
       coalesce((select public::text from bucket), 'BUCKET ABSENT'),
       case when (select public from bucket) is false then 'OK' else 'ECHEC' end

union all

-- Aucun bucket public nulle part : formulé sur toute la table pour
-- attraper aussi un bucket public introduit par un autre chemin.
select 'A. bucket', 'aucun bucket public dans le projet', '0',
       (select count(*)::text from storage.buckets where public),
       case when (select count(*) from storage.buckets where public) = 0
            then 'OK' else 'ECHEC — un bucket public existe, verifier qu''aucun original HERITAGE n''y est' end

union all

-- ---------------------------------------------------------------------
-- A bis. LES LIMITES QUE STORAGE APPLIQUE LUI-MÊME
-- ---------------------------------------------------------------------
select 'A bis. limites bucket', 'file_size_limit = 15 MiB', '15728640',
       case when (select v from has_size_limit)
            then coalesce((select file_size_limit::text from bucket), 'NULL')
            else '(colonne absente sur cette version de Storage)' end,
       case when not (select v from has_size_limit) then 'INFO — taille appliquee par l''application uniquement'
            when (select file_size_limit from bucket) = 15728640 then 'OK'
            else 'ECHEC' end

union all

select 'A bis. limites bucket', 'allowed_mime_types = JPEG/PNG/WebP',
       'image/jpeg,image/png,image/webp',
       case when (select v from has_mime_types)
            then coalesce((select array_to_string(allowed_mime_types, ',') from bucket), 'NULL')
            else '(colonne absente sur cette version de Storage)' end,
       case when not (select v from has_mime_types) then 'INFO — type appliquee par l''application uniquement'
            when (select array_to_string(allowed_mime_types, ',') from bucket)
                 = 'image/jpeg,image/png,image/webp' then 'OK'
            else 'ECHEC' end

union all

-- Chaque format interdit nommé individuellement, pour qu'une régression
-- dise LEQUEL est revenu.
select 'A bis. limites bucket', 'le bucket refuse ' || f, 'absent',
       case when (select v from has_mime_types)
            then (select (f = any(allowed_mime_types))::text from bucket)
            else '(colonne absente)' end,
       case when not (select v from has_mime_types) then 'INFO'
            when (select f = any(allowed_mime_types) from bucket) then 'ECHEC'
            else 'OK' end
from (values ('image/svg+xml'), ('image/heic'), ('image/heif'), ('image/avif'),
             ('image/gif'), ('video/mp4'), ('video/quicktime'), ('application/pdf')) as forbidden(f)

union all

-- ---------------------------------------------------------------------
-- B. AUCUNE POLICY SUR storage.objects — LE MODÈLE B
-- ---------------------------------------------------------------------
--
-- Mission 030 n'en crée aucune. Sous RLS, un bucket qu'aucune policy ne
-- nomme est un bucket qu'aucun rôle client ne peut lire, écrire, lister
-- ou supprimer.
select 'B. policies storage', 'nombre de policies sur storage.objects', '0',
       (select count(*)::text from pg_policies
         where schemaname = 'storage' and tablename = 'objects'),
       case when (select count(*) from pg_policies
                   where schemaname = 'storage' and tablename = 'objects') = 0
            then 'OK'
            else 'ECHEC — une policy Storage existe et pourrait couvrir memorial-media (detail ci-dessous)' end

union all

select 'B. policies storage', 'policy inattendue: ' || policyname,
       'aucune policy attendue',
       'roles=' || array_to_string(roles, '/') || ' cmd=' || cmd
       || ' using=' || coalesce(replace(qual, E'\n', ' '), '(aucun)'),
       'ECHEC — relire : cette policy s''applique a storage.objects, donc potentiellement a nos medias'
from pg_policies
where schemaname = 'storage' and tablename = 'objects'

union all

-- Sans RLS, "aucune policy" signifierait "aucune restriction".
select 'B. policies storage', 'RLS active sur storage.objects', 't',
       coalesce((select relrowsecurity::text from pg_class
                  where oid = to_regclass('storage.objects')), 'TABLE ABSENTE'),
       case when (select relrowsecurity from pg_class
                   where oid = to_regclass('storage.objects')) then 'OK' else 'ECHEC' end

union all

-- ---------------------------------------------------------------------
-- C. PRIVILÈGES SUR media : service_role exactement 4, clients 0
-- ---------------------------------------------------------------------
select 'C. service_role sur media', 'media ' || p,
       case when expected then 'doit avoir' else 'ne doit PAS avoir' end,
       has_table_privilege('service_role', 'public.media', p)::text,
       case when has_table_privilege('service_role', 'public.media', p) = expected
            then 'OK' else 'ECHEC' end
from (values ('SELECT', true), ('INSERT', true), ('UPDATE', true), ('DELETE', true),
             ('TRUNCATE', false), ('REFERENCES', false), ('TRIGGER', false)) as e(p, expected)

union all

select 'D. roles clients sur media', r || ' ' || p, 'ne doit PAS avoir',
       has_table_privilege(r, 'public.media', p)::text,
       case when has_table_privilege(r, 'public.media', p) then 'ECHEC' else 'OK' end
from client_roles
cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
                   ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) as privs(p)

union all

-- PUBLIC : un privilège accordé à PUBLIC est détenu par tous les rôles,
-- y compris ceux que personne ne pensera à vérifier plus tard.
select 'D. roles clients sur media', 'PUBLIC ' || p, 'ne doit PAS avoir',
       has_table_privilege('public', 'public.media', p)::text,
       case when has_table_privilege('public', 'public.media', p) then 'ECHEC' else 'OK' end
from (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
             ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) as privs(p)

union all

select 'D bis. MAINTAIN (PG17+)', 'media ' || r || ' MAINTAIN', 'ne doit PAS avoir',
       case when (select v from maintain_supported)
            then has_table_privilege(r, 'public.media', 'MAINTAIN')::text
            else '(MAINTAIN indisponible avant PG17 sur ce serveur)' end,
       case when not (select v from maintain_supported) then 'INFO — non applicable sur ce serveur'
            when has_table_privilege(r, 'public.media', 'MAINTAIN') then 'ECHEC'
            else 'OK' end
from all_roles

union all

-- ---------------------------------------------------------------------
-- E. LA TABLE media : colonnes, contraintes, trigger, index
-- ---------------------------------------------------------------------
select 'E. colonnes media', 'colonne ' || c, 'doit exister',
       case when exists (select 1 from information_schema.columns
                          where table_schema = 'public' and table_name = 'media'
                            and column_name = c)
            then 'presente' else 'ABSENTE' end,
       case when exists (select 1 from information_schema.columns
                          where table_schema = 'public' and table_name = 'media'
                            and column_name = c)
            then 'OK' else 'ECHEC' end
from (values ('purpose'), ('status'), ('updated_at')) as cols(c)

union all

select 'E. colonnes media', 'size_bytes est nullable', 'YES',
       coalesce((select is_nullable from information_schema.columns
                  where table_schema = 'public' and table_name = 'media'
                    and column_name = 'size_bytes'), 'COLONNE ABSENTE'),
       case when (select is_nullable from information_schema.columns
                   where table_schema = 'public' and table_name = 'media'
                     and column_name = 'size_bytes') = 'YES'
            then 'OK' else 'ECHEC — une reservation ne pourrait pas etre enregistree sans taille' end

union all

select 'E. colonnes media', 'status a pour defaut pending', 'pending',
       coalesce((select column_default from information_schema.columns
                  where table_schema = 'public' and table_name = 'media'
                    and column_name = 'status'), 'AUCUN'),
       case when coalesce((select column_default from information_schema.columns
                            where table_schema = 'public' and table_name = 'media'
                              and column_name = 'status'), '') like '%pending%'
            then 'OK' else 'ECHEC — le defaut sur doit etre l''etat non verifie' end

union all

select 'F. contraintes media', 'contrainte ' || k, 'doit exister',
       case when exists (select 1 from pg_constraint
                          where conrelid = 'public.media'::regclass and conname = k)
            then 'presente' else 'ABSENTE' end,
       case when exists (select 1 from pg_constraint
                          where conrelid = 'public.media'::regclass and conname = k)
            then 'OK' else 'ECHEC' end
from (values ('media_purpose_check'), ('media_status_check'),
             ('media_ready_requires_size')) as cons(k)

union all

-- Le vocabulaire réellement enregistré dans la contrainte, pour que le
-- QG lise les valeurs et pas seulement l'existence.
select 'F. contraintes media', 'definition ' || conname, 'hero/gallery et pending/ready',
       replace(pg_get_constraintdef(oid), E'\n', ' '),
       case when conname = 'media_purpose_check'
                 and pg_get_constraintdef(oid) like '%hero%'
                 and pg_get_constraintdef(oid) like '%gallery%' then 'OK'
            when conname = 'media_status_check'
                 and pg_get_constraintdef(oid) like '%pending%'
                 and pg_get_constraintdef(oid) like '%ready%' then 'OK'
            when conname = 'media_ready_requires_size' then 'OK'
            else 'ECHEC' end
from pg_constraint
where conrelid = 'public.media'::regclass
  and conname in ('media_purpose_check', 'media_status_check', 'media_ready_requires_size')

union all

-- media_type reste limité à 'photo' : aucune vidéo, à aucune couche.
select 'F. contraintes media', 'media_type refuse toujours la video', 'photo uniquement',
       coalesce((select replace(pg_get_constraintdef(oid), E'\n', ' ') from pg_constraint
                  where conrelid = 'public.media'::regclass
                    and pg_get_constraintdef(oid) like '%media_type%'), 'CONTRAINTE ABSENTE'),
       case when exists (select 1 from pg_constraint
                          where conrelid = 'public.media'::regclass
                            and pg_get_constraintdef(oid) like '%media_type%'
                            and pg_get_constraintdef(oid) like '%photo%'
                            and pg_get_constraintdef(oid) not like '%video%')
            then 'OK' else 'ECHEC' end

union all

select 'G. trigger / index', 'trigger media_set_updated_at', 'doit exister',
       case when exists (select 1 from pg_trigger
                          where tgrelid = 'public.media'::regclass
                            and tgname = 'media_set_updated_at')
            then 'present' else 'ABSENT' end,
       case when exists (select 1 from pg_trigger
                          where tgrelid = 'public.media'::regclass
                            and tgname = 'media_set_updated_at')
            then 'OK' else 'ECHEC' end

union all

select 'G. trigger / index', 'index ' || i, 'doit exister',
       case when exists (select 1 from pg_indexes
                          where schemaname = 'public' and tablename = 'media' and indexname = i)
            then 'present' else 'ABSENT' end,
       case when exists (select 1 from pg_indexes
                          where schemaname = 'public' and tablename = 'media' and indexname = i)
            then 'OK' else 'ECHEC' end
from (values ('media_pending_created_at_idx'), ('media_memorial_purpose_idx')) as idx(i)

union all

-- L'index partiel du sweep ne doit couvrir QUE les reservations : un
-- index qui verrait les media finalises serait le signe que le sweep
-- peut les voir aussi.
select 'G. trigger / index', 'l''index du sweep est bien partiel (status = pending)',
       'clause WHERE status = ''pending''',
       coalesce((select indexdef from pg_indexes
                  where schemaname = 'public' and tablename = 'media'
                    and indexname = 'media_pending_created_at_idx'), 'INDEX ABSENT'),
       case when coalesce((select indexdef from pg_indexes
                            where schemaname = 'public' and tablename = 'media'
                              and indexname = 'media_pending_created_at_idx'), '')
                 like '%pending%'
            then 'OK' else 'ECHEC' end

union all

-- Absence DÉLIBÉRÉE : un index unique "un seul hero ready" rendrait le
-- remplacement sûr impossible (l'ancien et le nouveau doivent coexister
-- un instant).
select 'G. trigger / index', 'aucun index unique sur (memorial_id, purpose)',
       'aucun (le remplacement sur en depend)',
       coalesce((select string_agg(indexname, ', ') from pg_indexes
                  where schemaname = 'public' and tablename = 'media'
                    and indexdef like '%UNIQUE%' and indexdef like '%purpose%'), 'aucun'),
       case when exists (select 1 from pg_indexes
                          where schemaname = 'public' and tablename = 'media'
                            and indexdef like '%UNIQUE%' and indexdef like '%purpose%')
            then 'ECHEC — le remplacement ne pourrait plus garder l''ancienne photo'
            else 'OK' end

union all

-- ---------------------------------------------------------------------
-- H. LA POLICY MISSION 002 EST PRÉSERVÉE
-- ---------------------------------------------------------------------
select 'H. RLS media', 'RLS active sur media', 't',
       coalesce((select relrowsecurity::text from pg_class
                  where oid = 'public.media'::regclass), 'TABLE ABSENTE'),
       case when (select relrowsecurity from pg_class
                   where oid = 'public.media'::regclass) then 'OK' else 'ECHEC' end

union all

select 'H. RLS media', 'policy media_all_own preservee', '1',
       (select count(*)::text from pg_policies
         where schemaname = 'public' and tablename = 'media' and policyname = 'media_all_own'),
       case when (select count(*) from pg_policies
                   where schemaname = 'public' and tablename = 'media'
                     and policyname = 'media_all_own') = 1
            then 'OK' else 'ECHEC' end

union all

select 'H. RLS media', 'aucune policy media supplementaire', '1 policy au total',
       (select count(*)::text from pg_policies
         where schemaname = 'public' and tablename = 'media'),
       case when (select count(*) from pg_policies
                   where schemaname = 'public' and tablename = 'media') = 1
            then 'OK' else 'ECHEC — relire toute policy ajoutee sur media' end

union all

-- ---------------------------------------------------------------------
-- I. DONNÉES
-- ---------------------------------------------------------------------
select 'I. donnees', 'lignes dans media', 'informatif',
       (select count(*)::text from media),
       'INFO'

union all

select 'I. donnees', 'objets dans memorial-media', 'informatif',
       (select count(*)::text from storage.objects where bucket_id = 'memorial-media'),
       'INFO'

union all

select 'I. donnees', 'media ready sans taille (doit etre impossible)', '0',
       (select count(*)::text from media where status = 'ready' and size_bytes is null),
       case when (select count(*) from media where status = 'ready' and size_bytes is null) = 0
            then 'OK' else 'ECHEC' end

order by 1, 2, 3;
