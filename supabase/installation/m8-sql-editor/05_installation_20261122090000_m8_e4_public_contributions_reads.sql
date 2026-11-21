-- =====================================================================
-- HERITAGE HOMMAGE — INSTALLATION 5/5 — 20261122090000_m8_e4_public_contributions_reads
-- =====================================================================
-- Source : supabase/migrations/20261122090000_m8_e4_public_contributions_reads.sql
-- SHA-256 du fichier : 5c143aafc8d5d747f9cac0ef2add9280b569525f9309145e268c5ec7573717e0
--
-- Cible UNIQUE : nudqzbdfnjzlnyffllgs (HERITAGE HOMMAGE - PRODUCTION).
-- INTERDIT : pbgzyyqdbdrhgnkzmxyn (projet historique « heritage hommage »).
-- AVANT de coller : l'adresse du navigateur doit contenir
--   supabase.com/dashboard/project/nudqzbdfnjzlnyffllgs/ . La référence prévaut sur le nom.
-- Coller TOUT le fichier dans une requête vide du SQL Editor, sans rien
-- sélectionner, puis « Run ». Une fenêtre peut avertir d'opérations
-- destructives (drop, revoke) : c'est attendu pour ce fichier.
-- Fichier généré par scripts/db/build-sql-editor-installation.py :
-- NE PAS MODIFIER À LA MAIN.
--
-- Résultat attendu : une ligne « OK » (verdict). Toute erreur commençant
-- par « STOP » ou toute autre erreur : RIEN n'a été modifié ; ne pas
-- relancer, copier le message et prévenir le QG.
-- =====================================================================

do $heritage_install$
declare
  c_version  constant text := '20261122090000';
  c_name     constant text := 'm8_e4_public_contributions_reads';
  c_previous constant text := '20261121090000';
  c_count    constant integer := 48;
  c_sha256   constant text := '5c143aafc8d5d747f9cac0ef2add9280b569525f9309145e268c5ec7573717e0';
  c_txn      constant integer := 2;
  c_source   constant text := $heritage_source$-- HERITAGE HOMMAGE — M8-E4 : lectures publiques ciblées des Contributions.
--
-- Écrite et testée en local (npm run db:test) ; NON appliquée. Son
-- application relève de E6, avec les migrations E1, E2 et E3.
-- Retour arrière : supabase/rollbacks/20261122090000_m8_e4_public_contributions_reads.down.sql.
--
-- Pourquoi : l'Album ne doit avoir AUCUN plafond (directive du chef de projet
-- n° 02). La page publique ne charge donc plus « tout » d'avance : elle lit
-- une page, puis les suivantes à la demande. Deux besoins restaient sans
-- lecture adaptée :
--  1. la scène O8 doit représenter chaque catégorie disponible, même si sa
--     contribution la plus récente est très ancienne (hors des pages lues) :
--     read_public_contributions_v2 accepte un filtre de types ;
--  2. renouveler le lien d'une photo profonde dans l'Album sans relire tout
--     l'Album : read_public_contributions_by_ids_v1 relit des contributions
--     précises.
-- Les deux appliquent EXACTEMENT les règles de read_public_contributions_v1
-- (E1) : hommage public, rubrique non masquée, catégories en vigueur, statut
-- published, photo ready ; ordre P1 ; jamais idempotency_key ni chemin hors
-- de l'objet `media` (le serveur le signe, ne le transmet pas).

begin;

