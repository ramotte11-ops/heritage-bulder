-- HERITAGE HOMMAGE — M8-E3 : RETOUR ARRIÈRE de
-- supabase/migrations/20261121090000_m8_e3_public_contributions_overview.sql.
--
-- NE FAIT PAS PARTIE DES MIGRATIONS : jamais appliqué automatiquement,
-- seulement sur décision explicite du QG. À appliquer AVANT ceux de M8-E2 et
-- M8-E1 (cette fonction dépend des fonctions E1). Lecture seule : aucune
-- donnée n'est touchée.

begin;

drop function if exists public.read_public_contributions_overview_v1(text);

notify pgrst, 'reload schema';

commit;
