-- HERITAGE HOMMAGE — M8-E2 : RETOUR ARRIÈRE de
-- supabase/migrations/20261120090000_m8_e2_owner_contribution_settings.sql.
--
-- NE FAIT PAS PARTIE DES MIGRATIONS : jamais appliqué automatiquement,
-- seulement sur décision explicite du QG. À appliquer AVANT celui de M8-E1
-- (cette fonction dépend des fonctions E1).
-- Lecture seule : aucune donnée n'est touchée.

begin;

drop function if exists public.read_owner_contribution_settings_v1(uuid, uuid);

notify pgrst, 'reload schema';

commit;
