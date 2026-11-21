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
  -- Texte exact de supabase/migrations/20261121090000_m8_e3_public_contributions_overview.sql, encodé en base64.
  c_payload  constant text := '
LS0gSEVSSVRBR0UgSE9NTUFHRSDigJQgTTgtRTMgOiB2dWUgZCdlbnNlbWJsZSBwdWJsaXF1ZSBk
ZSBsYSBydWJyaXF1ZQotLSDCqyBDb250cmlidXRpb25zIGRlcyBwcm9jaGVzIMK7LgotLQotLSDD
iWNyaXRlIGV0IHRlc3TDqWUgZW4gbG9jYWwgKG5wbSBydW4gZGI6dGVzdCkgOyBOT04gYXBwbGlx
dcOpZS4gU29uCi0tIGFwcGxpY2F0aW9uIHJlbMOodmUgZGUgRTYsIGF2ZWMgMjAyNjExMTkwOTAw
MDAgKEUxKSBldCAyMDI2MTEyMDA5MDAwMCAoRTIpLgotLSBSZXRvdXIgYXJyacOocmUgOiBzdXBh
YmFzZS9yb2xsYmFja3MvMjAyNjExMjEwOTAwMDBfbThfZTNfcHVibGljX2NvbnRyaWJ1dGlvbnNf
b3ZlcnZpZXcuZG93bi5zcWwuCi0tCi0tIFBvdXJxdW9pIDogbGEgcGFnZSBwdWJsaXF1ZSBkb2l0
IHNhdm9pciwgQVUgTU9NRU5UIERFIExBIFZJU0lURSwgcXVlbGxlcwotLSBjYXTDqWdvcmllcyBz
b250IGVuIHZpZ3VldXIgKE85IDogdW5lIGTDqXNhY3RpdmF0aW9uIHBhciBsYSBmYW1pbGxlIHBy
ZW5kCi0tIGVmZmV0IGltbcOpZGlhdGVtZW50LCBzYW5zIHJlcHVibGljYXRpb24pIGV0IGNvbWJp
ZW4gZGUgY29udHJpYnV0aW9ucwotLSBwdWJsacOpZXMgY2hhY3VuZSBjb21wdGUgKE84IDogY2hh
cXVlIGNhdMOpZ29yaWUgZGlzcG9uaWJsZSByZXByw6lzZW50w6llIHN1cgotLSBsYSBzY8OobmUg
OyDDqXRhdCB2aWRlIE0wIHNpIGF1Y3VuZSkuIHJlYWRfcHVibGljX2NvbnRyaWJ1dGlvbnNfdjEg
KEUxKSBuZQotLSByZW5kIHF1ZSBsZXMgY29udHJpYnV0aW9ucywgcGFzIGxlcyBjYXTDqWdvcmll
cy4KLS0KLS0gTcOqbWVzIHLDqGdsZXMgcXVlIGxlcyBkw6lww7R0cyBldCBsYSBsZWN0dXJlIEUx
IDogaG9tbWFnZSBwdWJsaWMsIHJ1YnJpcXVlCi0tIG5vbiBtYXNxdcOpZSBkYW5zIGxhIGNvcGll
IHB1Ymxpw6llIDsgc2lub24gQVVDVU5FIGxpZ25lIChpbmRpc3RpbmN0KS4KLS0gQXVjdW5lIGRv
bm7DqWUgZGUgcHJvY2hlIDogZGVzIGJvb2zDqWVucyBldCBkZXMgbm9tYnJlcy4KCmJlZ2luOwoK
Y3JlYXRlIG9yIHJlcGxhY2UgZnVuY3Rpb24gcHVibGljLnJlYWRfcHVibGljX2NvbnRyaWJ1dGlv
bnNfb3ZlcnZpZXdfdjEocF9zbHVnIHRleHQpCnJldHVybnMgdGFibGUgKAogIGNvbmRvbGVuY2Vz
IGJvb2xlYW4sCiAgc3RvcmllcyBib29sZWFuLAogIHBob3RvcyBib29sZWFuLAogIHB1Ymxpc2hl
ZF9jb25kb2xlbmNlcyBpbnRlZ2VyLAogIHB1Ymxpc2hlZF9zdG9yaWVzIGludGVnZXIsCiAgcHVi
bGlzaGVkX3Bob3RvcyBpbnRlZ2VyCikKbGFuZ3VhZ2UgcGxwZ3NxbApzdGFibGUKc2VjdXJpdHkg
ZGVmaW5lcgpzZXQgc2VhcmNoX3BhdGggPSAnJwphcyAkJApkZWNsYXJlCiAgdl9tZW1vcmlhbF9p
ZCB1dWlkOwogIHZfY2F0ZWdvcmllcyBqc29uYjsKYmVnaW4KICBpZiBwX3NsdWcgaXMgbnVsbCB0
aGVuCiAgICByZXR1cm47CiAgZW5kIGlmOwogIHNlbGVjdCBtLmlkIGludG8gdl9tZW1vcmlhbF9p
ZCBmcm9tIHB1YmxpYy5tZW1vcmlhbHMgbSB3aGVyZSBtLnNsdWcgPSBwX3NsdWc7CiAgaWYgdl9t
ZW1vcmlhbF9pZCBpcyBudWxsIG9yIG5vdCBwdWJsaWMuY29udHJpYnV0aW9uc19ydWJyaWNfcHVi
bGljX3YxKHZfbWVtb3JpYWxfaWQsIG5vdygpKSB0aGVuCiAgICByZXR1cm47CiAgZW5kIGlmOwog
IHZfY2F0ZWdvcmllcyA6PSBwdWJsaWMuY29udHJpYnV0aW9uX2NhdGVnb3JpZXNfaW5fZWZmZWN0
X3YxKHZfbWVtb3JpYWxfaWQpOwogIHJldHVybiBxdWVyeQogICAgc2VsZWN0ICh2X2NhdGVnb3Jp
ZXMgLT4+ICdjb25kb2xlbmNlcycpOjpib29sZWFuLAogICAgICAgICAgICh2X2NhdGVnb3JpZXMg
LT4+ICdzdG9yaWVzJyk6OmJvb2xlYW4sCiAgICAgICAgICAgKHZfY2F0ZWdvcmllcyAtPj4gJ3Bo
b3RvcycpOjpib29sZWFuLAogICAgICAgICAgIGNhc2Ugd2hlbiAodl9jYXRlZ29yaWVzIC0+PiAn
Y29uZG9sZW5jZXMnKTo6Ym9vbGVhbiB0aGVuCiAgICAgICAgICAgICAoc2VsZWN0IGNvdW50KCop
OjppbnRlZ2VyIGZyb20gcHVibGljLm1lc3NhZ2VzIG1zZwogICAgICAgICAgICAgICB3aGVyZSBt
c2cubWVtb3JpYWxfaWQgPSB2X21lbW9yaWFsX2lkIGFuZCBtc2cuc3RhdHVzID0gJ3B1Ymxpc2hl
ZCcgYW5kIG1zZy5tZXNzYWdlX3R5cGUgPSAnY29uZG9sZW5jZScpCiAgICAgICAgICAgZWxzZSAw
IGVuZCwKICAgICAgICAgICBjYXNlIHdoZW4gKHZfY2F0ZWdvcmllcyAtPj4gJ3N0b3JpZXMnKTo6
Ym9vbGVhbiB0aGVuCiAgICAgICAgICAgICAoc2VsZWN0IGNvdW50KCopOjppbnRlZ2VyIGZyb20g
cHVibGljLm1lc3NhZ2VzIG1zZwogICAgICAgICAgICAgICB3aGVyZSBtc2cubWVtb3JpYWxfaWQg
PSB2X21lbW9yaWFsX2lkIGFuZCBtc2cuc3RhdHVzID0gJ3B1Ymxpc2hlZCcgYW5kIG1zZy5tZXNz
YWdlX3R5cGUgPSAndGVzdGltb25pYWwnKQogICAgICAgICAgIGVsc2UgMCBlbmQsCiAgICAgICAg
ICAgY2FzZSB3aGVuICh2X2NhdGVnb3JpZXMgLT4+ICdwaG90b3MnKTo6Ym9vbGVhbiB0aGVuCiAg
ICAgICAgICAgICAoc2VsZWN0IGNvdW50KCopOjppbnRlZ2VyIGZyb20gcHVibGljLm1lc3NhZ2Vz
IG1zZwogICAgICAgICAgICAgICBqb2luIHB1YmxpYy5tZWRpYSBtZCBvbiBtZC5pZCA9IG1zZy5t
ZWRpYV9pZCBhbmQgbWQubWVtb3JpYWxfaWQgPSBtc2cubWVtb3JpYWxfaWQKICAgICAgICAgICAg
ICAgd2hlcmUgbXNnLm1lbW9yaWFsX2lkID0gdl9tZW1vcmlhbF9pZCBhbmQgbXNnLnN0YXR1cyA9
ICdwdWJsaXNoZWQnIGFuZCBtc2cubWVzc2FnZV90eXBlID0gJ3Bob3RvJwogICAgICAgICAgICAg
ICAgIGFuZCBtZC5zdGF0dXMgPSAncmVhZHknIGFuZCBtZC5wdXJwb3NlID0gJ2NvbnRyaWJ1dGlv
bicpCiAgICAgICAgICAgZWxzZSAwIGVuZDsKZW5kOwokJDsKCnJldm9rZSBhbGwgb24gZnVuY3Rp
b24gcHVibGljLnJlYWRfcHVibGljX2NvbnRyaWJ1dGlvbnNfb3ZlcnZpZXdfdjEodGV4dCkgZnJv
bSBwdWJsaWMsIGFub24sIGF1dGhlbnRpY2F0ZWQ7CmdyYW50IGV4ZWN1dGUgb24gZnVuY3Rpb24g
cHVibGljLnJlYWRfcHVibGljX2NvbnRyaWJ1dGlvbnNfb3ZlcnZpZXdfdjEodGV4dCkgdG8gc2Vy
dmljZV9yb2xlOwoKY29tbWVudCBvbiBmdW5jdGlvbiBwdWJsaWMucmVhZF9wdWJsaWNfY29udHJp
YnV0aW9uc19vdmVydmlld192MSh0ZXh0KSBpcwogICdNOC1FMy4gUGFnZSBwdWJsaXF1ZSA6IGNh
dMOpZ29yaWVzIEVOIFZJR1VFVVIgKE85KSBldCBub21icmUgZGUgY29udHJpYnV0aW9ucyBwdWJs
acOpZXMgbGlzaWJsZXMgcGFyIGNhdMOpZ29yaWUgKE84LCDDqXRhdCB2aWRlIE0wKS4gQXVjdW5l
IGxpZ25lIHNpIGwnJ2hvbW1hZ2UgbicnZXN0IHBhcyBwdWJsaWMgb3Ugc2kgbGEgcnVicmlxdWUg
ZXN0IG1hc3F1w6llLiBzZXJ2aWNlX3JvbGUgc2V1bC4nOwoKbm90aWZ5IHBncnN0LCAncmVsb2Fk
IHNjaGVtYSc7Cgpjb21taXQ7Cg==
';
  c_source   text;
  v_lines    integer;
begin
  -- 1. Décodage du texte (base64, ASCII pur), puis contrôle de son empreinte.
  begin
    c_source := convert_from(decode(c_payload, 'base64'), 'UTF8');
  exception when others then
    raise exception 'STOP [20261121090000] : texte de la migration illisible (copier-coller incomplet ou altéré). Rien n''a été modifié.';
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
