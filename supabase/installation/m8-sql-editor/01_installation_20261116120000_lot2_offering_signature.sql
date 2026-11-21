-- =====================================================================
-- HERITAGE HOMMAGE — INSTALLATION 1/5 — 20261116120000_lot2_offering_signature
-- =====================================================================
-- Source : supabase/migrations/20261116120000_lot2_offering_signature.sql
-- SHA-256 du fichier : caf4fbac85dad8eb2fbbdb0a2a88a5909635d1283e9f6d45240b24b1cc54f6c2
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
  c_version  constant text := '20261116120000';
  c_name     constant text := 'lot2_offering_signature';
  c_previous constant text := '20261116100000';
  c_count    constant integer := 44;
  c_sha256   constant text := 'caf4fbac85dad8eb2fbbdb0a2a88a5909635d1283e9f6d45240b24b1cc54f6c2';
  c_txn      constant integer := 0;
  -- Texte exact de supabase/migrations/20261116120000_lot2_offering_signature.sql, encodé en base64.
  c_payload  constant text := '
LS0gSEVSSVRBR0UgSE9NTUFHRSDigJQgTG90IDIgKEVzcGFjZSBmYW1pbGxlKSA6IHNpZ25hdHVy
ZSBmYWN1bHRhdGl2ZSBkJ3VuZQotLSBvZmZyYW5kZSBzeW1ib2xpcXVlLCB2aXNpYmxlIGRlIGxh
IHNldWxlIGZhbWlsbGUuCi0tCi0tIETDqWNpc2lvbiBQTyAoMTYvMTEvMjAyNiwgVjIgdmFsaWTD
qWUpIDogYXByw6hzIGF2b2lyIGTDqXBvc8OpIHVuZSBmbGV1ciwgdW5lCi0tIGJvdWdpZSBvdSB1
biBjxZN1ciwgbGUgdmlzaXRldXIgUEVVVCBzaWduZXIgc29uIGdlc3RlIGQndW4gcHLDqW5vbSBv
dSBkJ3VuCi0tIHN1cm5vbSAoNDAgY2FyYWN0w6hyZXMgYXUgcGx1cykuIExlIGdlc3RlIHJlc3Rl
IGTDqXBvc8OpIHNhbnMgY29tcHRlIGV0IHNhbnMKLS0gc2lnbmF0dXJlIDsgbGEgc2lnbmF0dXJl
IG4nYXBwYXJhw650IGphbWFpcyBzdXIgbGEgcGFnZSBwdWJsaXF1ZSBldCBuJ2VzdAotLSBsdWUg
cXVlIHBhciBsYSBmYW1pbGxlIChDYXJuZXQgZGVzIGF0dGVudGlvbnMpLgotLQotLSBBZGRpdGl2
ZSA6IGF1Y3VuZSBtaWdyYXRpb24gZXhpc3RhbnRlIG4nZXN0IG1vZGlmacOpZSA7Ci0tIGByZWNv
cmRfc3ltYm9saWNfb2ZmZXJpbmdfdjFgIGVzdCBJTkNIQU5Hw4lFIOKAlCBsZXMgZMOpcMO0dHMg
YW5vbnltZXMKLS0gY29udGludWVudCBleGFjdGVtZW50IGNvbW1lIGF2YW50LCBldCBsYSBzaWdu
YXR1cmUgcydham91dGUgQVBSw4hTLCBzdXIgbGEKLS0gbGlnbmUgZMOpasOgIGNyw6nDqWUsIHNh
bnMgamFtYWlzIGVuIGNyw6llciB1bmUgYXV0cmUuCi0tCi0tIENlIHF1ZSBjZXR0ZSBtaWdyYXRp
b24gYWpvdXRlIDoKLS0gICBBLiBEZXV4IGNvbG9ubmVzIGZhY3VsdGF0aXZlcyBzdXIgYHN5bWJv
bGljX29mZmVyaW5nc2AgKGBzaWduYXR1cmVgLAotLSAgICAgIGBzaWduZWRfYXRgKSBldCBsZXVy
cyBjb250cmFpbnRlcyBkZSBmb3JtZSA6IDEgw6AgNDAgY2FyYWN0w6hyZXMsIHNhbnMKLS0gICAg
ICBlc3BhY2UgYXV4IGV4dHLDqW1pdMOpcywgc2FucyBjYXJhY3TDqHJlIGRlIGNvbnRyw7RsZSBu
aSBjYXJhY3TDqHJlCi0tICAgICAgaW52aXNpYmxlIGRlIG1pc2UgZW4gZm9ybWUgKGRpcmVjdGlv
biBkdSB0ZXh0ZSwgZXNwYWNlcyBkZSBsYXJnZXVyCi0tICAgICAgbnVsbGUpIDsgYHNpZ25lZF9h
dGAgcHLDqXNlbnQgc2kgZXQgc2V1bGVtZW50IHNpIGBzaWduYXR1cmVgIGwnZXN0LAotLSAgICAg
IGphbWFpcyBhbnTDqXJpZXVyIGF1IGdlc3RlLgotLSAgIEIuIERyb2l0cyBkZSBsZWN0dXJlIGRl
IGxhIGZhbWlsbGUgcGFzc8OpcyBBVSBOSVZFQVUgREVTIENPTE9OTkVTIDogbGEKLS0gICAgICBm
YW1pbGxlIGxpdCB0b3Vqb3VycyBzZXMgZ2VzdGVzIChtw6ptZSByw6hnbGUgUkxTCi0tICAgICAg
YHN5bWJvbGljX29mZmVyaW5nc19zZWxlY3Rfb3duYCksIHkgY29tcHJpcyBsYSBzaWduYXR1cmUs
IG1haXMgcGx1cwotLSAgICAgIGxhIGNsw6kgZCdpZGVtcG90ZW5jZSDigJQgcXVpIHNlcnQgZMOp
c29ybWFpcyBkZSBwcmV1dmUgcG91ciBzaWduZXIuCi0tICAgQy4gYHNpZ25fc3ltYm9saWNfb2Zm
ZXJpbmdfdjEoc2x1ZywgY2zDqSwgc2lnbmF0dXJlKWAgOiBsYSBzZXVsZSB2b2llCi0tICAgICAg
ZCfDqWNyaXR1cmUgZCd1bmUgc2lnbmF0dXJlLCBgc2VydmljZV9yb2xlYCBzZXVsZW1lbnQgKGxl
IHNlcnZldXIsCi0tICAgICAgamFtYWlzIGxlIG5hdmlnYXRldXIpLiBVbmUgaW5zdHJ1Y3Rpb24g
VVBEQVRFIHVuaXF1ZSwgZG9uYyBhdG9taXF1ZSA6Ci0tICAgICAgZWxsZSBuZSBzaWduZSBxdSd1
biBnZXN0ZSBlbmNvcmUgbm9uIHNpZ27DqSwgZGUgbW9pbnMgZGUgMzAgbWludXRlcywKLS0gICAg
ICBkw6lzaWduw6kgcGFyIGxlIHNsdWcgcHVibGljIEVUIHNhIGNsw6kgZCdpZGVtcG90ZW5jZSAo
VVVJRCBhbMOpYXRvaXJlCi0tICAgICAgdGlyw6kgcGFyIGxlIG5hdmlnYXRldXIgZHUgdmlzaXRl
dXIpLiBJc3N1ZXMgOgotLSAgICAgICAgJ3NpZ25lZCcgICAgICAgICAgbGEgc2lnbmF0dXJlIGVz
dCByYXR0YWNow6llIDsKLS0gICAgICAgICdhbHJlYWR5X3NpZ25lZCcgIGxhIG3Dqm1lIHNpZ25h
dHVyZSBsJ8OpdGFpdCBkw6lqw6AgKG5vdXZlbCBlbnZvaSkgOwotLSAgICAgICAgJ3JlZnVzZWQn
ICAgICAgICAgc2x1ZyBpbmNvbm51LCBnZXN0ZSBpbnRyb3V2YWJsZSwgZMOpasOgIHNpZ27DqQot
LSAgICAgICAgICAgICAgICAgICAgICAgICAgYXV0cmVtZW50LCBvdSBkw6lsYWkgZMOpcGFzc8Op
LgotLSAgICAgIFVuZSBkZW1hbmRlIG1hbCBmb3Jtw6llIChzaWduYXR1cmUgaG9ycyBmb3JtZSkg
TMOIVkUgdW5lIGVycmV1ciA6IGxlCi0tICAgICAgc2VydmV1ciBub3JtYWxpc2UgYXZhbnQgZCdh
cHBlbGVyLCBjJ2VzdCB1bmUgZXJyZXVyIGRlIGPDomJsYWdlLgotLQotLSBBdWN1bmUgZG9ubsOp
ZSBleGlzdGFudGUgbidlc3QgbW9kaWZpw6llIG5pIHN1cHByaW3DqWUuIEF1Y3VuIGRyb2l0Ci0t
IGQnw6ljcml0dXJlIG4nZXN0IGFjY29yZMOpIMOgIHVuIHLDtGxlIGNsaWVudC4gTGEgZm9uY3Rp
b24gbmUgam91cm5hbGlzZSByaWVuLgotLQotLSBSZXRvdXIgYXJyacOocmUgOiBzdXBhYmFzZS9y
b2xsYmFja3MvMjAyNjExMTYxMjAwMDBfbG90Ml9vZmZlcmluZ19zaWduYXR1cmUuZG93bi5zcWwK
LS0gQ29udHLDtGxlcyA6IHN1cGFiYXNlL3ZlcmlmaWNhdGlvbnMvbG90Ml9zaWduYXR1cmVfcHJl
ZmxpZ2h0LnNxbCAoYXZhbnQpCi0tICAgICAgICAgICAgIHN1cGFiYXNlL3ZlcmlmaWNhdGlvbnMv
bG90Ml9zaWduYXR1cmVfcG9zdGZsaWdodC5zcWwgKGFwcsOocykKCi0tIC0tLS0tLS0tLS0tLS0t
LS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLQot
LSBBLiBDb2xvbm5lcyBldCBjb250cmFpbnRlcwotLSAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0t
LS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0KYWx0ZXIgdGFibGUg
cHVibGljLnN5bWJvbGljX29mZmVyaW5ncwogIGFkZCBjb2x1bW4gaWYgbm90IGV4aXN0cyBzaWdu
YXR1cmUgdGV4dCwKICBhZGQgY29sdW1uIGlmIG5vdCBleGlzdHMgc2lnbmVkX2F0IHRpbWVzdGFt
cHR6OwoKYWx0ZXIgdGFibGUgcHVibGljLnN5bWJvbGljX29mZmVyaW5ncwogIGRyb3AgY29uc3Ry
YWludCBpZiBleGlzdHMgc3ltYm9saWNfb2ZmZXJpbmdzX3NpZ25hdHVyZV9zaGFwZSwKICBkcm9w
IGNvbnN0cmFpbnQgaWYgZXhpc3RzIHN5bWJvbGljX29mZmVyaW5nc19zaWduYXR1cmVfc2lnbmVk
X2F0LAogIGRyb3AgY29uc3RyYWludCBpZiBleGlzdHMgc3ltYm9saWNfb2ZmZXJpbmdzX3NpZ25l
ZF9hZnRlcl9jcmVhdGVkOwoKYWx0ZXIgdGFibGUgcHVibGljLnN5bWJvbGljX29mZmVyaW5ncwog
IGFkZCBjb25zdHJhaW50IHN5bWJvbGljX29mZmVyaW5nc19zaWduYXR1cmVfc2hhcGUgY2hlY2sg
KAogICAgc2lnbmF0dXJlIGlzIG51bGwKICAgIG9yICgKICAgICAgY2hhcl9sZW5ndGgoc2lnbmF0
dXJlKSBiZXR3ZWVuIDEgYW5kIDQwCiAgICAgIGFuZCBzaWduYXR1cmUgPSBidHJpbShzaWduYXR1
cmUpCiAgICAgIGFuZCBzaWduYXR1cmUgIX4gJ1tbOmNudHJsOl1dJwogICAgICBhbmQgc2lnbmF0
dXJlICF+ICdbXHUyMDBCXHUyMDBFXHUyMDBGXHUyMDJBLVx1MjAyRVx1MjA2MFx1MjA2Ni1cdTIw
NjlcdUZFRkZdJwogICAgKQogICksCiAgYWRkIGNvbnN0cmFpbnQgc3ltYm9saWNfb2ZmZXJpbmdz
X3NpZ25hdHVyZV9zaWduZWRfYXQgY2hlY2sgKChzaWduYXR1cmUgaXMgbnVsbCkgPSAoc2lnbmVk
X2F0IGlzIG51bGwpKSwKICBhZGQgY29uc3RyYWludCBzeW1ib2xpY19vZmZlcmluZ3Nfc2lnbmVk
X2FmdGVyX2NyZWF0ZWQgY2hlY2sgKHNpZ25lZF9hdCBpcyBudWxsIG9yIHNpZ25lZF9hdCA+PSBj
cmVhdGVkX2F0KTsKCmNvbW1lbnQgb24gY29sdW1uIHB1YmxpYy5zeW1ib2xpY19vZmZlcmluZ3Mu
c2lnbmF0dXJlIGlzCiAgJ0xvdCAyLiBTaWduYXR1cmUgZmFjdWx0YXRpdmUgZHUgdmlzaXRldXIg
KHByw6lub20gb3Ugc3Vybm9tLCAxIMOgIDQwIGNhcmFjdMOocmVzKSwgYWpvdXTDqWUgYXByw6hz
IGxlIGdlc3RlIHBhciBzaWduX3N5bWJvbGljX29mZmVyaW5nX3YxKCkgc2V1bGVtZW50LiBMdWUg
cGFyIGxhIHNldWxlIGZhbWlsbGUgKFJMUyBzeW1ib2xpY19vZmZlcmluZ3Nfc2VsZWN0X293bikg
OyBqYW1haXMgcHVibGlxdWUuJzsKY29tbWVudCBvbiBjb2x1bW4gcHVibGljLnN5bWJvbGljX29m
ZmVyaW5ncy5zaWduZWRfYXQgaXMKICAnTG90IDIuIE1vbWVudCBvw7kgbGEgc2lnbmF0dXJlIGEg
w6l0w6kgcmF0dGFjaMOpZSAoTlVMTCBzYW5zIHNpZ25hdHVyZSkuJzsKY29tbWVudCBvbiB0YWJs
ZSBwdWJsaWMuc3ltYm9saWNfb2ZmZXJpbmdzIGlzCiAgJ09mZnJhbmRlcyBzeW1ib2xpcXVlcyBW
MS4gVW4gZ2VzdGUgKGJvdWdpZSwgbHlzLCBjb2V1cikgbGFpc3PDqSBzdXIgdW4gbcOpbW9yaWFs
IHB1Ymxpw6ksIHNhbnMgY29tcHRlLiBBdWN1bmUgZG9ubsOpZSBkZSB2aXNpdGV1ciwgc2F1ZiBs
YSBzaWduYXR1cmUgZmFjdWx0YXRpdmUgZHUgTG90IDIgKHByw6lub20gb3Ugc3Vybm9tKSwgbHVl
IHBhciBsYSBzZXVsZSBmYW1pbGxlLiDDiWNyaXQgcGFyIHJlY29yZF9zeW1ib2xpY19vZmZlcmlu
Z192MSgpIGV0IHNpZ27DqSBwYXIgc2lnbl9zeW1ib2xpY19vZmZlcmluZ192MSgpIChzZXJ2aWNl
X3JvbGUpIDsgamFtYWlzIHN1cHByaW3DqSDDoCBsJydleHBpcmF0aW9uIGR1IGRyb2l0IGRlIGTD
qXDDtHQuJzsKCi0tIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0t
LS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLQotLSBCLiBMZWN0dXJlIGRlIGxhIGZhbWlsbGUgYXUg
bml2ZWF1IGRlcyBjb2xvbm5lcyAoY2zDqSBub24gZXhwb3PDqWUpCi0tIC0tLS0tLS0tLS0tLS0t
LS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLQpy
ZXZva2Ugc2VsZWN0IG9uIHRhYmxlIHB1YmxpYy5zeW1ib2xpY19vZmZlcmluZ3MgZnJvbSBhdXRo
ZW50aWNhdGVkOwpncmFudCBzZWxlY3QgKGlkLCBtZW1vcmlhbF9pZCwga2luZCwgY3JlYXRlZF9h
dCwgcmVhZF9hdCwgc2lnbmF0dXJlLCBzaWduZWRfYXQpCiAgb24gdGFibGUgcHVibGljLnN5bWJv
bGljX29mZmVyaW5ncyB0byBhdXRoZW50aWNhdGVkOwoKLS0gLS0tLS0tLS0tLS0tLS0tLS0tLS0t
LS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tCi0tIEMuIExh
IHNldWxlIMOpY3JpdHVyZSBkJ3VuZSBzaWduYXR1cmUKLS0gLS0tLS0tLS0tLS0tLS0tLS0tLS0t
LS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tCmNyZWF0ZSBv
ciByZXBsYWNlIGZ1bmN0aW9uIHB1YmxpYy5zaWduX3N5bWJvbGljX29mZmVyaW5nX3YxKAogIHBf
c2x1ZyB0ZXh0LAogIHBfaWRlbXBvdGVuY3lfa2V5IHV1aWQsCiAgcF9zaWduYXR1cmUgdGV4dAop
CnJldHVybnMgdGFibGUgKG91dGNvbWUgdGV4dCkKbGFuZ3VhZ2UgcGxwZ3NxbApzZWN1cml0eSBk
ZWZpbmVyCnNldCBzZWFyY2hfcGF0aCA9ICcnCmFzICQkCmRlY2xhcmUKICB2X25vdyB0aW1lc3Rh
bXB0eiA6PSBjbG9ja190aW1lc3RhbXAoKTsKICB2X21lbW9yaWFsX2lkIHV1aWQ7CiAgdl9leGlz
dGluZyB0ZXh0OwpiZWdpbgogIGlmIG51bGxpZihidHJpbShwX3NsdWcpLCAnJykgaXMgbnVsbAog
ICAgIG9yIHBfaWRlbXBvdGVuY3lfa2V5IGlzIG51bGwKICAgICBvciBwX3NpZ25hdHVyZSBpcyBu
dWxsCiAgICAgb3IgY2hhcl9sZW5ndGgocF9zaWduYXR1cmUpIG5vdCBiZXR3ZWVuIDEgYW5kIDQw
CiAgICAgb3IgcF9zaWduYXR1cmUgPD4gYnRyaW0ocF9zaWduYXR1cmUpCiAgICAgb3IgcF9zaWdu
YXR1cmUgfiAnW1s6Y250cmw6XV0nCiAgICAgb3IgcF9zaWduYXR1cmUgfiAnW1x1MjAwQlx1MjAw
RVx1MjAwRlx1MjAyQS1cdTIwMkVcdTIwNjBcdTIwNjYtXHUyMDY5XHVGRUZGXScgdGhlbgogICAg
cmFpc2UgZXhjZXB0aW9uICdpbnZhbGlkIHN5bWJvbGljIG9mZmVyaW5nIHNpZ25hdHVyZSByZXF1
ZXN0JyB1c2luZyBlcnJjb2RlID0gJzIyMDIzJzsKICBlbmQgaWY7CgogIHNlbGVjdCBtLmlkIGlu
dG8gdl9tZW1vcmlhbF9pZAogICAgZnJvbSBwdWJsaWMubWVtb3JpYWxzIGFzIG0KICAgd2hlcmUg
bS5zbHVnID0gcF9zbHVnOwoKICBpZiB2X21lbW9yaWFsX2lkIGlzIG51bGwgdGhlbgogICAgcmV0
dXJuIHF1ZXJ5IHNlbGVjdCAncmVmdXNlZCc6OnRleHQ7CiAgICByZXR1cm47CiAgZW5kIGlmOwoK
ICAtLSBVbmUgc2V1bGUgaW5zdHJ1Y3Rpb24gOiBsYSBsaWduZSBlc3QgdmVycm91aWxsw6llIHBh
ciBsJ1VQREFURSA7IGRldXgKICAtLSBlbnZvaXMgY29uY3VycmVudHMgbmUgcGV1dmVudCBwYXMg
c2lnbmVyIGRldXggZm9pcyBsZSBtw6ptZSBnZXN0ZS4KICB1cGRhdGUgcHVibGljLnN5bWJvbGlj
X29mZmVyaW5ncyBhcyBvCiAgICAgc2V0IHNpZ25hdHVyZSA9IHBfc2lnbmF0dXJlLAogICAgICAg
ICBzaWduZWRfYXQgPSB2X25vdwogICB3aGVyZSBvLm1lbW9yaWFsX2lkID0gdl9tZW1vcmlhbF9p
ZAogICAgIGFuZCBvLmlkZW1wb3RlbmN5X2tleSA9IHBfaWRlbXBvdGVuY3lfa2V5CiAgICAgYW5k
IG8uc2lnbmF0dXJlIGlzIG51bGwKICAgICBhbmQgby5jcmVhdGVkX2F0ID4gdl9ub3cgLSBpbnRl
cnZhbCAnMzAgbWludXRlcyc7CgogIGlmIGZvdW5kIHRoZW4KICAgIHJldHVybiBxdWVyeSBzZWxl
Y3QgJ3NpZ25lZCc6OnRleHQ7CiAgICByZXR1cm47CiAgZW5kIGlmOwoKICBzZWxlY3Qgby5zaWdu
YXR1cmUgaW50byB2X2V4aXN0aW5nCiAgICBmcm9tIHB1YmxpYy5zeW1ib2xpY19vZmZlcmluZ3Mg
YXMgbwogICB3aGVyZSBvLm1lbW9yaWFsX2lkID0gdl9tZW1vcmlhbF9pZAogICAgIGFuZCBvLmlk
ZW1wb3RlbmN5X2tleSA9IHBfaWRlbXBvdGVuY3lfa2V5OwoKICBpZiB2X2V4aXN0aW5nIGlzIG5v
dCBudWxsIGFuZCB2X2V4aXN0aW5nID0gcF9zaWduYXR1cmUgdGhlbgogICAgcmV0dXJuIHF1ZXJ5
IHNlbGVjdCAnYWxyZWFkeV9zaWduZWQnOjp0ZXh0OwogICAgcmV0dXJuOwogIGVuZCBpZjsKCiAg
cmV0dXJuIHF1ZXJ5IHNlbGVjdCAncmVmdXNlZCc6OnRleHQ7CmVuZDsKJCQ7Cgpjb21tZW50IG9u
IGZ1bmN0aW9uIHB1YmxpYy5zaWduX3N5bWJvbGljX29mZmVyaW5nX3YxKHRleHQsIHV1aWQsIHRl
eHQpIGlzCiAgJ0xvdCAyLiBSYXR0YWNoZSB1bmUgc2lnbmF0dXJlIGZhY3VsdGF0aXZlICgxIMOg
IDQwIGNhcmFjdMOocmVzKSDDoCB1biBnZXN0ZSBEw4lKw4AgZW5yZWdpc3Ryw6ksIGTDqXNpZ27D
qSBwYXIgbGUgc2x1ZyBwdWJsaWMgZXQgc2EgY2zDqSBkJydpZGVtcG90ZW5jZSwgdW5lIHNldWxl
IGZvaXMgZXQgZGFucyBsZXMgMzAgbWludXRlcy4gUmV0b3VybmUgc2lnbmVkIHwgYWxyZWFkeV9z
aWduZWQgfCByZWZ1c2VkIDsgbMOodmUgMjIwMjMgc3VyIHVuZSBkZW1hbmRlIG1hbCBmb3Jtw6ll
LiBTZXJ2aWNlLXJvbGUgc2V1bGVtZW50IDsgbmUgY3LDqWUgamFtYWlzIGRlIGdlc3RlLic7Cgpy
ZXZva2UgYWxsIG9uIGZ1bmN0aW9uIHB1YmxpYy5zaWduX3N5bWJvbGljX29mZmVyaW5nX3YxKHRl
eHQsIHV1aWQsIHRleHQpIGZyb20gcHVibGljLCBhbm9uLCBhdXRoZW50aWNhdGVkLCBzZXJ2aWNl
X3JvbGU7CmdyYW50IGV4ZWN1dGUgb24gZnVuY3Rpb24gcHVibGljLnNpZ25fc3ltYm9saWNfb2Zm
ZXJpbmdfdjEodGV4dCwgdXVpZCwgdGV4dCkgdG8gc2VydmljZV9yb2xlOwo=
';
  c_source   text;
  v_lines    integer;
