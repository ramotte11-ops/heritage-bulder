-- =====================================================================
-- HERITAGE HOMMAGE — INSTALLATION 4/5 — 20261121090000_m8_e3_public_contributions_overview
-- =====================================================================
-- Source : supabase/migrations/20261121090000_m8_e3_public_contributions_overview.sql
-- SHA-256 du fichier : 96c653f9c9b81f0700cc99e867b406d20892b59875ac9cc4e125a0d267932077
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
  c_version  constant text := '20261121090000';
  c_name     constant text := 'm8_e3_public_contributions_overview';
  c_previous constant text := '20261120090000';
  c_count    constant integer := 47;
  c_sha256   constant text := '96c653f9c9b81f0700cc99e867b406d20892b59875ac9cc4e125a0d267932077';
  c_txn      constant integer := 2;
  c_source   constant text := $heritage_source$-- HERITAGE HOMMAGE — M8-E3 : vue d'ensemble publique de la rubrique
-- « Contributions des proches ».
--
-- Écrite et testée en local (npm run db:test) ; NON appliquée. Son
-- application relève de E6, avec 20261119090000 (E1) et 20261120090000 (E2).
-- Retour arrière : supabase/rollbacks/20261121090000_m8_e3_public_contributions_overview.down.sql.
--
-- Pourquoi : la page publique doit savoir, AU MOMENT DE LA VISITE, quelles
-- catégories sont en vigueur (O9 : une désactivation par la famille prend
-- effet immédiatement, sans republication) et combien de contributions
-- publiées chacune compte (O8 : chaque catégorie disponible représentée sur
-- la scène ; état vide M0 si aucune). read_public_contributions_v1 (E1) ne
-- rend que les contributions, pas les catégories.
--
-- Mêmes règles que les dépôts et la lecture E1 : hommage public, rubrique
-- non masquée dans la copie publiée ; sinon AUCUNE ligne (indistinct).
-- Aucune donnée de proche : des booléens et des nombres.

begin;

create or replace function public.read_public_contributions_overview_v1(p_slug text)
returns table (
  condolences boolean,
  stories boolean,
  photos boolean,
  published_condolences integer,
  published_stories integer,
  published_photos integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_memorial_id uuid;
  v_categories jsonb;
begin
  if p_slug is null then
    return;
  end if;
  select m.id into v_memorial_id from public.memorials m where m.slug = p_slug;
  if v_memorial_id is null or not public.contributions_rubric_public_v1(v_memorial_id, now()) then
    return;
  end if;
  v_categories := public.contribution_categories_in_effect_v1(v_memorial_id);
  return query
    select (v_categories ->> 'condolences')::boolean,
           (v_categories ->> 'stories')::boolean,
           (v_categories ->> 'photos')::boolean,
           case when (v_categories ->> 'condolences')::boolean then
             (select count(*)::integer from public.messages msg
               where msg.memorial_id = v_memorial_id and msg.status = 'published' and msg.message_type = 'condolence')
           else 0 end,
           case when (v_categories ->> 'stories')::boolean then
             (select count(*)::integer from public.messages msg
               where msg.memorial_id = v_memorial_id and msg.status = 'published' and msg.message_type = 'testimonial')
           else 0 end,
           case when (v_categories ->> 'photos')::boolean then
             (select count(*)::integer from public.messages msg
               join public.media md on md.id = msg.media_id and md.memorial_id = msg.memorial_id
               where msg.memorial_id = v_memorial_id and msg.status = 'published' and msg.message_type = 'photo'
                 and md.status = 'ready' and md.purpose = 'contribution')
           else 0 end;
end;
$$;

revoke all on function public.read_public_contributions_overview_v1(text) from public, anon, authenticated;
grant execute on function public.read_public_contributions_overview_v1(text) to service_role;

comment on function public.read_public_contributions_overview_v1(text) is
  'M8-E3. Page publique : catégories EN VIGUEUR (O9) et nombre de contributions publiées lisibles par catégorie (O8, état vide M0). Aucune ligne si l''hommage n''est pas public ou si la rubrique est masquée. service_role seul.';

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
  if not (to_regprocedure('public.read_owner_contribution_settings_v1(uuid,uuid)') is not null) then
    raise exception 'STOP [20261121090000] : prérequis absent (fonction E2 public.read_owner_contribution_settings_v1(uuid,uuid)). Rien n''a été modifié.';
  end if;
  if to_regprocedure('public.read_public_contributions_overview_v1(text)') is not null then
    raise exception 'STOP [20261121090000] : fonction public.read_public_contributions_overview_v1(text) existe déjà alors que la version n''est pas enregistrée. Rien n''a été modifié ; prévenir le QG.';
  end if;

  -- 4. Application : le fichier lui-même, sans ses lignes begin; / commit;
  --    (la transaction est celle de ce DO : tout ou rien).
  execute regexp_replace(c_source, '^(begin|commit);[ \t]*$', '', 'gn');

  -- 5. Inscription dans l'historique, dans la même transaction.
  insert into supabase_migrations.schema_migrations (version, name, statements)
  values (c_version, c_name, array[c_source]);
end
$heritage_install$;

select '20261121090000' as version,
       'm8_e3_public_contributions_overview' as migration,
       (select count(*) from supabase_migrations.schema_migrations) as versions_enregistrees,
       case when exists (select 1 from supabase_migrations.schema_migrations h
                          where h.version = '20261121090000'
                            and encode(sha256(convert_to(h.statements[1], 'UTF8')), 'hex') = '96c653f9c9b81f0700cc99e867b406d20892b59875ac9cc4e125a0d267932077')
             and (select count(*) from supabase_migrations.schema_migrations) = 48
            then 'OK — étape 4/5 installée et enregistrée'
            else 'ECHEC — prévenir le QG' end as verdict;
