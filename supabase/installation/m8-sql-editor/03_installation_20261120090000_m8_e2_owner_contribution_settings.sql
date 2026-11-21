-- =====================================================================
-- HERITAGE HOMMAGE — INSTALLATION 3/5 — 20261120090000_m8_e2_owner_contribution_settings
-- =====================================================================
-- Source : supabase/migrations/20261120090000_m8_e2_owner_contribution_settings.sql
-- SHA-256 du fichier : ce14e543864ee081a7bc07242b3fdd4ec082830b85bf2061b3d12a29a48fc001
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
  c_version  constant text := '20261120090000';
  c_name     constant text := 'm8_e2_owner_contribution_settings';
  c_previous constant text := '20261119090000';
  c_count    constant integer := 46;
  c_sha256   constant text := 'ce14e543864ee081a7bc07242b3fdd4ec082830b85bf2061b3d12a29a48fc001';
  c_txn      constant integer := 2;
  c_source   constant text := $heritage_source$-- HERITAGE HOMMAGE — M8-E2 : lecture des réglages Contributions d'un hommage
-- pour la famille (Tableau de bord, A15 après publication).
--
-- Écrite et testée en local (npm run db:test) ; NON appliquée. Son
-- application relève de E6, avec 20261119090000_m8_e1_contributions.sql.
-- Retour arrière : supabase/rollbacks/20261120090000_m8_e2_owner_contribution_settings.down.sql.
--
-- Pourquoi : E1 écrit les catégories en vigueur (O9) et la préférence de
-- récapitulatif (O12) dans des tables sans aucun privilège client ; rien
-- ne permettait à la famille de LIRE leur état courant pour afficher ses
-- interrupteurs. Une seule fonction, en lecture seule, service_role avec
-- p_owner_id résolu côté serveur (même modèle que les RPC familiales E1).
--
-- Catégories renvoyées : après la première publication, le réglage EN
-- VIGUEUR (contribution_categories_in_effect_v1) ; avant, les choix du
-- brouillon (A15). draft_revision permet au Builder de passer
-- p_expected_revision à set_contribution_categories_v1.

begin;

create or replace function public.read_owner_contribution_settings_v1(p_owner_id uuid, p_memorial_id uuid)
returns table (
  outcome text,
  condolences boolean,
  stories boolean,
  photos boolean,
  first_published boolean,
  draft_revision bigint,
  contributions_digest boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_memorial public.memorials%rowtype;
  v_revision bigint;
  v_draft jsonb;
  v_features jsonb;
  v_digest boolean;
begin
  if p_owner_id is null or p_memorial_id is null then
    raise exception 'invalid contribution settings request' using errcode = '22023';
  end if;
  select * into v_memorial from public.memorials m where m.id = p_memorial_id;
  if not found or v_memorial.owner_id is distinct from p_owner_id then
    return query select 'refused'::text, null::boolean, null::boolean, null::boolean, null::boolean, null::bigint, null::boolean;
    return;
  end if;
  select d.revision, d.content into v_revision, v_draft
    from public.memorial_drafts d where d.memorial_id = p_memorial_id;
  if v_memorial.first_published_at is not null then
    v_features := public.contribution_categories_in_effect_v1(p_memorial_id);
  else
    v_features := public.contribution_features_v1(coalesce(v_draft, '{}'::jsonb));
  end if;
  select p.contributions_digest into v_digest
    from public.owner_notification_preferences p where p.owner_id = p_owner_id;
  if v_features is null then
    -- Choix illisibles dans le brouillon : la famille voit tout fermé et
    -- le Builder affiche son message calme (comme A15).
    return query select 'corrupted'::text, false, false, false, false, v_revision, coalesce(v_digest, false);
    return;
  end if;
  return query select 'ok'::text,
                      (v_features ->> 'condolences')::boolean,
                      (v_features ->> 'stories')::boolean,
                      (v_features ->> 'photos')::boolean,
                      v_memorial.first_published_at is not null,
                      v_revision,
                      coalesce(v_digest, false);
end;
$$;

revoke all on function public.read_owner_contribution_settings_v1(uuid, uuid) from public, anon, authenticated;
grant execute on function public.read_owner_contribution_settings_v1(uuid, uuid) to service_role;

comment on function public.read_owner_contribution_settings_v1(uuid, uuid) is
  'M8-E2. Lecture familiale : catégories (en vigueur après publication, brouillon avant), révision du brouillon, préférence de récapitulatif (false par défaut). service_role seul, p_owner_id résolu par le serveur.';

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
  if not (to_regprocedure('public.submit_contribution_v1(text,text,text,text,uuid)') is not null) then
    raise exception 'STOP [20261120090000] : prérequis absent (fonction E1 public.submit_contribution_v1(text,text,text,text,uuid)). Rien n''a été modifié.';
  end if;
  if to_regprocedure('public.read_owner_contribution_settings_v1(uuid,uuid)') is not null then
    raise exception 'STOP [20261120090000] : fonction public.read_owner_contribution_settings_v1(uuid,uuid) existe déjà alors que la version n''est pas enregistrée. Rien n''a été modifié ; prévenir le QG.';
  end if;

  -- 4. Application : le fichier lui-même, sans ses lignes begin; / commit;
  --    (la transaction est celle de ce DO : tout ou rien).
  execute regexp_replace(c_source, '^(begin|commit);[ \t]*$', '', 'gn');

  -- 5. Inscription dans l'historique, dans la même transaction.
  insert into supabase_migrations.schema_migrations (version, name, statements)
  values (c_version, c_name, array[c_source]);
end
$heritage_install$;

select '20261120090000' as version,
       'm8_e2_owner_contribution_settings' as migration,
       (select count(*) from supabase_migrations.schema_migrations) as versions_enregistrees,
       case when exists (select 1 from supabase_migrations.schema_migrations h
                          where h.version = '20261120090000'
                            and encode(sha256(convert_to(h.statements[1], 'UTF8')), 'hex') = 'ce14e543864ee081a7bc07242b3fdd4ec082830b85bf2061b3d12a29a48fc001')
             and (select count(*) from supabase_migrations.schema_migrations) = 47
            then 'OK — étape 3/5 installée et enregistrée'
            else 'ECHEC — prévenir le QG' end as verdict;
