-- =====================================================================
-- HERITAGE HOMMAGE — DIAGNOSTIC DU COPIER-COLLER (LECTURE SEULE)
-- =====================================================================
-- Ne modifie RIEN : une seule requête SELECT, aucune donnée de famille.
-- Compare le texte de supabase/migrations/20261116120000_lot2_offering_signature.sql tel que le SQL Editor
-- le transmet (en clair) avec sa référence exacte (en base64).
-- Coller ce fichier EXACTEMENT comme le fichier 01 (même navigateur, même
-- méthode), puis « Run ». Envoyer au QG une capture du tableau complet.
--
-- Lecture : la colonne « verdict » nomme la cause. La dernière ligne
-- (transport base64) doit être OK : elle prouve que la procédure corrigée
-- fonctionne dans cet éditeur.
--
-- Cible UNIQUE : nudqzbdfnjzlnyffllgs (HERITAGE HOMMAGE - PRODUCTION).
-- INTERDIT : pbgzyyqdbdrhgnkzmxyn (projet historique « heritage hommage »).
-- AVANT de coller : l'adresse du navigateur doit contenir
--   supabase.com/dashboard/project/nudqzbdfnjzlnyffllgs/ . La référence prévaut sur le nom.
-- =====================================================================

with
recu as (select $heritage_source$-- HERITAGE HOMMAGE — Lot 2 (Espace famille) : signature facultative d'une
-- offrande symbolique, visible de la seule famille.
--
-- Décision PO (16/11/2026, V2 validée) : après avoir déposé une fleur, une
-- bougie ou un cœur, le visiteur PEUT signer son geste d'un prénom ou d'un
-- surnom (40 caractères au plus). Le geste reste déposé sans compte et sans
-- signature ; la signature n'apparaît jamais sur la page publique et n'est
-- lue que par la famille (Carnet des attentions).
--
-- Additive : aucune migration existante n'est modifiée ;
-- `record_symbolic_offering_v1` est INCHANGÉE — les dépôts anonymes
-- continuent exactement comme avant, et la signature s'ajoute APRÈS, sur la
-- ligne déjà créée, sans jamais en créer une autre.
--
-- Ce que cette migration ajoute :
--   A. Deux colonnes facultatives sur `symbolic_offerings` (`signature`,
--      `signed_at`) et leurs contraintes de forme : 1 à 40 caractères, sans
--      espace aux extrémités, sans caractère de contrôle ni caractère
--      invisible de mise en forme (direction du texte, espaces de largeur
--      nulle) ; `signed_at` présent si et seulement si `signature` l'est,
--      jamais antérieur au geste.
--   B. Droits de lecture de la famille passés AU NIVEAU DES COLONNES : la
--      famille lit toujours ses gestes (même règle RLS
--      `symbolic_offerings_select_own`), y compris la signature, mais plus
--      la clé d'idempotence — qui sert désormais de preuve pour signer.
--   C. `sign_symbolic_offering_v1(slug, clé, signature)` : la seule voie
--      d'écriture d'une signature, `service_role` seulement (le serveur,
--      jamais le navigateur). Une instruction UPDATE unique, donc atomique :
--      elle ne signe qu'un geste encore non signé, de moins de 30 minutes,
--      désigné par le slug public ET sa clé d'idempotence (UUID aléatoire
--      tiré par le navigateur du visiteur). Issues :
--        'signed'          la signature est rattachée ;
--        'already_signed'  la même signature l'était déjà (nouvel envoi) ;
--        'refused'         slug inconnu, geste introuvable, déjà signé
--                          autrement, ou délai dépassé.
--      Une demande mal formée (signature hors forme) LÈVE une erreur : le
--      serveur normalise avant d'appeler, c'est une erreur de câblage.
--
-- Aucune donnée existante n'est modifiée ni supprimée. Aucun droit
-- d'écriture n'est accordé à un rôle client. La fonction ne journalise rien.
--
-- Retour arrière : supabase/rollbacks/20261116120000_lot2_offering_signature.down.sql
-- Contrôles : supabase/verifications/lot2_signature_preflight.sql (avant)
--             supabase/verifications/lot2_signature_postflight.sql (après)

-- ---------------------------------------------------------------------
-- A. Colonnes et contraintes
-- ---------------------------------------------------------------------
alter table public.symbolic_offerings
  add column if not exists signature text,
  add column if not exists signed_at timestamptz;

alter table public.symbolic_offerings
  drop constraint if exists symbolic_offerings_signature_shape,
  drop constraint if exists symbolic_offerings_signature_signed_at,
  drop constraint if exists symbolic_offerings_signed_after_created;

