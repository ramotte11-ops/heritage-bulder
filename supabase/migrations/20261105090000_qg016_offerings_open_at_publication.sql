-- HERITAGE HOMMAGE — QG 016 : Offrandes symboliques V1, ouverture à la publication.
--
-- Décision QG (option A) : les Offrandes (bougie, lys, cœur) sont incluses
-- dans l'offre gratuite ET l'offre complète (V8 §6), actives par défaut,
-- désactivables par la famille. La doctrine V8 prévaut sur l'ancien socle
-- C1, qui laissait `symbolic_offering_eligibility` sans aucune voie
-- d'ouverture (« une future mission HERITAGE Direct »).
--
-- Additive : aucune migration existante n'est modifiée ;
-- `record_symbolic_offering_v1` (C1, réécrite par 20261031120000) est
-- INCHANGÉE. Elle refuse toujours, à chaque dépôt :
--   - un mémorial non publié, d'un autre habillage, ou plus publiquement
--     visible (`memorial_publicly_visible_v1` : fin des 45 jours d'un avis
--     gratuit, sans tâche planifiée) ;
--   - une rubrique désactivée par la famille dans la copie PUBLIÉE
--     (`presentation.hiddenSections`) ;
--   - toute ligne d'éligibilité absente, pas encore ouverte, ou fermée
--     (`closes_at` passé : suspension administrative) ;
--   - au-delà des plafonds par mémorial ; et elle garantit l'idempotence.
--
-- Ce que cette migration ajoute :
--   A. Un déclencheur AFTER INSERT sur `memorial_published_snapshots` : la
--      PREMIÈRE publication (insertion de l'instantané, dans la transaction
--      même de la fonction de publication) ouvre l'éligibilité du mémorial
--      (opens_at = maintenant, closes_at = NULL). `on conflict do nothing` :
--      une ligne existante n'est JAMAIS modifiée — une suspension
--      administrative n'est jamais rouverte. Une republication met à jour
--      l'instantané (UPDATE) et ne déclenche rien.
--   B. Rattrapage des mémoriaux DÉJÀ publiés et ÉLIGIBLES à cet instant :
--      publiés, habillage Intemporel, instantané présent, publiquement
--      visibles. Idempotent (`on conflict do nothing`).
--   C. Le commentaire de la table, qui décrivait l'ancienne doctrine.
--
-- Le refus par défaut est conservé : sans ligne d'éligibilité ouverte
-- (mémorial jamais publié, ou non rattrapé), tout geste est refusé.
-- Aucune donnée existante n'est modifiée ni supprimée ; aucun privilège de
-- table n'est ouvert ; la fonction du déclencheur n'est exécutable par
-- aucun rôle client.
--
-- Retour arrière : supabase/rollbacks/20261105090000_qg016_offerings_open_at_publication.down.sql
-- Contrôles : supabase/verifications/qg016_offrandes_preflight.sql (avant)
--             supabase/verifications/qg016_offrandes_postflight.sql (après)

-- ---------------------------------------------------------------------
-- A. Ouverture à la première publication
-- ---------------------------------------------------------------------
create or replace function public.open_symbolic_offerings_on_publication_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.symbolic_offering_eligibility (memorial_id, opens_at)
  values (new.memorial_id, now())
  on conflict (memorial_id) do nothing;
  return null;
end;
$$;

comment on function public.open_symbolic_offerings_on_publication_v1() is
  'QG 016. Déclencheur AFTER INSERT sur memorial_published_snapshots : la première publication ouvre les Offrandes du mémorial (symbolic_offering_eligibility, closes_at NULL). Ne modifie jamais une ligne existante (une suspension administrative n''est jamais rouverte). Toutes les autres conditions restent vérifiées à chaque dépôt par record_symbolic_offering_v1.';

revoke all on function public.open_symbolic_offerings_on_publication_v1() from public, anon, authenticated, service_role;

drop trigger if exists memorial_published_snapshots_open_offerings on public.memorial_published_snapshots;
create trigger memorial_published_snapshots_open_offerings
  after insert on public.memorial_published_snapshots
  for each row
  execute function public.open_symbolic_offerings_on_publication_v1();

-- ---------------------------------------------------------------------
-- B. Rattrapage des mémoriaux déjà publiés et éligibles
-- ---------------------------------------------------------------------
insert into public.symbolic_offering_eligibility (memorial_id, opens_at)
select m.id, now()
  from public.memorials as m
  join public.memorial_published_snapshots as s on s.memorial_id = m.id
 where m.status = 'published'
   and m.skin_id = 'intemporel'
   and public.memorial_publicly_visible_v1(m.id, now())
on conflict (memorial_id) do nothing;

-- ---------------------------------------------------------------------
-- C. Doctrine documentée sur la table
-- ---------------------------------------------------------------------
comment on table public.symbolic_offering_eligibility is
  'Offrandes symboliques V1. Verrou de dépôt par mémorial : un geste n''est accepté que tant qu''une ligne est ouverte (opens_at <= maintenant < closes_at, closes_at NULL = sans fin). QG 016 (V8 §6, offres avis ET complet) : ouverte automatiquement à la première publication (déclencheur memorial_published_snapshots_open_offerings) ; une ligne existante n''est jamais modifiée par l''application. Suspension administrative : fixer closes_at (revue SQL, mission QG). Aucun rôle client ni service_role ne peut l''écrire directement. La fin de visibilité publique (45 jours d''un avis) et le choix « désactiver » de la famille sont vérifiés à chaque dépôt par record_symbolic_offering_v1.';
