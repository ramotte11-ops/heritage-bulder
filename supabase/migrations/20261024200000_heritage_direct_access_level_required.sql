-- HERITAGE Direct — M1-A, correctif 2 : le niveau d'un droit devient
-- obligatoire dès M1-A (bascule Etsy sans droit bloqué).
--
-- 20261024180000_heritage_direct_access_foundation.sql laissait
-- entitlements.access_level NULLABLE jusqu'à M1-B. Or un droit sans
-- niveau ne peut créer aucun mémorial (HD500) : un droit Etsy écrit sans
-- niveau pendant la bascule restait donc enregistré mais inutilisable,
-- jusqu'à une correction manuelle. Avec NOT NULL, une telle écriture est
-- refusée sur-le-champ, sans rien enregistrer, et un nouvel essai réussit
-- dès que le code à jour est en ligne.
--
-- Rien n'est attribué ici : la migration 20261024180000 a déjà donné
-- « complet » à tous les droits existants. Si un droit sans niveau existe
-- malgré tout (migrations appliquées en plusieurs transactions pendant
-- qu'un ancien code écrivait), la migration S'ARRÊTE sans rien changer et
-- le QG décide.
--
-- Application recommandée : 20261024180000, 20261024190000 et celle-ci
-- dans UNE seule transaction.

do $$
begin
  if exists (select 1 from public.entitlements where access_level is null) then
    raise exception 'entitlements without access level exist; nothing changed — apply the M1-A migrations in one transaction'
      using errcode = 'HD500';
  end if;
end;
$$;

alter table public.entitlements
  alter column access_level set not null;

comment on column public.entitlements.access_level is
  'HERITAGE Direct M1-A. Niveau accordé par ce droit : avis (gratuit, direct, sans clé ni commande) ou complet. Toujours fourni explicitement (D12) ; jamais de valeur par défaut ; obligatoire (NOT NULL).';

-- L'API Supabase recharge son cache de schéma sur DDL ; demandé aussi
-- explicitement, pris en compte à la validation de la transaction.
notify pgrst, 'reload schema';
