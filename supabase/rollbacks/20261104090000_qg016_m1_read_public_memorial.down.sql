-- HERITAGE HOMMAGE — QG 016 / M1 : RETOUR ARRIÈRE de
-- supabase/migrations/20261104090000_qg016_m1_read_public_memorial.sql.
--
-- NE FAIT PAS PARTIE DES MIGRATIONS : jamais appliqué automatiquement,
-- seulement sur décision explicite du QG.
--
-- Supprime la seule fonction ajoutée par M1. Aucune donnée, aucune table,
-- aucune politique ni aucun privilège de table n'est touché (M1 n'en a
-- modifié aucun). Après ce retour arrière, plus aucune page publique ne
-- peut lire un hommage publié.

begin;

drop function public.read_public_memorial_v1(text);

notify pgrst, 'reload schema';

commit;
