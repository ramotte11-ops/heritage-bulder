-- =====================================================================
-- HERITAGE HOMMAGE — RETOUR ARRIÈRE 1/5 — 20261116120000_lot2_offering_signature
-- =====================================================================
-- Source : supabase/rollbacks/20261116120000_lot2_offering_signature.down.sql
-- SHA-256 du fichier : 69e7931c715b7da09c11dafbee72f9d880b169a0a1ca4f899b2007162b24b0ba
-- Uniquement sur décision du QG. Ordre inverse : 5, 4, 3, 2, 1.
--
-- ATTENTION : efface définitivement les signatures reçues.
-- Refuse tant que c_signatures_exportees vaut false et qu'une
-- signature existe.
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
  c_version  constant text := '20261116120000';
  c_count    constant integer := 45;
  c_sha256   constant text := '69e7931c715b7da09c11dafbee72f9d880b169a0a1ca4f899b2007162b24b0ba';
  c_txn      constant integer := 2;
  c_signatures_exportees constant boolean := false;  -- QG : passer à true SEULEMENT après export des signatures décidé
  c_source   constant text := $heritage_source$-- HERITAGE HOMMAGE — Lot 2 : RETOUR ARRIÈRE de
-- supabase/migrations/20261116120000_lot2_offering_signature.sql.
--
-- NE FAIT PAS PARTIE DES MIGRATIONS : jamais appliqué automatiquement,
-- seulement sur décision explicite du QG.
--
-- ATTENTION — PERTE DE DONNÉES : supprimer les colonnes efface DÉFINITIVEMENT
-- toutes les signatures reçues. Avant d'appliquer, décider s'il faut les
-- conserver hors base (export par le QG, sous sa responsabilité RGPD).
-- Les gestes eux-mêmes (bougie, lys, cœur, dates) sont tous conservés.
--
-- Ordre recommandé : retirer d'abord le code qui appelle
-- sign_symbolic_offering_v1 (l'application dégrade sans erreur : le geste
-- reste enregistré, seule la signature échoue), puis appliquer ce fichier.
--
-- Rétablit exactement l'état précédent : lecture de la famille au niveau de
-- la table (C1), aucune colonne de signature, aucune fonction de signature.

begin;

drop function if exists public.sign_symbolic_offering_v1(text, uuid, text);

alter table public.symbolic_offerings
  drop constraint if exists symbolic_offerings_signature_shape,
  drop constraint if exists symbolic_offerings_signature_signed_at,
  drop constraint if exists symbolic_offerings_signed_after_created;

alter table public.symbolic_offerings
  drop column if exists signature,
  drop column if exists signed_at;

revoke select on table public.symbolic_offerings from authenticated;
grant select on table public.symbolic_offerings to authenticated;

comment on table public.symbolic_offerings is
  'Offrandes symboliques V1 (C1). One anonymous gesture (bougie, lys, coeur) left on a published memorial. Carries no visitor data at all. Written only by record_symbolic_offering_v1() (service_role); readable only by the memorial''s owner. Never deleted on expiry of the deposit right.';

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
  if exists (select 1 from public.symbolic_offerings where signature is not null)
     and not c_signatures_exportees then
    raise exception 'STOP [20261116120000] : des signatures existent ; ce retour arrière les EFFACE DÉFINITIVEMENT. Export et décision QG requis (voir c_signatures_exportees). Rien n''a été modifié.';
  end if;

  execute regexp_replace(c_source, '^(begin|commit);[ \t]*$', '', 'gn');
  delete from supabase_migrations.schema_migrations where version = c_version;
end
$heritage_rollback$;

select '20261116120000' as version,
       (select count(*) from supabase_migrations.schema_migrations) as versions_enregistrees,
       case when not exists (select 1 from supabase_migrations.schema_migrations where version = '20261116120000')
             and (select count(*) from supabase_migrations.schema_migrations) = 44
            then 'OK — retour arrière 1/5 effectué'
            else 'ECHEC — prévenir le QG' end as verdict;
