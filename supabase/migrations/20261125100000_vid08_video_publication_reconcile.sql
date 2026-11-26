-- HERITAGE HOMMAGE — VID-08 : rubrique vidéo publique et réconciliation
-- globale des vidéos hébergées (Mux).
--
-- Écrite et testée en local (npm run db:test) ; NON appliquée. Son
-- application sur le projet réel relève d'un GO distinct de la PO, APRÈS
-- celle de 20261125090000_vid07_memorial_videos.sql, dont elle dépend.
-- Retour arrière : supabase/rollbacks/20261125100000_vid08_video_publication_reconcile.down.sql.
--
-- Additive pour les données : deux groupes de colonnes NULLables ou à
-- valeur par défaut, une fonction de déclencheur, trois RPC service_role.
-- Une seule fonction existante est redéfinie, à signature identique :
-- read_public_memorial_videos_v1 (règle de publication ci-dessous).
--
-- 1. Publication : une vidéo techniquement prête n'est jamais publiée
--    d'elle-même. La page publique ne lit une vidéo que si SA VERSION était
--    déjà prête au moment de la dernière publication de l'hommage
--    (`ready_at <= memorial_published_snapshots.published_at`). Une vidéo
--    ajoutée, ou remplacée, après la publication reste privée jusqu'à la
--    publication suivante. (Un remplacement retire l'ancienne version dès
--    que la nouvelle est acceptée : jusqu'à la republication, la page
--    publique est alors sans cette vidéo. Décision PO D4.)
--
-- 2. Réconciliation globale (tâche planifiée préparée, NON activée) :
--    chaque exécution RÉSERVE un lot de lignes pour un temps limité
--    (`for update skip locked`) : deux exécutions simultanées ne traitent
--    jamais la même ligne. Une ligne en échec temporaire est remise à plus
--    tard, avec un délai croissant (pas d'appel inutile à Mux).

-- =====================================================================
-- 1. Heure à laquelle une version est devenue prête
-- =====================================================================

alter table public.memorial_videos
  add column ready_at timestamptz,
  add column reconcile_claimed_by uuid,
  add column reconcile_claimed_until timestamptz,
  add column reconcile_attempts integer not null default 0 check (reconcile_attempts >= 0),
  add column reconcile_next_at timestamptz;

comment on column public.memorial_videos.ready_at is
  'VID-08 — heure de passage à ready (déclencheur). Publique seulement si <= heure de la dernière publication.';
comment on column public.memorial_videos.reconcile_claimed_until is
  'VID-08 — réservation par une exécution de la réconciliation globale (anti-concurrence).';
comment on column public.memorial_videos.reconcile_next_at is
  'VID-08 — prochaine tentative après une erreur temporaire (délai croissant).';

-- Lignes déjà prêtes (aucune sur le projet réel tant que VID-07 n'est pas
-- en service) : leur dernière mise à jour fait foi.
update public.memorial_videos set ready_at = updated_at where status = 'ready' and ready_at is null;

create or replace function public.memorial_videos_stamp_ready_v1()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'ready' and (tg_op = 'INSERT' or old.status is distinct from 'ready') then
    new.ready_at := now();
  elsif new.status <> 'ready' then
    new.ready_at := null;
  end if;
  return new;
end;
$$;

revoke all on function public.memorial_videos_stamp_ready_v1() from public, anon, authenticated, service_role;

create trigger memorial_videos_stamp_ready
  before insert or update of status on public.memorial_videos
  for each row execute function public.memorial_videos_stamp_ready_v1();

-- =====================================================================
-- 2. Lecture publique : la version publiée, et elle seule
-- =====================================================================

create or replace function public.read_public_memorial_videos_v1(p_slug text)
returns table (draft_video_id text, playback_id text, verified_duration_ms integer)
language sql
stable
security definer
set search_path = ''
as $$
  select v.draft_video_id, v.mux_playback_id, v.verified_duration_ms
    from public.memorials m
    join public.memorial_published_snapshots s on s.memorial_id = m.id
    join public.memorial_videos v on v.memorial_id = m.id and v.status = 'ready'
   where p_slug is not null
     and m.slug = p_slug
     and m.status = 'published'
     and m.access_level = 'complet'
     and public.memorial_publicly_visible_v1(m.id, now())
     and v.ready_at is not null
     and v.ready_at <= s.published_at
     and jsonb_typeof(s.content -> 'video' -> 'items') = 'array'
     and exists (select 1 from jsonb_array_elements(s.content -> 'video' -> 'items') item
                  where item ->> 'id' = v.draft_video_id);
$$;

revoke all on function public.read_public_memorial_videos_v1(text) from public, anon, authenticated, service_role;
grant execute on function public.read_public_memorial_videos_v1(text) to service_role;

-- =====================================================================
-- 3. Réconciliation globale : réservation, fin, assets connus
-- =====================================================================

-- Réserve au plus p_limit lignes à réconcilier, jamais réservées par une
-- autre exécution en cours, dont la prochaine tentative est due, et restées
-- sans nouvelle depuis p_stale_before. Mêmes cas que
-- list_memorial_videos_to_reconcile_v1 (VID-07). Les lignes réservées ne
-- sont plus proposées tant que la réservation court : appeler de nouveau
-- donne le lot suivant (pagination sûre, sans curseur).
create or replace function public.claim_memorial_videos_for_reconcile_v1(
  p_holder uuid,
  p_stale_before timestamptz,
  p_limit integer,
  p_claim_seconds integer default 600
)
returns table (video_id uuid, memorial_id uuid, status text, upload_id text, asset_id text, upload_expires_at timestamptz, attempts integer)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if p_holder is null or p_stale_before is null then
    return;
  end if;
  return query
    with candidates as (
      select v.id
        from public.memorial_videos v
       where (v.status in ('reserved', 'uploading', 'processing', 'deletion_requested')
              or (v.status in ('rejected', 'errored', 'cancelled') and v.mux_asset_id is not null and v.deleted_at is null))
         and v.updated_at < p_stale_before
         and (v.reconcile_claimed_until is null or v.reconcile_claimed_until < now())
         and (v.reconcile_next_at is null or v.reconcile_next_at <= now())
       order by v.updated_at, v.id
       limit least(greatest(coalesce(p_limit, 25), 1), 100)
       for update skip locked
    )
    update public.memorial_videos v
       set reconcile_claimed_by = p_holder,
           reconcile_claimed_until = now() + make_interval(secs => least(greatest(coalesce(p_claim_seconds, 600), 30), 3600))
      from candidates c
     where v.id = c.id
    returning v.id, v.memorial_id, v.status, v.mux_upload_id, v.mux_asset_id, v.upload_expires_at, v.reconcile_attempts;
end;
$$;

-- Fin du traitement d'une ligne par CETTE exécution. 'done' : rien de plus à
-- faire pour l'instant (compteur remis à zéro) ; 'retry' : erreur temporaire,
-- prochaine tentative après 2^n minutes (plafond 6 h). Une réservation
-- reprise entre-temps par une autre exécution n'est jamais modifiée.
create or replace function public.finish_memorial_video_reconcile_v1(p_holder uuid, p_video_id uuid, p_result text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempts integer;
begin
  if p_result not in ('done', 'retry') then
    return 'invalid';
  end if;
  update public.memorial_videos v
     set reconcile_claimed_by = null,
         reconcile_claimed_until = null,
         reconcile_attempts = case when p_result = 'retry' then v.reconcile_attempts + 1 else 0 end,
         reconcile_next_at = case when p_result = 'retry'
                                  then now() + least(make_interval(mins => power(2, least(v.reconcile_attempts, 9))::integer), interval '6 hours')
                                  else null end
   where v.id = p_video_id
     and v.reconcile_claimed_by = p_holder
  returning v.reconcile_attempts into v_attempts;
  if not found then
    return 'not_claimed';
  end if;
  return 'finished';
end;
$$;

-- Nettoyage des assets orphelins (option, jamais automatique) : parmi des
-- identifiants d'assets lus chez Mux, ceux que HERITAGE connaît encore.
create or replace function public.memorial_video_known_assets_v1(p_asset_ids text[])
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct v.mux_asset_id), array[]::text[])
    from public.memorial_videos v
   where v.mux_asset_id = any (coalesce(p_asset_ids, array[]::text[]));
$$;

revoke all on function public.claim_memorial_videos_for_reconcile_v1(uuid, timestamptz, integer, integer) from public, anon, authenticated, service_role;
revoke all on function public.finish_memorial_video_reconcile_v1(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.memorial_video_known_assets_v1(text[]) from public, anon, authenticated, service_role;

grant execute on function public.claim_memorial_videos_for_reconcile_v1(uuid, timestamptz, integer, integer) to service_role;
grant execute on function public.finish_memorial_video_reconcile_v1(uuid, uuid, text) to service_role;
grant execute on function public.memorial_video_known_assets_v1(text[]) to service_role;

notify pgrst, 'reload schema';
