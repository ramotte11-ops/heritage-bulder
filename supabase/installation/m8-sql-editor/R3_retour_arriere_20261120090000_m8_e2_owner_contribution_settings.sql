-- =====================================================================
-- HERITAGE HOMMAGE — RETOUR ARRIÈRE 3/5 — 20261120090000_m8_e2_owner_contribution_settings
-- =====================================================================
-- Source : supabase/rollbacks/20261120090000_m8_e2_owner_contribution_settings.down.sql
-- SHA-256 du fichier : 3ae685dfe5bdc1bb3d9f4c149b1165be0520f3dd4f908146e456c2e0c06364fb
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
  c_version  constant text := '20261120090000';
  c_count    constant integer := 47;
  c_sha256   constant text := '3ae685dfe5bdc1bb3d9f4c149b1165be0520f3dd4f908146e456c2e0c06364fb';
  c_txn      constant integer := 2;
  -- Texte exact de supabase/rollbacks/20261120090000_m8_e2_owner_contribution_settings.down.sql, encodé en base64.
  c_payload  constant text := '
LS0gSEVSSVRBR0UgSE9NTUFHRSDigJQgTTgtRTIgOiBSRVRPVVIgQVJSScOIUkUgZGUKLS0gc3Vw
YWJhc2UvbWlncmF0aW9ucy8yMDI2MTEyMDA5MDAwMF9tOF9lMl9vd25lcl9jb250cmlidXRpb25f
c2V0dGluZ3Muc3FsLgotLQotLSBORSBGQUlUIFBBUyBQQVJUSUUgREVTIE1JR1JBVElPTlMgOiBq
YW1haXMgYXBwbGlxdcOpIGF1dG9tYXRpcXVlbWVudCwKLS0gc2V1bGVtZW50IHN1ciBkw6ljaXNp
b24gZXhwbGljaXRlIGR1IFFHLiDDgCBhcHBsaXF1ZXIgQVZBTlQgY2VsdWkgZGUgTTgtRTEKLS0g
KGNldHRlIGZvbmN0aW9uIGTDqXBlbmQgZGVzIGZvbmN0aW9ucyBFMSkuCi0tIExlY3R1cmUgc2V1
bGUgOiBhdWN1bmUgZG9ubsOpZSBuJ2VzdCB0b3VjaMOpZS4KCmJlZ2luOwoKZHJvcCBmdW5jdGlv
biBpZiBleGlzdHMgcHVibGljLnJlYWRfb3duZXJfY29udHJpYnV0aW9uX3NldHRpbmdzX3YxKHV1
aWQsIHV1aWQpOwoKbm90aWZ5IHBncnN0LCAncmVsb2FkIHNjaGVtYSc7Cgpjb21taXQ7Cg==
';
  c_source   text;
  v_lines    integer;
begin
  -- 1. Décodage du texte (base64, ASCII pur), puis contrôle de son empreinte.
  begin
    c_source := convert_from(decode(c_payload, 'base64'), 'UTF8');
  exception when others then
    raise exception 'STOP [20261120090000] : texte du retour arrière illisible (copier-coller incomplet ou altéré). Rien n''a été modifié.';
  end;
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

select '20261120090000' as version,
       (select count(*) from supabase_migrations.schema_migrations) as versions_enregistrees,
       case when not exists (select 1 from supabase_migrations.schema_migrations where version = '20261120090000')
             and (select count(*) from supabase_migrations.schema_migrations) = 46
            then 'OK — retour arrière 3/5 effectué'
            else 'ECHEC — prévenir le QG' end as verdict;
