-- HERITAGE HOMMAGE — QG 008, Lot 3 : RETOUR ARRIÈRE de
-- supabase/migrations/20261102090000_qg008_lot3_publication_from_preview.sql.
--
-- NE FAIT PAS PARTIE DES MIGRATIONS : jamais appliqué automatiquement,
-- seulement sur décision explicite du QG.
--
-- Supprime la seule fonction ajoutée par le Lot 3. Aucune donnée n'est
-- touchée : les mémoriaux déjà publiés par la v3 restent publiés (leur
-- copie et leur statut ont été écrits par commit_memorial_publication_v2,
-- qui reste en place). Après ce retour arrière, l'application ne peut plus
-- publier depuis l'aperçu tant que la migration n'est pas réappliquée.

begin;

drop function public.commit_memorial_publication_v3(uuid, uuid, bigint, text, text, text, text, text, jsonb, jsonb);

notify pgrst, 'reload schema';

commit;
