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
  -- Texte exact de supabase/rollbacks/20261116120000_lot2_offering_signature.down.sql, encodé en base64.
  c_payload  constant text := '
LS0gSEVSSVRBR0UgSE9NTUFHRSDigJQgTG90IDIgOiBSRVRPVVIgQVJSScOIUkUgZGUKLS0gc3Vw
YWJhc2UvbWlncmF0aW9ucy8yMDI2MTExNjEyMDAwMF9sb3QyX29mZmVyaW5nX3NpZ25hdHVyZS5z
cWwuCi0tCi0tIE5FIEZBSVQgUEFTIFBBUlRJRSBERVMgTUlHUkFUSU9OUyA6IGphbWFpcyBhcHBs
aXF1w6kgYXV0b21hdGlxdWVtZW50LAotLSBzZXVsZW1lbnQgc3VyIGTDqWNpc2lvbiBleHBsaWNp
dGUgZHUgUUcuCi0tCi0tIEFUVEVOVElPTiDigJQgUEVSVEUgREUgRE9OTsOJRVMgOiBzdXBwcmlt
ZXIgbGVzIGNvbG9ubmVzIGVmZmFjZSBEw4lGSU5JVElWRU1FTlQKLS0gdG91dGVzIGxlcyBzaWdu
YXR1cmVzIHJlw6d1ZXMuIEF2YW50IGQnYXBwbGlxdWVyLCBkw6ljaWRlciBzJ2lsIGZhdXQgbGVz
Ci0tIGNvbnNlcnZlciBob3JzIGJhc2UgKGV4cG9ydCBwYXIgbGUgUUcsIHNvdXMgc2EgcmVzcG9u
c2FiaWxpdMOpIFJHUEQpLgotLSBMZXMgZ2VzdGVzIGV1eC1tw6ptZXMgKGJvdWdpZSwgbHlzLCBj
xZN1ciwgZGF0ZXMpIHNvbnQgdG91cyBjb25zZXJ2w6lzLgotLQotLSBPcmRyZSByZWNvbW1hbmTD
qSA6IHJldGlyZXIgZCdhYm9yZCBsZSBjb2RlIHF1aSBhcHBlbGxlCi0tIHNpZ25fc3ltYm9saWNf
b2ZmZXJpbmdfdjEgKGwnYXBwbGljYXRpb24gZMOpZ3JhZGUgc2FucyBlcnJldXIgOiBsZSBnZXN0
ZQotLSByZXN0ZSBlbnJlZ2lzdHLDqSwgc2V1bGUgbGEgc2lnbmF0dXJlIMOpY2hvdWUpLCBwdWlz
IGFwcGxpcXVlciBjZSBmaWNoaWVyLgotLQotLSBSw6l0YWJsaXQgZXhhY3RlbWVudCBsJ8OpdGF0
IHByw6ljw6lkZW50IDogbGVjdHVyZSBkZSBsYSBmYW1pbGxlIGF1IG5pdmVhdSBkZQotLSBsYSB0
YWJsZSAoQzEpLCBhdWN1bmUgY29sb25uZSBkZSBzaWduYXR1cmUsIGF1Y3VuZSBmb25jdGlvbiBk
ZSBzaWduYXR1cmUuCgpiZWdpbjsKCmRyb3AgZnVuY3Rpb24gaWYgZXhpc3RzIHB1YmxpYy5zaWdu
X3N5bWJvbGljX29mZmVyaW5nX3YxKHRleHQsIHV1aWQsIHRleHQpOwoKYWx0ZXIgdGFibGUgcHVi
bGljLnN5bWJvbGljX29mZmVyaW5ncwogIGRyb3AgY29uc3RyYWludCBpZiBleGlzdHMgc3ltYm9s
aWNfb2ZmZXJpbmdzX3NpZ25hdHVyZV9zaGFwZSwKICBkcm9wIGNvbnN0cmFpbnQgaWYgZXhpc3Rz
IHN5bWJvbGljX29mZmVyaW5nc19zaWduYXR1cmVfc2lnbmVkX2F0LAogIGRyb3AgY29uc3RyYWlu
dCBpZiBleGlzdHMgc3ltYm9saWNfb2ZmZXJpbmdzX3NpZ25lZF9hZnRlcl9jcmVhdGVkOwoKYWx0
ZXIgdGFibGUgcHVibGljLnN5bWJvbGljX29mZmVyaW5ncwogIGRyb3AgY29sdW1uIGlmIGV4aXN0
cyBzaWduYXR1cmUsCiAgZHJvcCBjb2x1bW4gaWYgZXhpc3RzIHNpZ25lZF9hdDsKCnJldm9rZSBz
ZWxlY3Qgb24gdGFibGUgcHVibGljLnN5bWJvbGljX29mZmVyaW5ncyBmcm9tIGF1dGhlbnRpY2F0
ZWQ7CmdyYW50IHNlbGVjdCBvbiB0YWJsZSBwdWJsaWMuc3ltYm9saWNfb2ZmZXJpbmdzIHRvIGF1
dGhlbnRpY2F0ZWQ7Cgpjb21tZW50IG9uIHRhYmxlIHB1YmxpYy5zeW1ib2xpY19vZmZlcmluZ3Mg
aXMKICAnT2ZmcmFuZGVzIHN5bWJvbGlxdWVzIFYxIChDMSkuIE9uZSBhbm9ueW1vdXMgZ2VzdHVy
ZSAoYm91Z2llLCBseXMsIGNvZXVyKSBsZWZ0IG9uIGEgcHVibGlzaGVkIG1lbW9yaWFsLiBDYXJy
aWVzIG5vIHZpc2l0b3IgZGF0YSBhdCBhbGwuIFdyaXR0ZW4gb25seSBieSByZWNvcmRfc3ltYm9s
aWNfb2ZmZXJpbmdfdjEoKSAoc2VydmljZV9yb2xlKTsgcmVhZGFibGUgb25seSBieSB0aGUgbWVt
b3JpYWwnJ3Mgb3duZXIuIE5ldmVyIGRlbGV0ZWQgb24gZXhwaXJ5IG9mIHRoZSBkZXBvc2l0IHJp
Z2h0Lic7Cgpjb21taXQ7Cg==
';
  c_source   text;
  v_lines    integer;
begin
  -- 1. Décodage du texte (base64, ASCII pur), puis contrôle de son empreinte.
  begin
    c_source := convert_from(decode(c_payload, 'base64'), 'UTF8');
  exception when others then
    raise exception 'STOP [20261116120000] : texte du retour arrière illisible (copier-coller incomplet ou altéré). Rien n''a été modifié.';
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