alter table public.symbolic_offerings
  add constraint symbolic_offerings_signature_shape check (
    signature is null
    or (
      char_length(signature) between 1 and 40
      and signature = btrim(signature)
      and signature !~ '[[:cntrl:]]'
      and signature !~ '[\u200B\u200E\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]'
    )
  ),
  add constraint symbolic_offerings_signature_signed_at check ((signature is null) = (signed_at is null)),
  add constraint symbolic_offerings_signed_after_created check (signed_at is null or signed_at >= created_at);

comment on column public.symbolic_offerings.signature is
  'Lot 2. Signature facultative du visiteur (prénom ou surnom, 1 à 40 caractères), ajoutée après le geste par sign_symbolic_offering_v1() seulement. Lue par la seule famille (RLS symbolic_offerings_select_own) ; jamais publique.';
comment on column public.symbolic_offerings.signed_at is
  'Lot 2. Moment où la signature a été rattachée (NULL sans signature).';
comment on table public.symbolic_offerings is
  'Offrandes symboliques V1. Un geste (bougie, lys, coeur) laissé sur un mémorial publié, sans compte. Aucune donnée de visiteur, sauf la signature facultative du Lot 2 (prénom ou surnom), lue par la seule famille. Écrit par record_symbolic_offering_v1() et signé par sign_symbolic_offering_v1() (service_role) ; jamais supprimé à l''expiration du droit de dépôt.';

-- ---------------------------------------------------------------------
-- B. Lecture de la famille au niveau des colonnes (clé non exposée)
-- ---------------------------------------------------------------------
revoke select on table public.symbolic_offerings from authenticated;
grant select (id, memorial_id, kind, created_at, read_at, signature, signed_at)
  on table public.symbolic_offerings to authenticated;