begin
  -- 1. Décodage du texte (base64, ASCII pur), puis contrôle de son empreinte.
  begin
    c_source := convert_from(decode(c_payload, 'base64'), 'UTF8');
  exception when others then
    raise exception 'STOP [20261116120000] : texte de la migration illisible (copier-coller incomplet ou altéré). Rien n''a été modifié.';
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
  if not (to_regprocedure('public.record_symbolic_offering_v1(text,text,uuid)') is not null) then
    raise exception 'STOP [20261116120000] : prérequis absent (fonction public.record_symbolic_offering_v1(text,text,uuid)). Rien n''a été modifié.';
  end if;
  if not (to_regprocedure('public.owner_free_publication_status_v1(uuid)') is not null) then
    raise exception 'STOP [20261116120000] : prérequis absent (fonction QG 017 public.owner_free_publication_status_v1(uuid)). Rien n''a été modifié.';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'symbolic_offerings' and column_name = 'signature') then
    raise exception 'STOP [20261116120000] : colonne public.symbolic_offerings.signature existe déjà alors que la version n''est pas enregistrée. Rien n''a été modifié ; prévenir le QG.';
  end if;
  if to_regprocedure('public.sign_symbolic_offering_v1(text,uuid,text)') is not null then
    raise exception 'STOP [20261116120000] : fonction public.sign_symbolic_offering_v1(text,uuid,text) existe déjà alors que la version n''est pas enregistrée. Rien n''a été modifié ; prévenir le QG.';
  end if;

  -- 4. Application : le fichier lui-même, sans ses lignes begin; / commit;
  --    (la transaction est celle de ce DO : tout ou rien).
  execute regexp_replace(c_source, '^(begin|commit);[ \t]*$', '', 'gn');

  -- 5. Inscription dans l'historique, dans la même transaction.
  insert into supabase_migrations.schema_migrations (version, name, statements)
  values (c_version, c_name, array[c_source]);
end
$heritage_install$;

select '20261116120000' as version,
       'lot2_offering_signature' as migration,
       (select count(*) from supabase_migrations.schema_migrations) as versions_enregistrees,
       case when exists (select 1 from supabase_migrations.schema_migrations h
                          where h.version = '20261116120000'
                            and encode(sha256(convert_to(h.statements[1], 'UTF8')), 'hex') = 'caf4fbac85dad8eb2fbbdb0a2a88a5909635d1283e9f6d45240b24b1cc54f6c2')
             and (select count(*) from supabase_migrations.schema_migrations) = 45
            then 'OK — étape 1/5 installée et enregistrée'
            else 'ECHEC — prévenir le QG' end as verdict;
