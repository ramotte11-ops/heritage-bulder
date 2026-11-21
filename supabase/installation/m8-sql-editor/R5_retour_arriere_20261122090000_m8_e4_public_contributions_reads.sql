-- =====================================================================
-- HERITAGE HOMMAGE — RETOUR ARRIÈRE 5/5 — 20261122090000_m8_e4_public_contributions_reads
-- =====================================================================
-- Source : supabase/rollbacks/20261122090000_m8_e4_public_contributions_reads.down.sql
-- SHA-256 du fichier : b8de8d1f35d07f261dd661c13c8729e1b4f64c6065ffa9a36cc9adae2be55913
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
  c_version  constant text := '20261122090000';
  c_count    constant integer := 49;
  c_sha256   constant text := 'b8de8d1f35d07f261dd661c13c8729e1b4f64c6065ffa9a36cc9adae2be55913';
  c_txn      constant integer := 2;
  -- Texte exact de supabase/rollbacks/20261122090000_m8_e4_public_contributions_reads.down.sql, encodé en base64.
  c_payload  constant text := '
LS0gSEVSSVRBR0UgSE9NTUFHRSDigJQgTTgtRTQgOiBSRVRPVVIgQVJSScOIUkUgZGUKLS0gc3Vw
YWJhc2UvbWlncmF0aW9ucy8yMDI2MTEyMjA5MDAwMF9tOF9lNF9wdWJsaWNfY29udHJpYnV0aW9u
c19yZWFkcy5zcWwuCi0tCi0tIE5FIEZBSVQgUEFTIFBBUlRJRSBERVMgTUlHUkFUSU9OUyA6IGph
bWFpcyBhcHBsaXF1w6kgYXV0b21hdGlxdWVtZW50LAotLSBzZXVsZW1lbnQgc3VyIGTDqWNpc2lv
biBleHBsaWNpdGUgZHUgUUcuIMOAIGFwcGxpcXVlciBBVkFOVCBjZXV4IGRlIEUzLCBFMgotLSBl
dCBFMS4gTGVjdHVyZSBzZXVsZSA6IGF1Y3VuZSBkb25uw6llIG4nZXN0IHRvdWNow6llLgoKYmVn
aW47Cgpkcm9wIGZ1bmN0aW9uIGlmIGV4aXN0cyBwdWJsaWMucmVhZF9wdWJsaWNfY29udHJpYnV0
aW9uc19ieV9pZHNfdjEodGV4dCwgdXVpZFtdKTsKZHJvcCBmdW5jdGlvbiBpZiBleGlzdHMgcHVi
bGljLnJlYWRfcHVibGljX2NvbnRyaWJ1dGlvbnNfdjIodGV4dCwgaW50ZWdlciwgdGltZXN0YW1w
dHosIHV1aWQsIHRleHRbXSk7Cgpub3RpZnkgcGdyc3QsICdyZWxvYWQgc2NoZW1hJzsKCmNvbW1p
dDsK
';
  c_source   text;
  v_lines    integer;
begin
  -- 1. Décodage du texte (base64, ASCII pur), puis contrôle de son empreinte.
  begin
    c_source := convert_from(decode(c_payload, 'base64'), 'UTF8');
  exception when others then
    raise exception 'STOP [20261122090000] : texte du retour arrière illisible (copier-coller incomplet ou altéré). Rien n''a été modifié.';
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

select '20261122090000' as version,
       (select count(*) from supabase_migrations.schema_migrations) as versions_enregistrees,
       case when not exists (select 1 from supabase_migrations.schema_migrations where version = '20261122090000')
             and (select count(*) from supabase_migrations.schema_migrations) = 48
            then 'OK — retour arrière 5/5 effectué'
            else 'ECHEC — prévenir le QG' end as verdict;
