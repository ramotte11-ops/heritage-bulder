-- =====================================================================
-- HERITAGE HOMMAGE — RETOUR ARRIÈRE 2/3 — 20261125100000_vid08_video_publication_reconcile
-- =====================================================================
-- Source : supabase/rollbacks/20261125100000_vid08_video_publication_reconcile.down.sql
-- SHA-256 du fichier : 895a3464e190c3f940c702e22550debae2c7eb1ed5b3fba853c255efac798de6
-- Uniquement sur décision du QG. Ordre inverse : 3, 2, 1.
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
  c_version  constant text := '20261125100000';
  c_count    constant integer := 51;
  c_sha256   constant text := '895a3464e190c3f940c702e22550debae2c7eb1ed5b3fba853c255efac798de6';
  c_txn      constant integer := 2;
  -- Texte exact de supabase/rollbacks/20261125100000_vid08_video_publication_reconcile.down.sql, encodé en base64.
  c_payload  constant text := '
LS0gSEVSSVRBR0UgSE9NTUFHRSDigJQgVklELTA4IDogUkVUT1VSIEFSUknDiFJFIGRlCi0tIHN1
cGFiYXNlL21pZ3JhdGlvbnMvMjAyNjExMjUxMDAwMDBfdmlkMDhfdmlkZW9fcHVibGljYXRpb25f
cmVjb25jaWxlLnNxbC4KLS0KLS0gTkUgRkFJVCBQQVMgUEFSVElFIERFUyBNSUdSQVRJT05TIDog
amFtYWlzIGFwcGxpcXXDqSBhdXRvbWF0aXF1ZW1lbnQsCi0tIHNldWxlbWVudCBzdXIgZMOpY2lz
aW9uIGV4cGxpY2l0ZSBkZSBsYSBQTy4KLS0KLS0gUsOpdGFibGl0IGxhIGxlY3R1cmUgcHVibGlx
dWUgVklELTA3IChzYW5zIGxhIHLDqGdsZSDCqyBwcsOqdGUgYXUgbW9tZW50IGRlCi0tIGxhIHB1
YmxpY2F0aW9uIMK7KSwgcHVpcyByZXRpcmUgbGUgZMOpY2xlbmNoZXVyLCBsZXMgUlBDIGRlIHLD
qWNvbmNpbGlhdGlvbgotLSBnbG9iYWxlIGV0IGxldXJzIGNvbG9ubmVzLiBBdWN1bmUgbGlnbmUg
ZGUgbWVtb3JpYWxfdmlkZW9zIG4nZXN0IHN1cHByaW3DqWUuCgpiZWdpbjsKCmRyb3AgZnVuY3Rp
b24gaWYgZXhpc3RzIHB1YmxpYy5tZW1vcmlhbF92aWRlb19rbm93bl9hc3NldHNfdjEodGV4dFtd
KTsKZHJvcCBmdW5jdGlvbiBpZiBleGlzdHMgcHVibGljLmZpbmlzaF9tZW1vcmlhbF92aWRlb19y
ZWNvbmNpbGVfdjEodXVpZCwgdXVpZCwgdGV4dCk7CmRyb3AgZnVuY3Rpb24gaWYgZXhpc3RzIHB1
YmxpYy5jbGFpbV9tZW1vcmlhbF92aWRlb3NfZm9yX3JlY29uY2lsZV92MSh1dWlkLCB0aW1lc3Rh
bXB0eiwgaW50ZWdlciwgaW50ZWdlcik7Cgpkcm9wIHRyaWdnZXIgaWYgZXhpc3RzIG1lbW9yaWFs
X3ZpZGVvc19zdGFtcF9yZWFkeSBvbiBwdWJsaWMubWVtb3JpYWxfdmlkZW9zOwpkcm9wIGZ1bmN0
aW9uIGlmIGV4aXN0cyBwdWJsaWMubWVtb3JpYWxfdmlkZW9zX3N0YW1wX3JlYWR5X3YxKCk7Cgpj
cmVhdGUgb3IgcmVwbGFjZSBmdW5jdGlvbiBwdWJsaWMucmVhZF9wdWJsaWNfbWVtb3JpYWxfdmlk
ZW9zX3YxKHBfc2x1ZyB0ZXh0KQpyZXR1cm5zIHRhYmxlIChkcmFmdF92aWRlb19pZCB0ZXh0LCBw
bGF5YmFja19pZCB0ZXh0LCB2ZXJpZmllZF9kdXJhdGlvbl9tcyBpbnRlZ2VyKQpsYW5ndWFnZSBz
cWwKc3RhYmxlCnNlY3VyaXR5IGRlZmluZXIKc2V0IHNlYXJjaF9wYXRoID0gJycKYXMgJCQKICBz
ZWxlY3Qgdi5kcmFmdF92aWRlb19pZCwgdi5tdXhfcGxheWJhY2tfaWQsIHYudmVyaWZpZWRfZHVy
YXRpb25fbXMKICAgIGZyb20gcHVibGljLm1lbW9yaWFscyBtCiAgICBqb2luIHB1YmxpYy5tZW1v
cmlhbF9wdWJsaXNoZWRfc25hcHNob3RzIHMgb24gcy5tZW1vcmlhbF9pZCA9IG0uaWQKICAgIGpv
aW4gcHVibGljLm1lbW9yaWFsX3ZpZGVvcyB2IG9uIHYubWVtb3JpYWxfaWQgPSBtLmlkIGFuZCB2
LnN0YXR1cyA9ICdyZWFkeScKICAgd2hlcmUgcF9zbHVnIGlzIG5vdCBudWxsCiAgICAgYW5kIG0u
c2x1ZyA9IHBfc2x1ZwogICAgIGFuZCBtLnN0YXR1cyA9ICdwdWJsaXNoZWQnCiAgICAgYW5kIG0u
YWNjZXNzX2xldmVsID0gJ2NvbXBsZXQnCiAgICAgYW5kIHB1YmxpYy5tZW1vcmlhbF9wdWJsaWNs
eV92aXNpYmxlX3YxKG0uaWQsIG5vdygpKQogICAgIGFuZCBqc29uYl90eXBlb2Yocy5jb250ZW50
IC0+ICd2aWRlbycgLT4gJ2l0ZW1zJykgPSAnYXJyYXknCiAgICAgYW5kIGV4aXN0cyAoc2VsZWN0
IDEgZnJvbSBqc29uYl9hcnJheV9lbGVtZW50cyhzLmNvbnRlbnQgLT4gJ3ZpZGVvJyAtPiAnaXRl
bXMnKSBpdGVtCiAgICAgICAgICAgICAgICAgIHdoZXJlIGl0ZW0gLT4+ICdpZCcgPSB2LmRyYWZ0
X3ZpZGVvX2lkKTsKJCQ7CgpyZXZva2UgYWxsIG9uIGZ1bmN0aW9uIHB1YmxpYy5yZWFkX3B1Ymxp
Y19tZW1vcmlhbF92aWRlb3NfdjEodGV4dCkgZnJvbSBwdWJsaWMsIGFub24sIGF1dGhlbnRpY2F0
ZWQsIHNlcnZpY2Vfcm9sZTsKZ3JhbnQgZXhlY3V0ZSBvbiBmdW5jdGlvbiBwdWJsaWMucmVhZF9w
dWJsaWNfbWVtb3JpYWxfdmlkZW9zX3YxKHRleHQpIHRvIHNlcnZpY2Vfcm9sZTsKCmFsdGVyIHRh
YmxlIHB1YmxpYy5tZW1vcmlhbF92aWRlb3MKICBkcm9wIGNvbHVtbiBpZiBleGlzdHMgcmVjb25j
aWxlX25leHRfYXQsCiAgZHJvcCBjb2x1bW4gaWYgZXhpc3RzIHJlY29uY2lsZV9hdHRlbXB0cywK
ICBkcm9wIGNvbHVtbiBpZiBleGlzdHMgcmVjb25jaWxlX2NsYWltZWRfdW50aWwsCiAgZHJvcCBj
b2x1bW4gaWYgZXhpc3RzIHJlY29uY2lsZV9jbGFpbWVkX2J5LAogIGRyb3AgY29sdW1uIGlmIGV4
aXN0cyByZWFkeV9hdDsKCm5vdGlmeSBwZ3JzdCwgJ3JlbG9hZCBzY2hlbWEnOwoKY29tbWl0Owo=
';
  c_source   text;
  v_lines    integer;
begin
  -- 1. Décodage du texte (base64, ASCII pur), puis contrôle de son empreinte.
  begin
    c_source := convert_from(decode(c_payload, 'base64'), 'UTF8');
  exception when others then
    raise exception 'STOP [20261125100000] : texte du retour arrière illisible (copier-coller incomplet ou altéré). Rien n''a été modifié.';
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

select '20261125100000' as version,
       (select count(*) from supabase_migrations.schema_migrations) as versions_enregistrees,
       case when not exists (select 1 from supabase_migrations.schema_migrations where version = '20261125100000')
             and (select count(*) from supabase_migrations.schema_migrations) = 50
            then 'OK — retour arrière 2/3 effectué'
            else 'ECHEC — prévenir le QG' end as verdict;
