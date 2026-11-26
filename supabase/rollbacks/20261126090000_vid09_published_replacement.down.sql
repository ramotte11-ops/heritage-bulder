-- HERITAGE HOMMAGE — VID-09 : RETOUR ARRIÈRE de
-- supabase/migrations/20261126090000_vid09_published_replacement.sql.
--
-- NE FAIT PAS PARTIE DES MIGRATIONS : jamais appliqué automatiquement,
-- seulement sur décision explicite de la PO.
--
-- Rétablit les fonctions VID-07 (réservation, acceptation, retrait) et
-- VID-08 (lecture publique, horodatage). Les anciennes versions encore
-- gardées (`superseded`) passent d'abord en `deletion_requested` : leurs
-- assets Mux sont alors à supprimer (réconciliation). Aucune ligne n'est
-- effacée de la table.

begin;

update public.memorial_videos
   set status = 'deletion_requested', deletion_requested_at = now(), updated_at = now()
 where status = 'superseded';

drop function if exists public.memorial_video_superseded_stats_v1();
drop function if exists public.release_superseded_memorial_videos_v1(uuid, integer);

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

drop function if exists public.memorial_video_version_published_v1(uuid, text, timestamptz);
drop index if exists public.memorial_videos_superseded_idx;

alter table public.memorial_videos drop constraint memorial_videos_status_check;
alter table public.memorial_videos add constraint memorial_videos_status_check
  check (status in ('reserved', 'uploading', 'processing', 'ready', 'rejected', 'errored',
                    'cancelled', 'deletion_requested', 'deleted'));

revoke all on function public.memorial_video_status_rank_v1(text) from public, anon, authenticated, service_role;
revoke all on function public.memorial_videos_stamp_ready_v1() from public, anon, authenticated, service_role;
revoke all on function public.reserve_memorial_video_upload_v1(uuid, uuid, text, integer) from public, anon, authenticated, service_role;
revoke all on function public.apply_memorial_video_event_v1(text, text, uuid, text, text, text, integer) from public, anon, authenticated, service_role;
revoke all on function public.request_memorial_video_removal_v1(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.read_public_memorial_videos_v1(text) from public, anon, authenticated, service_role;
grant execute on function public.reserve_memorial_video_upload_v1(uuid, uuid, text, integer) to service_role;
grant execute on function public.apply_memorial_video_event_v1(text, text, uuid, text, text, text, integer) to service_role;
grant execute on function public.request_memorial_video_removal_v1(uuid, uuid, text) to service_role;
grant execute on function public.read_public_memorial_videos_v1(text) to service_role;

notify pgrst, 'reload schema';

commit;
