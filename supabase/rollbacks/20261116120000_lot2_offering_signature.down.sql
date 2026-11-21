-- HERITAGE HOMMAGE — Lot 2 : RETOUR ARRIÈRE de
-- supabase/migrations/20261116120000_lot2_offering_signature.sql.
--
-- NE FAIT PAS PARTIE DES MIGRATIONS : jamais appliqué automatiquement,
-- seulement sur décision explicite du QG.
--
-- ATTENTION — PERTE DE DONNÉES : supprimer les colonnes efface DÉFINITIVEMENT
-- toutes les signatures reçues. Avant d'appliquer, décider s'il faut les
-- conserver hors base (export par le QG, sous sa responsabilité RGPD).
-- Les gestes eux-mêmes (bougie, lys, cœur, dates) sont tous conservés.
--
-- Ordre recommandé : retirer d'abord le code qui appelle
-- sign_symbolic_offering_v1 (l'application dégrade sans erreur : le geste
-- reste enregistré, seule la signature échoue), puis appliquer ce fichier.
--
-- Rétablit exactement l'état précédent : lecture de la famille au niveau de
-- la table (C1), aucune colonne de signature, aucune fonction de signature.

begin;

drop function if exists public.sign_symbolic_offering_v1(text, uuid, text);

alter table public.symbolic_offerings
  drop constraint if exists symbolic_offerings_signature_shape,
  drop constraint if exists symbolic_offerings_signature_signed_at,
  drop constraint if exists symbolic_offerings_signed_after_created;

alter table public.symbolic_offerings
  drop column if exists signature,
  drop column if exists signed_at;

revoke select on table public.symbolic_offerings from authenticated;
grant select on table public.symbolic_offerings to authenticated;

comment on table public.symbolic_offerings is
  'Offrandes symboliques V1 (C1). One anonymous gesture (bougie, lys, coeur) left on a published memorial. Carries no visitor data at all. Written only by record_symbolic_offering_v1() (service_role); readable only by the memorial''s owner. Never deleted on expiry of the deposit right.';

commit;
