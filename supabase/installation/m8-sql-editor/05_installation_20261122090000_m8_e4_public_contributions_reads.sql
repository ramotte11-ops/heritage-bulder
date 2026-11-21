-- =====================================================================
-- HERITAGE HOMMAGE — INSTALLATION 5/5 — 20261122090000_m8_e4_public_contributions_reads
-- =====================================================================
-- Source : supabase/migrations/20261122090000_m8_e4_public_contributions_reads.sql
-- SHA-256 du fichier : 5c143aafc8d5d747f9cac0ef2add9280b569525f9309145e268c5ec7573717e0
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
  c_version  constant text := '20261122090000';
  c_name     constant text := 'm8_e4_public_contributions_reads';
  c_previous constant text := '20261121090000';
  c_count    constant integer := 48;
  c_sha256   constant text := '5c143aafc8d5d747f9cac0ef2add9280b569525f9309145e268c5ec7573717e0';
  c_txn      constant integer := 2;
  -- Texte exact de supabase/migrations/20261122090000_m8_e4_public_contributions_reads.sql, encodé en base64.
  c_payload  constant text := '
LS0gSEVSSVRBR0UgSE9NTUFHRSDigJQgTTgtRTQgOiBsZWN0dXJlcyBwdWJsaXF1ZXMgY2libMOp
ZXMgZGVzIENvbnRyaWJ1dGlvbnMuCi0tCi0tIMOJY3JpdGUgZXQgdGVzdMOpZSBlbiBsb2NhbCAo
bnBtIHJ1biBkYjp0ZXN0KSA7IE5PTiBhcHBsaXF1w6llLiBTb24KLS0gYXBwbGljYXRpb24gcmVs
w6h2ZSBkZSBFNiwgYXZlYyBsZXMgbWlncmF0aW9ucyBFMSwgRTIgZXQgRTMuCi0tIFJldG91ciBh
cnJpw6hyZSA6IHN1cGFiYXNlL3JvbGxiYWNrcy8yMDI2MTEyMjA5MDAwMF9tOF9lNF9wdWJsaWNf
Y29udHJpYnV0aW9uc19yZWFkcy5kb3duLnNxbC4KLS0KLS0gUG91cnF1b2kgOiBsJ0FsYnVtIG5l
IGRvaXQgYXZvaXIgQVVDVU4gcGxhZm9uZCAoZGlyZWN0aXZlIGR1IGNoZWYgZGUgcHJvamV0Ci0t
IG7CsCAwMikuIExhIHBhZ2UgcHVibGlxdWUgbmUgY2hhcmdlIGRvbmMgcGx1cyDCqyB0b3V0IMK7
IGQnYXZhbmNlIDogZWxsZSBsaXQKLS0gdW5lIHBhZ2UsIHB1aXMgbGVzIHN1aXZhbnRlcyDDoCBs
YSBkZW1hbmRlLiBEZXV4IGJlc29pbnMgcmVzdGFpZW50IHNhbnMKLS0gbGVjdHVyZSBhZGFwdMOp
ZSA6Ci0tICAxLiBsYSBzY8OobmUgTzggZG9pdCByZXByw6lzZW50ZXIgY2hhcXVlIGNhdMOpZ29y
aWUgZGlzcG9uaWJsZSwgbcOqbWUgc2kgc2EKLS0gICAgIGNvbnRyaWJ1dGlvbiBsYSBwbHVzIHLD
qWNlbnRlIGVzdCB0csOocyBhbmNpZW5uZSAoaG9ycyBkZXMgcGFnZXMgbHVlcykgOgotLSAgICAg
cmVhZF9wdWJsaWNfY29udHJpYnV0aW9uc192MiBhY2NlcHRlIHVuIGZpbHRyZSBkZSB0eXBlcyA7
Ci0tICAyLiByZW5vdXZlbGVyIGxlIGxpZW4gZCd1bmUgcGhvdG8gcHJvZm9uZGUgZGFucyBsJ0Fs
YnVtIHNhbnMgcmVsaXJlIHRvdXQKLS0gICAgIGwnQWxidW0gOiByZWFkX3B1YmxpY19jb250cmli
dXRpb25zX2J5X2lkc192MSByZWxpdCBkZXMgY29udHJpYnV0aW9ucwotLSAgICAgcHLDqWNpc2Vz
LgotLSBMZXMgZGV1eCBhcHBsaXF1ZW50IEVYQUNURU1FTlQgbGVzIHLDqGdsZXMgZGUgcmVhZF9w
dWJsaWNfY29udHJpYnV0aW9uc192MQotLSAoRTEpIDogaG9tbWFnZSBwdWJsaWMsIHJ1YnJpcXVl
IG5vbiBtYXNxdcOpZSwgY2F0w6lnb3JpZXMgZW4gdmlndWV1ciwgc3RhdHV0Ci0tIHB1Ymxpc2hl
ZCwgcGhvdG8gcmVhZHkgOyBvcmRyZSBQMSA7IGphbWFpcyBpZGVtcG90ZW5jeV9rZXkgbmkgY2hl
bWluIGhvcnMKLS0gZGUgbCdvYmpldCBgbWVkaWFgIChsZSBzZXJ2ZXVyIGxlIHNpZ25lLCBuZSBs
ZSB0cmFuc21ldCBwYXMpLgoKYmVnaW47CgpjcmVhdGUgb3IgcmVwbGFjZSBmdW5jdGlvbiBwdWJs
aWMucmVhZF9wdWJsaWNfY29udHJpYnV0aW9uc192MigKICBwX3NsdWcgdGV4dCwKICBwX2xpbWl0
IGludGVnZXIgZGVmYXVsdCAyNCwKICBwX2JlZm9yZV9wdWJsaXNoZWRfYXQgdGltZXN0YW1wdHog
ZGVmYXVsdCBudWxsLAogIHBfYmVmb3JlX2lkIHV1aWQgZGVmYXVsdCBudWxsLAogIHBfdHlwZXMg
dGV4dFtdIGRlZmF1bHQgbnVsbAopCnJldHVybnMgdGFibGUgKAogIGNvbnRyaWJ1dGlvbl9pZCB1
dWlkLAogIG1lc3NhZ2VfdHlwZSB0ZXh0LAogIGF1dGhvcl9uYW1lIHRleHQsCiAgY29udGVudCB0
ZXh0LAogIGNhcHRpb24gdGV4dCwKICBwdWJsaXNoZWRfYXQgdGltZXN0YW1wdHosCiAgbWVkaWEg
anNvbmIKKQpsYW5ndWFnZSBwbHBnc3FsCnN0YWJsZQpzZWN1cml0eSBkZWZpbmVyCnNldCBzZWFy
Y2hfcGF0aCA9ICcnCmFzICQkCiN2YXJpYWJsZV9jb25mbGljdCB1c2VfY29sdW1uCmRlY2xhcmUK
ICB2X21lbW9yaWFsX2lkIHV1aWQ7CiAgdl9jYXRlZ29yaWVzIGpzb25iOwogIHZfbGltaXQgaW50
ZWdlciA6PSBsZWFzdChncmVhdGVzdChjb2FsZXNjZShwX2xpbWl0LCAyNCksIDEpLCAxMDApOwpi
ZWdpbgogIGlmIHBfc2x1ZyBpcyBudWxsCiAgICAgb3IgKChwX2JlZm9yZV9wdWJsaXNoZWRfYXQg
aXMgbnVsbCkgPD4gKHBfYmVmb3JlX2lkIGlzIG51bGwpKQogICAgIG9yIChwX3R5cGVzIGlzIG5v
dCBudWxsIGFuZCAoY2FyZGluYWxpdHkocF90eXBlcykgPSAwCiAgICAgICAgIG9yIG5vdCAocF90
eXBlcyA8QCBhcnJheVsnY29uZG9sZW5jZScsICd0ZXN0aW1vbmlhbCcsICdwaG90byddKSkpIHRo
ZW4KICAgIHJldHVybjsKICBlbmQgaWY7CiAgc2VsZWN0IG0uaWQgaW50byB2X21lbW9yaWFsX2lk
IGZyb20gcHVibGljLm1lbW9yaWFscyBtIHdoZXJlIG0uc2x1ZyA9IHBfc2x1ZzsKICBpZiB2X21l
bW9yaWFsX2lkIGlzIG51bGwgb3Igbm90IHB1YmxpYy5jb250cmlidXRpb25zX3J1YnJpY19wdWJs
aWNfdjEodl9tZW1vcmlhbF9pZCwgbm93KCkpIHRoZW4KICAgIHJldHVybjsKICBlbmQgaWY7CiAg
dl9jYXRlZ29yaWVzIDo9IHB1YmxpYy5jb250cmlidXRpb25fY2F0ZWdvcmllc19pbl9lZmZlY3Rf
djEodl9tZW1vcmlhbF9pZCk7CgogIHJldHVybiBxdWVyeQogICAgc2VsZWN0IG1zZy5pZCwgbXNn
Lm1lc3NhZ2VfdHlwZSwgbXNnLmF1dGhvcl9uYW1lLCBtc2cuY29udGVudCwgbXNnLmNhcHRpb24s
IG1zZy5wdWJsaXNoZWRfYXQsCiAgICAgICAgICAgY2FzZSB3aGVuIG1zZy5tZXNzYWdlX3R5cGUg
PSAncGhvdG8nIHRoZW4KICAgICAgICAgICAgIGpzb25iX2J1aWxkX29iamVjdCgnbWVkaWFfaWQn
LCBtZC5pZCwgJ3N0b3JhZ2VfcGF0aCcsIG1kLnN0b3JhZ2VfcGF0aCwKICAgICAgICAgICAgICAg
ICAgICAgICAgICAgICAgICAnd2lkdGgnLCBtZC53aWR0aCwgJ2hlaWdodCcsIG1kLmhlaWdodCkK
ICAgICAgICAgICBlbmQKICAgICAgZnJvbSBwdWJsaWMubWVzc2FnZXMgbXNnCiAgICAgIGxlZnQg
am9pbiBwdWJsaWMubWVkaWEgbWQKICAgICAgICBvbiBtZC5pZCA9IG1zZy5tZWRpYV9pZCBhbmQg
bWQubWVtb3JpYWxfaWQgPSBtc2cubWVtb3JpYWxfaWQKICAgICB3aGVyZSBtc2cubWVtb3JpYWxf
aWQgPSB2X21lbW9yaWFsX2lkCiAgICAgICBhbmQgbXNnLnN0YXR1cyA9ICdwdWJsaXNoZWQnCiAg
ICAgICBhbmQgKHBfdHlwZXMgaXMgbnVsbCBvciBtc2cubWVzc2FnZV90eXBlID0gYW55IChwX3R5
cGVzKSkKICAgICAgIGFuZCAoKG1zZy5tZXNzYWdlX3R5cGUgPSAnY29uZG9sZW5jZScgYW5kICh2
X2NhdGVnb3JpZXMgLT4+ICdjb25kb2xlbmNlcycpOjpib29sZWFuKQogICAgICAgICBvciAobXNn
Lm1lc3NhZ2VfdHlwZSA9ICd0ZXN0aW1vbmlhbCcgYW5kICh2X2NhdGVnb3JpZXMgLT4+ICdzdG9y
aWVzJyk6OmJvb2xlYW4pCiAgICAgICAgIG9yIChtc2cubWVzc2FnZV90eXBlID0gJ3Bob3RvJyBh
bmQgKHZfY2F0ZWdvcmllcyAtPj4gJ3Bob3RvcycpOjpib29sZWFuCiAgICAgICAgICAgICBhbmQg
bWQuc3RhdHVzID0gJ3JlYWR5JyBhbmQgbWQucHVycG9zZSA9ICdjb250cmlidXRpb24nKSkKICAg
ICAgIGFuZCAocF9iZWZvcmVfcHVibGlzaGVkX2F0IGlzIG51bGwKICAgICAgICAgICAgb3IgKG1z
Zy5wdWJsaXNoZWRfYXQsIG1zZy5pZCkgPCAocF9iZWZvcmVfcHVibGlzaGVkX2F0LCBwX2JlZm9y
ZV9pZCkpCiAgICAgb3JkZXIgYnkgbXNnLnB1Ymxpc2hlZF9hdCBkZXNjLCBtc2cuaWQgZGVzYwog
ICAgIGxpbWl0IHZfbGltaXQ7CmVuZDsKJCQ7CgpjcmVhdGUgb3IgcmVwbGFjZSBmdW5jdGlvbiBw
dWJsaWMucmVhZF9wdWJsaWNfY29udHJpYnV0aW9uc19ieV9pZHNfdjEocF9zbHVnIHRleHQsIHBf
aWRzIHV1aWRbXSkKcmV0dXJucyB0YWJsZSAoCiAgY29udHJpYnV0aW9uX2lkIHV1aWQsCiAgbWVz
c2FnZV90eXBlIHRleHQsCiAgYXV0aG9yX25hbWUgdGV4dCwKICBjb250ZW50IHRleHQsCiAgY2Fw
dGlvbiB0ZXh0LAogIHB1Ymxpc2hlZF9hdCB0aW1lc3RhbXB0eiwKICBtZWRpYSBqc29uYgopCmxh
bmd1YWdlIHBscGdzcWwKc3RhYmxlCnNlY3VyaXR5IGRlZmluZXIKc2V0IHNlYXJjaF9wYXRoID0g
JycKYXMgJCQKI3ZhcmlhYmxlX2NvbmZsaWN0IHVzZV9jb2x1bW4KZGVjbGFyZQogIHZfbWVtb3Jp
YWxfaWQgdXVpZDsKICB2X2NhdGVnb3JpZXMganNvbmI7CmJlZ2luCiAgaWYgcF9zbHVnIGlzIG51
bGwgb3IgcF9pZHMgaXMgbnVsbCBvciBjYXJkaW5hbGl0eShwX2lkcykgPSAwIG9yIGNhcmRpbmFs
aXR5KHBfaWRzKSA+IDEwMCB0aGVuCiAgICByZXR1cm47CiAgZW5kIGlmOwogIHNlbGVjdCBtLmlk
IGludG8gdl9tZW1vcmlhbF9pZCBmcm9tIHB1YmxpYy5tZW1vcmlhbHMgbSB3aGVyZSBtLnNsdWcg
PSBwX3NsdWc7CiAgaWYgdl9tZW1vcmlhbF9pZCBpcyBudWxsIG9yIG5vdCBwdWJsaWMuY29udHJp
YnV0aW9uc19ydWJyaWNfcHVibGljX3YxKHZfbWVtb3JpYWxfaWQsIG5vdygpKSB0aGVuCiAgICBy
ZXR1cm47CiAgZW5kIGlmOwogIHZfY2F0ZWdvcmllcyA6PSBwdWJsaWMuY29udHJpYnV0aW9uX2Nh
dGVnb3JpZXNfaW5fZWZmZWN0X3YxKHZfbWVtb3JpYWxfaWQpOwoKICByZXR1cm4gcXVlcnkKICAg
IHNlbGVjdCBtc2cuaWQsIG1zZy5tZXNzYWdlX3R5cGUsIG1zZy5hdXRob3JfbmFtZSwgbXNnLmNv
bnRlbnQsIG1zZy5jYXB0aW9uLCBtc2cucHVibGlzaGVkX2F0LAogICAgICAgICAgIGNhc2Ugd2hl
biBtc2cubWVzc2FnZV90eXBlID0gJ3Bob3RvJyB0aGVuCiAgICAgICAgICAgICBqc29uYl9idWls
ZF9vYmplY3QoJ21lZGlhX2lkJywgbWQuaWQsICdzdG9yYWdlX3BhdGgnLCBtZC5zdG9yYWdlX3Bh
dGgsCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJ3dpZHRoJywgbWQud2lkdGgsICdo
ZWlnaHQnLCBtZC5oZWlnaHQpCiAgICAgICAgICAgZW5kCiAgICAgIGZyb20gcHVibGljLm1lc3Nh
Z2VzIG1zZwogICAgICBsZWZ0IGpvaW4gcHVibGljLm1lZGlhIG1kCiAgICAgICAgb24gbWQuaWQg
PSBtc2cubWVkaWFfaWQgYW5kIG1kLm1lbW9yaWFsX2lkID0gbXNnLm1lbW9yaWFsX2lkCiAgICAg
d2hlcmUgbXNnLm1lbW9yaWFsX2lkID0gdl9tZW1vcmlhbF9pZAogICAgICAgYW5kIG1zZy5pZCA9
IGFueSAocF9pZHMpCiAgICAgICBhbmQgbXNnLnN0YXR1cyA9ICdwdWJsaXNoZWQnCiAgICAgICBh
bmQgKChtc2cubWVzc2FnZV90eXBlID0gJ2NvbmRvbGVuY2UnIGFuZCAodl9jYXRlZ29yaWVzIC0+
PiAnY29uZG9sZW5jZXMnKTo6Ym9vbGVhbikKICAgICAgICAgb3IgKG1zZy5tZXNzYWdlX3R5cGUg
PSAndGVzdGltb25pYWwnIGFuZCAodl9jYXRlZ29yaWVzIC0+PiAnc3RvcmllcycpOjpib29sZWFu
KQogICAgICAgICBvciAobXNnLm1lc3NhZ2VfdHlwZSA9ICdwaG90bycgYW5kICh2X2NhdGVnb3Jp
ZXMgLT4+ICdwaG90b3MnKTo6Ym9vbGVhbgogICAgICAgICAgICAgYW5kIG1kLnN0YXR1cyA9ICdy
ZWFkeScgYW5kIG1kLnB1cnBvc2UgPSAnY29udHJpYnV0aW9uJykpCiAgICAgb3JkZXIgYnkgbXNn
LnB1Ymxpc2hlZF9hdCBkZXNjLCBtc2cuaWQgZGVzYzsKZW5kOwokJDsKCnJldm9rZSBhbGwgb24g
ZnVuY3Rpb24gcHVibGljLnJlYWRfcHVibGljX2NvbnRyaWJ1dGlvbnNfdjIodGV4dCwgaW50ZWdl
ciwgdGltZXN0YW1wdHosIHV1aWQsIHRleHRbXSkgZnJvbSBwdWJsaWMsIGFub24sIGF1dGhlbnRp
Y2F0ZWQ7CnJldm9rZSBhbGwgb24gZnVuY3Rpb24gcHVibGljLnJlYWRfcHVibGljX2NvbnRyaWJ1
dGlvbnNfYnlfaWRzX3YxKHRleHQsIHV1aWRbXSkgZnJvbSBwdWJsaWMsIGFub24sIGF1dGhlbnRp
Y2F0ZWQ7CmdyYW50IGV4ZWN1dGUgb24gZnVuY3Rpb24gcHVibGljLnJlYWRfcHVibGljX2NvbnRy
aWJ1dGlvbnNfdjIodGV4dCwgaW50ZWdlciwgdGltZXN0YW1wdHosIHV1aWQsIHRleHRbXSkgdG8g
c2VydmljZV9yb2xlOwpncmFudCBleGVjdXRlIG9uIGZ1bmN0aW9uIHB1YmxpYy5yZWFkX3B1Ymxp
Y19jb250cmlidXRpb25zX2J5X2lkc192MSh0ZXh0LCB1dWlkW10pIHRvIHNlcnZpY2Vfcm9sZTsK
CmNvbW1lbnQgb24gZnVuY3Rpb24gcHVibGljLnJlYWRfcHVibGljX2NvbnRyaWJ1dGlvbnNfdjIo
dGV4dCwgaW50ZWdlciwgdGltZXN0YW1wdHosIHV1aWQsIHRleHRbXSkgaXMKICAnTTgtRTQuIHJl
YWRfcHVibGljX2NvbnRyaWJ1dGlvbnNfdjEgKyBmaWx0cmUgZGUgdHlwZXMgZmFjdWx0YXRpZiAo
c2PDqG5lIE84IDogbGEgcGx1cyByw6ljZW50ZSBkZSBjaGFxdWUgY2F0w6lnb3JpZSwgc2FucyBs
aXJlIHRvdXQgbCcnQWxidW0pLiBNw6ptZXMgcsOoZ2xlcywgb3JkcmUgUDEsIGN1cnNldXIuIHNl
cnZpY2Vfcm9sZSBzZXVsLic7CmNvbW1lbnQgb24gZnVuY3Rpb24gcHVibGljLnJlYWRfcHVibGlj
X2NvbnRyaWJ1dGlvbnNfYnlfaWRzX3YxKHRleHQsIHV1aWRbXSkgaXMKICAnTTgtRTQuIFJlbGVj
dHVyZSBkZSAxIMOgIDEwMCBjb250cmlidXRpb25zIHByw6ljaXNlcywgYXV4IHLDqGdsZXMgZGUg
bGEgbGVjdHVyZSBwdWJsaXF1ZSAocmVub3V2ZWxsZW1lbnQgZGVzIGxpZW5zIHBob3RvIGV4cGly
w6lzKS4gc2VydmljZV9yb2xlIHNldWwuJzsKCm5vdGlmeSBwZ3JzdCwgJ3JlbG9hZCBzY2hlbWEn
OwoKY29tbWl0Owo=
';
  c_source   text;
  v_lines    integer;
