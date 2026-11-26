-- =====================================================================
-- HERITAGE HOMMAGE — RETOUR ARRIÈRE 1/3 — 20261125090000_vid07_memorial_videos
-- =====================================================================
-- Source : supabase/rollbacks/20261125090000_vid07_memorial_videos.down.sql
-- SHA-256 du fichier : 29d47f00e4bf135f1add40f767304bba072c118e5ecc818e1126df32fc7da1d2
-- Uniquement sur décision du QG. Ordre inverse : 3, 2, 1.
--
-- ATTENTION : supprime les tables des vidéos hébergées.
-- Refuse tant que c_assets_mux_supprimes vaut false et qu'une
-- vidéo non supprimée existe.
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
  c_version  constant text := '20261125090000';
  c_count    constant integer := 50;
  c_sha256   constant text := '29d47f00e4bf135f1add40f767304bba072c118e5ecc818e1126df32fc7da1d2';
  c_txn      constant integer := 2;
  c_assets_mux_supprimes constant boolean := false;  -- PO : passer à true SEULEMENT après suppression des assets Mux
  -- Texte exact de supabase/rollbacks/20261125090000_vid07_memorial_videos.down.sql, encodé en base64.
  c_payload  constant text := '
LS0gSEVSSVRBR0UgSE9NTUFHRSDigJQgVklELTA3IDogUkVUT1VSIEFSUknDiFJFIGRlCi0tIHN1
cGFiYXNlL21pZ3JhdGlvbnMvMjAyNjExMjUwOTAwMDBfdmlkMDdfbWVtb3JpYWxfdmlkZW9zLnNx
bC4KLS0KLS0gTkUgRkFJVCBQQVMgUEFSVElFIERFUyBNSUdSQVRJT05TIDogamFtYWlzIGFwcGxp
cXXDqSBhdXRvbWF0aXF1ZW1lbnQsCi0tIHNldWxlbWVudCBzdXIgZMOpY2lzaW9uIGV4cGxpY2l0
ZSBkZSBsYSBQTy4KLS0KLS0gQVRURU5USU9OIDogc3VwcHJpbWUgbGVzIHRhYmxlcyBtZW1vcmlh
bF92aWRlb3MgZXQgbWVtb3JpYWxfdmlkZW9fZXZlbnRzLgotLSBBdmFudCBkZSBsJ2FwcGxpcXVl
ciBzdXIgdW4gcHJvamV0IG/DuSBkZXMgdmlkw6lvcyBvbnQgw6l0w6kgZW52b3nDqWVzLCBsZXMK
LS0gYXNzZXRzIE11eCBjb3JyZXNwb25kYW50cyBkb2l2ZW50IGF2b2lyIMOpdMOpIHN1cHByaW3D
qXMgKHNpbm9uIGlscwotLSBkZXZpZW5uZW50IG9ycGhlbGlucyBjaGV6IE11eCwgZXQgZmFjdHVy
w6lzKS4KCmJlZ2luOwoKZHJvcCBmdW5jdGlvbiBpZiBleGlzdHMgcHVibGljLnJlYWRfcHVibGlj
X21lbW9yaWFsX3ZpZGVvc192MSh0ZXh0KTsKZHJvcCBmdW5jdGlvbiBpZiBleGlzdHMgcHVibGlj
Lmxpc3RfbWVtb3JpYWxfdmlkZW9zX3YxKHV1aWQsIHV1aWQpOwpkcm9wIGZ1bmN0aW9uIGlmIGV4
aXN0cyBwdWJsaWMuY29uZmlybV9tZW1vcmlhbF92aWRlb19kZWxldGVkX3YxKHV1aWQpOwpkcm9w
IGZ1bmN0aW9uIGlmIGV4aXN0cyBwdWJsaWMucmVxdWVzdF9tZW1vcmlhbF92aWRlb19yZW1vdmFs
X3YxKHV1aWQsIHV1aWQsIHRleHQpOwpkcm9wIGZ1bmN0aW9uIGlmIGV4aXN0cyBwdWJsaWMubGlz
dF9tZW1vcmlhbF92aWRlb3NfdG9fcmVjb25jaWxlX3YxKHRpbWVzdGFtcHR6LCBpbnRlZ2VyKTsK
ZHJvcCBmdW5jdGlvbiBpZiBleGlzdHMgcHVibGljLmFwcGx5X21lbW9yaWFsX3ZpZGVvX2V2ZW50
X3YxKHRleHQsIHRleHQsIHV1aWQsIHRleHQsIHRleHQsIHRleHQsIGludGVnZXIpOwpkcm9wIGZ1
bmN0aW9uIGlmIGV4aXN0cyBwdWJsaWMuY2FuY2VsX21lbW9yaWFsX3ZpZGVvX3VwbG9hZF92MSh1
dWlkLCB1dWlkLCB1dWlkKTsKZHJvcCBmdW5jdGlvbiBpZiBleGlzdHMgcHVibGljLmZhaWxfbWVt
b3JpYWxfdmlkZW9fdXBsb2FkX3YxKHV1aWQsIHRleHQpOwpkcm9wIGZ1bmN0aW9uIGlmIGV4aXN0
cyBwdWJsaWMuYXR0YWNoX21lbW9yaWFsX3ZpZGVvX3VwbG9hZF92MSh1dWlkLCB0ZXh0LCB0aW1l
c3RhbXB0eik7CmRyb3AgZnVuY3Rpb24gaWYgZXhpc3RzIHB1YmxpYy5yZXNlcnZlX21lbW9yaWFs
X3ZpZGVvX3VwbG9hZF92MSh1dWlkLCB1dWlkLCB0ZXh0LCBpbnRlZ2VyKTsKZHJvcCBmdW5jdGlv
biBpZiBleGlzdHMgcHVibGljLm1lbW9yaWFsX3ZpZGVvX2d1YXJkX3YxKHV1aWQsIHV1aWQpOwpk
cm9wIGZ1bmN0aW9uIGlmIGV4aXN0cyBwdWJsaWMubWVtb3JpYWxfdmlkZW9fc3RhdHVzX3Jhbmtf
djEodGV4dCk7Cgpkcm9wIHRhYmxlIGlmIGV4aXN0cyBwdWJsaWMubWVtb3JpYWxfdmlkZW9fZXZl
bnRzOwpkcm9wIHRhYmxlIGlmIGV4aXN0cyBwdWJsaWMubWVtb3JpYWxfdmlkZW9zOwoKbm90aWZ5
IHBncnN0LCAncmVsb2FkIHNjaGVtYSc7Cgpjb21taXQ7Cg==
';
  c_source   text;
  v_lines    integer;