create or replace function public.read_public_contributions_v2(
  p_slug text,
  p_limit integer default 24,
  p_before_published_at timestamptz default null,
  p_before_id uuid default null,
  p_types text[] default null
)
returns table (
  contribution_id uuid,
  message_type text,
  author_name text,
  content text,
  caption text,
  published_at timestamptz,
  media jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_memorial_id uuid;
  v_categories jsonb;
  v_limit integer := least(greatest(coalesce(p_limit, 24), 1), 100);
begin
  if p_slug is null
     or ((p_before_published_at is null) <> (p_before_id is null))
     or (p_types is not null and (cardinality(p_types) = 0
         or not (p_types <@ array['condolence', 'testimonial', 'photo']))) then
    return;
  end if;
  select m.id into v_memorial_id from public.memorials m where m.slug = p_slug;
  if v_memorial_id is null or not public.contributions_rubric_public_v1(v_memorial_id, now()) then
    return;
  end if;
  v_categories := public.contribution_categories_in_effect_v1(v_memorial_id);

  return query
    select msg.id, msg.message_type, msg.author_name, msg.content, msg.caption, msg.published_at,
           case when msg.message_type = 'photo' then
             jsonb_build_object('media_id', md.id, 'storage_path', md.storage_path,
                                'width', md.width, 'height', md.height)
           end
      from public.messages msg
      left join public.media md
        on md.id = msg.media_id and md.memorial_id = msg.memorial_id
     where msg.memorial_id = v_memorial_id
       and msg.status = 'published'
       and (p_types is null or msg.message_type = any (p_types))
       and ((msg.message_type = 'condolence' and (v_categories ->> 'condolences')::boolean)
         or (msg.message_type = 'testimonial' and (v_categories ->> 'stories')::boolean)
         or (msg.message_type = 'photo' and (v_categories ->> 'photos')::boolean
             and md.status = 'ready' and md.purpose = 'contribution'))
       and (p_before_published_at is null
            or (msg.published_at, msg.id) < (p_before_published_at, p_before_id))
     order by msg.published_at desc, msg.id desc
     limit v_limit;
end;
$$;

create or replace function public.read_public_contributions_by_ids_v1(p_slug text, p_ids uuid[])
returns table (
  contribution_id uuid,
  message_type text,
  author_name text,
  content text,
  caption text,
  published_at timestamptz,
  media jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_memorial_id uuid;
  v_categories jsonb;
begin
  if p_slug is null or p_ids is null or cardinality(p_ids) = 0 or cardinality(p_ids) > 100 then
    return;
  end if;
  select m.id into v_memorial_id from public.memorials m where m.slug = p_slug;
  if v_memorial_id is null or not public.contributions_rubric_public_v1(v_memorial_id, now()) then
    return;
  end if;
  v_categories := public.contribution_categories_in_effect_v1(v_memorial_id);

  return query
    select msg.id, msg.message_type, msg.author_name, msg.content, msg.caption, msg.published_at,
           case when msg.message_type = 'photo' then
             jsonb_build_object('media_id', md.id, 'storage_path', md.storage_path,
                                'width', md.width, 'height', md.height)
           end
      from public.messages msg
      left join public.media md
        on md.id = msg.media_id and md.memorial_id = msg.memorial_id
     where msg.memorial_id = v_memorial_id
       and msg.id = any (p_ids)
       and msg.status = 'published'
       and ((msg.message_type = 'condolence' and (v_categories ->> 'condolences')::boolean)
         or (msg.message_type = 'testimonial' and (v_categories ->> 'stories')::boolean)
         or (msg.message_type = 'photo' and (v_categories ->> 'photos')::boolean
             and md.status = 'ready' and md.purpose = 'contribution'))
     order by msg.published_at desc, msg.id desc;
end;
$$;

revoke all on function public.read_public_contributions_v2(text, integer, timestamptz, uuid, text[]) from public, anon, authenticated;
revoke all on function public.read_public_contributions_by_ids_v1(text, uuid[]) from public, anon, authenticated;
grant execute on function public.read_public_contributions_v2(text, integer, timestamptz, uuid, text[]) to service_role;
grant execute on function public.read_public_contributions_by_ids_v1(text, uuid[]) to service_role;

comment on function public.read_public_contributions_v2(text, integer, timestamptz, uuid, text[]) is
  'M8-E4. read_public_contributions_v1 + filtre de types facultatif (scène O8 : la plus récente de chaque catégorie, sans lire tout l''Album). Mêmes règles, ordre P1, curseur. service_role seul.';
comment on function public.read_public_contributions_by_ids_v1(text, uuid[]) is
  'M8-E4. Relecture de 1 à 100 contributions précises, aux règles de la lecture publique (renouvellement des liens photo expirés). service_role seul.';

notify pgrst, 'reload schema';

commit;
$heritage_source$;
  v_lines    integer;
begin
  -- 1. Le texte collé est exactement le fichier de GitHub.
  if encode(sha256(convert_to(c_source, 'UTF8')), 'hex') <> c_sha256 then
    raise exception 'STOP [%] : texte de la migration altéré au copier-coller (empreinte différente). Rien n''a été modifié.', c_version;
  end if;
  select count(*) into v_lines from regexp_matches(c_source, '^(begin|commit);[ \t]*$', 'gn');
  if v_lines <> c_txn then
    raise exception 'STOP [%] : structure inattendue (lignes begin/commit). Rien n''a été modifié.', c_version;
  end if;

  -- 2. Historique : présent, à jour, dans l'ordre, sans double application.
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'STOP [%] : table supabase_migrations.schema_migrations absente. Rien n''a été modifié.', c_version;
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version = c_version) then
    raise exception 'STOP [%] : migration DÉJÀ INSTALLÉE (version présente dans l''historique). Rien n''a été modifié.', c_version;
  end if;
  if (select max(version) from supabase_migrations.schema_migrations) is distinct from c_previous
     or (select count(*) from supabase_migrations.schema_migrations) <> c_count then
    raise exception 'STOP [%] : ordre non respecté (attendu : dernière version %, % versions ; constaté : %, %). Rien n''a été modifié.',
      c_version, c_previous, c_count,
      (select max(version) from supabase_migrations.schema_migrations), (select count(*) from supabase_migrations.schema_migrations);
  end if;

  -- 3. Prérequis présents, objets de cette migration absents.
  if not (to_regprocedure('public.read_public_contributions_overview_v1(text)') is not null) then
    raise exception 'STOP [20261122090000] : prérequis absent (fonction E3 public.read_public_contributions_overview_v1(text)). Rien n''a été modifié.';
  end if;
  if to_regprocedure('public.read_public_contributions_v2(text,integer,timestamp with time zone,uuid,text[])') is not null then
    raise exception 'STOP [20261122090000] : fonction public.read_public_contributions_v2(text,integer,timestamptz,uuid,text[]) existe déjà alors que la version n''est pas enregistrée. Rien n''a été modifié ; prévenir le QG.';
  end if;
  if to_regprocedure('public.read_public_contributions_by_ids_v1(text,uuid[])') is not null then
    raise exception 'STOP [20261122090000] : fonction public.read_public_contributions_by_ids_v1(text,uuid[]) existe déjà alors que la version n''est pas enregistrée. Rien n''a été modifié ; prévenir le QG.';
  end if;

  -- 4. Application : le fichier lui-même, sans ses lignes begin; / commit;
  --    (la transaction est celle de ce DO : tout ou rien).
  execute regexp_replace(c_source, '^(begin|commit);[ \t]*$', '', 'gn');

  -- 5. Inscription dans l'historique, dans la même transaction.
  insert into supabase_migrations.schema_migrations (version, name, statements)
  values (c_version, c_name, array[c_source]);
end
$heritage_install$;

select '20261122090000' as version,
       'm8_e4_public_contributions_reads' as migration,
       (select count(*) from supabase_migrations.schema_migrations) as versions_enregistrees,
       case when exists (select 1 from supabase_migrations.schema_migrations h
                          where h.version = '20261122090000'
                            and encode(sha256(convert_to(h.statements[1], 'UTF8')), 'hex') = '5c143aafc8d5d747f9cac0ef2add9280b569525f9309145e268c5ec7573717e0')
             and (select count(*) from supabase_migrations.schema_migrations) = 49
            then 'OK — étape 5/5 installée et enregistrée'
            else 'ECHEC — prévenir le QG' end as verdict;