begin
  -- 1. Décodage du texte (base64, ASCII pur), puis contrôle de son empreinte.
  begin
    c_source := convert_from(decode(c_payload, 'base64'), 'UTF8');
  exception when others then
    raise exception 'STOP [20261122090000] : texte de la migration illisible (copier-coller incomplet ou altéré). Rien n''a été modifié.';
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
  if not (to_regprocedure('public.read_public_contributions_overview_v1(text)') is not null) then
    raise exception 'STOP [20261122090000] : prérequis absent (fonction E3 public.read_public_contributions_overview_v1(text)). Rien n''a été modifié.';
  end if;
  if to_regprocedure('public.read_public_contributions_v2(text,integer,timestamp with time zone,uuid,text[])') is not null then
    raise exception 'STOP [20261122090000] : fonction public.read_public_contributions_v2(text,integer,timestamptz,uuid,text[]) existe déjà alors que la version n''est pas enregistrée. Rien n''a été modifié ; prévenir le QG.';
  end if;
  if to_regprocedure('public.read_public_contributions_by_ids_v1(text,uuid[])') is not null then
    raise exception 'STOP [20261122090000] : fonction public.read_public_contributions_by_ids_v1(text,uuid[]) existe déjà alors que la version n''est pas enregistrée. Rien n''a été modifié ; prévenir le QG.';
  end if;

  -- 4. Application : le fichier lui-même, sans ses lignes begin; / commit;
  --    (la transaction est celle de ce DO : tout ou rien).
  execute regexp_replace(c_source, '^(begin|commit);[ \t]*$', '', 'gn');

  -- 5. Inscription dans l'historique, dans la même transaction.
  insert into supabase_migrations.schema_migrations (version, name, statements)
  values (c_version, c_name, array[c_source]);
end
$heritage_install$;

select '20261122090000' as version,
       'm8_e4_public_contributions_reads' as migration,
       (select count(*) from supabase_migrations.schema_migrations) as versions_enregistrees,
       case when exists (select 1 from supabase_migrations.schema_migrations h
                          where h.version = '20261122090000'
                            and encode(sha256(convert_to(h.statements[1], 'UTF8')), 'hex') = '5c143aafc8d5d747f9cac0ef2add9280b569525f9309145e268c5ec7573717e0')
             and (select count(*) from supabase_migrations.schema_migrations) = 49
            then 'OK — étape 5/5 installée et enregistrée'
            else 'ECHEC — prévenir le QG' end as verdict;
