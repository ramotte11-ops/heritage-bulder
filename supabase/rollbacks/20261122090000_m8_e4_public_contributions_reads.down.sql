-- HERITAGE HOMMAGE — M8-E4 : RETOUR ARRIÈRE de
-- supabase/migrations/20261122090000_m8_e4_public_contributions_reads.sql.
--
-- NE FAIT PAS PARTIE DES MIGRATIONS : jamais appliqué automatiquement,
-- seulement sur décision explicite du QG. À appliquer AVANT ceux de E3, E2
-- et E1. Lecture seule : aucune donnée n'est touchée.

begin;

drop function if exists public.read_public_contributions_by_ids_v1(text, uuid[]);
drop function if exists public.read_public_contributions_v2(text, integer, timestamptz, uuid, text[]);

notify pgrst, 'reload schema';

commit;
