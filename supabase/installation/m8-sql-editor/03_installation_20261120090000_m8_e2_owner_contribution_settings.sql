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
  -- Texte exact de supabase/migrations/20261120090000_m8_e2_owner_contribution_settings.sql, encodé en base64.
  c_payload  constant text := '
LS0gSEVSSVRBR0UgSE9NTUFHRSDigJQgTTgtRTIgOiBsZWN0dXJlIGRlcyByw6lnbGFnZXMgQ29u
dHJpYnV0aW9ucyBkJ3VuIGhvbW1hZ2UKLS0gcG91ciBsYSBmYW1pbGxlIChUYWJsZWF1IGRlIGJv
cmQsIEExNSBhcHLDqHMgcHVibGljYXRpb24pLgotLQotLSDDiWNyaXRlIGV0IHRlc3TDqWUgZW4g
bG9jYWwgKG5wbSBydW4gZGI6dGVzdCkgOyBOT04gYXBwbGlxdcOpZS4gU29uCi0tIGFwcGxpY2F0
aW9uIHJlbMOodmUgZGUgRTYsIGF2ZWMgMjAyNjExMTkwOTAwMDBfbThfZTFfY29udHJpYnV0aW9u
cy5zcWwuCi0tIFJldG91ciBhcnJpw6hyZSA6IHN1cGFiYXNlL3JvbGxiYWNrcy8yMDI2MTEyMDA5
MDAwMF9tOF9lMl9vd25lcl9jb250cmlidXRpb25fc2V0dGluZ3MuZG93bi5zcWwuCi0tCi0tIFBv
dXJxdW9pIDogRTEgw6ljcml0IGxlcyBjYXTDqWdvcmllcyBlbiB2aWd1ZXVyIChPOSkgZXQgbGEg
cHLDqWbDqXJlbmNlIGRlCi0tIHLDqWNhcGl0dWxhdGlmIChPMTIpIGRhbnMgZGVzIHRhYmxlcyBz
YW5zIGF1Y3VuIHByaXZpbMOoZ2UgY2xpZW50IDsgcmllbgotLSBuZSBwZXJtZXR0YWl0IMOgIGxh
IGZhbWlsbGUgZGUgTElSRSBsZXVyIMOpdGF0IGNvdXJhbnQgcG91ciBhZmZpY2hlciBzZXMKLS0g
aW50ZXJydXB0ZXVycy4gVW5lIHNldWxlIGZvbmN0aW9uLCBlbiBsZWN0dXJlIHNldWxlLCBzZXJ2
aWNlX3JvbGUgYXZlYwotLSBwX293bmVyX2lkIHLDqXNvbHUgY8O0dMOpIHNlcnZldXIgKG3Dqm1l
IG1vZMOobGUgcXVlIGxlcyBSUEMgZmFtaWxpYWxlcyBFMSkuCi0tCi0tIENhdMOpZ29yaWVzIHJl
bnZvecOpZXMgOiBhcHLDqHMgbGEgcHJlbWnDqHJlIHB1YmxpY2F0aW9uLCBsZSByw6lnbGFnZSBF
TgotLSBWSUdVRVVSIChjb250cmlidXRpb25fY2F0ZWdvcmllc19pbl9lZmZlY3RfdjEpIDsgYXZh
bnQsIGxlcyBjaG9peCBkdQotLSBicm91aWxsb24gKEExNSkuIGRyYWZ0X3JldmlzaW9uIHBlcm1l
dCBhdSBCdWlsZGVyIGRlIHBhc3NlcgotLSBwX2V4cGVjdGVkX3JldmlzaW9uIMOgIHNldF9jb250
cmlidXRpb25fY2F0ZWdvcmllc192MS4KCmJlZ2luOwoKY3JlYXRlIG9yIHJlcGxhY2UgZnVuY3Rp
b24gcHVibGljLnJlYWRfb3duZXJfY29udHJpYnV0aW9uX3NldHRpbmdzX3YxKHBfb3duZXJfaWQg
dXVpZCwgcF9tZW1vcmlhbF9pZCB1dWlkKQpyZXR1cm5zIHRhYmxlICgKICBvdXRjb21lIHRleHQs
CiAgY29uZG9sZW5jZXMgYm9vbGVhbiwKICBzdG9yaWVzIGJvb2xlYW4sCiAgcGhvdG9zIGJvb2xl
YW4sCiAgZmlyc3RfcHVibGlzaGVkIGJvb2xlYW4sCiAgZHJhZnRfcmV2aXNpb24gYmlnaW50LAog
IGNvbnRyaWJ1dGlvbnNfZGlnZXN0IGJvb2xlYW4KKQpsYW5ndWFnZSBwbHBnc3FsCnN0YWJsZQpz
ZWN1cml0eSBkZWZpbmVyCnNldCBzZWFyY2hfcGF0aCA9ICcnCmFzICQkCmRlY2xhcmUKICB2X21l
bW9yaWFsIHB1YmxpYy5tZW1vcmlhbHMlcm93dHlwZTsKICB2X3JldmlzaW9uIGJpZ2ludDsKICB2
X2RyYWZ0IGpzb25iOwogIHZfZmVhdHVyZXMganNvbmI7CiAgdl9kaWdlc3QgYm9vbGVhbjsKYmVn
aW4KICBpZiBwX293bmVyX2lkIGlzIG51bGwgb3IgcF9tZW1vcmlhbF9pZCBpcyBudWxsIHRoZW4K
ICAgIHJhaXNlIGV4Y2VwdGlvbiAnaW52YWxpZCBjb250cmlidXRpb24gc2V0dGluZ3MgcmVxdWVz
dCcgdXNpbmcgZXJyY29kZSA9ICcyMjAyMyc7CiAgZW5kIGlmOwogIHNlbGVjdCAqIGludG8gdl9t
ZW1vcmlhbCBmcm9tIHB1YmxpYy5tZW1vcmlhbHMgbSB3aGVyZSBtLmlkID0gcF9tZW1vcmlhbF9p
ZDsKICBpZiBub3QgZm91bmQgb3Igdl9tZW1vcmlhbC5vd25lcl9pZCBpcyBkaXN0aW5jdCBmcm9t
IHBfb3duZXJfaWQgdGhlbgogICAgcmV0dXJuIHF1ZXJ5IHNlbGVjdCAncmVmdXNlZCc6OnRleHQs
IG51bGw6OmJvb2xlYW4sIG51bGw6OmJvb2xlYW4sIG51bGw6OmJvb2xlYW4sIG51bGw6OmJvb2xl
YW4sIG51bGw6OmJpZ2ludCwgbnVsbDo6Ym9vbGVhbjsKICAgIHJldHVybjsKICBlbmQgaWY7CiAg
c2VsZWN0IGQucmV2aXNpb24sIGQuY29udGVudCBpbnRvIHZfcmV2aXNpb24sIHZfZHJhZnQKICAg
IGZyb20gcHVibGljLm1lbW9yaWFsX2RyYWZ0cyBkIHdoZXJlIGQubWVtb3JpYWxfaWQgPSBwX21l
bW9yaWFsX2lkOwogIGlmIHZfbWVtb3JpYWwuZmlyc3RfcHVibGlzaGVkX2F0IGlzIG5vdCBudWxs
IHRoZW4KICAgIHZfZmVhdHVyZXMgOj0gcHVibGljLmNvbnRyaWJ1dGlvbl9jYXRlZ29yaWVzX2lu
X2VmZmVjdF92MShwX21lbW9yaWFsX2lkKTsKICBlbHNlCiAgICB2X2ZlYXR1cmVzIDo9IHB1Ymxp
Yy5jb250cmlidXRpb25fZmVhdHVyZXNfdjEoY29hbGVzY2Uodl9kcmFmdCwgJ3t9Jzo6anNvbmIp
KTsKICBlbmQgaWY7CiAgc2VsZWN0IHAuY29udHJpYnV0aW9uc19kaWdlc3QgaW50byB2X2RpZ2Vz
dAogICAgZnJvbSBwdWJsaWMub3duZXJfbm90aWZpY2F0aW9uX3ByZWZlcmVuY2VzIHAgd2hlcmUg
cC5vd25lcl9pZCA9IHBfb3duZXJfaWQ7CiAgaWYgdl9mZWF0dXJlcyBpcyBudWxsIHRoZW4KICAg
IC0tIENob2l4IGlsbGlzaWJsZXMgZGFucyBsZSBicm91aWxsb24gOiBsYSBmYW1pbGxlIHZvaXQg
dG91dCBmZXJtw6kgZXQKICAgIC0tIGxlIEJ1aWxkZXIgYWZmaWNoZSBzb24gbWVzc2FnZSBjYWxt
ZSAoY29tbWUgQTE1KS4KICAgIHJldHVybiBxdWVyeSBzZWxlY3QgJ2NvcnJ1cHRlZCc6OnRleHQs
IGZhbHNlLCBmYWxzZSwgZmFsc2UsIGZhbHNlLCB2X3JldmlzaW9uLCBjb2FsZXNjZSh2X2RpZ2Vz
dCwgZmFsc2UpOwogICAgcmV0dXJuOwogIGVuZCBpZjsKICByZXR1cm4gcXVlcnkgc2VsZWN0ICdv
ayc6OnRleHQsCiAgICAgICAgICAgICAgICAgICAgICAodl9mZWF0dXJlcyAtPj4gJ2NvbmRvbGVu
Y2VzJyk6OmJvb2xlYW4sCiAgICAgICAgICAgICAgICAgICAgICAodl9mZWF0dXJlcyAtPj4gJ3N0
b3JpZXMnKTo6Ym9vbGVhbiwKICAgICAgICAgICAgICAgICAgICAgICh2X2ZlYXR1cmVzIC0+PiAn
cGhvdG9zJyk6OmJvb2xlYW4sCiAgICAgICAgICAgICAgICAgICAgICB2X21lbW9yaWFsLmZpcnN0
X3B1Ymxpc2hlZF9hdCBpcyBub3QgbnVsbCwKICAgICAgICAgICAgICAgICAgICAgIHZfcmV2aXNp
b24sCiAgICAgICAgICAgICAgICAgICAgICBjb2FsZXNjZSh2X2RpZ2VzdCwgZmFsc2UpOwplbmQ7
CiQkOwoKcmV2b2tlIGFsbCBvbiBmdW5jdGlvbiBwdWJsaWMucmVhZF9vd25lcl9jb250cmlidXRp
b25fc2V0dGluZ3NfdjEodXVpZCwgdXVpZCkgZnJvbSBwdWJsaWMsIGFub24sIGF1dGhlbnRpY2F0
ZWQ7CmdyYW50IGV4ZWN1dGUgb24gZnVuY3Rpb24gcHVibGljLnJlYWRfb3duZXJfY29udHJpYnV0
aW9uX3NldHRpbmdzX3YxKHV1aWQsIHV1aWQpIHRvIHNlcnZpY2Vfcm9sZTsKCmNvbW1lbnQgb24g
ZnVuY3Rpb24gcHVibGljLnJlYWRfb3duZXJfY29udHJpYnV0aW9uX3NldHRpbmdzX3YxKHV1aWQs
IHV1aWQpIGlzCiAgJ004LUUyLiBMZWN0dXJlIGZhbWlsaWFsZSA6IGNhdMOpZ29yaWVzIChlbiB2
aWd1ZXVyIGFwcsOocyBwdWJsaWNhdGlvbiwgYnJvdWlsbG9uIGF2YW50KSwgcsOpdmlzaW9uIGR1
IGJyb3VpbGxvbiwgcHLDqWbDqXJlbmNlIGRlIHLDqWNhcGl0dWxhdGlmIChmYWxzZSBwYXIgZMOp
ZmF1dCkuIHNlcnZpY2Vfcm9sZSBzZXVsLCBwX293bmVyX2lkIHLDqXNvbHUgcGFyIGxlIHNlcnZl
dXIuJzsKCm5vdGlmeSBwZ3JzdCwgJ3JlbG9hZCBzY2hlbWEnOwoKY29tbWl0Owo=
';
  c_source   text;
  v_lines    integer;
begin
  -- 1. Décodage du texte (base64, ASCII pur), puis contrôle de son empreinte.
  begin
    c_source := convert_from(decode(c_payload, 'base64'), 'UTF8');
  exception when others then
    raise exception 'STOP [20261120090000] : texte de la migration illisible (copier-coller incomplet ou altéré). Rien n''a été modifié.';
  end;
  -- Le texte décodé est exactement le fichier de GitHub.
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
