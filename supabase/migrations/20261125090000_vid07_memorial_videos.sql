-- HERITAGE HOMMAGE — VID-07 : vidéos hébergées (Mux) de la rubrique
-- « Des instants pour se souvenir ».
--
-- Écrite et testée en local (npm run db:test) ; NON appliquée. Son
-- application sur le projet réel relève d'un GO distinct de la PO.
-- Retour arrière : supabase/rollbacks/20261125090000_vid07_memorial_videos.down.sql.
--
-- Additive : aucune table, colonne, politique ni fonction existante n'est
-- modifiée.
--
-- Modèle
--  * Une ligne = un fichier envoyé (ou en cours d'envoi) pour UNE vidéo du
--    brouillon, désignée par son identifiant local `draft_video_id`
--    (`v-…`, lib/memorial/video/video-content.ts). L'ordre et le titre
--    restent dans le brouillon (`content.video.items`), seule source de
--    vérité éditoriale ; cette table ne porte que l'hébergement.
--  * Un remplacement crée une NOUVELLE ligne pour le même `draft_video_id` ;
--    l'ancienne vidéo prête n'est retirée qu'au moment où la nouvelle est
--    acceptée (jamais de perte prématurée).
--  * Toutes les écritures passent par des RPC SECURITY DEFINER exécutables
--    par service_role seul, avec p_owner_id résolu côté serveur (modèle
--    M8-E1). Chaque RPC verrouille d'abord la ligne `memorials` : les
--    contrôles de capacité (3 vidéos, 600 s) sont sérialisés par hommage,
--    même si plusieurs demandes arrivent presque simultanément.
--
-- Règles (contrat VID-02 / VID-06, non négociables)
--  * Offre complète seulement (`memorials.access_level = 'complet'`, lu
--    sous verrou) ; jamais sur un hommage archivé.
--  * 3 vidéos au plus (créneaux `draft_video_id` vivants), 600 000 ms au
--    plus au total, aucun plafond individuel.
--  * Une durée inconnue n'est JAMAIS comptée comme nulle : une réservation
--    sans durée déclarée n'est admise que s'il reste du temps et qu'aucune
--    autre durée inconnue n'est déjà en attente ; l'acceptation finale se
--    fait sur la durée mesurée par Mux.
--  * L'acceptation finale (webhook « asset ready ») recompte les seules
--    vidéos PRÊTES : la vidéo qui ferait dépasser 3 ou 600 s est rejetée,
--    et son asset est désigné pour suppression.
--  * Publication : téléversement, disponibilité technique et publication
--    sont distincts. La lecture publique exige un hommage publié en offre
--    complète ET la présence de la vidéo dans la copie publiée.

-- =====================================================================
-- 1. Tables
-- =====================================================================

create table public.memorial_videos (
  id uuid primary key default gen_random_uuid(),
  -- RESTRICT à dessein : un hommage portant des vidéos ne peut pas être
  -- supprimé en laissant des assets Mux orphelins ; les vidéos sont d'abord
  -- retirées (request_memorial_video_removal_v1), puis supprimées chez Mux.
  memorial_id uuid not null references public.memorials (id) on delete restrict,
  owner_id uuid not null references public.owners (id),
  draft_video_id text not null check (draft_video_id ~ '^v-[A-Za-z0-9-]{1,64}$'),
  status text not null default 'reserved'
    check (status in ('reserved', 'uploading', 'processing', 'ready', 'rejected', 'errored',
                      'cancelled', 'deletion_requested', 'deleted')),
  declared_duration_ms integer check (declared_duration_ms > 0),
  verified_duration_ms integer check (verified_duration_ms > 0),
  mux_upload_id text unique check (char_length(mux_upload_id) between 1 and 200),
  mux_asset_id text unique check (char_length(mux_asset_id) between 1 and 200),
  mux_playback_id text check (char_length(mux_playback_id) between 1 and 200),
  upload_expires_at timestamptz,
  failure_reason text check (failure_reason in (
    'over_total_duration', 'too_many_videos', 'duration_unavailable', 'upload_failed',
    'upload_expired', 'upload_cancelled', 'asset_errored', 'hosting_unavailable')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deletion_requested_at timestamptz,
  deleted_at timestamptz,
  -- Une vidéo prête a toujours sa durée mesurée, son asset et son
  -- identifiant de lecture.
  constraint memorial_videos_ready_complete check (
    status <> 'ready'
    or (verified_duration_ms is not null and mux_asset_id is not null and mux_playback_id is not null))
);

comment on table public.memorial_videos is
  'VID-07. Vidéos hébergées (Mux) d''un hommage, une ligne par fichier envoyé pour une vidéo du brouillon (draft_video_id). Ordre et titre : content.video.items du brouillon. Écritures : RPC service_role seulement ; lecture directe : le propriétaire (RLS).';

-- Au plus UN envoi en cours et UNE vidéo prête par vidéo du brouillon.
create unique index memorial_videos_one_in_flight_per_slot
  on public.memorial_videos (memorial_id, draft_video_id)
  where status in ('reserved', 'uploading', 'processing');
create unique index memorial_videos_one_ready_per_slot
  on public.memorial_videos (memorial_id, draft_video_id)
  where status = 'ready';
create index memorial_videos_memorial_idx on public.memorial_videos (memorial_id);
create index memorial_videos_reconcile_idx on public.memorial_videos (updated_at)
  where status in ('reserved', 'uploading', 'processing', 'deletion_requested', 'rejected', 'errored', 'cancelled');

-- Idempotence des notifications Mux : un identifiant d'événement n'est
-- appliqué qu'une fois, quel que soit le nombre de livraisons.
create table public.memorial_video_events (
  event_id text primary key check (char_length(event_id) between 1 and 200),
  event_type text not null check (char_length(event_type) between 1 and 60),
  video_id uuid,
  outcome text not null,
  received_at timestamptz not null default now()
);

comment on table public.memorial_video_events is
  'VID-07. Journal d''idempotence des notifications Mux (et des réconciliations) : event_id unique. Aucune donnée personnelle.';

alter table public.memorial_videos enable row level security;
alter table public.memorial_video_events enable row level security;

revoke all on public.memorial_videos from public, anon, authenticated, service_role;
revoke all on public.memorial_video_events from public, anon, authenticated, service_role;

-- Le propriétaire lit ses propres vidéos avec sa session (reconnexion) ;
-- aucune écriture client.
grant select on public.memorial_videos to authenticated;
create policy memorial_videos_select_own on public.memorial_videos
  for select to authenticated
  using (owner_id = public.current_owner_id());

-- =====================================================================
-- 2. Fonctions internes
-- =====================================================================

-- Rang d'un état : jamais de retour en arrière (événements désordonnés).
create or replace function public.memorial_video_status_rank_v1(p_status text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_status
    when 'reserved' then 0
    when 'uploading' then 1
    when 'processing' then 2
    when 'ready' then 3
    when 'rejected' then 3
    when 'errored' then 3
    when 'cancelled' then 3
    when 'deletion_requested' then 4
    when 'deleted' then 5
    else -1
  end;
$$;

-- Verrouille l'hommage et vérifie le propriétaire et l'offre. Renvoie le
-- motif de refus, ou NULL si la demande peut continuer.
create or replace function public.memorial_video_guard_v1(p_owner_id uuid, p_memorial_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_memorial record;
begin
  select m.id, m.owner_id, m.status, m.access_level into v_memorial
    from public.memorials m
   where m.id = p_memorial_id
   for update;
  if not found or v_memorial.owner_id is distinct from p_owner_id then
    return 'refused';
  end if;
  if v_memorial.status = 'archived' then
    return 'refused_archived';
  end if;
  if v_memorial.access_level is distinct from 'complet' then
    return 'refused_offer';
  end if;
  return null;
end;
$$;

-- =====================================================================
-- 3. Réservation d'un envoi (avant toute création chez Mux)
-- =====================================================================

create or replace function public.reserve_memorial_video_upload_v1(
  p_owner_id uuid,
  p_memorial_id uuid,
  p_draft_video_id text,
  p_declared_duration_ms integer
)
returns table (outcome text, video_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_guard text;
  v_slots integer;
  v_known_ms bigint;
  v_unknown integer;
  v_new_id uuid;
begin
  if p_owner_id is null or p_memorial_id is null or p_draft_video_id is null
     or p_draft_video_id !~ '^v-[A-Za-z0-9-]{1,64}$'
     or (p_declared_duration_ms is not null and p_declared_duration_ms <= 0) then
    return query select 'invalid'::text, null::uuid;
    return;
  end if;

  v_guard := public.memorial_video_guard_v1(p_owner_id, p_memorial_id);
  if v_guard is not null then
    return query select v_guard, null::uuid;
    return;
  end if;

  -- Un envoi expiré ne bloque pas une nouvelle tentative.
  update public.memorial_videos v
     set status = 'cancelled', failure_reason = 'upload_expired', updated_at = now()
   where v.memorial_id = p_memorial_id
     and v.status in ('reserved', 'uploading')
     and v.upload_expires_at is not null
     and v.upload_expires_at < now();

  if exists (select 1 from public.memorial_videos v
              where v.memorial_id = p_memorial_id and v.draft_video_id = p_draft_video_id
                and v.status in ('reserved', 'uploading', 'processing')) then
    return query select 'refused_in_progress'::text, null::uuid;
    return;
  end if;

  -- Créneaux vivants après cette demande (un remplacement réutilise le sien).
  select count(distinct v.draft_video_id) into v_slots
    from public.memorial_videos v
   where v.memorial_id = p_memorial_id
     and v.status in ('reserved', 'uploading', 'processing', 'ready')
     and v.draft_video_id <> p_draft_video_id;
  if v_slots + 1 > 3 then
    return query select 'refused_too_many'::text, null::uuid;
    return;
  end if;

  -- Durée de chaque AUTRE créneau : la plus grande connue de ses lignes
  -- vivantes ; un créneau dont une ligne vivante n'a aucune durée connue
  -- est « inconnu » (jamais compté comme zéro).
  -- Le créneau remplacé compte pour la plus grande de ses deux durées
  -- (l'ancienne vidéo reste valide tant que la nouvelle n'est pas acceptée).
  with slot as (
    select v.draft_video_id,
           max(coalesce(v.verified_duration_ms, v.declared_duration_ms)) as known_ms,
           bool_or(coalesce(v.verified_duration_ms, v.declared_duration_ms) is null) as has_unknown
      from public.memorial_videos v
     where v.memorial_id = p_memorial_id
       and v.status in ('reserved', 'uploading', 'processing', 'ready')
     group by v.draft_video_id
  )
  select coalesce(sum(case when s.draft_video_id = p_draft_video_id
                           then greatest(s.known_ms, coalesce(p_declared_duration_ms, 0))
                           else s.known_ms end), 0),
         count(*) filter (where s.has_unknown)
    into v_known_ms, v_unknown
    from slot s;
  if not exists (select 1 from public.memorial_videos v
                  where v.memorial_id = p_memorial_id and v.draft_video_id = p_draft_video_id
                    and v.status = 'ready') then
    v_known_ms := v_known_ms + coalesce(p_declared_duration_ms, 0);
  end if;

  if p_declared_duration_ms is null then
    if v_known_ms >= 600000 then
      return query select 'refused_duration'::text, null::uuid;
      return;
    end if;
    if v_unknown > 0 then
      return query select 'refused_unknown_pending'::text, null::uuid;
      return;
    end if;
  elsif v_known_ms > 600000 then
    return query select 'refused_duration'::text, null::uuid;
    return;
  end if;

  insert into public.memorial_videos (memorial_id, owner_id, draft_video_id, status, declared_duration_ms)
  values (p_memorial_id, p_owner_id, p_draft_video_id, 'reserved', p_declared_duration_ms)
  returning id into v_new_id;

  return query select 'reserved'::text, v_new_id;
end;
$$;

-- L'adresse d'envoi Mux a été créée : la réservation devient un envoi.
create or replace function public.attach_memorial_video_upload_v1(
  p_video_id uuid,
  p_upload_id text,
  p_expires_at timestamptz
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.memorial_videos;
begin
  if p_video_id is null or p_upload_id is null or p_expires_at is null then
    return 'invalid';
  end if;
  select * into v_row from public.memorial_videos v where v.id = p_video_id;
  if not found then return 'not_found'; end if;
  perform 1 from public.memorials m where m.id = v_row.memorial_id for update;
  select * into v_row from public.memorial_videos v where v.id = p_video_id for update;
  if v_row.status <> 'reserved' then
    return 'not_reserved';
  end if;
  update public.memorial_videos v
     set status = 'uploading', mux_upload_id = p_upload_id, upload_expires_at = p_expires_at, updated_at = now()
   where v.id = p_video_id;
  return 'attached';
end;
$$;

-- Échec avant ou pendant l'envoi (création Mux impossible, erreur réseau
-- définitive) : la réservation est libérée.
create or replace function public.fail_memorial_video_upload_v1(p_video_id uuid, p_reason text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.memorial_videos;
begin
  if p_video_id is null or p_reason not in ('upload_failed', 'hosting_unavailable') then
    return 'invalid';
  end if;
  select * into v_row from public.memorial_videos v where v.id = p_video_id;
  if not found then return 'not_found'; end if;
  perform 1 from public.memorials m where m.id = v_row.memorial_id for update;
  update public.memorial_videos v
     set status = 'errored', failure_reason = p_reason, updated_at = now()
   where v.id = p_video_id and v.status in ('reserved', 'uploading');
  return case when found then 'failed' else 'ignored' end;
end;
$$;

-- Annulation par la famille d'un envoi en cours.
create or replace function public.cancel_memorial_video_upload_v1(
  p_owner_id uuid,
  p_memorial_id uuid,
  p_video_id uuid
)
returns table (outcome text, upload_id text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_guard text;
  v_row public.memorial_videos;
begin
  v_guard := public.memorial_video_guard_v1(p_owner_id, p_memorial_id);
  -- L'annulation reste possible si l'offre a changé entre-temps ; seuls le
  -- propriétaire et l'hommage comptent.
  if v_guard = 'refused' then
    return query select 'refused'::text, null::text;
    return;
  end if;
  select * into v_row from public.memorial_videos v
   where v.id = p_video_id and v.memorial_id = p_memorial_id
   for update;
  if not found then
    return query select 'refused'::text, null::text;
    return;
  end if;
  if v_row.status not in ('reserved', 'uploading') then
    return query select 'ignored'::text, v_row.mux_upload_id;
    return;
  end if;
  update public.memorial_videos v
     set status = 'cancelled', failure_reason = 'upload_cancelled', updated_at = now()
   where v.id = v_row.id;
  return query select 'cancelled'::text, v_row.mux_upload_id;
end;
$$;

-- =====================================================================
-- 4. Notifications Mux (webhooks) et réconciliation
-- =====================================================================
--
-- p_event_type : upload_asset_created, upload_cancelled, upload_errored,
-- upload_expired, asset_ready, asset_errored, asset_deleted.
-- La ligne est retrouvée par p_video_id (passthrough), sinon par l'envoi,
-- sinon par l'asset. Idempotent (event_id) ; jamais de retour en arrière.
--
-- Résultats :
--   duplicate        événement déjà appliqué ;
--   unknown          aucune vidéo correspondante (enregistré, ignoré) ;
--   applied          état mis à jour ;
--   ignored          rien à faire (état déjà plus avancé) ;
--   accepted         vidéo prête et acceptée ; superseded_asset = asset de
--                    l'ancienne vidéo remplacée, à supprimer ;
--   rejected         vidéo prête mais refusée (3 vidéos ou 600 s dépassés,
--                    ou durée absente) ; asset_to_delete à supprimer ;
--   delete_asset     un asset est arrivé pour une vidéo annulée ou retirée ;
--                    asset_to_delete à supprimer.

create or replace function public.apply_memorial_video_event_v1(
  p_event_id text,
  p_event_type text,
  p_video_id uuid,
  p_upload_id text,
  p_asset_id text,
  p_playback_id text,
  p_duration_ms integer
)
returns table (outcome text, video_id uuid, asset_to_delete text, superseded_asset text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_row public.memorial_videos;
  v_found boolean := false;
  v_outcome text;
  v_slots integer;
  v_total bigint;
  v_old public.memorial_videos;
  v_to_delete text;
  v_superseded text;
begin
  if p_event_id is null or char_length(p_event_id) not between 1 and 200
     or p_event_type not in ('upload_asset_created', 'upload_cancelled', 'upload_errored', 'upload_expired',
                             'asset_ready', 'asset_errored', 'asset_deleted') then
    return query select 'invalid'::text, null::uuid, null::text, null::text;
    return;
  end if;

  if exists (select 1 from public.memorial_video_events e where e.event_id = p_event_id) then
    return query select 'duplicate'::text, null::uuid, null::text, null::text;
    return;
  end if;

  -- Retrouver la vidéo, puis verrouiller son hommage (ordre : memorials, puis vidéo).
  if p_video_id is not null then
    select * into v_row from public.memorial_videos v where v.id = p_video_id;
    v_found := found;
  end if;
  if not v_found and p_upload_id is not null then
    select * into v_row from public.memorial_videos v where v.mux_upload_id = p_upload_id;
    v_found := found;
  end if;
  if not v_found and p_asset_id is not null then
    select * into v_row from public.memorial_videos v where v.mux_asset_id = p_asset_id;
    v_found := found;
  end if;
  if not v_found then
    insert into public.memorial_video_events (event_id, event_type, video_id, outcome)
    values (p_event_id, p_event_type, null, 'unknown')
    on conflict (event_id) do nothing;
    return query select 'unknown'::text, null::uuid, null::text, null::text;
    return;
  end if;

  perform 1 from public.memorials m where m.id = v_row.memorial_id for update;
  select * into v_row from public.memorial_videos v where v.id = v_row.id for update;

  -- Un même événement livré deux fois en parallèle : le second attend le
  -- verrou, puis voit le journal.
  if exists (select 1 from public.memorial_video_events e where e.event_id = p_event_id) then
    return query select 'duplicate'::text, null::uuid, null::text, null::text;
    return;
  end if;

  -- Un asset ne peut pas changer de vidéo.
  if p_asset_id is not null and v_row.mux_asset_id is not null and v_row.mux_asset_id <> p_asset_id then
    v_outcome := 'ignored';

  elsif p_event_type = 'asset_deleted' then
    -- Une vidéo refusée ou en échec garde son état (la famille voit
    -- pourquoi) ; seul le fait que l'asset n'existe plus est noté.
    update public.memorial_videos v
       set status = case when v.status in ('rejected', 'errored', 'cancelled') then v.status else 'deleted' end,
           deleted_at = coalesce(v.deleted_at, now()), updated_at = now()
     where v.id = v_row.id and v.status <> 'deleted';
    v_outcome := 'applied';

  elsif v_row.status in ('cancelled', 'rejected', 'errored', 'deletion_requested', 'deleted') then
    -- Vidéo qui n'est plus voulue : un asset qui arrive doit être supprimé.
    if p_event_type in ('upload_asset_created', 'asset_ready') and p_asset_id is not null
       and v_row.status <> 'deleted' then
      update public.memorial_videos v
         set mux_asset_id = coalesce(v.mux_asset_id, p_asset_id), updated_at = now()
       where v.id = v_row.id;
      v_outcome := 'delete_asset';
      v_to_delete := p_asset_id;
    else
      v_outcome := 'ignored';
    end if;

  elsif p_event_type = 'upload_asset_created' then
    if v_row.status in ('reserved', 'uploading') then
      update public.memorial_videos v
         set status = 'processing', mux_asset_id = coalesce(p_asset_id, v.mux_asset_id), updated_at = now()
       where v.id = v_row.id;
      v_outcome := 'applied';
    else
      update public.memorial_videos v
         set mux_asset_id = coalesce(v.mux_asset_id, p_asset_id), updated_at = now()
       where v.id = v_row.id and v.mux_asset_id is null;
      v_outcome := 'ignored';
    end if;

  elsif p_event_type in ('upload_cancelled', 'upload_expired') then
    if v_row.status in ('reserved', 'uploading') then
      update public.memorial_videos v
         set status = 'cancelled',
             failure_reason = case when p_event_type = 'upload_expired' then 'upload_expired' else 'upload_cancelled' end,
             updated_at = now()
       where v.id = v_row.id;
      v_outcome := 'applied';
    else
      v_outcome := 'ignored';
    end if;

  elsif p_event_type in ('upload_errored', 'asset_errored') then
    if v_row.status in ('reserved', 'uploading', 'processing') then
      update public.memorial_videos v
         set status = 'errored',
             failure_reason = case when p_event_type = 'upload_errored' then 'upload_failed' else 'asset_errored' end,
             mux_asset_id = coalesce(v.mux_asset_id, p_asset_id),
             updated_at = now()
       where v.id = v_row.id;
      v_outcome := 'applied';
      v_to_delete := coalesce(v_row.mux_asset_id, p_asset_id);
    else
      v_outcome := 'ignored';
    end if;

  elsif p_event_type = 'asset_ready' then
    if v_row.status = 'ready' then
      v_outcome := 'ignored';
    elsif p_asset_id is null or p_playback_id is null or p_duration_ms is null or p_duration_ms <= 0 then
      update public.memorial_videos v
         set status = 'rejected', failure_reason = 'duration_unavailable',
             mux_asset_id = coalesce(v.mux_asset_id, p_asset_id), updated_at = now()
       where v.id = v_row.id;
      v_outcome := 'rejected';
      v_to_delete := p_asset_id;
    else
      -- Acceptation finale : seules les vidéos PRÊTES des autres créneaux
      -- comptent, avec leur durée mesurée.
      select count(distinct v.draft_video_id), coalesce(sum(v.verified_duration_ms), 0)
        into v_slots, v_total
        from public.memorial_videos v
       where v.memorial_id = v_row.memorial_id
         and v.status = 'ready'
         and v.draft_video_id <> v_row.draft_video_id;
      if v_slots + 1 > 3 or v_total + p_duration_ms > 600000 then
        update public.memorial_videos v
           set status = 'rejected',
               failure_reason = case when v_slots + 1 > 3 then 'too_many_videos' else 'over_total_duration' end,
               mux_asset_id = p_asset_id, verified_duration_ms = p_duration_ms, updated_at = now()
         where v.id = v_row.id;
        v_outcome := 'rejected';
        v_to_delete := p_asset_id;
      else
        -- Remplacement : l'ancienne vidéo prête est retirée au moment où la
        -- nouvelle est acceptée, dans la même transaction.
        select * into v_old from public.memorial_videos v
         where v.memorial_id = v_row.memorial_id and v.draft_video_id = v_row.draft_video_id
           and v.status = 'ready' and v.id <> v_row.id
         for update;
        if found then
          update public.memorial_videos v
             set status = 'deletion_requested', deletion_requested_at = now(), updated_at = now()
           where v.id = v_old.id;
          v_superseded := v_old.mux_asset_id;
        end if;
        update public.memorial_videos v
           set status = 'ready', mux_asset_id = p_asset_id, mux_playback_id = p_playback_id,
               verified_duration_ms = p_duration_ms, failure_reason = null, updated_at = now()
         where v.id = v_row.id;
        v_outcome := 'accepted';
      end if;
    end if;
  else
    v_outcome := 'ignored';
  end if;

  insert into public.memorial_video_events (event_id, event_type, video_id, outcome)
  values (p_event_id, p_event_type, v_row.id, v_outcome);

  return query select v_outcome, v_row.id, v_to_delete, v_superseded;
end;
$$;

-- Lignes à réconcilier (webhook manquant) : envoi ou traitement resté sans
-- nouvelle, suppression non confirmée.
create or replace function public.list_memorial_videos_to_reconcile_v1(p_stale_before timestamptz, p_limit integer)
returns table (video_id uuid, memorial_id uuid, status text, upload_id text, asset_id text, upload_expires_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select v.id, v.memorial_id, v.status, v.mux_upload_id, v.mux_asset_id, v.upload_expires_at
    from public.memorial_videos v
   where (v.status in ('reserved', 'uploading', 'processing', 'deletion_requested')
          or (v.status in ('rejected', 'errored', 'cancelled') and v.mux_asset_id is not null and v.deleted_at is null))
     and v.updated_at < p_stale_before
   order by v.updated_at
   limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

-- =====================================================================
-- 5. Retrait, remplacement et suppression
-- =====================================================================

-- La famille retire une vidéo : toutes ses lignes vivantes passent en
-- « suppression demandée » ; le serveur annule l'envoi ou supprime l'asset
-- chez Mux, puis confirme (confirm_memorial_video_deleted_v1). Un échec
-- chez Mux laisse la ligne en suppression demandée : la réconciliation
-- la reprend. Journal : updated_at et deletion_requested_at.
create or replace function public.request_memorial_video_removal_v1(
  p_owner_id uuid,
  p_memorial_id uuid,
  p_draft_video_id text
)
returns table (outcome text, video_id uuid, upload_id text, asset_id text, previous_status text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_guard text;
begin
  v_guard := public.memorial_video_guard_v1(p_owner_id, p_memorial_id);
  if v_guard = 'refused' or p_draft_video_id is null then
    return query select 'refused'::text, null::uuid, null::text, null::text, null::text;
    return;
  end if;
  return query
    with targets as (
      select v.id, v.status as old_status
        from public.memorial_videos v
       where v.memorial_id = p_memorial_id
         and v.draft_video_id = p_draft_video_id
         and v.status in ('reserved', 'uploading', 'processing', 'ready', 'rejected', 'errored', 'cancelled')
         and (v.mux_upload_id is not null or v.mux_asset_id is not null or v.status in ('reserved', 'uploading', 'processing', 'ready'))
       for update
    ), updated as (
      update public.memorial_videos v
         set status = case when (v.mux_asset_id is null and v.mux_upload_id is null) or v.deleted_at is not null
                           then 'deleted' else 'deletion_requested' end,
             deletion_requested_at = now(),
             deleted_at = case when (v.mux_asset_id is null and v.mux_upload_id is null) or v.deleted_at is not null
                               then coalesce(v.deleted_at, now()) else v.deleted_at end,
             updated_at = now()
        from targets t
       where v.id = t.id
      returning v.id, v.mux_upload_id, v.mux_asset_id, t.old_status, v.status
    )
    select 'requested'::text, u.id, u.mux_upload_id, u.mux_asset_id, u.old_status from updated u;
end;
$$;

-- Suppression confirmée chez Mux (ou asset inexistant). Une vidéo retirée
-- devient « deleted » ; une vidéo refusée ou en échec garde son état (la
-- famille voit pourquoi) et note seulement que son asset n'existe plus.
create or replace function public.confirm_memorial_video_deleted_v1(p_video_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.memorial_videos;
begin
  select * into v_row from public.memorial_videos v where v.id = p_video_id;
  if not found then return 'not_found'; end if;
  perform 1 from public.memorials m where m.id = v_row.memorial_id for update;
  update public.memorial_videos v
     set status = case when v.status = 'deletion_requested' then 'deleted' else v.status end,
         deleted_at = coalesce(v.deleted_at, now()), updated_at = now()
   where v.id = p_video_id
     and (v.status = 'deletion_requested'
          or (v.status in ('rejected', 'errored', 'cancelled') and v.deleted_at is null));
  return case when found then 'deleted' else 'ignored' end;
end;
$$;

-- =====================================================================
-- 6. Lectures
-- =====================================================================

-- Reconnexion : les vidéos de l'hommage, pour son propriétaire (serveur).
create or replace function public.list_memorial_videos_v1(p_owner_id uuid, p_memorial_id uuid)
returns table (video_id uuid, draft_video_id text, status text, declared_duration_ms integer,
               verified_duration_ms integer, playback_id text, upload_expires_at timestamptz,
               failure_reason text, updated_at timestamptz, upload_id text, asset_id text)
language sql
stable
security definer
set search_path = ''
as $$
  -- upload_id et asset_id servent au serveur (réconciliation) ; ils ne
  -- sont jamais transmis au navigateur.
  select v.id, v.draft_video_id, v.status, v.declared_duration_ms, v.verified_duration_ms,
         v.mux_playback_id, v.upload_expires_at, v.failure_reason, v.updated_at,
         v.mux_upload_id, v.mux_asset_id
    from public.memorial_videos v
    join public.memorials m on m.id = v.memorial_id
   where v.memorial_id = p_memorial_id
     and m.owner_id = p_owner_id
     and v.owner_id = p_owner_id
     and v.status <> 'deleted'
   order by v.created_at;
$$;

-- Lecture publique : uniquement un hommage PUBLIÉ, en offre COMPLÈTE,
-- publiquement visible, et seulement les vidéos prêtes que la copie
-- publiée référence (content.video.items[].id). Aucune vidéo n'est publiée
-- automatiquement à la fin d'un téléversement.
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
     and jsonb_typeof(s.content -> 'video' -> 'items') = 'array'
     and exists (select 1 from jsonb_array_elements(s.content -> 'video' -> 'items') item
                  where item ->> 'id' = v.draft_video_id);
$$;

-- =====================================================================
-- 7. Privilèges : service_role seul exécute ; rien pour les clients.
-- =====================================================================

revoke all on function public.memorial_video_status_rank_v1(text) from public, anon, authenticated, service_role;
revoke all on function public.memorial_video_guard_v1(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.reserve_memorial_video_upload_v1(uuid, uuid, text, integer) from public, anon, authenticated, service_role;
revoke all on function public.attach_memorial_video_upload_v1(uuid, text, timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.fail_memorial_video_upload_v1(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.cancel_memorial_video_upload_v1(uuid, uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.apply_memorial_video_event_v1(text, text, uuid, text, text, text, integer) from public, anon, authenticated, service_role;
revoke all on function public.list_memorial_videos_to_reconcile_v1(timestamptz, integer) from public, anon, authenticated, service_role;
revoke all on function public.request_memorial_video_removal_v1(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.confirm_memorial_video_deleted_v1(uuid) from public, anon, authenticated, service_role;
revoke all on function public.list_memorial_videos_v1(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.read_public_memorial_videos_v1(text) from public, anon, authenticated, service_role;

grant execute on function public.reserve_memorial_video_upload_v1(uuid, uuid, text, integer) to service_role;
grant execute on function public.attach_memorial_video_upload_v1(uuid, text, timestamptz) to service_role;
grant execute on function public.fail_memorial_video_upload_v1(uuid, text) to service_role;
grant execute on function public.cancel_memorial_video_upload_v1(uuid, uuid, uuid) to service_role;
grant execute on function public.apply_memorial_video_event_v1(text, text, uuid, text, text, text, integer) to service_role;
grant execute on function public.list_memorial_videos_to_reconcile_v1(timestamptz, integer) to service_role;
grant execute on function public.request_memorial_video_removal_v1(uuid, uuid, text) to service_role;
grant execute on function public.confirm_memorial_video_deleted_v1(uuid) to service_role;
grant execute on function public.list_memorial_videos_v1(uuid, uuid) to service_role;
grant execute on function public.read_public_memorial_videos_v1(text) to service_role;

notify pgrst, 'reload schema';
