-- HERITAGE HOMMAGE — QG 016 : RETOUR ARRIÈRE de
-- supabase/migrations/20261105090000_qg016_offerings_open_at_publication.sql.
--
-- NE FAIT PAS PARTIE DES MIGRATIONS : jamais appliqué automatiquement,
-- seulement sur décision explicite du QG.
--
-- Revient au socle C1 « fermé par défaut » :
--   - supprime le déclencheur et sa fonction ;
--   - supprime les ouvertures SANS fin (closes_at NULL), c'est-à-dire
--     celles créées par cette migration (le préflight a établi que la table
--     était vide avant l'application) ; une suspension administrative
--     (closes_at renseigné) est conservée ;
--   - rétablit le commentaire C1 de la table.
-- Aucun geste reçu (symbolic_offerings) ni aucun compteur n'est touché.

begin;

drop trigger if exists memorial_published_snapshots_open_offerings on public.memorial_published_snapshots;
drop function if exists public.open_symbolic_offerings_on_publication_v1();

delete from public.symbolic_offering_eligibility where closes_at is null;

comment on table public.symbolic_offering_eligibility is
  'Offrandes symboliques V1 (C1). Closed-by-default deposit lock: a memorial accepts gestures only while a row here is open (opens_at <= now < closes_at, closes_at NULL = open-ended). Empty at creation; no role may write it in C1 — establishing HERITAGE Direct eligibility belongs to a later mission.';

commit;