begin
  -- 1. Décodage du texte (base64, ASCII pur), puis contrôle de son empreinte.
  begin
    c_source := convert_from(decode(c_payload, 'base64'), 'UTF8');
  exception when others then
    raise exception 'STOP [20261125090000] : texte du retour arrière illisible (copier-coller incomplet ou altéré). Rien n''a été modifié.';
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
  if to_regclass('public.memorial_videos') is not null
     and exists (select 1 from public.memorial_videos where status <> 'deleted')
     and not c_assets_mux_supprimes then
    raise exception 'STOP [20261125090000] : des vidéos hébergées existent ; ce retour arrière SUPPRIME leurs lignes et rendrait leurs assets Mux orphelins (facturés). Supprimer d''abord les assets, puis décision PO (voir c_assets_mux_supprimes). Rien n''a été modifié.';
  end if;

  execute regexp_replace(c_source, '^(begin|commit);[ \t]*$', '', 'gn');
  delete from supabase_migrations.schema_migrations where version = c_version;
end
$heritage_rollback$;

select '20261125090000' as version,
       (select count(*) from supabase_migrations.schema_migrations) as versions_enregistrees,
       case when not exists (select 1 from supabase_migrations.schema_migrations where version = '20261125090000')
             and (select count(*) from supabase_migrations.schema_migrations) = 49
            then 'OK — retour arrière 1/3 effectué'
            else 'ECHEC — prévenir le QG' end as verdict;