-- ---------------------------------------------------------------------
-- C. La seule écriture d'une signature
-- ---------------------------------------------------------------------
create or replace function public.sign_symbolic_offering_v1(
  p_slug text,
  p_idempotency_key uuid,
  p_signature text
)
returns table (outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_memorial_id uuid;
  v_existing text;
begin
  if nullif(btrim(p_slug), '') is null
     or p_idempotency_key is null
     or p_signature is null
     or char_length(p_signature) not between 1 and 40
     or p_signature <> btrim(p_signature)
     or p_signature ~ '[[:cntrl:]]'
     or p_signature ~ '[\u200B\u200E\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]' then
    raise exception 'invalid symbolic offering signature request' using errcode = '22023';
  end if;

  select m.id into v_memorial_id
    from public.memorials as m
   where m.slug = p_slug;

  if v_memorial_id is null then
    return query select 'refused'::text;
    return;
  end if;

  -- Une seule instruction : la ligne est verrouillée par l'UPDATE ; deux
  -- envois concurrents ne peuvent pas signer deux fois le même geste.
  update public.symbolic_offerings as o
     set signature = p_signature,
         signed_at = v_now
   where o.memorial_id = v_memorial_id
     and o.idempotency_key = p_idempotency_key
     and o.signature is null
     and o.created_at > v_now - interval '30 minutes';

  if found then
    return query select 'signed'::text;
    return;
  end if;

  select o.signature into v_existing
    from public.symbolic_offerings as o
   where o.memorial_id = v_memorial_id
     and o.idempotency_key = p_idempotency_key;

  if v_existing is not null and v_existing = p_signature then
    return query select 'already_signed'::text;
    return;
  end if;

  return query select 'refused'::text;
end;
$$;

comment on function public.sign_symbolic_offering_v1(text, uuid, text) is
  'Lot 2. Rattache une signature facultative (1 à 40 caractères) à un geste DÉJÀ enregistré, désigné par le slug public et sa clé d''idempotence, une seule fois et dans les 30 minutes. Retourne signed | already_signed | refused ; lève 22023 sur une demande mal formée. Service-role seulement ; ne crée jamais de geste.';

revoke all on function public.sign_symbolic_offering_v1(text, uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.sign_symbolic_offering_v1(text, uuid, text) to service_role;
$heritage_source$::text as t),
reference as (select convert_from(decode('
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
', 'base64'), 'UTF8') as t),
lr as (select x.n, x.l from recu, regexp_split_to_table(recu.t, E'\n') with ordinality as x(l, n)),
la as (select x.n, x.l from reference, regexp_split_to_table(reference.t, E'\n') with ordinality as x(l, n)),
diff as (
  select coalesce(a.n, r.n) as n, a.l as la, r.l as lr
    from la a full join lr r using (n)
   where a.l is distinct from r.l),
pos as (
  select d.n, d.la, d.lr,
         (select min(i) from generate_series(1, greatest(coalesce(length(d.la), 0), coalesce(length(d.lr), 0)) + 1) as i
           where substr(coalesce(d.la, ''), i, 1) is distinct from substr(coalesce(d.lr, ''), i, 1)) as p
    from diff d),
m as (
  select r.t as recu, f.t as ref,
         encode(sha256(convert_to(r.t, 'UTF8')), 'hex') as h_recu,
         encode(sha256(convert_to(replace(r.t, E'\r', ''), 'UTF8')), 'hex') as h_sans_cr,
         encode(sha256(convert_to(normalize(replace(r.t, E'\r', ''), NFC), 'UTF8')), 'hex') as h_nfc,
         encode(sha256(convert_to(f.t, 'UTF8')), 'hex') as h_ref
    from recu r, reference f)
select ordre, controle, attendu, recu, verdict from (
  select 1 as ordre, 'texte reçu : octets' as controle, '7739' as attendu,
         octet_length(convert_to(recu, 'UTF8'))::text as recu,
         case when octet_length(convert_to(recu, 'UTF8')) = 7739 then 'OK' else 'ECART' end as verdict from m
  union all
  select 2, 'texte reçu : lignes', '156', (select count(*)::text from lr),
         case when (select count(*) from lr) = 156 then 'OK' else 'ECART' end from m
  union all
  select 3, 'texte reçu : retours chariot (\r)', '0', (length(recu) - length(replace(recu, E'\r', '')))::text,
         case when position(E'\r' in recu) = 0 then 'OK' else 'ECART : fins de ligne Windows (CRLF)' end from m
  union all
  select 4, 'texte reçu : commentaires (double tiret)', '259',
         ((length(recu) - length(replace(recu, chr(45) || chr(45), ''))) / 2)::text,
         case when (length(recu) - length(replace(recu, chr(45) || chr(45), ''))) / 2 = 259 then 'OK'
              else 'ECART : commentaires retirés ou modifiés par l''éditeur' end from m
  union all
  select 5, 'texte reçu : forme Unicode NFC', 'oui', case when recu is nfc normalized then 'oui' else 'non' end,
         case when recu is nfc normalized then 'OK' else 'ECART : accents décomposés (Unicode NFD)' end from m
  union all
  select 6, 'empreinte du texte reçu', 'caf4fbac85dad8eb…', left(h_recu, 16) || '…',
         case when h_recu = 'caf4fbac85dad8eb2fbbdb0a2a88a5909635d1283e9f6d45240b24b1cc54f6c2' then 'OK : texte intact' else 'ECART' end from m
  union all
  select 7, 'empreinte après retrait des \r', 'caf4fbac85dad8eb…', left(h_sans_cr, 16) || '…',
         case when h_recu = 'caf4fbac85dad8eb2fbbdb0a2a88a5909635d1283e9f6d45240b24b1cc54f6c2' then 'sans objet'
              when h_sans_cr = 'caf4fbac85dad8eb2fbbdb0a2a88a5909635d1283e9f6d45240b24b1cc54f6c2' then 'CAUSE : fins de ligne CRLF, seule altération'
              else 'non' end from m
  union all
  select 8, 'empreinte après retrait des \r et NFC', 'caf4fbac85dad8eb…', left(h_nfc, 16) || '…',
         case when h_recu = 'caf4fbac85dad8eb2fbbdb0a2a88a5909635d1283e9f6d45240b24b1cc54f6c2' or h_sans_cr = 'caf4fbac85dad8eb2fbbdb0a2a88a5909635d1283e9f6d45240b24b1cc54f6c2' then 'sans objet'
              when h_nfc = 'caf4fbac85dad8eb2fbbdb0a2a88a5909635d1283e9f6d45240b24b1cc54f6c2' then 'CAUSE : normalisation Unicode (et/ou CRLF)'
              else 'non : autre altération (voir lignes 20 et suivantes)' end from m
  union all
  select 9, 'lignes différentes', '0', (select count(*)::text from diff),
         case when (select count(*) from diff) = 0 then 'OK' else 'ECART' end from m
  union all
  select * from (
    select 20 + row_number() over (order by p.n) as ordre,
           'ligne ' || p.n || ', caractère ' || p.p as controle,
           'longueur ' || coalesce(length(p.la), 0) || ', hex ' || coalesce(encode(convert_to(substr(p.la, p.p, 8), 'UTF8'), 'hex'), '-') as attendu,
           'longueur ' || coalesce(length(p.lr), 0) || ', hex ' || coalesce(encode(convert_to(substr(p.lr, p.p, 8), 'UTF8'), 'hex'), '-') as recu,
           'ECART' as verdict
      from pos p order by p.n limit 5) premiers
  union all
  select 99, 'transport base64 (procédure corrigée)', 'caf4fbac85dad8eb…', left(h_ref, 16) || '…',
         case when h_ref = 'caf4fbac85dad8eb2fbbdb0a2a88a5909635d1283e9f6d45240b24b1cc54f6c2' then 'OK : la procédure corrigée passera' else 'ECHEC : prévenir le QG' end from m
) t
order by ordre;
