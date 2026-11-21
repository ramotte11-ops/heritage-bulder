-- =====================================================================
-- HERITAGE HOMMAGE — RETOUR ARRIÈRE 4/5 — 20261121090000_m8_e3_public_contributions_overview
-- =====================================================================
-- Source : supabase/rollbacks/20261121090000_m8_e3_public_contributions_overview.down.sql
-- SHA-256 du fichier : e95c83961104696f993933d8f5707b6dd6b02490d6447bca8dfa8bfd9271e20e
-- Uniquement sur décision du QG. Ordre inverse : 5, 4, 3, 2, 1.
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
-- =====================================================================

do $heritage_rollback$
declare
  c_version  constant text := '20261121090000';
  c_count    constant integer := 48;
  c_sha256   constant text := 'e95c83961104696f993933d8f5707b6dd6b02490d6447bca8dfa8bfd9271e20e';
  c_txn      constant integer := 2;
  c_source   constant text := $heritage_source$-- HERITAGE HOMMAGE — M8-E3 : RETOUR ARRIÈRE de
-- supabase/migrations/20261121090000_m8_e3_public_contributions_overview.sql.
--
-- NE FAIT PAS PARTIE DES MIGRATIONS : jamais appliqué automatiquement,
-- seulement sur décision explicite du QG. À appliquer AVANT ceux de M8-E2 et
-- M8-E1 (cette fonction dépend des fonctions E1). Lecture seule : aucune
-- donnée n'est touchée.

begin;

drop function if exists public.read_public_contributions_overview_v1(text);

notify pgrst, 'reload schema';

commit;
$heritage_source$;
  v_lines    integer;
begin
  if encode(sha256(convert_to(c_source, 'UTF8')), 'hex') <> c_sha256 then
    raise exception 'STOP [%] : texte du retour arrière altéré au copier-coller. Rien n''a été modifié.', c_version;
  end if;
  select count(*) into v_lines from regexp_matches(c_source, '^(begin|commit);[ \t]*$', 'gn');
  if v_lines <> c_txn then
    raise exception 'STOP [%] : structure inattendue (lignes begin/commit). Rien n''a été modifié.', c_version;
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = c_version) then
    raise exception 'STOP [%] : cette migration n''est pas enregistrée comme installée. Rien n''a été modifié.', c_version;
  end if;
  if (select max(version) from supabase_migrations.schema_migrations) <> c_version or (select count(*) from supabase_migrations.schema_migrations) <> c_count then
    raise exception 'STOP [%] : une migration plus récente est encore installée ; retirer d''abord les plus récentes. Rien n''a été modifié.', c_version;
  end if;

  execute regexp_replace(c_source, '^(begin|commit);[ \t]*$', '', 'gn');
  delete from supabase_migrations.schema_migrations where version = c_version;
end
$heritage_rollback$;

select '20261121090000' as version,
       (select count(*) from supabase_migrations.schema_migrations) as versions_enregistrees,
       case when not exists (select 1 from supabase_migrations.schema_migrations where version = '20261121090000')
             and (select count(*) from supabase_migrations.schema_migrations) = 47
            then 'OK — retour arrière 4/5 effectué'
            else 'ECHEC — prévenir le QG' end as verdict;
