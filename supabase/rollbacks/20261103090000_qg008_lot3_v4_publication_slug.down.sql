-- HERITAGE HOMMAGE — QG 008, Lot 3 v4 : RETOUR ARRIÈRE de
-- supabase/migrations/20261103090000_qg008_lot3_v4_publication_slug.sql.
--
-- NE FAIT PAS PARTIE DES MIGRATIONS : jamais appliqué automatiquement,
-- seulement sur décision explicite du QG.
--
-- Supprime les deux fonctions ajoutées par v4. Aucune donnée n'est touchée :
-- les slugs déjà écrits par v4 RESTENT (un slug public n'est jamais retiré
-- ni modifié) et les mémoriaux publiés restent publiés. v3 et v2, inchangées
-- par v4, restent en place. Après ce retour arrière, l'application (qui
-- appelle v4) ne peut plus publier depuis l'aperçu tant que la migration
-- n'est pas réappliquée.

begin;

drop function public.commit_memorial_publication_v4(uuid, uuid, bigint, text, text, text, text, text, jsonb, jsonb);
drop function public.memorial_public_slug_v1(uuid, integer);

notify pgrst, 'reload schema';

commit;
